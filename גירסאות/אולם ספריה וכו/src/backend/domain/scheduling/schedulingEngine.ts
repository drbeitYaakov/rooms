import { db } from '../../config/database';
import { 
  StudyGroup, 
  Assignment, 
  Room, 
  CreateAssignmentData,
  RoomType,
  checkTimeConflict
} from '../models';
import logger from '../../utils/logger';

export interface SchedulingResult {
  success: boolean;
  assignments: Assignment[];
  conflicts: ConflictInfo[];
  warnings: string[];
  unscheduled_groups: StudyGroup[];
}

export interface ConflictInfo {
  group_id: number;
  room_id: number;
  conflict_type: 'double_booking' | 'capacity_exceeded' | 'room_unavailable' | 'time_conflict';
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface RoomCandidate {
  room: Room;
  score: number;
  reasons: string[];
}

export class SchedulingEngine {
  
  /**
   * Schedule multiple study groups
   */
  async scheduleStudyGroups(
    groups: StudyGroup[],
    dateRange: { start: Date; end: Date },
    existingAssignments: Assignment[]
  ): Promise<SchedulingResult> {
    const assignments: Assignment[] = [];
    const conflicts: ConflictInfo[] = [];
    const warnings: string[] = [];
    const unscheduled_groups: StudyGroup[] = [];

    // Get available rooms for the date range
    const availableRoomsQuery = await db('rooms').where({ status: 'ACTIVE' }).orderBy('room_number');

    const availableRooms = availableRoomsQuery;

    // Process each group
    for (const group of groups) {
      try {
        // Create assignment request for this group
        const assignmentRequest: CreateAssignmentData = {
          assignable_id: group.id,
          assignable_type: 'study_group',
          room_id: 0, // Will be assigned by the engine
          assignment_type_id: 1, // Default assignment type
          title: `קבוצת ${group.group_type}`,
          date: dateRange.start.toISOString().split('T')[0], // Use first date for now
          start_time: '16:00', // Default time
          end_time: '18:00', // Default time
          description: `שיבוץ קבוצת ${group.group_type}`,
          requester_id: 1, // Default requester
          special_requirements: {
            min_capacity: group.student_count,
            needs_projector: false,
            is_large_group: group.student_count > 30
          }
        };

        // Assign room for this group
        const result = await this.assignRoom(assignmentRequest, availableRooms, existingAssignments);

        if (result.success && result.assignment) {
          assignments.push(result.assignment as Assignment);
        } else {
          conflicts.push(...result.conflicts);
          unscheduled_groups.push(group);
          warnings.push(`לא ניתן היה לשבץ את קבוצה ${group.id}: ${result.explanation || 'סיבה לא ידועה'}`);
        }
      } catch (error) {
        warnings.push(`שגיאה בעיבוד קבוצה ${group.id}: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`);
        unscheduled_groups.push(group);
      }
    }

    return {
      success: unscheduled_groups.length === 0,
      assignments,
      conflicts,
      warnings,
      unscheduled_groups
    };
  }

  /**
   * Assign a room for a single assignment request
   */
  async assignRoom(
    assignmentRequest: CreateAssignmentData,
    availableRooms: any[],
    existingAssignments: any[]
  ): Promise<{ 
    success: boolean; 
    conflicts: ConflictInfo[]; 
    assignment?: any;
    alternativeRooms?: any[];
    errors?: string[];
    explanation?: string;
  }> {
    
    const conflicts: ConflictInfo[] = [];
    const errors: string[] = [];
    
    // Convert RoomEntity to Room format for internal processing
    const rooms = availableRooms.map(roomEntity => ({
      id: roomEntity.id, // Keep as string (UUID)
      room_number: roomEntity.roomNumber,
      room_type: this.mapRoomType(roomEntity.roomType),
      floor: roomEntity.floor,
      wing: roomEntity.wing,
      capacity: roomEntity.capacity,
      has_projector: roomEntity.hasProjector,
      is_small: roomEntity.isSmall,
      comfort_priority: this.mapPriority(roomEntity.priority),
      special_notes: roomEntity.notes,
      is_active: roomEntity.isActive,
      created_at: roomEntity.createdAt
    }));
    
    console.log(`Processing assignment: type=${assignmentRequest.type}, date=${assignmentRequest.date}, days_of_week=${JSON.stringify(assignmentRequest.days_of_week)}, end_date=${assignmentRequest.end_date}`);
    
    // Find best room for this assignment
    const roomCandidates = await this.findBestRoomForAssignment(
      assignmentRequest,
      rooms,
      existingAssignments
    );

    if (roomCandidates.length === 0) {
      // Get the requested room details for better error message
      console.log(`Looking for room with ID: ${assignmentRequest.room_id}`);
      console.log(`Available rooms:`, availableRooms.map(r => ({ id: r.id, room_number: r.room_number })));
      
      const requestedRoom = availableRooms.find(r => r.id.toString() === assignmentRequest.room_id?.toString());
      const roomNumber = requestedRoom?.room_number || 'לא ידוע';
      
      console.log(`Found room:`, requestedRoom);
      
      conflicts.push({
        group_id: assignmentRequest.assignable_id || 0,
        room_id: assignmentRequest.room_id || 0,
        conflict_type: 'room_unavailable',
        message: `חדר ${roomNumber} תפוס בזמן המבוקש (${assignmentRequest.date} ${assignmentRequest.start_time}-${assignmentRequest.end_time})`,
        severity: 'high'
      });
      
      return {
        success: false,
        conflicts,
        errors: [`חדר ${roomNumber} תפוס כבר בזמן המבוקש`],
        alternativeRooms: [],
        explanation: `חדר ${roomNumber} אינו זמין בתאריך ${assignmentRequest.date} בין השעות ${assignmentRequest.start_time} ל-${assignmentRequest.end_time}. יש לבחור חדר אחר או זמן אחר.`
      };
    }

    // Use best room
    const bestRoom = roomCandidates[0];
    const alternativeRooms = roomCandidates.slice(1).map(candidate => ({
      room: candidate.room,
      reasons: candidate.reasons
    }));
    
    // Create assignment with selected room and additional properties
    const assignment = {
      ...assignmentRequest,
      id: 0,
      room_id: bestRoom.room.id,
      status: 'scheduled' as const,
      is_recurring: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignableType: assignmentRequest.assignable_type,
      assignableId: assignmentRequest.assignable_id,
      roomId: bestRoom.room.id,
      startDate: assignmentRequest.date,
      endDate: assignmentRequest.date,
      weekCount: 1,
      specificDate: assignmentRequest.date,
      daysOfWeek: [],
      timeSlots: [{
        start: assignmentRequest.start_time,
        end: assignmentRequest.end_time
      }],
      activityType: assignmentRequest.assignable_type,
      isManual: true,
      overrideReason: assignmentRequest.description,
      conflictsWith: []
    };

    return {
      success: true,
      conflicts: [],
      assignment,
      alternativeRooms,
      explanation: `חדר ${bestRoom.room.room_number || bestRoom.room.id} נבחר כי ${bestRoom.reasons.join(', ')}`
    };
  }

  /**
   * Map RoomEntity room type to Room room type
   */
  private mapRoomType(entityType: string): RoomType {
    const typeMap: Record<string, RoomType> = {
      'homeroom': 'study_room',
      'mamad': 'computer_lab',
      'regular': 'study_room',
      'large_hall': 'auditorium',
      'library': 'library',
      'music': 'music_room',
      'caravan': 'corridor'
    };
    return typeMap[entityType] || 'study_room';
  }

  /**
   * Map RoomEntity priority to comfort priority
   */
  private mapPriority(priority: string): number {
    const priorityMap: Record<string, number> = {
      'high': 2,
      'normal': 1,
      'low': 0
    };
    return priorityMap[priority] || 1;
  }

  /**
   * Find best rooms for a specific assignment request
   */
  private async findBestRoomForAssignment(
    assignmentRequest: CreateAssignmentData,
    availableRooms: Room[],
    existingAssignments: any[]
  ): Promise<RoomCandidate[]> {
    
    const candidates: RoomCandidate[] = [];

    for (const room of availableRooms) {
      // Check basic suitability based on assignment requirements
      if (!this.isRoomSuitableForAssignment(room, assignmentRequest)) {
        continue;
      }

      // Check room availability
      const isAvailable = await this.isRoomAvailableForAssignment(
        room.id,
        assignmentRequest.date,
        assignmentRequest.start_time,
        assignmentRequest.end_time,
        existingAssignments
      );

      // For recurring assignments, also check all selected days of week
      let isRecurringAvailable = true;
      if (assignmentRequest.type === 'recurring' && assignmentRequest.days_of_week && assignmentRequest.days_of_week.length > 0) {
        const baseDate = new Date(assignmentRequest.date);
        console.log(`Checking recurring assignment for room ${room.id}, baseDate: ${baseDate.toISOString()}, days: ${JSON.stringify(assignmentRequest.days_of_week)}`);
        
        for (const dayOfWeek of assignmentRequest.days_of_week) {
          // Calculate date for this day of week
          const currentDayOfWeek = baseDate.getDay();
          const dayDiff = (dayOfWeek - currentDayOfWeek + 7) % 7;
          
          // Create new date for this day (don't modify baseDate)
          const dayDate = new Date(baseDate);
          dayDate.setDate(baseDate.getDate() + dayDiff);
          
          const dayDateStr = dayDate.toISOString().split('T')[0];
          console.log(`Checking day ${dayOfWeek} (${dayDateStr}) for room ${room.id} from ${assignmentRequest.start_time} to ${assignmentRequest.end_time}`);
          
          const isDayAvailable = await this.isRoomAvailableForAssignment(
            room.id,
            dayDateStr,
            assignmentRequest.start_time,
            assignmentRequest.end_time,
            existingAssignments
          );
          
          console.log(`Day ${dayOfWeek} (${dayDateStr}) availability for room ${room.id}: ${isDayAvailable}`);
          
          if (!isDayAvailable) {
            isRecurringAvailable = false;
            console.log(`Room ${room.id} not available on day ${dayOfWeek} (${dayDateStr})`);
            break;
          }
        }
        
        console.log(`Final recurring availability for room ${room.id}: ${isRecurringAvailable}`);
      }

      if (!isAvailable || (assignmentRequest.type === 'recurring' && !isRecurringAvailable)) {
        continue;
      }

      // Calculate score for room
      const score = this.calculateRoomScoreForAssignment(room, assignmentRequest);
      const reasons = this.getScoreReasonsForAssignment(room, assignmentRequest, score);

      candidates.push({
        room,
        score,
        reasons
      });
    }

    // Sort by score (highest first)
    return candidates.sort((a, b) => b.score - a.score);
  }

  /**
   * Check if room is suitable for the assignment with all rules
   */
  private isRoomSuitableForAssignment(room: Room, assignmentRequest: CreateAssignmentData): boolean {
    // For manual assignments (saved as 'meeting'), only allow the specifically requested room
    if ((assignmentRequest.assignable_type as any) === 'manual' && assignmentRequest.room_id) {
      if (room.id.toString() !== assignmentRequest.room_id.toString()) {
        return false; // Skip all rooms except the requested one
      }
    }

    // Check capacity if specified
    if (assignmentRequest.special_requirements?.min_capacity) {
      if (room.capacity < assignmentRequest.special_requirements.min_capacity) {
        return false;
      }
    }

    // Check projector requirement
    if (assignmentRequest.special_requirements?.needs_projector && !room.has_projector) {
      return false;
    }

    // Check large group requirement
    if (assignmentRequest.special_requirements?.is_large_group && room.is_small) {
      return false;
    }

    // Apply room-specific rules
    const groupForSuitability = {
      group_type: assignmentRequest.assignable_type === 'study_group' ? 'other' : 'didactic',
      grade_level: 'א',
      student_count: assignmentRequest.special_requirements?.min_capacity || 20
    } as StudyGroup;

    const timeSlotForSuitability = {
      date: assignmentRequest.date,
      startTime: assignmentRequest.start_time,
      endTime: assignmentRequest.end_time
    };

    const roomSpecificRules = this.applyRoomSpecificRules(room, groupForSuitability, timeSlotForSuitability);
    if (!roomSpecificRules.isAllowed) {
      return false;
    }

    const gradeTimeRules = this.applyGradeAndTimeRules(groupForSuitability, timeSlotForSuitability);
    if (!gradeTimeRules.isAllowed) {
      return false;
    }

    const subjectSpecificRules = this.applySubjectRules(groupForSuitability, timeSlotForSuitability);
    if (!subjectSpecificRules.isAllowed) {
      return false;
    }

    return true;
  }

  /**
   * Check room availability for assignment
   */
  private async isRoomAvailableForAssignment(
    roomId: string,
    date: string,
    startTime: string,
    endTime: string,
    existingAssignments: Assignment[]
  ): Promise<boolean> {
    // Get room details to check if it's a homeroom
    const room = await db('rooms').where({ id: roomId, is_active: true }).first();
    if (!room) {
      return false;
    }

    // Check against existing assignments - Fixed for UUID/string comparison
    console.log(`Checking availability for room ${roomId} on ${date} from ${startTime} to ${endTime}`);
    console.log(`Total existing assignments: ${existingAssignments.length}`);
    console.log(`Existing assignments:`, existingAssignments.map(a => ({ 
      id: a.id, 
      room_id: a.room_id, 
      date: a.date instanceof Date ? a.date.toISOString().split('T')[0] : a.date,
      start_time: a.start_time,
      end_time: a.end_time,
      status: a.status
    })));
    
    const conflicts = existingAssignments.filter(a => {
      const roomMatch = a.room_id.toString() === roomId;
      const dateMatch = (a.date instanceof Date ? a.date.toISOString().split('T')[0] : a.date) === date;
      const timeConflict = checkTimeConflict(a.start_time, a.end_time, startTime, endTime);
      
      console.log(`Assignment ${a.id}: roomMatch=${roomMatch}, dateMatch=${dateMatch}, timeConflict=${timeConflict}`);
      
      return roomMatch && dateMatch && timeConflict;
    });

    console.log(`Found ${conflicts.length} conflicts:`, conflicts);

    // If there are existing assignment conflicts, room is not available
    if (conflicts.length > 0) {
      console.log(`Room ${roomId} is NOT available due to conflicts`);
      return false;
    }

    return true;
  }

  /**
   * Calculate room score for assignment with specific rules
   */
  private calculateRoomScoreForAssignment(room: Room, assignmentRequest: CreateAssignmentData): number {
    let score = 0;

    // Apply room-specific rules for scoring
    const groupForScoring = {
      group_type: assignmentRequest.assignable_type === 'study_group' ? 'other' : 'didactic',
      grade_level: 'א',
      student_count: assignmentRequest.special_requirements?.min_capacity || 20
    } as StudyGroup;

    const timeSlotForScoring = {
      date: assignmentRequest.date,
      startTime: assignmentRequest.start_time,
      endTime: assignmentRequest.end_time
    };

    const roomSpecificRules = this.applyRoomSpecificRules(room, groupForScoring, timeSlotForScoring);
    score += (11 - roomSpecificRules.priority) * 10;

    // Priority 1: Homeroom classes
    if (room.room_type.startsWith('CLASSROOM_')) {
      score += 100;
    }

    // Priority 2: Study rooms
    if (room.room_type === 'study_room') {
      score += 80;
    }

    // Priority 3: Computer labs (lower priority)
    if (room.room_type === 'computer_lab') {
      score += 30;
    }

    // Bonus for comfort
    score += room.comfort_priority * 10;

    // Bonus for suitable capacity
    const minCapacity = assignmentRequest.special_requirements?.min_capacity || 0;
    if (room.capacity >= minCapacity && room.capacity <= minCapacity + 10) {
      score += 20;
    }

    // Penalty for small rooms with large groups
    if (room.is_small && assignmentRequest.special_requirements?.is_large_group) {
      score -= 50;
    }

    return score;
  }

  /**
   * Get score reasons for assignment
   */
  private getScoreReasonsForAssignment(room: Room, assignmentRequest: CreateAssignmentData, score: number): string[] {
    const reasons: string[] = [];

    if (room.room_type.startsWith('CLASSROOM_')) {
      reasons.push('כיתת אם - עדיפות גבוהה');
    }

    if (room.room_type === 'study_room') {
      reasons.push('חדר הקבצה ייעודי');
    }

    if (room.comfort_priority >= 2) {
      reasons.push('נוחות גבוהה');
    }

    return reasons;
  }

  /**
   * בדיקת חוקי חדרים ספציפיים
   */
  private applyRoomSpecificRules(room: Room, group: StudyGroup, timeSlot: any): {
    isAllowed: boolean;
    reason?: string;
    priority: number;
  } {
    // Room 302: Last resort, preferred for English
    if (room.room_number === '302') {
      if (group.group_type === 'english') {
        return { isAllowed: true, priority: 1, reason: 'Room 302 preferred for English' };
      }
      return { isAllowed: true, priority: 10, reason: 'Room 302 - last resort only' };
    }

    // Rooms 304, 504: Small and crowded - avoid
    if (room.room_number === '304' || room.room_number === '504') {
      if (group.student_count > 30) {
        return { isAllowed: false, priority: 10, reason: 'Room too small for group size' };
      }
      return { isAllowed: true, priority: 8, reason: 'Small room - avoid if possible' };
    }

    // Large Hall: Reserved for PE and Grade 3 Sunday evenings
    if (room.room_type === 'auditorium') {
      const dayOfWeek = this.getDayOfWeek(timeSlot.date);
      const timeStr = timeSlot.startTime;
      
      if (dayOfWeek === 1 && timeStr >= '16:00' && group.grade_level === 'ג') {
        return { isAllowed: true, priority: 1, reason: 'Large Hall - Grade 3 Sunday evening' };
      }
      
      if (group.group_type === 'didactic' && timeStr >= '16:00') {
        return { isAllowed: true, priority: 2, reason: 'Large Hall - PE time' };
      }
      
      return { isAllowed: false, priority: 10, reason: 'Large Hall reserved for PE and Grade 3 Sunday evenings' };
    }

    // Library: Priority for Grade 1 PE, then Discussion/Topics
    if (room.room_type === 'library') {
      if (group.grade_level === 'א' && group.group_type === 'didactic') {
        return { isAllowed: true, priority: 1, reason: 'Library - Grade 1 PE priority' };
      }
      
      if (group.group_type === 'other' || group.group_type === 'didactic') {
        return { isAllowed: true, priority: 3, reason: 'Library - Discussion/Topics' };
      }
      
      return { isAllowed: true, priority: 5, reason: 'Library - general use' };
    }

    // Music Room: Only on Educational Days
    if (room.room_type === 'music_room') {
      const dayOfWeek = this.getDayOfWeek(timeSlot.date);
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        return { isAllowed: true, priority: 4, reason: 'Music Room - Educational day' };
      }
      return { isAllowed: false, priority: 10, reason: 'Music Room only on Educational Days' };
    }

    return { isAllowed: true, priority: 5 };
  }

  /**
   * בדיקת חוקי שכבה וזמנים
   */
  private applyGradeAndTimeRules(group: StudyGroup, timeSlot: any): {
    isAllowed: boolean;
    reason?: string;
  } {
    // Grade 5: Avoids Mondays
    if (group.grade_level === 'ה') {
      const dayOfWeek = this.getDayOfWeek(timeSlot.date);
      if (dayOfWeek === 2) {
        return { isAllowed: false, reason: 'Grade 5 avoids Mondays' };
      }
    }

    // Friday: Hard stop at 12:00
    const dayOfWeek = this.getDayOfWeek(timeSlot.date);
    if (dayOfWeek === 6) {
      if (timeSlot.endTime > '12:00') {
        return { isAllowed: false, reason: 'Friday hard stop at 12:00' };
      }
    }

    return { isAllowed: true };
  }

  /**
   * בדיקת חוקי נושא
   */
  private applySubjectRules(group: StudyGroup, timeSlot: any): {
    isAllowed: boolean;
    reason?: string;
    requiresConsecutive?: boolean;
  } {
    // Note: Math consecutive lessons rule is skipped per user request
    
    // English: Prefer scattered schedule
    if (group.group_type === 'english') {
      return { isAllowed: true, reason: 'English - prefer scattered schedule' };
    }

    return { isAllowed: true };
  }

  /**
   * Get day of week from date string
   */
  private getDayOfWeek(dateString: string): number {
    const date = new Date(dateString);
    const day = date.getDay();
    return day === 0 ? 7 : day; // Convert Sunday=0 to 7
  }
}

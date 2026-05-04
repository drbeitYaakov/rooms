import { 
  ReassignmentRequest, 
  ReassignmentReason, 
  AssignmentResult,
  Conflict,
  AssignmentRequest
} from '../types';
import { RoomEntity } from '../entities/Room';
import { AssignmentEntity } from '../entities/Assignment';
import { SchedulingEngine, ConflictInfo } from '../scheduling/schedulingEngine';

export class ConflictResolver {
  private schedulingEngine: SchedulingEngine;

  constructor() {
    this.schedulingEngine = new SchedulingEngine();
  }

  /**
   * Handle automatic reassignment scenarios
   */
  async handleReassignment(
    request: ReassignmentRequest,
    availableRooms: RoomEntity[],
    existingAssignments: AssignmentEntity[]
  ): Promise<{
    success: boolean;
    reassignedAssignments: AssignmentEntity[];
    conflicts: Conflict[];
    notifications: string[];
  }> {
    const results = {
      success: true,
      reassignedAssignments: [] as AssignmentEntity[],
      conflicts: [] as Conflict[],
      notifications: [] as string[]
    };

    try {
      // Find the original assignment
      const originalAssignment = existingAssignments.find(a => a.id === request.assignmentId);
      if (!originalAssignment) {
        results.success = false;
        results.conflicts.push({
          type: 'room_double_booked',
          assignmentId: request.assignmentId,
          description: 'Original assignment not found',
          severity: 'high'
        });
        return results;
      }

      // Handle different reassignment scenarios
      switch (request.reason) {
        case 'didactics':
          await this.handleDidacticsReassignment(originalAssignment, availableRooms, existingAssignments, results);
          break;
        case 'event':
          await this.handleEventReassignment(originalAssignment, availableRooms, existingAssignments, results);
          break;
        case 'manual':
          await this.handleManualReassignment(originalAssignment, request, availableRooms, existingAssignments, results);
          break;
        case 'conflict_resolution':
          await this.handleConflictResolution(originalAssignment, availableRooms, existingAssignments, results);
          break;
      }

      return results;
    } catch (error) {
      results.success = false;
      results.notifications.push(`Reassignment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return results;
    }
  }

  /**
   * Handle Grade 5 didactics on Monday scenario
   */
  private async handleDidacticsReassignment(
    assignment: AssignmentEntity,
    availableRooms: RoomEntity[],
    existingAssignments: AssignmentEntity[],
    results: any
  ): Promise<void> {
    // Find all Grade 5 homeroom assignments for Monday
    const grade5Assignments = existingAssignments.filter(a => 
      a.assignableType === 'homeroom' &&
      a.daysOfWeek.includes('monday') &&
      this.isGrade5(a.assignableId)
    );

    for (const grade5Assignment of grade5Assignments) {
      const reassignmentRequest: AssignmentRequest = {
        assignableType: grade5Assignment.assignableType,
        assignableId: grade5Assignment.assignableId,
        studentCount: await this.getStudentCount(grade5Assignment.assignableId),
        schedule: {
          days: grade5Assignment.daysOfWeek,
          timeSlots: grade5Assignment.timeSlots
        },
        startDate: grade5Assignment.startDate,
        endDate: grade5Assignment.endDate,
        activityType: grade5Assignment.activityType,
        isManual: false,
        overrideReason: 'Didactics reassignment'
      };

      // Convert AssignmentRequest to CreateAssignmentData
      const reassignmentData = {
        room_id: 0, // Will be assigned by scheduling engine
        assignment_type_id: 1, // Default assignment type
        assignable_type: reassignmentRequest.assignableType as any,
        assignable_id: parseInt(reassignmentRequest.assignableId),
        title: `Reassigned - ${reassignmentRequest.activityType || 'Activity'}`,
        description: reassignmentRequest.overrideReason || 'Automatic reassignment',
        date: (reassignmentRequest.specificDate || reassignmentRequest.startDate || grade5Assignment.startDate)?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        start_time: reassignmentRequest.schedule.timeSlots[0]?.start || '09:00',
        end_time: reassignmentRequest.schedule.timeSlots[0]?.end || '10:00',
        requester_id: 1, // System user
        special_requirements: {
          needs_projector: false,
          is_large_group: (reassignmentRequest.studentCount || 0) > 30,
          min_capacity: reassignmentRequest.studentCount
        }
      };

      const assignmentResult = await this.schedulingEngine.assignRoom(
        reassignmentData,
        availableRooms,
        existingAssignments.filter(a => a.id !== grade5Assignment.id) as any[]
      );

      if (assignmentResult.success && assignmentResult.assignment) {
        results.reassignedAssignments.push(assignmentResult.assignment);
        results.notifications.push(
          `Grade 5 homeroom moved from room ${grade5Assignment.roomId} to room ${assignmentResult.assignment.roomId}`
        );
      } else {
        // Convert ConflictInfo[] to Conflict[]
        if (assignmentResult.conflicts) {
          results.conflicts.push(...assignmentResult.conflicts.map((conflict: ConflictInfo) => ({
            type: conflict.conflict_type as any,
            assignmentId: conflict.group_id.toString(),
            description: conflict.message,
            severity: conflict.severity
          })));
        }
        results.notifications.push(
          `Failed to reassign Grade 5 homeroom: ${assignmentResult.errors?.join(', ')}`
        );
      }
    }
  }

  /**
   * Handle event in large hall scenario
   */
  private async handleEventReassignment(
    assignment: AssignmentEntity,
    availableRooms: RoomEntity[],
    existingAssignments: AssignmentEntity[],
    results: any
  ): Promise<void> {
    // Find all assignments in the large hall that conflict with the event
    const largeHallAssignments = existingAssignments.filter(a => 
      a.roomId === assignment.roomId &&
      a.status === 'active' &&
      a.hasConflictWith(assignment)
    );

    for (const conflictingAssignment of largeHallAssignments) {
      const reassignmentRequest: AssignmentRequest = {
        assignableType: conflictingAssignment.assignableType,
        assignableId: conflictingAssignment.assignableId,
        studentCount: await this.getStudentCount(conflictingAssignment.assignableId),
        schedule: {
          days: conflictingAssignment.daysOfWeek,
          timeSlots: conflictingAssignment.timeSlots
        },
        startDate: conflictingAssignment.startDate,
        endDate: conflictingAssignment.endDate,
        activityType: conflictingAssignment.activityType,
        isManual: false,
        overrideReason: 'Event in large hall'
      };

      // Prioritize alternative rooms for PE and other activities
      const alternativeRooms = this.getAlternativeRoomsForEvent(
        conflictingAssignment.activityType,
        availableRooms
      );

      // Convert AssignmentRequest to CreateAssignmentData
      const reassignmentData = {
        room_id: 0,
        assignment_type_id: 1,
        assignable_type: reassignmentRequest.assignableType as any,
        assignable_id: parseInt(reassignmentRequest.assignableId),
        title: `Reassigned - ${reassignmentRequest.activityType || 'Activity'}`,
        description: reassignmentRequest.overrideReason || 'Automatic reassignment',
        date: (reassignmentRequest.specificDate || reassignmentRequest.startDate)?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        start_time: reassignmentRequest.schedule.timeSlots[0]?.start || '09:00',
        end_time: reassignmentRequest.schedule.timeSlots[0]?.end || '10:00',
        requester_id: 1,
        special_requirements: {
          needs_projector: false,
          is_large_group: (reassignmentRequest.studentCount || 0) > 30,
          min_capacity: reassignmentRequest.studentCount
        }
      };

      const assignmentResult = await this.schedulingEngine.assignRoom(
        reassignmentData,
        alternativeRooms,
        existingAssignments.filter(a => a.id !== conflictingAssignment.id) as any[]
      );

      if (assignmentResult.success && assignmentResult.assignment) {
        results.reassignedAssignments.push(assignmentResult.assignment);
        results.notifications.push(
          `${conflictingAssignment.activityType} moved from large hall to room ${assignmentResult.assignment.roomId}`
        );
      } else {
        // Convert ConflictInfo[] to Conflict[]
        if (assignmentResult.conflicts) {
          results.conflicts.push(...assignmentResult.conflicts.map((conflict: ConflictInfo) => ({
            type: conflict.conflict_type as any,
            assignmentId: conflict.group_id.toString(),
            description: conflict.message,
            severity: conflict.severity
          })));
        }
        results.notifications.push(
          `Failed to reassign ${conflictingAssignment.activityType}: ${assignmentResult.errors?.join(', ')}`
        );
      }
    }

    // Add hall preparation reminder
    results.notifications.push('🔔 Reminder: Please notify cleaning committee to prepare the large hall for the event');
  }

  /**
   * Handle manual admin override
   */
  private async handleManualReassignment(
    assignment: AssignmentEntity,
    request: ReassignmentRequest,
    availableRooms: RoomEntity[],
    existingAssignments: AssignmentEntity[],
    results: any
  ): Promise<void> {
    // Check for cascade conflicts
    const cascadeConflicts = this.findCascadeConflicts(assignment, existingAssignments);
    
    if (cascadeConflicts.length > 0) {
      results.notifications.push(
        `⚠️ Manual override will affect ${cascadeConflicts.length} other assignments`
      );
      
      // Suggest alternative placements for displaced assignments
      for (const conflict of cascadeConflicts) {
        const suggestions = await this.suggestAlternativeRooms(
          conflict,
          availableRooms,
          existingAssignments
        );
        
        results.notifications.push(
          `Suggestion for ${conflict.assignableType}: ${suggestions.join(', ')}`
        );
      }
    }

    // Create the manual reassignment
    if (request.requirements) {
      // Convert AssignmentRequest to CreateAssignmentData
      const reassignmentData = {
        room_id: 0,
        assignment_type_id: 1,
        assignable_type: request.requirements.assignableType as any,
        assignable_id: parseInt(request.requirements.assignableId),
        title: `Manual - ${request.requirements.activityType || 'Activity'}`,
        description: 'Manual assignment',
        date: request.requirements.specificDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        start_time: request.requirements.schedule.timeSlots[0]?.start || '09:00',
        end_time: request.requirements.schedule.timeSlots[0]?.end || '10:00',
        requester_id: 1,
        special_requirements: {
          needs_projector: false,
          is_large_group: (request.requirements.studentCount || 0) > 30,
          min_capacity: request.requirements.studentCount
        }
      };

      const assignmentResult = await this.schedulingEngine.assignRoom(
        reassignmentData,
        availableRooms,
        existingAssignments.filter(a => a.id !== assignment.id) as any[]
      );

      if (assignmentResult.success && assignmentResult.assignment) {
        results.reassignedAssignments.push(assignmentResult.assignment);
        results.notifications.push(
          `Manual assignment created: ${request.requirements.activityType} in room ${assignmentResult.assignment.roomId}`
        );
      }
    }
  }

  /**
   * Handle general conflict resolution
   */
  private async handleConflictResolution(
    assignment: AssignmentEntity,
    availableRooms: RoomEntity[],
    existingAssignments: AssignmentEntity[],
    results: any
  ): Promise<void> {
    const reassignmentRequest: AssignmentRequest = {
      assignableType: assignment.assignableType,
      assignableId: assignment.assignableId,
      studentCount: await this.getStudentCount(assignment.assignableId),
      schedule: {
        days: assignment.daysOfWeek,
        timeSlots: assignment.timeSlots
      },
      startDate: assignment.startDate,
      endDate: assignment.endDate,
      activityType: assignment.activityType,
      isManual: false,
      overrideReason: 'Conflict resolution'
    };

    // Convert AssignmentRequest to CreateAssignmentData
    const reassignmentData = {
      room_id: 0,
      assignment_type_id: 1,
      assignable_type: reassignmentRequest.assignableType as any,
      assignable_id: parseInt(reassignmentRequest.assignableId),
      title: `Reassigned - ${reassignmentRequest.activityType || 'Activity'}`,
      description: 'Conflict resolution',
      date: (reassignmentRequest.specificDate || reassignmentRequest.startDate)?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
      start_time: reassignmentRequest.schedule.timeSlots[0]?.start || '09:00',
      end_time: reassignmentRequest.schedule.timeSlots[0]?.end || '10:00',
      requester_id: 1,
      special_requirements: {
        needs_projector: false,
        is_large_group: (reassignmentRequest.studentCount || 0) > 30,
        min_capacity: reassignmentRequest.studentCount
      }
    };

    const assignmentResult = await this.schedulingEngine.assignRoom(
      reassignmentData,
      availableRooms,
      existingAssignments.filter(a => a.id !== assignment.id) as any[]
    );

    if (assignmentResult.success && assignmentResult.assignment) {
      results.reassignedAssignments.push(assignmentResult.assignment);
      results.notifications.push(
        `Conflict resolved: Moved to room ${assignmentResult.assignment.roomId}`
      );
    } else {
      // Convert ConflictInfo[] to Conflict[]
      if (assignmentResult.conflicts) {
        results.conflicts.push(...assignmentResult.conflicts.map((conflict: ConflictInfo) => ({
          type: conflict.conflict_type as any,
          assignmentId: conflict.group_id.toString(),
          description: conflict.message,
          severity: conflict.severity
        })));
      }
      results.notifications.push(
        `Conflict resolution failed: ${assignmentResult.errors?.join(', ')}`
      );
    }
  }

  /**
   * Get alternative rooms for events based on activity type
   */
  private getAlternativeRoomsForEvent(
    activityType: string,
    availableRooms: RoomEntity[]
  ): RoomEntity[] {
    // Priority order for different activity types
    const priorityMap: { [key: string]: string[] } = {
      'PE': ['library', 'homeroom', 'study_group'],
      'discussion': ['library', 'study_group', 'homeroom'],
      'topics': ['library', 'study_group', 'homeroom'],
      'presentation': ['homeroom', 'study_group'],
      'meeting': ['music', 'caravan', 'study_group']
    };

    const priorities = priorityMap[activityType] || ['homeroom', 'study_group'];
    
    return availableRooms
      .filter(room => priorities.includes(room.roomType))
      .sort((a, b) => {
        const aPriority = priorities.indexOf(a.roomType);
        const bPriority = priorities.indexOf(b.roomType);
        return aPriority - bPriority;
      });
  }

  /**
   * Find cascade conflicts from a manual change
   */
  private findCascadeConflicts(
    assignment: AssignmentEntity,
    existingAssignments: AssignmentEntity[]
  ): AssignmentEntity[] {
    return existingAssignments.filter(a => 
      a.id !== assignment.id &&
      a.status === 'active' &&
      a.hasConflictWith(assignment)
    );
  }

  /**
   * Suggest alternative rooms for a conflicting assignment
   */
  private async suggestAlternativeRooms(
    assignment: AssignmentEntity,
    availableRooms: RoomEntity[],
    existingAssignments: AssignmentEntity[]
  ): Promise<string[]> {
    const suggestions: string[] = [];
    
    // Try different room types
    const roomTypes = ['homeroom', 'study_group', 'mamad', 'library'];
    
    for (const roomType of roomTypes) {
      const roomsOfType = availableRooms.filter(r => r.roomType === roomType);
      
      for (const room of roomsOfType) {
        const isAvailable = !existingAssignments.some(a => 
          a.roomId === room.id &&
          a.hasConflictWith(assignment)
        );
        
        if (isAvailable) {
          suggestions.push(`${room.roomNumber} (${roomType})`);
          if (suggestions.length >= 3) break; // Limit suggestions
        }
      }
      
      if (suggestions.length >= 3) break;
    }
    
    return suggestions;
  }

  // Helper methods
  private isGrade5(assignableId: string): boolean {
    // This would typically involve a database lookup
    // For now, assume assignable IDs contain grade information
    return assignableId.includes('grade_5') || assignableId.includes('ה');
  }

  private async getStudentCount(assignableId: string): Promise<number> {
    // This would typically involve a database lookup
    // For now, return a reasonable default
    return 25;
  }
}

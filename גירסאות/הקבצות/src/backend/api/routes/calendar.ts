import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';

const router = Router();

function extractStudyGroupGradeLevel(notes: unknown): string | undefined {
  if (typeof notes !== 'string' || notes.trim() === '') {
    return undefined;
  }

  try {
    const parsed = JSON.parse(notes);
    return typeof parsed?.grade_level === 'string' && parsed.grade_level.trim() !== ''
      ? parsed.grade_level.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

// Get calendar grid data - all rooms for each day/hour with availability
router.get('/grid', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  console.log('📅📅📅 Calendar API called with params:', req.query);
  console.log('📅📅📅 User:', req.user?.id, req.user?.email, req.user?.role);
  console.log('📅📅📅 Timestamp:', new Date().toISOString());
  
  const { 
    start_date, 
    end_date, 
    room_type,
    wing,
    floor 
  } = req.query;

  // Default to current week if no dates provided
  const startDate = start_date ? new Date(start_date as string) : new Date();
  const endDate = end_date ? new Date(end_date as string) : new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);

  // Get all active rooms with optional filters
  let roomsQuery = db('rooms').where({ is_active: true });
  
  if (room_type) {
    roomsQuery = roomsQuery.where('room_type', room_type);
  }
  
  if (wing) {
    roomsQuery = roomsQuery.where('wing', wing);
  }
  
  if (floor) {
    roomsQuery = roomsQuery.where('floor', parseInt(floor as string));
  }

  const rooms = await roomsQuery.orderBy('room_number', 'asc');
  console.log('📅 Found rooms:', rooms.length);
  console.log('📅 Room IDs:', rooms.map(r => ({ id: r.id, number: r.room_number })));

  // Get all assignments for the date range
  console.log('📅 Querying assignments for date range:', startDate.toISOString(), 'to', endDate.toISOString());
  
    
  // Get all active assignments and filter by both date and room in JavaScript
  const allActiveAssignments = await db('assignments')
    .where('status', 'active');
  
  console.log('📅 All active assignments (no room filter):', allActiveAssignments.length);
  
  // Debug: Show the structure of the first assignment to understand the fields
  if (allActiveAssignments.length > 0) {
    console.log('🔍 DEBUG: First assignment structure:', Object.keys(allActiveAssignments[0]));
    console.log('🔍 DEBUG: Sample assignment data:', {
      id: allActiveAssignments[0].id,
      type: allActiveAssignments[0].type,
      start_date: allActiveAssignments[0].start_date,
      end_date: allActiveAssignments[0].end_date,
      specific_date: allActiveAssignments[0].specific_date,
      date: allActiveAssignments[0].date, // This might not exist!
      start_time: allActiveAssignments[0].start_time,
      end_time: allActiveAssignments[0].end_time,
      time_slots: allActiveAssignments[0].time_slots,
      days_of_week: allActiveAssignments[0].days_of_week
    });
  }
  
  // Filter by date range and room in JavaScript
  const roomIds = rooms.map(room => room.id);
  const assignments = allActiveAssignments.filter(assignment => {
    // Handle different date field formats
    let assignmentDate;
    
    // Try specific_date first (for one-time assignments)
    if (assignment.specific_date) {
      assignmentDate = new Date(assignment.specific_date);
    } 
    // Then try start_date (for recurring/temporary)
    else if (assignment.start_date) {
      assignmentDate = new Date(assignment.start_date);
    }
    // Finally try date field (if it exists)
    else if (assignment.date) {
      assignmentDate = new Date(assignment.date);
    } else {
      console.log('❌ Assignment has no valid date field:', assignment.id);
      return false;
    }
    
    const assignmentDateStr = assignmentDate.getFullYear() + '-' + 
      String(assignmentDate.getMonth() + 1).padStart(2, '0') + '-' + 
      String(assignmentDate.getDate()).padStart(2, '0');
    
    const startDateStr = startDate.getFullYear() + '-' + 
      String(startDate.getMonth() + 1).padStart(2, '0') + '-' + 
      String(startDate.getDate()).padStart(2, '0');
    
    const endDateStr = endDate.getFullYear() + '-' + 
      String(endDate.getMonth() + 1).padStart(2, '0') + '-' + 
      String(endDate.getDate()).padStart(2, '0');
    
    // Check if assignment date is within the calendar range
    let dateInRange = false;
    
    if (assignment.type === 'temporary') {
      // For recurring assignments, check if the date range overlaps with calendar range
      const assignmentStart = new Date(assignment.start_date || assignment.date);
      const assignmentEnd = new Date(assignment.end_date || assignment.start_date || assignment.date);
      
      dateInRange = assignmentEnd >= startDate && assignmentStart <= endDate;
    } else {
      // For one-time assignments, check if the specific date is within range
      dateInRange = assignmentDateStr >= startDateStr && assignmentDateStr <= endDateStr;
    }
    
    // Check if assignment room is in the filtered rooms
    const roomMatches = roomIds.includes(assignment.room_id);
    
    console.log(`🔍 Assignment ${assignment.id}: date=${assignmentDateStr}, inRange=${dateInRange}, room=${assignment.room_id}, matches=${roomMatches}`);
    
    return dateInRange && roomMatches;
  });
  
  console.log('📅 Found assignments after filtering:', assignments.length);
  
  const studyGroupIds = Array.from(
    new Set(
      assignments
        .filter((assignment) => assignment.assignable_type === 'study_group' && assignment.assignable_id)
        .map((assignment) => String(assignment.assignable_id))
    )
  );

  const studyGroups = studyGroupIds.length > 0
    ? await db('groups')
        .select('id', 'name', 'student_count', 'notes')
        .whereIn('id', studyGroupIds)
    : [];

  const studyGroupMap = new Map(
    studyGroups.map((group: any) => [
      String(group.id),
      {
        name: group.name ? String(group.name) : undefined,
        grade_level: extractStudyGroupGradeLevel(group.notes),
        student_count: typeof group.student_count === 'number' ? group.student_count : Number(group.student_count || 0)
      }
    ])
  );

  // Log all assignments by room for debugging
  assignments.forEach(assignment => {
    const room = rooms.find(r => r.id === assignment.room_id);
    
    // Extract time from time_slots JSON
    let startTime = 'N/A';
    let endTime = 'N/A';
    
    if (assignment.time_slots) {
      try {
        const timeSlots = typeof assignment.time_slots === 'string' ? JSON.parse(assignment.time_slots) : assignment.time_slots;
        if (timeSlots && timeSlots.length > 0) {
          startTime = timeSlots[0].start || 'N/A';
          endTime = timeSlots[0].end || 'N/A';
        }
      } catch (e) {
        console.log('❌ Error parsing time_slots:', assignment.time_slots);
      }
    }
    
    // Get the display date
    let displayDate = assignment.specific_date || assignment.start_date || assignment.date || 'N/A';
    if (displayDate !== 'N/A') {
      displayDate = new Date(displayDate).toISOString().split('T')[0];
    }
  });

  console.log('🔍 DEBUG: Starting assignment grouping process...');
  console.log(`🔍 DEBUG: Total assignments to process: ${assignments.length}`);

  // Group assignments by room and date
  const assignmentsByRoomAndDate: Record<string, Record<string, any[]>> = {};
  assignments.forEach(assignment => {
    const roomId = assignment.room_id;
    
    console.log(`🔍 Processing assignment: ID=${assignment.id}, type=${assignment.type}, is_manual=${assignment.is_manual}`);
    
    // Handle different assignment types
    if (assignment.type === 'one_time' || assignment.specific_date) {
      console.log(`🔍 Assignment ${assignment.id} is ONE-TIME, specific_date=${assignment.specific_date}`);
      // One-time assignment - use specific_date
      let assignmentDate;
      if (assignment.specific_date) {
        assignmentDate = new Date(assignment.specific_date);
      } else if (assignment.start_date) {
        assignmentDate = new Date(assignment.start_date);
      } else if (assignment.date) {
        assignmentDate = new Date(assignment.date);
      } else {
        console.log('❌ Assignment has no valid date for grouping:', assignment.id);
        return;
      }
      
      const date = assignmentDate.getFullYear() + '-' + 
        String(assignmentDate.getMonth() + 1).padStart(2, '0') + '-' + 
        String(assignmentDate.getDate()).padStart(2, '0');
      
      console.log(`🗂️ Grouping one-time assignment: Room ${roomId}, Date ${date}, Assignment ${assignment.activity_type}`);
      
      if (!assignmentsByRoomAndDate[roomId]) {
        assignmentsByRoomAndDate[roomId] = {};
      }
      if (!assignmentsByRoomAndDate[roomId][date]) {
        assignmentsByRoomAndDate[roomId][date] = [];
      }
      assignmentsByRoomAndDate[roomId][date].push(assignment);
      
    } else if (assignment.type === 'temporary') {
      console.log(`🔍 DEBUG: Assignment ${assignment.id} is temporary (recurring), type=${assignment.type}`);
      // Recurring assignment - calculate all dates in range
      const startDate = new Date(assignment.start_date);
      const endDate = assignment.end_date ? new Date(assignment.end_date) : new Date('2026-12-31');
      
      // Parse days_of_week
      let daysOfWeek = [];
      console.log(`🔍 DEBUG: Raw days_of_week field:`, assignment.days_of_week, typeof assignment.days_of_week);
      try {
        daysOfWeek = typeof assignment.days_of_week === 'string' ? 
          JSON.parse(assignment.days_of_week) : assignment.days_of_week;
        console.log(`🔍 DEBUG: Parsed daysOfWeek:`, daysOfWeek);
      } catch (e) {
        console.log('❌ Error parsing days_of_week:', assignment.days_of_week);
        return;
      }
      
      console.log(`🗂️ Processing recurring assignment: Room ${roomId}, Days ${daysOfWeek}, ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
      
      // Generate all dates for this recurring assignment
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
        console.log(`🔍 DEBUG: Checking date ${currentDate.toISOString().split('T')[0]}, dayOfWeek=${dayOfWeek}, daysOfWeek=${JSON.stringify(daysOfWeek)}, includes=${daysOfWeek.includes(dayOfWeek)}`);
        
        if (daysOfWeek.includes(dayOfWeek)) {
          const date = currentDate.getFullYear() + '-' + 
            String(currentDate.getMonth() + 1).padStart(2, '0') + '-' + 
            String(currentDate.getDate()).padStart(2, '0');
          
          if (!assignmentsByRoomAndDate[roomId]) {
            assignmentsByRoomAndDate[roomId] = {};
          }
          if (!assignmentsByRoomAndDate[roomId][date]) {
            assignmentsByRoomAndDate[roomId][date] = [];
          }
          assignmentsByRoomAndDate[roomId][date].push(assignment);
          
          console.log(`🗂️ Added recurring assignment: Room ${roomId}, Date ${date}, Assignment ${assignment.activity_type}`);
        } else {
          console.log(`⏭️ Skipping date ${currentDate.toISOString().split('T')[0]} - day ${dayOfWeek} not in daysOfWeek ${daysOfWeek}`);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    } else {
      console.log('❌ Unknown assignment type:', assignment.type, assignment.id);
      return;
    }
  });
  
  // Debug: Check what's in assignmentsByRoomAndDate for room 302
  const room302Id = '938712da-9eaf-46d6-9c97-f537fd3e8fb1';
  console.log('🗂️ Room 302 assignments in grouped structure:', Object.keys(assignmentsByRoomAndDate[room302Id] || {}));
  if (assignmentsByRoomAndDate[room302Id]?.['2026-02-22']) {
    console.log('🗂️ Room 302 assignments for 2026-02-22:', assignmentsByRoomAndDate[room302Id]['2026-02-22'].length);
  } else {
    console.log('🗂️ Room 302 has no assignments for 2026-02-22');
  }

  // Generate date range (exclude Saturday)
  const dates: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const dateStr = d.toISOString().split('T')[0];
    console.log(`📅 Checking date: ${dateStr} (day ${dayOfWeek})`);
    // Skip Saturday (day 6)
    if (dayOfWeek !== 6) {
      dates.push(dateStr);
      console.log(`📅 Added date: ${dateStr}`);
    } else {
      console.log(`📅 Skipped Saturday: ${dateStr}`);
    }
  }
  console.log('📅 Final dates array:', dates);

  // Generate time slots (8:00 - 22:00 with 30-minute intervals)
  const timeSlots: string[] = [];
  for (let hour = 8; hour <= 22; hour++) {
    timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
    timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
  }

  // Build calendar grid
  const calendarGrid = rooms.map(room => {
    console.log(`🏗️ Building calendar for room ${room.room_number} (${room.id})`);
    
    const roomSchedule: any = {
      room_id: room.id,
      room_number: room.room_number,
      room_type: room.room_type,
      floor: room.floor,
      wing: room.wing,
      capacity: room.capacity,
      has_projector: room.has_projector,
      is_small: room.is_small,
      schedule: {}
    };

    dates.forEach((date: string) => {
      console.log(`📅 Processing date ${date} for room ${room.room_number}`);
      roomSchedule.schedule[date] = {};
      
      const roomAssignments = assignmentsByRoomAndDate[room.id]?.[date] || [];
      console.log(`📋 Room ${room.room_number} has ${roomAssignments.length} assignments for ${date}`);
      
      timeSlots.forEach((timeSlot: string) => {
        const [slotHour, slotMinute] = timeSlot.split(':').map(Number);
        const slotTimeInMinutes = slotHour * 60 + slotMinute;
        
        // Check if room is occupied at this time slot
        let isOccupied = false;
        let occupyingAssignment = null;
        
        // First check if there's a specific assignment
        const specificAssignment = roomAssignments.find(assignment => {
          // Extract time from time_slots JSON
          let startTime = 'N/A';
          let endTime = 'N/A';
          
          if (assignment.time_slots) {
            try {
              const timeSlots = typeof assignment.time_slots === 'string' ? JSON.parse(assignment.time_slots) : assignment.time_slots;
              if (timeSlots && timeSlots.length > 0) {
                startTime = timeSlots[0].start || 'N/A';
                endTime = timeSlots[0].end || 'N/A';
              }
            } catch (e) {
              console.log('❌ Error parsing time_slots in matching:', assignment.time_slots);
              return false;
            }
          }
          
          // Skip if no valid time
          if (startTime === 'N/A' || endTime === 'N/A') {
            return false;
          }
          
          const [startHour, startMinute] = startTime.split(':').map(Number);
          const [endHour, endMinute] = endTime.split(':').map(Number);
          
          const startTimeInMinutes = startHour * 60 + startMinute;
          const endTimeInMinutes = endHour * 60 + endMinute;
          
          // Handle case where end_time is before start_time (data issue)
          let actualEndTimeInMinutes = endTimeInMinutes;
          if (endTimeInMinutes <= startTimeInMinutes) {
            actualEndTimeInMinutes = endTimeInMinutes + 24 * 60; // Add 24 hours
          }
          
          const isInRange = slotTimeInMinutes >= startTimeInMinutes && slotTimeInMinutes < actualEndTimeInMinutes;
          
          // Debug logging for room 302
          if (room.id === '938712da-9eaf-46d6-9c97-f537fd3e8fb1' && date === '2026-02-22') {
            console.log(`🔍 Room302 ${date} ${timeSlot}: ${startTime}-${endTime} (${startTimeInMinutes}-${actualEndTimeInMinutes}) -> slot ${slotTimeInMinutes} = ${isInRange ? 'MATCH' : 'NO MATCH'}`);
          }
          
          return isInRange;
        });
        
        if (specificAssignment) {
          isOccupied = true;
          const studyGroup = specificAssignment.assignable_type === 'study_group'
            ? studyGroupMap.get(String(specificAssignment.assignable_id))
            : undefined;
          occupyingAssignment = {
            ...specificAssignment,
            study_group_name: specificAssignment.study_group_name || studyGroup?.name,
            grade: specificAssignment.grade || studyGroup?.grade_level,
            student_count: specificAssignment.student_count ?? studyGroup?.student_count
          };
          console.log(`✅ Room ${room.room_number} ${date} ${timeSlot}: OCCUPIED by ${specificAssignment.activity_type}`);
        } else {
          // Check if this is a homeroom and should have default occupancy
          const isHomeroom = room.room_type.startsWith('CLASSROOM_');
          const slotTimeInMinutes = slotHour * 60 + slotMinute;
          
          // Homerooms are occupied from 8:00 to 14:40 (8*60=480, 14*60+40=880)
          if (isHomeroom && slotTimeInMinutes >= 480 && slotTimeInMinutes < 880) {
            isOccupied = true;
            occupyingAssignment = {
              id: 'default-homeroom',
              study_group_name: 'כיתת אם',
              activity_type: 'לימודים',
              grade: room.room_type.replace('CLASSROOM_', '').toUpperCase(),
              start_time: '08:00',
              end_time: '14:40',
              student_count: 0
            };
            console.log(`🏠 Room ${room.room_number} ${date} ${timeSlot}: DEFAULT HOMEROOM`);
          }
        }

        roomSchedule.schedule[date][timeSlot] = {
          is_occupied: isOccupied,
          assignment: occupyingAssignment ? {
            id: occupyingAssignment.id,
            study_group_name: occupyingAssignment.study_group_name,
            activity_type: occupyingAssignment.activity_type,
            grade: occupyingAssignment.grade,
            start_time: occupyingAssignment.start_time,
            end_time: occupyingAssignment.end_time,
            student_count: occupyingAssignment.student_count
          } : null
        };
      });
    });
    
    return roomSchedule;
  });

  res.json({
    success: true,
    data: {
      dates,
      time_slots: timeSlots,
      rooms: calendarGrid,
      summary: {
        total_rooms: rooms.length,
        date_range: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0]
        }
      }
    }
  });
}));

// Get room availability summary for a specific date
router.get('/availability/:date', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { date } = req.params;
  const { room_type, wing, floor } = req.query;

  // Validate date
  if (!date || !Date.parse(date)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM-DD format.'
    });
  }

  // Get rooms with filters
  let roomsQuery = db('rooms').where({ is_active: true });
  
  if (room_type) {
    roomsQuery = roomsQuery.where('room_type', room_type);
  }
  
  if (wing) {
    roomsQuery = roomsQuery.where('wing', wing);
  }
  
  if (floor) {
    roomsQuery = roomsQuery.where('floor', parseInt(floor as string));
  }

  const rooms = await roomsQuery.orderBy('room_number', 'asc');

  // Get assignments for the specific date
  const assignments = await db('assignments')
    .where('date', date)
    .where('status', 'scheduled')
    .whereIn('room_id', rooms.map(r => r.id));

  // Calculate availability for each room
  const roomAvailability = rooms.map(room => {
    const roomAssignments = assignments.filter(a => a.room_id === room.id);
    
    // Calculate total occupied hours
    let totalOccupiedHours = 0;
    
    // Add default homeroom occupancy if applicable
    const isHomeroom = room.room_type.startsWith('CLASSROOM_');
    if (isHomeroom) {
      // Homerooms are occupied by default from 8:00 to 14:40 = 6.67 hours
      totalOccupiedHours += 6.67;
    }
    
    // Add specific assignment hours (on top of default if homeroom)
    roomAssignments.forEach(assignment => {
      const startHour = parseInt(assignment.start_time.split(':')[0]);
      const endHour = parseInt(assignment.end_time.split(':')[0]);
      totalOccupiedHours += (endHour - startHour);
    });

    // Working hours are 8:00-19:00 = 11 hours
    const workingHours = 11;
    const availableHours = workingHours - totalOccupiedHours;
    const utilizationRate = workingHours > 0 ? Math.round((totalOccupiedHours / workingHours) * 100) : 0;

    return {
      room_id: room.id,
      room_number: room.room_number,
      room_type: room.room_type,
      floor: room.floor,
      wing: room.wing,
      capacity: room.capacity,
      has_projector: room.has_projector,
      is_small: room.is_small,
      total_occupied_hours: totalOccupiedHours,
      available_hours: availableHours,
      utilization_rate: utilizationRate,
      is_fully_available: totalOccupiedHours === 0,
      is_fully_occupied: totalOccupiedHours >= workingHours,
      assignments: roomAssignments.map(a => ({
        id: a.id,
        study_group_name: a.study_group_name,
        activity_type: a.activity_type,
        grade: a.grade,
        start_time: a.start_time,
        end_time: a.end_time,
        student_count: a.student_count
      }))
    };
  });

  // Summary statistics
  const totalRooms = roomAvailability.length;
  const fullyAvailableRooms = roomAvailability.filter(r => r.is_fully_available).length;
  const partiallyAvailableRooms = roomAvailability.filter(r => !r.is_fully_available && !r.is_fully_occupied).length;
  const fullyOccupiedRooms = roomAvailability.filter(r => r.is_fully_occupied).length;
  const averageUtilization = totalRooms > 0 
    ? Math.round(roomAvailability.reduce((sum, r) => sum + r.utilization_rate, 0) / totalRooms)
    : 0;

  res.json({
    success: true,
    data: {
      date,
      rooms: roomAvailability,
      summary: {
        total_rooms: totalRooms,
        fully_available: fullyAvailableRooms,
        partially_available: partiallyAvailableRooms,
        fully_occupied: fullyOccupiedRooms,
        average_utilization: averageUtilization
      }
    }
  });
}));

export default router;

import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';

const router = Router();

// Get calendar grid data - all rooms for each day/hour with availability
router.get('/grid', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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

  // Get all assignments for the date range
  const assignments = await db('assignments')
    .where('date', '>=', startDate.toISOString().split('T')[0])
    .where('date', '<=', endDate.toISOString().split('T')[0])
    .where('status', 'active')
    .whereRaw('assignments.room_id::text IN (?)', [rooms.map(r => r.id)]);

  // Group assignments by room and date
  const assignmentsByRoomAndDate: Record<string, Record<string, any[]>> = {};
  assignments.forEach(assignment => {
    const roomId = assignment.room_id;
    const date = assignment.date;
    
    if (!assignmentsByRoomAndDate[roomId]) {
      assignmentsByRoomAndDate[roomId] = {};
    }
    if (!assignmentsByRoomAndDate[roomId][date]) {
      assignmentsByRoomAndDate[roomId][date] = [];
    }
    assignmentsByRoomAndDate[roomId][date].push(assignment);
  });

  // Generate date range (exclude Saturday)
  const dates: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    // Skip Saturday (day 6)
    if (dayOfWeek !== 6) {
      dates.push(d.toISOString().split('T')[0]);
    }
  }

  // Generate time slots (8:00 - 22:00 with 30-minute intervals)
  const timeSlots: string[] = [];
  for (let hour = 8; hour <= 22; hour++) {
    timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
    timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
  }

  // Build calendar grid
  const calendarGrid = rooms.map(room => {
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
      roomSchedule.schedule[date] = {};
      
      timeSlots.forEach((timeSlot: string) => {
        const hour = parseInt(timeSlot.split(':')[0]);
        const roomAssignments = assignmentsByRoomAndDate[room.id]?.[date] || [];
        
        // Check if room is occupied at this time slot
        let isOccupied = false;
        let occupyingAssignment = null;
        
        // First check if there's a specific assignment
        const specificAssignment = roomAssignments.find(assignment => {
          const [startHour, startMinute] = assignment.start_time.split(':').map(Number);
          const [endHour, endMinute] = assignment.end_time.split(':').map(Number);
          const [slotHour, slotMinute] = timeSlot.split(':').map(Number);
          
          const slotTimeInMinutes = slotHour * 60 + slotMinute;
          const startTimeInMinutes = startHour * 60 + startMinute;
          const endTimeInMinutes = endHour * 60 + endMinute;
          
          return slotTimeInMinutes >= startTimeInMinutes && slotTimeInMinutes < endTimeInMinutes;
        });
        
        if (specificAssignment) {
          isOccupied = true;
          occupyingAssignment = specificAssignment;
        } else {
          // Check if this is a homeroom and should have default occupancy
          const isHomeroom = room.room_type.startsWith('CLASSROOM_');
          const [slotHour, slotMinute] = timeSlot.split(':').map(Number);
          const slotTimeInMinutes = slotHour * 60 + slotMinute;
          
          // Homerooms are occupied from 8:00 to 14:40 (8*60=480, 14*60+40=880)
          if (isHomeroom && slotTimeInMinutes >= 480 && slotTimeInMinutes < 880) {
            isOccupied = true;
            // Create a default assignment for homeroom occupancy
            occupyingAssignment = {
              id: 'default-homeroom',
              study_group_name: 'כיתת אם',
              activity_type: 'לימודים',
              grade: room.room_type.replace('CLASSROOM_', '').toUpperCase(),
              start_time: '08:00',
              end_time: '14:40',
              student_count: 0
            };
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

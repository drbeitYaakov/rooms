import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest, requireCoordinator } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { logScheduling, logConflict } from '../../utils/logger';
import { SchedulingEngine } from '../../domain/scheduling/schedulingEngine';
import { ConflictResolver } from '../../domain/conflicts/conflictResolver';
import { RoomEntity } from '../../domain/entities/Room';
import { AssignmentEntity } from '../../domain/entities/Assignment';

const router = Router();
const schedulingEngine = new SchedulingEngine();
const conflictResolver = new ConflictResolver();

// Get all assignments
router.get('/', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('Fetching assignments for user:', req.user!.id, 'role:', req.user!.role);
    
    // First, test if we can access the table at all
    try {
      const testQuery = await db('assignments').select('id').limit(1);
      console.log('Table access test successful, found:', testQuery.length, 'rows');
    } catch (tableError: any) {
      console.error('Table access failed:', tableError);
      return res.status(500).json({
        success: false,
        error: 'Database table access failed',
        details: tableError.message
      });
    }
    
    const { 
      roomId, 
      assignableType, 
      assignableId, 
      status = 'active',
      date 
    } = req.query;

    console.log('Query params:', { roomId, assignableType, assignableId, status, date });

    let query = db('assignments')
      .select(
        'assignments.*',
        'rooms.room_number as room_number',
        'rooms.room_type as room_type'
      )
      .leftJoin('rooms', 'assignments.room_id', 'rooms.id')
      .where('assignments.status', status);

    if (roomId && roomId !== 'all') {
      query = query.where('assignments.room_id', roomId);
    }

    if (assignableType) {
      query = query.where('assignments.assignable_type', assignableType);
    }

    if (assignableId) {
      query = query.where('assignments.assignable_id', assignableId);
    }

    if (date) {
      // Handle date filtering more robustly
      const targetDate = new Date(date as string);
      if (!isNaN(targetDate.getTime())) {
        query = query.where('assignments.date', date as string);
      }
    }

    // Non-admin users can only see their own assignments
    if (req.user!.role === 'general_user') {
      console.log('Filtering by created_by:', req.user!.id);
      query = query.where('assignments.created_by', req.user!.id);
    }

    console.log('Final query SQL:', query.toString());
    
    const assignments = await query.orderBy('assignments.date', 'asc')
      .orderBy('assignments.start_time', 'asc');

    console.log('Found assignments:', assignments.length);

    res.json({
      success: true,
      data: { assignments }
    });
  } catch (error: any) {
    console.error('Error fetching assignments:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch assignments',
      details: error.message
    });
  }
}));

// Create new assignment
router.post('/', authMiddleware, requireCoordinator, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  console.log('POST /assignments - Request body:', req.body);
  
  const assignmentRequest = req.body;

  // Get available rooms
  const availableRooms = await db('rooms').where({ is_active: true });
  console.log('Available rooms count:', availableRooms.length);
  const roomEntities = availableRooms.map(room => 
    RoomEntity.fromRoomNumber(room.room_number, room)
  );

  // Get existing assignments
  const existingAssignmentsData = await db('assignments').where({ status: 'active' });
  console.log('Existing assignments count:', existingAssignmentsData.length);
  const existingAssignments = existingAssignmentsData.map(data => ({
    id: data.id,
    assignable_type: data.assignable_type,
    assignable_id: data.assignable_id,
    room_id: data.room_id,
    title: data.title,
    description: data.description,
    date: data.date,
    start_time: data.start_time,
    end_time: data.end_time,
    requester_id: data.created_by,
    status: data.status,
    is_recurring: data.is_recurring,
    special_requirements: data.special_requirements,
    created_at: data.created_at,
    updated_at: data.updated_at
  }));

  console.log('Calling scheduling engine with request:', assignmentRequest);
  
  // Use scheduling engine to assign room
  const result = await schedulingEngine.assignRoom(
    assignmentRequest,
    roomEntities,
    existingAssignments
  );

  console.log('Scheduling engine result:', result);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: 'Failed to create assignment',
      conflicts: result.conflicts,
      alternativeRooms: result.alternativeRooms,
      errors: result.errors
    });
  }

  if (result.assignment) {
    // Validate room_id before inserting - Fixed for UUID
    if (!result.assignment.room_id || result.assignment.room_id === '' || typeof result.assignment.room_id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid room ID'
      });
    }

    console.log('Creating assignment with room_id:', result.assignment.room_id);
    
    // Save assignment to database
    const [savedAssignment] = await db('assignments').insert({
      type: result.assignment.type || 'one_time',
      assignable_type: result.assignment.assignable_type === 'manual' ? 'meeting' : result.assignment.assignable_type,
      assignable_id: result.assignment.assignable_id,
      room_id: result.assignment.room_id,
      activity_type: result.assignment.activity_type || 'meeting',
      created_by: req.user!.id,
      start_date: result.assignment.date,
      date: result.assignment.date,
      start_time: result.assignment.start_time,
      end_time: result.assignment.end_time,
      days_of_week: JSON.stringify(result.assignment.daysOfWeek || []),
      time_slots: JSON.stringify(result.assignment.timeSlots || [{ start: result.assignment.start_time, end: result.assignment.end_time }]),
      is_manual: true,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    }).returning('*');

    logScheduling(`Assignment created: ${result.assignment.assignable_type} in room ${result.assignment.room_id} by ${req.user!.email}`);

    res.status(201).json({
      success: true,
      data: { assignment: savedAssignment },
      explanation: result.explanation
    });
  } else {
    res.status(400).json({
      success: false,
      error: 'No suitable room found',
      alternativeRooms: result.alternativeRooms,
      errors: result.errors
    });
  }
}));

export default router;

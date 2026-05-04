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
      .leftJoin('rooms', db.raw('assignments.room_id::text = rooms.id::text'))
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
  console.log('specific_date field:', req.body.specific_date);
  console.log('date field:', req.body.date);
  
  const assignmentRequest = req.body;
  
  // Add debug log to see the date issue
  console.log('Original req.body.date:', req.body.date);
  console.log('assignmentRequest.date:', assignmentRequest.date);

  // Get available rooms
  const availableRooms = await db('rooms').where({ is_active: true });
  console.log('Available rooms count:', availableRooms.length);
  const roomEntities = availableRooms.map(room => 
    RoomEntity.fromRoomNumber(room.room_number, {
      id: room.id,
      hasProjector: room.has_projector,
      capacity: room.capacity,
      notes: room.notes,
      isActive: room.is_active,
      createdAt: room.created_at,
      updatedAt: room.updated_at
    })
  );

  // Get existing assignments
  let existingAssignmentsData;
  
  console.log('Assignment request received:', {
    type: assignmentRequest.type,
    date: assignmentRequest.date,
    end_date: assignmentRequest.end_date,
  });
  
  if (assignmentRequest.type === 'recurring') {
    // For recurring assignments, get assignments for date range
    const startDate = new Date(assignmentRequest.date);
    const endDate = new Date(assignmentRequest.end_date || assignmentRequest.date);
    
    existingAssignmentsData = await db('assignments')
      .where({ status: 'active' })
      .where('date', '>=', startDate.toISOString().split('T')[0])
      .where('date', '<=', endDate.toISOString().split('T')[0]);
  } else {
    // For one-time assignments, get assignments for the specific date only
    console.log('Querying assignments for date:', assignmentRequest.date);

    // Use simple date comparison - convert both to YYYY-MM-DD format
    existingAssignmentsData = await db('assignments')
      .where({ status: 'active' })
      .whereRaw('DATE(date) = DATE(?)', [assignmentRequest.date]);
    
    console.log('Query executed for one-time assignment');
    console.log('Found assignments for date', assignmentRequest.date, ':', existingAssignmentsData.length);
    existingAssignmentsData.forEach((assignment, index) => {
      console.log(`Assignment ${index + 1}:`, {
        id: assignment.id,
        room_id: assignment.room_id,
        date: assignment.date,
        start_time: assignment.start_time,
        end_time: assignment.end_time
      });
    });
  }
  
  console.log('Existing assignments count:', existingAssignmentsData.length);
  console.log('Date range:', assignmentRequest.type === 'recurring' 
    ? `${assignmentRequest.date} to ${assignmentRequest.end_date}` 
    : assignmentRequest.date);

  // Check for duplicates BEFORE calling scheduling engine
  console.log('🔍 Checking for duplicates with:', {
    room_id: assignmentRequest.room_id,
    date: assignmentRequest.date,
    start_time: assignmentRequest.start_time,
    end_time: assignmentRequest.end_time,
    type: assignmentRequest.type
  });

  if (assignmentRequest.type === 'recurring') {
    // For recurring assignments, check each day in the range
    const startDate = new Date(assignmentRequest.date);
    const endDate = new Date(assignmentRequest.end_date || assignmentRequest.date);
    const daysOfWeek = assignmentRequest.days_of_week || [];
    
    console.log('🔍 Checking recurring assignment availability:', {
      room_id: assignmentRequest.room_id,
      start_date: assignmentRequest.date,
      end_date: assignmentRequest.end_date,
      days_of_week: daysOfWeek,
      time_range: `${assignmentRequest.start_time} - ${assignmentRequest.end_time}`
    });
    
    let roomIsAvailable = true;
    let conflictDates = [];
    let totalConflicts = 0;
    
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dayOfWeek = date.getDay();
      
      // Check if this day is included in the recurring pattern
      if (daysOfWeek.includes(dayOfWeek)) {
        const dateStr = date.toISOString().split('T')[0];
        
        const duplicateCheck = await db('assignments')
          .where('room_id', assignmentRequest.room_id)
          .whereRaw('DATE(date) = DATE(?)', [dateStr])
          .where('status', 'active')
          .where(function() {
            this.where('start_time', '<=', assignmentRequest.end_time)
                .andWhere('end_time', '>=', assignmentRequest.start_time);
          });
        
        if (duplicateCheck.length > 0) {
          roomIsAvailable = false;
          conflictDates.push(dateStr);
          totalConflicts += duplicateCheck.length;
          
          console.log(`🚫 Room ${assignmentRequest.room_id} is occupied on ${dateStr}:`, duplicateCheck.map(d => ({
            start_time: d.start_time,
            end_time: d.end_time,
            activity_type: d.activity_type
          })));
        } else {
          console.log(`✅ Room ${assignmentRequest.room_id} is available on ${dateStr}`);
        }
      }
    }
    
    // If ANY day is occupied, block the entire recurring assignment
    if (!roomIsAvailable) {
      console.log(`🚫 BLOCKING: Recurring assignment conflicts found on ${conflictDates.length} days`);
      console.log(`📊 Total conflicts: ${totalConflicts} across dates: ${conflictDates.join(', ')}`);
      
      return res.status(409).json({
        success: false,
        error: `לא ניתן ליצור שיבוץ תדיר - החדר תפוס ב-${conflictDates.length} ימים מהתקופה המבוקשת: ${conflictDates.join(', ')}`,
        conflicts: [],
        conflict_dates: conflictDates,
        total_conflicts: totalConflicts,
        message: 'שיבוץ תדיר דורש שהחדר יהיה פנוי בכל הימים המבוקשים'
      });
    }
    
    console.log(`✅ Room ${assignmentRequest.room_id} is available for ALL requested days in recurring assignment`);
  } else {
    // For one-time assignments, check the specific date
    const duplicateCheck = await db('assignments')
      .where('room_id', assignmentRequest.room_id)
      .whereRaw('DATE(date) = DATE(?)', [assignmentRequest.date])
      .where('status', 'active')
      .where(function() {
        this.where('start_time', '<=', assignmentRequest.end_time)
            .andWhere('end_time', '>=', assignmentRequest.start_time);
      });
    
    console.log('📊 Duplicate check result:', {
      found: duplicateCheck.length,
      duplicates: duplicateCheck
    });
    
    if (duplicateCheck.length > 0) {
      console.log('🚫 BLOCKING: Found duplicates, returning 409');
      return res.status(409).json({
        success: false,
        error: 'קיים כבר שיבוץ לחדר זה בזמן המבוקש',
        conflicts: duplicateCheck
      });
    }
  }

  console.log('✅ No duplicates found, proceeding...');
  
  // Check if this is a manual assignment
  if (assignmentRequest.assignable_type === 'manual' || assignmentRequest.type === 'manual') {
    console.log('🎯 Manual assignment detected - inserting directly to database');
    
    // Manual assignment - insert directly to the requested room
    let savedAssignment;
    try {
      [savedAssignment] = await db('assignments').insert({
        type: assignmentRequest.type === 'recurring' ? 'temporary' : (assignmentRequest.type || 'one_time'),  // ← Use valid constraint values
        assignable_type: 'meeting',
        assignable_id: assignmentRequest.assignable_id || 1,
        room_id: assignmentRequest.room_id,  // ← The room the user requested
        activity_type: assignmentRequest.activity_type || 'meeting',
        created_by: req.user!.id,
        start_date: assignmentRequest.date,
        date: assignmentRequest.date,
        end_date: assignmentRequest.end_date,
        start_time: assignmentRequest.start_time,
        end_time: assignmentRequest.end_time,
        days_of_week: JSON.stringify(assignmentRequest.days_of_week || []),
        time_slots: JSON.stringify(assignmentRequest.time_slots || [{ 
          start: assignmentRequest.start_time, 
          end: assignmentRequest.end_time 
        }]),
        is_manual: true,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).returning('*');
    } catch (error: any) {
      // Check if it's a unique constraint violation
      if (error.code === '23505' && error.constraint === 'assignments_no_double_booking') {
        console.log('🚫 BLOCKING: Unique constraint violation - duplicate assignment detected');
        return res.status(409).json({
          success: false,
          error: 'קיים כבר שיבוץ לחדר זה בזמן המבוקש',
          conflicts: []
        });
      }
      
      // Re-throw other errors
      throw error;
    }

    console.log('✅ Manual assignment saved successfully');
    
    return res.status(201).json({
      success: true,
      data: { assignment: savedAssignment },
      explanation: `שיבוץ ידני בחדר ${assignmentRequest.room_id} בוצע בהצלחה`
    });
  }
  
  // For automatic assignments, use scheduling engine
  console.log('🤖 Automatic assignment detected - using scheduling engine');
  
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

  console.log('Calling scheduling engine for automatic assignment:', assignmentRequest);
  console.log('Available rooms:', availableRooms.map(r => ({ id: r.id, room_number: r.room_number })));
  console.log('Existing assignments:', existingAssignments.map(a => ({ id: a.id, room_id: a.room_id, date: a.date })));
  
  // Use scheduling engine to assign room
  const result = await schedulingEngine.assignRoom(
    assignmentRequest,
    availableRooms, // Pass original rooms instead of roomEntities to preserve room numbers
    existingAssignments
  );

  console.log('Scheduling engine result:', JSON.stringify(result, null, 2));

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.errors?.[0] || 'Failed to create assignment',
      conflicts: result.conflicts,
      alternativeRooms: result.alternativeRooms,
      errors: result.errors,
      explanation: result.explanation
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

    console.log('Creating automatic assignment with room_id:', result.assignment.room_id);
    console.log('About to save assignment with date:', assignmentRequest.date);
    
    // Save assignment to database - simple approach
    let savedAssignment;
    try {
      [savedAssignment] = await db('assignments').insert({
        type: assignmentRequest.type === 'recurring' ? 'temporary' : (assignmentRequest.type || 'one_time'),  // ← Use valid constraint values
        assignable_type: result.assignment.assignable_type === 'manual' ? 'meeting' : result.assignment.assignable_type,
        assignable_id: result.assignment.assignable_id,
        room_id: result.assignment.room_id,
        activity_type: result.assignment.activity_type || 'meeting',
        created_by: req.user!.id,
        start_date: assignmentRequest.date,
        date: assignmentRequest.date,
        end_date: assignmentRequest.end_date,
        start_time: result.assignment.start_time,
        end_time: result.assignment.end_time,
        days_of_week: JSON.stringify(result.assignment.daysOfWeek || []),
        time_slots: JSON.stringify(result.assignment.timeSlots || [{ start: result.assignment.start_time, end: result.assignment.end_time }]),
        is_manual: false, // ← This is automatic assignment
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).returning('*');
    } catch (error: any) {
      // Check if it's a unique constraint violation
      if (error.code === '23505' && error.constraint === 'assignments_no_double_booking') {
        console.log('🚫 BLOCKING: Unique constraint violation - duplicate assignment detected');
        return res.status(409).json({
          success: false,
          error: 'קיים כבר שיבוץ לחדר זה בזמן המבוקש',
          conflicts: []
        });
      }
      
      // Re-throw other errors
      throw error;
    }

    console.log('Assignment saved to database:', savedAssignment.date);

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

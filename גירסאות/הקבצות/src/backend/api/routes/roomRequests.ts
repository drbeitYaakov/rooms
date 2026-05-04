import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';

const router = Router();

// Get all room requests
router.get('/', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, requesterId } = req.query;

  let query = db('room_requests')
    .select(
      'room_requests.*',
      'users.full_name as requester_name',
      'users.email as requester_email',
      'rooms.room_number as room_number'
    )
    .leftJoin('users', 'room_requests.requester_id', 'users.id')
    .leftJoin('rooms', 'room_requests.requested_room_id', 'rooms.id')
    .orderBy('room_requests.created_at', 'desc');

  if (status) {
    query = query.where('room_requests.status', status);
  }

  if (requesterId) {
    query = query.where('room_requests.requester_id', requesterId);
  }

  // Non-admin users can only see their own requests
  if (req.user!.role === 'general_user') {
    query = query.where('room_requests.requester_id', req.user!.id);
  }

  const requests = await query;

  res.json({
    success: true,
    data: { requests }
  });
}));

// Create new room request
router.post('/', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  console.log('Creating room request with user ID:', req.user!.id);
  console.log('User ID type:', typeof req.user!.id);
  
  const { 
    activity_type, 
    grade, 
    student_count, 
    date, 
    start_time, 
    end_time, 
    special_requirements,
    requested_room_id 
  } = req.body;

  try {
    // Find the best room for this request
    let bestRoom = null;
    
    if (requested_room_id) {
      // If user requested a specific room, check if it's available
      bestRoom = await db('rooms').where({ id: requested_room_id }).first();
      
      // Check for conflicts
      const conflict = await db('assignments')
        .where({ 
          room_id: requested_room_id,
          date: date,
          status: 'active'
        })
        .where(function() {
          this.where('start_time', '<=', end_time)
            .where('end_time', '>=', start_time);
        })
        .first();
      
      if (conflict) {
        return res.status(409).json({
          success: false,
          error: 'החדר המבוקש תפוס בזמן המבוקש'
        });
      }
    } else {
      // Auto-assign best room based on criteria
      const availableRooms = await db('rooms')
        .where('is_active', true)
        .where('capacity', '>=', student_count)
        .whereNotIn('id', function() {
          this.select('room_id')
            .from('assignments')
            .where({ date: date, status: 'active' })
            .where(function() {
              this.where('start_time', '<=', end_time)
                .where('end_time', '>=', start_time);
            });
        });

      if (availableRooms.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'לא נמצא חדר פנוי המתאים לדרישות'
        });
      }

      // Prioritize rooms based on activity type and preferences
      bestRoom = availableRooms[0];
    }

    // Check for duplicate assignments before proceeding
    console.log('🔍 RoomRequests - Checking for duplicates with:', {
      room_id: bestRoom.id,
      date: date,
      start_time: start_time,
      end_time: end_time
    });
    
    const duplicateCheck = await db('assignments')
      .where('room_id', bestRoom.id)
      .whereRaw("date::date = ?::date", [date])
      .where('status', 'active')
      .where(function() {
        this.where('start_time', '<=', end_time)
            .andWhere('end_time', '>=', start_time);
      });
      
    console.log('📊 RoomRequests - Duplicate check result:', {
      found: duplicateCheck.length,
      duplicates: duplicateCheck
    });
      
    if (duplicateCheck.length > 0) {
      console.log('🚫 RoomRequests - BLOCKING: Found duplicates, returning 409');
      return res.status(409).json({
        success: false,
        error: 'קיים כבר שיבוץ לחדר זה בזמן המבוקש',
        conflicts: duplicateCheck
      });
    }
    
    console.log('✅ RoomRequests - No duplicates found, proceeding...');

    // Create the assignment
    const assignmentData = {
      type: 'one_time',
      assignable_type: 'event',
      assignable_id: 'room_request',
      room_id: bestRoom.id,
      specific_date: date,
      days_of_week: [], // Not used for one-time assignments
      time_slots: [{ start: start_time, end: end_time }],
      activity_type: activity_type,
      created_by: req.user!.id,
      status: 'active',
      // Add simple columns for easier querying
      date: date,
      start_time: start_time,
      end_time: end_time,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const [assignment] = await db('assignments').insert(assignmentData).returning('*');

    // Also create a room request record for tracking
    const requestData = {
      requester_id: req.user!.id,
      requested_room_id: requested_room_id || bestRoom.id,
      activity_type,
      grade,
      student_count,
      date,
      start_time,
      end_time,
      special_requirements,
      status: 'approved', // Auto-approved since we assigned it
      approved_room_id: bestRoom.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await db('room_requests').insert(requestData);

    res.status(201).json({
      success: true,
      data: { 
        assignment,
        room: bestRoom,
        message: `החדר ${bestRoom.room_number} שויך בהצלחה`
      }
    });
  } catch (error: any) {
    console.error('Error creating room request:', error);
    console.error('Request data:', req.body);
    res.status(500).json({
      success: false,
      error: 'Failed to create room request',
      details: error.message
    });
  }
}));

// Update room request status (for admins)
router.put('/:id', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status, approved_room_id, notes } = req.body;

  // Check if request exists
  const existingRequest = await db('room_requests').where({ id }).first();
  if (!existingRequest) {
    return res.status(404).json({
      success: false,
      error: 'Room request not found'
    });
  }

  // Only admins can approve/reject requests
  if (req.user!.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }

  const updates = {
    status,
    approved_room_id,
    notes,
    updated_by: req.user!.id,
    updated_at: new Date()
  };

  const [request] = await db('room_requests')
    .where({ id })
    .update(updates)
    .returning('*');

  res.json({
    success: true,
    data: { request }
  });
}));

// Delete room request
router.delete('/:id', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  // Check if request exists
  const existingRequest = await db('room_requests').where({ id }).first();
  if (!existingRequest) {
    return res.status(404).json({
      success: false,
      error: 'Room request not found'
    });
  }

  // Check permissions (users can only delete their own requests, admins can delete any)
  if (req.user!.role !== 'admin' && existingRequest.requester_id !== req.user!.id) {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }

  await db('room_requests').where({ id }).del();

  res.json({
    success: true,
    message: 'Room request deleted successfully'
  });
}));

export default router;

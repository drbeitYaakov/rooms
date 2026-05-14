import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest, requireAdmin } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { logScheduling } from '../../utils/logger';
import { applyAuditoriumDefaultSettingsToAssignments } from '../../utils/auditoriumDefaults';
import {
  applyMusicRoomDefaultSettingsToAssignments,
  buildMusicRoomWeeklySchedule,
  loadMusicRoomDefaultSchedule,
  normalizeMusicRoomWeeklySchedule,
  saveMusicRoomOverrideSetting
} from '../../utils/musicRoomDefaults';
import { RoomEntity } from '../../domain/entities/Room';
import { getRoomLocation, isMamadRoom } from '../../domain/models/Room';

const router = Router();

const getToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const normalizeDateOnly = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.includes('T') ? value.split('T')[0] : value;
  }

  const parsed = new Date(value as string);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

const isMusicRoom = (room: { room_type?: string | null; notes?: string | null }) => {
  const roomType = String(room.room_type || '').trim().toUpperCase();
  const notes = String(room.notes || '').trim().toLowerCase();
  return roomType === 'MUSIC' || roomType === 'MUSIC_ROOM' || notes.includes('מוזיקה');
};

const normalizeIncomingRoomType = (roomType: unknown): string => {
  const normalized = String(roomType || '').trim();
  if (!normalized) {
    return '';
  }

  switch (normalized.toUpperCase()) {
    case 'STUDY_ROOM':
      return 'study_room';
    case 'COMPUTER_LAB':
      return 'computer_lab';
    case 'MUSIC_ROOM':
      return 'music_room';
    default:
      return normalized.toUpperCase();
  }
};

// Get all rooms
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rooms = await db('rooms')
    .where({ is_active: true })
    .orderBy('room_number', 'asc');

  res.json({
    success: true,
    data: { rooms }
  });
}));

// Get room by ID
router.get('/:id', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  const room = await db('rooms')
    .where({ id, is_active: true })
    .first();

  if (!room) {
    return res.status(404).json({
      success: false,
      error: 'החדר לא נמצא'
    });
  }

  res.json({
    success: true,
    data: { room }
  });
}));

router.get('/:id/default-blocks', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const room = await db('rooms')
    .where({ id, is_active: true })
    .first();

  if (!room) {
    return res.status(404).json({
      success: false,
      error: 'החדר לא נמצא'
    });
  }

  if (!isMusicRoom(room)) {
    return res.status(400).json({
      success: false,
      error: 'החדר שנבחר אינו חדר מוזיקה'
    });
  }

  const schedule = await loadMusicRoomDefaultSchedule(db);
  const roomOverrides = schedule.roomOverrides.filter((setting) => String(setting.room_id) === String(id));

  res.json({
    success: true,
    data: {
      system_default: {
        weekly_schedule: buildMusicRoomWeeklySchedule()
      },
      room: {
        id: room.id,
        room_number: room.room_number,
        room_type: room.room_type
      },
      room_overrides: roomOverrides
    }
  });
}));

router.put('/:id/default-blocks', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const normalizedDate = normalizeDateOnly(req.body?.effective_from);
  const normalizedWeeklySchedule = normalizeMusicRoomWeeklySchedule(req.body?.weekly_schedule);

  if (!normalizedDate || !Array.isArray(req.body?.weekly_schedule)) {
    return res.status(400).json({
      success: false,
      error: 'חובה לשלוח effective_from ו-weekly_schedule'
    });
  }

  const room = await db('rooms')
    .where({ id, is_active: true })
    .first();

  if (!room) {
    return res.status(404).json({
      success: false,
      error: 'החדר לא נמצא'
    });
  }

  if (!isMusicRoom(room)) {
    return res.status(400).json({
      success: false,
      error: 'החדר שנבחר אינו חדר מוזיקה'
    });
  }

  await db.transaction(async (trx) => {
    await saveMusicRoomOverrideSetting(trx, {
      room_id: String(id),
      effective_from: normalizedDate,
      weekly_schedule: normalizedWeeklySchedule,
      updated_by: req.user?.id ?? null
    });

    await applyMusicRoomDefaultSettingsToAssignments(
      trx,
      [String(id)],
      normalizedDate,
      req.user?.id ?? null
    );
  });

  res.json({
    success: true,
    message: 'הזמנים הקבועים של חדר המוזיקה נשמרו בהצלחה'
  });
}));

router.post('/music-default-blocks/sync', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const startDate = normalizeDateOnly(req.body?.start_date) ?? getToday();
  const rooms = await db('rooms')
    .select('id', 'room_type', 'notes')
    .where({ is_active: true });
  const musicRoomIds = rooms
    .filter((room: any) => isMusicRoom(room))
    .map((room: any) => String(room.id));

  await db.transaction(async (trx) => {
    await applyMusicRoomDefaultSettingsToAssignments(
      trx,
      musicRoomIds,
      startDate,
      req.user?.id ?? null
    );
  });

  res.json({
    success: true
  });
}));

// Create new room (admin only)
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    roomNumber,
    floor,
    wing,
    side,
    roomType,
    hasProjector,
    isSmall,
    capacity,
    priority,
    reservedFor,
    gradeLevel,
    notes,
    assignAsHomeroom,
    homeroomAssignments
  } = req.body;

  // Validate required fields
  if (!roomNumber || !roomType || capacity === undefined) {
    return res.status(400).json({
      success: false,
      error: 'חובה למלא מספר חדר, סוג חדר ותכולה'
    });
  }

  // Automatically determine floor and wing from room number
  let autoFloor, autoWing;
  try {
    const location = getRoomLocation(roomNumber);
    autoFloor = location.floor;
    autoWing = location.wing.toUpperCase();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'פורמט מספר החדר אינו תקין. מספר החדר צריך להתחיל בספרה 1-5 לצורך קביעת הקומה.'
    });
  }

  // Use provided floor/wing if explicitly given, otherwise use auto-determined values
  const finalFloor = floor !== undefined ? floor : autoFloor;
  // Map wing values to match database enum - database only has OLD, RIGHT, LEFT
  let wingValue = wing !== undefined ? wing.toUpperCase() : autoWing.toUpperCase();
  if (wingValue === 'NEW') {
    wingValue = 'OLD'; // Map NEW to OLD since database doesn't have NEW enum
  }
  const finalWing = wingValue;

  // Respect the user's explicit room type choice.
  let finalRoomType = normalizeIncomingRoomType(roomType);

  // Log automatic determination if used
  if (floor === undefined || wing === undefined) {
    logScheduling(`Auto-determined location for room ${roomNumber}: floor ${autoFloor}, wing ${autoWing}`);
  }

  // Check if room already exists
  const existingRoom = await db('rooms').where({ room_number: roomNumber }).first();
  if (existingRoom) {
    return res.status(400).json({
      success: false,
      error: 'כבר קיים חדר עם המספר הזה'
    });
  }

  // Create room
  const [room] = await db('rooms').insert({
    room_number: roomNumber,
    floor: finalFloor,
    wing: finalWing,
    side,
    room_type: finalRoomType,
    has_projector: hasProjector || false,
    is_small: isSmall || false,
    capacity,
    priority: priority || 'normal',
    reserved_for: reservedFor,
    grade_level: gradeLevel,
    notes,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  }).returning('*');

  if (String(room.room_type).toUpperCase() === 'AUDITORIUM') {
    await db.transaction(async (trx) => {
      await applyAuditoriumDefaultSettingsToAssignments(trx, [String(room.id)], getToday(), req.user?.id ?? null);
    });
  }

  if (isMusicRoom(room)) {
    await db.transaction(async (trx) => {
      await applyMusicRoomDefaultSettingsToAssignments(trx, [String(room.id)], getToday(), req.user?.id ?? null);
    });
  }

  // Handle homeroom assignments if requested
  let homeroomsCreated = [];
  if (assignAsHomeroom && homeroomAssignments && Array.isArray(homeroomAssignments)) {
    for (const assignment of homeroomAssignments) {
      const { gradeId, classNumber, maxStudents, schoolYear } = assignment;
      
      // Check if grade exists
      const grade = await db('grades').where({ id: gradeId }).first();
      if (!grade) {
        continue; // Skip invalid grades
      }
      
      // Check if homeroom already exists for this grade and class
      const existingHomeroom = await db('homerooms')
        .where({ 
          grade_id: gradeId, 
          class_number: classNumber, 
          school_year: (schoolYear || new Date().getFullYear()).toString() 
        })
        .first();
      
      if (!existingHomeroom) {
        const [homeroom] = await db('homerooms').insert({
          grade_id: gradeId,
          room_id: room.id,
          class_number: classNumber,
          current_students: 0,
          max_students: maxStudents || 35,
          school_year: schoolYear || new Date().getFullYear().toString(),
          created_at: new Date(),
          updated_at: new Date()
        }).returning('*');
        
        homeroomsCreated.push(homeroom);
      }
    }
  }

  logScheduling(`Room created: ${roomNumber} by ${req.user!.email}${homeroomsCreated.length > 0 ? ` with ${homeroomsCreated.length} homeroom assignments` : ''}`);

  res.status(201).json({
    success: true,
    data: { 
      room,
      homerooms: homeroomsCreated,
      auto_determined: {
        floor: floor === undefined ? autoFloor : null,
        wing: wing === undefined ? autoWing : null,
        room_type: null
      }
    }
  });
}));

// Update room (admin only)
router.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  // Check if room exists
  const existingRoom = await db('rooms').where({ id, is_active: true }).first();
  if (!existingRoom) {
    return res.status(404).json({
      success: false,
      error: 'החדר לא נמצא'
    });
  }

  // Update room
  const [room] = await db('rooms')
    .where({ id })
    .update({
      ...updates,
      updated_at: new Date()
    })
    .returning('*');

  if (String(room.room_type).toUpperCase() === 'AUDITORIUM') {
    await db.transaction(async (trx) => {
      await applyAuditoriumDefaultSettingsToAssignments(trx, [String(room.id)], getToday(), req.user?.id ?? null);
    });
  }

  if (isMusicRoom(room)) {
    await db.transaction(async (trx) => {
      await applyMusicRoomDefaultSettingsToAssignments(trx, [String(room.id)], getToday(), req.user?.id ?? null);
    });
  }

  logScheduling(`Room updated: ${room.room_number} by ${req.user!.email}`);

  res.json({
    success: true,
    data: { room }
  });
}));

// Delete room (admin only)
router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  // Check if room exists
  const existingRoom = await db('rooms').where({ id }).first();
  if (!existingRoom) {
    return res.status(404).json({
      success: false,
      error: 'החדר לא נמצא'
    });
  }

  const deletionSummary = await db.transaction(async (trx) => {
    const linkedHomerooms = await trx('homerooms')
      .select('id')
      .where({ room_id: id });
    const linkedHomeroomIds = linkedHomerooms.map((homeroom: any) => homeroom.id);

    const linkedSchedules = await trx('schedules')
      .select('id')
      .where({ room_id: id });
    const linkedScheduleIds = linkedSchedules.map((schedule: any) => schedule.id);

    if (linkedHomeroomIds.length > 0) {
      await trx('classrooms')
        .whereIn('home_room_id', linkedHomeroomIds)
        .update({
          home_room_id: null,
          updated_at: new Date()
        });

      await trx('assignments')
        .where('assignable_type', 'homeroom')
        .whereIn('assignable_id', linkedHomeroomIds.map((homeroomId) => String(homeroomId)))
        .del();

      await trx('homerooms')
        .whereIn('id', linkedHomeroomIds)
        .del();
    }

    if (linkedScheduleIds.length > 0) {
      await trx('schedule_exceptions')
        .whereIn('schedule_id', linkedScheduleIds)
        .del();
    }

    await trx('schedule_exceptions')
      .where({ new_room_id: id })
      .del();

    await trx('cycle_default_rooms')
      .where({ room_id: id })
      .del();

    await trx('schedules')
      .where({ room_id: id })
      .del();

    const deletedAssignments = await trx('assignments')
      .where({ room_id: id })
      .del()
      .returning('id');

    const deletedRequestedRoomLinks = await trx('room_requests')
      .where({ requested_room_id: id })
      .del()
      .returning('id');

    const requestedRoomRequestIds = deletedRequestedRoomLinks.map((row: any) => row.id);
    const approvedRoomLinksQuery = trx('room_requests')
      .where({ approved_room_id: id });

    if (requestedRoomRequestIds.length > 0) {
      approvedRoomLinksQuery.whereNotIn('id', requestedRoomRequestIds);
    }

    const deletedApprovedRoomLinks = await approvedRoomLinksQuery
      .del()
      .returning('id');

    await trx('rooms')
      .where({ id })
      .del();

    return {
      deletedHomeroomsCount: linkedHomeroomIds.length,
      deletedSchedulesCount: linkedScheduleIds.length,
      deletedAssignmentsCount: deletedAssignments.length,
      deletedRoomRequestsCount: deletedRequestedRoomLinks.length + deletedApprovedRoomLinks.length
    };
  });

  logScheduling(`Room deleted permanently: ${existingRoom.room_number} by ${req.user!.email}`);

  res.json({
    success: true,
    message: 'החדר נמחק בהצלחה'
  });
}));

// Get room availability
router.get('/:id/availability', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { date } = req.query;

  // Check if room exists
  const room = await db('rooms').where({ id, is_active: true }).first();
  if (!room) {
    return res.status(404).json({
      success: false,
      error: 'החדר לא נמצא'
    });
  }

  // Get assignments for this room
  let assignmentsQuery = db('assignments')
    .where({ room_id: id, status: 'active' });

  if (date) {
    assignmentsQuery = assignmentsQuery.where('start_date', '<=', date)
      .where(function() {
        this.whereNull('end_date').orWhere('end_date', '>=', date);
      });
  }

  const assignments = await assignmentsQuery;

  res.json({
    success: true,
    data: {
      room,
      assignments
    }
  });
}));

// Get room usage statistics
router.get('/:id/stats', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { period = 'week' } = req.query;

  // Check if room exists
  const room = await db('rooms').where({ id, is_active: true }).first();
  if (!room) {
    return res.status(404).json({
      success: false,
      error: 'החדר לא נמצא'
    });
  }

  // Calculate date range based on period
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  // Get assignments in the period
  const assignments = await db('assignments')
    .where({ room_id: id, status: 'active' })
    .where('start_date', '<=', now)
    .where(function() {
      this.whereNull('end_date').orWhere('end_date', '>=', startDate);
    });

  // Calculate statistics
  const totalUsage = assignments.length;
  const uniqueDays = new Set(assignments.map(a => a.start_date.toDateString())).size;
  const utilizationRate = uniqueDays > 0 ? (totalUsage / uniqueDays) * 100 : 0;

  res.json({
    success: true,
    data: {
      room,
      stats: {
        totalUsage,
        uniqueDays,
        utilizationRate: Math.round(utilizationRate),
        period
      }
    }
  });
}));

// Get rooms by type
router.get('/type/:roomType', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { roomType } = req.params;

  const rooms = await db('rooms')
    .where({ room_type: roomType, is_active: true })
    .orderBy('room_number', 'asc');

  res.json({
    success: true,
    data: { rooms }
  });
}));

// Get available grades for homeroom assignment
router.get('/grades', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const grades = await db('grades').orderBy('name', 'asc');
  
  res.json({
    success: true,
    data: { grades }
  });
}));

// Search rooms
router.get('/search', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { 
    capacity, 
    hasProjector, 
    roomType, 
    wing, 
    floor,
    isSmall 
  } = req.query;

  let query = db('rooms').where({ is_active: true });

  if (capacity) {
    query = query.where('capacity', '>=', parseInt(capacity as string));
  }

  if (hasProjector !== undefined) {
    query = query.where('has_projector', hasProjector === 'true');
  }

  if (roomType) {
    query = query.where('room_type', roomType);
  }

  if (wing) {
    query = query.where('wing', wing);
  }

  if (floor) {
    query = query.where('floor', parseInt(floor as string));
  }

  if (isSmall !== undefined) {
    query = query.where('is_small', isSmall === 'true');
  }

  const rooms = await query.orderBy('room_number', 'asc');

  res.json({
    success: true,
    data: { rooms }
  });
}));

export default router;

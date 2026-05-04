import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { scheduleRoomRequest } from '../../domain/scheduling/roomRequestScheduler';
import {
  DEFAULT_HOMEROOM_END_TIME,
  DEFAULT_HOMEROOM_START_TIME,
  fetchHomeroomDefaultSettings,
  resolveHomeroomDefaultHours
} from '../../utils/homeroomDefaults';

const router = Router();

class RoomRequestConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomRequestConflictError';
  }
}

const mapActivityToAssignableType = (activityType?: string | null): string => {
  switch ((activityType || '').trim().toLowerCase()) {
    case 'didactics':
      return 'didactics';
    case 'exam_makeup':
      return 'exam_makeup';
    case 'study_group':
    case 'discussion':
    case 'topics':
      return 'study_group';
    case 'one_on_one':
    case 'meeting':
    case 'party':
      return 'meeting';
    default:
      return 'event';
  }
};

const buildRequestNotes = (payload: {
  selectedRoomLocation?: string;
  selectedRoomReasons?: string[];
  alerts?: string[];
  alternatives?: Array<{ roomNumber: string; location: string; reasons: string[] }>;
}): string => {
  const sections: string[] = [];

  if (payload.selectedRoomLocation) {
    sections.push(`מיקום החדר: ${payload.selectedRoomLocation}`);
  }

  if (payload.selectedRoomReasons && payload.selectedRoomReasons.length > 0) {
    sections.push(`נימוקי הבחירה: ${payload.selectedRoomReasons.join(' | ')}`);
  }

  if (payload.alerts && payload.alerts.length > 0) {
    sections.push(`התראות: ${payload.alerts.join(' | ')}`);
  }

  if (payload.alternatives && payload.alternatives.length > 0) {
    sections.push(
      `חלופות אפשריות: ${payload.alternatives
        .map((alternative) => `${alternative.roomNumber} (${alternative.location})${alternative.reasons.length ? ` - ${alternative.reasons.join(', ')}` : ''}`)
        .join(' | ')}`
    );
  }

  return sections.join('\n');
};

const ensureHomeroomAssignmentsForDate = async (date: string, createdBy: string): Promise<void> => {
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  if (dayOfWeek === 6) {
    return;
  }

  const homeroomRooms = await db('rooms as r')
    .leftJoin('homerooms as h', function joinHomerooms() {
      this.on('h.room_id', '=', 'r.id').andOnVal('h.is_active', '=', true);
    })
    .select('r.id as room_id', 'r.room_number', 'r.room_type', 'h.id as homeroom_id', 'h.grade_id')
    .where('r.is_active', true)
    .whereRaw(`r.room_type::text like 'CLASSROOM_%'`);

  const homeroomIds = homeroomRooms
    .map((room) => Number(room.homeroom_id))
    .filter((homeroomId) => Number.isInteger(homeroomId));

  const gradeIds = homeroomRooms
    .map((room) => room.grade_id)
    .filter((gradeId): gradeId is string => typeof gradeId === 'string' && gradeId.trim() !== '');

  const homeroomSettings = await fetchHomeroomDefaultSettings(db, {
    homeroomIds,
    gradeIds
  });

  for (const homeroomRoom of homeroomRooms) {
    const assignableId = homeroomRoom.homeroom_id
      ? String(homeroomRoom.homeroom_id)
      : `room-${homeroomRoom.room_id}`;

    const existingAssignment = await db('assignments')
      .where({
        assignable_type: 'homeroom',
        room_id: homeroomRoom.room_id,
        date,
      })
      .whereIn('status', ['active', 'scheduled'])
      .first();

    if (existingAssignment) {
      continue;
    }

    const resolvedHours = homeroomRoom.homeroom_id
      ? resolveHomeroomDefaultHours({
          homeroomId: Number(homeroomRoom.homeroom_id),
          gradeId: typeof homeroomRoom.grade_id === 'string' ? homeroomRoom.grade_id : null,
          date,
          settings: homeroomSettings
        })
      : {
          start_time: DEFAULT_HOMEROOM_START_TIME,
          end_time: DEFAULT_HOMEROOM_END_TIME,
          is_active: true,
          source: 'system' as const,
          setting_id: null
        };

    if (!resolvedHours.is_active || !resolvedHours.start_time || !resolvedHours.end_time) {
      continue;
    }

    await db('assignments').insert({
      type: 'one_time',
      assignable_type: 'homeroom',
      assignable_id: assignableId,
      room_id: homeroomRoom.room_id,
      start_date: date,
      end_date: date,
      week_count: 1,
      specific_date: date,
      days_of_week: JSON.stringify([dayOfWeek]),
      time_slots: JSON.stringify([{ start: resolvedHours.start_time, end: resolvedHours.end_time }]),
      activity_type: 'homeroom',
      created_by: createdBy,
      is_manual: false,
      status: 'active',
      conflicts_with: JSON.stringify([]),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      date,
      start_time: resolvedHours.start_time,
      end_time: resolvedHours.end_time
    });
  }
};

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

  if (req.user!.role === 'general_user') {
    query = query.where('room_requests.requester_id', req.user!.id);
  }

  const requests = await query;

  res.json({
    success: true,
    data: { requests }
  });
}));

router.post('/', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    activity_type,
    grade,
    student_count,
    date,
    start_time,
    end_time,
    needs_projector = false,
    requested_room_id
  } = req.body;

  try {
    if (!activity_type || !student_count || !date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error: 'חסרים פרטי חובה לבקשת החדר.'
      });
    }

    await ensureHomeroomAssignmentsForDate(date, req.user!.id);

    const rooms = await db('rooms')
      .select(
        'id',
        'room_number',
        'capacity',
        'room_type',
        'status',
        'has_projector',
        'is_active',
        'priority',
        'notes',
        'grade_level'
      )
      .where('is_active', true);

    const homerooms = await db('homerooms as h')
      .leftJoin('grades as g', 'h.grade_id', 'g.id')
      .select('h.room_id', 'g.name as grade_name', 'h.class_number')
      .where('h.is_active', true);

    const assignments = await db('assignments as a')
      .joinRaw('left join rooms as r on a.room_id::text = r.id')
      .select(
        'a.id',
        'a.room_id',
        'a.assignable_type',
        'a.assignable_id',
        'a.activity_type',
        'a.date',
        'a.start_time',
        'a.end_time',
        'a.status',
        'r.room_number',
        'r.room_type',
        'r.capacity',
        'r.has_projector',
        'r.priority',
        'r.notes'
      )
      .whereIn('a.status', ['active', 'scheduled'])
      .whereNotNull('a.date');

    const requestPayload = {
      activity_type,
      grade,
      student_count: Number(student_count),
      date,
      start_time,
      end_time,
      needs_projector: Boolean(needs_projector),
      requested_room_id: requested_room_id || null,
    };

    const initialSchedulingResult = scheduleRoomRequest(
      requestPayload,
      rooms,
      homerooms,
      assignments
    );

    if (!initialSchedulingResult.success || !initialSchedulingResult.selectedRoom) {
      return res.status(409).json({
        success: false,
        error: initialSchedulingResult.errors[0] || 'לא נמצא חדר מתאים לבקשה.',
        alerts: initialSchedulingResult.alerts,
        alternatives: initialSchedulingResult.alternatives
      });
    }

    const now = new Date().toISOString();
    let finalRoom = initialSchedulingResult.selectedRoom;
    let finalLocation = initialSchedulingResult.selectedRoomLocation;
    let finalExplanation = [...(initialSchedulingResult.selectedRoomReasons || [])];
    let finalAlerts = [...(initialSchedulingResult.alerts || [])];
    let finalRelocatedAssignments = [...initialSchedulingResult.relocatedAssignments];
    let finalAlternatives = [...(initialSchedulingResult.alternatives || [])];

    let assignment: any = null;
    let roomRequest: any = null;

    await db.transaction(async (trx) => {
      const excludedRoomIds = new Set<string>();
      let chosenSchedulingResult = initialSchedulingResult;
      let occupancyRetryCount = 0;

      while (true) {
        const candidateRoom = chosenSchedulingResult.selectedRoom;
        if (!candidateRoom) {
          throw new RoomRequestConflictError(
            'לא נמצא חדר פנוי לשמירה לאחר בדיקת כל החלופות הזמינות. מומלץ לנסות שעה אחרת או לבדוק ידנית חדר פנוי.'
          );
        }

        const blockingAssignment = await trx('assignments')
          .where({
            room_id: candidateRoom.id,
            date,
          })
          .whereIn('status', ['active', 'scheduled'])
          .where(function overlapCheck() {
            this.where('start_time', '<', end_time).andWhere('end_time', '>', start_time);
          })
          .first();

        if (!blockingAssignment) {
          break;
        }

        excludedRoomIds.add(String(candidateRoom.id));
        occupancyRetryCount += 1;

        const filteredRooms = rooms.filter((room) => !excludedRoomIds.has(String(room.id)));
        chosenSchedulingResult = scheduleRoomRequest(
          requestPayload,
          filteredRooms,
          homerooms,
          assignments
        );

        if (!chosenSchedulingResult.success || !chosenSchedulingResult.selectedRoom) {
          throw new RoomRequestConflictError(
            'לא נמצא חדר פנוי לשמירה לאחר בדיקת כל החלופות הזמינות. מומלץ לנסות שעה אחרת או לבדוק ידנית חדר פנוי.'
          );
        }
      }

      const chosenRoom = chosenSchedulingResult.selectedRoom;
      if (!chosenRoom) {
        throw new RoomRequestConflictError(
          'לא נמצא חדר פנוי לשמירה לאחר בדיקת כל החלופות הזמינות. מומלץ לנסות שעה אחרת או לבדוק ידנית חדר פנוי.'
        );
      }

      finalRoom = chosenRoom;
      finalLocation = chosenSchedulingResult.selectedRoomLocation;
      finalExplanation = [...(chosenSchedulingResult.selectedRoomReasons || [])];
      finalRelocatedAssignments = [...chosenSchedulingResult.relocatedAssignments];
      finalAlternatives = [...(chosenSchedulingResult.alternatives || [])];
      finalAlerts = [...(chosenSchedulingResult.alerts || [])];

      if (occupancyRetryCount > 0) {
        finalAlerts.push(`החדר הראשוני כבר לא היה פנוי, ולכן בוצע מעבר אוטומטי לחדר חלופי: ${finalRoom.room_number}.`);
      }

      for (const relocatedAssignment of finalRelocatedAssignments) {
        await trx('assignments')
          .where({ id: relocatedAssignment.assignmentId })
          .update({
            room_id: relocatedAssignment.newRoomId,
            override_reason: relocatedAssignment.explanation,
            updated_at: now
          });
      }

      const requestNotes = buildRequestNotes({
        selectedRoomLocation: finalLocation,
        selectedRoomReasons: finalExplanation,
        alerts: finalAlerts,
        alternatives: finalAlternatives
      });

      const [createdRequest] = await trx('room_requests')
        .insert({
          requester_id: req.user!.id,
          requested_room_id: requested_room_id || null,
          activity_type,
          grade,
          student_count,
          date,
          start_time,
          end_time,
          special_requirements: JSON.stringify({ needs_projector: Boolean(needs_projector) }),
          status: 'approved',
          approved_room_id: finalRoom.id,
          notes: requestNotes,
          created_at: now,
          updated_at: now
        })
        .returning('*');

      roomRequest = createdRequest;

      const [createdAssignment] = await trx('assignments')
        .insert({
          type: 'one_time',
          assignable_type: mapActivityToAssignableType(activity_type),
          assignable_id: String(createdRequest.id),
          room_id: finalRoom.id,
          start_date: date,
          end_date: date,
          week_count: 1,
          specific_date: date,
          days_of_week: JSON.stringify([]),
          time_slots: JSON.stringify([{ start: start_time, end: end_time }]),
          activity_type,
          created_by: req.user!.id,
          is_manual: true,
          override_reason: requestNotes || null,
          status: 'active',
          conflicts_with: JSON.stringify(
            finalRelocatedAssignments.map((item) => ({
              assignment_id: item.assignmentId,
              previous_room_id: item.previousRoomId,
              new_room_id: item.newRoomId
            }))
          ),
          created_at: now,
          updated_at: now,
          date,
          start_time,
          end_time
        })
        .returning('*');

      assignment = createdAssignment;
    });

    res.status(201).json({
      success: true,
      data: {
        assignment,
        request: roomRequest,
        room: finalRoom,
        location: finalLocation,
        explanation: finalExplanation,
        alerts: finalAlerts,
        alternatives: finalAlternatives,
        relocated_assignments: finalRelocatedAssignments,
        message: `השיבוץ הצליח. החדר שנבחר הוא ${finalRoom.room_number}.`
      }
    });
  } catch (error: any) {
    console.error('Error creating room request:', error);
    console.error('Request data:', req.body);

    if (error instanceof RoomRequestConflictError) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    if (error?.code === '23505' && error?.constraint === 'assignments_no_double_booking') {
      return res.status(409).json({
        success: false,
        error: 'החדר כבר תפוס בזמן שביקשת. נסו שוב כדי שהמערכת תציע חדר חלופי.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'אירעה שגיאה ביצירת בקשת החדר.',
      details: error.message
    });
  }
}));

router.put('/:id', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status, approved_room_id, notes } = req.body;

  const existingRequest = await db('room_requests').where({ id }).first();
  if (!existingRequest) {
    return res.status(404).json({
      success: false,
      error: 'Room request not found'
    });
  }

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

router.delete('/:id', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const existingRequest = await db('room_requests').where({ id }).first();
  if (!existingRequest) {
    return res.status(404).json({
      success: false,
      error: 'Room request not found'
    });
  }

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

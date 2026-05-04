import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { evaluateRoomRequestCandidates, scheduleRoomRequest } from '../../domain/scheduling/roomRequestScheduler';
import { randomUUID } from 'crypto';
import { v5 as uuidv5 } from 'uuid';
import {
  DEFAULT_HOMEROOM_END_TIME,
  DEFAULT_HOMEROOM_START_TIME,
  fetchHomeroomDefaultSettings,
  resolveHomeroomDefaultHours
} from '../../utils/homeroomDefaults';
import {
  applyAuditoriumDefaultSettingsToAssignments,
  buildAuditoriumTimeSlots,
  buildAuditoriumWeeklySchedule,
  fetchAuditoriumDefaultSettings,
  saveAuditoriumOverrideSetting
} from '../../utils/auditoriumDefaults';
import { mapActivityTypeToAssignableType } from '../../utils/activityTypeMapping';
import { loadRoomPrioritySettings } from '../../utils/roomPreferenceSettings';

const router = Router();
const HIGH_SCHOOL_PE_ACTIVITY_TYPE = 'high_school_pe';
const HIGH_SCHOOL_PE_TITLE = 'התעמלות תיכון';

class RoomRequestConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomRequestConflictError';
  }
}

const USER_ID_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

const isUuid = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const toActorUuid = (value: unknown, fallback: unknown): string => {
  if (isUuid(value)) {
    return value as string;
  }

  const source = String(value || fallback || '').trim();
  return uuidv5(source || 'system-user', USER_ID_NAMESPACE);
};

const resolveActorId = async (req: AuthenticatedRequest): Promise<string> => {
  if (isUuid(req.user?.id)) {
    return req.user!.id;
  }

  if (req.user?.email) {
    const dbUser = await db('users')
      .where({ email: req.user.email, is_active: true })
      .first();

    if (dbUser?.id) {
      return toActorUuid(dbUser.id, dbUser.email);
    }
  }

  if (req.user?.role) {
    const roleCandidates =
      req.user.role === 'study_groups_coordinator'
        ? ['study_groups_coordinator', 'group_coordinator']
        : [req.user.role];

    const dbUserByRole = await db('users')
      .whereIn('role', roleCandidates)
      .andWhere({ is_active: true })
      .orderBy('created_at', 'asc')
      .first();

    if (dbUserByRole?.id) {
      return toActorUuid(dbUserByRole.id, dbUserByRole.email);
    }
  }

  const fallbackUser = await db('users')
    .where({ is_active: true })
    .orderBy('created_at', 'asc')
    .first();

  if (fallbackUser?.id) {
    return toActorUuid(fallbackUser.id, fallbackUser.email);
  }

  return toActorUuid(req.user?.id, req.user?.email);
};

const isTransientDbConnectionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();

  return normalized.includes('connection terminated unexpectedly')
    || normalized.includes('connection ended unexpectedly')
    || normalized.includes('read econnreset')
    || normalized.includes('socket hang up')
    || normalized.includes('terminating connection due to administrator command');
};

const withDbRetry = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientDbConnectionError(error)) {
      throw error;
    }

    console.warn(`[roomRequests] transient DB error during ${label}, retrying once`, error);
    return operation();
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

const isBlockingAssignmentAlreadyRelocated = (
  blockingAssignment: { id?: string | number | null },
  relocatedAssignments: Array<{ assignmentId: string | number }>
): boolean =>
  relocatedAssignments.some(
    (relocatedAssignment) => String(relocatedAssignment.assignmentId) === String(blockingAssignment.id)
  );

type WeeklyScheduleEntry = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type RecurringOccurrence = WeeklyScheduleEntry & {
  date: string;
};

const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const normalizeDateOnly = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDateKey(value);
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const normalized = value.includes('T') ? value.split('T')[0] : value;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
};

const getTodayDateOnly = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const getSchoolYearEndForDate = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00`);
  const year = parsed.getMonth() >= 8 ? parsed.getFullYear() + 1 : parsed.getFullYear();
  return `${year}-06-30`;
};

const isHighSchoolPeActivity = (activityType?: string | null): boolean =>
  (activityType || '').trim().toLowerCase() === HIGH_SCHOOL_PE_ACTIVITY_TYPE;

const normalizeRoomTypeUpper = (roomType?: string | null): string =>
  String(roomType || '').trim().toUpperCase();

const normalizeText = (value?: string | null): string =>
  String(value || '').trim().toLowerCase();

const normalizeRoomRequestActivityType = (value?: string | null): string => {
  const normalized = normalizeText(value);

  if (normalized === 'didactics' || normalized === 'didactic') {
    return 'didactics';
  }

  return normalized;
};

const classifySpecialRoomType = (room: { room_type?: string | null; notes?: string | null; room_number?: string | null }) => {
  const roomType = normalizeText(room.room_type);
  const notes = normalizeText(room.notes);
  const roomNumber = normalizeText(room.room_number);

  if (roomType.includes('auditorium') || notes.includes('אולם') || roomNumber.includes('אולם')) {
    return 'AUDITORIUM';
  }

  if (roomType.includes('library') || notes.includes('ספר') || roomNumber.includes('ספר')) {
    return 'LIBRARY';
  }

  return normalizeRoomTypeUpper(room.room_type);
};

const hasRoomConflictForOccurrence = (
  assignments: Array<{ room_id: string | number; date?: string | Date | null; start_time: string; end_time: string; status?: string | null }>,
  roomId: string | number,
  occurrence: { date: string; start_time: string; end_time: string }
) =>
  assignments.some((assignment) =>
    String(assignment.room_id) === String(roomId) &&
    normalizeDateOnly(assignment.date) === occurrence.date &&
    ['active', 'scheduled'].includes(String(assignment.status || 'active')) &&
    assignment.start_time < occurrence.end_time &&
    occurrence.start_time < assignment.end_time
  );

const isValidTimeValue = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);

const normalizeWeeklyScheduleInput = (weeklySchedule: unknown): WeeklyScheduleEntry[] => {
  if (!Array.isArray(weeklySchedule)) {
    return [];
  }

  return weeklySchedule
    .map((entry) => ({
      day_of_week: Number((entry as any)?.day_of_week),
      start_time: (entry as any)?.start_time,
      end_time: (entry as any)?.end_time,
    }))
    .filter((entry) =>
      Number.isInteger(entry.day_of_week) &&
      entry.day_of_week >= 0 &&
      entry.day_of_week <= 6 &&
      isValidTimeValue(entry.start_time) &&
      isValidTimeValue(entry.end_time) &&
      entry.start_time < entry.end_time
    )
    .sort((left, right) => left.day_of_week - right.day_of_week || left.start_time.localeCompare(right.start_time));
};

const expandRecurringOccurrences = (
  startDate: string,
  endDate: string,
  weeklySchedule: WeeklyScheduleEntry[]
): RecurringOccurrence[] => {
  const occurrences: RecurringOccurrence[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const limit = new Date(`${endDate}T00:00:00`);

  while (cursor <= limit) {
    const dayOfWeek = cursor.getDay();
    const date = toDateKey(cursor);

    weeklySchedule
      .filter((entry) => entry.day_of_week === dayOfWeek)
      .forEach((entry) => {
        occurrences.push({
          ...entry,
          date,
        });
      });

    cursor.setDate(cursor.getDate() + 1);
  }

  return occurrences.sort((left, right) => left.date.localeCompare(right.date) || left.start_time.localeCompare(right.start_time));
};

const upsertWorkingAssignmentRoom = (
  assignments: any[],
  assignmentId: string | number,
  roomId: string | number,
  roomNumber?: string
) => {
  const existingAssignment = assignments.find((assignment) => String(assignment.id) === String(assignmentId));
  if (!existingAssignment) {
    return;
  }

  existingAssignment.room_id = roomId;
  if (roomNumber) {
    existingAssignment.room_number = roomNumber;
  }
};

const ensureHomeroomAssignmentsForDate = async (date: string, createdBy: string): Promise<void> =>
  withDbRetry(`ensure homeroom assignments for ${date}`, async () => {
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
  });

router.get('/', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, requesterId } = req.query;
  const actorId = await resolveActorId(req);

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
    query = query.where('room_requests.requester_id', actorId);
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

    const actorId = await resolveActorId(req);

    await ensureHomeroomAssignmentsForDate(date, actorId);

    const [rooms, homerooms, assignments, roomPrioritySettings] = await withDbRetry(
      `load room request data for ${date}`,
      async () => Promise.all([
        db('rooms')
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
          .where('is_active', true)
          .whereRaw(`UPPER(CAST(room_type AS TEXT)) <> 'AUDITORIUM'`),
        db('homerooms as h')
          .leftJoin('grades as g', 'h.grade_id', 'g.id')
          .select('h.room_id', 'g.name as grade_name', 'h.class_number')
          .where('h.is_active', true),
        db('assignments as a')
          .joinRaw('left join rooms as r on a.room_id::text = r.id')
          .joinRaw('left join room_requests as rr on rr.id::text = a.assignable_id::text')
          .select(
            'a.id',
            'a.room_id',
            'a.assignable_type',
            'a.assignable_id',
            'a.activity_type',
            'rr.student_count',
            'rr.special_requirements',
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
          .whereNotNull('a.date'),
        loadRoomPrioritySettings(db)
      ])
    );

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
      assignments,
      roomPrioritySettings
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

        if (
          !blockingAssignment
          || isBlockingAssignmentAlreadyRelocated(
            blockingAssignment,
            chosenSchedulingResult.relocatedAssignments
          )
        ) {
          break;
        }

        excludedRoomIds.add(String(candidateRoom.id));
        occupancyRetryCount += 1;

        const filteredRooms = rooms.filter((room) => !excludedRoomIds.has(String(room.id)));
        chosenSchedulingResult = scheduleRoomRequest(
          requestPayload,
          filteredRooms,
          homerooms,
          assignments,
          roomPrioritySettings
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
          requester_id: actorId,
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
          assignable_type: mapActivityTypeToAssignableType(activity_type),
          assignable_id: String(createdRequest.id),
          room_id: finalRoom.id,
          start_date: date,
          end_date: date,
          week_count: 1,
          specific_date: date,
          days_of_week: JSON.stringify([]),
          time_slots: JSON.stringify([{ start: start_time, end: end_time }]),
          activity_type,
          created_by: actorId,
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

router.post('/groups', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    group_name,
    activity_type,
    grade,
    student_count,
    start_date,
    end_date,
    weekly_schedule,
    needs_projector = false,
    requested_room_id
  } = req.body ?? {};

  const normalizedStartDate = normalizeDateOnly(start_date);
  const normalizedEndDate = normalizeDateOnly(end_date);
  const normalizedWeeklySchedule = normalizeWeeklyScheduleInput(weekly_schedule);
  const normalizedStudentCount = Number(student_count);
  const normalizedActivityType = normalizeRoomRequestActivityType(activity_type);
  const isHighSchoolPe = isHighSchoolPeActivity(activity_type);
  const preferBestCandidatePerOccurrence = normalizedActivityType === 'didactics';
  const requestedStartDate = normalizedStartDate;
  const requestedEndDate = normalizedEndDate;
  const effectiveStartDate = isHighSchoolPe ? getTodayDateOnly() : normalizedStartDate;
  const effectiveEndDate = isHighSchoolPe
    ? (effectiveStartDate ? getSchoolYearEndForDate(effectiveStartDate) : null)
    : normalizedEndDate;

  if (
    !activity_type ||
    !effectiveStartDate ||
    !effectiveEndDate ||
    !Number.isFinite(normalizedStudentCount) ||
    normalizedStudentCount < 1 ||
    normalizedWeeklySchedule.length === 0
  ) {
    return res.status(400).json({
      success: false,
      error: 'activity_type, student_count, start_date, end_date and weekly_schedule are required'
    });
  }

  if (effectiveStartDate > effectiveEndDate) {
    return res.status(400).json({
      success: false,
      error: 'start_date must be earlier than or equal to end_date'
    });
  }

  const occurrences = expandRecurringOccurrences(
    effectiveStartDate,
    effectiveEndDate,
    normalizedWeeklySchedule
  );

  if (occurrences.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'לא נמצאו מופעי שיבוץ בטווח ובימי השבוע שנבחרו'
    });
  }

  const actorId = await resolveActorId(req);

  for (const occurrence of occurrences) {
    await ensureHomeroomAssignmentsForDate(occurrence.date, actorId);
  }

  const [rooms, homerooms, assignments, roomPrioritySettings] = await withDbRetry(
    `load recurring room request data for ${effectiveStartDate}`,
    async () => Promise.all([
      db('rooms')
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
        .where('is_active', true)
        .modify((queryBuilder) => {
          if (!isHighSchoolPe) {
            queryBuilder.whereRaw(`UPPER(CAST(room_type AS TEXT)) <> 'AUDITORIUM'`);
          }
        }),
      db('homerooms as h')
        .leftJoin('grades as g', 'h.grade_id', 'g.id')
        .select('h.room_id', 'g.name as grade_name', 'h.class_number')
        .where('h.is_active', true),
      db('assignments as a')
        .joinRaw('left join rooms as r on a.room_id::text = r.id')
        .joinRaw('left join room_requests as rr on rr.id::text = a.assignable_id::text')
        .select(
          'a.id',
          'a.room_id',
          'a.assignable_type',
          'a.assignable_id',
          'a.activity_type',
          'rr.student_count',
          'rr.special_requirements',
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
        .whereIn('a.date', Array.from(new Set(occurrences.map((occurrence) => occurrence.date)))),
      loadRoomPrioritySettings(db)
    ])
  );

  const roomUsage = new Map<string, { count: number; totalScore: number; room: any; location: string }>();
  let fixedHighSchoolPeRoom: any | null = null;

  if (isHighSchoolPe) {
    const eligibleHighSchoolPeRooms = rooms
      .filter((room: any) => {
        const roomType = classifySpecialRoomType(room);
        if (roomType !== 'AUDITORIUM' && roomType !== 'LIBRARY') {
          return false;
        }

        if (Number(room.capacity || 0) < normalizedStudentCount) {
          return false;
        }

        if (needs_projector && !room.has_projector) {
          return false;
        }

        return true;
      })
      .sort((left: any, right: any) => {
        const leftType = classifySpecialRoomType(left);
        const rightType = classifySpecialRoomType(right);
        const leftPriority = leftType === 'AUDITORIUM' ? 0 : 1;
        const rightPriority = rightType === 'AUDITORIUM' ? 0 : 1;
        return leftPriority - rightPriority || String(left.room_number).localeCompare(String(right.room_number));
      });

    fixedHighSchoolPeRoom = eligibleHighSchoolPeRooms.find((room: any) =>
      occurrences.every((occurrence) => !hasRoomConflictForOccurrence(assignments as any, room.id, occurrence))
    ) ?? null;

    if (!fixedHighSchoolPeRoom) {
      return res.status(409).json({
        success: false,
        error: 'לא נמצא אולם פנוי לכל המופעים, וגם לא ספרייה פנויה לכל המופעים עד סוף שנת הלימודים'
      });
    }
  } else {
    occurrences.forEach((occurrence) => {
      const candidates = evaluateRoomRequestCandidates(
        {
          activity_type,
          grade,
          student_count: normalizedStudentCount,
          date: occurrence.date,
          start_time: occurrence.start_time,
          end_time: occurrence.end_time,
          needs_projector: Boolean(needs_projector),
          requested_room_id: requested_room_id || null,
        },
        rooms,
        homerooms,
        assignments,
        roomPrioritySettings
      );

      candidates.forEach((candidate) => {
        const key = String(candidate.room.id);
        const current = roomUsage.get(key);
        if (current) {
          current.count += 1;
          current.totalScore += candidate.score;
          return;
        }

        roomUsage.set(key, {
          count: 1,
          totalScore: candidate.score,
          room: candidate.room,
          location: candidate.roomLocation
        });
      });
    });
  }

  const preferredRoomRanking = Array.from(roomUsage.values())
    .sort((left, right) => right.count - left.count || left.totalScore - right.totalScore)
    .map((entry) => String(entry.room.id));

  const fixedHighSchoolPeRoomId = fixedHighSchoolPeRoom ? String(fixedHighSchoolPeRoom.id) : null;

  const createdAssignments: any[] = [];
  const createdRequests: any[] = [];
  const scheduledOccurrences: any[] = [];

  try {
    await db.transaction(async (trx) => {
      const currentAssignments = await trx('assignments as a')
        .joinRaw('left join rooms as r on a.room_id::text = r.id')
        .joinRaw('left join room_requests as rr on rr.id::text = a.assignable_id::text')
        .select(
          'a.id',
          'a.room_id',
          'a.assignable_type',
          'a.assignable_id',
          'a.activity_type',
          'rr.student_count',
          'rr.special_requirements',
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
        .whereIn('a.date', Array.from(new Set(occurrences.map((occurrence) => occurrence.date))));

      const workingAssignments = [...currentAssignments];
      const now = new Date().toISOString();
      const auditoriumDefaultOccurrences: Array<{ date: string; start_time: string; end_time: string; room_id: string | number; room_number: string; room_location: string; request_id: string | number; explanation: string[]; alerts: string[]; relocated_assignments: any[] }> = [];

      for (const occurrence of occurrences) {
        const requestPayload = {
          activity_type,
          grade,
          student_count: normalizedStudentCount,
          date: occurrence.date,
          start_time: occurrence.start_time,
          end_time: occurrence.end_time,
          needs_projector: Boolean(needs_projector),
          requested_room_id: requested_room_id || null,
        };

        const excludedRoomIds = new Set<string>();
        let candidates = evaluateRoomRequestCandidates(
          requestPayload,
          rooms,
          homerooms,
          workingAssignments,
          roomPrioritySettings
        );
        const selectRecurringCandidate = (availableCandidates: typeof candidates, availableRooms: any[]) =>
          (isHighSchoolPe && fixedHighSchoolPeRoomId
            ? (() => {
                const selectedRoom = availableRooms.find((room: any) => String(room.id) === fixedHighSchoolPeRoomId);
                return selectedRoom
                  ? {
                      room: selectedRoom,
                      roomLocation: 'שובץ לפי מסלול התעמלות תיכון',
                      reasons: [
                        classifySpecialRoomType(selectedRoom) === 'AUDITORIUM'
                          ? 'האולם פנוי לכל המופעים המבוקשים'
                          : 'הספרייה פנויה לכל המופעים המבוקשים'
                      ],
                      alerts: [],
                      relocatedAssignments: []
                    }
                  : undefined;
              })()
            : preferBestCandidatePerOccurrence
              ? availableCandidates[0]
              : preferredRoomRanking
                  .map((preferredRoomId) => availableCandidates.find((candidate) => String(candidate.room.id) === preferredRoomId))
                  .find(Boolean) ||
                availableCandidates[0]);
        let selectedCandidate =
          (isHighSchoolPe && fixedHighSchoolPeRoomId
            ? (() => {
                const selectedRoom = rooms.find((room: any) => String(room.id) === fixedHighSchoolPeRoomId);
                return selectedRoom
                  ? {
                      room: selectedRoom,
                      roomLocation: 'שובץ לפי מסלול התעמלות תיכון',
                      reasons: [
                        classifySpecialRoomType(selectedRoom) === 'AUDITORIUM'
                          ? 'האולם פנוי לכל המופעים המבוקשים'
                          : 'הספרייה פנויה לכל המופעים המבוקשים'
                      ],
                      alerts: [],
                      relocatedAssignments: []
                    }
                  : undefined;
              })()
            : preferredRoomRanking
            .map((preferredRoomId) => candidates.find((candidate) => String(candidate.room.id) === preferredRoomId))
            .find(Boolean) ||
          candidates[0]);
        selectedCandidate = selectRecurringCandidate(candidates, rooms);

        while (selectedCandidate) {
          const blockingAssignment = await trx('assignments')
            .where({
              room_id: selectedCandidate.room.id,
              date: occurrence.date,
            })
            .whereIn('status', ['active', 'scheduled'])
            .where(function overlapCheck() {
              this.where('start_time', '<', occurrence.end_time).andWhere('end_time', '>', occurrence.start_time);
            })
            .first();

          if (
            !blockingAssignment
            || isBlockingAssignmentAlreadyRelocated(
              blockingAssignment,
              selectedCandidate.relocatedAssignments
            )
          ) {
            break;
          }

          excludedRoomIds.add(String(selectedCandidate.room.id));
          const filteredRooms = rooms.filter((room: any) => !excludedRoomIds.has(String(room.id)));
          candidates = evaluateRoomRequestCandidates(
            requestPayload,
            filteredRooms,
            homerooms,
            workingAssignments,
            roomPrioritySettings
          );
          selectedCandidate =
            (isHighSchoolPe && fixedHighSchoolPeRoomId
              ? (() => {
                  const selectedRoom = filteredRooms.find((room: any) => String(room.id) === fixedHighSchoolPeRoomId);
                  return selectedRoom
                    ? {
                        room: selectedRoom,
                        roomLocation: 'שובץ לפי מסלול התעמלות תיכון',
                        reasons: [
                          classifySpecialRoomType(selectedRoom) === 'AUDITORIUM'
                            ? 'האולם פנוי לכל המופעים המבוקשים'
                            : 'הספרייה פנויה לכל המופעים המבוקשים'
                        ],
                        alerts: [],
                        relocatedAssignments: []
                      }
                    : undefined;
                })()
              : preferredRoomRanking
              .map((preferredRoomId) => candidates.find((candidate) => String(candidate.room.id) === preferredRoomId))
              .find(Boolean) ||
              candidates[0]);
          selectedCandidate = selectRecurringCandidate(candidates, filteredRooms);
        }

        if (!selectedCandidate) {
          throw new RoomRequestConflictError(
            `לא נמצא חדר פנוי עבור ${occurrence.date} בשעות ${occurrence.start_time}-${occurrence.end_time}`
          );
        }

        for (const relocatedAssignment of selectedCandidate.relocatedAssignments) {
          await trx('assignments')
            .where({ id: relocatedAssignment.assignmentId })
            .update({
              room_id: relocatedAssignment.newRoomId,
              override_reason: relocatedAssignment.explanation,
              updated_at: now
            });

          upsertWorkingAssignmentRoom(
            workingAssignments,
            relocatedAssignment.assignmentId,
            relocatedAssignment.newRoomId,
            relocatedAssignment.newRoomNumber
          );
        }

        const requestNotes = buildRequestNotes({
          selectedRoomLocation: selectedCandidate.roomLocation,
          selectedRoomReasons: selectedCandidate.reasons,
          alerts: selectedCandidate.alerts,
          alternatives: candidates.slice(1, 4).map((candidate) => ({
            roomNumber: candidate.room.room_number,
            location: candidate.roomLocation,
            reasons: candidate.reasons.slice(0, 2)
          }))
        });

        const [createdRequest] = await trx('room_requests')
          .insert({
            requester_id: actorId,
            requested_room_id: requested_room_id || null,
            activity_type,
            grade,
            student_count: normalizedStudentCount,
            date: occurrence.date,
            start_time: occurrence.start_time,
            end_time: occurrence.end_time,
            special_requirements: JSON.stringify({
              needs_projector: Boolean(needs_projector),
              recurring_group_name: group_name || (isHighSchoolPe ? HIGH_SCHOOL_PE_TITLE : null),
              recurring_range: {
                start_date: requestedStartDate ?? effectiveStartDate,
                end_date: requestedEndDate ?? effectiveEndDate
              },
              scheduling_range: {
                start_date: effectiveStartDate,
                end_date: effectiveEndDate
              }
            }),
            status: 'approved',
            approved_room_id: selectedCandidate.room.id,
            notes: requestNotes,
            created_at: now,
            updated_at: now
          })
          .returning('*');

        createdRequests.push(createdRequest);
        if (isHighSchoolPe && normalizeRoomTypeUpper(selectedCandidate.room.room_type) === 'AUDITORIUM') {
          auditoriumDefaultOccurrences.push({
            date: occurrence.date,
            start_time: occurrence.start_time,
            end_time: occurrence.end_time,
            room_id: selectedCandidate.room.id,
            room_number: selectedCandidate.room.room_number,
            room_location: selectedCandidate.roomLocation,
            request_id: createdRequest.id,
            explanation: selectedCandidate.reasons,
            alerts: selectedCandidate.alerts,
            relocated_assignments: selectedCandidate.relocatedAssignments
          });
        } else {
          const [createdAssignment] = await trx('assignments')
            .insert({
              type: 'one_time',
              assignable_type: mapActivityTypeToAssignableType(activity_type),
              assignable_id: String(createdRequest.id),
              room_id: selectedCandidate.room.id,
              start_date: occurrence.date,
              end_date: occurrence.date,
              week_count: 1,
              specific_date: occurrence.date,
              days_of_week: JSON.stringify([]),
              time_slots: JSON.stringify([{ start: occurrence.start_time, end: occurrence.end_time }]),
              activity_type,
              created_by: actorId,
              is_manual: true,
              override_reason: requestNotes || null,
              status: 'active',
              conflicts_with: JSON.stringify(
                selectedCandidate.relocatedAssignments.map((item) => ({
                  assignment_id: item.assignmentId,
                  previous_room_id: item.previousRoomId,
                  new_room_id: item.newRoomId
                }))
              ),
              created_at: now,
              updated_at: now,
              date: occurrence.date,
              start_time: occurrence.start_time,
              end_time: occurrence.end_time
            })
            .returning('*');

          createdAssignments.push(createdAssignment);
          scheduledOccurrences.push({
            date: occurrence.date,
            start_time: occurrence.start_time,
            end_time: occurrence.end_time,
            room_id: selectedCandidate.room.id,
            room_number: selectedCandidate.room.room_number,
            room_location: selectedCandidate.roomLocation,
            request_id: createdRequest.id,
            assignment_id: createdAssignment.id,
            explanation: selectedCandidate.reasons,
            alerts: selectedCandidate.alerts,
            relocated_assignments: selectedCandidate.relocatedAssignments
          });

          workingAssignments.push({
            id: createdAssignment.id,
            room_id: selectedCandidate.room.id,
            assignable_type: mapActivityTypeToAssignableType(activity_type),
            assignable_id: String(createdRequest.id),
            activity_type,
            student_count: normalizedStudentCount,
            special_requirements: JSON.stringify({
              needs_projector: Boolean(needs_projector),
              recurring_group_name: group_name || (isHighSchoolPe ? HIGH_SCHOOL_PE_TITLE : null),
              recurring_range: {
                start_date: requestedStartDate ?? effectiveStartDate,
                end_date: requestedEndDate ?? effectiveEndDate
              },
              scheduling_range: {
                start_date: effectiveStartDate,
                end_date: effectiveEndDate
              }
            }),
            date: occurrence.date,
            start_time: occurrence.start_time,
            end_time: occurrence.end_time,
            status: 'active',
            room_number: selectedCandidate.room.room_number,
            room_type: selectedCandidate.room.room_type,
            capacity: selectedCandidate.room.capacity,
            has_projector: selectedCandidate.room.has_projector,
            priority: selectedCandidate.room.priority,
            notes: selectedCandidate.room.notes
          });
        }
      }

      if (isHighSchoolPe && auditoriumDefaultOccurrences.length > 0) {
        const auditoriumRoomId = String(auditoriumDefaultOccurrences[0].room_id);
        const currentSettings = await fetchAuditoriumDefaultSettings(trx, [auditoriumRoomId]);
        const latestSetting = currentSettings.find((setting) => setting.room_id === auditoriumRoomId) ?? null;
        const weeklySchedule = latestSetting?.weekly_schedule ?? buildAuditoriumWeeklySchedule();
        const byDay = new Map(weeklySchedule.map((slot) => [slot.day_of_week, {
          day_of_week: slot.day_of_week,
          is_active: slot.is_active,
          entries: [...slot.entries]
        }]));
        const selectedChanges: Array<{ day_of_week: number; entry_id: string }> = [];

        normalizedWeeklySchedule.forEach((entry) => {
          const slot = byDay.get(entry.day_of_week) ?? {
            day_of_week: entry.day_of_week,
            is_active: false,
            entries: []
          };
          const existingSameRange = slot.entries.find(
            (existingEntry) =>
              existingEntry.start_time === entry.start_time &&
              existingEntry.end_time === entry.end_time &&
              existingEntry.title === HIGH_SCHOOL_PE_TITLE
          );

          if (!existingSameRange) {
            const entryId = randomUUID();
            slot.entries.push({
              id: entryId,
              start_time: entry.start_time,
              end_time: entry.end_time,
              title: HIGH_SCHOOL_PE_TITLE,
              note: group_name?.trim() || null
            });
            slot.is_active = true;
            slot.entries.sort((left, right) => left.start_time.localeCompare(right.start_time));
            selectedChanges.push({ day_of_week: entry.day_of_week, entry_id: entryId });
          }

          byDay.set(entry.day_of_week, slot);
        });

        if (selectedChanges.length > 0) {
          await saveAuditoriumOverrideSetting(trx, {
            room_id: auditoriumRoomId,
            effective_from: effectiveStartDate,
            weekly_schedule: buildAuditoriumWeeklySchedule().map(
              (baseSlot) => byDay.get(baseSlot.day_of_week) ?? baseSlot
            ),
            updated_by: actorId,
            selected_changes: selectedChanges
          });
        }

        await applyAuditoriumDefaultSettingsToAssignments(trx as any, [auditoriumRoomId], effectiveStartDate, actorId);

        for (const occurrence of auditoriumDefaultOccurrences) {
          let assignment = await trx('assignments')
            .select('id')
            .where({
              room_id: occurrence.room_id,
              date: occurrence.date,
              start_time: occurrence.start_time,
              end_time: occurrence.end_time,
              status: 'active'
            })
            .first();

          if (!assignment) {
            const [createdFallbackAssignment] = await trx('assignments')
              .insert({
                type: 'one_time',
                assignable_type: mapActivityTypeToAssignableType(activity_type),
                assignable_id: String(occurrence.request_id),
                room_id: occurrence.room_id,
                start_date: occurrence.date,
                end_date: occurrence.date,
                week_count: 1,
                specific_date: occurrence.date,
                days_of_week: JSON.stringify([]),
                time_slots: buildAuditoriumTimeSlots({
                  start_time: occurrence.start_time,
                  end_time: occurrence.end_time,
                  title: HIGH_SCHOOL_PE_TITLE,
                  note: group_name?.trim() || null
                }),
                activity_type,
                created_by: actorId,
                is_manual: true,
                override_reason: 'נוצר כהשלמה אוטומטית לאחר שמירת שיבוץ דפולטיבי לאולם',
                status: 'active',
                conflicts_with: JSON.stringify([]),
                created_at: now,
                updated_at: now,
                date: occurrence.date,
                start_time: occurrence.start_time,
                end_time: occurrence.end_time
              })
              .returning('id');

            assignment = createdFallbackAssignment;
          }

          if (assignment) {
            createdAssignments.push(assignment);
          }

          scheduledOccurrences.push({
            ...occurrence,
            assignment_id: assignment?.id ?? occurrence.request_id,
            relocated_assignments: occurrence.relocated_assignments ?? []
          });
        }
      }
    });

    const preferredRoomSummary = preferredRoomRanking.length > 0
      ? roomUsage.get(preferredRoomRanking[0]) ?? null
      : null;

    return res.status(201).json({
      success: true,
      data: {
        group_name: group_name || null,
        requested_window: {
          start_date: requestedStartDate ?? effectiveStartDate,
          end_date: requestedEndDate ?? effectiveEndDate
        },
        scheduling_window: {
          start_date: effectiveStartDate,
          end_date: effectiveEndDate
        },
        preferred_room: preferredRoomSummary
          ? {
              room_id: preferredRoomSummary.room.id,
              room_number: preferredRoomSummary.room.room_number,
              location: preferredRoomSummary.location,
              matched_occurrences: preferredRoomSummary.count
            }
          : null,
        total_occurrences: occurrences.length,
        assignments: scheduledOccurrences,
        requests: createdRequests,
        created_assignment_ids: createdAssignments.map((assignment) => assignment.id),
        message: `השיבוץ התדיר הושלם עבור ${scheduledOccurrences.length} מופעים`
      }
    });
  } catch (error: any) {
    if (error instanceof RoomRequestConflictError) {
      return res.status(409).json({
        success: false,
        error: error.message,
        partial_assignments: []
      });
    }

    if (error?.code === '23505' && error?.constraint === 'assignments_no_double_booking') {
      return res.status(409).json({
        success: false,
        error: 'אחד המופעים נתפס בזמן השמירה. נסו שוב כדי לחשב שיבוץ מחדש.'
      });
    }

    console.error('Error creating recurring room request:', error);
    return res.status(500).json({
      success: false,
      error: 'יצירת השיבוץ התדיר נכשלה',
      details: error?.message
    });
  }
}));

router.put('/:id', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status, approved_room_id, notes } = req.body;
  const actorId = await resolveActorId(req);

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
    updated_by: actorId,
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
  const actorId = await resolveActorId(req);

  const existingRequest = await db('room_requests').where({ id }).first();
  if (!existingRequest) {
    return res.status(404).json({
      success: false,
      error: 'Room request not found'
    });
  }

  if (req.user!.role !== 'admin' && existingRequest.requester_id !== actorId) {
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

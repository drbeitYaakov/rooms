import { Router, Response } from 'express';
import { db } from '../../config/database';
import logger from '../../utils/logger';
import {
  CreateHomeroomData,
  UpdateHomeroomData,
  getHomeroomName
} from '../../domain/models/Homeroom';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';
import {
  appendGradeDefaultSetting,
  appendHomeroomOverrideSetting,
  appendHomeroomSpecialSchedule,
  applyHomeroomDefaultSettingsToAssignments,
  buildUniformWeeklySchedule,
  DEFAULT_HOMEROOM_END_TIME,
  DEFAULT_HOMEROOM_START_TIME,
  fetchHomeroomDefaultSettings,
  formatDateOnly,
  HomeroomDaySchedule,
  loadHomeroomDefaultSchedule,
  loadHomeroomSpecialSchedules,
  normalizeWeeklySchedule,
  removeHomeroomSpecialSchedule,
  resolveHomeroomDefaultHours
} from '../../utils/homeroomDefaults';
import { formatAcademicYearDate, getActiveAcademicYear, getAcademicYearSchoolYearLabel } from '../../utils/academicYears';
import { v5 as uuidv5 } from 'uuid';

const router = Router();

class HomeroomSwapConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HomeroomSwapConflictError';
  }
}

const isUuid = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const USER_ID_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

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

function normalizeDateOnly(value: unknown): string | null {
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

  return formatDateOnly(parsed);
}

function getTodayDateOnly(): string {
  return formatDateOnly(new Date());
}

function parseJsonLikeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value) || typeof value === 'object') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    if (trimmed.startsWith('{') && trimmed.endsWith('}') && !trimmed.includes(':')) {
      const inner = trimmed.slice(1, -1).trim();
      if (inner === '') {
        return [];
      }

      return inner
        .split(',')
        .map((item) => item.trim().replace(/^"(.*)"$/, '$1'))
        .filter((item) => item.length > 0);
    }

    return value;
  }
}

function normalizeJsonArrayValue(value: unknown): unknown[] {
  const parsed = parseJsonLikeValue(value);
  return Array.isArray(parsed) ? parsed : [];
}

function normalizeDaysOfWeekValue(value: unknown): number[] {
  return normalizeJsonArrayValue(value)
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day));
}

function parseWeeklyScheduleInput(value: unknown) {
  const schedule = normalizeWeeklySchedule(value);
  return schedule.length > 0 ? schedule : null;
}

function getWeekDatesFromAnchor(anchorDate: string) {
  const [year, month, day] = anchorDate.split('-').map(Number);
  const baseDate = new Date(year, month - 1, day);
  const weekStart = new Date(baseDate);
  weekStart.setDate(baseDate.getDate() - baseDate.getDay());

  return [0, 1, 2, 3, 4, 5].map((dayOffset) => {
    const current = new Date(weekStart);
    current.setDate(weekStart.getDate() + dayOffset);
    return {
      day_of_week: dayOffset,
      date: formatDateOnly(current)
    };
  });
}

async function resolveTargetHomeroomIds(
  trx: any,
  input: { homeroom_id?: number | null; grade_id?: string | null }
): Promise<number[]> {
  if (input.homeroom_id && Number.isInteger(input.homeroom_id) && input.homeroom_id > 0) {
    return [input.homeroom_id];
  }

  if (input.grade_id) {
    return (await trx('homerooms')
      .pluck('id')
      .where({ grade_id: input.grade_id, is_active: true }))
      .map((id: unknown) => Number(id))
      .filter((id: number) => Number.isInteger(id) && id > 0);
  }

  return [];
}

function validateSpecialScheduleIsReduction(
  weeklySchedule: HomeroomDaySchedule[],
  baseSchedule: HomeroomDaySchedule[]
): string | null {
  for (const slot of weeklySchedule) {
    const baseSlot = baseSchedule.find((item) => item.day_of_week === slot.day_of_week);

    if (!baseSlot) {
      return 'חסר לוח זמנים בסיסי עבור אחד מימי השבוע';
    }

    if (!baseSlot.is_active) {
      if (slot.is_active) {
        return `לא ניתן להפעיל את יום השבוע ${slot.day_of_week} כאשר הוא לא פעיל בלוח הזמנים הבסיסי`;
      }
      continue;
    }

    if (!slot.is_active) {
      continue;
    }

    if (!slot.start_time || !slot.end_time || !baseSlot.start_time || !baseSlot.end_time) {
      return `טווח השעות אינו תקין עבור יום מספר ${slot.day_of_week}`;
    }

    if (slot.start_time < baseSlot.start_time) {
      return `לוח זמנים מיוחד יכול להתחיל רק מאוחר יותר מלוח הזמנים הבסיסי ביום ${slot.day_of_week}`;
    }

    if (slot.end_time > baseSlot.end_time) {
      return `לוח זמנים מיוחד יכול להסתיים רק מוקדם יותר מלוח הזמנים הבסיסי ביום ${slot.day_of_week}`;
    }

    if (slot.start_time >= slot.end_time) {
      return `שעת ההתחלה חייבת להיות לפני שעת הסיום ביום ${slot.day_of_week}`;
    }
  }

  return null;
}

async function getCurrentSchoolYearLabel(trx: any): Promise<string> {
  const activeYear = await getActiveAcademicYear(trx);
  return getAcademicYearSchoolYearLabel(activeYear) || 'current';
}

function getCurrentSchoolYear(): string {
  return 'תשפ"ד';
}

async function createHomeroomAssignments(homeroom: any, createdBy: string) {
  try {
    logger.info(`Creating assignments for homeroom ${homeroom.display_name}`);

    const activeAcademicYear = await getActiveAcademicYear(db);
    const activeAcademicYearStart = formatAcademicYearDate(activeAcademicYear?.start_date);
    const activeAcademicYearEnd = formatAcademicYearDate(activeAcademicYear?.end_date);

    if (!activeAcademicYearStart || !activeAcademicYearEnd) {
      logger.warn(`Skipping default assignments for homeroom ${homeroom.display_name} because active academic year dates are missing`);
      return;
    }

    const effectiveStartDate = activeAcademicYearStart < getTodayDateOnly()
      ? getTodayDateOnly()
      : activeAcademicYearStart;
    const schoolYearStart = new Date(`${effectiveStartDate}T00:00:00`);
    const schoolYearEnd = new Date(`${activeAcademicYearEnd}T00:00:00`);

    const settings = await fetchHomeroomDefaultSettings(db, {
      homeroomIds: [homeroom.id],
      gradeIds: homeroom.grade_id ? [String(homeroom.grade_id)] : []
    });
    const specialSchedules = await loadHomeroomSpecialSchedules(db);
    const existingAssignments = await db('assignments')
      .select('date')
      .where({
        assignable_type: 'homeroom',
        assignable_id: homeroom.id,
        status: 'active'
      })
      .whereBetween('date', [formatDateOnly(schoolYearStart), formatDateOnly(schoolYearEnd)]);
    const existingAssignmentDates = new Set(
      existingAssignments
        .map((assignment: { date?: string | Date | null }) => normalizeDateOnly(assignment.date))
        .filter((date): date is string => Boolean(date))
    );
    const assignmentsToInsert: any[] = [];

    for (let date = new Date(schoolYearStart); date <= schoolYearEnd; date.setDate(date.getDate() + 1)) {
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 6) {
        continue;
      }

      const dateStr = formatDateOnly(date);
      const resolvedHours = resolveHomeroomDefaultHours({
        homeroomId: homeroom.id,
        gradeId: homeroom.grade_id ? String(homeroom.grade_id) : null,
        date: dateStr,
        settings,
        specialSchedules
      });

      if (!resolvedHours.is_active || !resolvedHours.start_time || !resolvedHours.end_time) {
        continue;
      }

      if (existingAssignmentDates.has(dateStr)) {
        continue;
      }

      assignmentsToInsert.push({
        type: 'one_time',
        assignable_type: 'homeroom',
        assignable_id: homeroom.id,
        room_id: homeroom.room_id,
        activity_type: 'לימודים',
        created_by: createdBy,
        start_date: dateStr,
        date: dateStr,
        start_time: resolvedHours.start_time,
        end_time: resolvedHours.end_time,
        days_of_week: JSON.stringify([dayOfWeek]),
        time_slots: JSON.stringify([
          { start: resolvedHours.start_time, end: resolvedHours.end_time }
        ]),
        is_manual: false,
        status: 'active',
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      });
    }

    if (assignmentsToInsert.length > 0) {
      await db('assignments').insert(assignmentsToInsert);
    }
  } catch (error) {
    logger.error('Error creating homeroom assignments:', error);
  }
}

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { grade_id } = req.query;
    const requestedSchoolYear = typeof req.query.school_year === 'string' ? req.query.school_year : null;
    const school_year = requestedSchoolYear || await getCurrentSchoolYearLabel(db);
    const query = `
      SELECT h.*, g.name as grade_name, r.room_number, r.room_type, r.floor, r.wing,
             u.full_name as teacher_name, u.email as teacher_email
      FROM homerooms h
      JOIN grades g ON h.grade_id::text = g.id::text
      JOIN rooms r ON h.room_id::text = r.id::text
      LEFT JOIN users u ON h.teacher_id::text = u.id::text
      WHERE h.is_active = true
      ${grade_id ? 'AND h.grade_id = :gradeId' : ''}
      ${school_year ? 'AND h.school_year = :schoolYear' : ''}
      ORDER BY g.name, h.class_number
    `;

    const result = await db.raw(query, {
      ...(grade_id ? { gradeId: String(grade_id) } : {}),
      ...(school_year ? { schoolYear: school_year } : {}),
    });

    res.json({
      success: true,
      data: {
        homerooms: result.rows.map((hr: any) => ({
          ...hr,
          display_name: getHomeroomName(hr)
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching homerooms:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת כיתות האם נכשלה'
    });
  }
});

router.get('/available-rooms', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { grade_id, school_year } = req.query;

    if (!grade_id || !school_year) {
      return res.status(400).json({
        success: false,
        error: 'חובה לשלוח grade_id ו-school_year'
      });
    }

    const gradeQuery = await db.raw('SELECT * FROM grades WHERE id = :gradeId', { gradeId: grade_id });
    const grade = gradeQuery.rows[0];

    if (!grade) {
      return res.status(404).json({
        success: false,
        error: 'השכבה לא נמצאה'
      });
    }

    const gradeToRoomType: Record<string, string> = {
      'א': 'CLASSROOM_A',
      'ב': 'CLASSROOM_B',
      'ג': 'CLASSROOM_C',
      'ד': 'CLASSROOM_D',
      'ה': 'CLASSROOM_E',
      'ו': 'CLASSROOM_F'
    };

    const targetRoomType = gradeToRoomType[grade.name];

    const availableRoomsQuery = await db.raw(`
      SELECT r.*,
             CASE
               WHEN r.room_type = :targetRoomType THEN 100
               WHEN r.room_type = 'MAMAD' THEN 80
               WHEN r.room_type = 'HOMEROOM' THEN 70
               WHEN r.room_type = 'REGULAR' THEN 60
               ELSE 10
             END as priority_score
      FROM rooms r
      WHERE r.is_active = true
        AND r.room_type = :targetRoomType2
        AND r.id NOT IN (
          SELECT room_id FROM homerooms
          WHERE school_year = :schoolYear
        )
        AND r.capacity >= 30
      ORDER BY priority_score DESC, r.room_number
    `, { targetRoomType, targetRoomType2: targetRoomType, schoolYear: school_year });

    res.json({
      success: true,
      data: {
        available_rooms: availableRoomsQuery.rows,
        grade_info: grade
      }
    });
  } catch (error) {
    logger.error('Error fetching available rooms:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת החדרים הזמינים נכשלה'
    });
  }
});

router.get('/grades', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeYear = await getActiveAcademicYear(db);
    const gradesQuery = await db.raw(`
      SELECT g.*, u.full_name as coordinator_name, u.email as coordinator_email
      FROM grades g
      LEFT JOIN users u ON g.coordinator_id = u.id
      ${activeYear?.id ? 'WHERE g.year_id = :yearId' : ''}
      ORDER BY g.name
    `, activeYear?.id ? { yearId: activeYear.id } : {});

    res.json({
      success: true,
      data: {
        grades: gradesQuery.rows
      }
    });
  } catch (error) {
    logger.error('Error fetching grades:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת השכבות נכשלה'
    });
  }
});

router.get('/default-settings', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeYear = await getActiveAcademicYear(db);
    const activeSchoolYearLabel = getAcademicYearSchoolYearLabel(activeYear);
    const [schedule, specialSchedules, grades, homeroomsResult] = await Promise.all([
      loadHomeroomDefaultSchedule(db),
      loadHomeroomSpecialSchedules(db),
      (() => {
        const query = db('grades').select('id', 'name').orderBy('name', 'asc');
        if (activeYear?.id) {
          query.where('year_id', activeYear.id);
        }
        return query;
      })(),
      db.raw(`
        SELECT h.id, h.grade_id, g.name as grade_name, h.class_number, r.room_number
        FROM homerooms h
        JOIN grades g ON h.grade_id::text = g.id::text
        JOIN rooms r ON h.room_id::text = r.id::text
        WHERE h.is_active = true
        ${activeYear?.id ? 'AND g.year_id = :activeYearId' : ''}
        ${activeSchoolYearLabel ? 'AND h.school_year = :activeSchoolYearLabel' : ''}
        ORDER BY g.name, h.class_number
      `, {
        ...(activeYear?.id ? { activeYearId: activeYear.id } : {}),
        ...(activeSchoolYearLabel ? { activeSchoolYearLabel } : {})
      })
    ]);

    const homerooms = homeroomsResult.rows.map((homeroom: any) => ({
      id: homeroom.id,
      grade_id: homeroom.grade_id,
      grade_name: homeroom.grade_name,
      class_number: homeroom.class_number,
      room_number: homeroom.room_number,
      display_name: `${homeroom.grade_name}${homeroom.class_number}`
    }));

    const gradeMap = new Map(grades.map((grade: any) => [String(grade.id), grade]));
    const homeroomMap = new Map<number, { display_name: string }>(
      homerooms.map((homeroom: any) => [homeroom.id, { display_name: homeroom.display_name }])
    );

    res.json({
      success: true,
      data: {
        system_default: {
          start_time: DEFAULT_HOMEROOM_START_TIME,
          end_time: DEFAULT_HOMEROOM_END_TIME,
          weekly_schedule: buildUniformWeeklySchedule()
        },
        grades,
        homerooms,
        grade_defaults: schedule.gradeDefaults.map((setting) => ({
          ...setting,
          grade_name: gradeMap.get(String(setting.grade_id))?.name ?? null
        })),
        homeroom_overrides: schedule.homeroomOverrides.map((setting) => ({
          ...setting,
          homeroom_name: homeroomMap.get(setting.homeroom_id ?? -1)?.display_name ?? null
        })),
        special_schedules: specialSchedules.map((setting) => ({
          ...setting,
          grade_name: setting.grade_id ? (gradeMap.get(String(setting.grade_id))?.name ?? null) : null,
          homeroom_name: homeroomMap.get(setting.homeroom_id ?? -1)?.display_name ?? null
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching homeroom default settings:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת הגדרות ברירת המחדל של כיתות האם נכשלה'
    });
  }
});

router.post('/swap-rooms', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const swaps = Array.isArray(req.body?.swaps) ? req.body.swaps : [];

    if (swaps.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'חובה לשלוח לפחות החלפת חדר אחת'
      });
    }

    const normalizedSwaps = swaps
      .map((swap: any) => ({
        homeroom_id: Number(swap?.homeroom_id),
        room_id: typeof swap?.room_id === 'string' ? swap.room_id : ''
      }))
      .filter((swap: { homeroom_id: number; room_id: string }) => Number.isInteger(swap.homeroom_id) && swap.homeroom_id > 0 && swap.room_id);

    if (normalizedSwaps.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'נתוני ההחלפה אינם תקינים'
      });
    }

    const targetRoomIds = normalizedSwaps.map((swap: { room_id: string }) => swap.room_id);
    if (new Set(targetRoomIds).size !== targetRoomIds.length) {
      return res.status(400).json({
        success: false,
        error: 'כל חדר יעד יכול להיות משויך לכיתת אם אחת בלבד'
      });
    }

    await db.transaction(async (trx) => {
      const homeroomIds = normalizedSwaps.map((swap: { homeroom_id: number }) => swap.homeroom_id);
      const targetRoomByHomeroomId = new Map(
        normalizedSwaps.map((swap: { homeroom_id: number; room_id: string }) => [String(swap.homeroom_id), swap.room_id])
      );
      const homerooms = await trx('homerooms')
        .select('id', 'room_id', 'school_year')
        .whereIn('id', homeroomIds)
        .andWhere({ is_active: true });

      if (homerooms.length !== homeroomIds.length) {
        throw new Error('אחת או יותר מכיתות האם לא נמצאו');
      }

      const rooms = await trx('rooms')
        .select('id')
        .whereIn('id', targetRoomIds)
        .andWhere({ is_active: true });

      if (rooms.length !== targetRoomIds.length) {
        throw new Error('אחד או יותר מחדרי היעד לא נמצאו');
      }

      const schoolYears = [...new Set(homerooms.map((homeroom: any) => homeroom.school_year))];
      const conflictingAssignments = await trx('homerooms')
        .select('id', 'room_id')
        .whereIn('school_year', schoolYears)
        .whereIn('room_id', targetRoomIds)
        .whereNotIn('id', homeroomIds)
        .andWhere({ is_active: true });

      if (conflictingAssignments.length > 0) {
        throw new Error('אחד או יותר מחדרי היעד כבר משויכים לכיתת אם אחרת');
      }

      const affectedAssignments = await trx('assignments')
        .select('*')
        .where({
          assignable_type: 'homeroom',
          status: 'active'
        })
        .whereIn('assignable_id', homeroomIds.map(String))
        .andWhereRaw('DATE(date) >= CURRENT_DATE');

      const affectedAssignmentIds = affectedAssignments.map((assignment: any) => String(assignment.id));
      const assignmentUpdateTimestamp = new Date().toISOString();
      const reassignedAssignments = affectedAssignments.map((assignment: any) => ({
        ...assignment,
        start_date: normalizeDateOnly(assignment.start_date),
        end_date: normalizeDateOnly(assignment.end_date),
        specific_date: normalizeDateOnly(assignment.specific_date),
        date: normalizeDateOnly(assignment.date),
        days_of_week: JSON.stringify(normalizeDaysOfWeekValue(assignment.days_of_week)),
        time_slots: JSON.stringify(normalizeJsonArrayValue(assignment.time_slots)),
        conflicts_with: assignment.conflicts_with == null
          ? null
          : JSON.stringify(normalizeJsonArrayValue(assignment.conflicts_with)),
        room_id: targetRoomByHomeroomId.get(String(assignment.assignable_id)) || assignment.room_id,
        updated_at: assignmentUpdateTimestamp
      }));

      if (reassignedAssignments.length > 0) {
        const targetAssignmentRoomIds = [...new Set(reassignedAssignments.map((assignment: any) => String(assignment.room_id)))];
        const targetAssignmentDates = [...new Set(
          reassignedAssignments
            .map((assignment: any) => normalizeDateOnly(assignment.date))
            .filter((date): date is string => Boolean(date))
        )];

        const externalAssignmentsQuery = trx('assignments')
          .select('id', 'room_id', 'date', 'start_time', 'end_time', 'assignable_type', 'assignable_id')
          .where({ status: 'active' })
          .whereIn('room_id', targetAssignmentRoomIds)
          .whereIn('date', targetAssignmentDates);

        if (affectedAssignmentIds.length > 0) {
          externalAssignmentsQuery.whereNotIn('id', affectedAssignmentIds);
        }

        const externalAssignments = await externalAssignmentsQuery;
        const externalAssignmentsBySlot = new Map(
          externalAssignments.map((assignment: any) => [
            `${assignment.room_id}:${normalizeDateOnly(assignment.date)}:${assignment.start_time}:${assignment.end_time}`,
            assignment
          ])
        );

        const conflictingAssignment = reassignedAssignments.find((assignment: any) =>
          externalAssignmentsBySlot.has(
            `${assignment.room_id}:${normalizeDateOnly(assignment.date)}:${assignment.start_time}:${assignment.end_time}`
          )
        );

        if (conflictingAssignment) {
          throw new HomeroomSwapConflictError(
            `לא ניתן להשלים את החלפת החדרים כי בחדר היעד כבר קיים שיבוץ פעיל בתאריך ${conflictingAssignment.date} בין ${conflictingAssignment.start_time} ל-${conflictingAssignment.end_time}.`
          );
        }

        await trx('assignments')
          .whereIn('id', affectedAssignmentIds)
          .delete();

        await trx('assignments').insert(reassignedAssignments);
      }

      for (const swap of normalizedSwaps) {
        await trx('homerooms')
          .where({ id: swap.homeroom_id })
          .update({
            room_id: swap.room_id,
            updated_at: trx.fn.now()
          });
      }
    });

    res.json({
      success: true,
      message: 'החלפת החדרים של כיתות האם הושלמה בהצלחה'
    });
  } catch (error) {
    logger.error('Error swapping homeroom rooms:', error);
    if (error instanceof HomeroomSwapConflictError) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    if ((error as any)?.code === '23505' && (error as any)?.constraint === 'assignments_no_double_booking') {
      return res.status(409).json({
        success: false,
        error: 'לא ניתן להשלים את החלפת החדרים בגלל התנגשות עם שיבוץ קיים בחדר היעד.'
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'החלפת החדרים של כיתות האם נכשלה'
    });
  }
});

router.put('/default-settings/grade', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actorId = await resolveActorId(req);
    const { grade_id, effective_from, weekly_schedule } = req.body ?? {};
    const normalizedDate = normalizeDateOnly(effective_from);
    const normalizedWeeklySchedule = parseWeeklyScheduleInput(weekly_schedule);

    if (!grade_id || !normalizedDate || !normalizedWeeklySchedule) {
      return res.status(400).json({
        success: false,
        error: 'חובה לשלוח grade_id, effective_from ו-weekly_schedule'
      });
    }

    const grade = await db('grades').select('id').where({ id: grade_id }).first();
    if (!grade) {
      return res.status(404).json({
        success: false,
        error: 'השכבה לא נמצאה'
      });
    }

    await db.transaction(async (trx) => {
      await appendGradeDefaultSetting(trx, {
        grade_id,
        effective_from: normalizedDate,
        weekly_schedule: normalizedWeeklySchedule,
        updated_by: req.user?.id ?? null
      });

      const homeroomIds = (await trx('homerooms')
        .pluck('id')
        .where({ grade_id, is_active: true }))
        .map((id: unknown) => Number(id))
        .filter((id: number) => Number.isInteger(id) && id > 0);

      await applyHomeroomDefaultSettingsToAssignments(trx, homeroomIds, normalizedDate, actorId);
    });

    res.json({
      success: true,
      message: 'הגדרת ברירת המחדל של השכבה נשמרה בהצלחה'
    });
  } catch (error) {
    logger.error('Error saving grade default setting:', error);
    res.status(500).json({
      success: false,
      error: 'שמירת הגדרת ברירת המחדל של השכבה נכשלה'
    });
  }
});

router.put('/default-settings/homeroom', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actorId = await resolveActorId(req);
    const { homeroom_id, effective_from, weekly_schedule } = req.body ?? {};
    const normalizedDate = normalizeDateOnly(effective_from);
    const homeroomId = Number(homeroom_id);
    const normalizedWeeklySchedule = parseWeeklyScheduleInput(weekly_schedule);

    if (!homeroom_id || !normalizedDate || !normalizedWeeklySchedule) {
      return res.status(400).json({
        success: false,
        error: 'חובה לשלוח homeroom_id, effective_from ו-weekly_schedule'
      });
    }

    if (!Number.isInteger(homeroomId) || homeroomId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'מזהה כיתת האם אינו תקין'
      });
    }

    const homeroom = await db('homerooms')
      .select('id', 'grade_id')
      .where({ id: homeroomId, is_active: true })
      .first();

    if (!homeroom) {
      return res.status(404).json({
        success: false,
        error: 'כיתת האם לא נמצאה'
      });
    }

    await db.transaction(async (trx) => {
      await appendHomeroomOverrideSetting(trx, {
        homeroom_id: homeroomId,
        grade_id: homeroom.grade_id ? String(homeroom.grade_id) : null,
        effective_from: normalizedDate,
        weekly_schedule: normalizedWeeklySchedule,
        updated_by: req.user?.id ?? null
      });

      await applyHomeroomDefaultSettingsToAssignments(trx, [homeroomId], normalizedDate, actorId);
    });

    res.json({
      success: true,
      message: 'הדריסה של כיתת האם נשמרה בהצלחה'
    });
  } catch (error) {
    logger.error('Error saving homeroom override setting:', error);
    res.status(500).json({
      success: false,
      error: 'שמירת הגדרת הדריסה של כיתת האם נכשלה'
    });
  }
});

router.post('/special-schedules', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actorId = await resolveActorId(req);
    const {
      target_type,
      grade_id,
      homeroom_id,
      start_date,
      end_date,
      weekly_schedule,
      reason
    } = req.body ?? {};

    const normalizedStartDate = normalizeDateOnly(start_date);
    const normalizedEndDate = normalizeDateOnly(end_date);
    const normalizedWeeklySchedule = parseWeeklyScheduleInput(weekly_schedule);
    const normalizedTargetType = target_type === 'homeroom' ? 'homeroom' : target_type === 'grade' ? 'grade' : null;
    const homeroomId = homeroom_id !== undefined && homeroom_id !== null ? Number(homeroom_id) : null;

    if (!normalizedTargetType || !normalizedStartDate || !normalizedEndDate || !normalizedWeeklySchedule) {
      return res.status(400).json({
        success: false,
        error: 'חובה לשלוח target_type, start_date, end_date ו-weekly_schedule'
      });
    }

    if (normalizedStartDate > normalizedEndDate) {
      return res.status(400).json({
        success: false,
        error: 'תאריך ההתחלה חייב להיות מוקדם או שווה לתאריך הסיום'
      });
    }

    if (normalizedTargetType === 'grade') {
      if (!grade_id) {
        return res.status(400).json({
          success: false,
          error: 'חובה לשלוח grade_id עבור לוחות זמנים מיוחדים של שכבה'
        });
      }

      const grade = await db('grades').select('id').where({ id: grade_id }).first();
      if (!grade) {
        return res.status(404).json({
          success: false,
          error: 'השכבה לא נמצאה'
        });
      }
    }

    if (normalizedTargetType === 'homeroom') {
      if (!Number.isInteger(homeroomId) || (homeroomId ?? 0) <= 0) {
        return res.status(400).json({
          success: false,
          error: 'נדרש homeroom_id תקין עבור לוחות זמנים מיוחדים של כיתת אם'
        });
      }

      const homeroom = await db('homerooms')
        .select('id')
        .where({ id: homeroomId, is_active: true })
        .first();

      if (!homeroom) {
        return res.status(404).json({
          success: false,
          error: 'כיתת האם לא נמצאה'
        });
      }
    }

    await db.transaction(async (trx) => {
      const settings = await fetchHomeroomDefaultSettings(trx, {
        homeroomIds: normalizedTargetType === 'homeroom' && homeroomId ? [homeroomId] : [],
        gradeIds: normalizedTargetType === 'grade' && grade_id ? [String(grade_id)] : []
      });

      const baseSchedule = buildUniformWeeklySchedule();

      if (normalizedTargetType === 'homeroom' && homeroomId) {
        const homeroom = await trx('homerooms')
          .select('id', 'grade_id')
          .where({ id: homeroomId, is_active: true })
          .first();

        const resolvedBaseSchedule = normalizedWeeklySchedule.map((slot) => {
          const resolved = resolveHomeroomDefaultHours({
            homeroomId,
            gradeId: homeroom?.grade_id ? String(homeroom.grade_id) : null,
            date: `2026-01-${String(slot.day_of_week + 4).padStart(2, '0')}`,
            settings,
            specialSchedules: []
          });

          return {
            day_of_week: slot.day_of_week,
            is_active: resolved.is_active,
            start_time: resolved.start_time,
            end_time: resolved.end_time
          };
        });

        const validationError = validateSpecialScheduleIsReduction(normalizedWeeklySchedule, resolvedBaseSchedule);
        if (validationError) {
          throw new Error(validationError);
        }
      }

      if (normalizedTargetType === 'grade' && grade_id) {
        const gradeBaseSchedule = normalizedWeeklySchedule.map((slot) => {
          const gradeSetting = settings.find(
            (setting) => setting.homeroom_id === null && setting.grade_id === String(grade_id)
          );
          const matchingSlot =
            gradeSetting?.weekly_schedule.find((item) => item.day_of_week === slot.day_of_week) ||
            baseSchedule.find((item) => item.day_of_week === slot.day_of_week)!;

          return matchingSlot;
        });

        const validationError = validateSpecialScheduleIsReduction(normalizedWeeklySchedule, gradeBaseSchedule);
        if (validationError) {
          throw new Error(validationError);
        }
      }

      await appendHomeroomSpecialSchedule(trx, {
        homeroom_id: normalizedTargetType === 'homeroom' ? homeroomId : null,
        grade_id: normalizedTargetType === 'grade' ? String(grade_id) : null,
        start_date: normalizedStartDate,
        end_date: normalizedEndDate,
        weekly_schedule: normalizedWeeklySchedule,
        reason: typeof reason === 'string' ? reason : null,
        updated_by: req.user?.id ?? null
      });

      const homeroomIds = await resolveTargetHomeroomIds(trx, {
        homeroom_id: normalizedTargetType === 'homeroom' ? homeroomId : null,
        grade_id: normalizedTargetType === 'grade' ? String(grade_id) : null
      });

      await applyHomeroomDefaultSettingsToAssignments(trx, homeroomIds, normalizedStartDate, actorId);
    });

    res.status(201).json({
      success: true,
      message: 'לוח הזמנים המיוחד נשמר בהצלחה'
    });
  } catch (error) {
    logger.error('Error saving special schedule:', error);

    if (error instanceof Error && (
      error.message.includes('Special schedule can only') ||
      error.message.includes('Cannot activate weekday') ||
      error.message.includes('Invalid time range') ||
      error.message.includes('Missing base schedule') ||
      error.message.includes('Start time must be before end time') ||
      error.message.includes('לוח זמנים מיוחד יכול') ||
      error.message.includes('לא ניתן להפעיל את יום השבוע') ||
      error.message.includes('טווח שעות לא תקין') ||
      error.message.includes('חסר לוח זמנים בסיסי') ||
      error.message.includes('שעת ההתחלה חייבת להיות לפני שעת הסיום')
    )) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'שמירת לוח הזמנים המיוחד נכשלה'
    });
  }
});

router.get('/special-schedules/current-state', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetType = req.query.target_type === 'homeroom' ? 'homeroom' : req.query.target_type === 'grade' ? 'grade' : null;
    const targetDate = normalizeDateOnly(req.query.date);
    const gradeId = typeof req.query.grade_id === 'string' ? req.query.grade_id : null;
    const homeroomId = typeof req.query.homeroom_id === 'string' ? Number(req.query.homeroom_id) : null;

    if (!targetType || !targetDate) {
      return res.status(400).json({
        success: false,
        error: 'חובה לשלוח target_type ו-date'
      });
    }

    const weekDates = getWeekDatesFromAnchor(targetDate);

    if (targetType === 'homeroom') {
      if (!Number.isInteger(homeroomId) || (homeroomId ?? 0) <= 0) {
        return res.status(400).json({
          success: false,
          error: 'נדרש homeroom_id תקין'
        });
      }

      const safeHomeroomId = homeroomId as number;

      const homeroom = await db('homerooms')
        .select('id', 'grade_id', 'room_id')
        .where({ id: safeHomeroomId, is_active: true })
        .first();

      if (!homeroom) {
        return res.status(404).json({
          success: false,
          error: 'כיתת האם לא נמצאה'
        });
      }

      const homeroomGradeId = homeroom.grade_id ? String(homeroom.grade_id) : null;

      const [settings, specialSchedules, assignments] = await Promise.all([
        fetchHomeroomDefaultSettings(db, {
          homeroomIds: [safeHomeroomId],
          gradeIds: homeroomGradeId ? [homeroomGradeId] : []
        }),
        loadHomeroomSpecialSchedules(db),
        db('assignments')
          .select('date', 'start_time', 'end_time', 'status')
          .where({
            assignable_type: 'homeroom',
            assignable_id: String(safeHomeroomId),
            status: 'active'
          })
          .whereIn('date', weekDates.map((item) => item.date))
      ]);

      const assignmentsByDate = new Map(
        assignments.map((assignment: any) => [normalizeDateOnly(assignment.date), assignment])
      );

      const weeklySchedule = weekDates.map(({ day_of_week, date }) => {
        const assignment = assignmentsByDate.get(date);
        if (assignment) {
          return {
            day_of_week,
            is_active: true,
            start_time: String(assignment.start_time).slice(0, 5),
            end_time: String(assignment.end_time).slice(0, 5)
          };
        }

        const resolved = resolveHomeroomDefaultHours({
          homeroomId: safeHomeroomId,
          gradeId: homeroomGradeId,
          date,
          settings,
          specialSchedules
        });

        return {
          day_of_week,
          is_active: resolved.is_active,
          start_time: resolved.start_time,
          end_time: resolved.end_time
        };
      });

      return res.json({
        success: true,
        data: {
          source: 'calendar-assignments',
          weekly_schedule: weeklySchedule
        }
      });
    }

    if (!gradeId) {
      return res.status(400).json({
        success: false,
        error: 'יש לבחור שכבה'
      });
    }

    const settings = await fetchHomeroomDefaultSettings(db, {
      gradeIds: [gradeId]
    });
    const specialSchedules = await loadHomeroomSpecialSchedules(db);
    const weeklySchedule = weekDates.map(({ day_of_week, date }) => {
      const resolved = resolveHomeroomDefaultHours({
        homeroomId: -1,
        gradeId,
        date,
        settings,
        specialSchedules
      });

      return {
        day_of_week,
        is_active: resolved.is_active,
        start_time: resolved.start_time,
        end_time: resolved.end_time
      };
    });

    return res.json({
      success: true,
      data: {
        source: 'resolved-grade-state',
        weekly_schedule: weeklySchedule
      }
    });
  } catch (error) {
    logger.error('Error fetching current special schedule state:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת המצב הנוכחי נכשלה'
    });
  }
});

router.delete('/special-schedules/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actorId = await resolveActorId(req);
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'חובה לשלוח מזהה לוח זמנים'
      });
    }

    await db.transaction(async (trx) => {
      const existingSchedules = await loadHomeroomSpecialSchedules(trx);
      const target = existingSchedules.find((schedule) => schedule.id === id);

      if (!target) {
        throw new Error('NOT_FOUND');
      }

      await removeHomeroomSpecialSchedule(trx, id);

      const homeroomIds = await resolveTargetHomeroomIds(trx, {
        homeroom_id: target.homeroom_id,
        grade_id: target.grade_id
      });

      await applyHomeroomDefaultSettingsToAssignments(trx, homeroomIds, target.start_date, actorId);
    });

    res.json({
      success: true,
      message: 'לוח הזמנים המיוחד נמחק בהצלחה'
    });
  } catch (error) {
    logger.error('Error deleting special schedule:', error);

    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'לוח הזמנים המיוחד לא נמצא'
      });
    }

    res.status(500).json({
      success: false,
      error: 'מחיקת לוח הזמנים המיוחד נכשלה'
    });
  }
});

router.get('/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestedSchoolYear = typeof req.query.school_year === 'string' ? req.query.school_year : null;
    const schoolYear = requestedSchoolYear || await getCurrentSchoolYearLabel(db);

    const homerooms = await db.raw(`
      SELECT h.*, g.name as grade_name, r.room_number, r.room_type, u.full_name as teacher_name, u.email as teacher_email
      FROM homerooms h
      JOIN grades g ON h.grade_id::text = g.id::text
      JOIN rooms r ON h.room_id::text = r.id::text
      LEFT JOIN users u ON h.teacher_id::text = u.id::text
      WHERE h.school_year = :schoolYear
      ORDER BY g.name, h.class_number
    `, { schoolYear });

    const homeroomRows = homerooms.rows.map((homeroom: any) => ({
      ...homeroom,
      display_name: getHomeroomName(homeroom)
    }));

    const homeroomIds = homeroomRows.map((homeroom: any) => String(homeroom.id));

    const assignmentRows = homeroomIds.length > 0
      ? await db('assignments')
          .select('assignable_id', 'date', 'status')
          .where('assignable_type', 'homeroom')
          .whereIn('assignable_id', homeroomIds)
      : [];

    const assignmentSummaryMap = new Map<string, {
      total_assignments: number;
      active_assignments: number;
      first_assignment_date: string | null;
      last_assignment_date: string | null;
    }>();

    for (const assignment of assignmentRows) {
      const homeroomId = String(assignment.assignable_id);
      const dateValue = normalizeDateOnly(assignment.date);
      const current = assignmentSummaryMap.get(homeroomId) || {
        total_assignments: 0,
        active_assignments: 0,
        first_assignment_date: null,
        last_assignment_date: null
      };

      current.total_assignments += 1;
      if (assignment.status === 'active') {
        current.active_assignments += 1;
      }

      if (dateValue) {
        if (!current.first_assignment_date || dateValue < current.first_assignment_date) {
          current.first_assignment_date = dateValue;
        }
        if (!current.last_assignment_date || dateValue > current.last_assignment_date) {
          current.last_assignment_date = dateValue;
        }
      }

      assignmentSummaryMap.set(homeroomId, current);
    }

    const data = homeroomRows.map((homeroom: any) => {
      const summary = assignmentSummaryMap.get(String(homeroom.id));
      return {
        ...homeroom,
        assignment_summary: summary || {
          total_assignments: 0,
          active_assignments: 0,
          first_assignment_date: null,
          last_assignment_date: null
        }
      };
    });

    res.json({
      success: true,
      data: {
        school_year: schoolYear,
        homerooms: data
      }
    });
  } catch (error) {
    logger.error('Error fetching homeroom history:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת היסטוריית כיתת האם נכשלה'
    });
  }
});

router.get('/history/school-years', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await db('homerooms')
      .distinct('school_year')
      .whereNotNull('school_year')
      .orderBy('school_year', 'desc');

    res.json({
      success: true,
      data: {
        school_years: rows
          .map((row: any) => String(row.school_year || '').trim())
          .filter((value: string) => value.length > 0)
      }
    });
  } catch (error) {
    logger.error('Error fetching homeroom school years:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת שנות הלימוד של כיתת האם נכשלה'
    });
  }
});

router.get('/history/:id/assignments', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const requestedSchoolYear = typeof req.query.school_year === 'string' ? req.query.school_year : null;
    const schoolYear = requestedSchoolYear || await getCurrentSchoolYearLabel(db);
    const homeroomId = Number(id);

    if (!Number.isInteger(homeroomId)) {
      return res.status(400).json({
        success: false,
        error: 'מזהה כיתת האם אינו תקין'
      });
    }

    const homeroomQuery = await db.raw(`
      SELECT h.*, g.name as grade_name, r.room_number, r.room_type, u.full_name as teacher_name, u.email as teacher_email
      FROM homerooms h
      JOIN grades g ON h.grade_id::text = g.id::text
      JOIN rooms r ON h.room_id::text = r.id::text
      LEFT JOIN users u ON h.teacher_id::text = u.id::text
      WHERE h.id = :homeroomId AND h.school_year = :schoolYear
      LIMIT 1
    `, { homeroomId, schoolYear });

    const homeroom = homeroomQuery.rows[0];

    if (!homeroom) {
      return res.status(404).json({
        success: false,
        error: 'לא נמצאה כיתת אם עבור שנת הלימוד שנבחרה'
      });
    }

    const assignmentsQuery = await db.raw(`
      SELECT
        a.id,
        a.assignable_id,
        a.room_id,
        a.activity_type,
        a.start_date,
        a.date,
        a.start_time,
        a.end_time,
        a.status,
        a.is_manual,
        a.created_at,
        r.room_number
      FROM assignments a
      LEFT JOIN rooms r ON a.room_id::text = r.id::text
      WHERE a.assignable_type = 'homeroom'
        AND a.assignable_id = :homeroomId
      ORDER BY a.date DESC, a.start_time ASC
    `, { homeroomId: String(homeroomId) });
    const assignments = assignmentsQuery.rows;

    res.json({
      success: true,
      data: {
        school_year: schoolYear,
        homeroom: {
          ...homeroom,
          display_name: getHomeroomName(homeroom)
        },
        assignments: assignments.map((assignment: any) => ({
          ...assignment,
          date: normalizeDateOnly(assignment.date),
          start_date: normalizeDateOnly(assignment.start_date)
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching homeroom assignment history:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת היסטוריית השיבוצים של כיתת האם נכשלה'
    });
  }
});

router.get('/debug/all-school-years', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const schoolYearsQuery = await db.raw(`
      SELECT
        h.school_year,
        h.id,
        h.class_number,
        h.is_active,
        g.name as grade_name,
        r.room_number,
        u.full_name as teacher_name
      FROM homerooms h
      LEFT JOIN grades g ON h.grade_id::text = g.id::text
      LEFT JOIN rooms r ON h.room_id::text = r.id::text
      LEFT JOIN users u ON h.teacher_id::text = u.id::text
      ORDER BY h.school_year, g.name, h.class_number, h.id
    `);

    res.json({
      success: true,
      data: {
        homerooms: schoolYearsQuery.rows.map((row: any) => ({
          school_year: row.school_year,
          id: row.id,
          grade_name: row.grade_name,
          class_number: row.class_number,
          room_number: row.room_number,
          teacher_name: row.teacher_name,
          is_active: row.is_active,
          display_name: row.grade_name ? `${row.grade_name}${row.class_number}` : String(row.id)
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching all homeroom school years:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת כל שנות הלימוד של כיתות האם נכשלה'
    });
  }
});

router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'חובה לשלוח מזהה'
      });
    }

    const homeroomQuery = await db.raw(`
      SELECT h.*, g.name as grade_name, r.room_number, r.room_type, r.floor, r.wing,
             u.full_name as teacher_name, u.email as teacher_email
      FROM homerooms h
      JOIN grades g ON h.grade_id::text = g.id::text
      JOIN rooms r ON h.room_id::text = r.id::text
      LEFT JOIN users u ON h.teacher_id::text = u.id::text
      WHERE h.id = $1
    `, [id]);

    if (homeroomQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'כיתת האם לא נמצאה'
      });
    }

    const assignmentsQuery = await db.raw(`
      SELECT a.*, at.name as assignment_type_name, r.room_number
      FROM assignments a
      JOIN assignment_types at ON a.assignment_type_id = at.id
      JOIN rooms r ON a.room_id::text = r.id::text
      WHERE a.room_id::text = (SELECT room_id::text FROM homerooms WHERE id = $1)
        AND a.date >= CURRENT_DATE
        AND a.status = 'scheduled'
      ORDER BY a.date, a.start_time
    `, [id]);

    const homeroom = homeroomQuery.rows[0];
    homeroom.display_name = getHomeroomName(homeroom);
    homeroom.current_assignments = assignmentsQuery.rows;

    res.json({
      success: true,
      data: {
        homeroom
      }
    });
  } catch (error) {
    logger.error('Error fetching homeroom:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת כיתת האם נכשלה'
    });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actorId = await resolveActorId(req);
    const homeroomData: CreateHomeroomData = req.body;

    if (!homeroomData.room_id || !homeroomData.grade_id || !homeroomData.class_number) {
      return res.status(400).json({
        success: false,
        error: 'חסרים שדות חובה: room_id, grade_id, class_number'
      });
    }

    const room_id = homeroomData.room_id;
    const grade_id = homeroomData.grade_id;
    const class_number = typeof homeroomData.class_number === 'string'
      ? parseInt(homeroomData.class_number, 10)
      : homeroomData.class_number;
    const schoolYear = homeroomData.school_year || await getCurrentSchoolYearLabel(db);

    if (Number.isNaN(class_number) || !room_id || !grade_id) {
      return res.status(400).json({
        success: false,
        error: 'ערכי השדות אינם תקינים: room_id ו-grade_id חייבים להיות תקינים, ו-class_number חייב להיות מספר'
      });
    }

    const existingQuery = await db.raw(
      'SELECT * FROM homerooms WHERE room_id = :roomId AND school_year = :schoolYear',
      { roomId: room_id, schoolYear }
    );

    if (existingQuery.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'החדר כבר משויך ככיתת אם בשנת לימודים זו'
      });
    }

    const duplicateHomeroomQuery = await db('homerooms')
      .where({
        grade_id,
        class_number,
        school_year: schoolYear
      })
      .where({ is_active: true })
      .first();

    if (duplicateHomeroomQuery) {
      return res.status(400).json({
        success: false,
        error: 'כיתת אם כבר קיימת עבור שכבה ומספר כיתה אלה בשנת הלימודים שנבחרה'
      });
    }

    const result = await db.raw(
      `INSERT INTO homerooms (room_id, grade_id, class_number, teacher_id, max_students, school_year, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [
        room_id,
        grade_id,
        class_number,
        homeroomData.teacher_id || null,
        homeroomData.max_students || 40,
        schoolYear,
        homeroomData.is_active !== undefined ? homeroomData.is_active : true
      ]
    );

    const newHomeroom = result.rows[0];
    newHomeroom.display_name = getHomeroomName(newHomeroom);

    await createHomeroomAssignments(newHomeroom, actorId);

    res.status(201).json({
      success: true,
      data: {
        homeroom: newHomeroom
      }
    });
  } catch (error) {
    logger.error('Error creating homeroom:', error);
    res.status(500).json({
      success: false,
      error: 'יצירת כיתת האם נכשלה'
    });
  }
});

router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData: UpdateHomeroomData = req.body;

    const existingHomeroom = await db('homerooms')
      .where({ id })
      .first();

    if (!existingHomeroom) {
      return res.status(404).json({
        success: false,
        error: 'כיתת האם לא נמצאה'
      });
    }

    const payload: Record<string, any> = {};

    if (updateData.room_id !== undefined) {
      payload.room_id = updateData.room_id;
    }

    if ((updateData as any).grade_id !== undefined) {
      payload.grade_id = (updateData as any).grade_id;
    }

    if ((updateData as any).class_number !== undefined) {
      payload.class_number = (updateData as any).class_number;
    }

    if (updateData.teacher_id !== undefined) {
      payload.teacher_id = updateData.teacher_id;
    }

    if (updateData.max_students !== undefined) {
      payload.max_students = updateData.max_students;
    }

    if (updateData.current_students !== undefined) {
      payload.current_students = updateData.current_students;
    }

    if ((updateData as any).school_year !== undefined) {
      payload.school_year = (updateData as any).school_year;
    }

    if (updateData.is_active !== undefined) {
      payload.is_active = updateData.is_active;
    }

    const nextGradeId = payload.grade_id ?? existingHomeroom.grade_id;
    const nextClassNumber = payload.class_number ?? existingHomeroom.class_number;
    const nextSchoolYear = payload.school_year ?? existingHomeroom.school_year;
    const nextIsActive = payload.is_active ?? existingHomeroom.is_active;

    if (nextIsActive) {
      const duplicateHomeroom = await db('homerooms')
        .where({
          grade_id: nextGradeId,
          class_number: nextClassNumber,
          school_year: nextSchoolYear,
          is_active: true
        })
        .whereNot({ id })
        .first();

      if (duplicateHomeroom) {
        return res.status(400).json({
          success: false,
          error: 'כיתת אם כבר קיימת עבור שכבה ומספר כיתה אלה בשנת הלימודים שנבחרה'
        });
      }
    }

    if (Object.keys(payload).length > 0) {
      await db('homerooms')
        .where({ id })
        .update({
          ...payload,
          updated_at: db.fn.now()
        });
    }

    const updatedQuery = await db.raw(`
      SELECT h.*, g.name as grade_name, r.room_number, r.room_type
      FROM homerooms h
      JOIN grades g ON h.grade_id::text = g.id::text
      JOIN rooms r ON h.room_id::text = r.id::text
      WHERE h.id = :id
    `, { id });

    const updatedHomeroom = updatedQuery.rows[0];
    updatedHomeroom.display_name = getHomeroomName(updatedHomeroom);

    res.json({
      success: true,
      data: {
        homeroom: updatedHomeroom
      }
    });
  } catch (error) {
    logger.error('Error updating homeroom:', error);
    res.status(500).json({
      success: false,
      error: 'עדכון כיתת האם נכשל'
    });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const homeroomId = parseInt(id, 10);

    if (!id || Number.isNaN(homeroomId)) {
      return res.status(400).json({
        success: false,
        error: 'חובה לשלוח מזהה'
      });
    }

    const existingQuery = await db.raw('SELECT * FROM homerooms WHERE id = ?', [homeroomId]);
    if (existingQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'כיתת האם לא נמצאה'
      });
    }

    const deletedAssignmentsCount = await db.transaction(async (trx) => {
      const deletedAssignments = await trx('assignments')
        .where('assignable_type', 'homeroom')
        .andWhereRaw('assignable_id::text = ?', [String(homeroomId)])
        .del()
        .returning('id');

      await trx('homerooms')
        .where({ id: homeroomId })
        .del();

      return deletedAssignments.length;
    });

    res.json({
      success: true,
      message: 'כיתת האם נמחקה בהצלחה',
      data: {
        deletedAssignmentsCount
      }
    });
  } catch (error) {
    logger.error('Error deleting homeroom:', error);
    res.status(500).json({
      success: false,
      error: 'מחיקת כיתת האם נכשלה'
    });
  }
});

router.put('/:id/assign-teacher', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { teacher_id } = req.body;

    if (!teacher_id) {
      return res.status(400).json({
        success: false,
        error: 'חובה לשלוח teacher_id'
      });
    }

    const teacherQuery = await db.raw(
      'SELECT * FROM users WHERE id = $1 AND (role = $2 OR role = $3)',
      [teacher_id, 'grade_coordinator', 'admin']
    );

    if (teacherQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'המורה לא נמצא או שאין לו הרשאות מתאימות'
      });
    }

    await db.raw(
      'UPDATE homerooms SET teacher_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [teacher_id, id]
    );

    res.json({
      success: true,
      message: 'המורה שובץ בהצלחה'
    });
  } catch (error) {
    logger.error('Error assigning teacher:', error);
    res.status(500).json({
      success: false,
      error: 'שיוך המורה נכשל'
    });
  }
});

router.post('/utilization-report', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const homeroomsQuery = await db.raw(`
      SELECT
        h.*,
        g.name as grade_name,
        r.room_number,
        r.room_type,
        u.full_name as teacher_name,
        u.email as teacher_email,
        CASE
          WHEN h.max_students > 0 THEN ROUND((h.current_students::float / h.max_students::float) * 100)
          ELSE 0
        END as utilization_percentage
      FROM homerooms h
      JOIN grades g ON h.grade_id = g.id
      JOIN rooms r ON h.room_id = r.id
      LEFT JOIN users u ON h.teacher_id = u.id
      WHERE h.is_active = true
      ORDER BY g.name, h.class_number
    `);

    const homerooms = homeroomsQuery.rows;
    const totalCapacity = homerooms.reduce((sum: number, h: any) => sum + h.max_students, 0);
    const totalStudents = homerooms.reduce((sum: number, h: any) => sum + h.current_students, 0);
    const overallUtilization = totalCapacity > 0 ? Math.round((totalStudents / totalCapacity) * 100) : 0;

    res.json({
      success: true,
      data: {
        summary: {
          total_homerooms: homerooms.length,
          total_capacity: totalCapacity,
          total_students: totalStudents,
          overall_utilization: overallUtilization,
          active_homerooms: homerooms.filter((h: any) => h.is_active).length,
          homerooms_with_teachers: homerooms.filter((h: any) => h.teacher_name).length
        },
        homerooms: homerooms.map((h: any) => ({
          id: h.id,
          display_name: h.display_name,
          grade_name: h.grade_name,
          room_number: h.room_number,
          room_type: h.room_type,
          max_students: h.max_students,
          current_students: h.current_students,
          utilization_percentage: h.utilization_percentage,
          teacher_name: h.teacher_name,
          teacher_email: h.teacher_email,
          is_active: h.is_active,
          school_year: h.school_year
        }))
      }
    });
  } catch (error) {
    logger.error('Error generating utilization report:', error);
    res.status(500).json({
      success: false,
      error: 'יצירת דוח הניצול נכשלה'
    });
  }
});

export default router;

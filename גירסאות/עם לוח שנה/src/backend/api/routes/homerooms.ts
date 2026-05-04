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
  applyHomeroomDefaultSettingsToAssignments,
  buildUniformWeeklySchedule,
  DEFAULT_HOMEROOM_END_TIME,
  DEFAULT_HOMEROOM_START_TIME,
  fetchHomeroomDefaultSettings,
  formatDateOnly,
  normalizeWeeklySchedule,
  loadHomeroomDefaultSchedule,
  resolveHomeroomDefaultHours
} from '../../utils/homeroomDefaults';
import { getActiveAcademicYear, getAcademicYearSchoolYearLabel } from '../../utils/academicYears';

const router = Router();

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

function parseWeeklyScheduleInput(value: unknown) {
  const schedule = normalizeWeeklySchedule(value);
  return schedule.length > 0 ? schedule : null;
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

    const now = new Date();
    const currentYear = now.getFullYear();
    const startOfYear = new Date(currentYear, 8, 1);
    const schoolYearStart = now >= startOfYear ? startOfYear : new Date(currentYear - 1, 8, 1);
    const schoolYearEnd = new Date(currentYear + 1, 5, 30);

    const settings = await fetchHomeroomDefaultSettings(db, {
      homeroomIds: [homeroom.id],
      gradeIds: homeroom.grade_id ? [String(homeroom.grade_id)] : []
    });

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
        settings
      });

      if (!resolvedHours.is_active || !resolvedHours.start_time || !resolvedHours.end_time) {
        continue;
      }

      const existingAssignment = await db('assignments')
        .where({
          assignable_type: 'homeroom',
          assignable_id: homeroom.id,
          status: 'active'
        })
        .whereRaw('date::date = ?::date', [dateStr])
        .first();

      if (existingAssignment) {
        continue;
      }

      await db('assignments').insert({
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
      error: 'Failed to fetch homerooms'
    });
  }
});

router.get('/available-rooms', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { grade_id, school_year } = req.query;

    if (!grade_id || !school_year) {
      return res.status(400).json({
        success: false,
        error: 'grade_id and school_year are required'
      });
    }

    const gradeQuery = await db.raw('SELECT * FROM grades WHERE id = :gradeId', { gradeId: grade_id });
    const grade = gradeQuery.rows[0];

    if (!grade) {
      return res.status(404).json({
        success: false,
        error: 'Grade not found'
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
      error: 'Failed to fetch available rooms'
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
      error: 'Failed to fetch grades'
    });
  }
});

router.get('/default-settings', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeYear = await getActiveAcademicYear(db);
    const activeSchoolYearLabel = getAcademicYearSchoolYearLabel(activeYear);
    const [schedule, grades, homeroomsResult] = await Promise.all([
      loadHomeroomDefaultSchedule(db),
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
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching homeroom default settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch homeroom default settings'
    });
  }
});

router.post('/swap-rooms', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const swaps = Array.isArray(req.body?.swaps) ? req.body.swaps : [];

    if (swaps.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one room swap is required'
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
        error: 'Invalid swap payload'
      });
    }

    const targetRoomIds = normalizedSwaps.map((swap: { room_id: string }) => swap.room_id);
    if (new Set(targetRoomIds).size !== targetRoomIds.length) {
      return res.status(400).json({
        success: false,
        error: 'Each target room can be assigned to only one homeroom'
      });
    }

    await db.transaction(async (trx) => {
      const homeroomIds = normalizedSwaps.map((swap: { homeroom_id: number }) => swap.homeroom_id);
      const homerooms = await trx('homerooms')
        .select('id', 'room_id', 'school_year')
        .whereIn('id', homeroomIds)
        .andWhere({ is_active: true });

      if (homerooms.length !== homeroomIds.length) {
        throw new Error('One or more homerooms were not found');
      }

      const rooms = await trx('rooms')
        .select('id')
        .whereIn('id', targetRoomIds)
        .andWhere({ is_active: true });

      if (rooms.length !== targetRoomIds.length) {
        throw new Error('One or more target rooms were not found');
      }

      const schoolYears = [...new Set(homerooms.map((homeroom: any) => homeroom.school_year))];
      const conflictingAssignments = await trx('homerooms')
        .select('id', 'room_id')
        .whereIn('school_year', schoolYears)
        .whereIn('room_id', targetRoomIds)
        .whereNotIn('id', homeroomIds)
        .andWhere({ is_active: true });

      if (conflictingAssignments.length > 0) {
        throw new Error('One or more target rooms are already assigned to another homeroom');
      }

      for (const swap of normalizedSwaps) {
        await trx('homerooms')
          .where({ id: swap.homeroom_id })
          .update({
            room_id: swap.room_id,
            updated_at: trx.fn.now()
          });

        await trx('assignments')
          .where({
            assignable_type: 'homeroom',
            assignable_id: swap.homeroom_id,
            status: 'active'
          })
          .andWhereRaw('DATE(date) >= CURRENT_DATE')
          .update({
            room_id: swap.room_id,
            updated_at: trx.fn.now()
          });
      }
    });

    res.json({
      success: true,
      message: 'Homeroom rooms swapped successfully'
    });
  } catch (error) {
    logger.error('Error swapping homeroom rooms:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to swap homeroom rooms'
    });
  }
});

router.put('/default-settings/grade', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { grade_id, effective_from, weekly_schedule } = req.body ?? {};
    const normalizedDate = normalizeDateOnly(effective_from);
    const normalizedWeeklySchedule = parseWeeklyScheduleInput(weekly_schedule);

    if (!grade_id || !normalizedDate || !normalizedWeeklySchedule) {
      return res.status(400).json({
        success: false,
        error: 'grade_id, effective_from and weekly_schedule are required'
      });
    }

    const grade = await db('grades').select('id').where({ id: grade_id }).first();
    if (!grade) {
      return res.status(404).json({
        success: false,
        error: 'Grade not found'
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

      await applyHomeroomDefaultSettingsToAssignments(trx, homeroomIds, normalizedDate, req.user!.id);
    });

    res.json({
      success: true,
      message: 'Grade default setting saved successfully'
    });
  } catch (error) {
    logger.error('Error saving grade default setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save grade default setting'
    });
  }
});

router.put('/default-settings/homeroom', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { homeroom_id, effective_from, weekly_schedule } = req.body ?? {};
    const normalizedDate = normalizeDateOnly(effective_from);
    const homeroomId = Number(homeroom_id);
    const normalizedWeeklySchedule = parseWeeklyScheduleInput(weekly_schedule);

    if (!homeroom_id || !normalizedDate || !normalizedWeeklySchedule) {
      return res.status(400).json({
        success: false,
        error: 'homeroom_id, effective_from and weekly_schedule are required'
      });
    }

    if (!Number.isInteger(homeroomId) || homeroomId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid homeroom_id'
      });
    }

    const homeroom = await db('homerooms')
      .select('id', 'grade_id')
      .where({ id: homeroomId, is_active: true })
      .first();

    if (!homeroom) {
      return res.status(404).json({
        success: false,
        error: 'Homeroom not found'
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

      await applyHomeroomDefaultSettingsToAssignments(trx, [homeroomId], normalizedDate, req.user!.id);
    });

    res.json({
      success: true,
      message: 'Homeroom override saved successfully'
    });
  } catch (error) {
    logger.error('Error saving homeroom override setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save homeroom override setting'
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
      error: 'Failed to fetch homeroom history'
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
      error: 'Failed to fetch homeroom school years'
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
        error: 'Invalid homeroom id'
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
        error: 'Homeroom not found for selected school year'
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
      error: 'Failed to fetch homeroom assignment history'
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
      error: 'Failed to fetch all homeroom school years'
    });
  }
});

router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'ID is required'
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
        error: 'Homeroom not found'
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
      error: 'Failed to fetch homeroom'
    });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const homeroomData: CreateHomeroomData = req.body;

    if (!homeroomData.room_id || !homeroomData.grade_id || !homeroomData.class_number) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: room_id, grade_id, class_number'
      });
    }

    const room_id = homeroomData.room_id;
    const grade_id = homeroomData.grade_id;
    const class_number = typeof homeroomData.class_number === 'string'
      ? parseInt(homeroomData.class_number, 10)
      : homeroomData.class_number;

    if (Number.isNaN(class_number) || !room_id || !grade_id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid field values: room_id and grade_id must be valid, class_number must be number'
      });
    }

    const existingQuery = await db.raw(
      'SELECT * FROM homerooms WHERE room_id = :roomId AND school_year = :schoolYear',
      { roomId: room_id, schoolYear: homeroomData.school_year || await getCurrentSchoolYearLabel(db) }
    );

    if (existingQuery.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Room is already assigned as homeroom for this school year'
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
        homeroomData.school_year || await getCurrentSchoolYearLabel(db),
        homeroomData.is_active !== undefined ? homeroomData.is_active : true
      ]
    );

    const newHomeroom = result.rows[0];
    newHomeroom.display_name = getHomeroomName(newHomeroom);

    await createHomeroomAssignments(newHomeroom, req.user!.id);

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
      error: 'Failed to create homeroom'
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
        error: 'Homeroom not found'
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
      error: 'Failed to update homeroom'
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
        error: 'ID is required'
      });
    }

    const existingQuery = await db.raw('SELECT * FROM homerooms WHERE id = ?', [homeroomId]);
    if (existingQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Homeroom not found'
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
      message: 'Homeroom deleted successfully',
      data: {
        deletedAssignmentsCount
      }
    });
  } catch (error) {
    logger.error('Error deleting homeroom:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete homeroom'
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
        error: 'teacher_id is required'
      });
    }

    const teacherQuery = await db.raw(
      'SELECT * FROM users WHERE id = $1 AND (role = $2 OR role = $3)',
      [teacher_id, 'grade_coordinator', 'admin']
    );

    if (teacherQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found or insufficient permissions'
      });
    }

    await db.raw(
      'UPDATE homerooms SET teacher_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [teacher_id, id]
    );

    res.json({
      success: true,
      message: 'Teacher assigned successfully'
    });
  } catch (error) {
    logger.error('Error assigning teacher:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign teacher'
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
      error: 'Failed to generate utilization report'
    });
  }
});

export default router;

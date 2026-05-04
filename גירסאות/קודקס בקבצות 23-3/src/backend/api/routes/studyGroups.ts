import { Router, Response, Request } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../../config/database';
import logger from '../../utils/logger';
import { 
  StudyGroup, 
  CreateStudyGroupData, 
  UpdateStudyGroupData,
  GroupSchedule,
  SchedulingEngine,
  SchedulingResult
} from '../../domain/models';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';

const router = Router();
const schedulingEngine = new SchedulingEngine();

interface WeeklyScheduleEntry {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface StudyGroupMetadata {
  assignment_group: 1 | 2 | null;
  grade_level: string | null;
}

interface GradeGroupDefinition {
  id: string;
  grade_level: string;
  group_number: 1 | 2;
  weekly_schedule: WeeklyScheduleEntry[];
}

const mapSubjectToFrontendType = (subject?: string) => {
  switch (subject) {
    case 'MATH':
      return 'math';
    case 'ENGLISH':
      return 'english';
    case 'TRACK':
      return 'didactic';
    default:
      return 'other';
  }
};

const mapFrontendTypeToSubject = (groupType?: string) => {
  switch (groupType) {
    case 'math':
      return 'MATH';
    case 'english':
      return 'ENGLISH';
    case 'didactic':
      return 'TRACK';
    default:
      return 'OTHER';
  }
};

async function getActiveAcademicYear(trx: any) {
  return trx('academic_years')
    .where({ is_active: true, is_archived: false })
    .first();
}

async function getClassroomOptions(trx: any, yearId?: string) {
  return trx('homerooms as h')
    .join('grades as g', 'g.id', 'h.grade_id')
    .select(
      'h.id',
      'h.class_number',
      'g.name as grade_name'
    )
    .where('h.is_active', true)
    .orderBy('g.name')
    .orderBy('h.class_number');
}

function parseStudyGroupMetadata(notes: unknown): StudyGroupMetadata {
  if (!notes || typeof notes !== 'string') {
    return {
      assignment_group: null,
      grade_level: null
    };
  }

  try {
    const parsed = JSON.parse(notes);
    const assignmentGroup = parsed?.assignment_group === 1 || parsed?.assignment_group === 2
      ? parsed.assignment_group
      : null;
    const gradeLevel = typeof parsed?.grade_level === 'string' && parsed.grade_level.trim() !== ''
      ? parsed.grade_level.trim()
      : null;
    return {
      assignment_group: assignmentGroup,
      grade_level: gradeLevel
    };
  } catch {
    return {
      assignment_group: null,
      grade_level: null
    };
  }
}

function normalizeWeeklySchedule(weeklySchedule: unknown): WeeklyScheduleEntry[] {
  return Array.isArray(weeklySchedule)
    ? weeklySchedule
        .filter((entry: any) => entry && typeof entry.day_of_week === 'number' && entry.start_time && entry.end_time)
        .map((entry: any) => ({
          day_of_week: entry.day_of_week,
          start_time: String(entry.start_time),
          end_time: String(entry.end_time)
        }))
        .sort((left, right) => left.day_of_week - right.day_of_week || left.start_time.localeCompare(right.start_time))
    : [];
}

function serializeStudyGroupMetadata(assignmentGroup?: unknown, gradeLevel?: unknown): string {
  const normalizedAssignmentGroup = assignmentGroup === 1 || assignmentGroup === 2
    ? assignmentGroup
    : null;
  const normalizedGradeLevel = typeof gradeLevel === 'string' && gradeLevel.trim() !== ''
    ? gradeLevel.trim()
    : null;

  return JSON.stringify({
    assignment_group: normalizedAssignmentGroup,
    grade_level: normalizedGradeLevel
  });
}

async function getGradeGroupDefinitions(trx: any, yearId?: string) {
  const query = trx('study_group_grade_groups')
    .select('*')
    .orderBy('grade_level')
    .orderBy('group_number');

  if (yearId) {
    query.where('year_id', yearId);
  }

  const rows = await query;
  return rows.map((row: any) => ({
    id: row.id,
    grade_level: row.grade_level,
    group_number: row.group_number,
    weekly_schedule: normalizeWeeklySchedule(row.weekly_schedule)
  })) as GradeGroupDefinition[];
}

async function enrichGroups(rawGroups: any[], trx: any) {
  const classroomIds = Array.from(
    new Set(
      rawGroups.flatMap((group: any) =>
        Array.isArray(group.parent_classrooms) ? group.parent_classrooms : []
      )
    )
  );
  const numericHomeroomIds = classroomIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id));

  const classrooms = classroomIds.length > 0
    ? await trx('classrooms as c')
        .leftJoin('grades as g', 'g.id', 'c.grade_id')
        .select('c.id', 'c.name', 'g.name as grade_name')
        .whereIn('c.id', classroomIds)
    : [];
  const homerooms = numericHomeroomIds.length > 0
    ? await trx('homerooms as h')
        .join('grades as g', 'g.id', 'h.grade_id')
        .select('h.id', 'h.class_number', 'g.name as grade_name')
        .whereIn('h.id', numericHomeroomIds)
    : [];

  const classroomNameMap = new Map(classrooms.map((classroom: any) => [classroom.id, classroom.name]));
  const classroomGradeMap = new Map(classrooms.map((classroom: any) => [classroom.id, classroom.grade_name]));
  const homeroomNameMap = new Map(homerooms.map((homeroom: any) => [String(homeroom.id), `${homeroom.grade_name}${homeroom.class_number}`]));
  const homeroomGradeMap = new Map(homerooms.map((homeroom: any) => [String(homeroom.id), homeroom.grade_name]));
  const yearIds = Array.from(new Set(rawGroups.map((group: any) => group.year_id).filter(Boolean)));
  const gradeGroupDefinitions = yearIds.length > 0
    ? await trx('study_group_grade_groups')
        .select('*')
        .whereIn('year_id', yearIds)
    : [];
  const gradeGroupDefinitionMap = new Map(
    gradeGroupDefinitions.map((definition: any) => [
      `${definition.year_id}:${definition.grade_level}:${definition.group_number}`,
      normalizeWeeklySchedule(definition.weekly_schedule)
    ])
  );

  return rawGroups.map((group: any) => {
    const parentClassrooms = Array.isArray(group.parent_classrooms) ? group.parent_classrooms : [];
    const inferredGradeLevel = parentClassrooms
      .map((id: string) => classroomGradeMap.get(id) || homeroomGradeMap.get(String(id)))
      .find(Boolean) || '';
    const metadata = parseStudyGroupMetadata(group.notes);
    const groupGradeLevel = metadata.grade_level || inferredGradeLevel;
    const weeklySchedule = metadata.assignment_group
      ? gradeGroupDefinitionMap.get(`${group.year_id}:${groupGradeLevel}:${metadata.assignment_group}`) || []
      : [];

    return {
      id: group.id,
      name: group.name,
      group_type: mapSubjectToFrontendType(group.subject),
      grade_level: groupGradeLevel,
      student_count: group.student_count,
      needs_projector: group.requires_projector,
      is_large_group: (group.required_capacity || group.student_count || 0) > 35,
      consecutive_hours: group.requires_consecutive_slots ? 2 : 1,
      preferred_room_type: null,
      homeroom_ids: parentClassrooms,
      homeroom_names: parentClassrooms
        .map((id: string) => classroomNameMap.get(id) || homeroomNameMap.get(String(id)))
        .filter(Boolean),
      assignment_group: metadata.assignment_group,
      weekly_schedule: weeklySchedule,
      created_at: group.created_at,
    };
  });
}

// Get classroom options for multi-select
router.get('/classroom-options', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeYear = await getActiveAcademicYear(db);
    const classrooms = await getClassroomOptions(db, activeYear?.id);

    res.json({
      success: true,
      data: {
        homerooms: classrooms.map((classroom: any) => ({
          id: String(classroom.id),
          display_name: `${classroom.grade_name}${classroom.class_number}`,
          grade_level: classroom.grade_name || ''
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching classroom options:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch classroom options'
    });
  }
});

router.get('/group-definitions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeYear = await getActiveAcademicYear(db);
    const definitions = await getGradeGroupDefinitions(db, activeYear?.id);

    res.json({
      success: true,
      data: {
        definitions
      }
    });
  } catch (error) {
    logger.error('Error fetching study group definitions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch study group definitions'
    });
  }
});

router.put('/group-definitions/:gradeLevel/:groupNumber', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { gradeLevel, groupNumber } = req.params;
    const normalizedGroupNumber = Number(groupNumber);

    if (normalizedGroupNumber !== 1 && normalizedGroupNumber !== 2) {
      return res.status(400).json({
        success: false,
        error: 'groupNumber must be 1 or 2'
      });
    }

    const activeYear = await getActiveAcademicYear(db);
    if (!activeYear) {
      return res.status(400).json({
        success: false,
        error: 'No active academic year found'
      });
    }

    const weeklySchedule = normalizeWeeklySchedule(req.body?.weekly_schedule);
    let definition: GradeGroupDefinition | null = null;

    await db.transaction(async (trx) => {
      const existingDefinition = await trx('study_group_grade_groups')
        .where({
          year_id: activeYear.id,
          grade_level: gradeLevel,
          group_number: normalizedGroupNumber
        })
        .first();

      if (existingDefinition) {
        const [updatedDefinition] = await trx('study_group_grade_groups')
          .where({ id: existingDefinition.id })
          .update({
            weekly_schedule: JSON.stringify(weeklySchedule),
            updated_at: trx.fn.now()
          })
          .returning('*');

        definition = {
          id: updatedDefinition.id,
          grade_level: updatedDefinition.grade_level,
          group_number: updatedDefinition.group_number,
          weekly_schedule: normalizeWeeklySchedule(updatedDefinition.weekly_schedule)
        };
      } else {
        const [createdDefinition] = await trx('study_group_grade_groups')
          .insert({
            id: randomUUID(),
            year_id: activeYear.id,
            grade_level: gradeLevel,
            group_number: normalizedGroupNumber,
            weekly_schedule: JSON.stringify(weeklySchedule),
            created_at: trx.fn.now(),
            updated_at: trx.fn.now()
          })
          .returning('*');

        definition = {
          id: createdDefinition.id,
          grade_level: createdDefinition.grade_level,
          group_number: createdDefinition.group_number,
          weekly_schedule: normalizeWeeklySchedule(createdDefinition.weekly_schedule)
        };
      }
    });

    res.json({
      success: true,
      data: {
        definition
      }
    });
  } catch (error) {
    logger.error('Error saving study group definition:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save study group definition'
    });
  }
});

// Get all study groups
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { grade_level, group_type } = req.query;

    const activeYear = await getActiveAcademicYear(db);
    const query = db('groups as grp')
      .select('grp.*')
      .orderBy('grp.name');

    if (activeYear?.id) {
      query.where('grp.year_id', activeYear.id);
    }

    if (group_type) {
      query.andWhere('grp.subject', mapFrontendTypeToSubject(group_type as string));
    }

    const result = await query;
    const studyGroups = (await enrichGroups(result, db))
      .filter((group: any) => !grade_level || group.grade_level === grade_level);
    
    res.json({
      success: true,
      data: {
        study_groups: studyGroups
      }
    });
  } catch (error) {
    logger.error('Error fetching study groups:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch study groups'
    });
  }
});

// Get study group by ID with full details
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const group = await db('groups as grp')
      .select('grp.*')
      .where('grp.id', id)
      .first();

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Study group not found'
      });
    }

    const [studyGroup] = await enrichGroups([group], db);
    
    res.json({
      success: true,
      data: {
        study_group: studyGroup,
        schedules: [],
        homeroom_assignments: []
      }
    });
  } catch (error) {
    logger.error('Error fetching study group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch study group'
    });
  }
});

// Create new study group
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const groupData: CreateStudyGroupData = req.body;
    
    // Validate input
    if (!groupData.name || !groupData.grade_level || !groupData.student_count) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, grade_level, student_count'
      });
    }
    
    let createdStudyGroup: any = null;

    await db.transaction(async (trx) => {
      const activeYear = await getActiveAcademicYear(trx);

      if (!activeYear) {
        throw new Error('No active academic year found');
      }

      const homeroomIds = Array.isArray(groupData.homeroom_ids)
        ? groupData.homeroom_ids.map((id) => String(id))
        : [];

      const [newGroup] = await trx('groups')
        .insert({
          id: randomUUID(),
          year_id: activeYear.id,
          name: groupData.name.trim(),
          subject: mapFrontendTypeToSubject(groupData.group_type),
          group_type: 'HAGBATZA',
          parent_classrooms: JSON.stringify(homeroomIds),
          student_count: groupData.student_count,
          required_capacity: groupData.is_large_group ? Math.max(groupData.student_count, 36) : groupData.student_count,
          requires_projector: groupData.needs_projector || false,
          preferred_room_ids: JSON.stringify([]),
          requires_consecutive_slots: false,
          preferred_same_room: true,
          notes: serializeStudyGroupMetadata((groupData as any).assignment_group, groupData.grade_level),
          created_at: trx.fn.now(),
          updated_at: trx.fn.now()
        })
        .returning('*');

      createdStudyGroup = {
        ...newGroup
      };
    });

    const [enrichedGroup] = await enrichGroups([createdStudyGroup], db);

    logger.info(`Created study group: ${enrichedGroup.name} (ID: ${enrichedGroup.id})`);

    res.status(201).json({
      success: true,
      data: {
        study_group: enrichedGroup
      }
    });
    
  } catch (error) {
    logger.error('Error creating study group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create study group'
    });
  }
});

// Update study group
router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData: UpdateStudyGroupData = req.body;
    
    const existingGroup = await db('groups as grp')
      .select('grp.*')
      .where('grp.id', id)
      .first();

    if (!existingGroup) {
      return res.status(404).json({
        success: false,
        error: 'Study group not found'
      });
    }
    
    let updatedGroup: any = null;

    await db.transaction(async (trx) => {
      const activeYear = await getActiveAcademicYear(trx);
      const nextHomeroomIds = Array.isArray(updateData.homeroom_ids)
        ? updateData.homeroom_ids.map((id) => String(id))
        : undefined;

      const payload: Record<string, any> = {
        updated_at: trx.fn.now()
      };

      if (updateData.name !== undefined) {
        payload.name = updateData.name.trim();
      }

      if (updateData.group_type !== undefined) {
        payload.subject = mapFrontendTypeToSubject(updateData.group_type);
      }

      if (updateData.student_count !== undefined) {
        payload.student_count = updateData.student_count;
        payload.required_capacity = updateData.is_large_group
          ? Math.max(updateData.student_count, 36)
          : updateData.student_count;
      }

      if (updateData.is_large_group !== undefined && updateData.student_count === undefined) {
        const baseStudentCount = existingGroup.student_count || 0;
        payload.required_capacity = updateData.is_large_group
          ? Math.max(baseStudentCount, 36)
          : baseStudentCount;
      }

      if (updateData.needs_projector !== undefined) {
        payload.requires_projector = updateData.needs_projector;
      }

      if ((updateData as any).assignment_group !== undefined || (updateData as any).weekly_schedule !== undefined) {
        const existingMetadata = parseStudyGroupMetadata(existingGroup.notes);
        payload.notes = serializeStudyGroupMetadata(
          (updateData as any).assignment_group !== undefined ? (updateData as any).assignment_group : existingMetadata.assignment_group,
          updateData.grade_level !== undefined ? updateData.grade_level : existingMetadata.grade_level
        );
      }

      if (updateData.grade_level !== undefined && (updateData as any).assignment_group === undefined) {
        const existingMetadata = parseStudyGroupMetadata(existingGroup.notes);
        payload.notes = serializeStudyGroupMetadata(existingMetadata.assignment_group, updateData.grade_level);
      }

      if (nextHomeroomIds !== undefined) {
        payload.parent_classrooms = JSON.stringify(nextHomeroomIds);
      }

      if (Object.keys(payload).length > 1) {
        await trx('groups')
          .where({ id })
          .update(payload);
      }

      updatedGroup = {
        ...(await trx('groups as grp')
          .select('grp.*')
          .where('grp.id', id)
          .first())
      };
    });

    const [enrichedGroup] = await enrichGroups([updatedGroup], db);
    
    logger.info(`Updated study group ID: ${id}`);
    
    res.json({
      success: true,
      data: {
        study_group: enrichedGroup
      }
    });
    
  } catch (error) {
    logger.error('Error updating study group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update study group'
    });
  }
});

// Delete study group
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const existingGroup = await db('groups')
      .select('id', 'name')
      .where({ id })
      .first();

    if (!existingGroup) {
      return res.status(404).json({
        success: false,
        error: 'Study group not found'
      });
    }
    
    await db('groups')
      .where({ id })
      .del();
    
    logger.info(`Deleted study group: ${existingGroup.name} (ID: ${id})`);
    
    res.json({
      success: true,
      message: 'Study group deleted successfully'
    });
    
  } catch (error) {
    logger.error('Error deleting study group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete study group'
    });
  }
});

// Schedule study groups with intelligent engine
router.post('/schedule', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      group_ids, 
      start_date, 
      end_date,
      force_schedule = false 
    } = req.body;
    
    if (!group_ids || !Array.isArray(group_ids) || group_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'group_ids array is required'
      });
    }
    
    // Get groups to schedule
    const groupsQuery = await db.raw(
      'SELECT * FROM study_groups WHERE id = ANY($1)',
      [group_ids]
    );
    
    const groups = groupsQuery.rows;
    
    // Get existing assignments in the date range
    const existingAssignmentsQuery = await db.raw(`
      SELECT * FROM assignments 
      WHERE date BETWEEN $1 AND $2 
      AND status = 'scheduled'
      AND assignable_type = 'study_group'
    `, [start_date, end_date]);
    
    const existingAssignments = existingAssignmentsQuery.rows;
    
    // Run scheduling engine
    const result: SchedulingResult = await schedulingEngine.scheduleStudyGroups(
      groups,
      { start: new Date(start_date), end: new Date(end_date) },
      existingAssignments
    );
    
    if (!result.success && !force_schedule) {
      return res.status(400).json({
        success: false,
        data: result,
        error: 'Scheduling failed due to conflicts'
      });
    }
    
    // Save successful assignments to database
    if (result.assignments.length > 0) {
      await db.transaction(async (trx) => {
        for (const assignment of result.assignments) {
          // Check for duplicate assignment before inserting
          const existingAssignment = await trx('assignments')
            .where('room_id', assignment.room_id)
            .whereRaw("date::date = ?::date", [assignment.date])
            .where('status', 'active')
            .where(function() {
              this.where('start_time', '<=', assignment.end_time)
                  .andWhere('end_time', '>=', assignment.start_time);
            })
            .first();
          
          // Skip if assignment already exists
          if (existingAssignment) {
            logger.warn(`Skipping duplicate assignment for room ${assignment.room_id} on ${assignment.date} ${assignment.start_time}-${assignment.end_time}`);
            continue;
          }
          
          await trx.raw(`
            INSERT INTO assignments (
              room_id, assignment_type_id, assignable_type, assignable_id, 
              title, description, date, start_time, end_time, 
              requester_id, status, is_recurring, special_requirements
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
            assignment.room_id,
            assignment.assignment_type_id,
            assignment.assignable_type,
            assignment.assignable_id,
            assignment.title,
            assignment.description,
            assignment.date,
            assignment.start_time,
            assignment.end_time,
            req.user!.id,
            assignment.status,
            assignment.is_recurring,
            JSON.stringify(assignment.special_requirements)
          ]);
        }
      });
    }
    
    logger.info(`Scheduled ${result.assignments.length} study groups`);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('Error scheduling study groups:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to schedule study groups'
    });
  }
});

// Get group schedules
router.get('/:id/schedules', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const schedulesQuery = await db.raw(
      'SELECT * FROM group_schedules WHERE group_id = $1 ORDER BY day_of_week, start_time',
      [id]
    );
    
    res.json({
      success: true,
      data: {
        schedules: schedulesQuery.rows
      }
    });
  } catch (error) {
    logger.error('Error fetching group schedules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch group schedules'
    });
  }
});

// Export calendar
router.post('/export-calendar', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { group_ids, format, start_date, end_date } = req.body;
    
    // Get assignments for the specified groups and date range
    const assignmentsQuery = await db.raw(`
      SELECT 
        a.*,
        sg.name as study_group_name,
        r.room_number,
        sg.grade_level
      FROM assignments a
      JOIN study_groups sg ON a.assignable_id = sg.id AND a.assignable_type = 'study_group'
      JOIN rooms r ON a.room_id = r.id
      WHERE sg.id = ANY($1)
        AND a.date >= $2
        AND a.date <= $3
        AND a.status = 'active'
      ORDER BY a.date, a.start_time
    `, [group_ids, start_date, end_date]);
    
    const assignments = assignmentsQuery.rows;
    
    if (format === 'ical') {
      // Generate iCal content
      let icalContent = 'BEGIN:VCALENDAR\r\n';
      icalContent += 'VERSION:2.0\r\n';
      icalContent += 'PRODID:-//Educational Scheduling System//Study Groups Calendar//EN\r\n';
      icalContent += 'CALSCALE:GREGORIAN\r\n';
      icalContent += 'METHOD:PUBLISH\r\n';
      
      assignments.forEach((assignment: any) => {
        const startDate = new Date(assignment.date);
        const [hours, minutes] = assignment.start_time.split(':');
        startDate.setHours(parseInt(hours), parseInt(minutes));
        
        const endDate = new Date(assignment.date);
        const [endHours, endMinutes] = assignment.end_time.split(':');
        endDate.setHours(parseInt(endHours), parseInt(endMinutes));
        
        const formatDate = (date: Date) => {
          return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        };
        
        icalContent += 'BEGIN:VEVENT\r\n';
        icalContent += `UID:${assignment.id}@study-groups\r\n`;
        icalContent += `DTSTART:${formatDate(startDate)}\r\n`;
        icalContent += `DTEND:${formatDate(endDate)}\r\n`;
        icalContent += `SUMMARY:${assignment.study_group_name} (${assignment.grade_level})\r\n`;
        icalContent += `LOCATION:${assignment.room_number}\r\n`;
        icalContent += `DESCRIPTION:Study group: ${assignment.study_group_name}\\nGrade: ${assignment.grade_level}\\nRoom: ${assignment.room_number}\r\n`;
        icalContent += 'END:VEVENT\r\n';
      });
      
      icalContent += 'END:VCALENDAR\r\n';
      
      res.json({
        success: true,
        data: {
          calendar_content: icalContent
        }
      });
    } else {
      // Return JSON format
      res.json({
        success: true,
        data: {
          assignments
        }
      });
    }
    
  } catch (error) {
    logger.error('Error exporting calendar:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export calendar'
    });
  }
});

export default router;

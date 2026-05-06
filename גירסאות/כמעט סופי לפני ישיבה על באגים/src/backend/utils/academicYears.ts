import { randomUUID } from 'crypto';

export interface AcademicYearRecord {
  id: string;
  year_name: string;
  start_date: string | Date;
  end_date: string | Date;
  is_active: boolean;
  is_archived: boolean;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export async function getActiveAcademicYear(trx: any): Promise<AcademicYearRecord | undefined> {
  return trx('academic_years')
    .where({ is_active: true, is_archived: false })
    .first();
}

export async function getAcademicYearById(trx: any, yearId: string): Promise<AcademicYearRecord | undefined> {
  return trx('academic_years')
    .where({ id: yearId })
    .first();
}

export async function isAcademicYearInitialized(trx: any, year: AcademicYearRecord): Promise<boolean> {
  const schoolYearLabel = getAcademicYearSchoolYearLabel(year);

  const [gradesCountRow, groupsCountRow, definitionsCountRow] = await Promise.all([
    trx('grades')
      .where({ year_id: year.id })
      .count('id as count')
      .first(),
    trx('groups')
      .where({ year_id: year.id })
      .count('id as count')
      .first(),
    trx('study_group_grade_groups')
      .where({ year_id: year.id })
      .count('id as count')
      .first(),
  ]);

  const gradesCount = Number(gradesCountRow?.count || 0);
  const groupsCount = Number(groupsCountRow?.count || 0);
  const definitionsCount = Number(definitionsCountRow?.count || 0);

  let homeroomsCount = 0;

  if (schoolYearLabel) {
    const homeroomsCountRow = await trx('homerooms')
      .where({ school_year: schoolYearLabel })
      .count('id as count')
      .first();

    homeroomsCount = Number(homeroomsCountRow?.count || 0);
  }

  return gradesCount > 0 || groupsCount > 0 || definitionsCount > 0 || homeroomsCount > 0;
}

export function formatAcademicYearDate(value: unknown): string | null {
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

  return parsed.toISOString().split('T')[0];
}

export function getAcademicYearSchoolYearLabel(year: Pick<AcademicYearRecord, 'year_name'> | undefined): string | null {
  if (!year?.year_name || typeof year.year_name !== 'string') {
    return null;
  }

  return year.year_name.trim() || null;
}

function mapParentClassrooms(
  rawValue: unknown,
  homeroomIdMap: Map<string, number>
): string[] {
  const parsedValue = Array.isArray(rawValue)
    ? rawValue
    : typeof rawValue === 'string'
      ? safeParseJsonArray(rawValue)
      : [];

  return parsedValue
    .map((value) => homeroomIdMap.get(String(value)))
    .filter((value): value is number => Number.isInteger(value))
    .map((value) => String(value));
}

function safeParseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function normalizeGradeDefaultRooms(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value) || typeof value === 'object') {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Legacy rows may contain PostgreSQL array text like {"id1","id2"}.
    if (trimmed.startsWith('{') && trimmed.endsWith('}') && !trimmed.includes(':')) {
      const inner = trimmed.slice(1, -1).trim();
      if (inner === '') {
        return [];
      }

      const normalized = inner
        .split(',')
        .map((item) => item.trim().replace(/^"(.*)"$/, '$1'))
        .filter((item) => item.length > 0);

      return normalized;
    }

    return null;
  }
}

function normalizeStudyGroupWeeklySchedule(value: unknown): Array<{
  day_of_week: number;
  start_time: string;
  end_time: string;
}> {
  if (!value) {
    return [];
  }

  let parsedValue: unknown = value;

  if (typeof value === 'string') {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue
    .map((entry: any) => ({
      day_of_week: Number(entry?.day_of_week),
      start_time: typeof entry?.start_time === 'string' ? entry.start_time : '',
      end_time: typeof entry?.end_time === 'string' ? entry.end_time : '',
    }))
    .filter((entry) =>
      Number.isInteger(entry.day_of_week) &&
      entry.start_time.length > 0 &&
      entry.end_time.length > 0
    );
}

async function cloneGrades(trx: any, sourceYearId: string, targetYearId: string) {
  const sourceGrades = await trx('grades')
    .where({ year_id: sourceYearId })
    .orderBy('name');
  const targetGrades = await trx('grades')
    .where({ year_id: targetYearId })
    .select('*');

  const clonedGradesByName = new Map<string, any>(
    targetGrades.map((grade: any) => [String(grade.name), grade])
  );

  for (const sourceGrade of sourceGrades) {
    if (clonedGradesByName.has(String(sourceGrade.name))) {
      continue;
    }

    const clonedGrade = {
      id: randomUUID(),
      year_id: targetYearId,
      name: sourceGrade.name,
      default_rooms: (() => {
        const normalized = normalizeGradeDefaultRooms(sourceGrade.default_rooms);
        return normalized === null ? null : JSON.stringify(normalized);
      })(),
      cycle_id: null,
      coordinator_id: sourceGrade.coordinator_id ?? null,
      level: sourceGrade.level ?? null,
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    };

    const [insertedGrade] = await trx('grades')
      .insert(clonedGrade)
      .returning('*');

    clonedGradesByName.set(String(insertedGrade.name), insertedGrade);
  }

  return clonedGradesByName;
}

async function cloneHomeroomsForAcademicYear(options: {
  trx: any;
  sourceYearLabel: string;
  targetYearLabel: string;
  sourceYearId: string;
  targetYearId: string;
  targetGradesByName: Map<string, any>;
}) {
  const { trx, sourceYearLabel, targetYearLabel, sourceYearId, targetYearId, targetGradesByName } = options;

  const sourceHomerooms = await trx('homerooms as h')
    .join('grades as g', 'g.id', 'h.grade_id')
    .select('h.*', 'g.name as grade_name', 'g.year_id as grade_year_id')
    .where('h.school_year', sourceYearLabel)
    .andWhere('g.year_id', sourceYearId)
    .orderBy('g.name')
    .orderBy('h.class_number');

  const existingTargetHomerooms = await trx('homerooms as h')
    .join('grades as g', 'g.id', 'h.grade_id')
    .select('h.*', 'g.name as grade_name')
    .where('h.school_year', targetYearLabel)
    .andWhere('g.year_id', targetYearId);

  const existingTargetMap = new Map<string, any>(
    existingTargetHomerooms.map((homeroom: any) => [`${homeroom.grade_name}:${homeroom.class_number}`, homeroom])
  );
  const sourceToTargetHomeroomIdMap = new Map<string, number>();

  for (const sourceHomeroom of sourceHomerooms) {
    const homeroomKey = `${sourceHomeroom.grade_name}:${sourceHomeroom.class_number}`;
    const existingTargetHomeroom = existingTargetMap.get(homeroomKey);

    if (existingTargetHomeroom) {
      sourceToTargetHomeroomIdMap.set(String(sourceHomeroom.id), Number(existingTargetHomeroom.id));
      continue;
    }

    const targetGrade = targetGradesByName.get(String(sourceHomeroom.grade_name));
    if (!targetGrade) {
      continue;
    }

    const [insertedHomeroom] = await trx('homerooms')
      .insert({
        room_id: sourceHomeroom.room_id ?? null,
        grade_id: targetGrade.id,
        class_number: sourceHomeroom.class_number,
        teacher_id: sourceHomeroom.teacher_id ?? null,
        max_students: sourceHomeroom.max_students ?? 40,
        current_students: sourceHomeroom.current_students ?? 0,
        school_year: targetYearLabel,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
        is_active: sourceHomeroom.is_active ?? true,
        class_name: sourceHomeroom.class_name ?? null,
      })
      .returning('*');

    sourceToTargetHomeroomIdMap.set(String(sourceHomeroom.id), Number(insertedHomeroom.id));
  }

  return sourceToTargetHomeroomIdMap;
}

async function cloneStudyGroupsForAcademicYear(options: {
  trx: any;
  sourceYearId: string;
  targetYearId: string;
  sourceToTargetHomeroomIdMap: Map<string, number>;
}) {
  const { trx, sourceYearId, targetYearId, sourceToTargetHomeroomIdMap } = options;

  const sourceDefinitions = await trx('study_group_grade_groups')
    .where({ year_id: sourceYearId })
    .orderBy('grade_level')
    .orderBy('group_number');

  for (const definition of sourceDefinitions) {
    const existingDefinition = await trx('study_group_grade_groups')
      .where({
        year_id: targetYearId,
        grade_level: definition.grade_level,
        group_number: definition.group_number,
      })
      .first();

    if (existingDefinition) {
      continue;
    }

    await trx('study_group_grade_groups').insert({
      id: randomUUID(),
      year_id: targetYearId,
      grade_level: definition.grade_level,
      group_number: definition.group_number,
      weekly_schedule: JSON.stringify(normalizeStudyGroupWeeklySchedule(definition.weekly_schedule)),
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
  }

  const sourceGroups = await trx('groups')
    .where({ year_id: sourceYearId })
    .orderBy('name');

  for (const sourceGroup of sourceGroups) {
    const existingTargetGroup = await trx('groups')
      .where({
        year_id: targetYearId,
        name: sourceGroup.name,
      })
      .first();

    if (existingTargetGroup) {
      continue;
    }

    await trx('groups').insert({
      id: randomUUID(),
      year_id: targetYearId,
      name: sourceGroup.name,
      subject: sourceGroup.subject,
      group_type: sourceGroup.group_type,
      parent_classrooms: JSON.stringify(mapParentClassrooms(sourceGroup.parent_classrooms, sourceToTargetHomeroomIdMap)),
      student_count: sourceGroup.student_count ?? 0,
      required_capacity: sourceGroup.required_capacity ?? sourceGroup.student_count ?? 0,
      requires_projector: sourceGroup.requires_projector ?? false,
      preferred_room_ids: sourceGroup.preferred_room_ids ?? JSON.stringify([]),
      requires_consecutive_slots: sourceGroup.requires_consecutive_slots ?? false,
      preferred_same_room: sourceGroup.preferred_same_room ?? false,
      notes: sourceGroup.notes ?? null,
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
  }
}

export async function cloneAcademicYearBaseData(options: {
  trx: any;
  sourceYear: AcademicYearRecord;
  targetYear: AcademicYearRecord;
}) {
  const { trx, sourceYear, targetYear } = options;
  const sourceYearLabel = getAcademicYearSchoolYearLabel(sourceYear);
  const targetYearLabel = getAcademicYearSchoolYearLabel(targetYear);

  if (!sourceYearLabel || !targetYearLabel) {
    return;
  }

  const targetGradesByName = await cloneGrades(trx, sourceYear.id, targetYear.id);
  const sourceToTargetHomeroomIdMap = await cloneHomeroomsForAcademicYear({
    trx,
    sourceYearLabel,
    targetYearLabel,
    sourceYearId: sourceYear.id,
    targetYearId: targetYear.id,
    targetGradesByName,
  });

  await cloneStudyGroupsForAcademicYear({
    trx,
    sourceYearId: sourceYear.id,
    targetYearId: targetYear.id,
    sourceToTargetHomeroomIdMap,
  });
}

import { Router, Response, Request } from 'express';
import { randomUUID } from 'crypto';
import { v5 as uuidv5 } from 'uuid';
import { db } from '../../config/database';
import logger from '../../utils/logger';
import { 
  StudyGroup,
  CreateStudyGroupData, 
  UpdateStudyGroupData,
  GroupSchedule
} from '../../domain/models';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';

const router = Router();

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

interface SchedulableStudyGroup {
  id: string;
  name: string;
  group_type: 'math' | 'english' | 'didactic' | 'other';
  grade_level: string;
  student_count: number;
  needs_projector: boolean;
  is_large_group: boolean;
  assignment_group?: 1 | 2 | null;
  weekly_schedule: WeeklyScheduleEntry[];
  homeroom_ids: string[];
  homeroom_room_ids?: string[];
  created_at: string;
}

interface HagbatzaConflictInfo {
  group_id: string;
  room_id: string | null;
  conflict_type: 'double_booking' | 'capacity_exceeded' | 'room_unavailable' | 'time_conflict';
  message: string;
  severity: 'low' | 'medium' | 'high';
}

interface HagbatzaAssignment {
  id: string;
  room_id: string;
  assignment_type_id: number;
  assignable_type: 'study_group';
  assignable_id: string;
  title: string;
  description?: string;
  date: string;
  start_time: string;
  end_time: string;
  requester_id: string;
  status: 'active';
  is_recurring: boolean;
  special_requirements?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface DetailedHagbatzaAssignment extends HagbatzaAssignment {
  group_name: string;
  group_type: SchedulableStudyGroup['group_type'];
  grade_level: string;
  room_number: string;
  room_type: string;
  student_count: number;
  needs_projector: boolean;
}

interface HagbatzaSchedulingResult {
  success: boolean;
  assignments: DetailedHagbatzaAssignment[];
  conflicts: HagbatzaConflictInfo[];
  warnings: string[];
  unscheduled_groups: SchedulableStudyGroup[];
  scheduling_window?: {
    start_date: string;
    end_date: string;
  };
  scheduled_groups_summary?: Array<{
    group_id: string;
    group_name: string;
    group_type: SchedulableStudyGroup['group_type'];
    grade_level: string;
    total_assignments: number;
    room_numbers: string[];
    dates: string[];
  }>;
}

interface RoomAvailabilityRow {
  id: string;
  room_number: string;
  room_type: string;
  capacity: number;
  has_projector: boolean;
  is_small: boolean;
  priority: string;
  is_active: boolean;
  grade_level?: string | null;
  notes?: string | null;
}

interface ExistingAssignmentRow {
  id: string;
  room_id: string;
  assignable_id?: string;
  assignable_type?: string;
  date?: string;
  start_date?: string;
  specific_date?: string;
  start_time: string;
  end_time: string;
  status: string;
}

interface SchedulingUnit {
  key: string;
  group: SchedulableStudyGroup;
  date: string;
  start_time: string;
  end_time: string;
  slot_key: string;
  homeroom_room_ids: string[];
}

interface PlannedRoomAssignment {
  unit: SchedulingUnit;
  room: RoomAvailabilityRow;
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

async function resolveActorId(req: AuthenticatedRequest): Promise<string> {
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

  const fallbackUser = await db('users')
    .where({ is_active: true })
    .orderBy('created_at', 'asc')
    .first();

  if (fallbackUser?.id) {
    return toActorUuid(fallbackUser.id, fallbackUser.email);
  }

  return toActorUuid(req.user?.id, req.user?.email);
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

function extractAcademicYearDate(
  year: Record<string, any> | undefined,
  preferredKeys: string[]
): string | null {
  if (!year) {
    return null;
  }

  for (const key of preferredKeys) {
    const value = year[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.split('T')[0];
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().split('T')[0];
    }
  }

  return null;
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
          start_time: normalizeTimeValue(String(entry.start_time)),
          end_time: normalizeTimeValue(String(entry.end_time))
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
        .select('c.id', 'c.name', 'c.grade_id', 'c.home_room_id', 'g.name as grade_name')
        .whereIn('c.id', classroomIds)
    : [];
  const classroomGradeIds = Array.from(
    new Set(
      classrooms
        .map((classroom: any) => classroom.grade_id)
        .filter(Boolean)
    )
  );
  const classroomHomeRoomIds = Array.from(
    new Set(
      classrooms
        .map((classroom: any) => classroom.home_room_id)
        .filter(Boolean)
        .map((id: unknown) => Number(id))
        .filter((id: number) => Number.isInteger(id))
    )
  );
  const homeroomIdsToLoad = Array.from(new Set([...numericHomeroomIds, ...classroomHomeRoomIds]));
  const homerooms = homeroomIdsToLoad.length > 0 || classroomGradeIds.length > 0
    ? await trx('homerooms as h')
        .join('grades as g', 'g.id', 'h.grade_id')
        .select('h.id', 'h.grade_id', 'h.class_number', 'h.room_id', 'g.name as grade_name')
        .where((builder: any) => {
          if (homeroomIdsToLoad.length > 0) {
            builder.whereIn('h.id', homeroomIdsToLoad);
          }

          if (classroomGradeIds.length > 0) {
            if (homeroomIdsToLoad.length > 0) {
              builder.orWhereIn('h.grade_id', classroomGradeIds);
            } else {
              builder.whereIn('h.grade_id', classroomGradeIds);
            }
          }
        })
    : [];

  const classroomNameMap = new Map(classrooms.map((classroom: any) => [classroom.id, classroom.name]));
  const classroomGradeMap = new Map(classrooms.map((classroom: any) => [classroom.id, classroom.grade_name]));
  const homeroomDirectRoomMap = new Map(
    homerooms
      .filter((homeroom: any) => homeroom.room_id)
      .map((homeroom: any) => [String(homeroom.id), String(homeroom.room_id)])
  );
  const homeroomByGradeAndClassMap = new Map(
    homerooms.map((homeroom: any) => [`${homeroom.grade_id}:${homeroom.class_number}`, String(homeroom.room_id || '')])
  );
  const classroomRoomMap = new Map(
    classrooms.map((classroom: any) => {
      const classNumberMatch = String(classroom.name || '').match(/(\d+)/);
      const derivedClassNumber = classNumberMatch ? Number(classNumberMatch[1]) : null;
      const mappedRoomId = classroom.home_room_id
        ? homerooms.find((homeroom: any) => String(homeroom.id) === String(classroom.home_room_id))?.room_id
        : (classroom.grade_id && derivedClassNumber !== null
          ? homeroomByGradeAndClassMap.get(`${classroom.grade_id}:${derivedClassNumber}`)
          : undefined);

      return [classroom.id, mappedRoomId ? String(mappedRoomId) : undefined];
    })
  );
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
      homeroom_room_ids: parentClassrooms
        .map((id: string) => classroomRoomMap.get(id) || homeroomDirectRoomMap.get(String(id)) || undefined)
        .filter((roomId: string | undefined): roomId is string => Boolean(roomId)),
      homeroom_names: parentClassrooms
        .map((id: string) => classroomNameMap.get(id) || homeroomNameMap.get(String(id)))
        .filter(Boolean),
      assignment_group: metadata.assignment_group,
      weekly_schedule: weeklySchedule,
      created_at: group.created_at,
    };
  });
}

function normalizeDayOfWeekForSchedule(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 1 : day + 1;
}

function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function enumerateDatesInRange(startDate: string, endDate: string): Date[] {
  const dates: Date[] = [];
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  const current = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);

  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function getAssignmentDate(assignment: ExistingAssignmentRow): string {
  const rawDate = assignment.date || assignment.specific_date || assignment.start_date || '';
  if (!rawDate) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return rawDate;
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    return String(rawDate);
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(parsed);
}

function normalizeTimeValue(time: string): string {
  const [rawHours = '0', rawMinutes = '0'] = String(time).split(':');
  const hours = String(Number(rawHours)).padStart(2, '0');
  const minutes = String(Number(rawMinutes)).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function toMinutes(time: string): number {
  const normalized = normalizeTimeValue(time);
  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

function timeRangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const normalizedStartA = toMinutes(startA);
  const normalizedEndA = toMinutes(endA);
  const normalizedStartB = toMinutes(startB);
  const normalizedEndB = toMinutes(endB);

  return normalizedStartA < normalizedEndB && normalizedEndA > normalizedStartB;
}

function normalizeRoomCategory(room: RoomAvailabilityRow): 'source_homeroom' | 'other_homeroom' | 'study' | 'mamad' | 'room302' | 'other' {
  const normalizedType = String(room.room_type || '').toUpperCase();

  if (room.room_number === '302') {
    return 'room302';
  }

  if (normalizedType === 'HOMEROOM' || normalizedType.startsWith('CLASSROOM_')) {
    return 'other_homeroom';
  }

  if (normalizedType === 'STUDY_GROUP' || normalizedType === 'STUDY_ROOM' || normalizedType === 'STUDY') {
    return 'study';
  }

  if (normalizedType === 'MAMAD' || normalizedType === 'COMPUTER' || normalizedType === 'COMPUTER_LAB') {
    return 'mamad';
  }

  return 'other';
}

function buildSchedulingUnits(
  groups: SchedulableStudyGroup[],
  startDate: string,
  endDate: string,
  homeroomRoomMap: Map<string, string>
): { units: SchedulingUnit[]; warnings: string[]; unscheduledGroups: SchedulableStudyGroup[] } {
  const units: SchedulingUnit[] = [];
  const warnings: string[] = [];
  const unscheduledGroupIds = new Set<string>();
  const dates = enumerateDatesInRange(startDate, endDate);

  for (const group of groups) {
    if (!Array.isArray(group.weekly_schedule) || group.weekly_schedule.length === 0) {
      warnings.push(`לקבוצה ${group.name} אין חלונות זמן מוגדרים ולכן לא ניתן לשבץ אותה.`);
      unscheduledGroupIds.add(group.id);
      continue;
    }

    const homeroomRoomIds = (group.homeroom_ids || [])
      .map((homeroomId) => homeroomRoomMap.get(String(homeroomId)))
      .filter((roomId): roomId is string => Boolean(roomId));

    for (const scheduleEntry of group.weekly_schedule) {
      const matchingDates = dates.filter((date) => normalizeDayOfWeekForSchedule(date) === scheduleEntry.day_of_week);

      if (matchingDates.length === 0) {
        warnings.push(`לא נמצאו תאריכים בטווח עבור ${group.name} ביום ${scheduleEntry.day_of_week}.`);
        unscheduledGroupIds.add(group.id);
      }

      for (const date of matchingDates) {
        const dateString = toDateString(date);
        units.push({
          key: `${group.id}:${dateString}:${scheduleEntry.start_time}:${scheduleEntry.end_time}`,
          group,
          date: dateString,
          start_time: scheduleEntry.start_time,
          end_time: scheduleEntry.end_time,
          slot_key: `${dateString}:${scheduleEntry.start_time}:${scheduleEntry.end_time}`,
          homeroom_room_ids: group.homeroom_room_ids && group.homeroom_room_ids.length > 0
            ? group.homeroom_room_ids
            : homeroomRoomIds
        });
      }
    }
  }

  return {
    units: units.sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.start_time.localeCompare(right.start_time) ||
      right.group.student_count - left.group.student_count ||
      left.group.name.localeCompare(right.group.name)
    ),
    warnings,
    unscheduledGroups: groups.filter((group) => unscheduledGroupIds.has(group.id))
  };
}

function isRoomBlocked(
  roomId: string,
  date: string,
  startTime: string,
  endTime: string,
  existingAssignments: ExistingAssignmentRow[],
  plannedAssignments: PlannedRoomAssignment[]
): boolean {
  const conflictsWithExisting = existingAssignments.some((assignment) =>
    assignment.room_id === roomId &&
    getAssignmentDate(assignment) === date &&
    timeRangesOverlap(assignment.start_time, assignment.end_time, startTime, endTime)
  );

  if (conflictsWithExisting) {
    return true;
  }

  return plannedAssignments.some((assignment) =>
    assignment.room.id === roomId &&
    assignment.unit.date === date &&
    timeRangesOverlap(assignment.unit.start_time, assignment.unit.end_time, startTime, endTime)
  );
}

function getGroupRoomHistory(
  groupId: string,
  existingAssignments: ExistingAssignmentRow[],
  plannedAssignments: PlannedRoomAssignment[]
): Map<string, number> {
  const roomCounts = new Map<string, number>();

  existingAssignments
    .filter((assignment) => assignment.assignable_type === 'study_group' && assignment.assignable_id === groupId)
    .forEach((assignment) => {
      roomCounts.set(assignment.room_id, (roomCounts.get(assignment.room_id) || 0) + 1);
    });

  plannedAssignments
    .filter((assignment) => assignment.unit.group.id === groupId)
    .forEach((assignment) => {
      roomCounts.set(assignment.room.id, (roomCounts.get(assignment.room.id) || 0) + 1);
    });

  return roomCounts;
}

function scoreRoomForUnit(
  unit: SchedulingUnit,
  room: RoomAvailabilityRow,
  plannedAssignments: PlannedRoomAssignment[],
  existingAssignments: ExistingAssignmentRow[]
): number {
  const category = normalizeRoomCategory(room);
  const isSourceHomeroom = unit.homeroom_room_ids.includes(room.id);
  const isLargeGroup = unit.group.is_large_group || unit.group.student_count >= 30;
  const history = getGroupRoomHistory(unit.group.id, existingAssignments, plannedAssignments);
  const usedCount = history.get(room.id) || 0;

  let score = 0;

  if (isLargeGroup) {
    if (isSourceHomeroom) score += 1000;
    else if (category === 'other_homeroom') score += 850;
    else if (category === 'study') score += 500;
    else if (category === 'mamad') score += 250;
    else if (category === 'room302') score += unit.group.group_type === 'english' ? 90 : 20;
    else score += 120;
  } else {
    if (category === 'study') score += 900;
    else if (isSourceHomeroom) score += 700;
    else if (category === 'other_homeroom') score += 520;
    else if (category === 'mamad') score += 260;
    else if (category === 'room302') score += unit.group.group_type === 'english' ? 120 : 10;
    else score += 180;
  }

  if (unit.group.group_type === 'math') {
    score += usedCount * 320;
  } else if (unit.group.group_type === 'english') {
    score += usedCount * 180;
  } else {
    score += usedCount * 100;
  }

  if (room.capacity >= unit.group.student_count) {
    const overflow = room.capacity - unit.group.student_count;
    score += Math.max(0, 120 - overflow * 3);
  }

  const normalizedPriority = String(room.priority || '').toLowerCase();
  if (normalizedPriority === 'high') score += 25;
  if (normalizedPriority === 'low') score -= 20;

  if (room.room_number === '302') {
    score -= unit.group.group_type === 'english' ? 120 : 260;
  }

  if (room.is_small && unit.group.student_count >= 28) {
    score -= 160;
  }

  return score;
}

function pickBestRoomForUnit(
  unit: SchedulingUnit,
  rooms: RoomAvailabilityRow[],
  plannedAssignments: PlannedRoomAssignment[],
  existingAssignments: ExistingAssignmentRow[]
): RoomAvailabilityRow | null {
  const candidateRooms = rooms.filter((room) => {
    const category = normalizeRoomCategory(room);
    const isSourceHomeroom = unit.homeroom_room_ids.includes(room.id);

    if (!room.is_active) {
      return false;
    }

    // Do not automatically place a group in another class's homeroom.
    // Study groups may use their own homeroom or dedicated non-homeroom spaces.
    if (category === 'other_homeroom' && !isSourceHomeroom) {
      return false;
    }

    if (room.capacity < unit.group.student_count) {
      return false;
    }

    if (unit.group.needs_projector && !room.has_projector) {
      return false;
    }

    if (room.is_small && (unit.group.is_large_group || unit.group.student_count >= 32)) {
      return false;
    }

    return !isRoomBlocked(room.id, unit.date, unit.start_time, unit.end_time, existingAssignments, plannedAssignments);
  });

  if (candidateRooms.length === 0) {
    return null;
  }

  return [...candidateRooms].sort((left, right) => {
    const scoreDifference = scoreRoomForUnit(unit, right, plannedAssignments, existingAssignments) -
      scoreRoomForUnit(unit, left, plannedAssignments, existingAssignments);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return left.room_number.localeCompare(right.room_number);
  })[0];
}

async function scheduleStudyGroupHagbatzot(
  groups: SchedulableStudyGroup[],
  startDate: string,
  endDate: string,
  requesterId: string
): Promise<HagbatzaSchedulingResult> {
  const activeHomerooms = await db('homerooms')
    .select('id', 'room_id')
    .where('is_active', true);

  const homeroomRoomMap = new Map<string, string>(
    activeHomerooms
      .filter((homeroom: any) => homeroom.room_id)
      .map((homeroom: any) => [String(homeroom.id), String(homeroom.room_id)])
  );

  const rooms = await db('rooms')
    .select('id', 'room_number', 'room_type', 'capacity', 'has_projector', 'is_small', 'priority', 'is_active', 'grade_level', 'notes')
    .where({ is_active: true })
    .orderBy('room_number', 'asc') as RoomAvailabilityRow[];

  const existingAssignments = await db('assignments')
    .select('id', 'room_id', 'assignable_id', 'assignable_type', 'date', 'start_date', 'specific_date', 'start_time', 'end_time', 'status')
    .whereIn('status', ['active', 'scheduled'])
    .andWhere((builder) => {
      builder
        .whereBetween('date', [startDate, endDate])
        .orWhereBetween('start_date', [startDate, endDate])
        .orWhereBetween('specific_date', [startDate, endDate]);
    }) as ExistingAssignmentRow[];

  const { units, warnings: initialWarnings, unscheduledGroups: initiallyUnscheduled } = buildSchedulingUnits(
    groups,
    startDate,
    endDate,
    homeroomRoomMap
  );

  const plannedAssignments: PlannedRoomAssignment[] = [];
  const conflicts: HagbatzaConflictInfo[] = [];
  const warnings = [...initialWarnings];
  const unscheduledGroupIds = new Set(initiallyUnscheduled.map((group) => group.id));

  for (const unit of units) {
    const room = pickBestRoomForUnit(unit, rooms, plannedAssignments, existingAssignments);

    if (!room) {
      conflicts.push({
        group_id: unit.group.id,
        room_id: null,
        conflict_type: 'room_unavailable',
        message: `לא נמצא חדר פנוי עבור ${unit.group.name} בתאריך ${unit.date} בין ${unit.start_time} ל-${unit.end_time}.`,
        severity: 'high'
      });
      warnings.push(`הקבצה ${unit.group.name} לא שובצה ב-${unit.date} ${unit.start_time}-${unit.end_time}.`);
      unscheduledGroupIds.add(unit.group.id);
      continue;
    }

    plannedAssignments.push({ unit, room });
  }

  const assignments: DetailedHagbatzaAssignment[] = plannedAssignments.map(({ unit, room }) => ({
    id: randomUUID(),
    room_id: room.id,
    assignment_type_id: 1,
    assignable_type: 'study_group',
    assignable_id: unit.group.id,
    title: `הקבצה ${unit.group.name}`,
    description: `${unit.group.group_type} | שכבה ${unit.group.grade_level}`,
    date: unit.date,
    start_time: unit.start_time,
    end_time: unit.end_time,
    requester_id: requesterId,
    status: 'active',
    is_recurring: false,
    special_requirements: {
      min_capacity: unit.group.student_count,
      needs_projector: unit.group.needs_projector,
      assignment_group: unit.group.assignment_group || null,
      group_type: unit.group.group_type,
      grade_level: unit.group.grade_level
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    group_name: unit.group.name,
    group_type: unit.group.group_type,
    grade_level: unit.group.grade_level,
    room_number: room.room_number,
    room_type: room.room_type,
    student_count: unit.group.student_count,
    needs_projector: unit.group.needs_projector
  }));

  const scheduledGroupsSummary = Array.from(
    assignments.reduce((accumulator, assignment) => {
      const existing = accumulator.get(assignment.assignable_id) || {
        group_id: assignment.assignable_id,
        group_name: assignment.group_name,
        group_type: assignment.group_type,
        grade_level: assignment.grade_level,
        total_assignments: 0,
        room_numbers: new Set<string>(),
        dates: new Set<string>()
      };

      existing.total_assignments += 1;
      existing.room_numbers.add(assignment.room_number);
      existing.dates.add(assignment.date);
      accumulator.set(assignment.assignable_id, existing);
      return accumulator;
    }, new Map<string, {
      group_id: string;
      group_name: string;
      group_type: SchedulableStudyGroup['group_type'];
      grade_level: string;
      total_assignments: number;
      room_numbers: Set<string>;
      dates: Set<string>;
    }>())
  ).map(([, summary]) => ({
    group_id: summary.group_id,
    group_name: summary.group_name,
    group_type: summary.group_type,
    grade_level: summary.grade_level,
    total_assignments: summary.total_assignments,
    room_numbers: Array.from(summary.room_numbers).sort((left, right) => left.localeCompare(right)),
    dates: Array.from(summary.dates).sort((left, right) => left.localeCompare(right))
  }));

  return {
    success: conflicts.length === 0,
    assignments,
    conflicts,
    warnings,
    unscheduled_groups: groups.filter((group) => unscheduledGroupIds.has(group.id)),
    scheduling_window: {
      start_date: startDate,
      end_date: endDate
    },
    scheduled_groups_summary: scheduledGroupsSummary
  };
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
    
    const activeYear = await getActiveAcademicYear(db);
    const resolvedStartDate = start_date ||
      extractAcademicYearDate(activeYear, ['start_date', 'starts_at', 'academic_start_date', 'begin_date']);
    const resolvedEndDate = end_date ||
      extractAcademicYearDate(activeYear, ['end_date', 'ends_at', 'academic_end_date', 'finish_date']);

    if (!resolvedStartDate || !resolvedEndDate) {
      return res.status(400).json({
        success: false,
        error: 'Active academic year date range is missing'
      });
    }

    const groupsQuery = db('groups as grp')
      .select('grp.*')
      .whereIn('grp.id', group_ids);

    if (activeYear?.id) {
      groupsQuery.andWhere('grp.year_id', activeYear.id);
    }

    const groups = await groupsQuery;
    const enrichedGroups = (await enrichGroups(groups, db)).map((group: any) => ({
      id: String(group.id),
      name: String(group.name),
      group_type: group.group_type as SchedulableStudyGroup['group_type'],
      grade_level: String(group.grade_level || ''),
      student_count: Number(group.student_count || 0),
      needs_projector: Boolean(group.needs_projector),
      is_large_group: Boolean(group.is_large_group),
      assignment_group: group.assignment_group === 1 || group.assignment_group === 2 ? group.assignment_group : null,
      weekly_schedule: normalizeWeeklySchedule(group.weekly_schedule),
      homeroom_ids: Array.isArray(group.homeroom_ids) ? group.homeroom_ids.map((id: unknown) => String(id)) : [],
      homeroom_room_ids: Array.isArray(group.homeroom_room_ids) ? group.homeroom_room_ids.map((id: unknown) => String(id)) : [],
      created_at: String(group.created_at)
    }));
    const actorId = await resolveActorId(req);
    const result = await scheduleStudyGroupHagbatzot(
      enrichedGroups,
      resolvedStartDate,
      resolvedEndDate,
      actorId
    );
    
    if (!result.success && !force_schedule) {
      return res.status(400).json({
        success: false,
        data: result,
        error: 'Scheduling failed due to conflicts'
      });
    }
    
    // Save successful assignments to database. If the chosen room became unavailable,
    // keep searching for another room instead of silently skipping the occurrence.
    if (result.assignments.length > 0) {
      const persistedAssignments: DetailedHagbatzaAssignment[] = [];
      const persistenceWarnings: string[] = [];
      const persistenceConflicts: HagbatzaConflictInfo[] = [];
      const unscheduledGroupIds = new Set(result.unscheduled_groups.map((group) => group.id));

      const activeHomerooms = await db('homerooms')
        .select('id', 'room_id')
        .where('is_active', true);

      const homeroomRoomMap = new Map<string, string>(
        activeHomerooms
          .filter((homeroom: any) => homeroom.room_id)
          .map((homeroom: any) => [String(homeroom.id), String(homeroom.room_id)])
      );

      await db.transaction(async (trx) => {
        const rooms = await trx('rooms')
          .select('id', 'room_number', 'room_type', 'capacity', 'has_projector', 'is_small', 'priority', 'is_active', 'grade_level', 'notes')
          .where({ is_active: true })
          .orderBy('room_number', 'asc') as RoomAvailabilityRow[];

        const existingAssignments = await trx('assignments')
          .select('id', 'room_id', 'assignable_id', 'assignable_type', 'date', 'start_date', 'specific_date', 'start_time', 'end_time', 'status')
          .whereIn('status', ['active', 'scheduled'])
          .andWhere((builder) => {
            builder
              .whereBetween('date', [resolvedStartDate, resolvedEndDate])
              .orWhereBetween('start_date', [resolvedStartDate, resolvedEndDate])
              .orWhereBetween('specific_date', [resolvedStartDate, resolvedEndDate]);
          }) as ExistingAssignmentRow[];

        const plannedAssignments: PlannedRoomAssignment[] = [];

        for (const assignment of result.assignments) {
          const group = enrichedGroups.find((candidate) => candidate.id === assignment.assignable_id);

          if (!group) {
            persistenceWarnings.push(`לא נמצאו פרטי הקבצה עבור ${assignment.assignable_id}, ולכן המופע לא נשמר.`);
            continue;
          }

          const unit: SchedulingUnit = {
            key: `${group.id}:${assignment.date}:${normalizeTimeValue(assignment.start_time)}:${normalizeTimeValue(assignment.end_time)}`,
            group,
            date: assignment.date,
            start_time: normalizeTimeValue(assignment.start_time),
            end_time: normalizeTimeValue(assignment.end_time),
            slot_key: `${assignment.date}:${normalizeTimeValue(assignment.start_time)}:${normalizeTimeValue(assignment.end_time)}`,
            homeroom_room_ids: Array.isArray(group.homeroom_room_ids) && group.homeroom_room_ids.length > 0
              ? group.homeroom_room_ids
              : (group.homeroom_ids || [])
                  .map((homeroomId: string) => homeroomRoomMap.get(String(homeroomId)))
                  .filter((roomId: string | undefined): roomId is string => Boolean(roomId))
          };

          let selectedRoom = rooms.find((room) => room.id === assignment.room_id) || null;

          if (!selectedRoom || isRoomBlocked(selectedRoom.id, unit.date, unit.start_time, unit.end_time, existingAssignments, plannedAssignments)) {
            const alternativeRoom = pickBestRoomForUnit(
              unit,
              rooms.filter((room) => room.id !== selectedRoom?.id),
              plannedAssignments,
              existingAssignments
            );

            if (!alternativeRoom) {
              const message = `לא נמצא חדר חלופי עבור ${group.name} בתאריך ${unit.date} בין ${unit.start_time} ל-${unit.end_time}.`;
              persistenceWarnings.push(message);
              persistenceConflicts.push({
                group_id: group.id,
                room_id: assignment.room_id,
                conflict_type: 'room_unavailable',
                message,
                severity: 'high'
              });
              unscheduledGroupIds.add(group.id);
              continue;
            }

            selectedRoom = alternativeRoom;
          }

          const assignmentToPersist: DetailedHagbatzaAssignment = {
            ...assignment,
            room_id: selectedRoom.id,
            room_number: selectedRoom.room_number,
            room_type: selectedRoom.room_type
          };

          await trx('assignments').insert({
            id: assignmentToPersist.id,
            type: 'one_time',
            assignable_type: assignmentToPersist.assignable_type,
            assignable_id: assignmentToPersist.assignable_id,
            room_id: assignmentToPersist.room_id,
            activity_type: 'study_group',
            created_by: actorId,
            start_date: assignmentToPersist.date,
            date: assignmentToPersist.date,
            specific_date: assignmentToPersist.date,
            end_date: assignmentToPersist.date,
            start_time: normalizeTimeValue(assignmentToPersist.start_time),
            end_time: normalizeTimeValue(assignmentToPersist.end_time),
            days_of_week: JSON.stringify([]),
            time_slots: JSON.stringify([{
              start: normalizeTimeValue(assignmentToPersist.start_time),
              end: normalizeTimeValue(assignmentToPersist.end_time)
            }]),
            is_manual: false,
            status: assignmentToPersist.status,
            created_at: assignmentToPersist.created_at,
            updated_at: assignmentToPersist.updated_at
          });

          plannedAssignments.push({ unit, room: selectedRoom });
          existingAssignments.push({
            id: assignmentToPersist.id,
            room_id: assignmentToPersist.room_id,
            assignable_id: assignmentToPersist.assignable_id,
            assignable_type: assignmentToPersist.assignable_type,
            date: assignmentToPersist.date,
            start_date: assignmentToPersist.date,
            specific_date: assignmentToPersist.date,
            start_time: normalizeTimeValue(assignmentToPersist.start_time),
            end_time: normalizeTimeValue(assignmentToPersist.end_time),
            status: assignmentToPersist.status
          });
          persistedAssignments.push(assignmentToPersist);
        }
      });

      result.assignments = persistedAssignments;
      result.warnings = [...result.warnings, ...persistenceWarnings];
      result.conflicts = [...result.conflicts, ...persistenceConflicts];
      result.unscheduled_groups = enrichedGroups.filter((group) => unscheduledGroupIds.has(group.id));
      result.scheduled_groups_summary = Array.from(
        persistedAssignments.reduce((accumulator, assignment) => {
          const existing = accumulator.get(assignment.assignable_id) || {
            group_id: assignment.assignable_id,
            group_name: assignment.group_name,
            group_type: assignment.group_type,
            grade_level: assignment.grade_level,
            total_assignments: 0,
            room_numbers: new Set<string>(),
            dates: new Set<string>()
          };

          existing.total_assignments += 1;
          existing.room_numbers.add(assignment.room_number);
          existing.dates.add(assignment.date);
          accumulator.set(assignment.assignable_id, existing);
          return accumulator;
        }, new Map<string, {
          group_id: string;
          group_name: string;
          group_type: SchedulableStudyGroup['group_type'];
          grade_level: string;
          total_assignments: number;
          room_numbers: Set<string>;
          dates: Set<string>;
        }>())
      ).map(([, summary]) => ({
        group_id: summary.group_id,
        group_name: summary.group_name,
        group_type: summary.group_type,
        grade_level: summary.grade_level,
        total_assignments: summary.total_assignments,
        room_numbers: Array.from(summary.room_numbers).sort((left, right) => left.localeCompare(right)),
        dates: Array.from(summary.dates).sort((left, right) => left.localeCompare(right))
      }));
      result.success = result.conflicts.length === 0 && result.assignments.length > 0;
    }
    
    logger.info(`Scheduled ${result.assignments.length} study group occurrences`);

    if (!result.success) {
      return res.status(409).json({
        success: false,
        data: result,
        error: 'Scheduling could not place all requested occurrences'
      });
    }
    
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

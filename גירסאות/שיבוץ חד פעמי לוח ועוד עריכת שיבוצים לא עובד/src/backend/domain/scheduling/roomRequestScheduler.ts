import { getRoomLocation, isMamadRoom } from '../models/Room';
import { DEFAULT_HOMEROOM_END_TIME } from '../../utils/homeroomDefaults';

type RoomRecord = {
  id: string | number;
  room_number: string;
  capacity: number;
  room_type?: string | null;
  has_projector?: boolean | null;
  is_active?: boolean | null;
  priority?: string | null;
  comfort_priority?: number | null;
  notes?: string | null;
  grade_level?: number | null;
};

type HomeroomRecord = {
  room_id: string | number;
  grade_name?: string | null;
  class_number?: number | null;
};

type AssignmentRecord = {
  id: string | number;
  room_id: string | number;
  assignable_type?: string | null;
  assignable_id?: string | number | null;
  activity_type?: string | null;
  date?: string | null;
  start_time: string;
  end_time: string;
  status?: string | null;
  room_number?: string | null;
  room_type?: string | null;
  capacity?: number | null;
  has_projector?: boolean | null;
  priority?: string | null;
  notes?: string | null;
};

export type RoomRequestSchedulingInput = {
  activity_type: string;
  grade?: string | null;
  student_count: number;
  date: string;
  start_time: string;
  end_time: string;
  needs_projector?: boolean;
  requested_room_id?: string | number | null;
};

type RoomProfile = {
  room: RoomRecord;
  id: string;
  roomNumber: string;
  capacity: number;
  hasProjector: boolean;
  floor: number;
  wing: 'old' | 'new';
  section: 'left' | 'right' | 'center';
  locationLabel: string;
  normalizedType: string;
  homeroomGrade?: string | null;
  classNumber?: number | null;
  isHomeroom: boolean;
  isStudyRoom: boolean;
  isMamad: boolean;
  isLibrary: boolean;
  isMusicRoom: boolean;
  isCaravan: boolean;
  isLowComfort: boolean;
  isOldWingUpperFloor: boolean;
};

type RelocatedAssignment = {
  assignmentId: string | number;
  activityType: string;
  previousRoomId: string | number;
  previousRoomNumber: string;
  newRoomId: string | number;
  newRoomNumber: string;
  location: string;
  explanation: string;
};

type CandidateResult = {
  room: RoomProfile;
  score: number;
  reasons: string[];
  alerts: string[];
  relocatedAssignments: RelocatedAssignment[];
};

export type RoomRequestSchedulingResult = {
  success: boolean;
  selectedRoom?: RoomRecord;
  selectedRoomLocation?: string;
  selectedRoomReasons?: string[];
  alerts: string[];
  relocatedAssignments: RelocatedAssignment[];
  alternatives: Array<{
    roomId: string | number;
    roomNumber: string;
    location: string;
    reasons: string[];
  }>;
  errors: string[];
};

type SchedulerContext = {
  request: RoomRequestSchedulingInput;
  roomProfiles: RoomProfile[];
  conflictsByRoomId: Map<string, AssignmentRecord[]>;
  requestedRoomId?: string | null;
};

const normalizeText = (value?: string | null): string =>
  (value ?? '').toString().trim().toLowerCase();

const normalizeGrade = (value?: string | null): string | null => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const gradeMap: Record<string, string> = {
    'a': 'א',
    '1': 'א',
    'grade_1': 'א',
    'א': 'א',
    'b': 'ב',
    '2': 'ב',
    'grade_2': 'ב',
    'ב': 'ב',
    'c': 'ג',
    '3': 'ג',
    'grade_3': 'ג',
    'ג': 'ג',
    'd': 'ד',
    '4': 'ד',
    'grade_4': 'ד',
    'ד': 'ד',
    'e': 'ה',
    '5': 'ה',
    'grade_5': 'ה',
    'ה': 'ה',
    'f': 'ו',
    '6': 'ו',
    'grade_6': 'ו',
    'ו': 'ו',
  };

  return gradeMap[normalized] ?? null;
};

const normalizeActivityType = (value?: string | null): string => {
  const normalized = normalizeText(value);

  const aliases: Record<string, string> = {
    didactics: 'didactics',
    didactic: 'didactics',
    exam_makeup: 'exam_makeup',
    makeup_test: 'exam_makeup',
    one_on_one: 'one_on_one',
    personal_meeting: 'one_on_one',
    discussion: 'discussion',
    topics: 'topics',
    issue: 'topics',
    lesson: 'lesson',
    study_group: 'study_group',
    meeting: 'meeting',
    party: 'party',
    event: 'event',
  };

  return aliases[normalized] ?? normalized;
};

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const overlapsTime = (
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean => toMinutes(startA) < toMinutes(endB) && toMinutes(startB) < toMinutes(endA);

const isMonday = (date: string): boolean => {
  const jsDay = new Date(`${date}T00:00:00`).getDay();
  return jsDay === 1;
};

const isAfternoonEvent = (activityType: string, startTime: string): boolean => {
  const normalized = normalizeActivityType(activityType);
  return (normalized === 'meeting' || normalized === 'party' || normalized === 'event')
    && toMinutes(startTime) >= toMinutes(DEFAULT_HOMEROOM_END_TIME);
};

const formatLocation = (roomNumber: string): string => {
  const location = getRoomLocation(roomNumber);
  const wingLabel = location.wing === 'old' ? 'אגף ישן' : 'אגף חדש';
  const sectionLabel =
    location.section === 'left'
      ? 'צד שמאל'
      : location.section === 'right'
        ? 'צד ימין'
        : 'מרכז';

  if (location.wing === 'new') {
    return `קומה ${location.floor}, ${wingLabel}`;
  }

  return `קומה ${location.floor}, ${wingLabel}, ${sectionLabel}`;
};

const normalizeRoomType = (room: RoomRecord): string => {
  const roomType = normalizeText(room.room_type);
  const notes = normalizeText(room.notes);

  if (roomType.includes('library') || notes.includes('ספר')) {
    return 'library';
  }

  if (roomType.includes('music') || notes.includes('מוזיקה')) {
    return 'music_room';
  }

  if (
    roomType.includes('caravan')
    || roomType.includes('corridor')
    || notes.includes('קרוון')
    || notes.includes('קרוונים')
  ) {
    return 'caravan';
  }

  if (
    roomType.includes('study')
    || roomType.includes('group')
    || roomType === 'study'
    || notes.includes('הקבצה')
  ) {
    return 'study_room';
  }

  if (
    roomType.includes('mamad')
    || roomType.includes('computer')
    || isMamadRoom(room.room_number)
    || notes.includes('ממ"ד')
    || notes.includes('ממ״ד')
  ) {
    return 'mamad';
  }

  if (
    roomType.includes('homeroom')
    || roomType.includes('classroom')
    || roomType === 'regular'
    || roomType.startsWith('classroom_')
    || room.grade_level
  ) {
    return 'homeroom';
  }

  return roomType || 'other';
};

const buildRoomProfiles = (
  rooms: RoomRecord[],
  homerooms: HomeroomRecord[]
): RoomProfile[] => {
  const homeroomByRoom = new Map<string, HomeroomRecord>();
  homerooms.forEach((homeroom) => {
    homeroomByRoom.set(String(homeroom.room_id), homeroom);
  });

  return rooms.map((room) => {
    const location = getRoomLocation(room.room_number);
    const normalizedType = normalizeRoomType(room);
    const homeroom = homeroomByRoom.get(String(room.id));
    const homeroomGrade = normalizeGrade(homeroom?.grade_name ?? null);
    const priority = normalizeText(room.priority);
    const comfortPriority = typeof room.comfort_priority === 'number' ? room.comfort_priority : null;
    const isLowComfort = priority === 'low' || comfortPriority === 0;

    return {
      room,
      id: String(room.id),
      roomNumber: room.room_number,
      capacity: Number(room.capacity) || 0,
      hasProjector: Boolean(room.has_projector),
      floor: location.floor,
      wing: location.wing,
      section: location.section,
      locationLabel: formatLocation(room.room_number),
      normalizedType,
      homeroomGrade,
      classNumber: homeroom?.class_number ?? null,
      isHomeroom: normalizedType === 'homeroom' || Boolean(homeroom),
      isStudyRoom: normalizedType === 'study_room',
      isMamad: normalizedType === 'mamad',
      isLibrary: normalizedType === 'library',
      isMusicRoom: normalizedType === 'music_room',
      isCaravan: normalizedType === 'caravan',
      isLowComfort,
      isOldWingUpperFloor: location.wing === 'old' && (location.floor === 2 || location.floor === 3),
    };
  });
};

const buildConflictMap = (
  request: RoomRequestSchedulingInput,
  assignments: AssignmentRecord[]
): Map<string, AssignmentRecord[]> => {
  const conflictMap = new Map<string, AssignmentRecord[]>();

  assignments.forEach((assignment) => {
    const assignmentDate = assignment.date?.toString().slice(0, 10);
    if (assignmentDate !== request.date) {
      return;
    }

    if (!overlapsTime(request.start_time, request.end_time, assignment.start_time, assignment.end_time)) {
      return;
    }

    const key = String(assignment.room_id);
    const existing = conflictMap.get(key) ?? [];
    existing.push(assignment);
    conflictMap.set(key, existing);
  });

  return conflictMap;
};

const isDidacticsConflictRelocatable = (assignment: AssignmentRecord): boolean =>
  normalizeActivityType(assignment.activity_type) !== 'didactics';

const isMakeupConflictRelocatable = (assignment: AssignmentRecord): boolean => {
  const activity = normalizeActivityType(assignment.activity_type);
  const assignableType = normalizeActivityType(assignment.assignable_type);
  return activity === 'study_group' || assignableType === 'study_group';
};

const getGeneralCategoryScore = (room: RoomProfile): number => {
  if (room.isHomeroom) {
    return 0;
  }

  if (room.isStudyRoom) {
    return 10;
  }

  if (room.isMamad) {
    return 20;
  }

  if (!room.isLowComfort && !room.isCaravan) {
    return 30;
  }

  if (room.isLowComfort) {
    return 40;
  }

  if (room.isCaravan) {
    return 50;
  }

  return 60;
};

const getBaseReasons = (
  context: SchedulerContext,
  room: RoomProfile,
  conflicts: AssignmentRecord[]
): string[] => {
  const reasons: string[] = [];
  const activityType = normalizeActivityType(context.request.activity_type);

  if (context.request.needs_projector) {
    reasons.push('נדרש מקרן, והחדר כולל מקרן.');
  }

  if (room.isHomeroom) {
    reasons.push('החדר מוגדר ככיתת אם ולכן קיבל עדיפות גבוהה.');
  } else if (room.isStudyRoom) {
    reasons.push('החדר מוגדר כחדר הקבצה ולכן הועדף לפי סדרי העדיפויות.');
  } else if (room.isMamad) {
    reasons.push('החדר הוא ממ"ד ולכן נבדק בשלב הממ"דים.');
  } else if (room.isLibrary) {
    reasons.push('החדר הוא ספריה ולכן מתאים למסלול הבחירה של סוג הקבוצה.');
  } else if (room.isMusicRoom) {
    reasons.push('החדר הוא חדר מוזיקה ולכן נכלל באפשרויות המתאימות.');
  } else if (room.isCaravan) {
    reasons.push('החדר הוא קרוון ולכן נשמר כעדיפות נמוכה יותר.');
  }

  if (activityType === 'didactics' && isMonday(context.request.date) && normalizeGrade(context.request.grade) === 'ה' && room.homeroomGrade === 'ה') {
    reasons.push('לדידקטיקה ביום שני ניתנת עדיפות לכיתות אם של שכבה ה\'.');
  }

  if (activityType === 'exam_makeup' && room.isHomeroom) {
    reasons.push('להשלמת מבחנים נבדקות קודם כיתות אם פנויות.');
  } else if (activityType === 'exam_makeup' && room.isStudyRoom) {
    reasons.push('לא נמצאה כיתת אם מתאימה ולכן עברנו לחדרי הקבצה.');
  } else if (activityType === 'exam_makeup' && room.isMamad) {
    reasons.push('לא נמצאו כיתות אם או חדרי הקבצה פנויים, ולכן עברנו לבדיקת ממ"דים.');
  }

  if ((activityType === 'discussion' || activityType === 'topics') && room.isLibrary) {
    reasons.push('לשיח/סוגיות הספריה היא עדיפות שניה אחרי כיתות אם.');
  }

  if (isAfternoonEvent(activityType, context.request.start_time)) {
    reasons.push('למפגשים/מסיבות אחר הצהריים נשמרו רק חדרים בקומות 2-3 באגף הישן.');
  }

  const spareSeats = room.capacity - context.request.student_count;
  if (spareSeats >= 0) {
    reasons.push(`קיבולת החדר (${room.capacity}) מתאימה לגודל הקבוצה (${context.request.student_count}).`);
  }

  if (conflicts.length === 0) {
    reasons.push('החדר פנוי בטווח השעות המבוקש.');
  }

  return reasons;
};

const getRoomScore = (context: SchedulerContext, room: RoomProfile): number => {
  const activityType = normalizeActivityType(context.request.activity_type);
  const grade = normalizeGrade(context.request.grade);
  let score = 1000;

  if (context.request.needs_projector && !room.hasProjector) {
    return Number.POSITIVE_INFINITY;
  }

  if (room.capacity < context.request.student_count) {
    return Number.POSITIVE_INFINITY;
  }

  if (isAfternoonEvent(activityType, context.request.start_time) && !room.isOldWingUpperFloor) {
    return Number.POSITIVE_INFINITY;
  }

  if (activityType === 'didactics' && isMonday(context.request.date) && grade === 'ה') {
    if (room.isHomeroom && room.homeroomGrade === 'ה') {
      score = 0;
    } else {
      score = 100 + getGeneralCategoryScore(room);
    }
  } else if (activityType === 'exam_makeup') {
    if (room.isHomeroom) {
      score = 0;
    } else if (room.isStudyRoom) {
      score = 20;
    } else if (room.isMamad) {
      score = 30;
    } else {
      return Number.POSITIVE_INFINITY;
    }
  } else if (activityType === 'discussion' || activityType === 'topics') {
    if (room.isHomeroom) {
      score = 0;
    } else if (room.isLibrary) {
      score = 10;
    } else if (room.isMamad) {
      score = 20;
    } else {
      return Number.POSITIVE_INFINITY;
    }
  } else if (activityType === 'one_on_one') {
    const isAllowedOneOnOneRoom =
      room.isLibrary
      || room.isMusicRoom
      || room.isCaravan
      || room.isHomeroom
      || room.isStudyRoom
      || room.isMamad
      || room.normalizedType === 'other';

    if (!isAllowedOneOnOneRoom) {
      return Number.POSITIVE_INFINITY;
    }

    score = 0;
    if (room.isLibrary) {
      score += 5;
    } else if (room.isMusicRoom) {
      score += 8;
    } else if (room.isCaravan) {
      score += 10;
    }
  } else {
    score = getGeneralCategoryScore(room);
  }

  if (context.request.requested_room_id && String(context.request.requested_room_id) === room.id) {
    score -= 3;
  }

  if (room.hasProjector) {
    score -= 1;
  }

  const spareSeats = Math.max(room.capacity - context.request.student_count, 0);
  score += spareSeats / 100;

  if (room.isLowComfort && !room.isCaravan) {
    score += 2;
  }

  return score;
};

const findReplacementRoom = (
  assignment: AssignmentRecord,
  context: SchedulerContext,
  excludedRoomIds: Set<string>
): RelocatedAssignment | null => {
  const activityType = normalizeActivityType(assignment.activity_type || assignment.assignable_type);
  const currentRoom = context.roomProfiles.find((room) => room.id === String(assignment.room_id));
  const minimumCapacity = currentRoom?.capacity ?? 1;
  const needsProjector = Boolean(currentRoom?.hasProjector || assignment.has_projector);

  const replacementRequest: RoomRequestSchedulingInput = {
    activity_type: activityType || 'study_group',
    grade: currentRoom?.homeroomGrade ?? context.request.grade ?? null,
    student_count: minimumCapacity,
    date: context.request.date,
    start_time: context.request.start_time,
    end_time: context.request.end_time,
    needs_projector: needsProjector,
  };

  const replacementContext: SchedulerContext = {
    request: replacementRequest,
    roomProfiles: context.roomProfiles,
    conflictsByRoomId: context.conflictsByRoomId,
  };

  const replacement = context.roomProfiles
    .filter((room) => !excludedRoomIds.has(room.id))
    .map((room) => ({
      room,
      score: getRoomScore(replacementContext, room),
      conflicts: context.conflictsByRoomId.get(room.id) ?? [],
    }))
    .filter((candidate) => Number.isFinite(candidate.score) && candidate.conflicts.length === 0)
    .sort((left, right) => left.score - right.score)[0];

  if (!replacement) {
    return null;
  }

  excludedRoomIds.add(replacement.room.id);

  return {
    assignmentId: assignment.id,
    activityType: activityType || 'study_group',
    previousRoomId: assignment.room_id,
    previousRoomNumber: assignment.room_number || currentRoom?.roomNumber || String(assignment.room_id),
    newRoomId: replacement.room.room.id,
    newRoomNumber: replacement.room.roomNumber,
    location: replacement.room.locationLabel,
    explanation: `הקבוצה שהייתה בחדר ${assignment.room_number || currentRoom?.roomNumber || assignment.room_id} הועברה לחדר ${replacement.room.roomNumber} (${replacement.room.locationLabel}).`,
  };
};

const tryResolveConflicts = (
  room: RoomProfile,
  conflicts: AssignmentRecord[],
  context: SchedulerContext
): { relocatedAssignments: RelocatedAssignment[]; alerts: string[] } | null => {
  if (conflicts.length === 0) {
    return { relocatedAssignments: [], alerts: [] };
  }

  const activityType = normalizeActivityType(context.request.activity_type);
  const grade = normalizeGrade(context.request.grade);

  let relocatable = false;
  let predicate: (assignment: AssignmentRecord) => boolean = () => false;
  let alertTitle = '';

  if (activityType === 'didactics' && isMonday(context.request.date) && grade === 'ה' && room.isHomeroom && room.homeroomGrade === 'ה') {
    relocatable = true;
    predicate = isDidacticsConflictRelocatable;
    alertTitle = 'נמצאה קבוצה אחרת בכיתת האם של שכבה ה\'. הקבוצה הקיימת תוזז לחדר חלופי.';
  } else if (activityType === 'exam_makeup' && (room.isHomeroom || room.isStudyRoom)) {
    relocatable = true;
    predicate = isMakeupConflictRelocatable;
    alertTitle = 'נמצאה הקבצה קיימת בחדר. ההקבצה תוזז לחדר חלופי כדי לפנות את החדר.';
  }

  if (!relocatable || conflicts.some((assignment) => !predicate(assignment))) {
    return null;
  }

  const excludedRoomIds = new Set<string>([room.id]);
  const relocatedAssignments: RelocatedAssignment[] = [];

  for (const conflict of conflicts) {
    const replacement = findReplacementRoom(conflict, context, excludedRoomIds);
    if (!replacement) {
      return null;
    }
    relocatedAssignments.push(replacement);
  }

  const alerts = [alertTitle, ...relocatedAssignments.map((item) => item.explanation)];
  return { relocatedAssignments, alerts };
};

export const scheduleRoomRequest = (
  request: RoomRequestSchedulingInput,
  rooms: RoomRecord[],
  homerooms: HomeroomRecord[],
  assignments: AssignmentRecord[]
): RoomRequestSchedulingResult => {
  const roomProfiles = buildRoomProfiles(rooms, homerooms);
  const conflictsByRoomId = buildConflictMap(request, assignments);
  const context: SchedulerContext = {
    request,
    roomProfiles,
    conflictsByRoomId,
    requestedRoomId: request.requested_room_id ? String(request.requested_room_id) : undefined,
  };

  if (!request.student_count || request.student_count < 1) {
    return {
      success: false,
      alerts: [],
      relocatedAssignments: [],
      alternatives: [],
      errors: ['יש להזין מספר תלמידים תקין.'],
    };
  }

  if (toMinutes(request.start_time) >= toMinutes(request.end_time)) {
    return {
      success: false,
      alerts: [],
      relocatedAssignments: [],
      alternatives: [],
      errors: ['שעת הסיום חייבת להיות אחרי שעת ההתחלה.'],
    };
  }

  const candidateResults: CandidateResult[] = [];

  roomProfiles.forEach((room) => {
    const score = getRoomScore(context, room);
    if (!Number.isFinite(score)) {
      return;
    }

    const conflicts = conflictsByRoomId.get(room.id) ?? [];
    const baseReasons = getBaseReasons(context, room, conflicts);

    if (conflicts.length === 0) {
      candidateResults.push({
        room,
        score,
        reasons: baseReasons,
        alerts: [],
        relocatedAssignments: [],
      });
      return;
    }

    const resolved = tryResolveConflicts(room, conflicts, context);
    if (!resolved) {
      return;
    }

    candidateResults.push({
      room,
      score: score + 0.5,
      reasons: [...baseReasons, 'החדר התפנה לאחר שיבוץ מחדש של קבוצה מתנגשת.'],
      alerts: resolved.alerts,
      relocatedAssignments: resolved.relocatedAssignments,
    });
  });

  candidateResults.sort((left, right) => left.score - right.score);

  const selected = candidateResults[0];

  if (!selected) {
    const projectorMessage = request.needs_projector
      ? 'לא נמצא חדר פנוי עם מקרן שמתאים לכללים שנבחרו.'
      : 'לא נמצא חדר פנוי שמתאים לכללי השיבוץ שנקבעו.';
    const oneOnOneMessage = normalizeActivityType(request.activity_type) === 'one_on_one'
      ? 'לא נמצא חדר פנוי לפגישה אישית. יש לפנות למרכזת כדי לבדוק אם החדר שלה פנוי.'
      : null;

    return {
      success: false,
      alerts: oneOnOneMessage ? [oneOnOneMessage] : [],
      relocatedAssignments: [],
      alternatives: [],
      errors: [projectorMessage],
    };
  }

  const alternatives = candidateResults
    .slice(1, 4)
    .map((candidate) => ({
      roomId: candidate.room.room.id,
      roomNumber: candidate.room.roomNumber,
      location: candidate.room.locationLabel,
      reasons: candidate.reasons.slice(0, 2),
    }));

  return {
    success: true,
    selectedRoom: selected.room.room,
    selectedRoomLocation: selected.room.locationLabel,
    selectedRoomReasons: selected.reasons,
    alerts: selected.alerts,
    relocatedAssignments: selected.relocatedAssignments,
    alternatives,
    errors: [],
  };
};

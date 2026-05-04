export interface StudyGroup {
  id: number;
  name: string;
  group_type: 'math' | 'english' | 'didactic' | 'other';
  grade_level: 'א' | 'ב' | 'ג' | 'ד' | 'ה' | 'ו';
  student_count: number;
  needs_projector: boolean;
  is_large_group: boolean;
  consecutive_hours: number; // למתמטיקה: 2 שעות רצופות
  preferred_room_type?: string;
  created_at: Date;
}

export interface GroupSchedule {
  id: number;
  group_id: number;
  day_of_week: number; // 1=ראשון, 7=שבת
  start_time: string;
  end_time: string;
  created_at: Date;
}

export interface GroupHomeroomAssignment {
  id: number;
  group_id: number;
  homeroom_id: number;
  created_at: Date;
}

export interface CreateStudyGroupData {
  name: string;
  group_type: StudyGroup['group_type'];
  grade_level: StudyGroup['grade_level'];
  student_count: number;
  needs_projector?: boolean;
  is_large_group?: boolean;
  consecutive_hours?: number;
  preferred_room_type?: string;
  schedules?: Omit<GroupSchedule, 'id' | 'group_id' | 'created_at'>[];
  homeroom_ids?: number[];
}

export interface UpdateStudyGroupData {
  name?: string;
  group_type?: StudyGroup['group_type'];
  grade_level?: StudyGroup['grade_level'];
  student_count?: number;
  needs_projector?: boolean;
  is_large_group?: boolean;
  consecutive_hours?: number;
  preferred_room_type?: string;
  homeroom_ids?: number[];
}

export interface StudyGroupWithSchedules extends StudyGroup {
  schedules: GroupSchedule[];
  homeroom_assignments: GroupHomeroomAssignment[];
  current_assignments?: Assignment[];
}

export interface Assignment {
  id: number;
  room_id: number;
  assignment_type_id: number;
  assignable_type: 'study_group' | 'one_on_one' | 'meeting' | 'event' | 'makeup_test' | 'camp_prep';
  assignable_id: number;
  title: string;
  description?: string;
  date: Date;
  start_time: string;
  end_time: string;
  requester_id: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'moved';
  is_recurring: boolean;
  recurring_pattern?: RecurringPattern;
  special_requirements?: SpecialRequirements;
  created_at: Date;
  updated_at: Date;
}

export interface RecurringPattern {
  type: 'weekly' | 'monthly';
  days_of_week?: number[];
  end_date?: string;
  max_occurrences?: number;
}

export interface SpecialRequirements {
  needs_projector?: boolean;
  is_large_group?: boolean;
  preferred_floor?: number;
  preferred_wing?: 'old' | 'new';
  avoid_rooms?: number[];
  min_capacity?: number;
}

export const GROUP_TYPE_DISPLAY: Record<StudyGroup['group_type'], string> = {
  'math': 'מתמטיקה',
  'english': 'אנגלית',
  'didactic': 'דידקטיקה',
  'other': 'אחר'
};

export const DAY_OF_WEEK_DISPLAY: Record<number, string> = {
  1: 'ראשון',
  2: 'שני',
  3: 'שלישי',
  4: 'רביעי',
  5: 'חמישי',
  6: 'שישי',
  7: 'שבת'
};

export function getGroupScheduleRequirements(group: StudyGroup): {
  needsConsecutiveHours: boolean;
  preferredDays: number[];
  avoidDays: number[];
  timePreferences: {
    morning: boolean;
    afternoon: boolean;
  };
} {
  const requirements = {
    needsConsecutiveHours: group.group_type === 'math' && group.consecutive_hours > 1,
    preferredDays: [1, 2, 3, 4, 5], // ימים א-ה
    avoidDays: [] as number[],
    timePreferences: {
      morning: true,
      afternoon: true
    }
  };

  // כללים מיוחדים
  if (group.group_type === 'math') {
    // מתמטיקה: פעמיים בשבוע, 2 שעות רצופות
    requirements.needsConsecutiveHours = true;
  } else if (group.group_type === 'english') {
    // אנגלית: מפוזר יותר
    requirements.preferredDays = [1, 3, 5]; // ראשון, שלישי, חמישי
  }

  // שכבה ה' - אין שיבוץ ביום שני
  if (group.grade_level === 'ה') {
    requirements.avoidDays.push(2); // יום שני
  }

  return requirements;
}

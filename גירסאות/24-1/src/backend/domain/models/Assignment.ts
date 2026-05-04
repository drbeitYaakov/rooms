export interface Assignment {
  id: number;
  room_id: number;
  assignment_type_id: number;
  assignable_type: 'study_group' | 'one_on_one' | 'meeting' | 'event' | 'makeup_test' | 'camp_prep' | 'gymnastics' | 'lecture';
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

export interface AssignmentType {
  id: number;
  code: string;
  name: string;
  description?: string;
  color: string;
}

export interface TemporaryAssignment {
  id: number;
  room_id: number;
  assignment_type_id: number;
  title: string;
  description?: string;
  start_date: Date;
  end_date: Date;
  start_time: string;
  end_time: string;
  requester_id: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  needs_projector: boolean;
  is_large_group: boolean;
  created_at: Date;
}

export interface RecurringPattern {
  type: 'weekly' | 'monthly';
  days_of_week?: number[];
  end_date?: string;
  max_occurrences?: number;
  interval?: number; // כל כמה ימים/שבועות
}

export interface SpecialRequirements {
  needs_projector?: boolean;
  is_large_group?: boolean;
  preferred_floor?: number;
  preferred_wing?: 'old' | 'new';
  avoid_rooms?: number[];
  min_capacity?: number;
  max_capacity?: number;
  accessibility_needed?: boolean;
  special_equipment?: string[];
}

export interface CreateAssignmentData {
  room_id: number;
  assignment_type_id: number;
  assignable_type: Assignment['assignable_type'];
  assignable_id: number;
  title: string;
  description?: string;
  date: string;
  start_time: string;
  end_time: string;
  requester_id: number;
  is_recurring?: boolean;
  recurring_pattern?: RecurringPattern;
  special_requirements?: SpecialRequirements;
  type?: string; // one_time or recurring
  days_of_week?: number[]; // For recurring assignments
  end_date?: string; // For recurring assignments
}

export interface UpdateAssignmentData {
  room_id?: number;
  title?: string;
  description?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  status?: Assignment['status'];
  special_requirements?: SpecialRequirements;
}

export interface CreateTemporaryAssignmentData {
  room_id?: number;
  assignment_type_id: number;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  requester_id: number;
  needs_projector?: boolean;
  is_large_group?: boolean;
  special_requirements?: {
    preferred_floor?: number;
    preferred_wing?: 'old' | 'new';
    avoid_rooms?: number[];
    min_capacity?: number;
  };
}

export interface AssignmentWithDetails extends Assignment {
  room: {
    id: number;
    room_number: string;
    room_type: string;
    floor: number;
    wing: string;
  };
  assignment_type: AssignmentType;
  requester: {
    id: number;
    full_name: string;
    email: string;
  };
  assignable_details?: any; // Based on assignable_type
}

export interface ConflictInfo {
  assignment1: Assignment;
  assignment2: Assignment;
  conflict_type: 'double_booking' | 'overlap' | 'capacity_exceeded';
  severity: 'low' | 'medium' | 'high';
  suggested_solution: string;
}

export interface RoomUsageLog {
  id: number;
  room_id: number;
  assignment_id: number;
  usage_count: number;
  log_date: Date;
  created_at: Date;
}

export const ASSIGNMENT_TYPE_DISPLAY: Record<Assignment['assignable_type'], string> = {
  'study_group': 'הקבצה',
  'one_on_one': 'פגישה אישית',
  'meeting': 'פגישה',
  'event': 'אירוע',
  'makeup_test': 'השלמת מבחן',
  'camp_prep': 'הכנה למחנה',
  'gymnastics': 'התעמלות',
  'lecture': 'הרצאה'
};

export const STATUS_DISPLAY: Record<Assignment['status'], string> = {
  'scheduled': 'מתוזמן',
  'completed': 'הושלם',
  'cancelled': 'בוטל',
  'moved': 'הועבר'
};

export function checkTimeConflict(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  // Convert times to minutes for comparison
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const s1 = toMinutes(start1);
  const e1 = toMinutes(end1);
  const s2 = toMinutes(start2);
  const e2 = toMinutes(end2);

  return (s1 < e2 && s2 < e1); // Overlap exists
}

export function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime}-${endTime}`;
}

export function getAssignmentDuration(startTime: string, endTime: string): number {
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  return toMinutes(endTime) - toMinutes(startTime);
}

export function isAssignmentValid(assignment: CreateAssignmentData): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Basic validation
  if (!assignment.title.trim()) {
    errors.push('שם השיבוץ הוא חובה');
  }

  if (!assignment.date) {
    errors.push('תאריך הוא חובה');
  }

  if (!assignment.start_time || !assignment.end_time) {
    errors.push('שעות התחלה וסיום הן חובה');
  }

  // Time validation
  if (assignment.start_time && assignment.end_time) {
    if (checkTimeConflict(assignment.start_time, assignment.end_time, assignment.start_time, assignment.end_time)) {
      if (assignment.start_time >= assignment.end_time) {
        errors.push('שעת סיום חייבת להיות אחרי שעת התחלה');
      }
    }
  }

  // Date validation
  if (assignment.date) {
    const assignmentDate = new Date(assignment.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (assignmentDate < today) {
      errors.push('לא ניתן לקבוע שיבוץ בתאריך בעבר');
    }
  }

  // Special requirements validation
  if (assignment.special_requirements) {
    if (assignment.special_requirements.min_capacity && assignment.special_requirements.max_capacity) {
      if (assignment.special_requirements.min_capacity > assignment.special_requirements.max_capacity) {
        errors.push('תכולה מינימלית לא יכולה להיות גדולה מתכולה מקסימלית');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

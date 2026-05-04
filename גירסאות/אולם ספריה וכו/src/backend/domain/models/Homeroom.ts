import { Room } from './Room';
import {
  DEFAULT_HOMEROOM_END_TIME,
  DEFAULT_HOMEROOM_START_TIME
} from '../../utils/homeroomDefaults';

export interface Homeroom {
  id: number;
  room_id: number;
  grade_id: number;
  class_number: number; // 1-7
  teacher_id?: number;
  max_students: number;
  current_students: number;
  school_year: string; // תשפ"ד
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Grade {
  id: number;
  name: 'א' | 'ב' | 'ג' | 'ד' | 'ה' | 'ו';
  coordinator_id?: number;
  created_at: Date;
}

export interface CreateHomeroomData {
  room_id: string; // UUID
  grade_id: string; // UUID
  class_number: number | string;
  teacher_id?: number | string;
  max_students?: number | string;
  school_year: string;
  is_active?: boolean;
}

export interface UpdateHomeroomData {
  room_id?: number;
  teacher_id?: number;
  max_students?: number;
  current_students?: number;
  is_active?: boolean;
}

export interface HomeroomWithDetails extends Homeroom {
  room: Room;
  grade: Grade;
  teacher?: {
    id: number;
    full_name: string;
    email: string;
  };
  current_assignments?: any[];
}

export interface GradeWithHomerooms extends Grade {
  homerooms: Homeroom[];
  coordinator?: {
    id: number;
    full_name: string;
    email: string;
  };
}

export const GRADE_DISPLAY: Record<Grade['name'], string> = {
  'א': 'שכבה א',
  'ב': 'שכבה ב',
  'ג': 'שכבה ג',
  'ד': 'שכבה ד',
  'ה': 'שכבה ה',
  'ו': 'שכבה ו'
};

export function getHomeroomName(homeroom: Homeroom): string {
  const gradeMap: Record<number, string> = {
    1: 'א',
    2: 'ב',
    3: 'ג',
    4: 'ד',
    5: 'ה',
    6: 'ו'
  };
  const gradeKey =
    (homeroom as Homeroom & { grade_name?: Grade['name'] }).grade_name ||
    gradeMap[homeroom.grade_id as unknown as number];
  return `${gradeKey ?? ''}${homeroom.class_number}`;
}

export function getSchoolYear(): string {
  const now = new Date();
  const year = now.getFullYear();

  // Hebrew year calculation (approximate)
  const hebrewYear = year + 3760;

  return `תש${hebrewYear.toString().slice(-2)}`;
}

export function isHomeroomAvailable(
  homeroom: Homeroom,
  date: Date,
  startTime: string,
  endTime: string
): boolean {
  void homeroom;
  const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday

  if (dayOfWeek === 6) {
    return false;
  }

  return startTime >= DEFAULT_HOMEROOM_START_TIME && endTime <= DEFAULT_HOMEROOM_END_TIME;
}

export function getHomeroomSchedule(
  homeroom: Homeroom,
  date: Date
): {
  isAvailable: boolean;
  availableSlots: Array<{
    start: string;
    end: string;
  }>;
} {
  void homeroom;
  const dayOfWeek = date.getDay();

  if (dayOfWeek === 6) {
    return {
      isAvailable: false,
      availableSlots: []
    };
  }

  return {
    isAvailable: true,
    availableSlots: [
      {
        start: DEFAULT_HOMEROOM_START_TIME,
        end: DEFAULT_HOMEROOM_END_TIME
      }
    ]
  };
}

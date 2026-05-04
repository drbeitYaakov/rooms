import { Room } from './Room';

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
  const gradeName = GRADE_DISPLAY[gradeMap[homeroom.grade_id] as Grade['name']];
  return `${gradeName} ${homeroom.class_number}`;
}

export function getSchoolYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const nextYear = year + 1;
  
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
  // כיתת אם פעילה 8:00-14:45 בימים א-ה, עד 12:00 ביום שישי
  const dayOfWeek = date.getDay(); // 0=ראשון, 6=שבת
  const dayNum = dayOfWeek === 0 ? 1 : dayOfWeek + 1; // Convert to 1-7 format
  
  // ימי שישי (6) - עד 12:00
  if (dayNum === 6) {
    return endTime <= '12:00';
  }
  
  // ימים א-ה - עד 14:45
  if (dayNum >= 1 && dayNum <= 5) {
    return startTime >= '08:00' && endTime <= '14:45';
  }
  
  // שבת - לא פעיל
  return false;
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
  const dayOfWeek = date.getDay();
  const dayNum = dayOfWeek === 0 ? 1 : dayOfWeek + 1;
  
  if (dayNum === 7) { // שבת
    return {
      isAvailable: false,
      availableSlots: []
    };
  }
  
  const endTime = dayNum === 6 ? '12:00' : '14:45';
  
  return {
    isAvailable: true,
    availableSlots: [
      {
        start: '08:00',
        end: endTime
      }
    ]
  };
}

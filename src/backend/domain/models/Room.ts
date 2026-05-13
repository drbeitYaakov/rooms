export interface Room {
  id: string; // Changed from number to string (UUID)
  room_number: string;
  room_type: RoomType;
  floor: number;
  wing: 'old' | 'new';
  capacity: number;
  has_projector: boolean;
  is_small: boolean;
  comfort_priority: number; // 0-נמוך, 1-בינוני, 2-גבוה
  special_notes?: string;
  is_active: boolean;
  created_at: Date;
}

export function isMamadRoom(roomNumber: string): boolean {
  return roomNumber.length >= 3 && roomNumber[1] === '0';
}

export type RoomType = 
  | 'CLASSROOM_A' | 'CLASSROOM_B' | 'CLASSROOM_C' | 'CLASSROOM_D' | 'CLASSROOM_E' | 'CLASSROOM_F'
  | 'computer_lab' | 'study_room' | 'music_room' | 'auditorium' | 'library' | 'corridor';

export interface CreateRoomData {
  room_number: string;
  room_type: RoomType;
  floor: number;
  wing: 'old' | 'new';
  capacity: number;
  has_projector?: boolean;
  is_small?: boolean;
  comfort_priority?: number;
  special_notes?: string;
}

export interface UpdateRoomData {
  room_number?: string;
  room_type?: RoomType;
  floor?: number;
  wing?: 'old' | 'new';
  capacity?: number;
  has_projector?: boolean;
  is_small?: boolean;
  comfort_priority?: number;
  special_notes?: string;
  is_active?: boolean;
}

export interface RoomWithAvailability extends Room {
  is_available: boolean;
  next_available?: Date;
  current_assignment?: {
    title: string;
    end_time: string;
  };
}

export interface RoomLocation {
  floor: number;
  wing: 'old' | 'new';
  section: 'right' | 'left' | 'center';
}

export function getRoomLocation(roomNumber: string): RoomLocation {
  if (!roomNumber || roomNumber.length < 3) {
    throw new Error('Invalid room number format');
  }
  
  const floor = parseInt(roomNumber[0]);
  if (isNaN(floor) || floor < 1 || floor > 5) {
    throw new Error('Room number should start with digit 1-5');
  }
  
  // Wing determination based on middle digit
  const middleDigit = parseInt(roomNumber[1]);
  let wing: 'old' | 'new';
  
  if (middleDigit === 0) {
    // Special case: middle digit 0 means it's a MAMAD (ממ"ד) - always in old wing center
    wing = 'old';
  } else if (middleDigit === 1 || middleDigit === 2) {
    wing = 'old';
  } else if (middleDigit === 3 || middleDigit === 4) {
    wing = 'new';
  } else {
    // Default to old wing for other cases
    wing = 'old';
  }
  
  // Side determination based on last digit
  const lastDigit = parseInt(roomNumber.slice(-1));
  let section: 'right' | 'left' | 'center';
  
  if (wing === 'new') {
    // New wing has no sides - always center
    section = 'center';
  } else if (middleDigit === 0) {
    // MAMAD rooms (middle digit 0) are always in center
    section = 'center';
  } else {
    // Old wing regular rooms - left/right based on last digit
    section = lastDigit % 2 === 0 ? 'right' : 'left';
  }
  
  return { floor, wing, section };
}

export function formatRoomLocation(room: Room): string {
  const location = getRoomLocation(room.room_number);
  const wingName = location.wing === 'new' ? 'חדש' : 'ישן';
  
  // New wing rooms don't have side designations
  if (location.wing === 'new') {
    return `קומה ${location.floor}, אגף ${wingName}`;
  }
  
  // Old wing rooms have side designations
  let sectionName;
  if (location.section === 'right') {
    sectionName = 'ימין';
  } else if (location.section === 'left') {
    sectionName = 'שמאל';
  } else {
    sectionName = 'מרכז';
  }
  
  return `קומה ${location.floor}, אגף ${wingName}, צד ${sectionName}`;
}

export const ROOM_TYPE_DISPLAY: Record<RoomType, string> = {
  'CLASSROOM_A': 'כיתת אם שכבה א',
  'CLASSROOM_B': 'כיתת אם שכבה ב',
  'CLASSROOM_C': 'כיתת אם שכבה ג',
  'CLASSROOM_D': 'כיתת אם שכבה ד',
  'CLASSROOM_E': 'כיתת אם שכבה ה',
  'CLASSROOM_F': 'כיתת אם שכבה ו',
  'computer_lab': 'ממ"ד',
  'study_room': 'חדר הקבצה',
  'music_room': 'חדר מוזיקה',
  'auditorium': 'אולם גדול',
  'library': 'ספריה',
  'corridor': 'קרוון'
};

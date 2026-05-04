import { RoomType, Wing, Side, Priority, GradeLevel, RoomFeatures } from '../types';

export interface Room {
  id: string;
  roomNumber: string;
  floor: number;
  wing: Wing;
  side?: Side;
  roomType: RoomType;
  hasProjector: boolean;
  isSmall: boolean;
  capacity: number;
  priority: Priority;
  reservedFor?: string[];
  gradeLevel?: GradeLevel;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class RoomEntity implements Room {
  constructor(
    public id: string,
    public roomNumber: string,
    public floor: number,
    public wing: Wing,
    public roomType: RoomType,
    public hasProjector: boolean,
    public isSmall: boolean,
    public capacity: number,
    public priority: Priority = 'normal',
    public side?: Side,
    public reservedFor?: string[],
    public gradeLevel?: GradeLevel,
    public notes?: string,
    public isActive: boolean = true,
    public createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  // Static factory method to create room from room number
  static fromRoomNumber(roomNumber: string, overrides: Partial<Room> = {}): RoomEntity {
    const digits = roomNumber.replace(/\D/g, '');
    const floor = parseInt(digits[0]) || 1;
    const middleDigit = parseInt(digits[1]) || 0;
    const lastDigit = parseInt(digits[digits.length - 1]) || 0;
    
    // Determine wing from middle digit
    const wing: Wing = middleDigit >= 3 ? 'new' : 'old';
    
    // Determine side for old wing from last digit
    const side = wing === 'old' ? (lastDigit % 2 === 0 ? 'right' : 'left') : undefined;
    
    // Determine room type and special rules
    let roomType: RoomType = 'regular';
    let priority: Priority = 'normal';
    let isSmall = false;
    
    if (roomNumber.includes('ממ"ד') || middleDigit === 0) {
      roomType = 'mamad';
      priority = 'low';
    } else if (roomNumber === '302' || roomNumber === '332') {
      priority = 'low';
    } else if (roomNumber === '304' || roomNumber === '504' || roomNumber === '413') {
      isSmall = true;
    } else if (roomNumber.includes('אולם') || roomNumber.includes('גדול')) {
      roomType = 'large_hall';
    } else if (roomNumber.includes('ספריה')) {
      roomType = 'library';
    } else if (roomNumber.includes('מוזיקה')) {
      roomType = 'music';
    } else if (roomNumber.includes('קרוון')) {
      roomType = 'caravan';
    }
    
    return new RoomEntity(
      overrides.id || '',
      roomNumber,
      floor,
      wing,
      roomType,
      overrides.hasProjector ?? false,
      isSmall,
      overrides.capacity ?? 30,
      priority,
      side,
      overrides.reservedFor,
      overrides.gradeLevel,
      overrides.notes,
      overrides.isActive ?? true,
      overrides.createdAt,
      overrides.updatedAt
    );
  }

  // Check if room is suitable for specific requirements
  isSuitableFor(requirements: {
    studentCount: number;
    needsProjector?: boolean;
    subject?: string;
    activityType?: string;
    gradeLevel?: GradeLevel;
  }): boolean {
    // Capacity check
    if (this.capacity < requirements.studentCount) {
      return false;
    }
    
    // Projector requirement
    if (requirements.needsProjector && !this.hasProjector) {
      return false;
    }
    
    // Room type restrictions
    if (this.roomType === 'music' && requirements.activityType !== 'personal_meeting') {
      return false;
    }
    
    // Grade-specific restrictions
    if (this.gradeLevel && requirements.gradeLevel && this.gradeLevel !== requirements.gradeLevel) {
      return false;
    }
    
    // Reserved for specific activities
    if (this.reservedFor && requirements.activityType && !this.reservedFor.includes(requirements.activityType)) {
      return false;
    }
    
    return true;
  }

  // Calculate room priority score for assignment
  calculatePriorityScore(requirements: {
    studentCount: number;
    subject?: string;
    isStudyGroup?: boolean;
    isPE?: boolean;
    gradeLevel?: GradeLevel;
  }): number {
    let score = 0;
    
    // Base priority
    switch (this.priority) {
      case 'high': score += 100; break;
      case 'normal': score += 50; break;
      case 'low': score += 10; break;
    }
    
    // Study group priority cascade
    if (requirements.isStudyGroup) {
      if (this.roomType === 'homeroom') score += 80;
      else if (this.roomType === 'study_group') score += 60;
      else if (this.roomType === 'mamad') score += 20;
    }
    
    // PE priority
    if (requirements.isPE) {
      if (this.roomType === 'large_hall') score += 90;
      else if (this.roomType === 'library' && requirements.gradeLevel === 'א') score += 70;
    }
    
    // Subject-specific preferences
    if (requirements.subject === 'english' && this.roomNumber === '302') {
      score += 15; // Slight preference for room 302 for English
    }
    
    // Capacity efficiency (prefer rooms that aren't too big)
    const efficiency = 1 - Math.abs(this.capacity - requirements.studentCount) / this.capacity;
    score += efficiency * 30;
    
    // Penalty for small rooms with large groups
    if (this.isSmall && requirements.studentCount > 25) {
      score -= 40;
    }
    
    return Math.max(0, score);
  }

  // Get room location description
  getLocationDescription(): string {
    const sideText = this.side ? (this.side === 'left' ? 'שמאל' : 'ימין') : '';
    const wingText = this.wing === 'new' ? 'חדש' : 'ישן';
    
    return `קומה ${this.floor}, אגף ${wingText}${sideText ? ` (${sideText})` : ''}`;
  }

  // Check if room needs maintenance alert
  needsMaintenanceAlert(usageCount: number): boolean {
    return usageCount >= 4;
  }
}

import { 
  AssignmentType, 
  AssignableType, 
  ActivityType, 
  AssignmentStatus, 
  TimeSlot, 
  DayOfWeek 
} from '../types';

export interface Assignment {
  id: string;
  type: AssignmentType;
  assignableType: AssignableType;
  assignableId: string;
  roomId: string;
  startDate: Date;
  endDate?: Date;
  weekCount?: number;
  specificDate?: Date;
  daysOfWeek: DayOfWeek[];
  timeSlots: TimeSlot[];
  activityType: ActivityType;
  createdBy: string;
  modifiedBy?: string;
  isManual: boolean;
  overrideReason?: string;
  status: AssignmentStatus;
  conflictsWith?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class AssignmentEntity implements Assignment {
  constructor(
    public id: string,
    public type: AssignmentType,
    public assignableType: AssignableType,
    public assignableId: string,
    public roomId: string,
    public startDate: Date,
    public daysOfWeek: DayOfWeek[],
    public timeSlots: TimeSlot[],
    public activityType: ActivityType,
    public createdBy: string,
    public endDate?: Date,
    public weekCount?: number,
    public specificDate?: Date,
    public modifiedBy?: string,
    public isManual: boolean = false,
    public overrideReason?: string,
    public status: AssignmentStatus = 'active',
    public conflictsWith?: string[],
    public createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  // Check if assignment conflicts with another assignment
  hasConflictWith(other: Assignment): boolean {
    if (this.roomId !== other.roomId) return false;
    if (this.status !== 'active' || other.status !== 'active') return false;
    
    // Check date overlap
    if (!this.datesOverlap(other)) return false;
    
    // Check day overlap
    const hasDayOverlap = this.daysOfWeek.some(day => other.daysOfWeek.includes(day));
    if (!hasDayOverlap) return false;
    
    // Check time overlap
    return this.timeSlots.some(slot1 => 
      other.timeSlots.some(slot2 => this.timeSlotsOverlap(slot1, slot2))
    );
  }

  // Check if date ranges overlap
  private datesOverlap(other: Assignment): boolean {
    const thisEnd = this.endDate || new Date('2099-12-31');
    const otherEnd = other.endDate || new Date('2099-12-31');
    
    return this.startDate <= otherEnd && other.startDate <= thisEnd;
  }

  // Check if two time slots overlap
  private timeSlotsOverlap(slot1: TimeSlot, slot2: TimeSlot): boolean {
    const start1 = this.timeToMinutes(slot1.start);
    const end1 = this.timeToMinutes(slot1.end);
    const start2 = this.timeToMinutes(slot2.start);
    const end2 = this.timeToMinutes(slot2.end);
    
    return start1 < end2 && start2 < end1;
  }

  // Convert time string to minutes
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Check if assignment is active on specific date and time
  isActiveAt(date: Date, time: string): boolean {
    if (this.status !== 'active') return false;
    
    // Check date range
    if (date < this.startDate) return false;
    if (this.endDate && date > this.endDate) return false;
    
    // Check specific date for one-time assignments
    if (this.type === 'one_time' && this.specificDate) {
      return date.toDateString() === this.specificDate.toDateString();
    }
    
    // Check day of week
    const dayName = this.getDayName(date.getDay());
    if (!this.daysOfWeek.includes(dayName as DayOfWeek)) return false;
    
    // Check time slot
    const timeMinutes = this.timeToMinutes(time);
    return this.timeSlots.some(slot => {
      const start = this.timeToMinutes(slot.start);
      const end = this.timeToMinutes(slot.end);
      return timeMinutes >= start && timeMinutes < end;
    });
  }

  // Get day name from day number
  private getDayName(dayNumber: number): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[dayNumber];
  }

  // Check if assignment follows consecutive lessons rule (for math)
  hasConsecutiveLessons(): boolean {
    if (this.timeSlots.length < 2) return true;
    
    // Sort time slots by start time
    const sortedSlots = [...this.timeSlots].sort((a, b) => 
      this.timeToMinutes(a.start) - this.timeToMinutes(b.start)
    );
    
    // Check if each slot starts immediately after the previous one ends
    for (let i = 1; i < sortedSlots.length; i++) {
      const prevEnd = this.timeToMinutes(sortedSlots[i - 1].end);
      const currStart = this.timeToMinutes(sortedSlots[i].start);
      
      if (currStart !== prevEnd) return false;
    }
    
    return true;
  }

  // Get duration in minutes
  getDuration(): number {
    return this.timeSlots.reduce((total, slot) => {
      const start = this.timeToMinutes(slot.start);
      const end = this.timeToMinutes(slot.end);
      return total + (end - start);
    }, 0);
  }

  // Check if assignment violates Friday time rule
  violatesFridayRule(): boolean {
    if (!this.daysOfWeek.includes('friday')) return false;
    
    return this.timeSlots.some(slot => {
      const end = this.timeToMinutes(slot.end);
      return end > this.timeToMinutes('12:00');
    });
  }

  // Check if assignment is for Grade 5 on Monday (should be avoided)
  isGrade5OnMonday(): boolean {
    return this.daysOfWeek.includes('monday') && 
           this.activityType === 'homeroom' &&
           this.assignableType === 'homeroom';
  }

  // Get assignment description
  getDescription(): string {
    const typeText = this.getTypeText();
    const daysText = this.daysOfWeek.join(', ');
    const timeText = this.timeSlots.map(slot => `${slot.start}-${slot.end}`).join(', ');
    
    return `${typeText} - ${daysText} ${timeText}`;
  }

  // Get human-readable type text
  private getTypeText(): string {
    const typeMap = {
      'homeroom': 'כיתת אם',
      'study_group': 'הקבצה',
      'meeting': 'פגישה',
      'one_on_one': 'אחד על אחד',
      'discussion_topics': 'שיח / סוגיות',
      'event': 'אירוע',
      'PE': 'התעמלות',
      'high_school_pe': 'התעמלות תיכון',
      'didactics': 'דידקטיקה',
      'exam_makeup': 'השלמת מבחן'
    };
    
    return typeMap[this.assignableType] || this.assignableType;
  }

  // Clone assignment with modifications
  clone(modifications: Partial<Assignment>): AssignmentEntity {
    return new AssignmentEntity(
      modifications.id || this.id,
      modifications.type || this.type,
      modifications.assignableType || this.assignableType,
      modifications.assignableId || this.assignableId,
      modifications.roomId || this.roomId,
      modifications.startDate || this.startDate,
      modifications.daysOfWeek || this.daysOfWeek,
      modifications.timeSlots || this.timeSlots,
      modifications.activityType || this.activityType,
      modifications.createdBy || this.createdBy,
      modifications.endDate || this.endDate,
      modifications.weekCount || this.weekCount,
      modifications.specificDate || this.specificDate,
      modifications.modifiedBy || this.modifiedBy,
      modifications.isManual ?? this.isManual,
      modifications.overrideReason || this.overrideReason,
      modifications.status || this.status,
      modifications.conflictsWith || this.conflictsWith,
      this.createdAt,
      new Date()
    );
  }
}

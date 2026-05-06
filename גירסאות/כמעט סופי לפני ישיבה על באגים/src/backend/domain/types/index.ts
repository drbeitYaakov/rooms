export type UserRole = 'admin' | 'grade_coordinator' | 'study_groups_coordinator' | 'general_user';
export type RoomType = 'mamad' | 'study_group' | 'music' | 'caravan' | 'large_hall' | 'library' | 'homeroom' | 'regular';
export type Wing = 'old' | 'new';
export type Side = 'left' | 'right';
export type Priority = 'low' | 'normal' | 'high';
export type GradeLevel = 'א' | 'ב' | 'ג' | 'ד' | 'ה' | 'ו';
export type AssignmentType = 'permanent' | 'temporary' | 'one_time';
export type AssignableType = 'homeroom' | 'study_group' | 'event' | 'PE' | 'didactics' | 'exam_makeup' | 'one_on_one' | 'discussion_topics' | 'high_school_pe';
export type ActivityType = 'didactics' | 'exam_makeup' | 'discussion' | 'topics' | 'insights' | 'camp_prep' | 'tracks' | 'personal_meeting' | 'one_on_one' | 'event' | 'study_group' | 'homeroom' | 'PE' | 'high_school_pe';
export type Subject = 'math' | 'english' | 'science' | 'other';
export type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
export type AssignmentStatus = 'active' | 'cancelled' | 'completed' | 'conflict';
export type ReassignmentReason = 'didactics' | 'event' | 'manual' | 'conflict_resolution';
export type NotificationType = 'room_usage_alert' | 'reassignment' | 'conflict' | 'event_reminder' | 'cleanup_alert';
export type TriggeredBy = 'usage_count' | 'event' | 'manual' | 'system';
export type AuditAction = 'create' | 'update' | 'delete' | 'override';
export type EntityType = 'assignment' | 'room' | 'group' | 'rule' | 'user' | 'grade' | 'homeroom';

export interface TimeSlot {
  start: string; // HH:MM format
  end: string;   // HH:MM format
}

export interface Schedule {
  days: DayOfWeek[];
  timeSlots: TimeSlot[];
}

export interface RoomFeatures {
  hasProjector: boolean;
  isSmall: boolean;
  capacity: number;
  priority: Priority;
  reservedFor?: string[];
  gradeLevel?: GradeLevel;
}

export interface RoomSpecificRules {
  mamadLowPriority: boolean;
  room302LowPriority: boolean;
  rooms304_504Small: boolean;
  largeHallReserved: boolean;
  libraryPriority: boolean;
  musicRoomRestricted: boolean;
}

export interface AssignmentRequest {
  assignableType: AssignableType;
  assignableId: string;
  studentCount: number;
  subject?: Subject;
  schedule: Schedule;
  startDate: Date;
  endDate?: Date;
  specificDate?: Date;
  weekCount?: number;
  activityType: ActivityType;
  requiresConsecutive?: boolean;
  preferredRoomId?: string;
  isManual?: boolean;
  overrideReason?: string;
  daysOfWeek?: DayOfWeek[]; // For backward compatibility
}

export interface AssignmentResult {
  success: boolean;
  assignment?: Assignment;
  alternativeRooms?: Room[];
  conflicts?: Conflict[];
  errors?: string[];
  explanation?: string;
}

export interface Conflict {
  type: 'room_double_booked' | 'group_double_booked' | 'exceeds_capacity' | 'room_reserved' | 'grade_rule_violation' | 'time_constraint_violation';
  assignmentId: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  suggestions?: string[];
}

export interface RoomPriority {
  roomId: string;
  score: number;
  reasons: string[];
}

export interface ReassignmentRequest {
  assignmentId: string;
  reason: ReassignmentReason;
  newTimeSlot?: TimeSlot;
  requirements?: AssignmentRequest;
}

export interface NotificationData {
  type: NotificationType;
  recipientRoles: UserRole[];
  recipientIds?: string[];
  title: string;
  message: string;
  metadata?: any;
  triggeredBy: TriggeredBy;
  threshold?: number;
}

export interface AuditLogData {
  userId: string;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  changes: {
    before: any;
    after: any;
  };
  ipAddress?: string;
  userAgent?: string;
}

export type WeeklySchedule = {
  [key in DayOfWeek]: Assignment[];
};

export interface RoomUsageStats {
  roomId: string;
  totalUsage: number;
  weeklyUsage: number;
  monthlyUsage: number;
  utilizationRate: number;
  peakTimes: TimeSlot[];
  maintenanceAlerts: number;
}

export interface GradeSpecificRules {
  grade_ה_avoid_monday: boolean;
  friday_end_time: string;
  default_schedule: {
    start_time: string;
    end_time: string;
  };
}

export interface SystemMetrics {
  totalAssignments: number;
  activeConflicts: number;
  roomUtilization: number;
  pendingRequests: number;
  systemHealth: 'healthy' | 'warning' | 'critical';
}

// Forward declarations for entity types
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

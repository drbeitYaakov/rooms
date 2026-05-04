export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "grade_coordinator" | "study_groups_coordinator" | "general_user";
  gradeId?: string;
}

export interface Room {
  id: string;
  roomNumber: string;
  floor: number;
  wing: "old" | "new";
  side?: "left" | "right";
  roomType: "mamad" | "study_group" | "music" | "caravan" | "large_hall" | "library" | "homeroom" | "regular";
  hasProjector: boolean;
  isSmall: boolean;
  capacity: number;
  priority: "low" | "normal" | "high";
  reservedFor?: string[];
  gradeLevel?: string;
  notes?: string;
  isActive: boolean;
}

export interface Assignment {
  id: string;
  type: "permanent" | "temporary" | "one_time";
  assignableType: "homeroom" | "study_group" | "meeting" | "event" | "PE" | "didactics" | "exam_makeup";
  assignableId: string;
  roomId: string;
  startDate: string;
  endDate?: string;
  weekCount?: number;
  specificDate?: string;
  daysOfWeek: string[];
  timeSlots: { start: string; end: string }[];
  activityType: string;
  createdBy: string;
  modifiedBy?: string;
  isManual: boolean;
  overrideReason?: string;
  status: "active" | "cancelled" | "completed" | "conflict";
  conflictsWith?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentRequest {
  assignableType: string;
  assignableId: string;
  studentCount: number;
  subject?: string;
  schedule: {
    days: string[];
    timeSlots: { start: string; end: string }[];
  };
  startDate: string;
  endDate?: string;
  specificDate?: string;
  weekCount?: number;
  activityType: string;
  requiresConsecutive?: boolean;
  preferredRoomId?: string;
  isManual?: boolean;
  overrideReason?: string;
}

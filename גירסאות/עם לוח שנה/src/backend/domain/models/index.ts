// Export all models for easy importing
export type { User, CreateUserData, UpdateUserData, LoginCredentials, UserResponse } from './User';
export type { Room, RoomType, CreateRoomData, UpdateRoomData, RoomWithAvailability, RoomLocation } from './Room';
export type { 
  StudyGroup, 
  GroupSchedule, 
  GroupHomeroomAssignment, 
  CreateStudyGroupData, 
  UpdateStudyGroupData,
  StudyGroupWithSchedules
} from './StudyGroup';
export { 
  GROUP_TYPE_DISPLAY, 
  DAY_OF_WEEK_DISPLAY, 
  getGroupScheduleRequirements 
} from './StudyGroup';
export type { Homeroom, Grade, CreateHomeroomData, UpdateHomeroomData, HomeroomWithDetails, GradeWithHomerooms } from './Homeroom';
export { 
  GRADE_DISPLAY, 
  getHomeroomName, 
  getSchoolYear, 
  isHomeroomAvailable, 
  getHomeroomSchedule 
} from './Homeroom';
export type { 
  Assignment, 
  AssignmentType, 
  TemporaryAssignment, 
  CreateAssignmentData, 
  UpdateAssignmentData,
  CreateTemporaryAssignmentData,
  AssignmentWithDetails,
  ConflictInfo,
  RoomUsageLog
} from './Assignment';
export { 
  ASSIGNMENT_TYPE_DISPLAY, 
  STATUS_DISPLAY, 
  checkTimeConflict, 
  formatTimeRange, 
  getAssignmentDuration, 
  isAssignmentValid 
} from './Assignment';
export { 
  ROOM_TYPE_DISPLAY, 
  getRoomLocation, 
  formatRoomLocation 
} from './Room';

// Export shared types with aliases to avoid conflicts
export type { RecurringPattern } from './Assignment';
export type { SpecialRequirements } from './Assignment';

// Export scheduling engine types
export { SchedulingEngine } from '../scheduling/schedulingEngine';
export type { SchedulingResult } from '../scheduling/schedulingEngine';

import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest, requireCoordinator } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { logScheduling, logConflict } from '../../utils/logger';
import { SchedulingEngine } from '../../domain/scheduling/schedulingEngine';
import { ConflictResolver } from '../../domain/conflicts/conflictResolver';
import { RoomEntity } from '../../domain/entities/Room';
import { AssignmentEntity } from '../../domain/entities/Assignment';
import { v5 as uuidv5 } from 'uuid';
import { buildAuditoriumTimeSlots, extractAuditoriumMetadata } from '../../utils/auditoriumDefaults';
import {
  isValidManualActivityType,
  mapActivityTypeToAssignableType,
  normalizeActivityTypeForPersistence
} from '../../utils/activityTypeMapping';

const router = Router();
const schedulingEngine = new SchedulingEngine();
const conflictResolver = new ConflictResolver();

const isUuid = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const USER_ID_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

const toActorUuid = (value: unknown, fallback: unknown): string => {
  if (isUuid(value)) {
    return value as string;
  }

  const source = String(value || fallback || '').trim();
  return uuidv5(source || 'system-user', USER_ID_NAMESPACE);
};

const resolveActorId = async (req: AuthenticatedRequest): Promise<string> => {
  if (isUuid(req.user?.id)) {
    return req.user!.id;
  }

  if (req.user?.email) {
    const dbUser = await db('users')
      .where({ email: req.user.email, is_active: true })
      .first();

    if (dbUser?.id) {
      return toActorUuid(dbUser.id, dbUser.email);
    }
  }

  if (req.user?.role) {
    const roleCandidates =
      req.user.role === 'study_groups_coordinator'
        ? ['study_groups_coordinator', 'group_coordinator']
        : [req.user.role];

    const dbUserByRole = await db('users')
      .whereIn('role', roleCandidates)
      .andWhere({ is_active: true })
      .orderBy('created_at', 'asc')
      .first();

    if (dbUserByRole?.id) {
      return toActorUuid(dbUserByRole.id, dbUserByRole.email);
    }
  }

  const fallbackUser = await db('users')
    .where({ is_active: true })
    .orderBy('created_at', 'asc')
    .first();

  if (fallbackUser?.id) {
    return toActorUuid(fallbackUser.id, fallbackUser.email);
  }

  return toActorUuid(req.user?.id, req.user?.email);
};

const normalizeDateOnly = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.includes('T') ? value.split('T')[0] : value;
  }

  const parsed = new Date(value as string);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

const parseDaysOfWeek = (value: unknown): number[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(Number).filter((day) => !Number.isNaN(day));
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(Number).filter((day) => !Number.isNaN(day)) : [];
    } catch {
      return [];
    }
  }

  return [];
};

const getDateWeekday = (dateStr: string): number => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
};

const shiftDate = (dateStr: string, days: number): string => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const findNextMatchingDate = (fromDate: string, toDate: string, daysOfWeek: number[]): string | null => {
  let cursor = fromDate;

  while (cursor <= toDate) {
    if (daysOfWeek.includes(getDateWeekday(cursor))) {
      return cursor;
    }
    cursor = shiftDate(cursor, 1);
  }

  return null;
};

const findPreviousMatchingDate = (fromDate: string, toDate: string, daysOfWeek: number[]): string | null => {
  let cursor = fromDate;

  while (cursor >= toDate) {
    if (daysOfWeek.includes(getDateWeekday(cursor))) {
      return cursor;
    }
    cursor = shiftDate(cursor, -1);
  }

  return null;
};

const isRecurringAssignment = (assignment: any): boolean => {
  const hasSpecificDate = Boolean(normalizeDateOnly(assignment.specific_date));
  const daysOfWeek = parseDaysOfWeek(assignment.days_of_week);
  return !hasSpecificDate && assignment.type !== 'one_time' && daysOfWeek.length > 0;
};

const assignmentOccursOnDate = (assignment: any, targetDate: string): boolean => {
  const specificDate = normalizeDateOnly(assignment.specific_date);
  if (specificDate) {
    return specificDate === targetDate;
  }

  const startDate = normalizeDateOnly(assignment.start_date || assignment.date);
  const endDate = normalizeDateOnly(assignment.end_date || assignment.start_date || assignment.date);

  if (!startDate || !endDate || targetDate < startDate || targetDate > endDate) {
    return false;
  }

  const daysOfWeek = parseDaysOfWeek(assignment.days_of_week);
  if (daysOfWeek.length === 0) {
    return normalizeDateOnly(assignment.date) === targetDate;
  }

  return daysOfWeek.includes(getDateWeekday(targetDate));
};

const toMinutes = (time: unknown): number | null => {
  if (typeof time !== 'string' || !time.includes(':')) {
    return null;
  }

  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return (hours * 60) + minutes;
};

const timesOverlap = (startA: unknown, endA: unknown, startB: unknown, endB: unknown): boolean => {
  const startAMinutes = toMinutes(startA);
  const endAMinutes = toMinutes(endA);
  const startBMinutes = toMinutes(startB);
  const endBMinutes = toMinutes(endB);

  if (
    startAMinutes === null ||
    endAMinutes === null ||
    startBMinutes === null ||
    endBMinutes === null
  ) {
    return false;
  }

  return startAMinutes < endBMinutes && endAMinutes > startBMinutes;
};

const isSameAssignmentFamily = (left: any, right: any): boolean => {
  if (!left || !right) {
    return false;
  }

  return (
    left.assignable_type === right.assignable_type &&
    String(left.assignable_id ?? '') === String(right.assignable_id ?? '') &&
    String(left.created_by ?? '') === String(right.created_by ?? '') &&
    String(left.created_at ?? '') === String(right.created_at ?? '') &&
    left.activity_type === right.activity_type
  );
};

const buildAssignmentPayload = (assignment: any, overrides: Record<string, unknown> = {}) => ({
  type: assignment.type,
  assignable_type: assignment.assignable_type,
  assignable_id: assignment.assignable_id,
  room_id: assignment.room_id,
  activity_type: assignment.activity_type,
  created_by: assignment.created_by,
  start_date: assignment.start_date,
  date: assignment.date,
  specific_date: assignment.specific_date,
  end_date: assignment.end_date,
  start_time: assignment.start_time,
  end_time: assignment.end_time,
  days_of_week: assignment.days_of_week,
  time_slots: assignment.time_slots,
  is_manual: assignment.is_manual,
  status: assignment.status,
  created_at: assignment.created_at,
  updated_at: new Date().toISOString(),
  ...overrides
});

const buildUpdatedTimeSlots = (assignment: any, startTime: string, endTime: string) => {
  const auditoriumMetadata = extractAuditoriumMetadata(assignment?.time_slots);

  return buildAuditoriumTimeSlots({
    start_time: startTime,
    end_time: endTime,
    title: auditoriumMetadata.title,
    note: auditoriumMetadata.note ?? null,
    source_entry_id: auditoriumMetadata.source_entry_id
  });
};

const summarizeAssignmentForLog = (assignment: any) => ({
  id: assignment?.id,
  room_id: assignment?.room_id,
  assignable_type: assignment?.assignable_type,
  assignable_id: assignment?.assignable_id,
  type: assignment?.type,
  activity_type: assignment?.activity_type,
  specific_date: normalizeDateOnly(assignment?.specific_date),
  start_date: normalizeDateOnly(assignment?.start_date),
  end_date: normalizeDateOnly(assignment?.end_date),
  date: normalizeDateOnly(assignment?.date),
  days_of_week: parseDaysOfWeek(assignment?.days_of_week),
  start_time: assignment?.start_time,
  end_time: assignment?.end_time,
  is_manual: assignment?.is_manual,
  status: assignment?.status,
  updated_at: assignment?.updated_at
});

const summarizeConflictCandidate = (candidate: any, targetDate: string, startTime: string, endTime: string) => ({
  ...summarizeAssignmentForLog(candidate),
  occurs_on_target_date: assignmentOccursOnDate(candidate, targetDate),
  overlaps_requested_time: timesOverlap(startTime, endTime, candidate.start_time, candidate.end_time),
  same_assignment_family: false
});

const resolveHomeroomByRoom = async (roomId: string) => {
  const homeroom = await db('homerooms')
    .where({ room_id: roomId, is_active: true })
    .orderBy('created_at', 'asc')
    .first();

  return homeroom || null;
};

const MANUAL_AUDITORIUM_ALLOWED_ACTIVITY_TYPES = ['didactics', 'event'] as const;

const findHomeroomAssignmentOverride = async (trx: any, roomId: string, targetDate: string) =>
  trx('assignments')
    .where({
      room_id: roomId,
      assignable_type: 'homeroom',
      status: 'active'
    })
    .andWhere(function(this: any) {
      this.whereRaw('DATE(specific_date) = DATE(?)', [targetDate])
        .orWhere(function(this: any) {
          this.whereNull('specific_date')
            .andWhereRaw('DATE(COALESCE(date, start_date)) = DATE(?)', [targetDate]);
        });
    })
    .orderByRaw('CASE WHEN specific_date IS NOT NULL THEN 0 ELSE 1 END')
    .orderBy('updated_at', 'desc')
    .first();

// Get all assignments
router.get('/', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('📋 Fetching assignments for user:', req.user!.id, 'role:', req.user!.role);
    
    // First, test if we can access the table at all
    try {
      const testQuery = await db('assignments').select('id').limit(1);
      console.log('✅ Table access test successful, found:', testQuery.length, 'rows');
    } catch (tableError: any) {
      console.error('❌ Table access failed:', tableError);
      return res.status(500).json({
        success: false,
        error: 'הגישה לטבלאות מסד הנתונים נכשלה',
        details: tableError.message
      });
    }
    
    // Get ALL active assignments for debugging
    console.log('🔍 DEBUG: Fetching ALL active assignments for debugging...');
    const allActiveAssignments = await db('assignments')
      .where('status', 'active')
      .select('*');
    
    console.log(`📊 DEBUG: Found ${allActiveAssignments.length} total active assignments:`);
    allActiveAssignments.forEach((assignment, index) => {
      const manualText = assignment.is_manual ? '(manual)' : '(default)';
      
      // Extract time from time_slots for display
      let timeDisplay = 'N/A';
      if (assignment.time_slots) {
        try {
          const timeSlots = typeof assignment.time_slots === 'string' ? JSON.parse(assignment.time_slots) : assignment.time_slots;
          if (timeSlots && timeSlots.length > 0) {
            timeDisplay = `${timeSlots[0].start || 'N/A'}-${timeSlots[0].end || 'N/A'}`;
          }
        } catch (e) {
          timeDisplay = 'ERROR parsing time_slots';
        }
      }
      
      // Get the correct date field
      let dateDisplay = assignment.specific_date || assignment.start_date || assignment.date || 'N/A';
      if (dateDisplay !== 'N/A') {
        dateDisplay = new Date(dateDisplay).toISOString().split('T')[0];
      }
      
      console.log(`  ${index + 1}. Room: ${assignment.room_id}, Date: ${dateDisplay}, Time: ${timeDisplay}, Type: ${assignment.activity_type}, Manual: ${manualText}`);
    });
    
    // Also get ALL assignments (including inactive) for complete picture
    const allAssignments = await db('assignments').select('*');
    console.log(`📊 DEBUG: Found ${allAssignments.length} total assignments (including inactive):`);
    
    // Group by status
    const activeCount = allAssignments.filter(a => a.status === 'active').length;
    const inactiveCount = allAssignments.filter(a => a.status !== 'active').length;
    console.log(`  Active: ${activeCount}, Inactive: ${inactiveCount}`);
    
    // Show inactive assignments
    const inactiveAssignments = allAssignments.filter(a => a.status !== 'active');
    if (inactiveAssignments.length > 0) {
      console.log('📋 DEBUG: Inactive assignments:');
      inactiveAssignments.forEach((assignment, index) => {
        const manualText = assignment.is_manual ? '(manual)' : '(default)';
        console.log(`  ${index + 1}. Room: ${assignment.room_id}, Date: ${assignment.date}, Time: ${assignment.start_time}-${assignment.end_time}, Type: ${assignment.activity_type}, Status: ${assignment.status}, Manual: ${manualText}`);
      });
    }
    
    const { 
      roomId, 
      assignableType, 
      assignableId, 
      status = 'active',
      date 
    } = req.query;

    console.log('🔍 Query params:', { roomId, assignableType, assignableId, status, date });

    let query = db('assignments')
      .select(
        'assignments.*',
        'rooms.room_number as room_number',
        'rooms.room_type as room_type'
      )
      .leftJoin('rooms', db.raw('assignments.room_id::text = rooms.id::text'))
      .where('assignments.status', status);

    if (roomId && roomId !== 'all') {
      query = query.where('assignments.room_id', roomId);
    }

    if (assignableType) {
      query = query.where('assignments.assignable_type', assignableType);
    }

    if (assignableId) {
      query = query.where('assignments.assignable_id', assignableId);
    }

    if (date) {
      // Handle date filtering more robustly
      const targetDate = new Date(date as string);
      if (!isNaN(targetDate.getTime())) {
        query = query.where('assignments.date', date as string);
      }
    }

    // Non-admin users can only see their own assignments
    if (req.user!.role === 'general_user') {
      console.log('Filtering by created_by:', req.user!.id);
      query = query.where('assignments.created_by', req.user!.id);
    }

    console.log('Final query SQL:', query.toString());
    
    const assignments = await query.orderBy('assignments.date', 'asc')
      .orderBy('assignments.start_time', 'asc');

    console.log('Found assignments:', assignments.length);

    res.json({
      success: true,
      data: { assignments }
    });
  } catch (error: any) {
    console.error('Error fetching assignments:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'טעינת השיבוצים נכשלה',
      details: error.message
    });
  }
}));

// Create new assignment
router.post('/', authMiddleware, requireCoordinator, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  console.log('POST /assignments - Request body:', req.body);
  console.log('specific_date field:', req.body.specific_date);
  console.log('date field:', req.body.date);
  const actorId = await resolveActorId(req);
  
  const assignmentRequest = req.body;
  
  // Add debug log to see the date issue
  console.log('Original req.body.date:', req.body.date);
  console.log('assignmentRequest.date:', assignmentRequest.date);

  // Get available rooms
  const availableRooms = await db('rooms').where({ is_active: true });
  console.log('Available rooms count:', availableRooms.length);
  const roomEntities = availableRooms.map(room => 
    RoomEntity.fromRoomNumber(room.room_number, {
      id: room.id,
      hasProjector: room.has_projector,
      capacity: room.capacity,
      notes: room.notes,
      isActive: room.is_active,
      createdAt: room.created_at,
      updatedAt: room.updated_at
    })
  );

  // Get existing assignments
  let existingAssignmentsData;
  
  console.log('Assignment request received:', {
    type: assignmentRequest.type,
    date: assignmentRequest.date,
    end_date: assignmentRequest.end_date,
  });
  
  if (assignmentRequest.type === 'recurring') {
    // For recurring assignments, get assignments for date range
    const startDate = new Date(assignmentRequest.date);
    const endDate = new Date(assignmentRequest.end_date || assignmentRequest.date);
    
    existingAssignmentsData = await db('assignments')
      .where({ status: 'active' })
      .where('date', '>=', startDate.toISOString().split('T')[0])
      .where('date', '<=', endDate.toISOString().split('T')[0]);
  } else {
    // For one-time assignments, get assignments for the specific date only
    console.log('Querying assignments for date:', assignmentRequest.date);

    // Use simple date comparison - convert both to YYYY-MM-DD format
    existingAssignmentsData = await db('assignments')
      .where({ status: 'active' })
      .whereRaw('DATE(date) = DATE(?)', [assignmentRequest.date]);
    
    console.log('Query executed for one-time assignment');
    console.log('Found assignments for date', assignmentRequest.date, ':', existingAssignmentsData.length);
    existingAssignmentsData.forEach((assignment, index) => {
      console.log(`Assignment ${index + 1}:`, {
        id: assignment.id,
        room_id: assignment.room_id,
        date: assignment.date,
        start_time: assignment.start_time,
        end_time: assignment.end_time
      });
    });
  }
  
  console.log('Existing assignments count:', existingAssignmentsData.length);
  console.log('Date range:', assignmentRequest.type === 'recurring' 
    ? `${assignmentRequest.date} to ${assignmentRequest.end_date}` 
    : assignmentRequest.date);

  // Check for duplicates BEFORE calling scheduling engine
  console.log('🔍 Checking for duplicates with:', {
    room_id: assignmentRequest.room_id,
    date: assignmentRequest.date,
    start_time: assignmentRequest.start_time,
    end_time: assignmentRequest.end_time,
    type: assignmentRequest.type
  });

  // Add detailed logging for the duplicate check
  console.log('🔍 DEBUG: Building duplicate check query...');
  const duplicateCheckQuery = db('assignments')
    .where('room_id', assignmentRequest.room_id)
    .whereRaw('DATE(date) = DATE(?)', [assignmentRequest.date])
    .where('status', 'active')
    .where(function() {
      this.where('start_time', '<=', assignmentRequest.end_time)
          .andWhere('end_time', '>=', assignmentRequest.start_time);
    });
  
  console.log('🔍 DEBUG: Duplicate check SQL:', duplicateCheckQuery.toString());
  const duplicateCheck = await duplicateCheckQuery;
  console.log('📊 DEBUG: Duplicate check result:', {
    found: duplicateCheck.length,
    duplicates: duplicateCheck.map(d => ({
      id: d.id,
      room_id: d.room_id,
      date: d.date,
      start_time: d.start_time,
      end_time: d.end_time,
      activity_type: d.activity_type,
      is_manual: d.is_manual
    }))
  });

  if (assignmentRequest.type === 'recurring') {
    // For recurring assignments, check each day in the range
    const startDate = new Date(assignmentRequest.date);
    const endDate = new Date(assignmentRequest.end_date || assignmentRequest.date);
    const daysOfWeek = assignmentRequest.days_of_week || [];
    
    console.log('🔍 Checking recurring assignment availability:', {
      room_id: assignmentRequest.room_id,
      start_date: assignmentRequest.date,
      end_date: assignmentRequest.end_date,
      days_of_week: daysOfWeek,
      time_range: `${assignmentRequest.start_time} - ${assignmentRequest.end_time}`
    });
    
    let roomIsAvailable = true;
    let conflictDates = [];
    let totalConflicts = 0;
    
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dayOfWeek = date.getDay();
      
      // Check if this day is included in the recurring pattern
      if (daysOfWeek.includes(dayOfWeek)) {
        const dateStr = date.toISOString().split('T')[0];
        
        const duplicateCheck = await db('assignments')
          .where('room_id', assignmentRequest.room_id)
          .whereRaw('DATE(date) = DATE(?)', [dateStr])
          .where('status', 'active')
          .where(function() {
            this.where('start_time', '<=', assignmentRequest.end_time)
                .andWhere('end_time', '>=', assignmentRequest.start_time);
          });
        
        if (duplicateCheck.length > 0) {
          roomIsAvailable = false;
          conflictDates.push(dateStr);
          totalConflicts += duplicateCheck.length;
          
          console.log(`🚫 Room ${assignmentRequest.room_id} is occupied on ${dateStr}:`, duplicateCheck.map(d => ({
            start_time: d.start_time,
            end_time: d.end_time,
            activity_type: d.activity_type
          })));
        } else {
          console.log(`✅ Room ${assignmentRequest.room_id} is available on ${dateStr}`);
        }
      }
    }
    
    // If ANY day is occupied, block the entire recurring assignment
    if (!roomIsAvailable) {
      console.log(`🚫 BLOCKING: Recurring assignment conflicts found on ${conflictDates.length} days`);
      console.log(`📊 Total conflicts: ${totalConflicts} across dates: ${conflictDates.join(', ')}`);
      
      return res.status(409).json({
        success: false,
        error: `לא ניתן ליצור שיבוץ תדיר - החדר תפוס ב-${conflictDates.length} ימים מהתקופה המבוקשת: ${conflictDates.join(', ')}`,
        conflicts: [],
        conflict_dates: conflictDates,
        total_conflicts: totalConflicts,
        message: 'שיבוץ תדיר דורש שהחדר יהיה פנוי בכל הימים המבוקשים'
      });
    }
    
    console.log(`✅ Room ${assignmentRequest.room_id} is available for ALL requested days in recurring assignment`);
  } else {
    // For one-time assignments, check the specific date
    const duplicateCheck = await db('assignments')
      .where('room_id', assignmentRequest.room_id)
      .where(function() {
        // Check specific_date first (for one-time assignments)
        this.whereRaw('DATE(specific_date) = DATE(?)', [assignmentRequest.date])
            .orWhereRaw('DATE(date) = DATE(?)', [assignmentRequest.date])
            .orWhereRaw('DATE(start_date) = DATE(?)', [assignmentRequest.date]);
      })
      .where('status', 'active')
      .where(function() {
        // Check time overlap using time_slots JSON
        this.whereRaw(`
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(time_slots) as slot 
            WHERE 
              (slot->>'start')::time <= ? 
              AND (slot->>'end')::time >= ?
          )
        `, [assignmentRequest.end_time, assignmentRequest.start_time]);
      });
    
    console.log('📊 Duplicate check result:', {
      found: duplicateCheck.length,
      duplicates: duplicateCheck
    });
    
    if (duplicateCheck.length > 0) {
      console.log('🚫 BLOCKING: Found duplicates, returning 409');
      return res.status(409).json({
        success: false,
        error: 'קיים כבר שיבוץ לחדר זה בזמן המבוקש',
        conflicts: duplicateCheck
      });
    }
  }

  console.log('✅ No duplicates found, proceeding...');
  
  // Check if this is a manual assignment
  if (assignmentRequest.is_manual === true) {
    console.log('🎯 Manual assignment detected - inserting directly to database');
    
    // Validate the values before inserting
    const validTypes = ['permanent', 'temporary', 'one_time'];
    const finalType = assignmentRequest.type === 'recurring' ? 'temporary' : 'one_time';
    const finalActivityType = normalizeActivityTypeForPersistence(assignmentRequest.activity_type || 'event');
    const finalAssignableType = mapActivityTypeToAssignableType(finalActivityType);
    
    console.log('🔍 DEBUG: Validating values:', {
      type: finalType,
      assignable_type: finalAssignableType,
      activity_type: finalActivityType,
      isValidType: validTypes.includes(finalType),
      isValidAssignableType: Boolean(finalAssignableType),
      isValidActivityType: isValidManualActivityType(finalActivityType)
    });
    
    if (!validTypes.includes(finalType)) {
      return res.status(400).json({
        success: false,
        error: `סוג השיבוץ אינו תקין: ${finalType}. הערכים התקינים הם: ${validTypes.join(', ')}`
      });
    }
    
    // Validate recurring assignments have days selected
    if (finalType === 'temporary' && assignmentRequest.type === 'recurring') {
      if (!assignmentRequest.days_of_week || !Array.isArray(assignmentRequest.days_of_week) || assignmentRequest.days_of_week.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'לשיבוצים תדירים חובה לבחור לפחות יום אחד בשבוע'
        });
      }
    }
    
    if (!isValidManualActivityType(finalActivityType)) {
      return res.status(400).json({
        success: false,
        error: `activity_type אינו תקין: ${finalActivityType}`
      });
    }

    const targetRoom = await db('rooms')
      .select('id', 'room_type', 'room_number')
      .where({ id: assignmentRequest.room_id, is_active: true })
      .first();

    if (!targetRoom) {
      return res.status(404).json({
        success: false,
        error: 'החדר שנבחר לא נמצא'
      });
    }

    const isAuditoriumRoom = String(targetRoom.room_type || '').toUpperCase() === 'AUDITORIUM';
    if (
      isAuditoriumRoom &&
      !MANUAL_AUDITORIUM_ALLOWED_ACTIVITY_TYPES.includes(
        finalActivityType as typeof MANUAL_AUDITORIUM_ALLOWED_ACTIVITY_TYPES[number]
      )
    ) {
      return res.status(400).json({
        success: false,
        error: 'באולם ניתן לשבץ ידנית רק הרצאת שכבה או אירוע באישור ההנהלה'
      });
    }
    
    // Manual assignment - insert directly to the requested room
    let savedAssignment;
    try {
      console.log('🎯 DEBUG: Preparing manual assignment insert with data:', {
        type: finalType,
        assignable_type: finalAssignableType,
        assignable_id: assignmentRequest.assignable_id || 1,
        room_id: assignmentRequest.room_id,
        activity_type: finalActivityType,
        created_by: actorId,
        start_date: assignmentRequest.date,
        date: assignmentRequest.date,
        end_date: assignmentRequest.end_date,
        start_time: assignmentRequest.start_time,
        end_time: assignmentRequest.end_time,
        days_of_week: assignmentRequest.days_of_week,
        days_of_week_type: typeof assignmentRequest.days_of_week,
        days_of_week_length: Array.isArray(assignmentRequest.days_of_week) ? assignmentRequest.days_of_week.length : 'N/A',
        is_manual: true,
        status: 'active'
      });
      
      const insertQuery = db('assignments').insert({
        type: finalType,
        assignable_type: finalAssignableType,
        assignable_id: assignmentRequest.assignable_id || 1,
        room_id: assignmentRequest.room_id,  // ← The room the user requested
        activity_type: finalActivityType,
        created_by: actorId,
        start_date: assignmentRequest.date,
        date: assignmentRequest.date,
        specific_date: finalType === 'one_time' ? assignmentRequest.date : null,  // ← Only set specific_date for one-time assignments
        end_date: assignmentRequest.end_date || assignmentRequest.date,  // ← Same date for one-time
        start_time: assignmentRequest.start_time,  // ← Save start_time for frontend display
        end_time: assignmentRequest.end_time,      // ← Save end_time for frontend display
        days_of_week: JSON.stringify(assignmentRequest.days_of_week || []),  // ← Empty for one-time
        time_slots: JSON.stringify([{  // ← Store time in time_slots JSON for backend logic
          start: assignmentRequest.start_time, 
          end: assignmentRequest.end_time 
        }]),
        is_manual: true,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).returning('*');
      
      console.log('🎯 DEBUG: Insert SQL:', insertQuery.toString());
      [savedAssignment] = await insertQuery;
      console.log('✅ DEBUG: Manual assignment saved successfully:', savedAssignment);
    } catch (error: any) {
      // Check if it's a unique constraint violation
      if (error.code === '23505' && error.constraint === 'assignments_no_double_booking') {
        console.log('🚫 BLOCKING: Unique constraint violation - duplicate assignment detected');
        return res.status(409).json({
          success: false,
          error: 'קיים כבר שיבוץ לחדר זה בזמן המבוקש',
          conflicts: []
        });
      }
      
      // Re-throw other errors
      throw error;
    }

    console.log('✅ Manual assignment saved successfully');
    
    return res.status(201).json({
      success: true,
      data: { assignment: savedAssignment },
      explanation: `שיבוץ ידני בחדר ${assignmentRequest.room_id} בוצע בהצלחה`
    });
  }
  
  // For automatic assignments, use scheduling engine
  console.log('🤖 Automatic assignment detected - using scheduling engine');
  
  const existingAssignments = existingAssignmentsData.map(data => ({
    id: data.id,
    assignable_type: data.assignable_type,
    assignable_id: data.assignable_id,
    room_id: data.room_id,
    title: data.title,
    description: data.description,
    date: data.date,
    start_time: data.start_time,
    end_time: data.end_time,
    requester_id: data.created_by,
    status: data.status,
    is_recurring: data.is_recurring,
    special_requirements: data.special_requirements,
    created_at: data.created_at,
    updated_at: data.updated_at
  }));

  console.log('Calling scheduling engine for automatic assignment:', assignmentRequest);
  console.log('Available rooms:', availableRooms.map(r => ({ id: r.id, room_number: r.room_number })));
  console.log('Existing assignments:', existingAssignments.map(a => ({ id: a.id, room_id: a.room_id, date: a.date })));
  
  // Use scheduling engine to assign room
  const result = await schedulingEngine.assignRoom(
    assignmentRequest,
    availableRooms, // Pass original rooms instead of roomEntities to preserve room numbers
    existingAssignments
  );

  console.log('Scheduling engine result:', JSON.stringify(result, null, 2));

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.errors?.[0] || 'יצירת השיבוץ נכשלה',
      conflicts: result.conflicts,
      alternativeRooms: result.alternativeRooms,
      errors: result.errors,
      explanation: result.explanation
    });
  }

  if (result.assignment) {
    // Validate room_id before inserting - Fixed for UUID
    if (!result.assignment.room_id || result.assignment.room_id === '' || typeof result.assignment.room_id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'מזהה החדר אינו תקין'
      });
    }

    console.log('Creating automatic assignment with room_id:', result.assignment.room_id);
    console.log('About to save assignment with date:', assignmentRequest.date);
    
    // Save assignment to database - simple approach
    let savedAssignment;
    try {
      [savedAssignment] = await db('assignments').insert({
        type: assignmentRequest.type === 'recurring' ? 'temporary' : (assignmentRequest.type || 'one_time'),  // ← Use valid constraint values
        assignable_type: result.assignment.assignable_type === 'manual' ? 'meeting' : result.assignment.assignable_type,
        assignable_id: result.assignment.assignable_id,
        room_id: result.assignment.room_id,
        activity_type: result.assignment.activity_type || 'meeting',
        created_by: actorId,
        start_date: assignmentRequest.date,
        date: assignmentRequest.date,
        end_date: assignmentRequest.end_date,
        start_time: result.assignment.start_time,
        end_time: result.assignment.end_time,
        days_of_week: JSON.stringify(result.assignment.daysOfWeek || []),
        time_slots: JSON.stringify(result.assignment.timeSlots || [{ start: result.assignment.start_time, end: result.assignment.end_time }]),
        is_manual: false, // ← This is automatic assignment
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).returning('*');
    } catch (error: any) {
      // Check if it's a unique constraint violation
      if (error.code === '23505' && error.constraint === 'assignments_no_double_booking') {
        console.log('🚫 BLOCKING: Unique constraint violation - duplicate assignment detected');
        return res.status(409).json({
          success: false,
          error: 'קיים כבר שיבוץ לחדר זה בזמן המבוקש',
          conflicts: []
        });
      }
      
      // Re-throw other errors
      throw error;
    }

    console.log('Assignment saved to database:', savedAssignment.date);

    logScheduling(`Assignment created: ${result.assignment.assignable_type} in room ${result.assignment.room_id} by ${req.user!.email}`);

    res.status(201).json({
      success: true,
      data: { assignment: savedAssignment },
      explanation: result.explanation
    });
  } else {
    res.status(400).json({
      success: false,
      error: 'לא נמצא חדר מתאים',
      alternativeRooms: result.alternativeRooms,
      errors: result.errors
    });
  }
}));

router.post('/homeroom-default', authMiddleware, requireCoordinator, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const actorId = await resolveActorId(req);
  const { room_id, target_date, start_time, end_time } = req.body as {
    room_id?: string;
    target_date?: string;
    start_time?: string;
    end_time?: string;
  };

  const targetDate = normalizeDateOnly(target_date);

  console.log('[assignments:homeroom-default] request', {
    room_id,
    target_date: target_date ?? null,
    normalized_target_date: targetDate,
    start_time: start_time ?? null,
    end_time: end_time ?? null,
    user_id: req.user?.id ?? null,
    user_role: req.user?.role ?? null
  });

  if (!room_id || !targetDate || !start_time || !end_time) {
    return res.status(400).json({
      success: false,
      error: 'חובה לשלוח room_id, target_date, start_time ו-end_time'
    });
  }

  const requestedStartMinutes = toMinutes(start_time);
  const requestedEndMinutes = toMinutes(end_time);

  if (
    requestedStartMinutes === null ||
    requestedEndMinutes === null ||
    requestedStartMinutes >= requestedEndMinutes
  ) {
    return res.status(400).json({
      success: false,
      error: 'שעת ההתחלה חייבת להיות מוקדמת משעת הסיום'
    });
  }

  const homeroom = await resolveHomeroomByRoom(room_id);
  if (!homeroom) {
    return res.status(404).json({
      success: false,
      error: 'לא נמצאה כיתת אם פעילה לחדר הזה'
    });
  }

  const conflictingAssignments = await db('assignments')
    .where({ room_id, status: 'active' })
    .where(function() {
      this.whereRaw('DATE(specific_date) = DATE(?)', [targetDate])
        .orWhereRaw('DATE(date) = DATE(?)', [targetDate])
        .orWhereRaw('DATE(start_date) = DATE(?)', [targetDate]);
    })
    .whereNotIn('assignable_type', ['homeroom', 'study_group']);

  const conflict = conflictingAssignments.find((candidate) =>
    assignmentOccursOnDate(candidate, targetDate) &&
    timesOverlap(start_time, end_time, candidate.start_time, candidate.end_time)
  );

  if (conflict) {
    console.log('[assignments:homeroom-default] conflict detected', {
      room_id,
      target_date: targetDate,
      requested_time: { start_time, end_time },
      conflict: summarizeConflictCandidate(conflict, targetDate, start_time, end_time),
      evaluated_candidates: conflictingAssignments.map((candidate: any) =>
        summarizeConflictCandidate(candidate, targetDate, start_time, end_time)
      )
    });
    return res.status(409).json({
      success: false,
      error: 'יש כבר שיבוץ אחר בחדר בשעות האלו'
    });
  }

  const existingOverride = await findHomeroomAssignmentOverride(db, room_id, targetDate);

  const payload = {
    type: 'one_time',
    assignable_type: 'homeroom',
    assignable_id: existingOverride?.assignable_id ?? homeroom.id,
    room_id,
    activity_type: 'לימודים',
    created_by: actorId,
    start_date: targetDate,
    date: targetDate,
    specific_date: targetDate,
    end_date: targetDate,
    start_time,
    end_time,
    days_of_week: JSON.stringify([]),
    time_slots: JSON.stringify([{ start: start_time, end: end_time }]),
    is_manual: true,
    status: 'active',
    updated_at: new Date().toISOString()
  };

  const assignment = existingOverride
    ? (await db('assignments')
        .where({ id: existingOverride.id })
        .update(payload)
        .returning('*'))[0]
    : (await db('assignments')
        .insert({
          ...payload,
          created_at: new Date().toISOString()
        })
        .returning('*'))[0];

  return res.status(existingOverride ? 200 : 201).json({
    success: true,
    data: { assignment }
  });
}));

router.delete('/homeroom-default', authMiddleware, requireCoordinator, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const actorId = await resolveActorId(req);
  const roomId = typeof req.query.room_id === 'string' ? req.query.room_id : req.body?.room_id;
  const targetDate = normalizeDateOnly(
    typeof req.query.target_date === 'string' ? req.query.target_date : req.body?.target_date
  );

  if (!roomId || !targetDate) {
    return res.status(400).json({
      success: false,
      error: 'יש לבחור חדר ותאריך יעד'
    });
  }

  const homeroom = await resolveHomeroomByRoom(roomId);
  if (!homeroom) {
    return res.status(404).json({
      success: false,
      error: 'לא נמצאה כיתת אם פעילה לחדר הזה'
    });
  }

  const existingOverride = await findHomeroomAssignmentOverride(db, roomId, targetDate);

  const cancellationPayload = {
    type: 'one_time',
    assignable_type: 'homeroom',
    assignable_id: existingOverride?.assignable_id ?? homeroom.id,
    room_id: roomId,
    activity_type: 'לימודים',
    created_by: actorId,
    start_date: targetDate,
    date: targetDate,
    specific_date: targetDate,
    end_date: targetDate,
    start_time: '00:00',
    end_time: '00:00',
    days_of_week: JSON.stringify([]),
    time_slots: JSON.stringify([]),
    is_manual: true,
    status: 'active',
    updated_at: new Date().toISOString()
  };

  if (existingOverride) {
    await db('assignments')
      .where({ id: existingOverride.id })
      .update(cancellationPayload);
  } else {
    await db('assignments').insert({
      ...cancellationPayload,
      created_at: new Date().toISOString()
    });
  }

  return res.json({ success: true });
}));

router.put('/:id', authMiddleware, requireCoordinator, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { target_date, start_time, end_time } = req.body as {
    target_date?: string;
    start_time?: string;
    end_time?: string;
  };

  const targetDate = normalizeDateOnly(target_date);

  console.log('[assignments:update-occurrence] request', {
    assignment_id: id,
    target_date: target_date ?? null,
    normalized_target_date: targetDate,
    start_time: start_time ?? null,
    end_time: end_time ?? null,
    user_id: req.user?.id ?? null,
    user_role: req.user?.role ?? null
  });

  if (!targetDate || !start_time || !end_time) {
    return res.status(400).json({
      success: false,
      error: 'חובה לשלוח target_date, start_time ו-end_time'
    });
  }

  const requestedStartMinutes = toMinutes(start_time);
  const requestedEndMinutes = toMinutes(end_time);

  if (
    requestedStartMinutes === null ||
    requestedEndMinutes === null ||
    requestedStartMinutes >= requestedEndMinutes
  ) {
    return res.status(400).json({
      success: false,
      error: 'שעת ההתחלה חייבת להיות מוקדמת משעת הסיום'
    });
  }

  let updatedAssignment;

  try {
    updatedAssignment = await db.transaction(async (trx) => {
      const assignment = await trx('assignments')
        .where({ id, status: 'active' })
        .first();

      if (!assignment) {
        throw new Error('ASSIGNMENT_NOT_FOUND');
      }

      console.log('[assignments:update-occurrence] loaded assignment', {
        assignment: summarizeAssignmentForLog(assignment)
      });

      if (!assignmentOccursOnDate(assignment, targetDate)) {
        console.log('[assignments:update-occurrence] target date not in assignment', {
          assignment: summarizeAssignmentForLog(assignment),
          target_date: targetDate
        });
        throw new Error('DATE_NOT_IN_ASSIGNMENT');
      }

      const roomAssignments = await trx('assignments')
        .where({ room_id: assignment.room_id, status: 'active' })
        .whereNot('id', assignment.id);

      const evaluatedCandidates = roomAssignments.map((candidate: any) => ({
        ...summarizeConflictCandidate(candidate, targetDate, start_time, end_time),
        same_assignment_family: isSameAssignmentFamily(candidate, assignment)
      }));

      const conflict = roomAssignments.find((candidate) =>
       ! ( (assignment.assignable_type === 'study_group' && candidate.assignable_type === 'homeroom') ||
  (assignment.assignable_type === 'homeroom' && candidate.assignable_type === 'study_group')) &&
        assignmentOccursOnDate(candidate, targetDate) &&
        timesOverlap(start_time, end_time, candidate.start_time, candidate.end_time) &&
        !isSameAssignmentFamily(candidate, assignment)
      );

      if (conflict) {
        console.log('[assignments:update-occurrence] conflict detected', {
          assignment: summarizeAssignmentForLog(assignment),
          target_date: targetDate,
          requested_time: { start_time, end_time },
          conflict: {
            ...summarizeConflictCandidate(conflict, targetDate, start_time, end_time),
            same_assignment_family: isSameAssignmentFamily(conflict, assignment)
          },
          evaluated_candidates: evaluatedCandidates
        });
        throw new Error('TIME_CONFLICT');
      }

      console.log('[assignments:update-occurrence] no conflict found', {
        assignment_id: assignment.id,
        target_date: targetDate,
        requested_time: { start_time, end_time },
        evaluated_candidates_count: evaluatedCandidates.length
      });

      if (!isRecurringAssignment(assignment)) {
        const nextTimeSlots = buildUpdatedTimeSlots(assignment, start_time, end_time);
        const shouldDetachAuditoriumOverride =
          assignment.assignable_type === 'event' &&
          assignment.is_manual === false;

        const [saved] = await trx('assignments')
          .where({ id: assignment.id })
          .update({
            start_time,
            end_time,
            time_slots: nextTimeSlots,
            is_manual: shouldDetachAuditoriumOverride ? true : assignment.is_manual,
            specific_date: normalizeDateOnly(assignment.specific_date || targetDate),
            start_date: normalizeDateOnly(assignment.start_date || targetDate),
            date: normalizeDateOnly(assignment.date || targetDate),
            end_date: normalizeDateOnly(assignment.end_date || targetDate),
            updated_at: new Date().toISOString()
          })
          .returning('*');

        return saved;
      }

      const daysOfWeek = parseDaysOfWeek(assignment.days_of_week);
      const seriesStart = normalizeDateOnly(assignment.start_date || assignment.date);
      const seriesEnd = normalizeDateOnly(assignment.end_date || assignment.start_date || assignment.date);

      if (!seriesStart || !seriesEnd) {
        throw new Error('INVALID_RECURRING_ASSIGNMENT');
      }

      const previousOccurrence = findPreviousMatchingDate(shiftDate(targetDate, -1), seriesStart, daysOfWeek);
      const nextOccurrence = findNextMatchingDate(shiftDate(targetDate, 1), seriesEnd, daysOfWeek);

      if (!previousOccurrence && !nextOccurrence) {
        await trx('assignments')
          .where({ id: assignment.id })
          .del();
      } else if (!previousOccurrence && nextOccurrence) {
        await trx('assignments')
          .where({ id: assignment.id })
          .update({
            start_date: nextOccurrence,
            date: nextOccurrence,
            updated_at: new Date().toISOString()
          });
      } else if (previousOccurrence && !nextOccurrence) {
        await trx('assignments')
          .where({ id: assignment.id })
          .update({
            end_date: previousOccurrence,
            updated_at: new Date().toISOString()
          });
      } else if (previousOccurrence && nextOccurrence) {
        await trx('assignments')
          .where({ id: assignment.id })
          .update({
            end_date: previousOccurrence,
            updated_at: new Date().toISOString()
          });

        await trx('assignments')
          .insert(buildAssignmentPayload(assignment, {
            start_date: nextOccurrence,
            date: nextOccurrence,
            end_date: seriesEnd,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));
      }

      const [overrideAssignment] = await trx('assignments')
        .insert(buildAssignmentPayload(assignment, {
          type: 'one_time',
          start_date: targetDate,
          date: targetDate,
          specific_date: targetDate,
          end_date: targetDate,
          start_time,
          end_time,
          days_of_week: JSON.stringify([]),
          time_slots: buildUpdatedTimeSlots(assignment, start_time, end_time),
          is_manual: assignment.assignable_type === 'event' ? true : assignment.is_manual,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))
        .returning('*');

      return overrideAssignment;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FAILED_TO_UPDATE_ASSIGNMENT';

    if (message === 'ASSIGNMENT_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'השיבוץ לא נמצא' });
    }

    if (message === 'DATE_NOT_IN_ASSIGNMENT') {
      return res.status(400).json({ success: false, error: 'התאריך שנבחר לא שייך לשיבוץ הזה' });
    }

    if (message === 'TIME_CONFLICT') {
      return res.status(409).json({ success: false, error: 'יש כבר שיבוץ אחר בחדר בשעות האלו' });
    }

    console.error('Error updating assignment occurrence:', error);
    return res.status(500).json({ success: false, error: 'עדכון השיבוץ נכשל' });
  }

  return res.json({
    success: true,
    data: { assignment: updatedAssignment }
  });
}));

router.delete('/:id', authMiddleware, requireCoordinator, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const targetDate = normalizeDateOnly(req.body?.target_date || req.query.target_date);
  if (!targetDate) {
    return res.status(400).json({
      success: false,
      error: 'חובה לשלוח target_date'
    });
  }
  try {
    await db.transaction(async (trx) => {
      const assignment = await trx('assignments')
        .where({ id, status: 'active' })
        .first();

      if (!assignment) {
        throw new Error('ASSIGNMENT_NOT_FOUND');
      }

      if (!assignmentOccursOnDate(assignment, targetDate)) {
        throw new Error('DATE_NOT_IN_ASSIGNMENT');
      }

      if (!isRecurringAssignment(assignment)) {
        const auditoriumMetadata = extractAuditoriumMetadata(assignment.time_slots);
        if (assignment.assignable_type === 'event' && auditoriumMetadata.source_entry_id) {
          await trx('assignments')
            .where({ id: assignment.id })
            .update({
              status: 'cancelled',
              is_manual: true,
              specific_date: normalizeDateOnly(assignment.specific_date || targetDate),
              start_date: normalizeDateOnly(assignment.start_date || targetDate),
              date: normalizeDateOnly(assignment.date || targetDate),
              end_date: normalizeDateOnly(assignment.end_date || targetDate),
              time_slots: buildAuditoriumTimeSlots({
                start_time: assignment.start_time,
                end_time: assignment.end_time,
                title: auditoriumMetadata.title,
                note: auditoriumMetadata.note ?? null,
                source_entry_id: auditoriumMetadata.source_entry_id,
                deleted: true
              }),
              updated_at: new Date().toISOString()
            });
          return;
        }

        await trx('assignments').where({ id: assignment.id }).del();
        return;
      }

      const daysOfWeek = parseDaysOfWeek(assignment.days_of_week);
      const seriesStart = normalizeDateOnly(assignment.start_date || assignment.date);
      const seriesEnd = normalizeDateOnly(assignment.end_date || assignment.start_date || assignment.date);

      if (!seriesStart || !seriesEnd) {
        throw new Error('INVALID_RECURRING_ASSIGNMENT');
      }

      const previousOccurrence = findPreviousMatchingDate(shiftDate(targetDate, -1), seriesStart, daysOfWeek);
      const nextOccurrence = findNextMatchingDate(shiftDate(targetDate, 1), seriesEnd, daysOfWeek);

      if (!previousOccurrence && !nextOccurrence) {
        await trx('assignments').where({ id: assignment.id }).del();
        return;
      }

      if (!previousOccurrence && nextOccurrence) {
        await trx('assignments')
          .where({ id: assignment.id })
          .update({
            start_date: nextOccurrence,
            date: nextOccurrence,
            updated_at: new Date().toISOString()
          });
        return;
      }

      if (previousOccurrence && !nextOccurrence) {
        await trx('assignments')
          .where({ id: assignment.id })
          .update({
            end_date: previousOccurrence,
            updated_at: new Date().toISOString()
          });
        return;
      }

      await trx('assignments')
        .where({ id: assignment.id })
        .update({
          end_date: previousOccurrence,
          updated_at: new Date().toISOString()
        });

      await trx('assignments')
        .insert(buildAssignmentPayload(assignment, {
          start_date: nextOccurrence,
          date: nextOccurrence,
          end_date: seriesEnd,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FAILED_TO_DELETE_ASSIGNMENT';

    if (message === 'ASSIGNMENT_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'השיבוץ לא נמצא' });
    }

    if (message === 'DATE_NOT_IN_ASSIGNMENT') {
      return res.status(400).json({ success: false, error: 'התאריך שנבחר לא שייך לשיבוץ הזה' });
    }

    console.error('Error deleting assignment occurrence:', error);
    return res.status(500).json({ success: false, error: 'מחיקת השיבוץ נכשלה' });
  }

  return res.json({
    success: true
  });
}));

export default router;

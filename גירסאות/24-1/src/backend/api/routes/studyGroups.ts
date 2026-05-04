import { Router, Response, Request } from 'express';
import { db } from '../../config/database';
import logger from '../../utils/logger';
import { 
  StudyGroup, 
  CreateStudyGroupData, 
  UpdateStudyGroupData,
  GroupSchedule,
  SchedulingEngine,
  SchedulingResult
} from '../../domain/models';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';

const router = Router();
const schedulingEngine = new SchedulingEngine();

// Get all study groups
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { grade_level, group_type } = req.query;
    
    let query = 'SELECT * FROM study_groups';
    const params: any[] = [];
    
    if (grade_level) {
      query += ' WHERE grade_level = $1';
      params.push(grade_level);
    }
    
    if (group_type) {
      query += grade_level ? ' AND group_type = $2' : ' WHERE group_type = $1';
      params.push(group_type);
    }
    
    query += ' ORDER BY grade_level, name';
    
    const result = await db.raw(query, params);
    
    res.json({
      success: true,
      data: {
        study_groups: result.rows
      }
    });
  } catch (error) {
    logger.error('Error fetching study groups:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch study groups'
    });
  }
});

// Get study group by ID with full details
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const groupQuery = await db.raw(
      'SELECT * FROM study_groups WHERE id = $1',
      [id]
    );
    
    if (groupQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Study group not found'
      });
    }
    
    const schedulesQuery = await db.raw(
      'SELECT * FROM group_schedules WHERE group_id = $1 ORDER BY day_of_week, start_time',
      [id]
    );
    
    const homeroomsQuery = await db.raw(
      `SELECT gha.*, h.room_id, r.room_number, r.room_type 
       FROM group_homeroom_assignments gha
       JOIN homerooms h ON gha.homeroom_id = h.id
       JOIN rooms r ON h.room_id = r.id
       WHERE gha.group_id = $1`,
      [id]
    );
    
    res.json({
      success: true,
      data: {
        study_group: groupQuery.rows[0],
        schedules: schedulesQuery.rows,
        homeroom_assignments: homeroomsQuery.rows
      }
    });
  } catch (error) {
    logger.error('Error fetching study group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch study group'
    });
  }
});

// Create new study group
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const groupData: CreateStudyGroupData = req.body;
    
    // Validate input
    if (!groupData.name || !groupData.grade_level || !groupData.student_count) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, grade_level, student_count'
      });
    }
    
    // Start transaction
    await db.transaction(async (trx) => {
      // Insert study group
      const groupResult = await trx.raw(
        'INSERT INTO study_groups (name, group_type, grade_level, student_count, needs_projector, is_large_group, consecutive_hours, preferred_room_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [
          groupData.name,
          groupData.group_type,
          groupData.grade_level,
          groupData.student_count,
          groupData.needs_projector || false,
          groupData.is_large_group || false,
          groupData.consecutive_hours || 1,
          groupData.preferred_room_type
        ]
      );
      
      const newGroup = groupResult.rows[0];
      
      // Insert schedules if provided
      if (groupData.schedules && groupData.schedules.length > 0) {
        for (const schedule of groupData.schedules) {
          await trx.raw(
            'INSERT INTO group_schedules (group_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)',
            [newGroup.id, schedule.day_of_week, schedule.start_time, schedule.end_time]
          );
        }
      }
      
      // Insert homeroom assignments if provided
      if (groupData.homeroom_ids && groupData.homeroom_ids.length > 0) {
        for (const homeroomId of groupData.homeroom_ids) {
          await trx.raw(
            'INSERT INTO group_homeroom_assignments (group_id, homeroom_id) VALUES ($1, $2)',
            [newGroup.id, homeroomId]
          );
        }
      }
      
      logger.info(`Created study group: ${newGroup.name} (ID: ${newGroup.id})`);
      
      res.status(201).json({
        success: true,
        data: {
          study_group: newGroup
        }
      });
    });
    
  } catch (error) {
    logger.error('Error creating study group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create study group'
    });
  }
});

// Update study group
router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData: UpdateStudyGroupData = req.body;
    
    // Check if group exists
    const existingQuery = await db.raw(
      'SELECT * FROM study_groups WHERE id = $1',
      [id]
    );
    
    if (existingQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Study group not found'
      });
    }
    
    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;
    
    if (updateData.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(updateData.name);
    }
    
    if (updateData.group_type !== undefined) {
      updateFields.push(`group_type = $${paramIndex++}`);
      updateValues.push(updateData.group_type);
    }
    
    if (updateData.grade_level !== undefined) {
      updateFields.push(`grade_level = $${paramIndex++}`);
      updateValues.push(updateData.grade_level);
    }
    
    if (updateData.student_count !== undefined) {
      updateFields.push(`student_count = $${paramIndex++}`);
      updateValues.push(updateData.student_count);
    }
    
    if (updateFields.length > 0) {
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(id);
      
      const updateQuery = `
        UPDATE study_groups 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
      `;
      
      await db.raw(updateQuery, updateValues);
    }
    
    logger.info(`Updated study group ID: ${id}`);
    
    res.json({
      success: true,
      data: {
        study_group: { ...existingQuery.rows[0], ...updateData }
      }
    });
    
  } catch (error) {
    logger.error('Error updating study group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update study group'
    });
  }
});

// Delete study group
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check if group exists
    const existingQuery = await db.raw(
      'SELECT * FROM study_groups WHERE id = $1',
      [id]
    );
    
    if (existingQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Study group not found'
      });
    }
    
    // Delete related records first (schedules, assignments, homeroom assignments)
    await db.transaction(async (trx) => {
      await trx.raw('DELETE FROM group_schedules WHERE group_id = $1', [id]);
      await trx.raw('DELETE FROM group_homeroom_assignments WHERE group_id = $1', [id]);
      await trx.raw('DELETE FROM assignments WHERE assignable_type = $1 AND assignable_id = $2', ['study_group', id]);
      await trx.raw('DELETE FROM study_groups WHERE id = $1', [id]);
    });
    
    logger.info(`Deleted study group: ${existingQuery.rows[0].name} (ID: ${id})`);
    
    res.json({
      success: true,
      message: 'Study group deleted successfully'
    });
    
  } catch (error) {
    logger.error('Error deleting study group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete study group'
    });
  }
});

// Schedule study groups with intelligent engine
router.post('/schedule', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      group_ids, 
      start_date, 
      end_date,
      force_schedule = false 
    } = req.body;
    
    if (!group_ids || !Array.isArray(group_ids) || group_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'group_ids array is required'
      });
    }
    
    // Get groups to schedule
    const groupsQuery = await db.raw(
      'SELECT * FROM study_groups WHERE id = ANY($1)',
      [group_ids]
    );
    
    const groups = groupsQuery.rows;
    
    // Get existing assignments in the date range
    const existingAssignmentsQuery = await db.raw(`
      SELECT * FROM assignments 
      WHERE date BETWEEN $1 AND $2 
      AND status = 'scheduled'
      AND assignable_type = 'study_group'
    `, [start_date, end_date]);
    
    const existingAssignments = existingAssignmentsQuery.rows;
    
    // Run scheduling engine
    const result: SchedulingResult = await schedulingEngine.scheduleStudyGroups(
      groups,
      { start: new Date(start_date), end: new Date(end_date) },
      existingAssignments
    );
    
    if (!result.success && !force_schedule) {
      return res.status(400).json({
        success: false,
        data: result,
        error: 'Scheduling failed due to conflicts'
      });
    }
    
    // Save successful assignments to database
    if (result.assignments.length > 0) {
      await db.transaction(async (trx) => {
        for (const assignment of result.assignments) {
          // Check for duplicate assignment before inserting
          const existingAssignment = await trx('assignments')
            .where('room_id', assignment.room_id)
            .whereRaw("date::date = ?::date", [assignment.date])
            .where('status', 'active')
            .where(function() {
              this.where('start_time', '<=', assignment.end_time)
                  .andWhere('end_time', '>=', assignment.start_time);
            })
            .first();
          
          // Skip if assignment already exists
          if (existingAssignment) {
            logger.warn(`Skipping duplicate assignment for room ${assignment.room_id} on ${assignment.date} ${assignment.start_time}-${assignment.end_time}`);
            continue;
          }
          
          await trx.raw(`
            INSERT INTO assignments (
              room_id, assignment_type_id, assignable_type, assignable_id, 
              title, description, date, start_time, end_time, 
              requester_id, status, is_recurring, special_requirements
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
            assignment.room_id,
            assignment.assignment_type_id,
            assignment.assignable_type,
            assignment.assignable_id,
            assignment.title,
            assignment.description,
            assignment.date,
            assignment.start_time,
            assignment.end_time,
            req.user!.id,
            assignment.status,
            assignment.is_recurring,
            JSON.stringify(assignment.special_requirements)
          ]);
        }
      });
    }
    
    logger.info(`Scheduled ${result.assignments.length} study groups`);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('Error scheduling study groups:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to schedule study groups'
    });
  }
});

// Get group schedules
router.get('/:id/schedules', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const schedulesQuery = await db.raw(
      'SELECT * FROM group_schedules WHERE group_id = $1 ORDER BY day_of_week, start_time',
      [id]
    );
    
    res.json({
      success: true,
      data: {
        schedules: schedulesQuery.rows
      }
    });
  } catch (error) {
    logger.error('Error fetching group schedules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch group schedules'
    });
  }
});

// Export calendar
router.post('/export-calendar', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { group_ids, format, start_date, end_date } = req.body;
    
    // Get assignments for the specified groups and date range
    const assignmentsQuery = await db.raw(`
      SELECT 
        a.*,
        sg.name as study_group_name,
        r.room_number,
        sg.grade_level
      FROM assignments a
      JOIN study_groups sg ON a.assignable_id = sg.id AND a.assignable_type = 'study_group'
      JOIN rooms r ON a.room_id = r.id
      WHERE sg.id = ANY($1)
        AND a.date >= $2
        AND a.date <= $3
        AND a.status = 'active'
      ORDER BY a.date, a.start_time
    `, [group_ids, start_date, end_date]);
    
    const assignments = assignmentsQuery.rows;
    
    if (format === 'ical') {
      // Generate iCal content
      let icalContent = 'BEGIN:VCALENDAR\r\n';
      icalContent += 'VERSION:2.0\r\n';
      icalContent += 'PRODID:-//Educational Scheduling System//Study Groups Calendar//EN\r\n';
      icalContent += 'CALSCALE:GREGORIAN\r\n';
      icalContent += 'METHOD:PUBLISH\r\n';
      
      assignments.forEach((assignment: any) => {
        const startDate = new Date(assignment.date);
        const [hours, minutes] = assignment.start_time.split(':');
        startDate.setHours(parseInt(hours), parseInt(minutes));
        
        const endDate = new Date(assignment.date);
        const [endHours, endMinutes] = assignment.end_time.split(':');
        endDate.setHours(parseInt(endHours), parseInt(endMinutes));
        
        const formatDate = (date: Date) => {
          return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        };
        
        icalContent += 'BEGIN:VEVENT\r\n';
        icalContent += `UID:${assignment.id}@study-groups\r\n`;
        icalContent += `DTSTART:${formatDate(startDate)}\r\n`;
        icalContent += `DTEND:${formatDate(endDate)}\r\n`;
        icalContent += `SUMMARY:${assignment.study_group_name} (${assignment.grade_level})\r\n`;
        icalContent += `LOCATION:${assignment.room_number}\r\n`;
        icalContent += `DESCRIPTION:Study group: ${assignment.study_group_name}\\nGrade: ${assignment.grade_level}\\nRoom: ${assignment.room_number}\r\n`;
        icalContent += 'END:VEVENT\r\n';
      });
      
      icalContent += 'END:VCALENDAR\r\n';
      
      res.json({
        success: true,
        data: {
          calendar_content: icalContent
        }
      });
    } else {
      // Return JSON format
      res.json({
        success: true,
        data: {
          assignments
        }
      });
    }
    
  } catch (error) {
    logger.error('Error exporting calendar:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export calendar'
    });
  }
});

export default router;

import { Router, Response, Request } from 'express';
import { db } from '../../config/database';
import logger from '../../utils/logger';
import { 
  Homeroom, 
  CreateHomeroomData, 
  UpdateHomeroomData,
  Grade,
  getHomeroomName,
  getSchoolYear
} from '../../domain/models/Homeroom';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';

const router = Router();

// Helper function to create automatic assignments for homeroom
async function createHomeroomAssignments(homeroom: any) {
  try {
    logger.info(`Creating assignments for homeroom ${homeroom.display_name}`);
    
    // School days: Sunday-Friday (exclude Saturday)
    const schoolDays = [0, 1, 2, 3, 4, 5]; // 0=Sunday, 6=Saturday
    
    // Get current date and find the start of the current school year
    const now = new Date();
    const currentYear = now.getFullYear();
    const startOfYear = new Date(currentYear, 8, 1); // September 1st
    
    // If we're past September, use this year, otherwise use last year
    const schoolYearStart = now >= startOfYear ? startOfYear : new Date(currentYear - 1, 8, 1);
    
    // Create assignments for each school day until end of school year (June 30th)
    const schoolYearEnd = new Date(currentYear + 1, 5, 30); // June 30th
    
    for (let date = new Date(schoolYearStart); date <= schoolYearEnd; date.setDate(date.getDate() + 1)) {
      const dayOfWeek = date.getDay();
      
      // Skip Saturdays
      if (dayOfWeek === 6) continue;
      
      const dateStr = date.toISOString().split('T')[0];
      
      // Check if assignment already exists for this date and homeroom
      const existingAssignment = await db('assignments')
        .where({
          assignable_type: 'homeroom',
          assignable_id: homeroom.id,
          status: 'active'
        })
        .whereRaw("date::date = ?::date", [dateStr])
        .first();
      
      // Skip if assignment already exists
      if (existingAssignment) {
        logger.debug(`Assignment already exists for homeroom ${homeroom.display_name} on ${dateStr}, skipping`);
        continue;
      }
      
      // Create assignment for 8:00-14:40
      await db.raw(`
        INSERT INTO assignments (
          type, assignable_type, assignable_id, room_id, activity_type, 
          created_by, start_date, date, start_time, end_time, 
          days_of_week, time_slots, is_manual, status, 
          created_at, updated_at
        ) VALUES (
          'recurring', 'homeroom', ?, ?, 'לימודים',
          1, ?, ?, '08:00', '14:40',
          ?, ?, false, 'active',
          NOW(), NOW()
        )
      `, [
        homeroom.id, // Use homeroom ID as assignable_id
        homeroom.room_id,
        dateStr,
        dateStr,
        JSON.stringify([dayOfWeek]), // days_of_week as JSON array
        JSON.stringify([{ start: '08:00', end: '14:40' }]) // time_slots as JSON array
      ]);
    }
    
    logger.info(`Created assignments for homeroom ${homeroom.display_name} from ${schoolYearStart.toISOString().split('T')[0]} to ${schoolYearEnd.toISOString().split('T')[0]}`);
    
  } catch (error) {
    logger.error('Error creating homeroom assignments:', error);
    // Don't throw error - homeroom creation should succeed even if assignments fail
  }
}

// Get all homerooms
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { grade_id, school_year } = req.query;
    
    let query = `
      SELECT h.*, g.name as grade_name, r.room_number, r.room_type, r.floor, r.wing,
             u.full_name as teacher_name, u.email as teacher_email
      FROM homerooms h
      JOIN grades g ON h.grade_id::text = g.id::text
      JOIN rooms r ON h.room_id::text = r.id::text
      LEFT JOIN users u ON h.teacher_id::text = u.id::text
      WHERE h.is_active = true
    `;
    
    const params: any[] = [];
    
    if (grade_id) {
      query += ' AND h.grade_id = $1';
      params.push(grade_id);
    }
    
    if (school_year) {
      query += grade_id ? ' AND h.school_year = $2' : ' AND h.school_year = $1';
      params.push(school_year);
    }
    
    query += ' ORDER BY g.name, h.class_number';
    
    const result = await db.raw(query, params);
    
    res.json({
      success: true,
      data: {
        homerooms: result.rows.map((hr: any) => ({
          ...hr,
          display_name: getHomeroomName(hr)
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching homerooms:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch homerooms'
    });
  }
});

// Get available rooms for homeroom assignment
router.get('/available-rooms', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { grade_id, school_year } = req.query;
    
    if (!grade_id || !school_year) {
      return res.status(400).json({
        success: false,
        error: 'grade_id and school_year are required'
      });
    }
    
    // Get grade info to determine room type pattern
    const gradeQuery = await db.raw('SELECT * FROM grades WHERE id = :gradeId', { gradeId: grade_id });
    const grade = gradeQuery.rows[0];
    
    if (!grade) {
      return res.status(404).json({
        success: false,
        error: 'Grade not found'
      });
    }
    
    // Map grade name to room type pattern
    const gradeToRoomType: Record<string, string> = {
      'א': 'CLASSROOM_A',
      'ב': 'CLASSROOM_B', 
      'ג': 'CLASSROOM_C',
      'ד': 'CLASSROOM_D',
      'ה': 'CLASSROOM_E',
      'ו': 'CLASSROOM_F'
    };
    
    const targetRoomType = gradeToRoomType[grade.name];
    
    // Get rooms that match the grade's room type and are not assigned as homerooms for this school year
    const availableRoomsQuery = await db.raw(`
      SELECT r.*, 
             CASE 
               WHEN r.room_type = :targetRoomType THEN 100
               WHEN r.room_type = 'MAMAD' THEN 80
               WHEN r.room_type = 'HOMEROOM' THEN 70
               WHEN r.room_type = 'REGULAR' THEN 60
               ELSE 10
             END as priority_score
      FROM rooms r
      WHERE r.is_active = true
        AND r.room_type = :targetRoomType2
        AND r.id NOT IN (
          SELECT room_id FROM homerooms 
          WHERE school_year = :schoolYear
        )
        AND r.capacity >= 30
      ORDER BY priority_score DESC, r.room_number
    `, { targetRoomType, targetRoomType2: targetRoomType, schoolYear: school_year });
    
    res.json({
      success: true,
      data: {
        available_rooms: availableRoomsQuery.rows,
        grade_info: grade
      }
    });
    
  } catch (error) {
    logger.error('Error fetching available rooms:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available rooms'
    });
  }
});

// Get homeroom by ID
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'ID is required'
      });
    }
    
    const homeroomQuery = await db.raw(`
      SELECT h.*, g.name as grade_name, r.room_number, r.room_type, r.floor, r.wing,
             u.full_name as teacher_name, u.email as teacher_email
      FROM homerooms h
      JOIN grades g ON h.grade_id::text = g.id::text
      JOIN rooms r ON h.room_id::text = r.id::text
      LEFT JOIN users u ON h.teacher_id::text = u.id::text
      WHERE h.id = $1
    `, [id]);
    
    if (homeroomQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Homeroom not found'
      });
    }
    
    // Get current assignments for this homeroom
    const assignmentsQuery = await db.raw(`
      SELECT a.*, at.name as assignment_type_name, r.room_number
      FROM assignments a
      JOIN assignment_types at ON a.assignment_type_id = at.id
      JOIN rooms r ON a.room_id = r.id
      WHERE a.room_id = (SELECT room_id FROM homerooms WHERE id = $1)
        AND a.date >= CURRENT_DATE
        AND a.status = 'scheduled'
      ORDER BY a.date, a.start_time
    `, [id]);
    
    const homeroom = homeroomQuery.rows[0];
    homeroom.display_name = getHomeroomName(homeroom);
    homeroom.current_assignments = assignmentsQuery.rows;
    
    res.json({
      success: true,
      data: {
        homeroom
      }
    });
  } catch (error) {
    logger.error('Error fetching homeroom:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch homeroom'
    });
  }
});

// Create new homeroom
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const homeroomData: CreateHomeroomData = req.body;
    
    // Log incoming data for debugging
    logger.info('Creating homeroom with data:', JSON.stringify(homeroomData, null, 2));
    
    // Validate input
    if (!homeroomData.room_id || !homeroomData.grade_id || !homeroomData.class_number) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: room_id, grade_id, class_number'
      });
    }
    
    // Convert to proper types
    const room_id = homeroomData.room_id; // Keep as UUID string
    const grade_id = homeroomData.grade_id; // Keep as UUID string
    const class_number = typeof homeroomData.class_number === 'string' ? parseInt(homeroomData.class_number) : homeroomData.class_number;
    
    // Validate conversion
    if (isNaN(class_number) || !room_id || !grade_id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid field values: room_id and grade_id must be UUIDs, class_number must be number'
      });
    }
    
    // Check if room is already assigned as homeroom
    const existingQuery = await db.raw(
      'SELECT * FROM homerooms WHERE room_id = :roomId AND school_year = :schoolYear',
      { roomId: room_id, schoolYear: homeroomData.school_year }
    );
    
    if (existingQuery.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Room is already assigned as homeroom for this school year'
      });
    }
    
    // Insert homeroom
    const insertValues = [
      room_id, // UUID string
      grade_id, // UUID string
      class_number, // number
      homeroomData.teacher_id || null,  // Ensure teacher_id is null if not provided
      homeroomData.max_students || 40,  // Default to 40 if not provided
      homeroomData.school_year,
      homeroomData.is_active !== undefined ? homeroomData.is_active : true
    ];
    
    logger.info('Insert values:', insertValues);
    
    const result = await db.raw(
      `INSERT INTO homerooms (room_id, grade_id, class_number, teacher_id, max_students, school_year, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      insertValues
    );
    
    const newHomeroom = result.rows[0];
    newHomeroom.display_name = getHomeroomName(newHomeroom);
    
    logger.info(`Created homeroom: ${newHomeroom.display_name} (ID: ${newHomeroom.id})`);
    
    // Create automatic assignments for school hours (8:00-14:40, Sunday-Friday)
    await createHomeroomAssignments(newHomeroom);
    
    res.status(201).json({
      success: true,
      data: {
        homeroom: newHomeroom
      }
    });
    
  } catch (error) {
    logger.error('Error creating homeroom:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create homeroom'
    });
  }
});

// Update homeroom
router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData: UpdateHomeroomData = req.body;
    
    // Check if homeroom exists
    const existingQuery = await db.raw(
      'SELECT * FROM homerooms WHERE id = $1',
      [id]
    );
    
    if (existingQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Homeroom not found'
      });
    }
    
    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;
    
    if (updateData.room_id !== undefined) {
      updateFields.push(`room_id = $${paramIndex++}`);
      updateValues.push(updateData.room_id);
    }
    
    if (updateData.teacher_id !== undefined) {
      updateFields.push(`teacher_id = $${paramIndex++}`);
      updateValues.push(updateData.teacher_id);
    }
    
    if (updateData.max_students !== undefined) {
      updateFields.push(`max_students = $${paramIndex++}`);
      updateValues.push(updateData.max_students);
    }
    
    if (updateData.current_students !== undefined) {
      updateFields.push(`current_students = $${paramIndex++}`);
      updateValues.push(updateData.current_students);
    }
    
    if (updateData.is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      updateValues.push(updateData.is_active);
    }
    
    if (updateFields.length > 0) {
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(id);
      
      const updateQuery = `
        UPDATE homerooms 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
      `;
      
      await db.raw(updateQuery, updateValues);
    }
    
    logger.info(`Updated homeroom ID: ${id}`);
    
    // Get updated homeroom with full details
    const updatedQuery = await db.raw(`
      SELECT h.*, g.name as grade_name, r.room_number, r.room_type
      FROM homerooms h
      JOIN grades g ON h.grade_id::text = g.id::text
      JOIN rooms r ON h.room_id::text = r.id::text
      WHERE h.id = $1
    `, [id]);
    
    const updatedHomeroom = updatedQuery.rows[0];
    updatedHomeroom.display_name = getHomeroomName(updatedHomeroom);
    
    res.json({
      success: true,
      data: {
        homeroom: updatedHomeroom
      }
    });
    
  } catch (error) {
    logger.error('Error updating homeroom:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update homeroom'
    });
  }
});

// Delete homeroom
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    logger.info('Full request object:', JSON.stringify({
      method: req.method,
      url: req.url,
      params: req.params,
      query: req.query,
      route: req.route?.path
    }));
    logger.info('Full req.params object:', JSON.stringify(req.params));
    const { id } = req.params;
    
    // Convert string ID to number for database queries
    const homeroomId = parseInt(id);
    
    logger.info(`Attempting to delete homeroom with ID: ${id}, type: ${typeof id}, converted: ${homeroomId}, type: ${typeof homeroomId}`);
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'ID is required'
      });
    }
    
    // Check if homeroom exists
    logger.info(`About to check if homeroom exists with ID: ${homeroomId}`);
    logger.info(`Parameters array: [${homeroomId}]`);
    const existingQuery = await db.raw(
      'SELECT * FROM homerooms WHERE id = ?',
      [homeroomId]
    );
    
    if (existingQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Homeroom not found'
      });
    }
    
    // Check if there are active assignments
    logger.info(`About to check assignments for homeroom ID: ${homeroomId}`);
    const assignmentsQuery = await db.raw(
      'SELECT COUNT(*) as count FROM assignments WHERE room_id = (SELECT room_id::uuid FROM homerooms WHERE id = ?) AND date >= CURRENT_DATE',
      [homeroomId]
    );
    
    if (assignmentsQuery.rows[0].count > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete homeroom with active assignments'
      });
    }
    
    // Delete homeroom
    logger.info(`About to execute DELETE with ID: ${homeroomId}, type: ${typeof homeroomId}, array: [${homeroomId}]`);
    
    // First, delete all assignments related to this homeroom
    await db.raw('DELETE FROM assignments WHERE assignable_type = \'homeroom\' AND assignable_id = ?', [homeroomId]);
    logger.info(`Deleted assignments for homeroom ID: ${homeroomId}`);
    
    // Then delete the homeroom itself
    await db.raw('DELETE FROM homerooms WHERE id = ?', [homeroomId]);
    
    logger.info(`Deleted homeroom ID: ${homeroomId}`);
    
    res.json({
      success: true,
      message: 'Homeroom deleted successfully'
    });
    
  } catch (error) {
    logger.error('Error deleting homeroom:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete homeroom'
    });
  }
});



// Assign teacher to homeroom
router.put('/:id/assign-teacher', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { teacher_id } = req.body;
    
    if (!teacher_id) {
      return res.status(400).json({
        success: false,
        error: 'teacher_id is required'
      });
    }
    
    // Check if teacher exists
    const teacherQuery = await db.raw(
      'SELECT * FROM users WHERE id = $1 AND (role = $2 OR role = $3)',
      [teacher_id, 'grade_coordinator', 'admin']
    );
    
    if (teacherQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found or insufficient permissions'
      });
    }
    
    // Update homeroom with teacher
    await db.raw(
      'UPDATE homerooms SET teacher_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [teacher_id, id]
    );
    
    logger.info(`Assigned teacher ${teacher_id} to homeroom ${id}`);
    
    res.json({
      success: true,
      message: 'Teacher assigned successfully'
    });
    
  } catch (error) {
    logger.error('Error assigning teacher:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign teacher'
    });
  }
});

// Get grades
router.get('/grades', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gradesQuery = await db.raw(`
      SELECT g.*, u.full_name as coordinator_name, u.email as coordinator_email
      FROM grades g
      LEFT JOIN users u ON g.coordinator_id = u.id
      ORDER BY g.name
    `);
    
    res.json({
      success: true,
      data: {
        grades: gradesQuery.rows
      }
    });
    
  } catch (error) {
    logger.error('Error fetching grades:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch grades'
    });
  }
});

// Generate utilization report
router.post('/utilization-report', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { format, include_details } = req.body;
    
    // Get all homerooms with utilization data
    const homeroomsQuery = await db.raw(`
      SELECT 
        h.*,
        g.name as grade_name,
        r.room_number,
        r.room_type,
        u.full_name as teacher_name,
        u.email as teacher_email,
        CASE 
          WHEN h.max_students > 0 THEN ROUND((h.current_students::float / h.max_students::float) * 100)
          ELSE 0 
        END as utilization_percentage
      FROM homerooms h
      JOIN grades g ON h.grade_id = g.id
      JOIN rooms r ON h.room_id = r.id
      LEFT JOIN users u ON h.teacher_id = u.id
      WHERE h.is_active = true
      ORDER BY g.name, h.class_number
    `);
    
    const homerooms = homeroomsQuery.rows;
    
    // Calculate summary statistics
    const totalCapacity = homerooms.reduce((sum: number, h: any) => sum + h.max_students, 0);
    const totalStudents = homerooms.reduce((sum: number, h: any) => sum + h.current_students, 0);
    const overallUtilization = totalCapacity > 0 ? Math.round((totalStudents / totalCapacity) * 100) : 0;
    
    const reportData = {
      summary: {
        total_homerooms: homerooms.length,
        total_capacity: totalCapacity,
        total_students: totalStudents,
        overall_utilization: overallUtilization,
        active_homerooms: homerooms.filter((h: any) => h.is_active).length,
        homerooms_with_teachers: homerooms.filter((h: any) => h.teacher_name).length
      },
      homerooms: homerooms.map((h: any) => ({
        id: h.id,
        display_name: h.display_name,
        grade_name: h.grade_name,
        room_number: h.room_number,
        room_type: h.room_type,
        max_students: h.max_students,
        current_students: h.current_students,
        utilization_percentage: h.utilization_percentage,
        teacher_name: h.teacher_name,
        teacher_email: h.teacher_email,
        is_active: h.is_active,
        school_year: h.school_year
      }))
    };
    
    res.json({
      success: true,
      data: reportData
    });
    
  } catch (error: any) {
    logger.error('Error generating utilization report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate utilization report'
    });
  }
});

export default router;

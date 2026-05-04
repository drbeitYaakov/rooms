import { Router, Response } from 'express';
import { db } from '../../config/database';
import logger from '../../utils/logger';

const router = Router();

// Get room utilization report
router.get('/utilization', async (req: any, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Get total room capacity and current usage
    const roomsQuery = await db.raw(`
      SELECT 
        r.id,
        r.name,
        r.capacity,
        r.type,
        COUNT(a.id) as total_assignments,
        SUM(
          CASE 
            WHEN a.status = 'active' THEN 1 
            ELSE 0 
          END
        ) as active_assignments
      FROM rooms r
      LEFT JOIN assignments a ON r.id = a.room_id
      ${startDate && endDate ? `WHERE a.date BETWEEN '${startDate}' AND '${endDate}'` : ''}
      GROUP BY r.id, r.name, r.capacity, r.type
      ORDER BY r.name
    `);

    const rooms = roomsQuery.rows;
    
    // Calculate utilization metrics
    const totalRooms = rooms.length;
    const activeRooms = rooms.filter((r: any) => parseInt(r.active_assignments) > 0).length;
    const avgUtilization = activeRooms > 0 ? (activeRooms / totalRooms) * 100 : 0;

    res.json({
      success: true,
      data: {
        summary: {
          totalRooms,
          activeRooms,
          utilizationRate: Math.round(avgUtilization),
          period: { startDate, endDate }
        },
        rooms: rooms.map((room: any) => ({
          id: room.id,
          name: room.name,
          type: room.type,
          capacity: room.capacity,
          utilization: room.total_assignments > 0 ? Math.round((parseInt(room.active_assignments) / parseInt(room.total_assignments)) * 100) : 0
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching utilization report:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch utilization report' });
  }
});

// Get conflicts report
router.get('/conflicts', async (req: any, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Find double bookings and conflicts
    const conflictsQuery = await db.raw(`
      SELECT 
        a1.id as assignment1_id,
        a2.id as assignment2_id,
        r.name as room_name,
        a1.date,
        a1.start_time as time1_start,
        a1.end_time as time1_end,
        a2.start_time as time2_start,
        a2.end_time as time2_end,
        a1.assignable_type as type1,
        a2.assignable_type as type2
      FROM assignments a1
      JOIN assignments a2 ON a1.room_id = a2.room_id 
        AND a1.id < a2.id 
        AND a1.date = a2.date
        AND (
          (a1.start_time <= a2.start_time AND a1.end_time > a2.start_time) OR
          (a2.start_time <= a1.start_time AND a2.end_time > a1.start_time)
        )
      JOIN rooms r ON a1.room_id = r.id
      ${startDate && endDate ? `WHERE a1.date BETWEEN '${startDate}' AND '${endDate}'` : ''}
      ORDER BY a1.date, r.name
    `);

    const conflicts = conflictsQuery.rows;

    res.json({
      success: true,
      data: {
        totalConflicts: conflicts.length,
        conflicts: conflicts.map((conflict: any) => ({
          id: `conflict_${conflict.assignment1_id}_${conflict.assignment2_id}`,
          room: conflict.room_name,
          date: conflict.date,
          timeRange: `${conflict.time1_start}-${conflict.time1_end}`,
          assignments: [
            { id: conflict.assignment1_id, type: conflict.type1 },
            { id: conflict.assignment2_id, type: conflict.type2 }
          ]
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching conflicts report:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch conflicts report' });
  }
});

// Get scheduling statistics
router.get('/statistics', async (req: any, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Get assignment statistics by type
    const statsQuery = await db.raw(`
      SELECT 
        assignable_type,
        COUNT(*) as count,
        COUNT(DISTINCT date) as days_active
      FROM assignments
      ${startDate && endDate ? `WHERE date BETWEEN '${startDate}' AND '${endDate}'` : ''}
      GROUP BY assignable_type
      ORDER BY count DESC
    `);

    // Get daily statistics
    const dailyStatsQuery = await db.raw(`
      SELECT 
        date,
        COUNT(*) as total_assignments,
        COUNT(DISTINCT room_id) as rooms_used
      FROM assignments
      ${startDate && endDate ? `WHERE date BETWEEN '${startDate}' AND '${endDate}'` : ''}
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `);

    const stats = statsQuery.rows;
    const dailyStats = dailyStatsQuery.rows;

    res.json({
      success: true,
      data: {
        summary: {
          totalAssignments: stats.reduce((sum: any, s: any) => sum + parseInt(s.count), 0),
          totalStudyGroups: stats.find((s: any) => s.assignable_type === 'study_group')?.count || 0,
          totalRegularClasses: stats.find((s: any) => s.assignable_type === 'regular_class')?.count || 0,
          totalMeetings: stats.find((s: any) => s.assignable_type === 'meeting')?.count || 0
        },
        byType: stats.map((stat: any) => ({
          type: stat.assignable_type,
          count: parseInt(stat.count),
          daysActive: parseInt(stat.days_active)
        })),
        daily: dailyStats.map((stat: any) => ({
          date: stat.date,
          assignments: parseInt(stat.total_assignments),
          roomsUsed: parseInt(stat.rooms_used)
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching statistics report:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch statistics report' });
  }
});

// Export report data
router.get('/export', async (req: any, res: Response) => {
  try {
    const { type, format, startDate, endDate } = req.query;
    
    let data;
    switch (type) {
      case 'utilization':
        const utilizationResponse = await (require('./reports')).getUtilizationReport(startDate, endDate);
        data = utilizationResponse.data;
        break;
      case 'conflicts':
        const conflictsResponse = await (require('./reports')).getConflictsReport(startDate, endDate);
        data = conflictsResponse.data;
        break;
      case 'statistics':
        const statsResponse = await (require('./reports')).getStatisticsReport(startDate, endDate);
        data = statsResponse.data;
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid report type' });
    }

    res.json({
      success: true,
      data: {
        type,
        format,
        exportDate: new Date().toISOString(),
        period: { startDate, endDate },
        data
      }
    });
  } catch (error) {
    logger.error('Error exporting report:', error);
    res.status(500).json({ success: false, error: 'Failed to export report' });
  }
});

export default router;

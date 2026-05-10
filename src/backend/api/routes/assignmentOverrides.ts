import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';

const router = Router();

// Get conflicts
router.get('/conflicts', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Simple conflict detection based on overlapping assignments
    const conflicts = await db.raw(`
      SELECT 
        a1.id as conflict_id,
        r.room_number,
        a1.date,
        a1.start_time,
        a1.end_time,
        json_agg(
          json_build_object(
            'id', a.id,
            'title', a.title,
            'activity_type', a.activity_type,
            'start_time', a.start_time,
            'end_time', a.end_time
          )
        ) as assignments
      FROM assignments a1
      JOIN assignments a2 ON a1.room_id = a2.room_id 
        AND a1.date = a2.date 
        AND a1.id != a2.id
        AND a1.status = 'active' 
        AND a2.status = 'active'
        AND (
          (a1.start_time <= a2.end_time AND a1.end_time >= a2.start_time)
        )
      JOIN rooms r ON a1.room_id = r.id
      GROUP BY a1.id, r.room_number, a1.date, a1.start_time, a1.end_time
    `);

    res.json({
      success: true,
      data: { conflicts: conflicts.rows }
    });
  } catch (error: any) {
    console.error('Error fetching conflicts:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת ההתנגשויות נכשלה'
    });
  }
}));

// Override assignment
router.post('/override', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { assignment_id, override_reason } = req.body;

  try {
    // Update assignment with override reason
    const [updatedAssignment] = await db('assignments')
      .where({ id: assignment_id })
      .update({
        override_reason,
        modified_by: req.user!.id,
        updated_at: new Date()
      })
      .returning('*');

    res.json({
      success: true,
      data: { assignment: updatedAssignment }
    });
  } catch (error: any) {
    console.error('Error overriding assignment:', error);
    res.status(500).json({
      success: false,
      error: 'דריסת השיבוץ נכשלה'
    });
  }
}));

// Resolve conflict
router.post('/resolve-conflict', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { conflict_id, resolution } = req.body;

  try {
    // Get conflicting assignments
    const conflictingAssignments = await db('assignments')
      .where('room_id', conflict_id)
      .where('status', 'active')
      .orderBy('created_at', 'asc');

    if (conflictingAssignments.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'לא נמצאו שיבוצים מתנגשים'
      });
    }

    // Apply resolution
    if (resolution === 'keep_first') {
      // Cancel all but the first assignment
      await db('assignments')
        .where('room_id', conflict_id)
        .where('status', 'active')
        .whereNot('id', conflictingAssignments[0].id)
        .update({ status: 'cancelled', updated_at: new Date() });
    } else if (resolution === 'keep_second') {
      // Cancel all but the second assignment
      await db('assignments')
        .where('room_id', conflict_id)
        .where('status', 'active')
        .whereNot('id', conflictingAssignments[1].id)
        .update({ status: 'cancelled', updated_at: new Date() });
    } else if (resolution === 'cancel_both') {
      // Cancel all conflicting assignments
      await db('assignments')
        .where('room_id', conflict_id)
        .where('status', 'active')
        .update({ status: 'cancelled', updated_at: new Date() });
    }

    res.json({
      success: true,
      message: `ההתנגשות נפתרה בהצלחה (${resolution})`
    });
  } catch (error: any) {
    console.error('Error resolving conflict:', error);
    res.status(500).json({
      success: false,
      error: 'פתרון ההתנגשות נכשל'
    });
  }
}));

export default router;

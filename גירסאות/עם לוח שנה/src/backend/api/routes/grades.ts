import { randomUUID } from 'crypto';
import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest, requireCoordinator } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { logAudit } from '../../utils/logger';
import { getActiveAcademicYear } from '../../utils/academicYears';

const router = Router();

// Get all grades
router.get('/', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeYear = await getActiveAcademicYear(db);
    const query = db('grades')
      .select('*')
      .orderBy('name');

    if (activeYear?.id) {
      query.where({ year_id: activeYear.id });
    }

    const grades = await query;
    
    // Map to ensure proper format and encoding
    const formattedGrades = grades.map(grade => ({
      id: grade.id,
      name: grade.name.trim()
    }));
    
    res.json(formattedGrades);
  } catch (error) {
    console.error('Error fetching grades:', error);
    res.status(500).json({ error: 'Failed to fetch grades' });
  }
}));

// Get grade by ID
router.get('/:id', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  const grade = await db('grades')
    .where('id', id)
    .first();
  
  if (!grade) {
    return res.status(404).json({ error: 'Grade not found' });
  }
  
  res.json(grade);
}));

// Create grade (admin only)
router.post('/', authMiddleware, requireCoordinator, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, level, coordinator_id } = req.body;
  const activeYear = await getActiveAcademicYear(db);

  if (!activeYear) {
    return res.status(400).json({ error: 'No active academic year found' });
  }
  
  const [grade] = await db('grades')
    .insert({
      id: randomUUID(),
      year_id: activeYear.id,
      name,
      level,
      coordinator_id,
      created_at: new Date(),
      updated_at: new Date()
    })
    .returning('*');
  
  await logAudit('CREATE', { 
    action: 'CREATE',
    userId: req.user!.id,
    entityType: 'grade',
    entityId: grade.id,
    details: { name, level }
  });
  
  res.status(201).json(grade);
}));

// Update grade (admin only)
router.put('/:id', authMiddleware, requireCoordinator, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, level, coordinator_id } = req.body;
  
  const [grade] = await db('grades')
    .where('id', id)
    .update({
      name,
      level,
      coordinator_id,
      updated_at: new Date()
    })
    .returning('*');
  
  if (!grade) {
    return res.status(404).json({ error: 'Grade not found' });
  }
  
  await logAudit('UPDATE', { 
    action: 'UPDATE',
    userId: req.user!.id,
    entityType: 'grade',
    entityId: id,
    details: { name, level }
  });
  
  res.json(grade);
}));

// Delete grade (admin only)
router.delete('/:id', authMiddleware, requireCoordinator, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  const deleted = await db('grades')
    .where('id', id)
    .del();
  
  if (!deleted) {
    return res.status(404).json({ error: 'Grade not found' });
  }
  
  await logAudit('DELETE', { 
    action: 'DELETE',
    userId: req.user!.id,
    entityType: 'grade',
    entityId: id
  });
  
  res.status(204).send();
}));

export default router;

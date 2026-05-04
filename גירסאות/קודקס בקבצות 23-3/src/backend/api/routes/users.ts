import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest, requireAdmin, requireCoordinator } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { logAuth } from '../../utils/logger';

const router = Router();

// Get all users (admin only)
router.get('/', authMiddleware, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { role, gradeId, page = 1, limit = 20 } = req.query;

  let query = db('users')
    .where({ is_active: true })
    .leftJoin('grades', 'users.assigned_grade_id', 'grades.id')
    .select(
      'users.*',
      'grades.name as grade_name'
    );

  if (role) {
    query = query.where('users.role', role);
  }

  if (gradeId) {
    query = query.where('users.assigned_grade_id', gradeId);
  }

  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
  const users = await query.offset(offset).limit(parseInt(limit as string));

  const total = await db('users').where({ is_active: true }).count('* as count');

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: parseInt(String(total[0].count)),
        pages: Math.ceil(parseInt(String(total[0].count)) / parseInt(limit as string))
      }
    }
  });
}));

// Get user by ID
router.get('/:id', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  // Check permissions
  if (req.user!.role === 'general_user' && req.user!.id !== id) {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }

  const user = await db('users')
    .leftJoin('grades', 'users.grade_id', 'grades.id')
    .select(
      'users.*',
      'grades.grade_level',
      'grades.academic_year'
    )
    .where('users.id', id)
    .first();

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  res.json({
    success: true,
    data: { user }
  });
}));

// Create user (admin only)
router.post('/', authMiddleware, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, name, role = 'general_user', gradeId } = req.body;

  // Validate input
  if (!email || !password || !name) {
    return res.status(400).json({
      success: false,
      error: 'Email, password, and name are required'
    });
  }

  // Check if user exists
  const existingUser = await db('users').where({ email }).first();
  if (existingUser) {
    return res.status(400).json({
      success: false,
      error: 'User already exists'
    });
  }

  // Hash password
  const bcrypt = require('bcryptjs');
  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create user
  const [user] = await db('users').insert({
    email,
    password: hashedPassword,
    name,
    role,
    grade_id: gradeId,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  }).returning(['id', 'email', 'name', 'role', 'grade_id']);

  logAuth(`User created: ${email} (${role}) by ${req.user!.email}`);

  res.status(201).json({
    success: true,
    data: { user }
  });
}));

// Update user (admin only)
router.put('/:id', authMiddleware, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, role, gradeId, isActive } = req.body;

  // Check if user exists
  const existingUser = await db('users').where({ id }).first();
  if (!existingUser) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  // Update user
  const updates: any = {
    updated_at: new Date()
  };

  if (name) updates.name = name;
  if (role) updates.role = role;
  if (gradeId !== undefined) updates.grade_id = gradeId;
  if (isActive !== undefined) updates.is_active = isActive;

  const [user] = await db('users')
    .where({ id })
    .update(updates)
    .returning(['id', 'email', 'name', 'role', 'grade_id', 'is_active']);

  logAuth(`User updated: ${existingUser.email} by ${req.user!.email}`);

  res.json({
    success: true,
    data: { user }
  });
}));

// Delete user (admin only)
router.delete('/:id', authMiddleware, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  // Check if user exists
  const existingUser = await db('users').where({ id }).first();
  if (!existingUser) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  // Soft delete
  await db('users').where({ id }).update({
    is_active: false,
    updated_at: new Date()
  });

  logAuth(`User deleted: ${existingUser.email} by ${req.user!.email}`);

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
}));

// Reset user password (admin only)
router.post('/:id/reset-password', authMiddleware, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({
      success: false,
      error: 'New password is required'
    });
  }

  // Check if user exists
  const existingUser = await db('users').where({ id }).first();
  if (!existingUser) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  // Hash new password
  const bcrypt = require('bcryptjs');
  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  // Update password
  await db('users').where({ id }).update({
    password: hashedPassword,
    updated_at: new Date()
  });

  logAuth(`Password reset for user: ${existingUser.email} by ${req.user!.email}`);

  res.json({
    success: true,
    message: 'Password reset successfully'
  });
}));

// Get users by role
router.get('/role/:role', authMiddleware, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { role } = req.params;

  const users = await db('users')
    .where({ role, is_active: true })
    .leftJoin('grades', 'users.grade_id', 'grades.id')
    .select(
      'users.*',
      'grades.grade_level',
      'grades.academic_year'
    )
    .orderBy('users.name', 'asc');

  res.json({
    success: true,
    data: { users }
  });
}));

// Get users by grade
router.get('/grade/:gradeId', authMiddleware, requireCoordinator, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { gradeId } = req.params;

  // Check permissions - grade coordinators can only see their grade
  if (req.user!.role === 'grade_coordinator' && req.user!.gradeId !== gradeId) {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }

  const users = await db('users')
    .where({ grade_id: gradeId, is_active: true })
    .leftJoin('grades', 'users.grade_id', 'grades.id')
    .select(
      'users.*',
      'grades.grade_level',
      'grades.academic_year'
    )
    .orderBy('users.name', 'asc');

  res.json({
    success: true,
    data: { users }
  });
}));

// Search users
router.get('/search', authMiddleware, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { q, role, gradeId } = req.query;

  let query = db('users')
    .where({ is_active: true })
    .leftJoin('grades', 'users.grade_id', 'grades.id')
    .select(
      'users.*',
      'grades.grade_level',
      'grades.academic_year'
    );

  if (q) {
    query = query.where(function() {
      this.where('users.name', 'ilike', `%${q}%`)
        .orWhere('users.email', 'ilike', `%${q}%`);
    });
  }

  if (role) {
    query = query.where('users.role', role);
  }

  if (gradeId) {
    query = query.where('users.grade_id', gradeId);
  }

  const users = await query.orderBy('users.name', 'asc').limit(50);

  res.json({
    success: true,
    data: { users }
  });
}));

export default router;

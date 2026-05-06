import bcrypt from 'bcryptjs';
import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest, requireAdmin, requireCoordinator } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { logAuth } from '../../utils/logger';
import { getUserPasswordHash, normalizeEmail, validatePasswordStrength } from '../../utils/passwordPolicy';
import { recordAuditEvent } from '../../utils/auditService';
import { UserRole } from '../../domain/types';

const router = Router();

const normalizeRole = (role: unknown): UserRole => {
  const normalized = String(role || '').toLowerCase();

  if (normalized === 'admin') return 'admin';
  if (normalized === 'grade_coordinator') return 'grade_coordinator';
  if (normalized === 'study_groups_coordinator' || normalized === 'group_coordinator') {
    return 'study_groups_coordinator';
  }

  return 'general_user';
};

const userSelectColumns = [
  'users.id',
  'users.email',
  'users.full_name',
  'users.role',
  'users.grade_id',
  'users.assigned_grade_id',
  'users.is_active',
  'users.last_login',
  'users.failed_login_attempts',
  'users.locked_until',
  'users.password_changed_at',
  'users.mfa_enabled',
  'grades.name as grade_name',
  'grades.level as grade_level'
];

const serializeUser = (user: any) => ({
  id: user.id,
  email: user.email,
  name: user.full_name ?? user.name ?? user.email,
  role: normalizeRole(user.role),
  gradeId: user.grade_id ?? user.assigned_grade_id ?? null,
  isActive: Boolean(user.is_active),
  lastLogin: user.last_login ?? null,
  failedLoginAttempts: Number(user.failed_login_attempts || 0),
  lockedUntil: user.locked_until ?? null,
  passwordChangedAt: user.password_changed_at ?? null,
  mfaEnabled: Boolean(user.mfa_enabled),
  gradeName: user.grade_name ?? null,
  gradeLevel: user.grade_level ?? null
});

// Get all users (admin only)
router.get('/', authMiddleware, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { role, gradeId, page = 1, limit = 20 } = req.query;

  let query = db('users')
    .where({ 'users.is_active': true })
    .leftJoin('grades', 'users.grade_id', 'grades.id')
    .select(...userSelectColumns);

  if (role) {
    query = query.where('users.role', normalizeRole(role));
  }

  if (gradeId) {
    query = query.where('users.grade_id', gradeId);
  }

  const pageNumber = parseInt(page as string, 10);
  const limitNumber = parseInt(limit as string, 10);
  const offset = (pageNumber - 1) * limitNumber;

  const users = await query.offset(offset).limit(limitNumber);

  const total = await db('users').where({ is_active: true }).count('* as count');

  res.json({
    success: true,
    data: {
      users: users.map(serializeUser),
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total: parseInt(String(total[0].count), 10),
        pages: Math.ceil(parseInt(String(total[0].count), 10) / limitNumber)
      }
    }
  });
}));

// Get user by ID
router.get('/:id', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  if (req.user!.role === 'general_user' && req.user!.id !== id) {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }

  const user = await db('users')
    .leftJoin('grades', 'users.grade_id', 'grades.id')
    .select(...userSelectColumns)
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
    data: { user: serializeUser(user) }
  });
}));

// Create user (admin only)
router.post('/', authMiddleware, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, name, role = 'general_user', gradeId } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({
      success: false,
      error: 'Email, password, and name are required'
    });
  }

  const passwordValidationError = validatePasswordStrength(password);
  if (passwordValidationError) {
    return res.status(400).json({
      success: false,
      error: passwordValidationError
    });
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = normalizeRole(role);

  const existingUser = await db('users').where({ email: normalizedEmail }).first();
  if (existingUser) {
    return res.status(400).json({
      success: false,
      error: 'User already exists'
    });
  }

  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(password, salt);

  const [user] = await db('users').insert({
    id: randomUUID(),
    email: normalizedEmail,
    password_hash: hashedPassword,
    full_name: name,
    role: normalizedRole,
    grade_id: gradeId ?? null,
    assigned_grade_id: gradeId ?? null,
    is_active: true,
    failed_login_attempts: 0,
    locked_until: null,
    password_changed_at: new Date(),
    created_at: new Date(),
    updated_at: new Date()
  }).returning([
    'id',
    'email',
    'full_name',
    'role',
    'grade_id',
    'assigned_grade_id',
    'is_active',
    'last_login',
    'failed_login_attempts',
    'locked_until',
    'password_changed_at',
    'mfa_enabled'
  ]);

  logAuth(`User created: ${normalizedEmail} (${normalizedRole}) by ${req.user!.email}`);
  await recordAuditEvent({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'user',
    entityId: user.id,
    newValue: serializeUser(user),
    req
  });

  res.status(201).json({
    success: true,
    data: { user: serializeUser(user) }
  });
}));

// Update user (admin only)
router.put('/:id', authMiddleware, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, role, gradeId, isActive, lockedUntil, mfaEnabled } = req.body;

  const existingUser = await db('users')
    .leftJoin('grades', 'users.grade_id', 'grades.id')
    .select(...userSelectColumns)
    .where('users.id', id)
    .first();

  if (!existingUser) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  const updates: any = {
    updated_at: new Date()
  };

  if (name) updates.full_name = name;
  if (role) updates.role = normalizeRole(role);
  if (gradeId !== undefined) {
    updates.grade_id = gradeId;
    updates.assigned_grade_id = gradeId;
  }
  if (isActive !== undefined) updates.is_active = Boolean(isActive);
  if (lockedUntil !== undefined) updates.locked_until = lockedUntil;
  if (mfaEnabled !== undefined) updates.mfa_enabled = Boolean(mfaEnabled);

  const [user] = await db('users')
    .where({ id })
    .update(updates)
    .returning([
      'id',
      'email',
      'full_name',
      'role',
      'grade_id',
      'assigned_grade_id',
      'is_active',
      'last_login',
      'failed_login_attempts',
      'locked_until',
      'password_changed_at',
      'mfa_enabled'
    ]);

  logAuth(`User updated: ${existingUser.email} by ${req.user!.email}`);
  await recordAuditEvent({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'user',
    entityId: id,
    oldValue: serializeUser(existingUser),
    newValue: serializeUser(user),
    req
  });

  res.json({
    success: true,
    data: { user: serializeUser(user) }
  });
}));

// Delete user (admin only)
router.delete('/:id', authMiddleware, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const existingUser = await db('users')
    .leftJoin('grades', 'users.grade_id', 'grades.id')
    .select(...userSelectColumns)
    .where('users.id', id)
    .first();

  if (!existingUser) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  await db('users').where({ id }).update({
    is_active: false,
    updated_at: new Date()
  });

  logAuth(`User deleted: ${existingUser.email} by ${req.user!.email}`);
  await recordAuditEvent({
    userId: req.user!.id,
    action: 'DELETE',
    entityType: 'user',
    entityId: id,
    oldValue: serializeUser(existingUser),
    newValue: { isActive: false },
    req
  });

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

  const passwordValidationError = validatePasswordStrength(newPassword);
  if (passwordValidationError) {
    return res.status(400).json({
      success: false,
      error: passwordValidationError
    });
  }

  const existingUser = await db('users').where({ id }).first();
  if (!existingUser) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  const currentPasswordHash = getUserPasswordHash(existingUser);
  const isSamePassword = currentPasswordHash
    ? await bcrypt.compare(newPassword, currentPasswordHash)
    : false;

  if (isSamePassword) {
    return res.status(400).json({
      success: false,
      error: 'New password must be different from the current password'
    });
  }

  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  await db('users').where({ id }).update({
    password_hash: hashedPassword,
    password_changed_at: new Date(),
    failed_login_attempts: 0,
    locked_until: null,
    updated_at: new Date()
  });

  logAuth(`Password reset for user: ${existingUser.email} by ${req.user!.email}`);
  await recordAuditEvent({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'user',
    entityId: id,
    oldValue: { password_reset: false },
    newValue: { password_reset: true },
    req
  });

  res.json({
    success: true,
    message: 'Password reset successfully'
  });
}));

// Get users by role
router.get('/role/:role', authMiddleware, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { role } = req.params;

  const users = await db('users')
    .where({ 'users.role': normalizeRole(role), 'users.is_active': true })
    .leftJoin('grades', 'users.grade_id', 'grades.id')
    .select(...userSelectColumns)
    .orderBy('users.full_name', 'asc');

  res.json({
    success: true,
    data: { users: users.map(serializeUser) }
  });
}));

// Get users by grade
router.get('/grade/:gradeId', authMiddleware, requireCoordinator, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { gradeId } = req.params;

  if (req.user!.role === 'grade_coordinator' && req.user!.gradeId !== gradeId) {
    return res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }

  const users = await db('users')
    .where({ 'users.grade_id': gradeId, 'users.is_active': true })
    .leftJoin('grades', 'users.grade_id', 'grades.id')
    .select(...userSelectColumns)
    .orderBy('users.full_name', 'asc');

  res.json({
    success: true,
    data: { users: users.map(serializeUser) }
  });
}));

// Search users
router.get('/search', authMiddleware, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { q, role, gradeId } = req.query;

  let query = db('users')
    .where({ 'users.is_active': true })
    .leftJoin('grades', 'users.grade_id', 'grades.id')
    .select(...userSelectColumns);

  if (q) {
    query = query.where(function() {
      this.where('users.full_name', 'ilike', `%${q}%`)
        .orWhere('users.email', 'ilike', `%${q}%`);
    });
  }

  if (role) {
    query = query.where('users.role', normalizeRole(role));
  }

  if (gradeId) {
    query = query.where('users.grade_id', gradeId);
  }

  const users = await query.orderBy('users.full_name', 'asc').limit(50);

  res.json({
    success: true,
    data: { users: users.map(serializeUser) }
  });
}));

export default router;

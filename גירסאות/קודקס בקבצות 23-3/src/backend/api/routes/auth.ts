import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { logAuth, logError } from '../../utils/logger';
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

const getUserPasswordHash = (user: any): string | undefined => user.password ?? user.password_hash;

const getUserDisplayName = (user: any): string => {
  if (user.name) return user.name;
  if (user.full_name) return user.full_name;

  const firstName = user.first_name || '';
  const lastName = user.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || user.email;
};

// Register user
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
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
  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(password, salt);
  const normalizedRole = normalizeRole(role);

  // Create user
  const [user] = await db('users').insert({
    email,
    password_hash: hashedPassword,
    full_name: name,
    role: normalizedRole,
    grade_id: gradeId,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  }).returning(['id', 'email', 'full_name', 'role', 'grade_id']);

  // Generate JWT
  const token = jwt.sign(
    { id: user.id, email: user.email, role: normalizeRole(user.role) },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' }
  );

  logAuth(`User registered: ${email} (${normalizedRole})`);

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: getUserDisplayName(user),
        role: normalizeRole(user.role),
        gradeId: user.grade_id
      },
      token
    }
  });
}));

// Login
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  // Find user
  const user = await db('users')
    .where({ email, is_active: true })
    .first();

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  // Check password
  const passwordHash = getUserPasswordHash(user);
  if (!passwordHash) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  const isPasswordValid = await bcrypt.compare(password, passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  // Generate JWT
  const token = jwt.sign(
    { id: user.id, email: user.email, role: normalizeRole(user.role) },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' }
  );

  logAuth(`User logged in: ${email} (${normalizeRole(user.role)})`);

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: getUserDisplayName(user),
        role: normalizeRole(user.role),
        gradeId: user.grade_id
      },
      token
    }
  });
}));

// Get current user
router.get('/me', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await db('users')
    .where({ id: req.user!.id, is_active: true })
    .first();

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: getUserDisplayName(user),
        role: normalizeRole(user.role),
        gradeId: user.grade_id
      }
    }
  });
}));

// Update user profile
router.put('/profile', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, currentPassword, newPassword } = req.body;
  const userId = req.user!.id;

  // Get current user
  const user = await db('users').where({ id: userId }).first();
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  const updates: any = {
    updated_at: new Date()
  };

  // Update name if provided
  if (name) {
    updates.full_name = name;
  }

  // Update password if provided
  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password is required to change password'
      });
    }

    const currentPasswordHash = getUserPasswordHash(user);
    if (!currentPasswordHash) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentPasswordHash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    const salt = await bcrypt.genSalt(12);
    updates.password_hash = await bcrypt.hash(newPassword, salt);
  }

  await db('users').where({ id: userId }).update(updates);

  // Get updated user
  const updatedUser = await db('users').where({ id: userId }).first();

  logAuth(`User profile updated: ${user.email}`);

  res.json({
    success: true,
    data: {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: getUserDisplayName(updatedUser),
        role: normalizeRole(updatedUser.role),
        gradeId: updatedUser.grade_id
      }
    }
  });
}));

// Create bridge token for NextAuth integration
router.post('/bridge-token', asyncHandler(async (req: Request, res: Response) => {
  const { id, email, role } = req.body;
  const normalizedRole = normalizeRole(role);

  // Validate input
  if (!id || !email || !role) {
    return res.status(400).json({
      success: false,
      error: 'ID, email, and role are required'
    });
  }

  // For development with mock authentication, create token without database lookup
  // In production, you would verify user exists in database
  if (process.env.NODE_ENV === 'development') {
    // Generate a proper UUID for the user
    let userId = id;
    if (id && id.length < 10) {
      // Likely a simple string ID, convert to UUID format
      // Create a proper UUID with 8 characters in last segment
      const paddedId = id.padStart(8, '0');
      userId = `00000000-0000-0000-0000-${paddedId}0000`;
    }
    
    // Generate JWT token directly from provided session data
    const token = jwt.sign(
      { id: userId, email, role: normalizedRole },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );

    logAuth(`Bridge token created for: ${email} (${normalizedRole})`);

    return res.json({
      success: true,
      token
    });
  }

  // Production: Verify user exists in database
  const user = await db('users')
    .where({ id, email, is_active: true })
    .first();

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  // Generate JWT token
  const token = jwt.sign(
    { id: user.id, email: user.email, role: normalizeRole(user.role) },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' }
  );

  logAuth(`Bridge token created for: ${email} (${normalizeRole(user.role)})`);

  res.json({
    success: true,
    token
  });
}));

// Logout (client-side token removal)
router.post('/logout', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  logAuth(`User logged out: ${req.user!.email}`);
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

export default router;

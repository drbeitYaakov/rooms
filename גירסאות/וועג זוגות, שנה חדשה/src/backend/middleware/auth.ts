import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../domain/types';
import { db } from '../config/database';
import { logAuth, logError } from '../utils/logger';

const normalizeRole = (role: unknown): UserRole => {
  const normalized = String(role || '').toLowerCase();

  if (normalized === 'admin') return 'admin';
  if (normalized === 'grade_coordinator') return 'grade_coordinator';
  if (normalized === 'study_groups_coordinator' || normalized === 'group_coordinator') {
    return 'study_groups_coordinator';
  }

  return 'general_user';
};

const isUuid = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function resolveUserId(preferredId: unknown, email: unknown): Promise<string> {
  if (isUuid(preferredId)) {
    return preferredId as string;
  }

  if (typeof email === 'string' && email.trim() !== '') {
    const dbUser = await db('users')
      .where({ email: email.trim(), is_active: true })
      .first();

    if (dbUser?.id) {
      return dbUser.id;
    }
  }

  const fallbackUser = await db('users')
    .where({ is_active: true })
    .orderBy('created_at', 'asc')
    .first();

  if (fallbackUser?.id) {
    return fallbackUser.id;
  }

  return String(preferredId || '');
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    gradeId?: string;
  };
}

export const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    // For development with mock authentication, prefer a real DB UUID when possible.
    if (process.env.NODE_ENV === 'development') {
      const resolvedUserId = await resolveUserId(decoded.id, decoded.email);

      req.user = {
        id: resolvedUserId,
        email: decoded.email,
        role: normalizeRole(decoded.role),
        gradeId: undefined
      };
      logAuth(`User authenticated (dev): ${decoded.email} (${normalizeRole(decoded.role)})`);
      next();
      return;
    }

    // Production: Fetch user from database to get current role and permissions
    const user = await db('users')
      .where({ id: decoded.id, is_active: true })
      .first();
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: normalizeRole(user.role),
      gradeId: user.grade_id
    };

    logAuth(`User authenticated: ${user.email} (${normalizeRole(user.role)})`);
    next();
  } catch (error) {
    logError('Authentication failed', error);
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

export const requireRole = (roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    next();
  };
};

export const requireAdmin = requireRole(['admin']);
export const requireCoordinator = requireRole(['admin', 'grade_coordinator', 'study_groups_coordinator']);
export const requireGradeCoordinator = requireRole(['admin', 'grade_coordinator']);

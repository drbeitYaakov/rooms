import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../domain/types';
import { db } from '../config/database';
import { logAuth, logError } from '../utils/logger';
import { verifyAccessToken } from '../utils/tokenSecurity';

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

async function resolveDevelopmentUser(preferredId: unknown, email: unknown) {
  if (isUuid(preferredId)) {
    const userById = await db('users')
      .where({ id: preferredId as string, is_active: true })
      .first();

    if (userById) {
      return userById;
    }
  }

  if (typeof email === 'string' && email.trim() !== '') {
    return db('users')
      .where({ email: email.trim().toLowerCase(), is_active: true })
      .first();
  }

  return null;
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
      return res.status(401).json({ error: 'הגישה נדחתה. לא סופק טוקן.' });
    }

    const decoded = verifyAccessToken(token);
    
    // For development with mock authentication, prefer a real DB UUID when possible.
    if (process.env.NODE_ENV === 'development') {
      const resolvedUser = await resolveDevelopmentUser(decoded.id, decoded.email);

      if (!resolvedUser) {
        return res.status(401).json({ error: 'הטוקן אינו תקין. המשתמש לא נמצא.' });
      }

      req.user = {
        id: resolvedUser.id,
        email: resolvedUser.email,
        role: normalizeRole(resolvedUser.role),
        gradeId: resolvedUser.grade_id
      };
      logAuth(`User authenticated (dev): ${resolvedUser.email} (${normalizeRole(resolvedUser.role)})`);
      next();
      return;
    }

    // Production: Fetch user from database to get current role and permissions
    const user = await db('users')
      .where({ id: decoded.id, is_active: true })
      .first();
    
    if (!user) {
      return res.status(401).json({ error: 'הטוקן אינו תקין. המשתמש לא נמצא.' });
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
    return res.status(401).json({ error: 'הטוקן אינו תקין.' });
  }
};

export const requireRole = (roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'נדרש אימות משתמש.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'אין הרשאה מספקת.' });
    }

    next();
  };
};

export const requireAdmin = requireRole(['admin']);
export const requireCoordinator = requireRole(['admin', 'grade_coordinator', 'study_groups_coordinator']);
export const requireGradeCoordinator = requireRole(['admin', 'grade_coordinator']);

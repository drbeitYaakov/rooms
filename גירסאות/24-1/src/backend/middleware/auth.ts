import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../domain/types';
import { db } from '../config/database';
import { logAuth, logError } from '../utils/logger';

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
    
    // For development with mock authentication, use decoded token directly
    if (process.env.NODE_ENV === 'development') {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        gradeId: undefined
      };
      logAuth(`User authenticated (dev): ${decoded.email} (${decoded.role})`);
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
      role: user.role,
      gradeId: user.grade_id
    };

    logAuth(`User authenticated: ${user.email} (${user.role})`);
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

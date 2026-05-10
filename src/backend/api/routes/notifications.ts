import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import { logNotification } from '../../utils/logger';

const router = Router();

// Get all notifications for user
router.get('/', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { unread = false } = req.query;
  
  if (!req.user) {
    return res.status(401).json({ error: 'נדרש אימות משתמש' });
  }
  
  let query = db('notifications')
    .where('user_id', req.user.id)
    .orderBy('created_at', 'desc');
  
  if (unread === 'true') {
    query = query.where('read', false);
  }
  
  const notifications = await query;
  
  res.json(notifications);
}));

// Mark notification as read
router.put('/:id/read', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  if (!req.user) {
    return res.status(401).json({ error: 'נדרש אימות משתמש' });
  }
  
  const updated = await db('notifications')
    .where({
      id,
      user_id: req.user.id
    })
    .update({
      read: true,
      read_at: new Date()
    });
  
  if (!updated) {
    return res.status(404).json({ error: 'ההתראה לא נמצאה' });
  }
  
  res.json({ message: 'ההתראה סומנה כנקראה' });
}));

// Mark all notifications as read
router.put('/read-all', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'נדרש אימות משתמש' });
  }
  
  await db('notifications')
    .where('user_id', req.user.id)
    .where('read', false)
    .update({
      read: true,
      read_at: new Date()
    });
  
  res.json({ message: 'כל ההתראות סומנו כנקראו' });
}));

// Create notification (internal use)
router.post('/', asyncHandler(async (req: any, res: Response) => {
  const { user_id, title, message, type, data } = req.body;
  
  const [notification] = await db('notifications')
    .insert({
      user_id,
      title,
      message,
      type: type || 'info',
      data: data ? JSON.stringify(data) : null,
      created_at: new Date()
    })
    .returning('*');
  
  await logNotification(`Notification created for user ${user_id}: ${title}`, { user_id, title, message });
  
  res.status(201).json(notification);
}));

export default router;

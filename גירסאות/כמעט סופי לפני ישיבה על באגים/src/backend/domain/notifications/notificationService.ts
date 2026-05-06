import { Server } from 'socket.io';
import { db } from '../../config/database';
import { logNotification } from '../../utils/logger';

export interface NotificationData {
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  userId: string;
  data?: any;
}

export class NotificationService {
  private io: Server;

  constructor(io?: Server) {
    this.io = io!;
  }

  async create(notification: NotificationData): Promise<void> {
    try {
      await db('notifications').insert({
        user_id: notification.userId,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        data: notification.data ? JSON.stringify(notification.data) : null,
        created_at: new Date()
      });

      await logNotification(
        `Notification created for user ${notification.userId}: ${notification.title}`,
        { userId: notification.userId, title: notification.title, message: notification.message }
      );
    } catch (error) {
      console.error('Failed to create notification:', error);
    }
  }

  async createConflictNotification(
    userId: string,
    conflictDetails: any
  ): Promise<void> {
    await this.create({
      title: 'קונפליקט בשיבוץ',
      message: `זוהה קונפליקט בשיבוץ חדרים. חדר ${conflictDetails.roomNumber} כבר תפוס בזמן המבוקש.`,
      type: 'warning',
      userId,
      data: conflictDetails
    });
  }

  async createReassignmentNotification(
    userId: string,
    reassignmentDetails: any
  ): Promise<void> {
    await this.create({
      title: 'שינוי בשיבוץ',
      message: `חדר השיבוץ שונה מ-${reassignmentDetails.oldRoom} ל-${reassignmentDetails.newRoom}.`,
      type: 'info',
      userId,
      data: reassignmentDetails
    });
  }

  async createBulkAssignmentNotification(
    userId: string,
    details: { count: number; type: string }
  ): Promise<void> {
    await this.create({
      title: 'שיבוץ בהמונה',
      message: `בוצע שיבוץ של ${details.count} כיתות מסוג ${details.type}.`,
      type: 'success',
      userId,
      data: details
    });
  }

  async createSystemNotification(
    title: string,
    message: string,
    type: 'info' | 'warning' | 'error' = 'info'
  ): Promise<void> {
    // Send to all admin users
    const adminUsers = await db('users')
      .where('role', 'ADMIN')
      .where('is_active', true)
      .pluck('id');

    for (const userId of adminUsers) {
      await this.create({
        title,
        message,
        type,
        userId
      });
    }
  }
}

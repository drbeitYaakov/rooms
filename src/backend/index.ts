// Set UTF-8 encoding for the process
process.env.NODE_OPTIONS = '--encoding=utf8';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { config, db } from './config/database';
import logger from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { generalLimiter } from './middleware/rateLimiter';

// Import routes
import authRoutes from './api/routes/auth';
import roomsRoutes from './api/routes/rooms';
import assignmentsRoutes from './api/routes/assignments';
import usersRoutes from './api/routes/users';
import gradesRoutes from './api/routes/grades';
import academicYearsRoutes from './api/routes/academicYears';
import studyGroupsRoutes from './api/routes/studyGroups';
import notificationsRoutes from './api/routes/notifications';
import reportsRoutes from './api/routes/reports';
import homeroomsRoutes from './api/routes/homerooms';
import assignmentOverridesRoutes from './api/routes/assignmentOverrides';
import roomRequestsRoutes from './api/routes/roomRequests';
import calendarRoutes from './api/routes/calendar';
import auditoriumsRoutes from './api/routes/auditoriums';
import roomPrioritiesRoutes from './api/routes/roomPriorities';
import { syncAuditoriumDefaults } from './utils/auditoriumDefaults';

// Import services
import { SchedulingEngine } from './domain/scheduling/schedulingEngine';
import { ConflictResolver } from './domain/conflicts/conflictResolver';
import { NotificationService } from './domain/notifications/notificationService';
import { validateRuntimeSecurityConfig, verifyAccessToken } from './utils/tokenSecurity';

dotenv.config();
validateRuntimeSecurityConfig();

const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, '');

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const isAllowedOrigin = (origin?: string) => {
  if (!origin) {
    return process.env.NODE_ENV !== 'production';
  }

  return allowedOrigins.includes(normalizeOrigin(origin));
};

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Socket origin not allowed'));
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.set('Content-Type', 'application/json; charset=utf-8');
  next();
});
app.use(generalLimiter); // ׳שינוי: generalLimiter

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', authMiddleware, roomsRoutes);
app.use('/api/assignments', authMiddleware, assignmentsRoutes);
app.use('/api/assignments/overrides', authMiddleware, assignmentOverridesRoutes);
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/grades', authMiddleware, gradesRoutes);
app.use('/api/academic-years', authMiddleware, academicYearsRoutes);
app.use('/api/study-groups', authMiddleware, studyGroupsRoutes);
app.use('/api/notifications', authMiddleware, notificationsRoutes);
app.use('/api/reports', authMiddleware, reportsRoutes);
app.use('/api/homerooms', authMiddleware, homeroomsRoutes);
app.use('/api/auditoriums', authMiddleware, auditoriumsRoutes);
app.use('/api/room-priorities', authMiddleware, roomPrioritiesRoutes);
app.use('/api/room-requests', authMiddleware, roomRequestsRoutes);
app.use('/api/calendar', authMiddleware, calendarRoutes);

// WebSocket connection handling
io.use(async (socket, next) => {
  try {
    const tokenFromAuth = typeof socket.handshake.auth?.token === 'string'
      ? socket.handshake.auth.token
      : null;
    const authorizationHeader = socket.handshake.headers.authorization;
    const tokenFromHeader = typeof authorizationHeader === 'string'
      ? authorizationHeader.replace('Bearer ', '')
      : null;
    const token = tokenFromAuth || tokenFromHeader;

    if (!token) {
      next(new Error('נדרש אימות משתמש'));
      return;
    }

    const decoded = verifyAccessToken(token);
    const user = await db('users')
      .where({ id: decoded.id, is_active: true })
      .first();

    if (!user) {
      next(new Error('Invalid user'));
      return;
    }

    socket.data.user = {
      id: user.id,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`, { userId: socket.data.user?.id });

  socket.on('join-room', (room: string) => {
    if (!socket.data.user?.id) {
      socket.emit('error', { message: 'נדרש אימות משתמש' });
      return;
    }

    socket.join(room);
    logger.info(`User ${socket.id} joined room: ${room}`, { userId: socket.data.user.id });
  });

  socket.on('leave-room', (room: string) => {
    socket.leave(room);
    logger.info(`User ${socket.id} left room: ${room}`, { userId: socket.data.user?.id });
  });

  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id}`, { userId: socket.data.user?.id });
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize services
const schedulingEngine = new SchedulingEngine();
const conflictResolver = new ConflictResolver();
const notificationService = new NotificationService(io);

// Start server
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  logger.info(`API URL: http://localhost:${PORT}/api`);
  void db.transaction(async (trx) => {
    const today = new Date();
    const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await syncAuditoriumDefaults(trx, startDate);
  }).catch((error) => {
    logger.error('Failed to sync auditorium defaults on startup:', error);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

export { app, io };

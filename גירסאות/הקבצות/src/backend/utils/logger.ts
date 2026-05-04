import winston from 'winston';
import path from 'path';

const logLevel = process.env.LOG_LEVEL || 'info';
const logFile = process.env.LOG_FILE || 'logs/app.log';

// Create logs directory if it doesn't exist
const logDir = path.dirname(logFile);

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'educational-scheduling' },
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Write all logs with level 'info' and below to combined.log
    new winston.transports.File({
      filename: logFile,
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ],
});

// If we're not in production, also log to the console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      })
    )
  }));
}

// Create custom logging methods for different contexts
export const logScheduling = (message: string, meta?: any) => {
  logger.info(`[SCHEDULING] ${message}`, meta);
};

export const logConflict = (message: string, meta?: any) => {
  logger.warn(`[CONFLICT] ${message}`, meta);
};

export const logReassignment = (message: string, meta?: any) => {
  logger.info(`[REASSIGNMENT] ${message}`, meta);
};

export const logAuth = (message: string, meta?: any) => {
  logger.info(`[AUTH] ${message}`, meta);
};

export const logAudit = (message: string, meta?: any) => {
  logger.info(`[AUDIT] ${message}`, meta);
};

export const logNotification = (message: string, meta?: any) => {
  logger.info(`[NOTIFICATION] ${message}`, meta);
};

export const logError = (message: string, error?: Error | any) => {
  logger.error(`[ERROR] ${message}`, { error: error?.stack || error });
};

export const logPerformance = (message: string, meta?: any) => {
  logger.info(`[PERFORMANCE] ${message}`, meta);
};

export default logger;

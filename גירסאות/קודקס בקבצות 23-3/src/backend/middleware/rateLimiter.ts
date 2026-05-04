import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

export const createRateLimiter = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: message
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later'
      });
    }
  });
};

// General rate limiter
export const generalLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  'Too many requests from this IP'
);

// Auth rate limiter (stricter)
export const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // limit each IP to 5 auth requests per windowMs
  'Too many authentication attempts'
);

// Assignment rate limiter
export const assignmentLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  20, // limit each IP to 20 assignment requests per minute
  'Too many assignment requests'
);

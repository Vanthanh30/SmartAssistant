import { rateLimit } from 'express-rate-limit';
import { AppError } from '../shared/AppError.js';
export const authRateLimit = (config) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.AUTH_RATE_LIMIT_PER_15_MINUTES,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'Quá nhiều lần thử. Vui lòng thử lại sau.')),
  });
export const avatarRateLimit = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    keyGenerator: (req) => req.auth.user.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'Quá nhiều lần tải ảnh. Vui lòng thử lại sau.')),
  });
export const studentRateLimit = () =>
  rateLimit({
    windowMs: 60000,
    limit: 10,
    keyGenerator: (req) => req.auth.user.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
export const calendarSyncRateLimit = () =>
  rateLimit({
    windowMs: 60000,
    limit: 60,
    keyGenerator: (req) => req.auth.user.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(
        new AppError(
          429,
          'RATE_LIMITED',
          'Đã đạt giới hạn đồng bộ trong phút này. Chờ một phút rồi thử lại các buổi chưa thành công.',
        ),
      ),
  });

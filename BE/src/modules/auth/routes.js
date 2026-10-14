import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../../shared/AppError.js';
import { requireAuth, requireOrigin, requireCsrf } from '../../middlewares/auth.js';
import { loginSchema, registerSchema } from './schema.js';
import { authController } from './controller.js';
import { validate } from '../../shared/validation.js';
export function authRoutes(service, config) {
  const router = Router();
  const controller = authController(service, config);
  const origin = requireOrigin(config);
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.AUTH_RATE_LIMIT_PER_15_MINUTES,
    standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Quá nhiều lần thử. Vui lòng thử lại sau.')) });
  router.post('/register', origin, limit, validate(registerSchema), controller.register);
  router.post('/login', origin, limit, validate(loginSchema), controller.login);
  router.get('/me', requireAuth(service, config), controller.me);
  router.post('/logout', origin, requireAuth(service, config), requireCsrf, controller.logout);
  return router;
}

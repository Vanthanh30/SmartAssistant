import { authRateLimit } from '../../middlewares/rateLimit.js';
import { Router } from 'express';
import { requireAuth, requireOrigin, requireCsrf } from '../../middlewares/auth.js';
import { loginSchema, registerSchema } from './schema.js';
import { authController } from './controller.js';
import { validate } from '../../middlewares/validate.js';

export function authRoutes(service, config) {
  const router = Router();
  const controller = authController(service, config);
  const origin = requireOrigin(config);
  const limit = authRateLimit(config);
  router.post('/register', origin, limit, validate(registerSchema), controller.register);
  router.post('/login', origin, limit, validate(loginSchema), controller.login);
  router.get('/me', requireAuth(service, config), controller.me);
  router.post('/logout', origin, requireAuth(service, config), requireCsrf, controller.logout);
  return router;
}

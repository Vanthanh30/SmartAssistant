import { Router } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../../shared/AppError.js';
import { requireAuth, requireRole, requireOrigin, requireCsrf } from '../../middlewares/auth.js';
import { validate } from '../../shared/validation.js';
import { profileSchema } from './schema.js';
import { userController } from './controller.js';
import { userService } from './service.js';
import { userRepository } from './repository.js';
export function userRoutes(pool, auth, config) {
  const router = Router();
  const controller = userController(userService(userRepository(pool), config));
  router.use(requireAuth(auth, config), requireRole('student'), (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const mutate = [requireOrigin(config), requireCsrf];
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 ** 2, files: 1, fields: 0, parts: 1 } }).single('file');
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, keyGenerator: req => req.auth.user.id, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Quá nhiều lần tải ảnh. Vui lòng thử lại sau.')) });
  router.get('/me', controller.get);
  router.patch('/me', ...mutate, validate(profileSchema), controller.patch);
  router.get('/me/avatar', controller.avatar);
  router.post('/me/avatar', ...mutate, limit, upload, controller.upload);
  return router;
}

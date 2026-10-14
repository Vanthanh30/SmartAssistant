import { Router } from 'express';
import { requireAuth, requireRole, requireOrigin, requireCsrf } from '../../middlewares/auth.js';
import { validate } from '../../shared/validation.js';
import { courseCreateSchema, coursePatchSchema, courseIdSchema, courseQuerySchema } from './schema.js';
import { courseController } from './controller.js';
import { courseService } from './service.js';
import { courseRepository } from './repository.js';
export function courseRoutes(pool, auth, config) {
  const router = Router();
  const controller = courseController(courseService(courseRepository(pool)));
  router.use(requireAuth(auth, config), requireRole('student'), (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const mutate = [requireOrigin(config), requireCsrf];
  router.get('/', validate(courseQuerySchema, 'query', 'filters'), controller.list);
  router.post('/', ...mutate, validate(courseCreateSchema), controller.create);
  router.get('/:courseId', validate(courseIdSchema, 'params', 'ids'), controller.get);
  router.patch('/:courseId', ...mutate, validate(courseIdSchema, 'params', 'ids'), validate(coursePatchSchema), controller.patch);
  return router;
}

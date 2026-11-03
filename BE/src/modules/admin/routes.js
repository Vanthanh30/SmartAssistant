import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { requireOrigin, requireCsrf } from '../../middlewares/auth.js';
import { userIdSchema, userQuerySchema, statusSchema } from './users/schema.js';
import { adminDocumentQuerySchema, courseFilterQuerySchema } from './documents/schema.js';
import { adminService } from './service.js';
import { adminController } from './controller.js';

export function adminRoutes(pool, config) {
  const router = Router();
  const controller = adminController(adminService(pool, config));
  const mutate = [requireOrigin(config), requireCsrf];
  router.get('/users', validate(userQuerySchema, 'query', 'filters'), controller.listUsers);
  router.get('/users/:userId', validate(userIdSchema, 'params', 'ids'), controller.userDetail);
  router.patch(
    '/users/:userId/status',
    ...mutate,
    validate(userIdSchema, 'params', 'ids'),
    validate(statusSchema),
    controller.updateUserStatus,
  );
  router.get(
    '/documents',
    validate(adminDocumentQuerySchema, 'query', 'filters'),
    controller.listDocuments,
  );
  router.get(
    '/documents/courses',
    validate(courseFilterQuerySchema, 'query', 'filters'),
    controller.listCourses,
  );
  router.get('/documents/:id', controller.documentDetail);
  router.get('/documents/:id/content', controller.documentContent);
  router.delete('/documents/:id', ...mutate, controller.removeDocument);
  router.get('/dashboard', controller.dashboard);
  return router;
}

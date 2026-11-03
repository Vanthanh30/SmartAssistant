import { noStore } from '../../middlewares/noStore.js';
import { avatarUpload } from '../../middlewares/upload.js';
import { avatarRateLimit } from '../../middlewares/rateLimit.js';
import { Router } from 'express';
import { requireAuth, requireRole, requireOrigin, requireCsrf } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { profileSchema } from './schema.js';
import { userController } from './controller.js';
import { userService } from './service.js';
import { userRepository } from './repository.js';

export function userRoutes(pool, auth, config) {
  const router = Router();
  const controller = userController(userService(userRepository(pool), config));
  router.use(requireAuth(auth, config), requireRole('student'), noStore);
  const mutate = [requireOrigin(config), requireCsrf];
  router.get('/me', controller.get);
  router.patch('/me', ...mutate, validate(profileSchema), controller.patch);
  router.get('/me/avatar', controller.avatar);
  router.post('/me/avatar', ...mutate, avatarRateLimit(), avatarUpload(), controller.upload);
  return router;
}

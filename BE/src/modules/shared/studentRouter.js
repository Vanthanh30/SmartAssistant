import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { noStore } from '../../middlewares/noStore.js';

export function studentRouter(auth, config, protectedPaths) {
  const router = Router();
  router.use(protectedPaths, requireAuth(auth, config), requireRole('student'), noStore);
  return router;
}

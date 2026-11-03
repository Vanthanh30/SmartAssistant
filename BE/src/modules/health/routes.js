import { Router } from 'express';
import { healthController } from './controller.js';

export function healthRoutes(pool) {
  const router = Router();
  const controller = healthController(pool);
  router.get('/health/live', controller.live);
  router.get('/health/ready', controller.ready);
  return router;
}

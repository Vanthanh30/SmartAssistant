import { requestId } from './middlewares/requestId.js';
import { bodyParser } from './middlewares/bodyParser.js';
import { noStore } from './middlewares/noStore.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import { authService } from './modules/auth/service.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requireAuth, requireRole } from './middlewares/auth.js';
import { authRoutes } from './modules/auth/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { courseRoutes } from './modules/courses/routes.js';
import { adminRoutes } from './modules/admin/routes.js';
import { documentRoutes } from './modules/documents/routes.js';
import { conversationRoutes } from './modules/conversations/routes.js';
import { learningRoutes } from './modules/learning/routes.js';
import { studyCalendarRoutes } from './modules/studyCalendar/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { studentRateLimit } from './middlewares/rateLimit.js';
export function createApp(pool, config) {
  const app = express();
  const service = authService(pool, config);
  const studentLimit = studentRateLimit();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(
    helmet(),
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
      exposedHeaders: [
        'X-Request-Id',
        'Content-Range',
        'Accept-Ranges',
        'Content-Length',
        'Content-Disposition',
      ],
    }),
    bodyParser,
    cookieParser(),
  );
  app.use('/api/v1', documentRoutes(pool, service, config, { studentLimit }));
  app.use('/api/v1', conversationRoutes(pool, service, config, { studentLimit }));
  app.use('/api/v1', learningRoutes(pool, service, config, { studentLimit }));
  app.use('/api/v1', studyCalendarRoutes(pool, service, config, { studentLimit }));
  app.use('/api/v1/auth', noStore, authRoutes(service, config));
  app.use('/api/v1/users', userRoutes(pool, service, config));
  app.use('/api/v1/courses', courseRoutes(pool, service, config));
  // Secure the admin namespace before any current or future admin router.
  app.use('/api/v1/admin', requireAuth(service, config), requireRole('admin'));
  app.use('/api/v1/admin', adminRoutes(pool, config));
  app.use('/api/v1', healthRoutes(pool));
  app.use(notFound);
  app.use(errorHandler(config));
  return app;
}

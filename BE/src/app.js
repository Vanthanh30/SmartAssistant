import { assertSchema } from './config/schema.js';
import { dashboardRoutes } from './modules/admin/dashboard/routes.js';
import express from 'express';
import { learningRoutes } from './modules/learning/routes.js';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { AppError, sendData } from './shared/AppError.js';
import { authRepository } from './modules/auth/repository.js';
import { authService } from './modules/auth/service.js';
import { authRoutes } from './modules/auth/routes.js';
import { requireAuth, requireRole } from './middlewares/auth.js';
import { userRoutes } from './modules/users/routes.js';
import { courseRoutes } from './modules/courses/routes.js';
import multer from 'multer';
import { documentRoutes } from './modules/documents/routes.js';
import { conversationRoutes } from './modules/conversations/routes.js';
import { adminUserRoutes } from './modules/admin/users/routes.js';
import { adminDocumentRoutes } from './modules/admin/documents/routes.js';
export function createApp(pool, config) {
  const app = express();
  const service = authService(authRepository(pool), config);
  app.disable('x-powered-by');
  app.use((req, res, next) => { req.requestId = randomUUID(); res.set('X-Request-Id', req.requestId); next(); });
  app.use(helmet(), cors({ origin: config.CORS_ORIGIN, credentials: true,
    exposedHeaders: ['X-Request-Id','Content-Range','Accept-Ranges','Content-Length','Content-Disposition'] }), express.json({ limit: '16kb' }), cookieParser());
  app.use('/api/v1/auth', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, authRoutes(service, config));
  app.use('/api/v1/users', userRoutes(pool, service, config));
  app.use('/api/v1/courses', courseRoutes(pool, service, config));
  const documents = documentRoutes(pool, service, config);
  app.use('/api/v1/courses/:courseId/documents', documents.courseDocuments);
  app.use('/api/v1/documents', documents.documents);
  const chat = conversationRoutes(pool, service, config);
  app.use('/api/v1/courses/:courseId/conversations', chat.courses);
  app.use('/api/v1/conversations', chat.conversations);
  const learning = learningRoutes(pool,service,config);
  app.use('/api/v1/courses/:courseId/learning-sets',learning.courses);
  app.use('/api/v1/learning-sets',learning.sets);
  app.use('/api/v1/learning-attempts',learning.attempts);
  // Secure the admin namespace before any current or future admin router.
  app.use('/api/v1/admin', requireAuth(service, config), requireRole('admin'));
  app.use('/api/v1/admin/dashboard',dashboardRoutes(pool,config));
  app.use('/api/v1/admin/users',adminUserRoutes(pool,config));
  app.use('/api/v1/admin/documents',adminDocumentRoutes(pool,config));
  app.get('/api/v1/health/live', (req, res) => sendData(req, res, { status: 'ok' }));
  app.get('/api/v1/health/ready', async (req, res) => {
    try { await assertSchema(pool); } catch { throw new AppError(503,'DB_NOT_READY','Cơ sở dữ liệu19 bảng chưa sẵn sàng.'); }
    sendData(req, res, { status: 'ok' });
  });
  app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', 'Không tìm thấy trang hoặc tài nguyên.')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) error = new AppError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 422,
      error.code === 'LIMIT_FILE_SIZE' ? req.uploadKind === 'pdf' ? 'PDF_TOO_LARGE' : 'AVATAR_TOO_LARGE' : 'INVALID_UPLOAD', error.code === 'LIMIT_FILE_SIZE' ? req.uploadKind === 'pdf' ? `PDF tối đa ${config.MAX_UPLOAD_MB} MB.` : 'Ảnh đại diện tối đa 2 MB.' : 'Chỉ chọn một file trong trường file.');
    const status = error.status ?? (error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500);
    if (status >= 500) console.error(JSON.stringify({ requestId: req.requestId, code: error.code ?? 'INTERNAL_ERROR', status }));
    res.status(status).json({ error: { code: error.code ?? (status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR'),
      message: error instanceof AppError ? error.message : 'Không thể xử lý yêu cầu.',
      ...(error.details ? { details: error.details } : {}) }, requestId: req.requestId });
  });
  return app;
}

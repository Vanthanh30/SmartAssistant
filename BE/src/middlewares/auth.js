import { timingSafeEqual } from 'node:crypto';
import { AppError } from '../shared/AppError.js';
export const requireAuth = (service, config) => async (req, res, next) => {
  req.auth = await service.authenticate(req.cookies[config.SESSION_COOKIE_NAME]); next();
};
export const requireRole = role => (req, res, next) => {
  if (req.auth.user.role !== role) throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền truy cập.');
  next();
};
export const requireOrigin = config => (req, res, next) => {
  if (req.get('Origin') !== config.CORS_ORIGIN) throw new AppError(403, 'ORIGIN_REJECTED', 'Nguồn yêu cầu không được phép.');
  next();
};
export function requireCsrf(req, res, next) {
  const received = Buffer.from(req.get('X-CSRF-Token') ?? '');
  const expected = Buffer.from(req.auth.csrfToken);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AppError(403, 'CSRF_REJECTED', 'Yêu cầu không hợp lệ. Hãy tải lại trang.');
  }
  next();
}

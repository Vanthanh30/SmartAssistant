import { sendData } from '../../shared/AppError.js';
export function authController(service, config) {
  const cookieOptions = { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', path: '/api/v1' };
  const complete = (req, res, result, status) => {
    res.cookie(config.SESSION_COOKIE_NAME, result.token, { ...cookieOptions, maxAge: config.SESSION_TTL_SECONDS * 1000 });
    return sendData(req, res, { user: result.user, csrfToken: result.csrfToken }, status);
  };
  return {
    register: async (req, res) => complete(req, res, await service.register(req.input), 201),
    login: async (req, res) => complete(req, res, await service.login(req.input), 200),
    me: (req, res) => sendData(req, res, req.auth),
    logout: async (req, res) => {
      await service.logout(req.cookies[config.SESSION_COOKIE_NAME]);
      res.clearCookie(config.SESSION_COOKIE_NAME, cookieOptions);
      return sendData(req, res, { success: true });
    },
  };
}

import { sendData } from '../../shared/AppError.js';
export function authController(service, config) {
  const suffix = 'v16';
  const cookieOptions = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1',
  };
  const complete = (req, res, result, status) => {
    res.cookie(config.SESSION_COOKIE_NAME + '_' + suffix, result.token, {
      ...cookieOptions,
      maxAge: 900000,
    });
    res.cookie(config.SESSION_COOKIE_NAME + '_refresh_' + suffix, result.refreshToken, {
      ...cookieOptions,
      maxAge: 604800000,
    });
    res.cookie('study_csrf_' + suffix, result.csrfToken, {
      ...cookieOptions,
      maxAge: 604800000,
    });
    return sendData(
      req,
      res,
      {
        user: result.user,
        csrfToken: result.csrfToken,
        logoutScope: result.logoutScope || 'all',
        schemaVersion: config.DB_SCHEMA_VERSION,
      },
      status,
    );
  };
  return {
    register: async (req, res) => complete(req, res, await service.register(req.input), 201),
    login: async (req, res) => complete(req, res, await service.login(req.input), 200),
    me: (req, res) => sendData(req, res, req.auth),
    logout: async (req, res) => {
      await service.logout(req.cookies[config.SESSION_COOKIE_NAME + '_' + suffix], req.auth);
      for (const name of [
        config.SESSION_COOKIE_NAME + '_' + suffix,
        config.SESSION_COOKIE_NAME + '_refresh_' + suffix,
        'study_csrf_' + suffix,
      ])
        res.clearCookie(name, cookieOptions);
      res.clearCookie(config.SESSION_COOKIE_NAME, cookieOptions);
      return sendData(req, res, { success: true });
    },
  };
}

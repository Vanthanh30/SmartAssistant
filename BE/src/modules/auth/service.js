import { dto } from './mapper.js';
import { security, revokeSession } from './sessionRepository.js';
export { revokeOwnerSessions } from './sessionRepository.js';
import { authRepository } from './repository.js';
import { toDb } from '../shared/values.js';
import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { withOwnerLock } from '../studyCalendar/locks.js';
import { AppError } from '../../shared/AppError.js';
const expired = () =>
  new AppError(401, 'SESSION_EXPIRED', 'Phiên đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.');

// Security revocation records are private filesystem data, never extra ERD columns.
// This deployment requires one API instance or a shared private filesystem.

export async function assertActiveActor(db, config, actor, role) {
  const [r] = await authRepository.lockActor(db, [actor.user.id]);
  const state = await security(config, actor.user.id);
  if (
    !r[0] ||
    r[0].trang_thai !== 'hoạt động' ||
    (role && r[0].vai_tro !== toDb(role)) ||
    actor.tokenExpiresAt <= Date.now() ||
    actor.tokenIssuedAt < state.notBefore ||
    state.revoked[actor.sessionNonce]
  )
    throw expired();
  return r[0];
}
export function authService(pool, config) {
  const key = Buffer.from(config.AUTH_JWT_SECRET || '', 'base64');
  if (key.length !== 32) throw Error('AUTH_JWT_SECRET_REQUIRED');
  const issuer = 'study-assistant:erd16',
    audience = 'study-assistant-api:' + config.DB_NAME.toLowerCase();
  let dummy;
  const csrf = (id, nonce) =>
    nonce + '.' + createHmac('sha256', key).update(`erd16:${id}:${nonce}`).digest('base64url');
  const get = async (id) => (await authRepository.findUser(pool, [id]))[0][0];
  const sign = (id, nonce, type, exp, iat, authenticatedAt) =>
    new SignJWT({ nonce, tokenType: type, authenticatedAt })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(String(id))
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(key);
  async function verify(token, type) {
    const { payload: p } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      issuer,
      audience,
      typ: 'JWT',
      requiredClaims: ['sub', 'nonce', 'tokenType', 'exp', 'iat', 'authenticatedAt'],
    });
    if (
      !Number.isSafeInteger(p.authenticatedAt) ||
      p.authenticatedAt > Date.now() + 2000 ||
      p.tokenType !== type ||
      !/^\d+$/.test(p.sub) ||
      !/^[a-f0-9]{48}$/.test(p.nonce) ||
      p.exp - p.iat > (type === 'access' ? 900 : 604800)
    )
      throw expired();
    const s = await security(config, p.sub);
    if (p.authenticatedAt < s.notBefore || s.revoked[p.nonce]) throw expired();
    return p;
  }
  async function issue(user, authenticatedAt = Date.now()) {
    const now = Math.floor(Date.now() / 1000),
      nonce = randomBytes(24).toString('hex');
    return {
      token: await sign(user.ma_nguoi_dung, nonce, 'access', now + 900, now, authenticatedAt),
      refreshToken: await sign(
        user.ma_nguoi_dung,
        nonce,
        'refresh',
        now + 604800,
        now,
        authenticatedAt,
      ),
      user: dto(user),
      csrfToken: csrf(user.ma_nguoi_dung, nonce),
      logoutScope: 'session',
      schemaVersion: 16,
    };
  }
  return {
    async register(input) {
      const hash = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);
      let result;
      try {
        [result] = await authRepository.insertUser(pool, [input.fullName, input.email, hash]);
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY')
          throw new AppError(409, 'EMAIL_EXISTS', 'Email đã được sử dụng.');
        throw e;
      }
      return issue(await get(String(result.insertId)));
    },
    async login(input) {
      const authenticatedAt = Date.now();
      const user = (await authRepository.findByEmail(pool, [input.email]))[0][0];
      dummy ??= bcrypt.hash(randomBytes(32).toString('hex'), config.BCRYPT_ROUNDS);
      if (!(await bcrypt.compare(input.password, user?.mat_khau || (await dummy))) || !user)
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
      if (user.trang_thai !== 'hoạt động')
        throw new AppError(403, 'ACCOUNT_BLOCKED', 'Tài khoản đã bị khóa.');
      return issue(user, authenticatedAt);
    },
    async authenticate(access, refresh) {
      let p, renewed;
      try {
        p = await verify(access, 'access');
      } catch (e) {
        if (access && e.code !== 'ERR_JWT_EXPIRED') throw expired();
        try {
          p = await verify(refresh, 'refresh');
          renewed = await sign(
            p.sub,
            p.nonce,
            'access',
            Math.min(p.exp, Math.floor(Date.now() / 1000) + 900),
            Math.floor(Date.now() / 1000),
            p.authenticatedAt,
          );
        } catch {
          throw expired();
        }
      }
      const user = await get(p.sub);
      if (user?.trang_thai !== 'hoạt động') throw expired();
      return {
        schemaVersion: 16,
        user: dto(user),
        csrfToken: csrf(p.sub, p.nonce),
        csrfCookieName: 'study_csrf_v16',
        logoutScope: 'session',
        sessionNonce: p.nonce,
        tokenIssuedAt: p.authenticatedAt,
        tokenExpiresAt: p.exp * 1000,
        ...(renewed ? { renewedAccess: renewed } : {}),
      };
    },
    async logout(_token, actor) {
      if (!actor) throw expired();
      return withOwnerLock(pool, actor.user.id, async (db) => {
        await db.beginTransaction();
        try {
          await authRepository.lockUser(db, [actor.user.id]);
          await revokeSession(config, actor);
          await db.commit();
        } catch (e) {
          await db.rollback();
          throw e;
        }
      });
    },
    checkCsrf(actor, value) {
      const a = Buffer.from(csrf(actor.user.id, actor.sessionNonce)),
        b = Buffer.from(value || '');
      return a.length === b.length && timingSafeEqual(a, b);
    },
  };
}

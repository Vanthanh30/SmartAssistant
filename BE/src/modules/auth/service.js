import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../../shared/AppError.js';
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const userDto = user => ({ id: String(user.id), fullName: user.full_name, email: user.email,
  role: user.role, status: user.status,
  avatarStorageStatus: user.avatar_storage_status ?? null,
  avatarUrl: user.avatar_key ? `/api/v1/nguoi_dung/me/avatar?v=${new Date(user.updated_at).getTime()}` : null });
export function authService(repository, config) {
  let dummyHash;
  const dummy = () => dummyHash ??= bcrypt.hash(randomBytes(32).toString('hex'), config.BCRYPT_ROUNDS);
  const issueSession = async user => {
    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    const active = await repository.createSession(String(user.id), tokenHash(token), csrfToken, config.SESSION_TTL_SECONDS);
    if (!active) throw new AppError(403, 'ACCOUNT_BLOCKED', 'Tài khoản đã bị khóa.');
    return { user: userDto(user), csrfToken, token };
  };
  return {
    async register(input) {
      const hash = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);
      let id;
      try { id = await repository.createUser(input, hash); }
      catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new AppError(409, 'EMAIL_EXISTS', 'Email đã được sử dụng.');
        throw error;
      }
      return issueSession(await repository.findUserById(id));
    },
    async login(input) {
      const user = await repository.findUserByEmail(input.email);
      const valid = await bcrypt.compare(input.password, user?.password_hash ?? await dummy());
      if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
      if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_BLOCKED', 'Tài khoản đã bị khóa.');
      return issueSession(user);
    },
    async authenticate(token) {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AppError(401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập.');
      const session = await repository.findSession(tokenHash(token));
      if (!session) throw new AppError(401, 'SESSION_EXPIRED', 'Phiên đã hết hạn. Vui lòng đăng nhập lại.');
      if (session.status !== 'active') {
        await repository.revokeUserSessions(String(session.id));
        throw new AppError(403, 'ACCOUNT_BLOCKED', 'Tài khoản đã bị khóa.');
      }
      return { user: userDto(session), csrfToken: session.csrf_token };
    },
    logout: token => repository.revokeSession(tokenHash(token)),
  };
}

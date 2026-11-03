import { randomBytes, createHash } from 'node:crypto';
import { AppError } from '../../../shared/AppError.js';
import { withOwnerLock, transaction } from '../locks.js';
import { calendarRepository } from '../repository.js';
import {
  googleAdapter,
  googleConfigured,
  safeEventUrl,
} from '../../../integrations/google/adapter.js';
import { ownedEvent } from './eventMapper.js';
import { encryptToken, decryptToken } from '../../../integrations/google/crypto.js';
export function googleConnectionService(
  pool,
  config,
  { adapter = googleAdapter(config), clock = () => Date.now() } = {},
) {
  const states = new Map();
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  return {
    async status(owner) {
      const row = await calendarRepository(pool).connection(owner);
      return {
        configured: googleConfigured(config),
        status: row?.connectionStatus || 'disconnected',
        email: row?.googleEmail || null,
        warning:
          'Đồng bộ một chiều vào primary. Khi ngắt kết nối, event Google đã tạo vẫn có thể nhắc.',
      };
    },
    async begin(actor) {
      if (!googleConfigured(config))
        throw new AppError(
          503,
          'GOOGLE_NOT_CONFIGURED',
          'Google Calendar chưa được cấu hình. Bạn vẫn dùng lịch nội bộ.',
        );
      for (const [key, value] of states) if (value.expires < clock()) states.delete(key);
      if (states.size >= 1000)
        throw new AppError(429, 'OAUTH_BUSY', 'Quá nhiều lượt kết nối, thử lại sau.');
      const state = randomBytes(32).toString('base64url'),
        nonce = randomBytes(24).toString('hex'),
        verifier = randomBytes(32).toString('base64url');
      states.set(hash(state), {
        owner: actor.user.id,
        csrf: actor.csrfToken,
        expires: clock() + 10 * 60000,
        nonce,
        verifier,
      });
      return {
        url: adapter.authorization(
          state,
          nonce,
          createHash('sha256').update(verifier).digest('base64url'),
        ),
      };
    },
    async callback(actor, { state, code, error }) {
      const digest = hash(state || '');
      const saved = states.get(digest);
      states.delete(digest);
      if (
        !saved ||
        saved.expires < clock() ||
        saved.owner !== actor.user.id ||
        saved.csrf !== actor.csrfToken
      )
        throw new AppError(
          400,
          'OAUTH_STATE_INVALID',
          'Kết nối đã hết hạn hoặc không hợp lệ. Thử lại từ ứng dụng.',
        );
      if (error || !code)
        throw new AppError(400, 'OAUTH_DENIED', 'Chưa cấp quyền Google Calendar.');
      return withOwnerLock(pool, actor.user.id, async (db) => {
        let tokens;
        try {
          tokens = await adapter.exchange(code, saved.verifier, saved.nonce);
        } catch {
          throw new AppError(
            400,
            'OAUTH_EXCHANGE_FAILED',
            'Không xác minh được tài khoản/quyền Google. Kết nối lại.',
          );
        }
        return transaction(db, async () => {
          const repo = calendarRepository(db);
          if (!(await repo.actor(actor)))
            throw new AppError(401, 'SESSION_EXPIRED', 'Phiên đã hết hạn.');
          const previous = await repo.connection(actor.user.id);
          if (
            previous &&
            previous.googleSub !== tokens.sub &&
            (await repo.accountEventCount(actor.user.id))
          )
            throw new AppError(
              409,
              'GOOGLE_ACCOUNT_BOUND',
              'Còn event ID của tài khoản trước. Kết nối lại đúng tài khoản hoặc gỡ từng event trước khi đổi.',
            );
          const cipher = tokens.refreshToken
            ? encryptToken(config, tokens.refreshToken, actor.user.id, tokens.sub)
            : previous?.googleSub === tokens.sub
              ? previous.ciphertext
              : null;
          if (!cipher)
            throw new AppError(
              409,
              'GOOGLE_REFRESH_REQUIRED',
              'Chưa nhận quyền truy cập ngoại tuyến. Kết nối lại và cấp quyền.',
            );
          await repo.saveConnection(actor.user.id, tokens.sub, tokens.email, cipher);
          return { connected: true }; // no automatic upsert of reconnect_required sessions
        });
      });
    },
    async disconnect(actor) {
      return withOwnerLock(pool, actor.user.id, async (db) => {
        const repo = calendarRepository(db);
        const previous = await repo.connection(actor.user.id);
        await transaction(db, async () => {
          if (!(await repo.actor(actor)))
            throw new AppError(401, 'SESSION_EXPIRED', 'Phiên đã hết hạn.');
          await repo.disconnect(actor.user.id);
        });
        let revoked = !previous?.ciphertext;
        if (previous?.ciphertext)
          try {
            await adapter.revoke(
              decryptToken(config, previous.ciphertext, actor.user.id, previous.googleSub),
            );
            revoked = true;
          } catch {
            /* access removed locally regardless of network */
          }
        return { disconnected: true, revoked, eventsRetained: true };
      });
    },
    async openEvent(actor, id) {
      return withOwnerLock(pool, actor.user.id, async (db) => {
        const repo = calendarRepository(db),
          row = await repo.get(actor.user.id, id),
          connection = await repo.connection(actor.user.id);
        if (!row?.eventId || connection?.connectionStatus !== 'connected')
          throw new AppError(
            409,
            'GOOGLE_RECONNECT_REQUIRED',
            'Chưa có event hoặc cần kết nối lại.',
          );
        let event;
        try {
          event = await adapter.get(actor.user.id, connection, row.eventId);
        } catch {
          throw new AppError(502, 'GOOGLE_EVENT_UNAVAILABLE', 'Không mở được event Google.');
        }
        if (!(await repo.actor(actor)) || !ownedEvent(event, row, config))
          throw new AppError(
            403,
            'GOOGLE_EVENT_OWNERSHIP',
            'Không xác minh được event hoặc phiên đã thay đổi.',
          );
        const url = safeEventUrl(event.htmlLink);
        if (!url) throw new AppError(502, 'GOOGLE_URL_INVALID', 'Liên kết Google không hợp lệ.');
        return { url };
      });
    },
  };
}

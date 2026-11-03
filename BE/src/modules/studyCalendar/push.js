import webpush from 'web-push';
import { createHash } from 'node:crypto';
import { AppError } from '../../shared/AppError.js';
import { withOwnerLock, transaction } from './locks.js';
import { json } from '../shared/repository.js';

export const pushConfigured = (c) =>
  Boolean(c.WEB_PUSH_PUBLIC_KEY && c.WEB_PUSH_PRIVATE_KEY && c.WEB_PUSH_SUBJECT);
export function validPushEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      [
        'fcm.googleapis.com',
        'updates.push.services.mozilla.com',
        'notify.windows.com',
        'web.push.apple.com',
      ].some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
    );
  } catch {
    return false;
  }
}

export async function pushSubscription(pool, owner, input) {
  if (!validPushEndpoint(input.endpoint))
    throw new AppError(422, 'INVALID_PUSH_ENDPOINT', 'Dịch vụ thông báo không được hỗ trợ.');
  return withOwnerLock(pool, owner, (db) =>
    transaction(db, async () => {
      const [plans] = await db.execute(
        'SELECT ma_ke_hoach,dieu_kien_hoc FROM ke_hoach_hoc WHERE ma_nguoi_dung=? ORDER BY ma_ke_hoach FOR UPDATE',
        [owner],
      );
      if (!plans.length)
        throw new AppError(422, 'PLAN_REQUIRED', 'Tạo kế hoạch học trước khi bật nhắc nền.');
      const plan = plans[0],
        state = json(plan.dieu_kien_hoc) || {};
      const previous = (state.pushDevices || []).find(
        (s) => s.subscription.endpoint === input.endpoint,
      );
      const devices = (state.pushDevices || []).filter(
        (s) => s.subscription.endpoint !== input.endpoint,
      );
      if (input.keys) devices.push({ subscription: input, sent: previous?.sent || [] });
      state.pushDevices = devices.slice(-5);
      await db.execute('UPDATE ke_hoach_hoc SET dieu_kien_hoc=? WHERE ma_ke_hoach=?', [
        JSON.stringify(state),
        plan.ma_ke_hoach,
      ]);
      return { subscribed: Boolean(input.keys) };
    }),
  );
}

// Network requests are outside the calendar lock. Re-read before committing
// acknowledgements so edits, read state and subscription changes are preserved.
export async function deliverStudyPush(
  pool,
  owner,
  inbox,
  config,
  send = (...args) => webpush.sendNotification(...args),
) {
  if (!pushConfigured(config)) return;
  const now = +new Date(inbox.serverNow);
  const due = inbox.notifications.filter(
    (n) => !n.read && !n.withdrawn && now - +new Date(n.dueAt) <= 300000,
  );
  if (!due.length) return;
  const [plans] = await pool.execute(
    'SELECT ma_ke_hoach,dieu_kien_hoc FROM ke_hoach_hoc WHERE ma_nguoi_dung=? ORDER BY ma_ke_hoach LIMIT 1',
    [owner],
  );
  if (!plans.length) return;
  const plan = plans[0],
    devices = json(plan.dieu_kien_hoc)?.pushDevices || [];
  for (const device of devices) {
    const pending = due.filter((n) => !device.sent.includes(n.id));
    if (!pending.length || !validPushEndpoint(device.subscription.endpoint)) continue;
    let expired = false;
    try {
      // Generic text protects document/topic names on shared lock screens.
      const id = createHash('sha256')
        .update(pending.map((n) => n.id).join(','))
        .digest('hex')
        .slice(0, 24);
      await send(
        device.subscription,
        JSON.stringify({
          title: 'Trợ lý học tập',
          body: 'Bạn có thông báo học tập mới. Mở lịch để xem buổi học.',
          url:
            pending.length === 1 && pending[0].kind !== 'cancelled'
              ? `/app/study-calendar/sessions/${pending[0].session.id}`
              : '/app/study-calendar',
          tag: `study-${id}`,
        }),
        {
          TTL: 300,
          timeout: 5000,
          vapidDetails: {
            subject: config.WEB_PUSH_SUBJECT,
            publicKey: config.WEB_PUSH_PUBLIC_KEY,
            privateKey: config.WEB_PUSH_PRIVATE_KEY,
          },
        },
      );
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) expired = true;
      else continue; // Retry next worker tick; never mark delivered after failure.
    }
    await withOwnerLock(pool, owner, (db) =>
      transaction(db, async () => {
        const [rows] = await db.execute(
          'SELECT dieu_kien_hoc FROM ke_hoach_hoc WHERE ma_ke_hoach=? AND ma_nguoi_dung=? FOR UPDATE',
          [plan.ma_ke_hoach, owner],
        );
        if (!rows.length) return;
        const state = json(rows[0].dieu_kien_hoc) || {};
        state.pushDevices = (state.pushDevices || [])
          .filter((d) => !expired || d.subscription.endpoint !== device.subscription.endpoint)
          .map((d) =>
            d.subscription.endpoint === device.subscription.endpoint
              ? { ...d, sent: [...new Set([...d.sent, ...pending.map((n) => n.id)])].slice(-500) }
              : d,
          );
        await db.execute('UPDATE ke_hoach_hoc SET dieu_kien_hoc=? WHERE ma_ke_hoach=?', [
          JSON.stringify(state),
          plan.ma_ke_hoach,
        ]);
      }),
    );
  }
}

import { deliverStudyPush } from './push.js';
import { createHash } from 'node:crypto';
import { withOwnerLock, transaction } from './locks.js';
import { json, missing } from '../shared/repository.js';
import { decorate, dto } from './sessionMapper.js';

const retention = 30 * 86400000;
// Delivery identity deliberately excludes Google sync and completion revisions.
export const reminderKey = (s) =>
  createHash('sha256')
    .update(JSON.stringify([s.id, s.title, s.goal, s.start, s.end, s.reminderMinutes]))
    .digest('hex')
    .slice(0, 24);

export function reconcileNotifications(previous = {}, sessions, now) {
  const items = (previous.items || []).filter((n) => +new Date(n.dueAt) >= +now - retention);
  const snapshots = {};
  for (const session of sessions) {
    const contentKey = reminderKey(session),
      old = previous.sessions?.[session.id];
    const changed = old && old.key !== contentKey;
    const generation =
      (old?.generation || 0) +
      (changed || (old && old.status !== 'planned' && session.status === 'planned') ? 1 : 0);
    const key = generation
      ? createHash('sha256').update(`${contentKey}:${generation}`).digest('hex').slice(0, 24)
      : contentKey;
    snapshots[session.id] = { key: contentKey, generation, status: session.status };
    for (const item of items.filter((n) => n.session.id === session.id)) {
      if (
        (changed || session.status !== 'planned') &&
        ['before', 'start', 'missed', 'moved'].includes(item.kind)
      ) {
        item.read = true;
        item.withdrawn = true;
      }
    }
    const add = (kind, dueAt) => {
      if (+dueAt > +now || +dueAt < +now - retention) return;
      const id = `${session.id}:${key}:${kind}`;
      if (!items.some((n) => n.id === id))
        items.push({
          id,
          kind,
          title: session.title,
          session: {
            id: session.id,
            courseId: session.courseId,
            title: session.title,
            start: session.start,
            end: session.end,
            status: session.status,
            version: session.version,
          },
          dueAt: new Date(dueAt).toISOString(),
          createdAt: now.toISOString(),
          read: false,
        });
    };
    if (old && session.status === 'cancelled' && old.status !== 'cancelled') add('cancelled', now);
    if (changed && session.status === 'planned') add('moved', now);
    if (session.status !== 'planned') continue;
    const start = +new Date(session.start),
      end = +new Date(session.end);
    // Do not create stale start toasts when catching up on missed sessions.
    if (end <= +now) {
      for (const item of items.filter(
        (n) => n.session.id === session.id && ['before', 'start'].includes(n.kind),
      )) {
        item.read = true;
        item.withdrawn = true;
      }
      add('missed', new Date(end));
    } else {
      if (session.reminderMinutes > 0)
        add('before', new Date(start - session.reminderMinutes * 60000));
      add('start', new Date(start));
    }
  }
  return {
    sessions: snapshots,
    items: items
      .sort((a, b) => b.dueAt.localeCompare(a.dueAt) || a.id.localeCompare(b.id))
      .slice(0, 200),
  };
}

// Keep the ERD unchanged: each plan owns its durable notification log.
// Calendar mutations and this worker share the same owner lock and row locks.
export async function notificationInbox(pool, owner, now = new Date(), readId, cursor) {
  return withOwnerLock(pool, owner, (db) =>
    transaction(db, () => notificationInboxForDb(db, owner, now, readId, cursor)),
  );
}
export async function notificationInboxForDb(db, owner, now, readId, cursor) {
  const [plans] = await db.execute(
    'SELECT ma_ke_hoach,dieu_kien_hoc FROM ke_hoach_hoc WHERE ma_nguoi_dung=? ORDER BY ma_ke_hoach FOR UPDATE',
    [owner],
  );
  const all = [];
  let found = false;
  for (const plan of plans) {
    const conditions = json(plan.dieu_kien_hoc) || {};
    const [rows] = await db.execute(
      'SELECT b.*,d.ma_mon_hoc FROM buoi_hoc b JOIN tai_lieu d USING(ma_tai_lieu) WHERE b.ma_ke_hoach=? AND b.ket_thuc_luc>=?',
      [plan.ma_ke_hoach, new Date(+now - retention)],
    );
    const sessions = rows.map((b) => dto(decorate({ ...b, dieu_kien_hoc: conditions })));
    const state = reconcileNotifications(
      structuredClone(conditions.notifications || {}),
      sessions,
      now,
    );
    for (const item of state.items) {
      if (readId === null || item.id === readId) {
        item.read = true;
        found = true;
      }
    }
    if (JSON.stringify(state) !== JSON.stringify(conditions.notifications)) {
      conditions.notifications = state;
      await db.execute('UPDATE ke_hoach_hoc SET dieu_kien_hoc=? WHERE ma_ke_hoach=?', [
        JSON.stringify(conditions),
        plan.ma_ke_hoach,
      ]);
    }
    all.push(...state.items);
  }
  if (readId && !found) throw missing();
  all.sort((a, b) => b.dueAt.localeCompare(a.dueAt) || a.id.localeCompare(b.id));
  const unreadCount = all.filter((n) => !n.read).length;
  const offset = cursor ? all.findIndex((n) => n.id === cursor) + 1 : 0;
  const notifications = all.slice(offset, offset + 20);
  return {
    mode: 'persistent',
    notifications,
    unreadCount,
    nextCursor: offset + 20 < all.length ? notifications.at(-1)?.id : null,
    serverNow: now.toISOString(),
  };
}

export async function generateStudyNotifications(pool, config = {}) {
  let after = '0';
  for (;;) {
    const [owners] = await pool.execute(
      'SELECT DISTINCT ma_nguoi_dung FROM ke_hoach_hoc WHERE ma_nguoi_dung>? ORDER BY ma_nguoi_dung LIMIT 50',
      [after],
    );
    if (!owners.length) break;
    for (const { ma_nguoi_dung: owner } of owners) {
      try {
        const inbox = await notificationInbox(pool, String(owner));
        await withOwnerLock(pool, `${owner}:push`, () =>
          deliverStudyPush(pool, String(owner), inbox, config),
        );
      } catch (error) {
        if (error.code !== 'CALENDAR_BUSY') throw error;
      }
    }
    after = String(owners.at(-1).ma_nguoi_dung);
  }
}

import { mkdir, appendFile } from 'node:fs/promises';
import { readAuditTail } from './auditTail.js';
import { resolve } from 'node:path';
export async function audit(config, actor, action, id) {
  const dir = resolve(
    import.meta.dirname,
    '../../../storage/erd16',
    config.ARTIFACT_NAMESPACE || config.DB_NAME,
  );
  await mkdir(dir, { recursive: true });
  await appendFile(
    resolve(dir, 'admin-audit.jsonl'),
    JSON.stringify({
      actorId: actor.user.id,
      action,
      entityId: id,
      at: new Date().toISOString(),
    }) + '\n',
    { mode: 0o600 },
  );
}
export async function recentAudit(config) {
  const file = resolve(
    import.meta.dirname,
    '../../../storage/erd16',
    config.ARTIFACT_NAMESPACE || config.DB_NAME,
    'admin-audit.jsonl',
  );
  let lines;
  try {
    lines = await readAuditTail(file);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  return lines.reverse().flatMap((line, index) => {
    try {
      const row = JSON.parse(line);
      return [
        {
          id: row.at + ':' + index,
          actor: 'Quản trị viên #' + row.actorId,
          action:
            {
              'user.blocked': 'Khóa tài khoản',
              'user.active': 'Mở khóa tài khoản',
              'document.delete': 'Xóa tài liệu',
            }[row.action] || row.action,
          entityType: row.action.startsWith('user.') ? 'user' : 'document',
          entityId: row.entityId,
          createdAt: row.at,
        },
      ];
    } catch {
      return [];
    }
  });
}

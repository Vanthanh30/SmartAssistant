import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
export function securityPath(config, id) {
  if (!/^\d+$/.test(String(id)) || !/^[a-zA-Z0-9_]+$/.test(config.DB_NAME))
    throw Error('INVALID_SECURITY_SCOPE');
  return resolve(
    import.meta.dirname,
    '../../../storage/erd16-security',
    config.DB_NAME,
    String(id) + '.json',
  );
}
export async function security(config, id) {
  try {
    return JSON.parse(await readFile(securityPath(config, id), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return { notBefore: 0, revoked: {} };
    throw e;
  }
}
export async function revokeOwnerSessions(config, id) {
  const path = securityPath(config, id);
  await mkdir(resolve(path, '..'), { recursive: true });
  const pending = path + '.' + randomBytes(8).toString('hex');
  await writeFile(pending, JSON.stringify({ notBefore: Date.now(), revoked: {} }), { mode: 0o600 });
  await rename(pending, path);
}
export async function revokeSession(config, actor) {
  const path = securityPath(config, actor.user.id);
  await mkdir(resolve(path, '..'), { recursive: true });
  const state = await security(config, actor.user.id);
  state.revoked = Object.fromEntries(
    Object.entries(state.revoked).filter(([, exp]) => exp > Date.now()),
  );
  state.revoked[actor.sessionNonce] = Date.now() + 604800000;
  const pending = path + '.' + randomBytes(8).toString('hex');
  await writeFile(pending, JSON.stringify(state), { mode: 0o600 });
  await rename(pending, path);
}

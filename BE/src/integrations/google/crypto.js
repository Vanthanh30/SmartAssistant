import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export function tokenKey(config) {
  const value = Buffer.from(config.GOOGLE_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (value.length !== 32) throw new Error('GOOGLE_ENCRYPTION_KEY_REQUIRED');
  return value;
}
export function encryptToken(config, token, owner, sub) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey(config), nonce);
  cipher.setAAD(Buffer.from(`google:v1:${owner}:${sub}`));
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return JSON.stringify({
    v: 1,
    n: nonce.toString('base64'),
    t: cipher.getAuthTag().toString('base64'),
    d: data.toString('base64'),
  });
}
export function decryptToken(config, value, owner, sub) {
  const envelope = JSON.parse(value);
  if (envelope.v !== 1) throw Error('UNKNOWN_TOKEN_VERSION');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    tokenKey(config),
    Buffer.from(envelope.n, 'base64'),
  );
  cipher.setAAD(Buffer.from(`google:v1:${owner}:${sub}`));
  cipher.setAuthTag(Buffer.from(envelope.t, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(envelope.d, 'base64')), cipher.final()]).toString(
    'utf8',
  );
}

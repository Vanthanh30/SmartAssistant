import { OAuth2Client } from 'google-auth-library';
import { randomBytes } from 'node:crypto';
import { decryptToken, tokenKey } from './crypto.js';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';
export function googleConfigured(config) {
  try {
    tokenKey(config);
    const redirect = new URL(config.GOOGLE_REDIRECT_URI);
    const valid =
      ['http:', 'https:'].includes(redirect.protocol) &&
      !redirect.username &&
      !redirect.password &&
      !redirect.search &&
      !redirect.hash &&
      (config.NODE_ENV !== 'production' || redirect.protocol === 'https:');
    return !!(
      valid &&
      config.STUDY_CALENDAR_SYNC_ENABLED &&
      config.GOOGLE_CLIENT_ID &&
      config.GOOGLE_CLIENT_SECRET
    );
  } catch {
    return false;
  }
}

export const eventId = () => randomBytes(20).toString('hex'); // base32hex subset, unrelated to auto-increment IDs
export function safeEventUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ((url.hostname === 'calendar.google.com' && /^\/calendar(?:\/|$)/.test(url.pathname)) ||
        (url.hostname === 'www.google.com' &&
          /^\/calendar\/(?:event|render)(?:\/|$)/.test(url.pathname)))
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function googleFailure(error) {
  const status = Number(error.status || error.response?.status) || 0;
  const reason = error.reason || error.response?.data?.error?.errors?.[0]?.reason;
  const invalid = error.code === 'invalid_grant' || error.response?.data?.error === 'invalid_grant';
  const raw = error.retryAfter || error.response?.headers?.['retry-after'];
  const retryAfter = Number.isFinite(Number(raw))
    ? Number(raw) * 1000
    : Math.max(0, Date.parse(raw) - Date.now()) || 0;
  return {
    status,
    reconnect:
      invalid ||
      status === 401 ||
      (status === 403 &&
        ![
          'rateLimitExceeded',
          'userRateLimitExceeded',
          'quotaExceeded',
          'dailyLimitExceeded',
        ].includes(reason)),
    retry:
      status === 429 ||
      status >= 500 ||
      (status === 403 &&
        ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'].includes(reason)) ||
      !status,
    retryAfter: Math.min(3600000, Math.max(0, retryAfter)),
  };
}

export function googleAdapter(config) {
  const client = (signal) => {
    const auth = new OAuth2Client({
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      redirectUri: config.GOOGLE_REDIRECT_URI,
    });
    const request = auth.transporter.request.bind(auth.transporter);
    // OAuth2Client supplies its own retry:true. Bound each library request here;
    // retry policy belongs to the calendar worker rather than hidden SDK retries.
    auth.transporter.request = (options) =>
      request({
        ...options,
        ...(signal ? { signal } : {}),
        timeout: 8000,
        retry: false,
        retryConfig: { ...options.retryConfig, retry: 0 },
      });
    return auth;
  };
  async function access(owner, connection, signal) {
    const auth = client(signal);
    let refresh;
    try {
      refresh = decryptToken(config, connection.ciphertext, owner, connection.googleSub);
    } catch {
      throw Object.assign(Error('TOKEN_INVALID'), { status: 401 });
    }
    auth.setCredentials({ refresh_token: refresh });
    const { token } = await auth.getAccessToken();
    if (!token) throw Object.assign(Error('TOKEN_UNAVAILABLE'), { status: 401 });
    return token;
  }
  async function request(
    owner,
    connection,
    id,
    { method = 'GET', body, signal = AbortSignal.timeout(20000) } = {},
  ) {
    const token = await access(owner, connection, signal);
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events${id ? '/' + encodeURIComponent(id) : ''}`,
      {
        method,
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    if (!response.ok) {
      let payload;
      try {
        payload = await response.json();
      } catch {
        /* never expose upstream body */
      }
      throw Object.assign(Error('GOOGLE_REQUEST_FAILED'), {
        status: response.status,
        reason: payload?.error?.errors?.[0]?.reason,
        retryAfter: response.headers.get('Retry-After'),
      });
    }
    return response.status === 204 ? null : response.json();
  }
  return {
    authorization(state, nonce, challenge) {
      return client().generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['openid', 'email', CALENDAR_SCOPE],
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });
    },
    async exchange(code, verifier, nonce) {
      const auth = client(AbortSignal.timeout(20000));
      const { tokens } = await auth.getToken({ code, codeVerifier: verifier });
      if (!tokens.id_token || !tokens.access_token) throw Error('GOOGLE_IDENTITY_REQUIRED');
      const ticket = await auth.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.GOOGLE_CLIENT_ID,
      });
      const identity = ticket.getPayload();
      if (identity.nonce !== nonce || !identity.sub || !identity.email || !identity.email_verified)
        throw Error('GOOGLE_IDENTITY_INVALID');
      const info = await auth.getTokenInfo(tokens.access_token);
      if (!info.scopes.includes(CALENDAR_SCOPE)) throw Error('GOOGLE_SCOPE_REQUIRED');
      return { sub: identity.sub, email: identity.email, refreshToken: tokens.refresh_token };
    },
    revoke: async (token) => {
      // The SDK's revokeToken puts the secret in a query string; keep it in the body.
      const response = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      });
      if (!response.ok) throw Error('GOOGLE_REVOKE_FAILED');
    },
    get: (owner, connection, id, signal) => request(owner, connection, id, { signal }),
    insert: (owner, connection, id, payload, signal) =>
      request(owner, connection, null, { method: 'POST', body: { ...payload, id }, signal }),
    patch: (owner, connection, id, payload, signal) =>
      request(owner, connection, id, { method: 'PATCH', body: payload, signal }),
    delete: (owner, connection, id, signal) =>
      request(owner, connection, id, { method: 'DELETE', signal }),
  };
}

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';
export class ApiError extends Error {
  constructor(status, payload) { super(payload.error?.message ?? 'Không thể kết nối máy chủ.'); this.status = status; this.code = payload.error?.code; this.fields = payload.error?.details?.fields; this.details = payload.error?.details; }
}
export class RequestError extends Error {
  constructor(code, message, { status, requestId } = {}) {
    super(message);
    this.name = code === 'REQUEST_ABORTED' ? 'AbortError' : 'RequestError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}
function transportError(signal) {
  if (signal.aborted && signal.reason?.name === 'TimeoutError') return new RequestError('REQUEST_TIMEOUT', 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.');
  if (signal.aborted) return new RequestError('REQUEST_ABORTED', 'Yêu cầu đã được hủy.');
  return new RequestError('NETWORK_ERROR', 'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.');
}
export async function api(path, { method = 'GET', body, csrfToken, envelope = false, raw = false, signal, timeoutMs = 15000 } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetch(baseUrl + path, { method, credentials: 'include', signal: requestSignal,
      headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
      ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  } catch { throw transportError(requestSignal); }
  if (raw && response.ok) return response;
  const invalidResponse = () => new RequestError('INVALID_RESPONSE', 'Máy chủ trả về phản hồi không hợp lệ. Vui lòng thử lại.', {
    status: response.status, requestId: response.headers.get('X-Request-Id'),
  });
  // Never surface proxy HTML/plain text, malformed JSON or arbitrary error bodies.
  const contentType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json' && !contentType?.endsWith('+json')) throw invalidResponse();
  let payload;
  try { payload = await response.json(); }
  catch (error) {
    if (requestSignal.aborted) throw transportError(requestSignal);
    if (error instanceof SyntaxError) throw invalidResponse();
    throw transportError(requestSignal);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalidResponse();
  if (!response.ok) {
    if (!payload.error || typeof payload.error.code !== 'string' || typeof payload.error.message !== 'string') throw invalidResponse();
    if (payload.error?.code === 'SESSION_EXPIRED' || payload.error?.code === 'ACCOUNT_BLOCKED') window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(response.status, payload);
  }
  if (!Object.hasOwn(payload, 'data')) throw invalidResponse();
  return envelope ? payload : payload.data;
}

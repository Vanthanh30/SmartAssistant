import { AppError } from '../../shared/AppError.js';
import { setTimeout as delay } from 'node:timers/promises';
export function openaiCaller(config) {
  async function call(path, body, signal, attempt = 0) {
    if (!config.OPENAI_API_KEY || !config.LLM_MODEL || !config.LLM_MODEL_CONTEXT_TOKENS)
      throw new AppError(
        503,
        'LLM_NOT_CONFIGURED',
        'Chưa cấu hình API key, model và context window của LLM.',
      );
    let response;
    try {
      response = await fetch(`https://api.openai.com/v1/responses${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      throw new AppError(
        error.name === 'TimeoutError' ? 504 : 503,
        'LLM_UNAVAILABLE',
        'LLM hết thời gian hoặc không thể kết nối.',
      );
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const quota =
        data.error?.type === 'insufficient_quota' ||
        ['insufficient_quota', 'credit_balance_exhausted'].includes(data.error?.code);
      // Retry only explicit rejection429 (not quota), or the non-generating count endpoint5xx.
      // Never replay generation after an ambiguous network failure/timeout/5xx.
      if (
        !quota &&
        attempt === 0 &&
        (response.status === 429 || (path === '/input_tokens' && response.status >= 500))
      ) {
        try {
          await delay(1000, undefined, { signal });
        } catch {
          throw new AppError(504, 'LLM_TIMEOUT', 'LLM đã hết thời gian xử lý.');
        }
        return call(path, body, signal, 1);
      }
      throw new AppError(
        response.status === 429 ? 429 : response.status >= 500 ? 503 : 502,
        quota
          ? 'LLM_QUOTA_EXCEEDED'
          : response.status === 429
            ? 'LLM_RATE_LIMITED'
            : 'LLM_PROVIDER_ERROR',
        quota
          ? 'Trợ lý AI tạm thời chưa khả dụng. Vui lòng thử lại sau.'
          : 'Trợ lý chưa thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.',
      );
    }
    try {
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('INVALID_JSON_OBJECT');
      return data;
    } catch {
      throw new AppError(
        signal.aborted ? 504 : 502,
        signal.aborted ? 'LLM_TIMEOUT' : 'LLM_INVALID_RESPONSE',
        signal.aborted ? 'LLM đã hết thời gian xử lý.' : 'LLM trả dữ liệu không hợp lệ.',
      );
    }
  }
  return call;
}

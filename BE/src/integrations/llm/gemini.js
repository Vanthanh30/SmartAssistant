import { setTimeout as delay } from 'node:timers/promises';
import { AppError } from '../../shared/AppError.js';

// Adapter for the existing internal count/generate contract. No SDK dependency.
export function geminiRequest(body, config) {
  const contents = (body.input || []).map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: Array.isArray(message.content)
      ? message.content.map((part) => {
          if (part.type === 'input_text' && typeof part.text === 'string')
            return { text: part.text };
          const match =
            part.type === 'input_image' &&
            typeof part.image_url === 'string' &&
            part.image_url.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
          if (!match || match[2].length > 3 * 1024 ** 2)
            throw new AppError(422, 'LLM_INVALID_IMAGE', 'Ảnh nguồn chưa hợp lệ.');
          return { inlineData: { mimeType: match[1], data: match[2] } };
        })
      : [
          {
            text:
              typeof message.content === 'string'
                ? message.content
                : JSON.stringify(message.content),
          },
        ],
  }));
  const format = body.text?.format;
  const generationConfig = {
    maxOutputTokens: body.max_output_tokens ?? config.LLM_MAX_OUTPUT_TOKENS,
    ...(!/^gemini-3[.-]/.test(config.LLM_MODEL) ? { candidateCount: 1 } : {}),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(format?.type === 'json_schema'
      ? { responseMimeType: 'application/json', responseJsonSchema: format.schema }
      : {}),
  };
  const thinkingBudget = body.thinking_budget ?? config.GEMINI_THINKING_BUDGET;
  if (thinkingBudget !== undefined && /^gemini-2\.5-flash(?:-|$)/.test(config.LLM_MODEL)) {
    generationConfig.thinkingConfig = { thinkingBudget };
  }
  const thinkingLevel = body.thinking_level || config.GEMINI_THINKING_LEVEL;
  if (thinkingLevel && /^gemini-3[.-]/.test(config.LLM_MODEL)) {
    generationConfig.thinkingConfig = { thinkingLevel };
  }
  return {
    contents,
    ...(body.instructions ? { systemInstruction: { parts: [{ text: body.instructions }] } } : {}),
    generationConfig,
  };
}

function providerError(status, data) {
  const details = data?.error?.details || [];
  const quota =
    status === 429 &&
    details.some((detail) =>
      (detail.violations || []).some(
        (violation) =>
          String(violation.quotaValue) === '0' ||
          /perday|per_day/i.test(violation.quotaId || violation.quotaMetric || ''),
      ),
    );
  if (quota)
    return new AppError(
      429,
      'LLM_QUOTA_EXCEEDED',
      'Trợ lý AI đã đạt hạn mức sử dụng. Vui lòng thử lại sau.',
    );
  if (status === 429)
    return new AppError(
      429,
      'LLM_RATE_LIMITED',
      'Trợ lý AI đang nhận nhiều yêu cầu. Vui lòng thử lại sau.',
    );
  if (
    status === 401 ||
    status === 403 ||
    details.some((detail) => detail.reason === 'API_KEY_INVALID')
  ) {
    return new AppError(
      503,
      'LLM_AUTH_FAILED',
      'Kết nối trợ lý AI chưa được cấu hình hợp lệ. Vui lòng liên hệ quản trị viên.',
    );
  }
  if (status === 404)
    return new AppError(
      503,
      'LLM_MODEL_UNAVAILABLE',
      'Mô hình AI đang cấu hình chưa khả dụng. Vui lòng liên hệ quản trị viên.',
    );
  if (status === 503)
    return new AppError(
      503,
      'LLM_PROVIDER_ERROR',
      'Dịch vụ Gemini tạm thời chưa khả dụng hoặc đang quá tải (503). Vui lòng thử lại sau.',
    );
  return new AppError(
    status >= 500 ? 503 : 502,
    'LLM_PROVIDER_ERROR',
    'Trợ lý chưa thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.',
  );
}

export function geminiCaller(config, { fetchImpl = globalThis.fetch, wait = delay } = {}) {
  return async (path, body, suppliedSignal) => {
    if (
      !config.GEMINI_API_KEY ||
      !/^gemini-[a-zA-Z0-9._-]+$/.test(config.LLM_MODEL || '') ||
      !config.LLM_MODEL_CONTEXT_TOKENS
    ) {
      throw new AppError(
        503,
        'LLM_NOT_CONFIGURED',
        !config.GEMINI_API_KEY
          ? 'Thiếu GEMINI_API_KEY trong cấu hình backend.'
          : !/^gemini-[a-zA-Z0-9._-]+$/.test(config.LLM_MODEL || '')
            ? 'LLM_MODEL đang trống hoặc không phải tên model Gemini hợp lệ. Kiểm tra BE/.env và khởi động lại backend.'
            : 'Thiếu LLM_MODEL_CONTEXT_TOKENS trong cấu hình backend.',
      );
    }
    if (!['', '/input_tokens'].includes(path))
      throw new AppError(500, 'LLM_INVALID_OPERATION', 'Thao tác AI không hợp lệ.');
    const signal = suppliedSignal || AbortSignal.timeout(config.LLM_TIMEOUT_MS || 60000);
    const request = geminiRequest(body, config),
      count = path === '/input_tokens';
    const model = `models/${config.LLM_MODEL}`;
    const payload = count ? { generateContentRequest: { model, ...request } } : request;
    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:${count ? 'countTokens' : 'generateContent'}`;
    let data;
    for (let attempt = 0; attempt < 2; attempt++) {
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.GEMINI_API_KEY },
          body: JSON.stringify(payload),
          signal,
        });
      } catch {
        throw new AppError(
          signal.aborted ? 504 : 503,
          signal.aborted ? 'LLM_TIMEOUT' : 'LLM_UNAVAILABLE',
          'Trợ lý AI hết thời gian hoặc không thể kết nối.',
        );
      }
      try {
        data = await response.json();
      } catch {
        throw new AppError(
          signal.aborted ? 504 : 502,
          signal.aborted ? 'LLM_TIMEOUT' : 'LLM_INVALID_RESPONSE',
          'Trợ lý AI trả dữ liệu không hợp lệ.',
        );
      }
      if (response.ok) break;
      const error = providerError(response.status, data);
      // Only retry explicit rate rejection or a safe token-count request. Never
      // replay generation after timeout/network/5xx with unknown billing state.
      if (
        attempt === 0 &&
        (error.code === 'LLM_RATE_LIMITED' || (count && response.status >= 500))
      ) {
        try {
          await wait(1000, undefined, { signal });
        } catch {
          throw new AppError(504, 'LLM_TIMEOUT', 'Trợ lý AI đã hết thời gian xử lý.');
        }
        continue;
      }
      // Keep only safe provider diagnostics, never raw responses or credentials.
      error.details = {
        provider: 'gemini',
        httpStatus: response.status,
        providerStatus: typeof data?.error?.status === 'string' ? data.error.status : undefined,
      };
      throw error;
    }
    if (count) {
      if (!Number.isSafeInteger(data?.totalTokens) || data.totalTokens < 0)
        throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Không đọc được số token của Gemini.');
      return { input_tokens: data.totalTokens };
    }
    if (data?.promptFeedback?.blockReason)
      throw new AppError(502, 'LLM_REFUSED', 'Mô hình từ chối yêu cầu.');
    const candidate = data?.candidates?.[0];
    if (
      ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(
        candidate?.finishReason,
      )
    )
      throw new AppError(502, 'LLM_REFUSED', 'Mô hình từ chối yêu cầu.');
    if (!candidate)
      throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Gemini chưa trả nội dung hợp lệ.');
    if (candidate.finishReason !== 'STOP')
      throw new AppError(
        502,
        'LLM_INCOMPLETE',
        'Mô hình chưa hoàn thành kết quả. Hãy thu hẹp yêu cầu hoặc tăng giới hạn đầu ra.',
      );
    const text = (candidate.content?.parts || [])
      .filter((part) => !part.thought && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    if (!text.trim())
      throw new AppError(502, 'LLM_INVALID_RESPONSE', 'Gemini chưa trả nội dung hợp lệ.');
    return {
      status: 'completed',
      model: data.modelVersion || config.LLM_MODEL,
      output: [{ role: 'assistant', content: [{ type: 'output_text', text }] }],
      usage: {
        input_tokens: data.usageMetadata?.promptTokenCount,
        output_tokens: data.usageMetadata?.candidatesTokenCount,
        total_tokens: data.usageMetadata?.totalTokenCount,
      },
    };
  };
}

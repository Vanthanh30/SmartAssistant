// Default Flash reasoning can consume the output budget before producing visible text.
// Apply only to Q&A; explicit operator settings and other model families are preserved.
export function qaLatencyConfig(config) {
  if (config.LLM_PROVIDER !== 'gemini') return config;
  if (/^gemini-2\.5-flash(?:-|$)/u.test(config.LLM_MODEL || '') && config.GEMINI_THINKING_BUDGET === undefined)
    return { ...config, GEMINI_THINKING_BUDGET: 0 };
  if (/^gemini-3[.-]/u.test(config.LLM_MODEL || '') && !config.GEMINI_THINKING_LEVEL)
    return { ...config, GEMINI_THINKING_LEVEL: 'low' };
  return config;
}

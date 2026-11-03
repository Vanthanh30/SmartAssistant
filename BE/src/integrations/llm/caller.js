import { geminiCaller } from './gemini.js';
import { openaiCaller } from './openai.js';
export function responsesCaller(config) {
  return config.LLM_PROVIDER === 'gemini' ? geminiCaller(config) : openaiCaller(config);
}

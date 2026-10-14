import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { resolve } from 'node:path';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
export function loadConfig(env = process.env) {
  const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CORS_ORIGIN: z.url(),
    DB_HOST: z.string().min(1), DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
    DB_USER: z.string().min(1), DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().regex(/^[a-zA-Z0-9_]+$/),
    SESSION_COOKIE_NAME: z.string().regex(/^[a-zA-Z0-9_]+$/).default('study_session'),
    SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(604800).default(86400),
    AUTH_RATE_LIMIT_PER_15_MINUTES: z.coerce.number().int().min(1).max(1000).default(20),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
    AVATAR_DIR: z.string().min(1).default('./storage/avatars'),
    UPLOAD_DIR: z.string().min(1).default('./storage/uploads'),
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(20).default(20),
    MAX_DOCUMENTS_PER_COURSE: z.coerce.number().int().min(1).max(1000).default(50),
    MAX_COURSE_STORAGE_MB: z.coerce.number().int().min(20).max(10240).default(500),
    MAX_USER_STORAGE_MB: z.coerce.number().int().min(20).max(102400).default(1024),
    PDF_MAX_PAGES: z.coerce.number().int().min(1).max(10000).default(1000),
    PDF_MAX_TEXT_CHARS: z.coerce.number().int().min(1000).max(50000000).default(5000000),
    PDF_EXTRACTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
    JOB_POLL_MS: z.coerce.number().int().min(250).max(10000).default(1000),
    JOB_LEASE_SECONDS: z.coerce.number().int().min(15).max(300).default(30),
    JOB_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    RAG_SERVICE_URL: z.url().default('http://127.0.0.1:8001'),
    RAG_SERVICE_TOKEN: z.string().default(''),
    RAG_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(300000),
    RECONCILIATION_INTERVAL_MS: z.coerce.number().int().min(60000).max(86400000).default(300000),
    ORPHAN_GRACE_SECONDS: z.coerce.number().int().min(3600).max(2592000).default(86400),
    CLOUDINARY_CLOUD_NAME: z.string().trim().regex(/^[a-zA-Z0-9_-]*$/).max(100).default(''),
    CLOUDINARY_API_KEY: z.string().trim().default(''), CLOUDINARY_API_SECRET: z.string().trim().default(''),
    SMTP_HOST: z.string().trim().max(255).default(''),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z.preprocess(v => v === undefined ? false : v === true || v === 'true' || v === '1' ? true : v === false || v === 'false' || v === '0' ? false : v, z.boolean()),
    SMTP_USER: z.string().trim().default(''), SMTP_PASSWORD: z.string().default(''),
    EMAIL_FROM: z.string().trim().max(320).refine(v => !/[\r\n]/.test(v)).default(''),
    LLM_PROVIDER: z.enum(['openai']).default('openai'),
    LLM_MODEL: z.string().trim().max(200).default(''), OPENAI_API_KEY: z.string().trim().default(''),
    LLM_TEMPERATURE: z.preprocess(v => v === '' ? undefined : v, z.coerce.number().min(0).max(2).optional()),
    LLM_MODEL_CONTEXT_TOKENS: z.coerce.number().int().min(0).default(0),
    LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
    LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(100).max(16000).default(1500),
    LLM_CONTEXT_BUDGET_TOKENS: z.coerce.number().int().min(100).max(100000).default(6000),
    LEARNING_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(20),
    ASK_MAX_QUESTION_CHARS: z.coerce.number().int().min(1).max(1000).default(1000),
    ASK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100).default(10),
    ASK_DAILY_LIMIT: z.coerce.number().int().min(1).max(10000).default(100),
    RAG_TOP_K: z.coerce.number().int().min(1).max(20).default(5),
    RAG_SCORE_THRESHOLD: z.coerce.number().min(-1).max(1).default(0.75),
  });
  const result = schema.safeParse(env);
  if (!result.success) throw new Error(`Cấu hình env không hợp lệ: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const config = result.data;
  if ([config.CLOUDINARY_CLOUD_NAME,config.CLOUDINARY_API_KEY,config.CLOUDINARY_API_SECRET].some(Boolean) && ![config.CLOUDINARY_CLOUD_NAME,config.CLOUDINARY_API_KEY,config.CLOUDINARY_API_SECRET].every(Boolean)) throw new Error('Cần đủ3 biến CLOUDINARY để bật lưu cloud.');
  if ([config.SMTP_HOST,config.SMTP_USER,config.SMTP_PASSWORD,config.EMAIL_FROM].some(Boolean) && ![config.SMTP_HOST,config.SMTP_USER,config.SMTP_PASSWORD,config.EMAIL_FROM].every(Boolean)) throw new Error('Cần SMTP_HOST/USER/PASSWORD và EMAIL_FROM để bật email.');
  const ragUrl = new URL(config.RAG_SERVICE_URL);
  if (ragUrl.protocol !== 'http:' || ragUrl.hostname !== '127.0.0.1' || ragUrl.username || ragUrl.password || ragUrl.pathname !== '/' || ragUrl.search || ragUrl.hash) throw new Error('RAG_SERVICE_URL phải là HTTP loopback 127.0.0.1 không có path');
  config.AVATAR_DIR = resolve(fileURLToPath(new URL('../../', import.meta.url)), config.AVATAR_DIR);
  config.UPLOAD_DIR = resolve(fileURLToPath(new URL('../../', import.meta.url)), config.UPLOAD_DIR);
  if (new URL(config.CORS_ORIGIN).origin !== config.CORS_ORIGIN) throw new Error('CORS_ORIGIN phải là origin không có path');
  if (config.NODE_ENV === 'production' && !config.CORS_ORIGIN.startsWith('https://')) throw new Error('Production yêu cầu CORS_ORIGIN HTTPS');
  return config;
}

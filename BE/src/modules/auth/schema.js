import { z } from 'zod';
export const passwordSchema = z.string().refine(v => Buffer.byteLength(v, 'utf8') >= 8 && Buffer.byteLength(v, 'utf8') <= 72,
  'Mật khẩu phải có 8–72 byte UTF-8.');
const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Email không hợp lệ.'));
export const fullNameSchema = z.string().transform(v => v.trim().normalize('NFC')).refine(v => [...v].length >= 2 && [...v].length <= 100,
  'Họ tên phải có 2–100 ký tự.');
export const registerSchema = z.object({ fullName: fullNameSchema, email, password: passwordSchema,
  confirmPassword: z.string() }).strict().refine(v => v.password === v.confirmPassword,
  { message: 'Xác nhận mật khẩu không khớp.', path: ['confirmPassword'] });
export const loginSchema = z.object({ email, password: passwordSchema }).strict();

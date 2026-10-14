import { z } from 'zod';
const password = z.string().refine(v => { const count = new TextEncoder().encode(v).length; return count >= 8 && count <= 72; }, 'Mật khẩu phải có 8–72 byte UTF-8.');
const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Email không hợp lệ.'));
export const loginSchema = z.object({ email, password }).strict();
export const registerSchema = z.object({ email, password,
  fullName: z.string().transform(v => v.trim().normalize('NFC')).refine(v => [...v].length >= 2 && [...v].length <= 100, 'Họ tên phải có 2–100 ký tự.'),
  confirmPassword: z.string() }).strict().refine(v => v.password === v.confirmPassword,
  { message: 'Xác nhận mật khẩu không khớp.', path: ['confirmPassword'] });

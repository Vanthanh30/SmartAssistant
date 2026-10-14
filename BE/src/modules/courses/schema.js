import { z } from 'zod';
const name = z.string().transform(v => v.trim().normalize('NFC')).refine(v => [...v].length >= 1 && [...v].length <= 150, 'Tên môn phải có 1–150 ký tự.');
const description = z.string().transform(v => v.normalize('NFC')).refine(v => [...v].length <= 2000, 'Mô tả tối đa 2.000 ký tự.');
export const courseCreateSchema = z.object({ name, description: description.default('') }).strict();
export const coursePatchSchema = z.object({ name: name.optional(), description: description.optional() }).strict().refine(v => Object.keys(v).length > 0, 'Cần ít nhất một trường để cập nhật.');
export const courseIdSchema = z.object({ courseId: z.string().regex(/^[1-9][0-9]{0,19}$/).pipe(z.string().refine(v => BigInt(v) <= 18446744073709551615n, 'ID không hợp lệ.')) });
export const courseQuerySchema = z.object({ q: z.string().trim().transform(v => v.normalize('NFC')).refine(v => [...v].length <= 150, 'Từ khóa tối đa 150 ký tự.').default(''),
  page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();

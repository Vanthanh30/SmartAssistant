import { z } from 'zod';
export const courseSchema = z.object({ name: z.string().transform(v => v.trim().normalize('NFC')).refine(v => [...v].length >= 1 && [...v].length <= 150, 'Tên môn phải có 1–150 ký tự.'),
  description: z.string().transform(v => v.normalize('NFC')).refine(v => [...v].length <= 2000, 'Mô tả tối đa 2.000 ký tự.') }).strict();

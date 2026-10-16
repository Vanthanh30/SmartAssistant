import { z } from 'zod';
const id = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(v => BigInt(v) <= 18446744073709551615n);
export const courseParams = z.object({ courseId: id });
export const setParams = z.object({ setId: id });
export const attemptParams = z.object({ attemptId: id });
export const generationInput = z.object({
  requestId: z.uuid(), kind: z.enum(['quiz','flashcards']), title: z.string().transform(v => v.trim().normalize('NFC')).refine(v => [...v].length <= 150, { message: 'Tiêu đề tối đa 150 ký tự.' }).optional().default(''),
  count: z.number().int().min(1).max(29), documentIds: z.array(id).min(1).max(10),
}).strict().refine(v => new Set(v.documentIds).size === v.documentIds.length, { message: 'Không chọn trùng tài liệu.' });
export const pageInput = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
export const startInput = z.object({ requestId: z.uuid() }).strict();
export const answersInput = z.object({ answers: z.array(z.object({ itemId: id, choice: z.number().int().min(0).max(3).nullable() }).strict()).min(1).max(29) }).strict();

import { z } from 'zod';
import { courseIdSchema } from '../courses/schema.js';
const id = courseIdSchema.shape.courseId;
export const historyQuerySchema = z.object({
 courseId: id.optional(),
 q: z.string().trim().transform(v => v.normalize('NFC')).refine(v => [...v].length <= 150,'Từ khóa tối đa150 ký tự.').default(''),
 page: z.coerce.number().int().min(1).max(1000000).default(1),
 pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export const transcriptQuerySchema = z.object({ beforeMessageId: id.optional(), limit: z.coerce.number().int().min(1).max(100).default(100) }).strict();

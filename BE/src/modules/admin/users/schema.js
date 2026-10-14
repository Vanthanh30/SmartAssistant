import { z } from 'zod';
import { courseIdSchema } from '../../courses/schema.js';
export const userIdSchema=z.object({userId:courseIdSchema.shape.courseId});
export const statusSchema=z.object({status:z.enum(['active','blocked'])}).strict();
export const userQuerySchema=z.object({
 q:z.string().trim().transform(v=>v.normalize('NFC')).refine(v=>[...v].length<=150,'Từ khóa tối đa 150 ký tự.').default(''),
 status:z.enum(['active','blocked']).optional(),
 page:z.coerce.number().int().min(1).max(1000000).default(1),
 pageSize:z.coerce.number().int().min(1).max(100).default(20),
}).strict();

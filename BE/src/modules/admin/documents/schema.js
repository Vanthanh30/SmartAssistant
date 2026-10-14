import { z } from 'zod';
import { documentIdSchema } from '../../documents/schema.js';
export const statuses=['queued','extracting','chunking','embedding','indexing','ready','failed','unsupported','deleting','deleted'];
export const adminDocumentQuerySchema=z.object({
 q:z.string().trim().transform(v=>v.normalize('NFC')).refine(v=>[...v].length<=255,'Từ khóa tối đa255 ký tự.').default(''),
 status:z.enum(statuses).optional(),userId:documentIdSchema.shape.documentId.optional(),courseId:documentIdSchema.shape.documentId.optional(),
 page:z.coerce.number().int().min(1).max(1000000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export const courseFilterQuerySchema=adminDocumentQuerySchema.omit({status:true,courseId:true}).extend({pageSize:z.coerce.number().int().min(1).max(100).default(100)});

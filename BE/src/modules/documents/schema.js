import { z } from 'zod';
const id = z.string().regex(/^[1-9][0-9]{0,19}$/).pipe(z.string().refine(v => BigInt(v) <= 18446744073709551615n, 'ID không hợp lệ.'));
export const documentIdSchema = z.object({ documentId: id });
export const documentQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();

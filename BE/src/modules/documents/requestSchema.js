import { z } from 'zod';
import { id } from '../shared/idSchema.js';
export function documentsRequestSchemas() {
  const chunkParams = z.object({ documentId: id, chunkId: id });
  return { chunkParams };
}

import { z } from 'zod';
import { fullNameSchema } from '../auth/schema.js';
export const profileSchema = z.object({ fullName: fullNameSchema }).strict();

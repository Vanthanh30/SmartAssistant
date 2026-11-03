import { z } from 'zod';
export const id = z
  .string()
  .regex(/^[1-9][0-9]{0,19}$/)
  .refine((v) => BigInt(v) <= 18446744073709551615n);
export const idParams = (key) => z.object({ [key]: id });

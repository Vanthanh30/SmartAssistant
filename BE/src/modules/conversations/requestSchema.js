import { z } from 'zod';
import { id } from '../shared/idSchema.js';
export function conversationsRequestSchemas(config) {
  const createConversation = z
    .object({ title: z.string().trim().min(1).max(150).optional() })
    .strict();
  const formulaParams = z.object({
    conversationId: id,
    turnId: id,
    blockId: z.string().regex(/^[a-f0-9]{24}$/),
  });
  const askQuestion = z
    .object({
      question: z.string().trim().min(1).max(config.ASK_MAX_QUESTION_CHARS),
      requestId: z.uuid(),
      sessionId: id.optional(),
      documentIds: z
        .array(id)
        .min(1)
        .max(50)
        .refine((v) => new Set(v).size === v.length)
        .optional(),
      answerMode: z.enum(['documents', 'auto', 'general']).default('auto'),
    })
    .strict();
  return { createConversation, formulaParams, askQuestion };
}

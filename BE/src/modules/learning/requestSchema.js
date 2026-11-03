import { z } from 'zod';
import { id } from '../shared/idSchema.js';
import { generationInput, answersInput } from './schema.js';
export function learningRequestSchemas() {
  const createInput = generationInput
    .safeExtend({
      documentIds: z.array(id).min(1).max(10),
      pageFrom: z.number().int().positive().optional(),
      pageTo: z.number().int().positive().optional(),
      generationMode: z.literal('ai').default('ai'),
      forceNew: z.boolean().default(false),
      sessionId: id.optional(),
      topic: z.string().trim().min(1).max(150).optional(),
      topics: z.array(z.string().trim().min(1).max(150)).min(1).max(3).optional(),
    })
    .superRefine((v, ctx) => {
      if (
        (v.pageFrom === undefined) !== (v.pageTo === undefined) ||
        (v.pageFrom && v.pageTo < v.pageFrom)
      )
        ctx.addIssue({ code: 'custom', message: 'Khoảng trang không hợp lệ.' });
    });
  const confirmAnswer = z
    .object({
      itemId: id,
      choice: z.number().int().min(0).max(3).nullable().optional(),
      memory: z.enum(['again', 'hard', 'good', 'easy']).optional(),
    })
    .strict();
  const submitAnswers = answersInput.safeExtend({
    answers: z.array(answersInput.shape.answers.element).max(29),
  });
  return { createInput, confirmAnswer, submitAnswers };
}

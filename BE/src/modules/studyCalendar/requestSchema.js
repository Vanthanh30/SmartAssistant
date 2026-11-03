import { z } from 'zod';
import { id } from '../shared/idSchema.js';
import * as oldCalendar from './schema.js';
import { lessonSchema } from './lessonPlan.js';
export function studyCalendarRequestSchemas() {
  const scope = {
    documentId: id,
    pageFrom: z.number().int().positive(),
    pageTo: z.number().int().positive(),
  };
  const session = oldCalendar.sessionInput.safeExtend({
    ...scope,
    lesson: lessonSchema.optional(),
  });
  const plan = oldCalendar.planInput
    .safeExtend({
      studyFrom: z.iso.date().optional(),
      studyTo: z.iso.date().optional(),
      goals: z
        .array(
          oldCalendar.planInput.shape.goals.element.safeExtend({
            ...scope,
            documentIds: z.array(id).min(1).max(10).optional(),
          }),
        )
        .min(1)
        .max(10),
      locked: z
        .array(
          session.safeExtend({
            locked: z.literal(true),
            exceptionConfirmed: z.boolean().default(false),
          }),
        )
        .max(60)
        .default([]),
    })
    .superRefine((value, ctx) => {
      const end = new Date(`${value.week}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 6);
      const from = value.studyFrom || value.week,
        to = value.studyTo || end.toISOString().slice(0, 10);
      if (from < value.week || to > end.toISOString().slice(0, 10) || from > to)
        ctx.addIssue({
          code: 'custom',
          message: 'Ngày bắt đầu/kết thúc phải theo đúng thứ tự trong tuần đã chọn.',
        });
    });
  const confirmPlan = z
    .object({
      constraints: plan,
      slots: z
        .array(
          session.safeExtend({
            locked: z.boolean().default(false),
            exceptionConfirmed: z.boolean().default(false),
          }),
        )
        .min(1)
        .max(60),
    })
    .strict();
  const moveSession = oldCalendar.moveInput.safeExtend({ constraints: plan });
  const patchSession = z.object({ version: z.number().int().positive(), session }).strict();
  const googleCallback = z
    .object({
      state: z.string().max(200),
      code: z.string().max(4096).optional(),
      error: z.string().max(200).optional(),
    })
    .passthrough();
  return { session, plan, confirmPlan, moveSession, patchSession, googleCallback };
}

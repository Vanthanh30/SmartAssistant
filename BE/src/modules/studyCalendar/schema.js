import { z } from 'zod';
export const sessionConversationInput = z
  .object({ newConversation: z.boolean().default(false) })
  .strict();
const id = z
  .string()
  .regex(/^[1-9][0-9]{0,19}$/)
  .refine((v) => BigInt(v) <= 18446744073709551615n);
export const params = z.object({ id });
const date = z.iso.date();
const timestamp = z.iso.datetime({ offset: true }).transform((v) => new Date(v).toISOString());
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const note = z.string().trim().normalize().max(5000).default('');
const reminder = z
  .union([z.literal(0), z.literal(10), z.literal(15), z.literal(30), z.literal(60), z.null()])
  .default(10);
export const sessionInput = z
  .object({
    requestId: z.uuid().toLowerCase(),
    courseId: id.nullable().default(null),
    title: z.string().trim().normalize().min(1).max(200),
    goal: note,
    start: timestamp,
    end: timestamp,
    reminderMinutes: reminder,
    googleSync: z.boolean().default(false),
  })
  .strict()
  .refine(
    (v) => new Date(v.end) > new Date(v.start) && new Date(v.end) - new Date(v.start) <= 86400000,
    { message: 'Buổi học phải dài hơn 0 và tối đa24 giờ.' },
  );
export const revision = z.object({ version: z.number().int().positive() }).strict();
export const patchInput = z
  .object({ version: z.number().int().positive(), session: sessionInput })
  .strict();
export const interval = z
  .object({ day: z.number().int().min(1).max(7), start: clock, end: clock })
  .strict()
  .refine((v) => v.start !== v.end, { message: 'Hai mốc giờ phải khác nhau.' });
const exception = z
  .object({ date, allDay: z.boolean(), start: clock.optional(), end: clock.optional() })
  .strict()
  .refine((v) => v.allDay || !!(v.start && v.end && v.start !== v.end));
const goal = z
  .object({
    courseId: id.nullable(),
    goal: note,
    sessions: z.number().int().min(1).max(60),
    duration: z.number().int().min(15).max(180),
    priority: z.enum(['high', 'normal', 'low']),
  })
  .strict();
const locked = sessionInput.safeExtend({
  locked: z.literal(true),
  exceptionConfirmed: z.boolean().default(false),
});
export const planInput = z
  .object({
    week: date,
    goals: z.array(goal).min(1).max(10),
    free: z.array(interval).min(1).max(42),
    busy: z.array(interval).max(42),
    exceptions: z.array(exception).max(30),
    breakMinutes: z.number().int().min(0).max(60).default(10),
    maxSessionsPerDay: z.number().int().min(1).max(6),
    maxMinutesPerDay: z.number().int().min(30).max(480),
    preferred: z.enum(['none', 'morning', 'afternoon', 'evening']).default('none'),
    alternate: z.boolean().default(true),
    reminderMinutes: reminder,
    googleSync: z.boolean().default(false),
    locked: z.array(locked).max(60).default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Date(`${v.week}T00:00:00Z`).getUTCDay() !== 1)
      ctx.addIssue({ code: 'custom', path: ['week'], message: 'Chọn ngày Thứ Hai bắt đầu tuần.' });
    if (v.goals.reduce((n, g) => n + g.sessions, 0) > 60)
      ctx.addIssue({ code: 'custom', path: ['goals'], message: 'Tối đa60 buổi mỗi đề xuất.' });
    if (new Set(v.goals.map((g) => g.courseId)).size !== v.goals.length)
      ctx.addIssue({
        code: 'custom',
        path: ['goals'],
        message: 'Mỗi môn chỉ khai báo một mục tiêu.',
      });
  });
export const confirmInput = z
  .object({
    constraints: planInput,
    slots: z
      .array(
        sessionInput.safeExtend({
          locked: z.boolean().default(false),
          exceptionConfirmed: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(60),
  })
  .strict();
export const listInput = z
  .object({
    from: timestamp,
    to: timestamp,
    courseId: id.optional(),
    status: z.enum(['planned', 'completed', 'cancelled']).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .refine(
    (v) => new Date(v.to) > new Date(v.from) && new Date(v.to) - new Date(v.from) <= 42 * 86400000,
    { message: 'Khoảng lịch tối đa42 ngày.' },
  );
export const moveInput = z
  .object({ constraints: planInput, duration: z.number().int().min(1).max(1440) })
  .strict();
export const cursorInput = z.object({ cursor: id.optional() }).strict();
export const retryInput = revision.safeExtend({
  recreate: z.boolean().default(false),
  intent: z.enum(['sync', 'delete']).optional(),
});

const notificationId = z
  .string()
  .regex(/^[1-9][0-9]{0,19}:[a-f0-9]{24}:(before|start|missed|moved|cancelled)$/);
export const notificationParams = z.object({ id: notificationId });
export const notificationQuery = z.object({ cursor: notificationId.optional() }).strict();

export const pushInput = z
  .object({
    endpoint: z.url().max(2048),
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
        auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
      })
      .strict()
      .optional(),
  })
  .strict();

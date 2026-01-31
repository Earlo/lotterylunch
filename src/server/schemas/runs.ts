import { uuidSchema } from '@/server/schemas/common';
import { z } from 'zod';

const dateString = z.preprocess((val) => {
  if (typeof val === 'string' || val instanceof Date) return new Date(val);
}, z.date());

export const lotteryRunParamsSchema = z.object({
  lotteryId: uuidSchema,
  runId: uuidSchema.optional(),
});

export const runIdParamsSchema = z.object({
  runId: uuidSchema,
});

export const createRunSchema = z
  .object({
    enrollmentOpensAt: dateString,
    enrollmentClosesAt: dateString,
    matchingExecutesAt: dateString,
  })
  .refine((val) => val.enrollmentOpensAt <= val.enrollmentClosesAt, {
    message: 'enrollmentOpensAt must be before enrollmentClosesAt',
  })
  .refine((val) => val.enrollmentClosesAt <= val.matchingExecutesAt, {
    message: 'enrollmentClosesAt must be before matchingExecutesAt',
  });

export type CreateRunInput = z.infer<typeof createRunSchema>;

export const cancelRunSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .optional();

export type CancelRunInput = z.infer<typeof cancelRunSchema>;

import { z } from 'zod';

export const dayOfWeekSchema = z.enum([
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
]);

export const updateUserProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    image: z.string().url().optional(),
    area: z.string().trim().min(1).max(120).optional(),
    lunchTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm 24h format')
      .optional(),
    preferredDays: z.array(dayOfWeekSchema).optional(),
    lotteryFrequency: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Provide at least one field to update',
  });

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

import { z } from 'zod';

export const participationSchema = z.object({ participating: z.boolean() });

export const executeLotterySchema = z
  .object({
    windowStart: z.string().datetime(),
    windowEnd: z.string().datetime(),
    durationMinutes: z.number().int().min(15).max(180).default(60),
  })
  .superRefine((input, context) => {
    const duration = new Date(input.windowEnd).getTime() - new Date(input.windowStart).getTime();
    if (duration < input.durationMinutes * 60 * 1000 || duration > 31 * 24 * 60 * 60 * 1000) {
      context.addIssue({
        code: 'custom',
        path: ['windowEnd'],
        message: 'Choose a window between one lunch duration and 31 days',
      });
    }
  });

export type ExecuteLotteryInput = z.infer<typeof executeLotterySchema>;

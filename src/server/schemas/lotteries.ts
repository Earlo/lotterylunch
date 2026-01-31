import { uuidSchema } from '@/server/schemas/common';
import { z } from 'zod';

export const lotteryIdParamsSchema = z.object({
  lotteryId: uuidSchema,
});

export const groupLotteryParamsSchema = z.object({
  groupId: uuidSchema,
  lotteryId: uuidSchema.optional(),
});

export const lotteryScheduleSchema = z.record(z.string(), z.unknown());

export const createLotterySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    isActive: z.boolean().optional(),
    groupSizeMin: z.number().int().min(2).max(4).optional(),
    groupSizeMax: z.number().int().min(2).max(4).optional(),
    repeatWindowRuns: z.number().int().min(0).max(12).optional(),
    scheduleJson: lotteryScheduleSchema,
  })
  .refine(
    (val) => (val.groupSizeMin ?? 2) <= (val.groupSizeMax ?? 3),
    'groupSizeMin must be <= groupSizeMax',
  );

export type CreateLotteryInput = z.infer<typeof createLotterySchema>;

export const updateLotterySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
    groupSizeMin: z.number().int().min(2).max(4).optional(),
    groupSizeMax: z.number().int().min(2).max(4).optional(),
    repeatWindowRuns: z.number().int().min(0).max(12).optional(),
    scheduleJson: lotteryScheduleSchema.optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Provide at least one field to update',
  })
  .refine(
    (val) =>
      val.groupSizeMin === undefined ||
      val.groupSizeMax === undefined ||
      val.groupSizeMin <= val.groupSizeMax,
    'groupSizeMin must be <= groupSizeMax',
  );

export type UpdateLotteryInput = z.infer<typeof updateLotterySchema>;

import { z } from 'zod';

export const availabilityQuerySchema = z.object({
  groupId: z.string().uuid().optional(),
});

export const availabilitySlotSchema = z.object({
  groupId: z.string().uuid().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  recurringRule: z.string().optional(),
  type: z.enum(['coffee', 'lunch', 'afterwork']),
});

export const upsertAvailabilitySchema = z.array(availabilitySlotSchema).min(1);

export type AvailabilitySlotInput = z.infer<typeof availabilitySlotSchema>;

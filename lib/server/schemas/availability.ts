import { z } from 'zod';

export const availabilityQuerySchema = z.object({
  groupId: z.string().uuid().optional(),
});

export const availabilitySlotSchema = z
  .object({
    groupId: z.string().uuid().optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    recurringRule: z
      .string()
      .regex(
        /^(?:FREQ=WEEKLY;BYDAY=(?:SU|MO|TU|WE|TH|FR|SA)(?:;X-LL-DISABLED=1)?|X-LL-DAY-OFF=1)$/,
        'Use a weekly template or a day-off override',
      )
      .optional(),
    type: z.enum(['coffee', 'lunch', 'afterwork']),
  })
  .refine((slot) => Date.parse(slot.endAt) > Date.parse(slot.startAt), {
    message: 'End time must be after start time',
    path: ['endAt'],
  });

// PUT replaces the caller's entire availability, including grouped slots.
export const upsertAvailabilitySchema = z.array(availabilitySlotSchema).max(1000);

export type AvailabilitySlotInput = z.infer<typeof availabilitySlotSchema>;

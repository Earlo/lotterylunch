import { z } from 'zod';

export const updateUserProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    image: z.string().url().optional(),
    area: z.string().trim().min(1).max(120).optional(),
    shortNoticePreference: z
      .enum(['strict', 'standard', 'flexible'])
      .optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Provide at least one field to update',
  });

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

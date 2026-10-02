import { z } from 'zod';

export const updateUserProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).nullable().optional(),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions();
          return true;
        } catch {
          return false;
        }
      }, 'Use a valid IANA timezone')
      .optional(),
    image: z.string().url().nullable().optional(),
    area: z.string().trim().min(1).max(120).nullable().optional(),
    shortNoticePreference: z.enum(['strict', 'standard', 'flexible']).optional(),
    weekStartDay: z.enum(['monday', 'sunday']).optional(),
    clockFormat: z.enum(['h24', 'ampm']).optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Provide at least one field to update',
  });

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

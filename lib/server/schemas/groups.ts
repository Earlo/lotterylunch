import { nonEmptyString, uuidSchema, visibilitySchema } from '@/lib/server/schemas/common';
import { z } from 'zod';

const timezoneSchema = z
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
  }, 'Use a valid IANA timezone');

export const createGroupSchema = z.object({
  name: nonEmptyString.max(120),
  description: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(200).optional(),
  visibility: visibilitySchema.optional(),
  defaultGroupSize: z.number().int().min(2).max(8).optional(),
  timezone: timezoneSchema.optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const groupIdParamsSchema = z.object({
  groupId: uuidSchema,
});

export const updateGroupSchema = z
  .object({
    name: nonEmptyString.max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    location: z.string().trim().max(200).optional(),
    visibility: visibilitySchema.optional(),
    defaultGroupSize: z.number().int().min(2).max(8).optional(),
    timezone: timezoneSchema.optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Provide at least one field to update',
  });

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

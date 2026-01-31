import { z } from 'zod';

import { nonEmptyString, uuidSchema, visibilitySchema } from '@/server/schemas/common';

export const createGroupSchema = z.object({
  name: nonEmptyString.max(120),
  description: z.string().trim().max(2000).optional(),
  visibility: visibilitySchema.optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const groupIdParamsSchema = z.object({
  groupId: uuidSchema,
});

export const updateGroupSchema = z
  .object({
    name: nonEmptyString.max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    visibility: visibilitySchema.optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Provide at least one field to update',
  });

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

import { nonEmptyString, uuidSchema } from '@/server/schemas/common';
import { z } from 'zod';

export const groupIdParamsSchema = z.object({
  groupId: uuidSchema,
});

export const membershipIdParamsSchema = z.object({
  groupId: uuidSchema,
  membershipId: uuidSchema,
});

export const createMembershipSchema = z.object({
  userId: uuidSchema.optional(),
  role: z.enum(['owner', 'admin', 'member']).optional(),
  status: z.enum(['pending', 'active', 'suspended']).optional(),
  note: nonEmptyString.max(500).optional(),
});

export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;

export const updateMembershipSchema = z
  .object({
    role: z.enum(['owner', 'admin', 'member']).optional(),
    status: z.enum(['pending', 'active', 'suspended']).optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Provide at least one field to update',
  });

export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

import { uuidSchema } from '@/server/schemas/common';
import { z } from 'zod';

export const groupInviteParamsSchema = z.object({
  groupId: uuidSchema,
});

export const inviteTokenParamsSchema = z.object({
  token: z.string().min(12).max(128),
});

export const createGroupInviteSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).optional(),
  maxUses: z.number().int().min(1).max(50).optional(),
});

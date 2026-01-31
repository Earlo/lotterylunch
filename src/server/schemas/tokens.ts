import { uuidSchema } from '@/server/schemas/common';
import { z } from 'zod';

export const tokenIdParamsSchema = z.object({
  tokenId: uuidSchema,
});

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

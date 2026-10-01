import { stringIdSchema } from '@/lib/server/schemas/common';
import { z } from 'zod';

export const tokenIdParamsSchema = z.object({
  tokenId: stringIdSchema,
});

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

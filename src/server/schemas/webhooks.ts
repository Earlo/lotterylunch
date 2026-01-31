import { uuidSchema } from '@/server/schemas/common';
import { z } from 'zod';

export const webhookIdParamsSchema = z.object({
  webhookId: uuidSchema,
});

export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
});

export const updateWebhookSchema = z
  .object({
    url: z.string().url().optional(),
    events: z.array(z.string()).min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Provide at least one field to update',
  });

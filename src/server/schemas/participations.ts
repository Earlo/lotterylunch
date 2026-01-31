import { uuidSchema } from '@/server/schemas/common';
import { z } from 'zod';

export const runParticipationParamsSchema = z.object({
  runId: uuidSchema,
});

export const upsertParticipationSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'declined']),
});

export type UpsertParticipationInput = z.infer<
  typeof upsertParticipationSchema
>;

import { z } from 'zod';

import { uuidSchema } from '@/server/schemas/common';

export const runParticipationParamsSchema = z.object({
  runId: uuidSchema,
});

export const upsertParticipationSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'declined']),
});

export type UpsertParticipationInput = z.infer<typeof upsertParticipationSchema>;

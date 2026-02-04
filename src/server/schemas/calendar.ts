import { uuidSchema } from '@/server/schemas/common';
import { z } from 'zod';

export const calendarConnectionIdParams = z.object({
  connectionId: uuidSchema,
});

export const createCalendarConnectionSchema = z.object({
  provider: z.enum(['google', 'outlook', 'apple', 'ics']),
});

export const startGoogleCalendarConnectionSchema = z.object({
  returnTo: z.string().trim().max(200).optional(),
});

export const matchIdParams = z.object({
  matchId: uuidSchema,
});

export const calendarArtifactIdParams = z.object({
  artifactId: uuidSchema,
});

export const createCalendarArtifactSchema = z.object({
  provider: z.enum(['google', 'outlook', 'apple', 'ics']).optional(),
  title: z.string().trim().min(1).max(200),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().trim().min(1).max(80).optional(),
  location: z.string().trim().max(200).optional(),
  meetingUrl: z.string().url().optional(),
  notes: z.string().max(500).optional(),
});

export type CreateCalendarArtifactInput = z.infer<
  typeof createCalendarArtifactSchema
>;

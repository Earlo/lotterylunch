import { apiFetch } from '@/lib/webui/api/client';
import { z } from 'zod';

const lunchMatchSchema = z.object({
  id: z.string(),
  memberIds: z.array(z.string()),
  scheduledFor: z.string(),
  scheduledUntil: z.string(),
});

const lunchRunSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  participantIds: z.array(z.string()),
  unmatchedUserIds: z.array(z.string()),
  matches: z.array(lunchMatchSchema),
});

export type LunchRun = z.infer<typeof lunchRunSchema>;
export type LunchMatch = z.infer<typeof lunchMatchSchema>;

export async function fetchLunchRuns(groupId: string, signal?: AbortSignal): Promise<LunchRun[]> {
  return lunchRunSchema
    .array()
    .parse(await apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}/runs`, signal ? { signal } : {}));
}

export async function executeLunchLottery(
  groupId: string,
  input: { windowStart: string; windowEnd: string; durationMinutes: number },
): Promise<LunchRun> {
  return lunchRunSchema.parse(
    await apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}/runs`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function setLunchParticipation(groupId: string, participating: boolean) {
  return z.object({ participating: z.boolean() }).parse(
    await apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}/participation`, {
      method: 'PATCH',
      body: JSON.stringify({ participating }),
    }),
  );
}

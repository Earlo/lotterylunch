import { apiFetch } from '@/lib/webui/api/client';
import { groupDetailSchema, groupSummarySchema } from '@/lib/webui/api/schemas';
import type { GroupDetail, GroupSummary } from '@/lib/webui/api/types';

export async function fetchGroups(signal?: AbortSignal): Promise<GroupSummary[]> {
  return groupSummarySchema.array().parse(await apiFetch('/api/v1/groups', { signal: signal ?? null }));
}

export async function fetchGroup(groupId: string, signal?: AbortSignal): Promise<GroupDetail> {
  return groupDetailSchema.parse(
    await apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}`, { signal: signal ?? null }),
  );
}

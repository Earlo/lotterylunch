import { apiFetch } from '@/webui/api/client';
import type { GroupDetail, GroupSummary } from '@/webui/api/types';

export async function fetchGroups(
  signal?: AbortSignal,
): Promise<GroupSummary[]> {
  return apiFetch<GroupSummary[]>('/api/v1/groups', { signal });
}

export async function fetchGroup(
  groupId: string,
  signal?: AbortSignal,
): Promise<GroupDetail> {
  return apiFetch<GroupDetail>(
    `/api/v1/groups/${encodeURIComponent(groupId)}`,
    { signal },
  );
}

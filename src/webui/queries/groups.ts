import { apiFetch } from '@/webui/api/client';
import type { GroupDetail, GroupSummary } from '@/webui/api/types';

export async function fetchGroups(): Promise<GroupSummary[]> {
  return apiFetch<GroupSummary[]>('/api/v1/groups');
}

export async function fetchGroup(groupId: string): Promise<GroupDetail> {
  return apiFetch<GroupDetail>(`/api/v1/groups/${groupId}`);
}

import { apiFetch } from '@/webui/api/client';
import type { GroupSummary } from '@/webui/api/types';

export async function fetchGroups(): Promise<GroupSummary[]> {
  return apiFetch<GroupSummary[]>('/api/v1/groups');
}

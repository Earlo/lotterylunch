import { apiFetch } from '@/webui/api/client';
import type { Membership } from '@/webui/api/types';

export async function fetchMemberships(
  groupId: string,
  signal?: AbortSignal,
): Promise<Membership[]> {
  return apiFetch<Membership[]>(
    `/api/v1/groups/${encodeURIComponent(groupId)}/memberships`,
    { signal },
  );
}

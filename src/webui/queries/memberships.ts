import { apiFetch } from '@/webui/api/client';
import type { Membership } from '@/webui/api/types';

export async function fetchMemberships(groupId: string): Promise<Membership[]> {
  return apiFetch<Membership[]>(`/api/v1/groups/${groupId}/memberships`);
}

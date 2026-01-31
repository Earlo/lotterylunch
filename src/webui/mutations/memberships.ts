import { apiFetch } from '@/webui/api/client';
import type { Membership } from '@/webui/api/types';

export async function updateMembership(
  groupId: string,
  membershipId: string,
  input: Partial<Pick<Membership, 'role' | 'status'>>,
): Promise<Membership> {
  return apiFetch<Membership>(
    `/api/v1/groups/${groupId}/memberships/${membershipId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

export async function removeMembership(
  groupId: string,
  membershipId: string,
): Promise<{ id: string; deleted: true }> {
  return apiFetch<{ id: string; deleted: true }>(
    `/api/v1/groups/${groupId}/memberships/${membershipId}`,
    { method: 'DELETE' },
  );
}

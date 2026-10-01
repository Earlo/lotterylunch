import { apiFetch } from '@/lib/webui/api/client';
import { membershipSchema, removedMembershipSchema } from '@/lib/webui/api/schemas';
import type { Membership } from '@/lib/webui/api/types';

export async function updateMembership(
  groupId: string,
  membershipId: string,
  input: Partial<Pick<Membership, 'role' | 'status'>>,
): Promise<Membership> {
  return membershipSchema.parse(
    await apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}/memberships/${encodeURIComponent(membershipId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

export async function removeMembership(groupId: string, membershipId: string): Promise<{ id: string; deleted: true }> {
  return removedMembershipSchema.parse(
    await apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}/memberships/${encodeURIComponent(membershipId)}`, {
      method: 'DELETE',
    }),
  );
}

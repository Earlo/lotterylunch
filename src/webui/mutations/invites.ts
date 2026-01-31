import { apiFetch } from '@/webui/api/client';
import type { GroupInvite } from '@/webui/api/types';

export async function createGroupInvite(
  groupId: string,
  input?: { expiresInDays?: number; maxUses?: number },
): Promise<GroupInvite> {
  return apiFetch<GroupInvite>(`/api/v1/groups/${groupId}/invites`, {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
  });
}

export async function acceptInvite(token: string) {
  return apiFetch(`/api/v1/invites/${token}/accept`, { method: 'POST' });
}

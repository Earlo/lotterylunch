import { apiFetch } from '@/lib/webui/api/client';
import { groupInviteSchema } from '@/lib/webui/api/schemas';
import type { GroupInvite } from '@/lib/webui/api/types';

export async function createGroupInvite(
  groupId: string,
  input?: { expiresInDays?: number; maxUses?: number },
): Promise<GroupInvite> {
  return groupInviteSchema.parse(
    await apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}/invites`, {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    }),
  );
}

export async function acceptInvite(token: string) {
  return apiFetch(`/api/v1/invites/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
  });
}

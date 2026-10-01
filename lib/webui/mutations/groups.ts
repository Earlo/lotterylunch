import { apiFetch } from '@/lib/webui/api/client';
import { groupDetailSchema } from '@/lib/webui/api/schemas';
import type { GroupDetail } from '@/lib/webui/api/types';

export type CreateGroupInput = {
  name: string;
  description?: string;
  location?: string;
  visibility?: 'open' | 'invite_only';
};

export async function createGroup(input: CreateGroupInput): Promise<GroupDetail> {
  return groupDetailSchema.parse(
    await apiFetch('/api/v1/groups', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function joinGroup(groupId: string): Promise<void> {
  await apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}/memberships`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

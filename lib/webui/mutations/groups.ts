import { apiFetch } from '@/lib/webui/api/client';
import { groupDetailSchema } from '@/lib/webui/api/schemas';
import type { GroupDetail } from '@/lib/webui/api/types';

export type CreateGroupInput = {
  name: string;
  description?: string;
  location?: string;
  visibility?: 'open' | 'invite_only';
  defaultGroupSize?: number;
  timezone?: string;
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

export async function updateGroup(groupId: string, input: Partial<CreateGroupInput>): Promise<GroupDetail> {
  return groupDetailSchema.parse(
    await apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteGroup(groupId: string): Promise<void> {
  await apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' });
}

export async function transferGroupOwnership(groupId: string, userId: string): Promise<void> {
  await apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}/ownership`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

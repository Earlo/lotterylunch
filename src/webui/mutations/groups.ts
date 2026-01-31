import { apiFetch } from '@/webui/api/client';
import type { GroupDetail } from '@/webui/api/types';

export type CreateGroupInput = {
  name: string;
  description?: string;
  visibility?: 'open' | 'invite_only';
};

export async function createGroup(input: CreateGroupInput): Promise<GroupDetail> {
  return apiFetch<GroupDetail>('/api/v1/groups', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function joinGroup(groupId: string): Promise<void> {
  await apiFetch(`/api/v1/groups/${groupId}/memberships`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

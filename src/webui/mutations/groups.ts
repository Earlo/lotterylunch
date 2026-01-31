import { apiFetch } from '@/webui/api/client';
import type { GroupDetail } from '@/webui/api/types';

export type CreateGroupInput = {
  name: string;
  description?: string;
  visibility?: 'public' | 'private';
};

export async function createGroup(input: CreateGroupInput): Promise<GroupDetail> {
  return apiFetch<GroupDetail>('/api/v1/groups', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

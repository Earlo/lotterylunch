import { apiFetch } from '@/lib/webui/api/client';
import { membershipSchema } from '@/lib/webui/api/schemas';
import type { Membership } from '@/lib/webui/api/types';

export async function fetchMemberships(groupId: string, signal?: AbortSignal): Promise<Membership[]> {
  return membershipSchema
    .array()
    .parse(await apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}/memberships`, { signal: signal ?? null }));
}

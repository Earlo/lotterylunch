import { apiFetch } from '@/lib/webui/api/client';
import { userProfileSchema } from '@/lib/webui/api/schemas';
import type { UserProfile } from '@/lib/webui/api/types';

export async function fetchUserProfile(signal?: AbortSignal): Promise<UserProfile> {
  return userProfileSchema.parse(await apiFetch('/api/v1/users/me', { signal: signal ?? null }));
}

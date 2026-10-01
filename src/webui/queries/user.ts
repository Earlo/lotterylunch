import { apiFetch } from '@/webui/api/client';
import type { UserProfile } from '@/webui/api/types';

export async function fetchUserProfile(
  signal?: AbortSignal,
): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/v1/users/me', { signal });
}

import { apiFetch } from '@/webui/api/client';
import type { UserProfile } from '@/webui/api/types';

export async function fetchUserProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/v1/users/me');
}

import { apiFetch } from '@/webui/api/client';
import type { UserProfile } from '@/webui/api/types';

export type UpdateUserProfileInput = Partial<
  Pick<
    UserProfile,
    | 'name'
    | 'timezone'
    | 'image'
    | 'area'
    | 'shortNoticePreference'
    | 'weekStartDay'
    | 'clockFormat'
  >
>;

export async function updateUserProfile(
  input: UpdateUserProfileInput,
): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/v1/users/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

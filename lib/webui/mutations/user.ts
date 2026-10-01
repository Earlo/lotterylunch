import { apiFetch } from '@/lib/webui/api/client';
import { userProfileSchema } from '@/lib/webui/api/schemas';
import type { UserProfile } from '@/lib/webui/api/types';

export type UpdateUserProfileInput = Partial<
  Pick<UserProfile, 'name' | 'timezone' | 'image' | 'area' | 'shortNoticePreference' | 'weekStartDay' | 'clockFormat'>
>;

export async function updateUserProfile(input: UpdateUserProfileInput): Promise<UserProfile> {
  return userProfileSchema.parse(
    await apiFetch('/api/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

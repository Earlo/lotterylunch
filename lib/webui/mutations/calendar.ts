import { apiFetch } from '@/lib/webui/api/client';
import { googleCalendarRedirectSchema } from '@/lib/webui/api/schemas';
import type { AvailabilitySlot } from '@/lib/webui/api/types';

export async function startGoogleCalendarConnection(returnTo?: string) {
  return googleCalendarRedirectSchema.parse(
    await apiFetch('/api/v1/calendar/connections/google', {
      method: 'POST',
      body: JSON.stringify({ returnTo }),
    }),
  );
}

export async function deleteCalendarConnection(connectionId: string) {
  return apiFetch(`/api/v1/calendar/connections/${encodeURIComponent(connectionId)}`, {
    method: 'DELETE',
  });
}

export async function updateAvailability(slots: Array<Omit<AvailabilitySlot, 'id' | 'userId'>>) {
  return apiFetch('/api/v1/availability', {
    method: 'PUT',
    body: JSON.stringify(slots),
  });
}

export async function createCalendarArtifact(
  matchId: string,
  input: {
    provider?: 'google' | 'ics';
    title: string;
    startsAt: string;
    endsAt: string;
    timezone?: string;
    location?: string;
    meetingUrl?: string;
    notes?: string;
  },
) {
  return apiFetch(`/api/v1/matches/${encodeURIComponent(matchId)}/calendar-artifacts`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

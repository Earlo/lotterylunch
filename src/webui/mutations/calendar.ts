import { apiFetch } from '@/webui/api/client';
import type { AvailabilitySlot, CalendarConnection } from '@/webui/api/types';

export async function createCalendarConnection(
  provider: CalendarConnection['provider'],
) {
  return apiFetch<CalendarConnection>('/api/v1/calendar/connections', {
    method: 'POST',
    body: JSON.stringify({ provider }),
  });
}

export async function deleteCalendarConnection(connectionId: string) {
  return apiFetch(`/api/v1/calendar/connections/${connectionId}`, {
    method: 'DELETE',
  });
}

export async function updateAvailability(
  slots: Array<Omit<AvailabilitySlot, 'id' | 'userId'>>,
) {
  return apiFetch('/api/v1/availability', {
    method: 'PUT',
    body: JSON.stringify(slots),
  });
}

export async function createCalendarArtifact(
  matchId: string,
  input: {
    title: string;
    startsAt: string;
    endsAt: string;
    timezone?: string;
    location?: string;
    meetingUrl?: string;
    notes?: string;
  },
) {
  return apiFetch(`/api/v1/matches/${matchId}/calendar-artifacts`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

import { apiFetch } from '@/lib/webui/api/client';
import { availabilitySlotSchema, calendarConnectionSchema } from '@/lib/webui/api/schemas';
import type { AvailabilitySlot, CalendarConnection } from '@/lib/webui/api/types';

export async function fetchCalendarConnections(signal?: AbortSignal): Promise<CalendarConnection[]> {
  return calendarConnectionSchema.array().parse(
    await apiFetch('/api/v1/calendar/connections', {
      signal: signal ?? null,
    }),
  );
}

export async function fetchAvailability(groupId?: string, signal?: AbortSignal): Promise<AvailabilitySlot[]> {
  const url = groupId ? `/api/v1/availability?groupId=${encodeURIComponent(groupId)}` : '/api/v1/availability';
  return availabilitySlotSchema.array().parse(await apiFetch(url, { signal: signal ?? null }));
}

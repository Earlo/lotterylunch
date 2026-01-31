import { apiFetch } from '@/webui/api/client';
import type { AvailabilitySlot, CalendarConnection } from '@/webui/api/types';

export async function fetchCalendarConnections(): Promise<
  CalendarConnection[]
> {
  return apiFetch<CalendarConnection[]>('/api/v1/calendar/connections');
}

export async function fetchAvailability(
  groupId?: string,
): Promise<AvailabilitySlot[]> {
  const url = groupId
    ? `/api/v1/availability?groupId=${encodeURIComponent(groupId)}`
    : '/api/v1/availability';
  return apiFetch<AvailabilitySlot[]>(url);
}

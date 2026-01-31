import type { CreateCalendarArtifactInput } from '@/server/schemas/calendar';

function escapeText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,');
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function buildIcsEvent(
  input: CreateCalendarArtifactInput & { uid: string; organizer?: string },
) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LotteryLunch//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${formatDateTime(new Date().toISOString())}`,
    `DTSTART:${formatDateTime(input.startsAt)}`,
    `DTEND:${formatDateTime(input.endsAt)}`,
    `SUMMARY:${escapeText(input.title)}`,
  ];

  if (input.location) {
    lines.push(`LOCATION:${escapeText(input.location)}`);
  }

  if (input.meetingUrl) {
    lines.push(`URL:${escapeText(input.meetingUrl)}`);
  }

  if (input.notes) {
    lines.push(`DESCRIPTION:${escapeText(input.notes)}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

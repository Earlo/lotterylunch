import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIcsEvent } from '@/server/integrations/calendar/ics';

test('calendar exports keep UTC timestamps and escape user-provided calendar text', () => {
  const calendar = buildIcsEvent({
    uid: 'event-1',
    title: 'Lunch; café, meet\\eat\r\nBEGIN:VEVENT',
    startsAt: '2026-10-01T12:00:00.000Z',
    endsAt: '2026-10-01T13:00:00.000Z',
    location: 'Office; floor 2',
    notes: 'Line 1\nLine 2',
  });

  assert.ok(calendar.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0'));
  assert.ok(calendar.endsWith('END:VEVENT\r\nEND:VCALENDAR'));
  assert.ok(calendar.includes('DTSTART:20261001T120000Z\r\n'));
  assert.ok(calendar.includes('DTEND:20261001T130000Z\r\n'));
  assert.ok(
    calendar.includes(
      'SUMMARY:Lunch\\; café\\, meet\\\\eat\\nBEGIN:VEVENT\r\n',
    ),
  );
  assert.ok(calendar.includes('LOCATION:Office\\; floor 2\r\n'));
  assert.ok(calendar.includes('DESCRIPTION:Line 1\\nLine 2\r\n'));
  assert.equal(
    calendar.split('\r\n').filter((line) => line === 'BEGIN:VEVENT').length,
    1,
  );
});

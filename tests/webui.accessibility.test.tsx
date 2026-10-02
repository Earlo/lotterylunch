import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GroupsClient } from '../components/groups/GroupsClient.tsx';
import { AvailabilitySettings } from '../components/settings/AvailabilitySettings.tsx';
import { PreferencesSettings } from '../components/settings/PreferencesSettings.tsx';
import { UserScheduleCalendar } from '../components/settings/UserScheduleCalendar.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { Notice } from '../components/ui/Notice.tsx';

function noop() {}

await test('availability remains read-only until existing preferred times have loaded', () => {
  const html = renderToStaticMarkup(<AvailabilitySettings />);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Save availability<\/button>/);
  assert.match(html, /role="status"[^>]*>Loading preferred times/);
  assert.doesNotMatch(html, /All changes saved/);
  assert.doesNotMatch(html, /type="time"/);
});

await test('preferences cannot save default values while the profile is loading', () => {
  const html = renderToStaticMarkup(<PreferencesSettings />);
  assert.match(html, /<fieldset[^>]*disabled=""/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Save preferences<\/button>/);
  assert.match(html, /role="status"[^>]*>Loading preferences/);
  assert.doesNotMatch(html, /Current preference/);
});

await test('group creation, joining, and invite acceptance have native forms and accessible inputs', () => {
  const html = renderToStaticMarkup(<GroupsClient />);
  assert.equal((html.match(/<form\b/g) ?? []).length, 3);
  assert.equal((html.match(/type="submit"/g) ?? []).length, 3);
  for (const label of ['Group name', 'Description (optional)', 'Location (optional)', 'Group ID', 'Invite token']) {
    assert.ok(html.includes(`aria-label="${label}"`), `${label} needs an accessible name`);
  }
});

await test('schedule slots can be created through labeled native controls without drawing', () => {
  const html = renderToStaticMarkup(
    <UserScheduleCalendar
      slots={[]}
      groups={[]}
      weekStartDay="monday"
      clockFormat="h24"
      onCreateWeeklySlot={noop}
      onCreateWeeklySlotForAllWeekdays={noop}
      onDeleteSlot={noop}
      onCreateDaySlot={noop}
      onDisableWeeklySlotForDay={noop}
      onEnableWeeklySlotForDay={noop}
    />,
  );
  assert.match(html, /<form\b/);
  assert.match(html, /<label[^>]*>Start time<input[^>]*type="time"/);
  assert.match(html, /<label[^>]*>End time<input[^>]*type="time"/);
  assert.match(html, /type="submit"[^>]*>Add slot<\/button>/);
  assert.match(html, /aria-label="Previous month"/);
  assert.match(html, /aria-label="Next month"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-current="date"/);
  assert.equal((html.match(/each week<\/option>/g) ?? []).length, 8);
});

await test('feedback announces status messages and errors with their appropriate roles', () => {
  assert.match(renderToStaticMarkup(<Notice>Saved</Notice>), /role="status"/);
  assert.match(renderToStaticMarkup(<Notice role="alert">Failed</Notice>), /role="alert"/);
});

await test('weekly schedule labels use the profile zone when it differs from the browser zone', () => {
  const html = renderToStaticMarkup(
    <UserScheduleCalendar
      slots={[
        {
          id: 'weekly-profile-zone',
          userId: 'me',
          type: 'lunch',
          startAt: '2026-10-05T09:00:00Z',
          endAt: '2026-10-05T10:00:00Z',
          recurringRule: 'FREQ=WEEKLY;BYDAY=MO',
        },
      ]}
      groups={[]}
      timezone="Europe/Helsinki"
      weekStartDay="monday"
      clockFormat="ampm"
      onCreateWeeklySlot={noop}
      onCreateWeeklySlotForAllWeekdays={noop}
      onDeleteSlot={noop}
      onCreateDaySlot={noop}
      onDisableWeeklySlotForDay={noop}
      onEnableWeeklySlotForDay={noop}
    />,
  );
  assert.match(html, /12:00 PM - 1:00 PM/);
});

await test('shared controls resolve conflicting size and caller utility classes', () => {
  const button = renderToStaticMarkup(
    <Button size="sm" className="px-8">
      Save
    </Button>,
  );
  assert.match(button, /class="[^"]*\bpx-8\b/);
  assert.match(button, /class="[^"]*\bpy-1\.5\b/);
  assert.doesNotMatch(button, /\bpx-(?:3|5)\b|\bpy-2\b/);

  const input = renderToStaticMarkup(<Input className="w-auto px-2" aria-label="Name" />);
  assert.match(input, /class="[^"]*\bw-auto\b/);
  assert.match(input, /class="[^"]*\bpx-2\b/);
  assert.doesNotMatch(input, /\bw-full\b|\bpx-4\b/);
});

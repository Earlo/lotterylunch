import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { GroupsClient } from '../src/webui/components/groups/GroupsClient.tsx';
import { AvailabilitySettings } from '../src/webui/components/settings/AvailabilitySettings.tsx';
import { PreferencesSettings } from '../src/webui/components/settings/PreferencesSettings.tsx';
import { UserScheduleCalendar } from '../src/webui/components/settings/UserScheduleCalendar.tsx';
import { Notice } from '../src/webui/components/ui/Notice.tsx';

test('availability remains read-only until existing preferred times have loaded', () => {
  const html = renderToStaticMarkup(createElement(AvailabilitySettings));
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*>Save availability<\/button>/,
  );
  assert.match(html, /role="status"[^>]*>Loading preferred times/);
  assert.doesNotMatch(html, /All changes saved/);
  assert.doesNotMatch(html, /type="time"/);
});

test('preferences cannot save default values while the profile is loading', () => {
  const html = renderToStaticMarkup(createElement(PreferencesSettings));
  assert.match(html, /<fieldset[^>]*disabled=""/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Save preferences<\/button>/);
  assert.match(html, /role="status"[^>]*>Loading preferences/);
  assert.doesNotMatch(html, /Current preference/);
});

test('group creation, joining, and invite acceptance have native forms and accessible inputs', () => {
  const html = renderToStaticMarkup(createElement(GroupsClient));
  assert.equal((html.match(/<form\b/g) ?? []).length, 3);
  assert.equal((html.match(/type="submit"/g) ?? []).length, 3);
  for (const label of [
    'Group name',
    'Description (optional)',
    'Location (optional)',
    'Group ID',
    'Invite token',
  ]) {
    assert.ok(
      html.includes(`aria-label="${label}"`),
      `${label} needs an accessible name`,
    );
  }
});

test('schedule slots can be created through labeled native controls without drawing', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(
    createElement(UserScheduleCalendar, {
      slots: [],
      groups: [],
      weekStartDay: 'monday',
      clockFormat: 'h24',
      onCreateWeeklySlot: noop,
      onCreateWeeklySlotForAllWeekdays: noop,
      onDeleteSlot: noop,
      onCreateDaySlot: noop,
      onDisableWeeklySlotForDay: noop,
      onEnableWeeklySlotForDay: noop,
    }),
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

test('feedback announces status messages and errors with their appropriate roles', () => {
  assert.match(
    renderToStaticMarkup(createElement(Notice, null, 'Saved')),
    /role="status"/,
  );
  assert.match(
    renderToStaticMarkup(createElement(Notice, { role: 'alert' }, 'Failed')),
    /role="alert"/,
  );
});

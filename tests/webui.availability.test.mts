import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDayOffOverrideRule,
  buildDaySlotSignature,
  buildWeeklyTemplateRule,
  isDayOffOverrideSlot,
  isOneOffAvailabilitySlot,
  isWeeklyTemplateSlot,
  minutesSinceMidnight,
  parseWeeklyTemplateRule,
  rangesOverlap,
  slotEndMinute,
  toDateKeyFromIso,
  toIsoForDateKeyAndMinute,
} from '../lib/webui/weeklyTemplateUtils.ts';

type DaySlotInput = Parameters<typeof buildDaySlotSignature>[0];

await test('weekly templates round-trip every weekday and enabled state', () => {
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (const enabled of [true, false]) {
      assert.deepEqual(parseWeeklyTemplateRule(buildWeeklyTemplateRule(weekday, enabled)), { weekday, enabled });
    }
  }
  assert.equal(buildWeeklyTemplateRule(-1), 'FREQ=WEEKLY;BYDAY=SU');
  assert.equal(buildWeeklyTemplateRule(9), 'FREQ=WEEKLY;BYDAY=SA');
  assert.equal(buildWeeklyTemplateRule(1.5), 'FREQ=WEEKLY;BYDAY=MO');
  assert.equal(buildWeeklyTemplateRule(Number.NaN), 'FREQ=WEEKLY;BYDAY=SU');
});

await test('recurrence classification requires exact tokens', () => {
  for (const rule of [null, '', 'FREQ=DAILY;BYDAY=MO', 'FREQ=WEEKLY;BYDAY=XX', 'FREQ=WEEKLY_EXTRA;BYDAY=MO']) {
    assert.equal(parseWeeklyTemplateRule(rule), null);
  }
  assert.deepEqual(parseWeeklyTemplateRule('FREQ=WEEKLY;BYDAY=MO;X-LL-DISABLED=10'), { weekday: 1, enabled: true });
  const weekly = { recurringRule: buildWeeklyTemplateRule(1) };
  const dayOff = { recurringRule: buildDayOffOverrideRule() };
  const oneOff = { recurringRule: null };
  assert.equal(isWeeklyTemplateSlot(weekly), true);
  assert.equal(isOneOffAvailabilitySlot(weekly), false);
  assert.equal(isDayOffOverrideSlot(dayOff), true);
  assert.equal(isOneOffAvailabilitySlot(dayOff), false);
  assert.equal(isOneOffAvailabilitySlot(oneOff), true);
  assert.equal(isDayOffOverrideSlot({ recurringRule: 'X-LL-DAY-OFF=10' }), false);
});

await test('availability overlap excludes adjacent ranges and matches contained ranges', () => {
  assert.equal(rangesOverlap(720, 780, 780, 840), false);
  assert.equal(rangesOverlap(720, 780, 779, 840), true);
  assert.equal(rangesOverlap(720, 840, 750, 780), true);
  assert.equal(rangesOverlap(750, 780, 720, 840), true);
  assert.equal(rangesOverlap(720, 780, 600, 660), false);
});

await test('day overrides distinguish dates, times, meeting types, and groups', () => {
  const slot: DaySlotInput = {
    dateKey: '2026-10-01',
    startMinute: 720,
    endMinute: 780,
    type: 'lunch',
  };
  const signature = buildDaySlotSignature(slot);
  assert.equal(signature, buildDaySlotSignature({ ...slot, groupId: null }));
  const changes: Partial<DaySlotInput>[] = [
    { dateKey: '2026-10-02' },
    { startMinute: 750 },
    { endMinute: 810 },
    { type: 'coffee' },
    { groupId: 'group-1' },
  ];
  for (const change of changes) {
    assert.notEqual(signature, buildDaySlotSignature({ ...slot, ...change }));
  }
});

await test('availability editing uses the profile time zone for local dates and saved instants', () => {
  const timezone = 'Europe/Helsinki';
  assert.equal(toDateKeyFromIso('2026-10-01T22:30:00Z', timezone), '2026-10-02');
  assert.equal(minutesSinceMidnight('2026-10-02T09:00:00Z', timezone), 720);
  assert.equal(toIsoForDateKeyAndMinute('2026-10-02', 720, timezone), '2026-10-02T09:00:00.000Z');
  assert.equal(toIsoForDateKeyAndMinute('2026-10-02', 720, 'America/New_York'), '2026-10-02T16:00:00.000Z');
  assert.equal(toIsoForDateKeyAndMinute('2026-10-02', 1440, timezone), '2026-10-02T21:00:00.000Z');
  assert.equal(slotEndMinute('2026-10-02T20:00:00Z', '2026-10-02T21:00:00Z', timezone), 1440);
});

await test('availability editing rejects nonexistent local times and resolves repeated times consistently', () => {
  assert.equal(toIsoForDateKeyAndMinute('2026-03-08', 150, 'America/New_York'), null);
  assert.equal(toIsoForDateKeyAndMinute('2026-11-01', 90, 'America/New_York'), '2026-11-01T05:30:00.000Z');
  assert.equal(toIsoForDateKeyAndMinute('2026-03-29', 210, 'Europe/Helsinki'), null);
});

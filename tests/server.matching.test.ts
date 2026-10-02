import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatches } from '@/lib/server/domain/matching';
import {
  expandLunchAvailability,
  scheduleLunches,
  type LunchParticipant,
} from '@/lib/server/domain/matching/availability';
import { zonedDateParts, zonedDay, zonedWallTimeToInstant } from '@/lib/zonedDateTime';

function participant(id: string, start: string, end: string): LunchParticipant {
  return {
    id,
    timezone: 'UTC',
    slots: [{ startAt: new Date(start), endAt: new Date(end), recurringRule: null, type: 'lunch' }],
  };
}

void test('seeded matching preserves membership uniqueness and accounts for odd group sizes', () => {
  for (let count = 0; count <= 20; count += 1) {
    const ids = Array.from({ length: count }, (_, index) => `user-${index}`);
    for (const maxSize of [2, 3, 8]) {
      const input = {
        participantIds: ids,
        groupSizeMin: 2,
        groupSizeMax: maxSize,
        recentMatches: [],
        seed: 'reproducible',
      };
      const result = createMatches(input);
      assert.deepEqual(createMatches(input), result);
      assert.ok(result.matches.every((group) => group.length >= 2 && group.length <= maxSize));
      const assigned = [...result.matches.flat(), ...result.unmatched];
      assert.equal(new Set(assigned).size, count);
      assert.deepEqual(new Set(assigned), new Set(ids));
    }
  }
});

void test('matching and scheduling assign duplicate participant IDs only once', () => {
  const drawn = createMatches({
    participantIds: ['a', 'a', 'b'],
    groupSizeMin: 2,
    groupSizeMax: 3,
    recentMatches: [],
    seed: 'duplicates',
  });
  assert.deepEqual(drawn.matches[0]?.toSorted(), ['a', 'b']);
  assert.deepEqual(drawn.unmatched, []);
  const a = participant('a', '2026-10-02T12:00:00Z', '2026-10-02T13:00:00Z');
  const result = scheduleLunches({
    participants: [a, a, participant('b', '2026-10-02T12:00:00Z', '2026-10-02T13:00:00Z')],
    windowStart: new Date('2026-10-02T12:00:00Z'),
    windowEnd: new Date('2026-10-02T13:00:00Z'),
    durationMinutes: 60,
    maxGroupSize: 3,
    recentMatches: [],
    existingBookings: [],
    seed: 'duplicates',
  });
  assert.deepEqual(result.matches[0]?.memberIds.toSorted(), ['a', 'b']);
  assert.deepEqual(result.unmatchedUserIds, []);
});

void test('unavoidable recent pairings retain the attempt with fewer repeated pairs', () => {
  const result = createMatches({
    participantIds: ['a', 'b', 'c', 'd'],
    groupSizeMin: 2,
    groupSizeMax: 2,
    recentMatches: [
      ['a', 'b'],
      ['a', 'c'],
      ['a', 'd'],
      ['b', 'c'],
    ],
    seed: '1',
  });
  assert.equal(result.matches.length, 2);
  assert.ok(!result.matches.some((group) => group.includes('b') && group.includes('c')));
});

void test('scheduling requires shared duration and avoids app bookings while leaving unavailable members unmatched', () => {
  const input = {
    participants: [
      participant('a', '2026-10-02T12:00:00Z', '2026-10-02T15:00:00Z'),
      participant('b', '2026-10-02T12:30:00Z', '2026-10-02T15:00:00Z'),
      participant('c', '2026-10-02T15:30:00Z', '2026-10-02T16:00:00Z'),
    ],
    windowStart: new Date('2026-10-02T12:00:00Z'),
    windowEnd: new Date('2026-10-02T17:00:00Z'),
    durationMinutes: 60,
    maxGroupSize: 2,
    recentMatches: [],
    existingBookings: [
      { memberIds: ['a'], start: new Date('2026-10-02T12:00:00Z'), end: new Date('2026-10-02T13:00:00Z') },
    ],
    seed: 'test',
  };
  const result = scheduleLunches(input);
  assert.equal(result.matches.length, 1);
  assert.deepEqual(new Set(result.matches[0]?.memberIds), new Set(['a', 'b']));
  assert.equal(result.matches[0]?.scheduledFor.toISOString(), '2026-10-02T13:00:00.000Z');
  assert.equal(result.matches[0]?.scheduledUntil.toISOString(), '2026-10-02T14:00:00.000Z');
  assert.deepEqual(result.unmatchedUserIds, ['c']);
});

void test('weekly lunch expansion follows profile timezone across daylight saving changes', () => {
  const user = participant('a', '2026-10-19T09:00:00Z', '2026-10-19T10:00:00Z');
  user.timezone = 'Europe/Helsinki';
  user.slots[0]!.recurringRule = 'FREQ=WEEKLY;BYDAY=MO';
  const result = expandLunchAvailability(user, new Date('2026-10-18T00:00:00Z'), new Date('2026-10-27T00:00:00Z'));
  assert.deepEqual(
    result.map((slot) => new Date(slot.start).toISOString()),
    ['2026-10-19T09:00:00.000Z', '2026-10-26T10:00:00.000Z'],
  );
  assert.ok(result.every((slot) => slot.end - slot.start === 60 * 60 * 1000));
});

void test('weekly availability can begin multiple days before the draw window', () => {
  const user = participant('a', '2026-09-27T22:00:00Z', '2026-09-29T02:00:00Z');
  user.slots[0]!.recurringRule = 'FREQ=WEEKLY;BYDAY=SU';
  const result = expandLunchAvailability(user, new Date('2026-10-06T00:00:00Z'), new Date('2026-10-06T04:00:00Z'));
  assert.deepEqual(result, [{ start: Date.parse('2026-10-06T00:00:00Z'), end: Date.parse('2026-10-06T02:00:00Z') }]);
});

void test('overnight weekly slots keep local times and elapsed durations across DST', () => {
  const user = participant('a', '2026-10-23T20:30:00Z', '2026-10-24T01:30:00Z');
  user.timezone = 'Europe/Helsinki';
  user.slots[0]!.recurringRule = 'FREQ=WEEKLY;BYDAY=SA';
  const result = expandLunchAvailability(user, new Date('2026-10-24T00:00:00Z'), new Date('2026-10-26T00:00:00Z'));
  assert.deepEqual(result, [{ start: Date.parse('2026-10-24T20:30:00Z'), end: Date.parse('2026-10-25T02:30:00Z') }]);
});

void test('recurrences skip nonexistent DST wall times and resolve repeated times to the earlier instant', () => {
  const user = participant('a', '2026-03-22T01:30:00Z', '2026-03-22T02:30:00Z');
  user.timezone = 'Europe/Helsinki';
  user.slots[0]!.recurringRule = 'FREQ=WEEKLY;BYDAY=SU';
  assert.deepEqual(
    expandLunchAvailability(user, new Date('2026-03-29T00:00:00Z'), new Date('2026-03-30T00:00:00Z')),
    [],
  );
  assert.equal(
    zonedWallTimeToInstant(Date.UTC(2026, 9, 25, 3, 30), 'Europe/Helsinki'),
    Date.parse('2026-10-25T00:30:00Z'),
  );
  assert.equal(
    zonedWallTimeToInstant(Date.UTC(2026, 10, 1, 1, 30), 'America/New_York'),
    Date.parse('2026-11-01T05:30:00Z'),
  );
  assert.equal(zonedWallTimeToInstant(Date.UTC(2026, 2, 29, 3, 30), 'Europe/Helsinki'), null);
  assert.equal(zonedWallTimeToInstant(Date.UTC(2026, 2, 8, 2, 30), 'America/New_York'), null);
});

void test('profile timezone conversion is independent of the browser zone and preserves milliseconds', () => {
  const instant = new Date('2026-10-02T09:15:20.123Z');
  assert.deepEqual(zonedDateParts(instant, 'Europe/Helsinki'), {
    year: 2026,
    month: 10,
    day: 2,
    hour: 12,
    minute: 15,
    second: 20,
    millisecond: 123,
  });
  assert.equal(zonedDay(instant, 'Europe/Helsinki'), Date.UTC(2026, 9, 2));
  assert.equal(zonedWallTimeToInstant(Date.UTC(2026, 9, 2, 12, 15, 20, 123), 'Europe/Helsinki'), instant.getTime());
});

void test('a day override suppresses only its corresponding weekly slot and disabled templates never schedule', () => {
  const user = participant('a', '2026-10-02T12:00:00Z', '2026-10-02T13:00:00Z');
  user.slots[0]!.recurringRule = 'FREQ=WEEKLY;BYDAY=FR';
  user.slots.push(
    {
      startAt: new Date('2026-10-02T14:00:00Z'),
      endAt: new Date('2026-10-02T15:00:00Z'),
      recurringRule: 'FREQ=WEEKLY;BYDAY=FR',
      type: 'lunch',
    },
    {
      startAt: new Date('2026-10-02T12:00:00Z'),
      endAt: new Date('2026-10-02T13:00:00Z'),
      recurringRule: 'X-LL-DAY-OFF=1',
      type: 'lunch',
    },
    {
      startAt: new Date('2026-10-02T16:00:00Z'),
      endAt: new Date('2026-10-02T17:00:00Z'),
      recurringRule: 'FREQ=WEEKLY;BYDAY=FR;X-LL-DISABLED=1',
      type: 'lunch',
    },
  );
  const result = expandLunchAvailability(user, new Date('2026-10-02T00:00:00Z'), new Date('2026-10-03T00:00:00Z'));
  assert.deepEqual(
    result.map((slot) => new Date(slot.start).toISOString()),
    ['2026-10-02T14:00:00.000Z'],
  );
});

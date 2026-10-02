import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertAvailabilitySchema } from '@/lib/server/schemas/availability';
import { updateUserProfileSchema } from '@/lib/server/schemas/users';

const slot = { startAt: '2026-10-02T12:00:00.000Z', endAt: '2026-10-02T13:00:00.000Z', type: 'lunch' };

void test('availability accepts clearing and rejects empty or reversed time windows', () => {
  assert.deepEqual(upsertAvailabilitySchema.parse([]), []);
  assert.equal(upsertAvailabilitySchema.safeParse([slot]).success, true);
  for (const endAt of [slot.startAt, '2026-10-02T11:59:00.000Z']) {
    assert.equal(upsertAvailabilitySchema.safeParse([{ ...slot, endAt }]).success, false);
  }
});

void test('availability recurrence accepts only executable weekly templates and day overrides', () => {
  for (const recurringRule of ['FREQ=WEEKLY;BYDAY=MO', 'FREQ=WEEKLY;BYDAY=SA;X-LL-DISABLED=1', 'X-LL-DAY-OFF=1']) {
    assert.equal(upsertAvailabilitySchema.safeParse([{ ...slot, recurringRule }]).success, true);
  }
  for (const recurringRule of ['', 'FREQ=DAILY', 'FREQ=WEEKLY;BYDAY=MO,TU', 'FREQ=WEEKLY;BYDAY=MO;COUNT=2']) {
    assert.equal(upsertAvailabilitySchema.safeParse([{ ...slot, recurringRule }]).success, false);
  }
});

void test('recurring availability has a bounded duration while ordinary dated slots can span longer', () => {
  const weekly = { ...slot, recurringRule: 'FREQ=WEEKLY;BYDAY=FR' };
  assert.equal(upsertAvailabilitySchema.safeParse([{ ...weekly, endAt: '2026-10-09T12:00:00.000Z' }]).success, true);
  for (const endAt of ['2026-10-09T12:00:00.001Z', '9999-10-05T13:00:00.000Z']) {
    assert.equal(upsertAvailabilitySchema.safeParse([{ ...weekly, endAt }]).success, false);
  }
  assert.equal(upsertAvailabilitySchema.safeParse([{ ...slot, endAt: '2026-11-02T13:00:00.000Z' }]).success, true);
});

void test('profiles can clear optional fields and reject unusable timezones', () => {
  assert.deepEqual(updateUserProfileSchema.parse({ name: null, area: null, image: null }), {
    name: null,
    area: null,
    image: null,
  });
  assert.equal(updateUserProfileSchema.safeParse({ timezone: 'Europe/Helsinki' }).success, true);
  assert.equal(updateUserProfileSchema.safeParse({ timezone: 'invalid/timezone' }).success, false);
  assert.equal(updateUserProfileSchema.safeParse({}).success, false);
});

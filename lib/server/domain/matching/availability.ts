import { MATCHING_ALGORITHM_VERSION } from '@/lib/server/domain/matching';
import {
  MAX_AVAILABILITY_SLOTS,
  MAX_DRAW_WINDOW,
  MAX_EXISTING_BOOKINGS,
  MAX_WEEKLY_SLOT_DURATION,
} from '@/lib/server/domain/matching/limits';
import { zonedDateParts, zonedWallTimeToInstant } from '@/lib/zonedDateTime';

type Availability = {
  startAt: Date;
  endAt: Date;
  recurringRule: string | null;
  type: string;
  groupId?: string | null;
};

export type LunchParticipant = {
  id: string;
  timezone: string;
  slots: Availability[];
  notBefore?: Date;
};

type Interval = { start: number; end: number };

export type ScheduledLunch = {
  memberIds: string[];
  scheduledFor: Date;
  scheduledUntil: Date;
};

export class SchedulingCapacityError extends Error {
  constructor() {
    super('This draw exceeds the scheduling work limit. Choose a shorter window or simplify availability.');
    this.name = 'SchedulingCapacityError';
  }
}

const DAY = 24 * 60 * 60 * 1000;
const weekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const weeklyRule = /^FREQ=WEEKLY;BYDAY=(SU|MO|TU|WE|TH|FR|SA)(;X-LL-DISABLED=1)?$/;
const MAX_WORK = 5_000_000;
const MAX_TIMEZONE_CONVERSIONS = 10_000;
const SCHEDULE_ATTEMPTS = 6;

type Budget = {
  work: number;
  conversions: number;
  parts: Map<string, ReturnType<typeof zonedDateParts>>;
  instants: Map<string, number | null>;
};

function newBudget(): Budget {
  return { work: MAX_WORK, conversions: MAX_TIMEZONE_CONVERSIONS, parts: new Map(), instants: new Map() };
}

function spend(budget: Budget, amount = 1) {
  budget.work -= amount;
  if (budget.work < 0) throw new SchedulingCapacityError();
}

function dateParts(date: Date, timezone: string, budget: Budget) {
  const key = `${timezone}:${date.getTime()}`;
  let result = budget.parts.get(key);
  if (!result) {
    if (--budget.conversions < 0) throw new SchedulingCapacityError();
    result = zonedDateParts(date, timezone);
    budget.parts.set(key, result);
  }
  return result;
}

function localDay(parts: ReturnType<typeof zonedDateParts>) {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function localInstant(day: number, source: ReturnType<typeof zonedDateParts>, timezone: string, budget: Budget) {
  const desired = day + ((source.hour * 60 + source.minute) * 60 + source.second) * 1000 + source.millisecond;
  const key = `${timezone}:${desired}`;
  if (!budget.instants.has(key)) {
    if (--budget.conversions < 0) throw new SchedulingCapacityError();
    budget.instants.set(key, zonedWallTimeToInstant(desired, timezone));
  }
  return budget.instants.get(key)!;
}

function validWindow(windowStart: Date, windowEnd: Date) {
  const length = windowEnd.getTime() - windowStart.getTime();
  if (!Number.isFinite(length) || length <= 0 || length > MAX_DRAW_WINDOW) throw new SchedulingCapacityError();
}

function overrideKey(start: number, end: number, groupId: string | null | undefined) {
  return JSON.stringify([start, end, groupId ?? null]);
}

export function expandLunchAvailability(participant: LunchParticipant, windowStart: Date, windowEnd: Date): Interval[] {
  return expandAvailability(participant, windowStart, windowEnd, newBudget());
}

function expandAvailability(
  participant: LunchParticipant,
  windowStart: Date,
  windowEnd: Date,
  budget: Budget,
): Interval[] {
  validWindow(windowStart, windowEnd);
  if (participant.slots.length > MAX_AVAILABILITY_SLOTS) throw new SchedulingCapacityError();
  const start = Math.max(windowStart.getTime(), participant.notBefore?.getTime() ?? -Infinity);
  const end = windowEnd.getTime();
  if (!Number.isFinite(start) || start >= end) return [];
  const intervals: Interval[] = [];
  const intervalKeys = new Set<string>();
  const templates = new Set<string>();
  const overrides = new Set<string>();
  for (const slot of participant.slots) {
    spend(budget);
    if (slot.type === 'lunch' && slot.recurringRule === 'X-LL-DAY-OFF=1') {
      overrides.add(overrideKey(slot.startAt.getTime(), slot.endAt.getTime(), slot.groupId));
    }
  }
  const append = (from: number, until: number) => {
    const clipped = { start: Math.max(start, from), end: Math.min(end, until) };
    if (clipped.start >= clipped.end) return;
    const key = `${clipped.start}:${clipped.end}`;
    if (!intervalKeys.has(key)) {
      intervals.push(clipped);
      intervalKeys.add(key);
    }
  };

  for (const slot of participant.slots) {
    spend(budget);
    if (slot.type !== 'lunch') continue;
    const slotStart = slot.startAt.getTime();
    const slotEnd = slot.endAt.getTime();
    const slotDuration = slotEnd - slotStart;
    if (!Number.isFinite(slotDuration) || slotDuration <= 0) continue;
    if (!slot.recurringRule) {
      append(slotStart, slotEnd);
      continue;
    }
    if (slot.recurringRule.length > 50) continue;
    const recurrence = weeklyRule.exec(slot.recurringRule);
    // Invalid legacy templates cannot expand, even if they predate input validation.
    if (!recurrence || recurrence[2] || slotDuration > MAX_WEEKLY_SLOT_DURATION) continue;
    const templateKey = `${overrideKey(slotStart, slotEnd, slot.groupId)}:${slot.recurringRule}`;
    if (templates.has(templateKey)) continue;
    templates.add(templateKey);
    let sourceStart: ReturnType<typeof zonedDateParts>;
    let sourceEnd: ReturnType<typeof zonedDateParts>;
    let firstDay: number;
    let lastDay: number;
    try {
      sourceStart = dateParts(slot.startAt, participant.timezone, budget);
      sourceEnd = dateParts(slot.endAt, participant.timezone, budget);
      firstDay = localDay(dateParts(new Date(start), participant.timezone, budget));
      lastDay = localDay(dateParts(windowEnd, participant.timezone, budget));
    } catch (error) {
      if (error instanceof RangeError) continue;
      throw error;
    }
    const daySpan = localDay(sourceEnd) - localDay(sourceStart);
    // Check the local span as well: DST or corrupt dates must never extend this loop.
    if (daySpan < 0 || daySpan > MAX_WEEKLY_SLOT_DURATION + DAY) continue;
    const firstPossibleDay = firstDay - Math.max(DAY, daySpan);
    const weekdayIndex = weekdays.indexOf(recurrence[1]!);
    const offset = (weekdayIndex - new Date(firstPossibleDay).getUTCDay() + 7) % 7;
    // Step by weeks, with a fixed maximum of seven occurrences per template.
    for (
      let occurrence = 0, day = firstPossibleDay + offset * DAY;
      occurrence < 7 && day <= lastDay;
      occurrence += 1, day += 7 * DAY
    ) {
      spend(budget);
      const from = localInstant(day, sourceStart, participant.timezone, budget);
      const until = localInstant(day + daySpan, sourceEnd, participant.timezone, budget);
      if (from !== null && until !== null && !overrides.has(overrideKey(from, until, slot.groupId)))
        append(from, until);
    }
  }

  // Adjacent or overlapping slots represent continuous availability.
  return mergeIntervals(intervals, budget);
}

function mergeIntervals(intervals: Interval[], budget: Budget): Interval[] {
  // Charge the sort before invoking native code, which a later budget check cannot interrupt.
  spend(budget, intervals.length * (1 + Math.ceil(Math.log2(intervals.length + 1))));
  const merged: Interval[] = [];
  for (const interval of intervals.toSorted((a, b) => a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

function subtractBookings(intervals: Interval[], bookings: Interval[], budget: Budget): Interval[] {
  const free: Interval[] = [];
  let bookingIndex = 0;
  for (const slot of intervals) {
    spend(budget);
    let start = slot.start;
    while (bookingIndex < bookings.length && bookings[bookingIndex]!.end <= start) {
      spend(budget);
      bookingIndex += 1;
    }
    for (let index = bookingIndex; index < bookings.length && bookings[index]!.start < slot.end; index += 1) {
      spend(budget);
      const booking = bookings[index]!;
      if (booking.start > start) free.push({ start, end: Math.min(slot.end, booking.start) });
      start = Math.max(start, booking.end);
      if (start >= slot.end) break;
    }
    if (start < slot.end) free.push({ start, end: slot.end });
  }
  return free;
}

// These ranges include their endpoints: a slot exactly one lunch long has one valid start.
function intersectRanges(left: Interval[], right: Interval[], budget: Budget): Interval[] {
  const result: Interval[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    spend(budget);
    const a = left[leftIndex]!;
    const b = right[rightIndex]!;
    const start = Math.max(a.start, b.start);
    const end = Math.min(a.end, b.end);
    if (start <= end) result.push({ start, end });
    if (a.end <= b.end) leftIndex += 1;
    else rightIndex += 1;
  }
  return result;
}

function pairKey(a: string, b: string) {
  return JSON.stringify(a < b ? [a, b] : [b, a]);
}

function seedRank(seed: string, id: string) {
  let hash = 2166136261;
  for (const character of `${seed}:${id}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function scheduleLunches(input: {
  participants: LunchParticipant[];
  windowStart: Date;
  windowEnd: Date;
  durationMinutes: number;
  maxGroupSize: number;
  recentMatches: string[][];
  existingBookings: Array<{ memberIds: string[]; start: Date; end: Date }>;
  seed: string;
}) {
  validWindow(input.windowStart, input.windowEnd);
  const duration = input.durationMinutes * 60 * 1000;
  if (!Number.isFinite(duration) || duration <= 0 || input.maxGroupSize < 2 || !Number.isFinite(input.maxGroupSize)) {
    throw new SchedulingCapacityError();
  }
  if (
    input.participants.length > 500 ||
    input.existingBookings.length > MAX_EXISTING_BOOKINGS ||
    input.recentMatches.length > 100
  ) {
    throw new SchedulingCapacityError();
  }
  const participants = [...new Map(input.participants.map((participant) => [participant.id, participant])).values()];
  const budget = newBudget();
  const bookingsByParticipant = new Map<string, Interval[]>();
  const participantIds = new Set(participants.map((participant) => participant.id));
  for (const booking of input.existingBookings) {
    if (booking.memberIds.length > 500) throw new SchedulingCapacityError();
    for (const id of booking.memberIds) {
      spend(budget);
      if (!participantIds.has(id)) continue;
      const start = booking.start.getTime();
      const end = booking.end.getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) continue;
      const bookings = bookingsByParticipant.get(id) ?? [];
      bookings.push({ start, end });
      bookingsByParticipant.set(id, bookings);
    }
  }
  const ranges = new Map<string, Interval[]>();
  const flexibility = new Map<string, number>();
  for (const participant of participants) {
    const free = subtractBookings(
      expandAvailability(participant, input.windowStart, input.windowEnd, budget),
      mergeIntervals(bookingsByParticipant.get(participant.id) ?? [], budget),
      budget,
    ).filter((slot) => slot.end - slot.start >= duration);
    ranges.set(
      participant.id,
      free.map((slot) => ({ start: slot.start, end: slot.end - duration })),
    );
    flexibility.set(
      participant.id,
      free.reduce((sum, slot) => sum + slot.end - slot.start, 0),
    );
  }
  const recentPairs = new Set<string>();
  for (const members of input.recentMatches) {
    for (let first = 0; first < members.length; first += 1) {
      for (let second = first + 1; second < members.length; second += 1) {
        spend(budget);
        if (participantIds.has(members[first]!) && participantIds.has(members[second]!)) {
          recentPairs.add(pairKey(members[first]!, members[second]!));
        }
      }
    }
  }

  type Group = { memberIds: string[]; ranges: Interval[] };
  let best: { groups: Group[]; assigned: Set<string>; conflicts: number } | undefined;
  for (let attempt = 0; attempt < SCHEDULE_ATTEMPTS; attempt += 1) {
    const ranks = new Map(participants.map(({ id }) => [id, seedRank(`${input.seed}:${attempt}`, id)]));
    const ordered = participants
      .map(({ id }) => id)
      .toSorted(
        (a, b) => flexibility.get(a)! - flexibility.get(b)! || ranks.get(a)! - ranks.get(b)! || a.localeCompare(b),
      );
    const assigned = new Set<string>();
    const groups: Group[] = [];
    let conflicts = 0;
    try {
      // Assign the people with the fewest usable hours first, across the whole window.
      for (const id of ordered) {
        if (assigned.has(id) || !ranges.get(id)!.length) continue;
        let partner: string | undefined;
        let shared: Interval[] = [];
        for (const other of ordered) {
          spend(budget);
          if (other === id || assigned.has(other) || !ranges.get(other)!.length) continue;
          const overlap = intersectRanges(ranges.get(id)!, ranges.get(other)!, budget);
          if (!overlap.length) continue;
          if (
            !partner ||
            flexibility.get(other)! < flexibility.get(partner)! ||
            (flexibility.get(other) === flexibility.get(partner) &&
              Number(recentPairs.has(pairKey(id, other))) < Number(recentPairs.has(pairKey(id, partner))))
          ) {
            partner = other;
            shared = overlap;
          }
        }
        if (!partner) continue;
        assigned.add(id);
        assigned.add(partner);
        groups.push({ memberIds: [id, partner], ranges: shared });
        conflicts += Number(recentPairs.has(pairKey(id, partner)));
      }
      // A remaining person can join a group up to its size limit. Keep the group's
      // common start ranges so adding them can move that lunch when necessary.
      for (const id of ordered) {
        if (assigned.has(id) || !ranges.get(id)!.length) continue;
        let target: Group | undefined;
        let shared: Interval[] = [];
        let addedConflicts = Infinity;
        for (const group of groups) {
          spend(budget);
          if (group.memberIds.length >= input.maxGroupSize) continue;
          const overlap = intersectRanges(group.ranges, ranges.get(id)!, budget);
          if (!overlap.length) continue;
          const count = group.memberIds.reduce((sum, member) => sum + Number(recentPairs.has(pairKey(id, member))), 0);
          if (count < addedConflicts) {
            target = group;
            shared = overlap;
            addedConflicts = count;
          }
        }
        if (target) {
          target.memberIds.push(id);
          target.ranges = shared;
          assigned.add(id);
          conflicts += addedConflicts;
        }
      }
    } catch (error) {
      // Completed attempts remain usable if a later alternative reaches the fixed budget.
      if (error instanceof SchedulingCapacityError && best) break;
      throw error;
    }
    if (
      !best ||
      assigned.size > best.assigned.size ||
      (assigned.size === best.assigned.size && conflicts < best.conflicts)
    ) {
      best = { groups, assigned, conflicts };
    }
    if (assigned.size === participants.length && conflicts === 0) break;
  }
  const matches: ScheduledLunch[] = best!.groups
    .map((group) => ({
      memberIds: group.memberIds,
      scheduledFor: new Date(group.ranges[0]!.start),
      scheduledUntil: new Date(group.ranges[0]!.start + duration),
    }))
    .toSorted((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  return {
    matches,
    unmatchedUserIds: participants.map(({ id }) => id).filter((id) => !best!.assigned.has(id)),
    algorithmVersion: `${MATCHING_ALGORITHM_VERSION}+availability.v3-constrained`,
  };
}

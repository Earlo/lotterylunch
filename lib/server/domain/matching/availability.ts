import { createMatches, MATCHING_ALGORITHM_VERSION } from '@/lib/server/domain/matching';
import { zonedDateParts, zonedDay, zonedWallTimeToInstant } from '@/lib/zonedDateTime';

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
};

type Interval = { start: number; end: number };

export type ScheduledLunch = {
  memberIds: string[];
  scheduledFor: Date;
  scheduledUntil: Date;
};

const DAY = 24 * 60 * 60 * 1000;
const weekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function localInstant(day: number, source: ReturnType<typeof zonedDateParts>, timezone: string) {
  const desired = day + ((source.hour * 60 + source.minute) * 60 + source.second) * 1000 + source.millisecond;
  return zonedWallTimeToInstant(desired, timezone);
}

export function expandLunchAvailability(participant: LunchParticipant, windowStart: Date, windowEnd: Date): Interval[] {
  const start = windowStart.getTime();
  const end = windowEnd.getTime();
  const intervals: Interval[] = [];
  const overrides = participant.slots.filter(
    (slot) => slot.type === 'lunch' && slot.recurringRule?.split(';').includes('X-LL-DAY-OFF=1'),
  );
  const append = (from: number, until: number) => {
    const clipped = { start: Math.max(start, from), end: Math.min(end, until) };
    if (clipped.start >= clipped.end) return null;
    intervals.push(clipped);
    return clipped;
  };

  for (const slot of participant.slots) {
    if (slot.type !== 'lunch' || slot.recurringRule?.includes('X-LL-DAY-OFF=1')) continue;
    if (!slot.recurringRule) {
      append(slot.startAt.getTime(), slot.endAt.getTime());
      continue;
    }
    const tokens = slot.recurringRule.split(';');
    if (!tokens.includes('FREQ=WEEKLY') || tokens.includes('X-LL-DISABLED=1')) continue;
    const weekday = tokens.find((token) => token.startsWith('BYDAY='))?.slice(6);
    const sourceStart = zonedDateParts(slot.startAt, participant.timezone);
    const sourceEnd = zonedDateParts(slot.endAt, participant.timezone);
    const daySpan = zonedDay(slot.endAt, participant.timezone) - zonedDay(slot.startAt, participant.timezone);
    let coveredUntil = start;
    for (
      let day = zonedDay(windowStart, participant.timezone) - Math.max(DAY, daySpan);
      day <= zonedDay(windowEnd, participant.timezone);
      day += DAY
    ) {
      if (weekdays[new Date(day).getUTCDay()] !== weekday) continue;
      const from = localInstant(day, sourceStart, participant.timezone);
      const until = localInstant(day + daySpan, sourceEnd, participant.timezone);
      if (
        from !== null &&
        until !== null &&
        !overrides.some(
          (override) =>
            override.startAt.getTime() === from &&
            override.endAt.getTime() === until &&
            (override.groupId ?? null) === (slot.groupId ?? null),
        )
      ) {
        const added = append(from, until);
        if (added && added.start <= coveredUntil) coveredUntil = Math.max(coveredUntil, added.end);
        // Long weekly slots can overlap many occurrences. Once their union
        // covers the window, older/future occurrences cannot add availability.
        if (coveredUntil >= end) break;
      }
    }
  }

  // Adjacent or overlapping slots represent continuous availability.
  const merged: Interval[] = [];
  for (const interval of intervals.toSorted((a, b) => a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
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
  const duration = input.durationMinutes * 60 * 1000;
  const participants = [...new Map(input.participants.map((participant) => [participant.id, participant])).values()];
  const available = new Map(
    participants.map((participant) => [
      participant.id,
      expandLunchAvailability(participant, input.windowStart, input.windowEnd),
    ]),
  );
  const candidates = [
    ...new Set([
      ...[...available.values()].flatMap((intervals) => intervals.map((slot) => slot.start)),
      ...input.existingBookings.map((booking) => booking.end.getTime()),
    ]),
  ].toSorted((a, b) => a - b);
  const assigned = new Set<string>();
  const matches: ScheduledLunch[] = [];
  let algorithmVersion = MATCHING_ALGORITHM_VERSION;
  for (const candidate of candidates) {
    const eligible = participants
      .filter((participant) => {
        if (assigned.has(participant.id)) return false;
        if (
          !available.get(participant.id)?.some((slot) => slot.start <= candidate && slot.end >= candidate + duration)
        ) {
          return false;
        }
        return !input.existingBookings.some(
          (booking) =>
            booking.memberIds.includes(participant.id) &&
            booking.start.getTime() < candidate + duration &&
            booking.end.getTime() > candidate,
        );
      })
      .map((participant) => participant.id);
    if (eligible.length < 2) continue;
    const drawn = createMatches({
      participantIds: eligible,
      groupSizeMin: 2,
      groupSizeMax: input.maxGroupSize,
      recentMatches: input.recentMatches,
      seed: `${input.seed}:${candidate}`,
    });
    algorithmVersion = drawn.algorithmVersion;
    for (const memberIds of drawn.matches) {
      memberIds.forEach((id) => assigned.add(id));
      matches.push({ memberIds, scheduledFor: new Date(candidate), scheduledUntil: new Date(candidate + duration) });
    }
  }
  return {
    matches,
    unmatchedUserIds: participants.map((participant) => participant.id).filter((id) => !assigned.has(id)),
    algorithmVersion: `${algorithmVersion}+availability.v2`,
  };
}

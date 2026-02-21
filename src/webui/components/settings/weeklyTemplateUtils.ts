import type { AvailabilitySlot } from '@/webui/api/types';

export const weekDayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export const weekDayLabels = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const disabledToken = 'X-LL-DISABLED=1';
const dayOffOverrideToken = 'X-LL-DAY-OFF=1';

export function buildWeeklyTemplateRule(weekday: number, enabled = true) {
  const clampedWeekday = Math.min(Math.max(weekday, 0), 6);
  const baseRule = `FREQ=WEEKLY;BYDAY=${weekDayCodes[clampedWeekday]}`;
  return enabled ? baseRule : `${baseRule};${disabledToken}`;
}

export function parseWeeklyTemplateRule(recurringRule?: string | null) {
  if (!recurringRule || !recurringRule.includes('FREQ=WEEKLY')) return null;
  const byDayMatch = recurringRule.match(/(?:^|;)BYDAY=([A-Z]{2})(?:;|$)/);
  if (!byDayMatch) return null;
  const weekday = weekDayCodes.indexOf(byDayMatch[1] as (typeof weekDayCodes)[number]);
  if (weekday < 0) return null;
  return {
    weekday,
    enabled: !recurringRule.includes(disabledToken),
  };
}

export function buildDayOffOverrideRule() {
  return dayOffOverrideToken;
}

export function isDayOffOverrideSlot(
  slot: Pick<AvailabilitySlot, 'recurringRule'>,
) {
  return Boolean(slot.recurringRule?.includes(dayOffOverrideToken));
}

export function isWeeklyTemplateSlot(
  slot: Pick<AvailabilitySlot, 'recurringRule'>,
) {
  return parseWeeklyTemplateRule(slot.recurringRule) !== null;
}

export function isOneOffAvailabilitySlot(
  slot: Pick<AvailabilitySlot, 'recurringRule'>,
) {
  return !isWeeklyTemplateSlot(slot) && !isDayOffOverrideSlot(slot);
}

export function toDateKeyFromIso(isoString: string) {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function minutesSinceMidnight(isoString: string) {
  const date = new Date(isoString);
  return date.getHours() * 60 + date.getMinutes();
}

export function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return startA < endB && startB < endA;
}

export function buildDaySlotSignature({
  dateKey,
  startMinute,
  endMinute,
  type,
  groupId,
}: {
  dateKey: string;
  startMinute: number;
  endMinute: number;
  type: AvailabilitySlot['type'];
  groupId?: string | null;
}) {
  return `${dateKey}|${startMinute}|${endMinute}|${type}|${groupId ?? ''}`;
}

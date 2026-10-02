import type { AvailabilitySlot } from '@/lib/webui/api/types';
import { zonedDateParts, zonedDay, zonedWallTimeToInstant } from '@/lib/zonedDateTime';

export const weekDayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export const weekDayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const disabledToken = 'X-LL-DISABLED=1';
const dayOffOverrideToken = 'X-LL-DAY-OFF=1';

export function buildWeeklyTemplateRule(weekday: number, enabled = true) {
  const clampedWeekday = Number.isFinite(weekday) ? Math.min(Math.max(Math.trunc(weekday), 0), 6) : 0;
  const baseRule = `FREQ=WEEKLY;BYDAY=${weekDayCodes[clampedWeekday] ?? weekDayCodes[0]}`;
  return enabled ? baseRule : `${baseRule};${disabledToken}`;
}

export function parseWeeklyTemplateRule(recurringRule?: string | null) {
  if (!recurringRule) return null;
  const tokens = recurringRule.split(';');
  if (!tokens.includes('FREQ=WEEKLY')) return null;
  const byDayMatch = recurringRule.match(/(?:^|;)BYDAY=([A-Z]{2})(?:;|$)/);
  if (!byDayMatch) return null;
  const weekday = weekDayCodes.findIndex((code) => code === byDayMatch[1]);
  if (weekday < 0) return null;
  return {
    weekday,
    enabled: !tokens.includes(disabledToken),
  };
}

export function buildDayOffOverrideRule() {
  return dayOffOverrideToken;
}

export function isDayOffOverrideSlot(slot: Pick<AvailabilitySlot, 'recurringRule'>) {
  return Boolean(slot.recurringRule?.split(';').includes(dayOffOverrideToken));
}

export function isWeeklyTemplateSlot(slot: Pick<AvailabilitySlot, 'recurringRule'>) {
  return parseWeeklyTemplateRule(slot.recurringRule) !== null;
}

export function isOneOffAvailabilitySlot(slot: Pick<AvailabilitySlot, 'recurringRule'>) {
  return !isWeeklyTemplateSlot(slot) && !isDayOffOverrideSlot(slot);
}

export function parseDateKey(dateKey: string) {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function toDateKeyFromIso(isoString: string, timezone?: string) {
  const date = new Date(isoString);
  if (timezone) {
    const { year, month, day } = zonedDateParts(date, timezone);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function minutesSinceMidnight(isoString: string, timezone?: string) {
  const date = new Date(isoString);
  if (timezone) {
    const { hour, minute } = zonedDateParts(date, timezone);
    return hour * 60 + minute;
  }
  return date.getHours() * 60 + date.getMinutes();
}

export function slotEndMinute(startAt: string, endAt: string, timezone: string) {
  const days = (zonedDay(new Date(endAt), timezone) - zonedDay(new Date(startAt), timezone)) / 86_400_000;
  return days * 1440 + minutesSinceMidnight(endAt, timezone);
}

export function toIsoForDateKeyAndMinute(dateKey: string, minute: number, timezone: string) {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = dateKey.split('-').map(Number);
  const instant = zonedWallTimeToInstant(Date.UTC(year, month - 1, day) + minute * 60_000, timezone);
  return instant === null ? null : new Date(instant).toISOString();
}

export function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
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

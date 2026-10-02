'use client';

import { Button } from '@/components/ui/Button';
import { selectBaseStyles } from '@/components/ui/formStyles';
import { Input } from '@/components/ui/Input';
import type { AvailabilitySlot, GroupSummary } from '@/lib/webui/api/types';
import {
  buildDaySlotSignature,
  isDayOffOverrideSlot,
  isOneOffAvailabilitySlot,
  minutesSinceMidnight,
  parseDateKey,
  parseWeeklyTemplateRule,
  slotEndMinute,
  toDateKeyFromIso,
  weekDayLabels,
} from '@/lib/webui/weeklyTemplateUtils';
import { useMemo, useRef, useState, type FormEvent, type MouseEvent, type PointerEvent } from 'react';

const weekDaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const monthLabelFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
});

const selectedDateLabelFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

const timelineStartHour = 7;
const timelineEndHour = 21;
const timelineStepMinutes = 30;
const timelineHeightPx = 336;
const timelineStartMinutes = timelineStartHour * 60;
const timelineEndMinutes = timelineEndHour * 60;
const timelineRangeMinutes = timelineEndMinutes - timelineStartMinutes;
const timelineRows = timelineRangeMinutes / timelineStepMinutes;
const timelineRowHeightPx = timelineHeightPx / timelineRows;
const minSlotBlockHeightPx = 20;
const timelineHourTicks = Array.from(
  { length: timelineEndHour - timelineStartHour + 1 },
  (_, index) => timelineStartHour + index,
);

type WeeklyTemplateEntry = {
  index: number;
  slot: AvailabilitySlot;
  weekday: number;
  enabled: boolean;
  startMinute: number;
  endMinute: number;
};

type DaySpecificEntry = {
  index: number;
  slot: AvailabilitySlot;
  dateKey: string;
  startMinute: number;
  endMinute: number;
};

type DayOffOverrideEntry = {
  index: number;
  slot: AvailabilitySlot;
  dateKey: string;
  startMinute: number;
  endMinute: number;
  signature: string;
};

type DaySlot = {
  slotKind: 'weekly' | 'day';
  displayId: string;
  sourceIndex: number;
  startMinute: number;
  endMinute: number;
  type: AvailabilitySlot['type'];
  groupId?: string | null;
};

type DayTimelineBlockAction =
  | {
      key: string;
      variant: 'disable';
      slot: DaySlot;
    }
  | {
      key: string;
      variant: 'delete';
      slot: DaySlot;
    };

type DayTimelineBlock = {
  displayId: string;
  startMinute: number;
  endMinute: number;
  hasWeekly: boolean;
  hasDaySpecific: boolean;
  actions: DayTimelineBlockAction[];
};

type WeekStartDayPreference = 'monday' | 'sunday';
type ClockFormatPreference = 'h24' | 'ampm';

type WeekDrawState = {
  weekday: number;
  applyToAllWeekdays: boolean;
  pointerId: number;
  anchorMinute: number;
  currentMinute: number;
};

type DayDrawState = {
  pointerId: number;
  anchorMinute: number;
  currentMinute: number;
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function firstDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function clampMinute(value: number) {
  return Math.max(timelineStartMinutes, Math.min(value, timelineEndMinutes));
}

function clampDrawMinute(value: number) {
  return Math.max(timelineStartMinutes, Math.min(value, timelineEndMinutes - timelineStepMinutes));
}

function snapToStep(value: number) {
  const clamped = clampDrawMinute(value);
  const relative = clamped - timelineStartMinutes;
  const snapped = Math.round(relative / timelineStepMinutes) * timelineStepMinutes + timelineStartMinutes;
  return clampDrawMinute(snapped);
}

function normalizeDrawRange(anchorMinute: number, currentMinute: number) {
  const startMinute = Math.min(anchorMinute, currentMinute);
  const endMinute = Math.max(anchorMinute, currentMinute) + timelineStepMinutes;
  return {
    startMinute: clampMinute(startMinute),
    endMinute: clampMinute(endMinute),
  };
}

function minuteFromPointer(clientY: number, rect: DOMRect) {
  const ratio = (clientY - rect.top) / rect.height;
  const value = timelineStartMinutes + ratio * timelineRangeMinutes;
  return snapToStep(value);
}

function minuteToY(minute: number) {
  const clamped = clampMinute(minute);
  return ((clamped - timelineStartMinutes) / timelineRangeMinutes) * timelineHeightPx;
}

function formatMinutesLabel(minutes: number, clockFormat: ClockFormatPreference) {
  const date = new Date(Date.UTC(2000, 0, 1, 0, minutes));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    hour12: clockFormat === 'ampm',
  }).format(date);
}

function formatHourLabel(hour: number, clockFormat: ClockFormatPreference) {
  const date = new Date(Date.UTC(2000, 0, 1, hour));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    hour12: clockFormat === 'ampm',
  }).format(date);
}

function ActionIconButton({
  label,
  variant,
  tone = 'default',
  onClick,
}: {
  label: string;
  variant: 'delete' | 'disable' | 'enable';
  tone?: 'default' | 'onDark';
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const variantStyles = {
    delete:
      tone === 'onDark'
        ? 'text-[rgba(255,214,198,0.96)] hover:text-[rgba(255,235,226,1)]'
        : 'text-[rgba(162,28,18,1)] hover:text-[rgba(126,18,10,1)]',
    disable:
      tone === 'onDark'
        ? 'text-[rgba(255,255,255,0.94)] hover:text-white'
        : 'text-[rgba(20,18,21,0.92)] hover:text-[rgba(20,18,21,1)]',
    enable:
      tone === 'onDark'
        ? 'text-[rgba(219,255,241,0.98)] hover:text-[rgba(242,255,249,1)]'
        : 'text-[rgba(21,101,73,1)] hover:text-[rgba(14,78,56,1)]',
  }[variant];

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={[
        'inline-flex h-5 w-5 items-center justify-center opacity-80 transition-opacity duration-150 hover:opacity-100',
        variantStyles,
      ].join(' ')}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={onClick}
    >
      {variant === 'delete' ? (
        <svg
          viewBox="0 0 16 16"
          className="h-4.5 w-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3.5 4.5h9" />
          <path d="M6 4.5v-1h4v1" />
          <path d="M5.5 6.5v5.5" />
          <path d="M8 6.5v5.5" />
          <path d="M10.5 6.5v5.5" />
          <path d="M4.8 13.2h6.4" />
        </svg>
      ) : variant === 'disable' ? (
        <svg
          viewBox="0 0 16 16"
          className="h-4.5 w-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M3.5 8h9" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 16 16"
          className="h-4.5 w-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M8 4v8" />
          <path d="M4 8h8" />
        </svg>
      )}
    </button>
  );
}

export function UserScheduleCalendar({
  slots,
  weekStartDay,
  clockFormat,
  timezone = 'UTC',
  onCreateWeeklySlot,
  onCreateWeeklySlotForAllWeekdays,
  onDeleteSlot,
  onCreateDaySlot,
  onDisableWeeklySlotForDay,
  onEnableWeeklySlotForDay,
}: {
  slots: AvailabilitySlot[];
  groups: GroupSummary[];
  weekStartDay: WeekStartDayPreference;
  clockFormat: ClockFormatPreference;
  timezone?: string;
  onCreateWeeklySlot: (weekday: number, startMinute: number, endMinute: number) => void;
  onCreateWeeklySlotForAllWeekdays: (startMinute: number, endMinute: number) => void;
  onDeleteSlot: (index: number) => void;
  onCreateDaySlot: (dateKey: string, startMinute: number, endMinute: number) => void;
  onDisableWeeklySlotForDay: (input: {
    dateKey: string;
    startMinute: number;
    endMinute: number;
    type: AvailabilitySlot['type'];
    groupId?: string | null;
  }) => void;
  onEnableWeeklySlotForDay: (overrideIndex: number) => void;
}) {
  const [today, setToday] = useState(() => parseDateKey(toDateKeyFromIso(new Date().toISOString(), timezone)));
  const todayKey = toDateKey(today);
  const [monthCursor, setMonthCursor] = useState(() => firstDayOfMonth(today));
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [slotScope, setSlotScope] = useState('day');
  const [slotStart, setSlotStart] = useState('12:00');
  const [slotEnd, setSlotEnd] = useState('13:00');

  const [weekDrawState, setWeekDrawState] = useState<WeekDrawState | null>(null);
  const weekDrawStateRef = useRef<WeekDrawState | null>(null);

  const [dayDrawState, setDayDrawState] = useState<DayDrawState | null>(null);
  const dayDrawStateRef = useRef<DayDrawState | null>(null);
  const firstWeekdayIndex = weekStartDay === 'monday' ? 1 : 0;
  const orderedWeekdayIndexes = useMemo(
    () => Array.from({ length: 7 }, (_, offset) => (firstWeekdayIndex + offset) % 7),
    [firstWeekdayIndex],
  );
  const orderedWeekDaysShort = useMemo(
    () => orderedWeekdayIndexes.map((weekday) => weekDaysShort[weekday]),
    [orderedWeekdayIndexes],
  );

  const weeklyTemplateEntries = useMemo(() => {
    const entries: WeeklyTemplateEntry[] = [];

    for (const [index, slot] of slots.entries()) {
      const parsedRule = parseWeeklyTemplateRule(slot.recurringRule);
      if (!parsedRule) continue;

      const startMinute = minutesSinceMidnight(slot.startAt, timezone);
      const endMinute = Math.max(startMinute + timelineStepMinutes, slotEndMinute(slot.startAt, slot.endAt, timezone));

      entries.push({
        index,
        slot,
        weekday: parsedRule.weekday,
        enabled: parsedRule.enabled,
        startMinute,
        endMinute,
      });
    }

    entries.sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute || a.endMinute - b.endMinute);

    return entries;
  }, [slots, timezone]);

  const weeklyTemplatesByWeekday = useMemo(() => {
    const grouped = new Map<number, WeeklyTemplateEntry[]>();
    for (let weekday = 0; weekday < 7; weekday += 1) {
      grouped.set(weekday, []);
    }

    for (const entry of weeklyTemplateEntries) {
      grouped.get(entry.weekday)?.push(entry);
    }

    return grouped;
  }, [weeklyTemplateEntries]);

  const daySpecificEntriesByDate = useMemo(() => {
    const grouped = new Map<string, DaySpecificEntry[]>();

    for (const [index, slot] of slots.entries()) {
      if (!isOneOffAvailabilitySlot(slot)) continue;
      const dateKey = toDateKeyFromIso(slot.startAt, timezone);
      const startMinute = minutesSinceMidnight(slot.startAt, timezone);
      const endMinute = Math.max(startMinute + timelineStepMinutes, slotEndMinute(slot.startAt, slot.endAt, timezone));

      const entry: DaySpecificEntry = {
        index,
        slot,
        dateKey,
        startMinute,
        endMinute,
      };

      const existing = grouped.get(dateKey);
      if (existing) {
        existing.push(entry);
      } else {
        grouped.set(dateKey, [entry]);
      }
    }

    for (const entries of grouped.values()) {
      entries.sort((a, b) => a.startMinute - b.startMinute);
    }

    return grouped;
  }, [slots, timezone]);

  const dayOffEntriesByDate = useMemo(() => {
    const grouped = new Map<string, DayOffOverrideEntry[]>();

    for (const [index, slot] of slots.entries()) {
      if (!isDayOffOverrideSlot(slot)) continue;

      const dateKey = toDateKeyFromIso(slot.startAt, timezone);
      const startMinute = minutesSinceMidnight(slot.startAt, timezone);
      const endMinute = Math.max(startMinute + timelineStepMinutes, slotEndMinute(slot.startAt, slot.endAt, timezone));

      const entry: DayOffOverrideEntry = {
        index,
        slot,
        dateKey,
        startMinute,
        endMinute,
        signature: buildDaySlotSignature({
          dateKey,
          startMinute,
          endMinute,
          type: slot.type,
          groupId: slot.groupId ?? null,
        }),
      };

      const existing = grouped.get(dateKey);
      if (existing) {
        existing.push(entry);
      } else {
        grouped.set(dateKey, [entry]);
      }
    }

    for (const entries of grouped.values()) {
      entries.sort((a, b) => a.startMinute - b.startMinute);
    }

    return grouped;
  }, [slots, timezone]);

  const dayOffSignaturesByDate = useMemo(() => {
    const map = new Map<string, Set<string>>();

    for (const [dateKey, entries] of dayOffEntriesByDate) {
      map.set(dateKey, new Set(entries.map((entry) => entry.signature)));
    }

    return map;
  }, [dayOffEntriesByDate]);

  const calendarDays = useMemo(() => {
    const monthStart = firstDayOfMonth(monthCursor);
    const monthStartWeekday = monthStart.getDay();
    const gridStartOffset = (monthStartWeekday - firstWeekdayIndex + 7) % 7;
    const gridStart = addDays(monthStart, -gridStartOffset);

    return Array.from({ length: 42 }, (_, index) => {
      const date = addDays(gridStart, index);
      const key = toDateKey(date);
      const daySpecificCount = daySpecificEntriesByDate.get(key)?.length ?? 0;
      const dayOffSignatures = dayOffSignaturesByDate.get(key) ?? new Set<string>();

      let weeklyCount = 0;
      const weeklyEntries = weeklyTemplatesByWeekday.get(date.getDay()) ?? [];
      for (const entry of weeklyEntries) {
        if (!entry.enabled) continue;
        const signature = buildDaySlotSignature({
          dateKey: key,
          startMinute: entry.startMinute,
          endMinute: entry.endMinute,
          type: entry.slot.type,
          groupId: entry.slot.groupId ?? null,
        });
        if (dayOffSignatures.has(signature)) continue;
        weeklyCount += 1;
      }

      return {
        date,
        key,
        isCurrentMonth: date.getMonth() === monthCursor.getMonth(),
        isToday: key === todayKey,
        activeCount: daySpecificCount + weeklyCount,
      };
    });
  }, [
    dayOffSignaturesByDate,
    daySpecificEntriesByDate,
    firstWeekdayIndex,
    monthCursor,
    todayKey,
    weeklyTemplatesByWeekday,
  ]);

  const selectedDaySlots = useMemo(() => {
    const slotsForDay: DaySlot[] = [];
    const selectedDate = parseDateKey(selectedDateKey);

    for (const entry of daySpecificEntriesByDate.get(selectedDateKey) ?? []) {
      slotsForDay.push({
        slotKind: 'day',
        displayId: `day-${entry.slot.id}-${entry.index}`,
        sourceIndex: entry.index,
        startMinute: entry.startMinute,
        endMinute: entry.endMinute,
        type: entry.slot.type,
        groupId: entry.slot.groupId ?? null,
      });
    }

    const dayOffSignatures = dayOffSignaturesByDate.get(selectedDateKey) ?? new Set<string>();
    const weeklyEntries = weeklyTemplatesByWeekday.get(selectedDate.getDay()) ?? [];

    for (const entry of weeklyEntries) {
      if (!entry.enabled) continue;
      const signature = buildDaySlotSignature({
        dateKey: selectedDateKey,
        startMinute: entry.startMinute,
        endMinute: entry.endMinute,
        type: entry.slot.type,
        groupId: entry.slot.groupId ?? null,
      });

      if (dayOffSignatures.has(signature)) continue;

      slotsForDay.push({
        slotKind: 'weekly',
        displayId: `weekly-${entry.slot.id}-${selectedDateKey}`,
        sourceIndex: entry.index,
        startMinute: entry.startMinute,
        endMinute: entry.endMinute,
        type: entry.slot.type,
        groupId: entry.slot.groupId ?? null,
      });
    }

    slotsForDay.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

    return slotsForDay;
  }, [dayOffSignaturesByDate, daySpecificEntriesByDate, selectedDateKey, weeklyTemplatesByWeekday]);

  const selectedDate = parseDateKey(selectedDateKey);
  const selectedDayTimelineBlocks = useMemo(() => {
    if (selectedDaySlots.length === 0) return [] as DayTimelineBlock[];

    const mergedSegments: Array<{
      startMinute: number;
      endMinute: number;
      slots: DaySlot[];
    }> = [];

    for (const slot of selectedDaySlots) {
      const lastSegment = mergedSegments[mergedSegments.length - 1];
      if (!lastSegment || slot.startMinute > lastSegment.endMinute) {
        mergedSegments.push({
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          slots: [slot],
        });
        continue;
      }

      lastSegment.endMinute = Math.max(lastSegment.endMinute, slot.endMinute);
      lastSegment.slots.push(slot);
    }

    return mergedSegments.map((segment, index) => {
      const weeklySlots = segment.slots.filter((slot) => slot.slotKind === 'weekly');
      const daySlots = segment.slots.filter((slot) => slot.slotKind === 'day');
      const isHybrid = weeklySlots.length > 0 && daySlots.length > 0;

      const actions: DayTimelineBlockAction[] = isHybrid
        ? daySlots.map((slot) => ({
            key: `delete-${slot.displayId}`,
            variant: 'delete' as const,
            slot,
          }))
        : [
            ...weeklySlots.map((slot) => ({
              key: `disable-${slot.displayId}`,
              variant: 'disable' as const,
              slot,
            })),
            ...daySlots.map((slot) => ({
              key: `delete-${slot.displayId}`,
              variant: 'delete' as const,
              slot,
            })),
          ];

      return {
        displayId: `merged-${selectedDateKey}-${index}-${segment.startMinute}-${segment.endMinute}`,
        startMinute: segment.startMinute,
        endMinute: segment.endMinute,
        hasWeekly: weeklySlots.length > 0,
        hasDaySpecific: daySlots.length > 0,
        actions,
      };
    });
  }, [selectedDateKey, selectedDaySlots]);

  const selectedDayDisabledDefaults = useMemo(() => {
    const entries = dayOffEntriesByDate.get(selectedDateKey) ?? [];
    if (entries.length === 0) return [];

    const activeWeeklySignatures = new Set<string>();
    const weeklyEntries = weeklyTemplatesByWeekday.get(selectedDate.getDay()) ?? [];
    for (const entry of weeklyEntries) {
      if (!entry.enabled) continue;
      activeWeeklySignatures.add(
        buildDaySlotSignature({
          dateKey: selectedDateKey,
          startMinute: entry.startMinute,
          endMinute: entry.endMinute,
          type: entry.slot.type,
          groupId: entry.slot.groupId ?? null,
        }),
      );
    }

    return entries.filter((entry) => activeWeeklySignatures.has(entry.signature));
  }, [dayOffEntriesByDate, selectedDate, selectedDateKey, weeklyTemplatesByWeekday]);

  const showPreviousMonth = () => {
    setMonthCursor((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() - 1, 1);
      setSelectedDateKey(toDateKey(next));
      return next;
    });
  };

  const showNextMonth = () => {
    setMonthCursor((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      setSelectedDateKey(toDateKey(next));
      return next;
    });
  };

  const jumpToToday = () => {
    const now = parseDateKey(toDateKeyFromIso(new Date().toISOString(), timezone));
    setToday(now);
    setMonthCursor(firstDayOfMonth(now));
    setSelectedDateKey(toDateKey(now));
  };

  const handleWeekTimelinePointerDown = (weekday: number, event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const minute = minuteFromPointer(event.clientY, event.currentTarget.getBoundingClientRect());
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextDrawState = {
      weekday,
      applyToAllWeekdays: event.ctrlKey || event.metaKey,
      pointerId: event.pointerId,
      anchorMinute: minute,
      currentMinute: minute,
    };
    weekDrawStateRef.current = nextDrawState;
    setWeekDrawState(nextDrawState);
  };

  const handleWeekTimelinePointerMove = (weekday: number, event: PointerEvent<HTMLDivElement>) => {
    const current = weekDrawStateRef.current;
    if (!current || current.weekday !== weekday) return;
    if (current.pointerId !== event.pointerId) return;

    const minute = minuteFromPointer(event.clientY, event.currentTarget.getBoundingClientRect());

    const nextDrawState = {
      ...current,
      currentMinute: minute,
    };

    weekDrawStateRef.current = nextDrawState;
    setWeekDrawState(nextDrawState);
  };

  const handleWeekTimelinePointerUp = (weekday: number, event: PointerEvent<HTMLDivElement>) => {
    const current = weekDrawStateRef.current;
    if (current && current.weekday === weekday && current.pointerId === event.pointerId) {
      const minute = minuteFromPointer(event.clientY, event.currentTarget.getBoundingClientRect());
      const range = normalizeDrawRange(current.anchorMinute, minute);
      if (range.endMinute > range.startMinute) {
        if (current.applyToAllWeekdays) {
          onCreateWeeklySlotForAllWeekdays(range.startMinute, range.endMinute);
        } else {
          onCreateWeeklySlot(weekday, range.startMinute, range.endMinute);
        }
      }
      weekDrawStateRef.current = null;
      setWeekDrawState(null);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWeekTimelinePointerCancel = (weekday: number, event: PointerEvent<HTMLDivElement>) => {
    const current = weekDrawStateRef.current;
    if (current && current.weekday === weekday && current.pointerId === event.pointerId) {
      weekDrawStateRef.current = null;
      setWeekDrawState(null);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleDayTimelinePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const minute = minuteFromPointer(event.clientY, event.currentTarget.getBoundingClientRect());
    event.currentTarget.setPointerCapture(event.pointerId);

    const nextDrawState = {
      pointerId: event.pointerId,
      anchorMinute: minute,
      currentMinute: minute,
    };

    dayDrawStateRef.current = nextDrawState;
    setDayDrawState(nextDrawState);
  };

  const handleDayTimelinePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = dayDrawStateRef.current;
    if (!current || current.pointerId !== event.pointerId) return;

    const minute = minuteFromPointer(event.clientY, event.currentTarget.getBoundingClientRect());

    const nextDrawState = {
      ...current,
      currentMinute: minute,
    };

    dayDrawStateRef.current = nextDrawState;
    setDayDrawState(nextDrawState);
  };

  const handleDayTimelinePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = dayDrawStateRef.current;
    if (current && current.pointerId === event.pointerId) {
      const minute = minuteFromPointer(event.clientY, event.currentTarget.getBoundingClientRect());
      const range = normalizeDrawRange(current.anchorMinute, minute);
      if (range.endMinute > range.startMinute) {
        onCreateDaySlot(selectedDateKey, range.startMinute, range.endMinute);
      }
      dayDrawStateRef.current = null;
      setDayDrawState(null);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleDayTimelinePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    const current = dayDrawStateRef.current;
    if (current && current.pointerId === event.pointerId) {
      dayDrawStateRef.current = null;
      setDayDrawState(null);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const dayDraftRange = dayDrawState ? normalizeDrawRange(dayDrawState.anchorMinute, dayDrawState.currentMinute) : null;

  const addSlotFromForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const [startHour = Number.NaN, startMinute = Number.NaN] = slotStart.split(':').map(Number);
    const [endHour = Number.NaN, endMinute = Number.NaN] = slotEnd.split(':').map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < timelineStepMinutes) return;
    if (slotScope === 'day') {
      onCreateDaySlot(selectedDateKey, start, end);
    } else if (slotScope === 'weekdays') {
      onCreateWeeklySlotForAllWeekdays(start, end);
    } else {
      onCreateWeeklySlot(Number(slotScope), start, end);
    }
  };

  return (
    <div className="grid gap-4 rounded-md border border-[rgba(20,18,21,0.12)] bg-white/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.3em] text-(--moss) uppercase">Schedule</p>
          <p className="text-sm text-[rgba(20,18,21,0.7)]">
            Weekly timeline is the default. Customize specific dates from the calendar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={showPreviousMonth} aria-label="Previous month">
            Prev
          </Button>
          <p aria-live="polite" className="min-w-36 text-center text-sm font-semibold">
            {monthLabelFormatter.format(monthCursor)}
          </p>
          <Button variant="ghost" size="sm" onClick={showNextMonth} aria-label="Next month">
            Next
          </Button>
          <Button variant="ghost" size="sm" onClick={jumpToToday}>
            Today
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] tracking-[0.2em] text-[rgba(20,18,21,0.45)] uppercase">
        {orderedWeekDaysShort.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day) => {
          const isSelected = selectedDateKey === day.key;
          return (
            <button
              key={day.key}
              type="button"
              aria-label={`${selectedDateLabelFormatter.format(day.date)}, ${day.activeCount} slot${day.activeCount === 1 ? '' : 's'}`}
              aria-pressed={isSelected}
              aria-current={day.isToday ? 'date' : undefined}
              onClick={() => {
                setSelectedDateKey(day.key);
                if (!day.isCurrentMonth) {
                  setMonthCursor(firstDayOfMonth(day.date));
                }
              }}
              className={[
                'min-h-16 rounded-md border px-2 py-1 text-left transition-all duration-150',
                isSelected
                  ? 'border-(--ring) bg-[rgba(27,77,62,0.1)] hover:brightness-105'
                  : 'border-[rgba(20,18,21,0.09)] bg-white/80 hover:-translate-y-px hover:border-[rgba(20,18,21,0.25)] hover:shadow-[0_6px_14px_rgba(20,18,21,0.14)]',
                day.isCurrentMonth ? 'text-(--ink)' : 'text-[rgba(20,18,21,0.4)]',
              ].join(' ')}
            >
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>{day.date.getDate()}</span>
                {day.isToday ? (
                  <span className="rounded-full bg-(--ember) px-1.5 py-0.5 text-[10px] leading-none">Today</span>
                ) : null}
              </div>
              <p className="mt-2 text-[11px] text-[rgba(20,18,21,0.65)]">
                {day.activeCount > 0 ? `${day.activeCount} slot${day.activeCount === 1 ? '' : 's'}` : 'No slots'}
              </p>
            </button>
          );
        })}
      </div>

      <form className="flex flex-wrap items-end gap-3" onSubmit={addSlotFromForm}>
        <label className="grid gap-1 text-xs">
          Add a slot for
          <select
            className={`${selectBaseStyles} px-3 py-2 text-sm`}
            value={slotScope}
            onChange={(event) => setSlotScope(event.target.value)}
          >
            <option value="day">Selected date ({selectedDateKey})</option>
            <option value="weekdays">Every day each week</option>
            {orderedWeekdayIndexes.map((weekday) => (
              <option key={weekday} value={weekday}>
                {weekDayLabels[weekday]} each week
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs" htmlFor="availability-start">
          Start time
          <Input
            id="availability-start"
            type="time"
            required
            min="07:00"
            max="20:30"
            step={1800}
            value={slotStart}
            onChange={(event) => setSlotStart(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-xs" htmlFor="availability-end">
          End time
          <Input
            id="availability-end"
            type="time"
            required
            min="07:30"
            max="21:00"
            step={1800}
            value={slotEnd}
            onChange={(event) => setSlotEnd(event.target.value)}
          />
        </label>
        <Button variant="ghost" size="sm" type="submit" disabled={!slotStart || !slotEnd || slotEnd <= slotStart}>
          Add slot
        </Button>
      </form>

      <div className="rounded-md border border-[rgba(20,18,21,0.12)] bg-[rgba(20,18,21,0.02)] p-3">
        <p className="text-xs tracking-[0.25em] text-[rgba(20,18,21,0.5)] uppercase">Day Customization</p>
        <p className="text-sm text-[rgba(20,18,21,0.7)]">
          Draw on this timeline to add day-specific slots for {selectedDateLabelFormatter.format(selectedDate)}.
        </p>
        <p className="text-xs text-[rgba(20,18,21,0.6)]">
          Minus disables a weekly default for this day. Trash removes a day-specific slot. Plus re-enables a disabled
          default. A gradient slot means weekly and day-specific availability overlap. Overlapping day-specific draws
          merge automatically.
        </p>

        <div className="mt-3 grid grid-cols-[3rem_minmax(0,1fr)] gap-2">
          <div className="relative" style={{ height: `${timelineHeightPx}px` }}>
            {timelineHourTicks.map((hour) => (
              <span
                key={hour}
                className="absolute right-1 text-[10px] text-[rgba(20,18,21,0.55)]"
                style={{ top: `${Math.max(0, minuteToY(hour * 60) - 7)}px` }}
              >
                {formatHourLabel(hour, clockFormat)}
              </span>
            ))}
          </div>

          <div
            className="relative touch-none overflow-hidden rounded-md border border-[rgba(20,18,21,0.12)] bg-white/85"
            style={{
              height: `${timelineHeightPx}px`,
              backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${timelineRowHeightPx - 1}px, rgba(20,18,21,0.07) ${timelineRowHeightPx - 1}px, rgba(20,18,21,0.07) ${timelineRowHeightPx}px)`,
            }}
            onPointerDown={handleDayTimelinePointerDown}
            onPointerMove={handleDayTimelinePointerMove}
            onPointerUp={handleDayTimelinePointerUp}
            onPointerCancel={handleDayTimelinePointerCancel}
          >
            {timelineHourTicks.map((hour) => (
              <span
                key={hour}
                className="pointer-events-none absolute inset-x-0 border-t border-[rgba(20,18,21,0.12)]"
                style={{ top: `${minuteToY(hour * 60)}px` }}
              />
            ))}

            {selectedDayTimelineBlocks.map((block) => {
              const top = minuteToY(block.startMinute);
              const height = Math.max(minSlotBlockHeightPx, minuteToY(block.endMinute) - minuteToY(block.startMinute));
              const actionTone = block.hasWeekly ? 'onDark' : 'default';
              const actionPaddingRight = Math.max(16, block.actions.length * 18 + 8);

              return (
                <div
                  key={`day-timeline-${block.displayId}`}
                  className={[
                    'pointer-events-none absolute right-1 left-1 rounded border px-2 text-left text-[10px] font-semibold',
                    block.hasWeekly && block.hasDaySpecific
                      ? 'border-[rgba(74,63,44,0.88)] bg-[linear-gradient(135deg,rgba(27,77,62,0.9)_0%,rgba(27,77,62,0.88)_46%,rgba(255,107,53,0.9)_54%,rgba(255,107,53,0.9)_100%)] text-white'
                      : block.hasWeekly
                        ? 'border-[rgba(27,77,62,0.8)] bg-[rgba(27,77,62,0.85)] text-white'
                        : 'border-[rgba(255,107,53,0.75)] bg-[rgba(255,107,53,0.85)] text-(--ink)',
                  ].join(' ')}
                  style={{ top: `${top}px`, height: `${height}px` }}
                  title={`${formatMinutesLabel(block.startMinute, clockFormat)} - ${formatMinutesLabel(block.endMinute, clockFormat)}${
                    block.hasWeekly && block.hasDaySpecific
                      ? ' · Weekly + day-specific (merged)'
                      : block.hasWeekly
                        ? ' · Weekly default'
                        : ' · Day-specific'
                  }`}
                >
                  <span className="block truncate leading-4" style={{ paddingRight: `${actionPaddingRight}px` }}>
                    {formatMinutesLabel(block.startMinute, clockFormat)} -{' '}
                    {formatMinutesLabel(block.endMinute, clockFormat)}
                  </span>
                  <div className="pointer-events-auto absolute top-0 right-0 flex items-center gap-0.5 pr-px">
                    {block.actions.map((action) => (
                      <ActionIconButton
                        key={action.key}
                        label={
                          action.variant === 'disable'
                            ? `Disable weekly default ${formatMinutesLabel(action.slot.startMinute, clockFormat)} - ${formatMinutesLabel(action.slot.endMinute, clockFormat)}`
                            : `Delete day-specific slot ${formatMinutesLabel(action.slot.startMinute, clockFormat)} - ${formatMinutesLabel(action.slot.endMinute, clockFormat)}`
                        }
                        variant={action.variant}
                        tone={actionTone}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (action.variant === 'disable') {
                            onDisableWeeklySlotForDay({
                              dateKey: selectedDateKey,
                              startMinute: action.slot.startMinute,
                              endMinute: action.slot.endMinute,
                              type: action.slot.type,
                              groupId: action.slot.groupId ?? null,
                            });
                          } else {
                            onDeleteSlot(action.slot.sourceIndex);
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {selectedDayDisabledDefaults.map((entry) => {
              const top = minuteToY(entry.startMinute);
              const height = Math.max(minSlotBlockHeightPx, minuteToY(entry.endMinute) - minuteToY(entry.startMinute));

              return (
                <div
                  key={`day-disabled-${entry.slot.id}-${entry.index}`}
                  className="pointer-events-none absolute right-1 left-1 rounded border border-dashed border-[rgba(20,18,21,0.35)] bg-[rgba(20,18,21,0.08)] px-2 text-left text-[10px] font-semibold text-[rgba(20,18,21,0.75)]"
                  style={{ top: `${top}px`, height: `${height}px` }}
                  title={`${formatMinutesLabel(entry.startMinute, clockFormat)} - ${formatMinutesLabel(entry.endMinute, clockFormat)} · Disabled default`}
                >
                  <span className="block truncate pr-4 leading-4">
                    {formatMinutesLabel(entry.startMinute, clockFormat)} -{' '}
                    {formatMinutesLabel(entry.endMinute, clockFormat)}
                  </span>
                  <div className="pointer-events-auto absolute top-0 right-0">
                    <ActionIconButton
                      label="Enable default for this day"
                      variant="enable"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEnableWeeklySlotForDay(entry.index);
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {dayDraftRange ? (
              <div
                className="pointer-events-none absolute right-1 left-1 rounded border border-dashed border-(--ring) bg-[rgba(27,77,62,0.18)]"
                style={{
                  top: `${minuteToY(dayDraftRange.startMinute)}px`,
                  height: `${Math.max(
                    12,
                    minuteToY(dayDraftRange.endMinute) - minuteToY(dayDraftRange.startMinute),
                  )}px`,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-[rgba(20,18,21,0.12)] bg-[rgba(20,18,21,0.02)] p-3">
        <div>
          <p className="text-xs tracking-[0.25em] text-[rgba(20,18,21,0.5)] uppercase">Weekly Timeline</p>
          <p className="text-sm text-[rgba(20,18,21,0.7)]">
            Draw your default weekly slots. Use the trash icon to remove a weekly slot. Overlapping draws merge
            automatically. Hold Ctrl (or Cmd) while drawing to apply a slot to every weekday.
          </p>
        </div>

        <div className="mt-3 overflow-x-auto pb-1 md:overflow-x-visible md:pb-0">
          <div className="min-w-230 md:min-w-0">
            <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-2">
              <span className="text-[11px] text-[rgba(20,18,21,0.45)]" />
              {orderedWeekDaysShort.map((day) => (
                <p key={day} className="text-center text-[11px] tracking-[0.2em] text-[rgba(20,18,21,0.5)] uppercase">
                  {day}
                </p>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-2">
              <div className="relative" style={{ height: `${timelineHeightPx}px` }}>
                {timelineHourTicks.map((hour) => (
                  <span
                    key={hour}
                    className="absolute right-1 text-[10px] text-[rgba(20,18,21,0.55)]"
                    style={{
                      top: `${Math.max(0, minuteToY(hour * 60) - 7)}px`,
                    }}
                  >
                    {formatHourLabel(hour, clockFormat)}
                  </span>
                ))}
              </div>

              {orderedWeekdayIndexes.map((weekday) => {
                const label = weekDayLabels[weekday];
                const dayTemplates = weeklyTemplatesByWeekday.get(weekday) ?? [];
                const draftRange =
                  weekDrawState && weekDrawState.weekday === weekday
                    ? normalizeDrawRange(weekDrawState.anchorMinute, weekDrawState.currentMinute)
                    : null;

                return (
                  <div
                    key={label}
                    className="relative touch-none overflow-hidden rounded-md border border-[rgba(20,18,21,0.12)] bg-white/85"
                    style={{
                      height: `${timelineHeightPx}px`,
                      backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${timelineRowHeightPx - 1}px, rgba(20,18,21,0.07) ${timelineRowHeightPx - 1}px, rgba(20,18,21,0.07) ${timelineRowHeightPx}px)`,
                    }}
                    onPointerDown={(event) => handleWeekTimelinePointerDown(weekday, event)}
                    onPointerMove={(event) => handleWeekTimelinePointerMove(weekday, event)}
                    onPointerUp={(event) => handleWeekTimelinePointerUp(weekday, event)}
                    onPointerCancel={(event) => handleWeekTimelinePointerCancel(weekday, event)}
                  >
                    {timelineHourTicks.map((hour) => (
                      <span
                        key={hour}
                        className="pointer-events-none absolute inset-x-0 border-t border-[rgba(20,18,21,0.12)]"
                        style={{ top: `${minuteToY(hour * 60)}px` }}
                      />
                    ))}

                    {dayTemplates.map((entry) => {
                      const clippedStart = clampMinute(entry.startMinute);
                      const clippedEnd = clampMinute(entry.endMinute);
                      if (clippedEnd <= clippedStart) return null;
                      const top = minuteToY(clippedStart);
                      const height = Math.max(minSlotBlockHeightPx, minuteToY(clippedEnd) - minuteToY(clippedStart));

                      return (
                        <div
                          key={`${entry.slot.id}-${entry.index}`}
                          className={[
                            'pointer-events-none absolute right-1 left-1 rounded border px-2 text-left text-[10px] font-semibold',
                            entry.enabled
                              ? 'border-[rgba(27,77,62,0.8)] bg-[rgba(27,77,62,0.9)] text-white'
                              : 'border-[rgba(20,18,21,0.25)] bg-[rgba(20,18,21,0.18)] text-[rgba(20,18,21,0.85)]',
                          ].join(' ')}
                          style={{ top: `${top}px`, height: `${height}px` }}
                        >
                          <span className="block truncate pr-4 leading-4">
                            {formatMinutesLabel(entry.startMinute, clockFormat)} -{' '}
                            {formatMinutesLabel(entry.endMinute, clockFormat)}
                          </span>
                          <div className="pointer-events-auto absolute top-0 right-0">
                            <ActionIconButton
                              label="Delete weekly slot"
                              variant="delete"
                              tone={entry.enabled ? 'onDark' : 'default'}
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeleteSlot(entry.index);
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}

                    {draftRange ? (
                      <div
                        className="pointer-events-none absolute right-1 left-1 rounded border border-dashed border-(--ring) bg-[rgba(27,77,62,0.18)]"
                        style={{
                          top: `${minuteToY(draftRange.startMinute)}px`,
                          height: `${Math.max(
                            12,
                            minuteToY(draftRange.endMinute) - minuteToY(draftRange.startMinute),
                          )}px`,
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

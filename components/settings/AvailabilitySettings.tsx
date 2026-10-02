'use client';

import { UserScheduleCalendar } from '@/components/settings/UserScheduleCalendar';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { useCancelableEffect } from '@/hooks/useCancelableEffect';
import { getErrorMessage } from '@/lib/webui/api/client';
import { userProfileSchema } from '@/lib/webui/api/schemas';
import type { AvailabilitySlot, GroupSummary } from '@/lib/webui/api/types';
import { updateAvailability } from '@/lib/webui/mutations/calendar';
import { fetchAvailability } from '@/lib/webui/queries/calendar';
import { fetchGroups } from '@/lib/webui/queries/groups';
import { fetchUserProfile } from '@/lib/webui/queries/user';
import {
  buildDayOffOverrideRule,
  buildDaySlotSignature,
  buildWeeklyTemplateRule,
  isDayOffOverrideSlot,
  isOneOffAvailabilitySlot,
  minutesSinceMidnight,
  parseDateKey,
  parseWeeklyTemplateRule,
  rangesOverlap,
  slotEndMinute,
  toDateKeyFromIso,
  toIsoForDateKeyAndMinute,
} from '@/lib/webui/weeklyTemplateUtils';
import { useCallback, useEffect, useMemo, useState } from 'react';

type DayInterval = {
  startMinute: number;
  endMinute: number;
};

type DayContext = {
  activeIntervals: DayInterval[];
  dayOffSignatures: Set<string>;
};

const minimumSlotMinutes = 30;

function normalizeRange(startMinute: number, endMinute: number) {
  const boundedStart = Math.max(0, Math.min(startMinute, 24 * 60 - minimumSlotMinutes));
  const boundedEnd = Math.max(boundedStart + minimumSlotMinutes, Math.min(endMinute, 24 * 60));
  return {
    startMinute: boundedStart,
    endMinute: boundedEnd,
  };
}

function rangesOverlapOrTouch(startA: number, endA: number, startB: number, endB: number) {
  return startA <= endB && startB <= endA;
}

function serializeSlotsForDirtyCheck(inputSlots: AvailabilitySlot[]) {
  const normalized = inputSlots
    .map((slot) => ({
      startAt: slot.startAt,
      endAt: slot.endAt,
      type: slot.type,
      groupId: slot.groupId ?? null,
      recurringRule: slot.recurringRule ?? null,
    }))
    .toSorted(
      (a, b) =>
        a.startAt.localeCompare(b.startAt) ||
        a.endAt.localeCompare(b.endAt) ||
        a.type.localeCompare(b.type) ||
        (a.groupId ?? '').localeCompare(b.groupId ?? '') ||
        (a.recurringRule ?? '').localeCompare(b.recurringRule ?? ''),
    );

  return JSON.stringify(normalized);
}

function getDayContext(currentSlots: AvailabilitySlot[], dateKey: string, timezone: string): DayContext {
  const dayOffSignatures = new Set<string>();
  const activeIntervals: DayInterval[] = [];
  const weekday = parseDateKey(dateKey).getDay();

  const weeklyEntries: Array<{
    weekday: number;
    enabled: boolean;
    startMinute: number;
    endMinute: number;
    type: AvailabilitySlot['type'];
    groupId?: string | null;
  }> = [];

  for (const slot of currentSlots) {
    const parsedRule = parseWeeklyTemplateRule(slot.recurringRule);
    if (parsedRule) {
      const startMinute = minutesSinceMidnight(slot.startAt, timezone);
      const endMinute = Math.max(startMinute + minimumSlotMinutes, slotEndMinute(slot.startAt, slot.endAt, timezone));

      weeklyEntries.push({
        weekday: parsedRule.weekday,
        enabled: parsedRule.enabled,
        startMinute,
        endMinute,
        type: slot.type,
        groupId: slot.groupId ?? null,
      });
      continue;
    }

    const slotDateKey = toDateKeyFromIso(slot.startAt, timezone);
    if (slotDateKey !== dateKey) continue;

    const startMinute = minutesSinceMidnight(slot.startAt, timezone);
    const endMinute = Math.max(startMinute + minimumSlotMinutes, slotEndMinute(slot.startAt, slot.endAt, timezone));

    if (isDayOffOverrideSlot(slot)) {
      dayOffSignatures.add(
        buildDaySlotSignature({
          dateKey,
          startMinute,
          endMinute,
          type: slot.type,
          groupId: slot.groupId ?? null,
        }),
      );
      continue;
    }

    activeIntervals.push({ startMinute, endMinute });
  }

  for (const entry of weeklyEntries) {
    if (!entry.enabled || entry.weekday !== weekday) continue;
    const signature = buildDaySlotSignature({
      dateKey,
      startMinute: entry.startMinute,
      endMinute: entry.endMinute,
      type: entry.type,
      groupId: entry.groupId ?? null,
    });

    if (dayOffSignatures.has(signature)) continue;
    activeIntervals.push({
      startMinute: entry.startMinute,
      endMinute: entry.endMinute,
    });
  }

  return {
    activeIntervals,
    dayOffSignatures,
  };
}

function mergeWeeklySlotInto(
  currentSlots: AvailabilitySlot[],
  weekday: number,
  startMinute: number,
  endMinute: number,
  timezone: string,
): { nextSlots: AvailabilitySlot[]; error: string | null } {
  const range = normalizeRange(startMinute, endMinute);
  const newSlotType: AvailabilitySlot['type'] = 'lunch';
  const newSlotGroupId: string | null = null;
  const mergeableIndices = new Set<number>();
  let mergedStart = range.startMinute;
  let mergedEnd = range.endMinute;
  let hasIncompatibleOverlap = false;
  let expanded = true;

  while (expanded) {
    expanded = false;

    for (const [index, slot] of currentSlots.entries()) {
      const parsedRule = parseWeeklyTemplateRule(slot.recurringRule);
      if (!parsedRule || parsedRule.weekday !== weekday || !parsedRule.enabled) {
        continue;
      }

      const existingStart = minutesSinceMidnight(slot.startAt, timezone);
      const existingEnd = Math.max(
        existingStart + minimumSlotMinutes,
        slotEndMinute(slot.startAt, slot.endAt, timezone),
      );

      if (!rangesOverlapOrTouch(mergedStart, mergedEnd, existingStart, existingEnd)) {
        continue;
      }

      if (slot.type !== newSlotType || (slot.groupId ?? null) !== newSlotGroupId) {
        hasIncompatibleOverlap = true;
        continue;
      }

      mergeableIndices.add(index);

      const nextStart = Math.min(mergedStart, existingStart);
      const nextEnd = Math.max(mergedEnd, existingEnd);

      if (nextStart !== mergedStart || nextEnd !== mergedEnd) {
        mergedStart = nextStart;
        mergedEnd = nextEnd;
        expanded = true;
      }
    }
  }

  if (hasIncompatibleOverlap) {
    return {
      nextSlots: currentSlots,
      error: 'Overlapping weekly slots with different type/group cannot be auto-merged.',
    };
  }

  const todayKey = toDateKeyFromIso(new Date().toISOString(), timezone);
  const anchorDate = new Date(`${todayKey}T00:00:00Z`);
  anchorDate.setUTCDate(anchorDate.getUTCDate() + weekday - anchorDate.getUTCDay());
  const dateKey = anchorDate.toISOString().slice(0, 10);
  const startAt = toIsoForDateKeyAndMinute(dateKey, mergedStart, timezone);
  const endAt = toIsoForDateKeyAndMinute(dateKey, mergedEnd, timezone);
  if (!startAt || !endAt) {
    return { nextSlots: currentSlots, error: 'That local time does not exist on this date. Choose another time.' };
  }

  const nextSlots = currentSlots.filter((_, index) => !mergeableIndices.has(index));
  nextSlots.push({
    id: `local-weekly-${weekday}-${mergedStart}-${mergedEnd}-${Date.now()}`,
    userId: 'me',
    startAt,
    endAt,
    type: newSlotType,
    groupId: newSlotGroupId ?? null,
    recurringRule: buildWeeklyTemplateRule(weekday, true),
  });

  return {
    nextSlots,
    error: null,
  };
}

export function AvailabilitySettings() {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'error' | 'saved'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [weekStartDay, setWeekStartDay] = useState<'monday' | 'sunday'>('monday');
  const [timezone, setTimezone] = useState('UTC');
  const [clockFormat, setClockFormat] = useState<'h24' | 'ampm'>('h24');
  const [lastSavedSignature, setLastSavedSignature] = useState('');
  const [loaded, setLoaded] = useState(false);
  const slotSignature = useMemo(() => serializeSlotsForDirtyCheck(slots), [slots]);
  const hasUnsavedChanges = loaded && slotSignature !== lastSavedSignature;

  useEffect(() => {
    const updatePreferences = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      const result = userProfileSchema.safeParse(detail);
      if (!result.success) return;
      const profile = result.data;
      setTimezone(profile.timezone || 'UTC');
      if (profile.weekStartDay) setWeekStartDay(profile.weekStartDay);
      if (profile.clockFormat) setClockFormat(profile.clockFormat);
    };
    window.addEventListener('lotterylunch:profile-updated', updatePreferences);
    return () => window.removeEventListener('lotterylunch:profile-updated', updatePreferences);
  }, []);

  const reload = useCancelableEffect(
    useCallback((isCancelled, signal) => {
      Promise.allSettled([fetchAvailability(undefined, signal), fetchGroups(signal), fetchUserProfile(signal)])
        .then((results) => {
          if (isCancelled()) return;
          const [availabilityResult, groupsResult, profileResult] = results;

          if (availabilityResult.status === 'fulfilled' && profileResult.status === 'fulfilled') {
            setSlots(availabilityResult.value);
            setLastSavedSignature(serializeSlotsForDirtyCheck(availabilityResult.value));
            setTimezone(profileResult.value.timezone || 'UTC');
            setError(null);
            setStatus('idle');
            setLoaded(true);
          } else {
            const reason: unknown =
              availabilityResult.status === 'rejected'
                ? availabilityResult.reason
                : profileResult.status === 'rejected'
                  ? profileResult.reason
                  : null;
            setError(getErrorMessage(reason, 'Unable to load preferred times and time zone.'));
            setStatus('error');
            setLoaded(false);
          }

          if (groupsResult.status === 'fulfilled') {
            setGroups(groupsResult.value);
            setGroupError(null);
          } else {
            setGroupError(getErrorMessage(groupsResult.reason, 'Unable to load groups.'));
          }

          if (profileResult.status === 'fulfilled') {
            if (profileResult.value.weekStartDay) {
              setWeekStartDay(profileResult.value.weekStartDay);
            }
            if (profileResult.value.clockFormat) {
              setClockFormat(profileResult.value.clockFormat);
            }
          }
        })
        .catch((err) => {
          if (isCancelled()) return;
          setError(getErrorMessage(err, 'Unable to load preferred times.'));
          setStatus('error');
        });
    }, []),
  );

  const createWeeklySlot = (weekday: number, startMinute: number, endMinute: number) => {
    const result = mergeWeeklySlotInto(slots, weekday, startMinute, endMinute, timezone);
    if (result.error) {
      setError(result.error);
      return;
    }

    setSlots(result.nextSlots);
    setError(null);
    setStatus('idle');
  };

  const createWeeklySlotForAllWeekdays = (startMinute: number, endMinute: number) => {
    let nextSlots = slots;

    for (let weekday = 0; weekday < 7; weekday += 1) {
      const result = mergeWeeklySlotInto(nextSlots, weekday, startMinute, endMinute, timezone);
      if (result.error) {
        setError(result.error);
        return;
      }
      nextSlots = result.nextSlots;
    }

    setSlots(nextSlots);

    setError(null);
    setStatus('idle');
  };

  const createDaySlot = (dateKey: string, startMinute: number, endMinute: number) => {
    const range = normalizeRange(startMinute, endMinute);
    const newSlotType: AvailabilitySlot['type'] = 'lunch';
    const newSlotGroupId: string | null = null;
    const mergeableIndices = new Set<number>();
    let mergedStart = range.startMinute;
    let mergedEnd = range.endMinute;
    let hasIncompatibleOverlap = false;
    let expanded = true;

    while (expanded) {
      expanded = false;

      for (const [index, slot] of slots.entries()) {
        if (!isOneOffAvailabilitySlot(slot)) continue;
        if (toDateKeyFromIso(slot.startAt, timezone) !== dateKey) continue;

        const existingStart = minutesSinceMidnight(slot.startAt, timezone);
        const existingEnd = Math.max(
          existingStart + minimumSlotMinutes,
          slotEndMinute(slot.startAt, slot.endAt, timezone),
        );

        if (!rangesOverlapOrTouch(mergedStart, mergedEnd, existingStart, existingEnd)) {
          continue;
        }

        if (slot.type !== newSlotType || (slot.groupId ?? null) !== newSlotGroupId) {
          hasIncompatibleOverlap = true;
          continue;
        }

        mergeableIndices.add(index);

        const nextStart = Math.min(mergedStart, existingStart);
        const nextEnd = Math.max(mergedEnd, existingEnd);

        if (nextStart !== mergedStart || nextEnd !== mergedEnd) {
          mergedStart = nextStart;
          mergedEnd = nextEnd;
          expanded = true;
        }
      }
    }

    if (hasIncompatibleOverlap) {
      setError('Overlapping day-specific slots with different type/group cannot be auto-merged.');
      return;
    }

    const startAt = toIsoForDateKeyAndMinute(dateKey, mergedStart, timezone);
    const endAt = toIsoForDateKeyAndMinute(dateKey, mergedEnd, timezone);
    if (!startAt || !endAt) {
      setError('That local time does not exist on this date. Choose another time.');
      return;
    }
    const nextSlots = slots.filter((_, index) => !mergeableIndices.has(index));

    setSlots([
      ...nextSlots,
      {
        id: `local-day-${dateKey}-${mergedStart}-${mergedEnd}-${Date.now()}`,
        userId: 'me',
        startAt,
        endAt,
        type: newSlotType,
        groupId: newSlotGroupId ?? null,
      },
    ]);

    setError(null);
    setStatus('idle');
  };

  const disableWeeklySlotForDay = (input: {
    dateKey: string;
    startMinute: number;
    endMinute: number;
    type: AvailabilitySlot['type'];
    groupId?: string | null;
  }) => {
    const signature = buildDaySlotSignature(input);
    const dayContext = getDayContext(slots, input.dateKey, timezone);

    if (dayContext.dayOffSignatures.has(signature)) {
      return;
    }

    const startAt = toIsoForDateKeyAndMinute(input.dateKey, input.startMinute, timezone);
    const endAt = toIsoForDateKeyAndMinute(input.dateKey, input.endMinute, timezone);
    if (!startAt || !endAt) {
      setError('That local time does not exist on this date. Choose another time.');
      return;
    }
    setSlots((current) => [
      ...current,
      {
        id: `local-day-off-${input.dateKey}-${current.length}`,
        userId: 'me',
        startAt,
        endAt,
        type: input.type,
        groupId: input.groupId ?? null,
        recurringRule: buildDayOffOverrideRule(),
      },
    ]);

    setError(null);
    setStatus('idle');
  };

  const enableWeeklySlotForDay = (overrideIndex: number) => {
    const overrideSlot = slots[overrideIndex];
    if (!overrideSlot || !isDayOffOverrideSlot(overrideSlot)) return;

    const dateKey = toDateKeyFromIso(overrideSlot.startAt, timezone);
    const startMinute = minutesSinceMidnight(overrideSlot.startAt, timezone);
    const endMinute = Math.max(
      startMinute + minimumSlotMinutes,
      slotEndMinute(overrideSlot.startAt, overrideSlot.endAt, timezone),
    );

    const dayContext = getDayContext(slots, dateKey, timezone);

    const hasOverlap = dayContext.activeIntervals.some((interval) =>
      rangesOverlap(startMinute, endMinute, interval.startMinute, interval.endMinute),
    );

    if (hasOverlap) {
      setError('Cannot enable this default slot because it would overlap another slot on that day.');
      return;
    }

    setSlots((current) => current.filter((_, index) => index !== overrideIndex));
    setError(null);
    setStatus('idle');
  };

  const deleteSlot = (index: number) => {
    setSlots((current) => {
      const slotToDelete = current[index];
      if (!slotToDelete) return current;

      const withoutDeleted = current.filter((_, idx) => idx !== index);
      const weeklyRule = parseWeeklyTemplateRule(slotToDelete.recurringRule);
      if (!weeklyRule) return withoutDeleted;

      const deletedStartMinute = minutesSinceMidnight(slotToDelete.startAt, timezone);
      const deletedEndMinute = Math.max(
        deletedStartMinute + minimumSlotMinutes,
        slotEndMinute(slotToDelete.startAt, slotToDelete.endAt, timezone),
      );
      const deletedGroupId = slotToDelete.groupId ?? null;

      return withoutDeleted.filter((slot) => {
        if (!isDayOffOverrideSlot(slot)) return true;
        if (parseDateKey(toDateKeyFromIso(slot.startAt, timezone)).getDay() !== weeklyRule.weekday) return true;

        const startMinute = minutesSinceMidnight(slot.startAt, timezone);
        const endMinute = Math.max(startMinute + minimumSlotMinutes, slotEndMinute(slot.startAt, slot.endAt, timezone));

        return !(
          startMinute === deletedStartMinute &&
          endMinute === deletedEndMinute &&
          slot.type === slotToDelete.type &&
          (slot.groupId ?? null) === deletedGroupId
        );
      });
    });
    setError(null);
    setStatus('idle');
  };

  const handleSave = async () => {
    if (!loaded || status === 'saving' || !hasUnsavedChanges) return;
    const signatureAtSaveStart = slotSignature;
    setStatus('saving');
    setError(null);
    try {
      await updateAvailability(
        slots.map(({ startAt, endAt, type, groupId, recurringRule }) => ({
          startAt,
          endAt,
          type,
          ...(groupId ? { groupId } : {}),
          ...(typeof recurringRule === 'string' ? { recurringRule } : {}),
        })),
      );
      setLastSavedSignature(signatureAtSaveStart);
      setStatus('saved');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to save preferred times.'));
      setStatus('error');
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs tracking-[0.3em] text-(--moss) uppercase">Times</p>
        <h2 className="text-2xl font-semibold">Preferred times</h2>
        <p className="mt-1 text-sm text-[rgba(20,18,21,0.7)]">
          Weekly timeline is your default. Use the calendar to disable a default on a specific date or add one-off
          slots. Times use your profile time zone, {timezone}.
        </p>
      </div>

      {loaded ? (
        <div inert={status === 'saving'} aria-busy={status === 'saving'}>
          <UserScheduleCalendar
            key={timezone}
            timezone={timezone}
            slots={slots}
            groups={groups}
            weekStartDay={weekStartDay}
            clockFormat={clockFormat}
            onCreateWeeklySlot={createWeeklySlot}
            onCreateWeeklySlotForAllWeekdays={createWeeklySlotForAllWeekdays}
            onDeleteSlot={deleteSlot}
            onCreateDaySlot={createDaySlot}
            onDisableWeeklySlotForDay={disableWeeklySlotForDay}
            onEnableWeeklySlotForDay={enableWeeklySlotForDay}
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {loaded ? (
          <span
            className={[
              'inline-flex rounded-sm px-2 py-1 text-xs font-semibold',
              hasUnsavedChanges
                ? 'bg-[rgba(255,107,53,0.14)] text-[rgba(132,58,22,1)]'
                : 'bg-[rgba(27,77,62,0.12)] text-[rgba(20,70,56,0.96)]',
            ].join(' ')}
          >
            {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void handleSave();
          }}
          disabled={!loaded || status === 'saving' || !hasUnsavedChanges}
        >
          {status === 'saving' ? 'Saving...' : 'Save availability'}
        </Button>
      </div>

      {status === 'loading' ? <Notice>Loading preferred times...</Notice> : null}
      {status === 'saved' && !hasUnsavedChanges ? <Notice>Preferred times saved.</Notice> : null}
      {error ? <Notice role="alert">{error}</Notice> : null}
      {!loaded && error ? (
        <div>
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              setStatus('loading');
              reload();
            }}
          >
            Retry loading preferred times
          </Button>
        </div>
      ) : null}
      {groupError ? <Notice role="alert">{groupError}</Notice> : null}
    </div>
  );
}

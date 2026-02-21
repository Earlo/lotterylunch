'use client';

import type { ApiError } from '@/webui/api/client';
import type { AvailabilitySlot, GroupSummary } from '@/webui/api/types';
import { UserScheduleCalendar } from '@/webui/components/settings/UserScheduleCalendar';
import {
  buildDayOffOverrideRule,
  buildDaySlotSignature,
  buildWeeklyTemplateRule,
  isDayOffOverrideSlot,
  isOneOffAvailabilitySlot,
  minutesSinceMidnight,
  parseWeeklyTemplateRule,
  rangesOverlap,
  toDateKeyFromIso,
} from '@/webui/components/settings/weeklyTemplateUtils';
import { Button } from '@/webui/components/ui/Button';
import { Notice } from '@/webui/components/ui/Notice';
import { useCancelableEffect } from '@/webui/hooks/useCancelableEffect';
import { updateAvailability } from '@/webui/mutations/calendar';
import { fetchAvailability } from '@/webui/queries/calendar';
import { fetchGroups } from '@/webui/queries/groups';
import { fetchUserProfile } from '@/webui/queries/user';
import { useMemo, useState } from 'react';

type DayInterval = {
  startMinute: number;
  endMinute: number;
};

type DayContext = {
  activeIntervals: DayInterval[];
  dayOffSignatures: Set<string>;
};

const minimumSlotMinutes = 30;

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function normalizeRange(startMinute: number, endMinute: number) {
  const boundedStart = Math.max(0, Math.min(startMinute, 24 * 60 - minimumSlotMinutes));
  const boundedEnd = Math.max(
    boundedStart + minimumSlotMinutes,
    Math.min(endMinute, 24 * 60),
  );
  return {
    startMinute: boundedStart,
    endMinute: boundedEnd,
  };
}

function rangesOverlapOrTouch(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return startA <= endB && startB <= endA;
}

function toIsoForDateKeyAndMinute(dateKey: string, minute: number) {
  const date = parseDateKey(dateKey);
  date.setHours(0, 0, 0, 0);
  date.setMinutes(minute);
  return date.toISOString();
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
    .sort(
      (a, b) =>
        a.startAt.localeCompare(b.startAt) ||
        a.endAt.localeCompare(b.endAt) ||
        a.type.localeCompare(b.type) ||
        (a.groupId ?? '').localeCompare(b.groupId ?? '') ||
        (a.recurringRule ?? '').localeCompare(b.recurringRule ?? ''),
    );

  return JSON.stringify(normalized);
}

export function AvailabilitySettings() {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'saving' | 'error' | 'saved'
  >('loading');
  const [error, setError] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [weekStartDay, setWeekStartDay] = useState<'monday' | 'sunday'>(
    'monday',
  );
  const [clockFormat, setClockFormat] = useState<'h24' | 'ampm'>('h24');
  const [lastSavedSignature, setLastSavedSignature] = useState('');
  const slotSignature = useMemo(() => serializeSlotsForDirtyCheck(slots), [slots]);
  const hasUnsavedChanges =
    status !== 'loading' && slotSignature !== lastSavedSignature;

  useCancelableEffect((isCancelled) => {
    Promise.allSettled([fetchAvailability(), fetchGroups(), fetchUserProfile()])
      .then((results) => {
        if (isCancelled()) return;
        const [availabilityResult, groupsResult, profileResult] = results;

        if (availabilityResult.status === 'fulfilled') {
          setSlots(availabilityResult.value);
          setLastSavedSignature(
            serializeSlotsForDirtyCheck(availabilityResult.value),
          );
          setError(null);
          setStatus('idle');
        } else {
          const apiError = availabilityResult.reason as ApiError;
          setError(apiError.message ?? 'Unable to load preferred times.');
          setStatus('error');
        }

        if (groupsResult.status === 'fulfilled') {
          setGroups(groupsResult.value);
          setGroupError(null);
        } else {
          const apiError = groupsResult.reason as ApiError;
          setGroupError(apiError.message ?? 'Unable to load groups.');
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
        const apiError = err as ApiError;
        setError(apiError.message ?? 'Unable to load preferred times.');
        setStatus('error');
      });
  }, []);

  const getDayContext = (
    currentSlots: AvailabilitySlot[],
    dateKey: string,
  ): DayContext => {
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
        const startMinute = minutesSinceMidnight(slot.startAt);
        const endMinute = Math.max(
          startMinute + minimumSlotMinutes,
          minutesSinceMidnight(slot.endAt),
        );

        weeklyEntries.push({
          weekday: parsedRule.weekday,
          enabled: parsedRule.enabled,
          startMinute,
          endMinute,
          type: slot.type,
          groupId: slot.groupId,
        });
        continue;
      }

      const slotDateKey = toDateKeyFromIso(slot.startAt);
      if (slotDateKey !== dateKey) continue;

      const startMinute = minutesSinceMidnight(slot.startAt);
      const endMinute = Math.max(
        startMinute + minimumSlotMinutes,
        minutesSinceMidnight(slot.endAt),
      );

      if (isDayOffOverrideSlot(slot)) {
        dayOffSignatures.add(
          buildDaySlotSignature({
            dateKey,
            startMinute,
            endMinute,
            type: slot.type,
            groupId: slot.groupId,
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
        groupId: entry.groupId,
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
  };

  const mergeWeeklySlotInto = (
    currentSlots: AvailabilitySlot[],
    weekday: number,
    startMinute: number,
    endMinute: number,
  ): { nextSlots: AvailabilitySlot[]; error: string | null } => {
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

        const existingStart = minutesSinceMidnight(slot.startAt);
        const existingEnd = Math.max(
          existingStart + minimumSlotMinutes,
          minutesSinceMidnight(slot.endAt),
        );

        if (
          !rangesOverlapOrTouch(
            mergedStart,
            mergedEnd,
            existingStart,
            existingEnd,
          )
        ) {
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

    const now = new Date();
    const anchorDate = new Date(now);
    anchorDate.setHours(0, 0, 0, 0);
    anchorDate.setDate(now.getDate() + weekday - now.getDay());
    const startAt = new Date(anchorDate);
    startAt.setMinutes(mergedStart);
    const endAt = new Date(anchorDate);
    endAt.setMinutes(mergedEnd);

    const nextSlots = currentSlots.filter((_, index) => !mergeableIndices.has(index));
    nextSlots.push({
      id: `local-weekly-${weekday}-${mergedStart}-${mergedEnd}-${Date.now()}`,
      userId: 'me',
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      type: newSlotType,
      groupId: newSlotGroupId,
      recurringRule: buildWeeklyTemplateRule(weekday, true),
    });

    return {
      nextSlots,
      error: null,
    };
  };

  const createWeeklySlot = (
    weekday: number,
    startMinute: number,
    endMinute: number,
  ) => {
    const result = mergeWeeklySlotInto(slots, weekday, startMinute, endMinute);
    if (result.error) {
      setError(result.error);
      return;
    }

    setSlots(result.nextSlots);
    setError(null);
    setStatus('idle');
  };

  const createWeeklySlotForAllWeekdays = (
    startMinute: number,
    endMinute: number,
  ) => {
    let nextSlots = slots;

    for (let weekday = 0; weekday < 7; weekday += 1) {
      const result = mergeWeeklySlotInto(nextSlots, weekday, startMinute, endMinute);
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

  const createDaySlot = (
    dateKey: string,
    startMinute: number,
    endMinute: number,
  ) => {
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
        if (toDateKeyFromIso(slot.startAt) !== dateKey) continue;

        const existingStart = minutesSinceMidnight(slot.startAt);
        const existingEnd = Math.max(
          existingStart + minimumSlotMinutes,
          minutesSinceMidnight(slot.endAt),
        );

        if (
          !rangesOverlapOrTouch(
            mergedStart,
            mergedEnd,
            existingStart,
            existingEnd,
          )
        ) {
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
      setError(
        'Overlapping day-specific slots with different type/group cannot be auto-merged.',
      );
      return;
    }

    const nextSlots = slots.filter((_, index) => !mergeableIndices.has(index));

    setSlots([
      ...nextSlots,
      {
        id: `local-day-${dateKey}-${mergedStart}-${mergedEnd}-${Date.now()}`,
        userId: 'me',
        startAt: toIsoForDateKeyAndMinute(dateKey, mergedStart),
        endAt: toIsoForDateKeyAndMinute(dateKey, mergedEnd),
        type: newSlotType,
        groupId: newSlotGroupId,
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
    const dayContext = getDayContext(slots, input.dateKey);

    if (dayContext.dayOffSignatures.has(signature)) {
      return;
    }

    setSlots((current) => [
      ...current,
      {
        id: `local-day-off-${input.dateKey}-${current.length}`,
        userId: 'me',
        startAt: toIsoForDateKeyAndMinute(input.dateKey, input.startMinute),
        endAt: toIsoForDateKeyAndMinute(input.dateKey, input.endMinute),
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

    const dateKey = toDateKeyFromIso(overrideSlot.startAt);
    const startMinute = minutesSinceMidnight(overrideSlot.startAt);
    const endMinute = Math.max(
      startMinute + minimumSlotMinutes,
      minutesSinceMidnight(overrideSlot.endAt),
    );

    const dayContext = getDayContext(slots, dateKey);

    const hasOverlap = dayContext.activeIntervals.some((interval) =>
      rangesOverlap(startMinute, endMinute, interval.startMinute, interval.endMinute),
    );

    if (hasOverlap) {
      setError(
        'Cannot enable this default slot because it would overlap another slot on that day.',
      );
      return;
    }

    setSlots((current) =>
      current.filter((_, index) => index !== overrideIndex),
    );
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

      const deletedStartMinute = minutesSinceMidnight(slotToDelete.startAt);
      const deletedEndMinute = Math.max(
        deletedStartMinute + minimumSlotMinutes,
        minutesSinceMidnight(slotToDelete.endAt),
      );
      const deletedGroupId = slotToDelete.groupId ?? null;

      return withoutDeleted.filter((slot) => {
        if (!isDayOffOverrideSlot(slot)) return true;
        if (new Date(slot.startAt).getDay() !== weeklyRule.weekday) return true;

        const startMinute = minutesSinceMidnight(slot.startAt);
        const endMinute = Math.max(
          startMinute + minimumSlotMinutes,
          minutesSinceMidnight(slot.endAt),
        );

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
    const signatureAtSaveStart = slotSignature;
    setStatus('saving');
    setError(null);
    try {
      await updateAvailability(
        slots.map(({ id, userId, groupId, recurringRule, ...rest }) => ({
          ...rest,
          ...(groupId ? { groupId } : {}),
          ...(typeof recurringRule === 'string' ? { recurringRule } : {}),
        })),
      );
      setLastSavedSignature(signatureAtSaveStart);
      setStatus('saved');
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to save preferred times.');
      setStatus('error');
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs tracking-[0.3em] text-(--moss) uppercase">
          Times
        </p>
        <h2 className="text-2xl font-semibold">Preferred times</h2>
        <p className="mt-1 text-sm text-[rgba(20,18,21,0.7)]">
          Weekly timeline is your default. Use the calendar to disable a default
          on a specific date or add one-off slots.
        </p>
      </div>

      <UserScheduleCalendar
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

      <div className="flex items-center gap-2">
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
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={status === 'saving' || !hasUnsavedChanges}
        >
          {status === 'saving' ? 'Saving...' : 'Save availability'}
        </Button>
      </div>

      {status === 'loading' ? <Notice>Loading preferred times...</Notice> : null}
      {status === 'saved' && !hasUnsavedChanges ? (
        <Notice>Preferred times saved.</Notice>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {groupError ? <Notice>{groupError}</Notice> : null}
    </div>
  );
}

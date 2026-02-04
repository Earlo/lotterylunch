'use client';

import type { ApiError } from '@/webui/api/client';
import type { AvailabilitySlot, GroupSummary } from '@/webui/api/types';
import { Button } from '@/webui/components/ui/Button';
import { Notice } from '@/webui/components/ui/Notice';
import { selectBaseStyles } from '@/webui/components/ui/formStyles';
import { useCancelableEffect } from '@/webui/hooks/useCancelableEffect';
import { updateAvailability } from '@/webui/mutations/calendar';
import { fetchAvailability } from '@/webui/queries/calendar';
import { fetchGroups } from '@/webui/queries/groups';
import { useState } from 'react';

const selectStyles = `${selectBaseStyles} px-3 py-2 text-xs`;

export function AvailabilitySettings() {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'saving' | 'error' | 'saved'
  >('loading');
  const [error, setError] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);

  useCancelableEffect((isCancelled) => {
    Promise.allSettled([fetchAvailability(), fetchGroups()])
      .then((results) => {
        if (isCancelled()) return;
        const [availabilityResult, groupsResult] = results;

        if (availabilityResult.status === 'fulfilled') {
          setSlots(availabilityResult.value);
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
      })
      .catch((err) => {
        if (isCancelled()) return;
        const apiError = err as ApiError;
        setError(apiError.message ?? 'Unable to load preferred times.');
        setStatus('error');
      });
  }, []);

  const addSlot = () => {
    setSlots((current) => [
      ...current,
      {
        id: `local-${current.length}`,
        userId: 'me',
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        type: 'lunch',
        groupId: null,
      },
    ]);
  };

  const updateSlot = <K extends keyof AvailabilitySlot>(
    index: number,
    key: K,
    value: AvailabilitySlot[K],
  ) => {
    setSlots((current) =>
      current.map((slot, idx) =>
        idx === index
          ? {
              ...slot,
              [key]: value,
            }
          : slot,
      ),
    );
  };

  const handleSave = async () => {
    setStatus('saving');
    setError(null);
    try {
      await updateAvailability(
        slots.map(({ id, userId, groupId, ...rest }) => ({
          ...rest,
          ...(groupId ? { groupId } : {}),
        })),
      );
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
          Add personal or group-specific windows so matches land at the right
          time.
        </p>
      </div>

      <div className="grid gap-3">
        {slots.length > 0 ? (
          <div className="hidden text-[10px] uppercase tracking-[0.3em] text-[rgba(20,18,21,0.5)] sm:grid sm:grid-cols-[1.1fr_1.1fr_0.8fr_1.2fr_1.2fr]">
            <span>Start</span>
            <span>End</span>
            <span>Type</span>
            <span>Applies to</span>
            <span>Recurs</span>
          </div>
        ) : null}
        {slots.map((slot, index) => (
          <div
            key={`${slot.id}-${index}`}
            className="grid gap-2 rounded-md border border-[rgba(20,18,21,0.12)] bg-white/70 p-3 sm:grid-cols-[1.1fr_1.1fr_0.8fr_1.2fr_1.2fr]"
          >
            <input
              className={selectStyles}
              type="datetime-local"
              value={slot.startAt.slice(0, 16)}
              onChange={(event) =>
                updateSlot(
                  index,
                  'startAt',
                  new Date(event.target.value).toISOString(),
                )
              }
            />
            <input
              className={selectStyles}
              type="datetime-local"
              value={slot.endAt.slice(0, 16)}
              onChange={(event) =>
                updateSlot(
                  index,
                  'endAt',
                  new Date(event.target.value).toISOString(),
                )
              }
            />
            <select
              className={selectStyles}
              value={slot.type}
              onChange={(event) =>
                updateSlot(index, 'type', event.target.value)
              }
            >
              <option value="coffee">Coffee</option>
              <option value="lunch">Lunch</option>
              <option value="afterwork">After work</option>
            </select>
            <select
              className={selectStyles}
              value={slot.groupId ?? ''}
              onChange={(event) =>
                updateSlot(index, 'groupId', event.target.value || null)
              }
            >
              <option value="">Personal (all groups)</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <input
              className={selectStyles}
              placeholder="RRULE (optional)"
              value={slot.recurringRule ?? ''}
              onChange={(event) =>
                updateSlot(index, 'recurringRule', event.target.value)
              }
            />
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={addSlot}>
            Add slot
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={status === 'saving'}
          >
            {status === 'saving' ? 'Saving...' : 'Save availability'}
          </Button>
        </div>
      </div>

      {status === 'loading' ? <Notice>Loading preferred times...</Notice> : null}
      {status === 'saved' ? <Notice>Preferred times saved.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {groupError ? <Notice>{groupError}</Notice> : null}
    </div>
  );
}

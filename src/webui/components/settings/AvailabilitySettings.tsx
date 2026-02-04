'use client';

import type { ApiError } from '@/webui/api/client';
import type { AvailabilitySlot } from '@/webui/api/types';
import { Button } from '@/webui/components/ui/Button';
import { Notice } from '@/webui/components/ui/Notice';
import { selectBaseStyles } from '@/webui/components/ui/formStyles';
import { updateAvailability } from '@/webui/mutations/calendar';
import { fetchAvailability } from '@/webui/queries/calendar';
import { useCancelableEffect } from '@/webui/hooks/useCancelableEffect';
import { useState } from 'react';

const selectStyles = `${selectBaseStyles} px-3 py-2 text-xs`;

export function AvailabilitySettings() {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'saving' | 'error' | 'saved'
  >('loading');
  const [error, setError] = useState<string | null>(null);

  useCancelableEffect((isCancelled) => {
    fetchAvailability()
      .then((data) => {
        if (isCancelled()) return;
        setSlots(data);
        setError(null);
        setStatus('idle');
      })
      .catch((err) => {
        if (isCancelled()) return;
        const apiError = err as ApiError;
        setError(apiError.message ?? 'Unable to load availability.');
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

  const updateSlot = (
    index: number,
    key: keyof AvailabilitySlot,
    value: string,
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
        slots.map(({ id, userId, ...rest }) => ({
          ...rest,
        })),
      );
      setStatus('saved');
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to save availability.');
      setStatus('error');
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs tracking-[0.3em] text-(--moss) uppercase">
          Availability
        </p>
        <h2 className="text-2xl font-semibold">Lunch windows</h2>
        <p className="mt-1 text-sm text-[rgba(20,18,21,0.7)]">
          Add recurring or one-off slots to help the matcher schedule meetings.
        </p>
      </div>

      <div className="grid gap-3">
        {slots.map((slot, index) => (
          <div
            key={`${slot.id}-${index}`}
            className="grid gap-2 rounded-md border border-[rgba(20,18,21,0.12)] bg-white/70 p-3 sm:grid-cols-4"
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

      {status === 'loading' ? <Notice>Loading availability...</Notice> : null}
      {status === 'saved' ? <Notice>Availability saved.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
    </div>
  );
}

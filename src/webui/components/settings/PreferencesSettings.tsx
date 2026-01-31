'use client';

import type { ApiError } from '@/webui/api/client';
import { Button } from '@/webui/components/ui/Button';
import { Notice } from '@/webui/components/ui/Notice';
import { updateUserProfile } from '@/webui/mutations/user';
import { useMemo, useState } from 'react';

const selectStyles =
  'w-full rounded-[var(--radius-md)] border border-[color:rgba(20,18,21,0.2)] bg-white/80 px-4 py-2 text-sm text-[color:var(--ink)] shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--haze)]';

const dayOptions = [
  { label: 'Mon', value: 'mon' },
  { label: 'Tue', value: 'tue' },
  { label: 'Wed', value: 'wed' },
  { label: 'Thu', value: 'thu' },
  { label: 'Fri', value: 'fri' },
  { label: 'Sat', value: 'sat' },
  { label: 'Sun', value: 'sun' },
];

const timeOptions = Array.from({ length: 24 * 2 }).map((_, idx) => {
  const totalMinutes = idx * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const date = new Date(2000, 0, 1, hours, minutes);
  const label = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  return { value, label };
});

export function PreferencesSettings() {
  const [lunchTime, setLunchTime] = useState('12:00');
  const [frequency, setFrequency] = useState('weekly');
  const [preferredDays, setPreferredDays] = useState<string[]>(['tue', 'thu']);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);

  const readableTime = useMemo(() => {
    const [hour, minute] = lunchTime.split(':').map(Number);
    const date = new Date(2000, 0, 1, hour, minute);
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }, [lunchTime]);

  const toggleDay = (value: string) => {
    setPreferredDays((current) =>
      current.includes(value)
        ? current.filter((day) => day !== value)
        : [...current, value],
    );
  };

  const handleSave = async () => {
    setStatus('saving');
    setError(null);
    try {
      await updateUserProfile({
        lunchTime,
        preferredDays,
        lotteryFrequency: frequency as 'weekly' | 'biweekly' | 'monthly',
      });
      setStatus('saved');
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to save preferences.');
      setStatus('error');
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs tracking-[0.3em] text-(--moss) uppercase">
          Preferences
        </p>
        <h2 className="text-2xl font-semibold">Lunch &amp; scheduling</h2>
        <p className="mt-1 text-sm text-[rgba(20,18,21,0.7)]">
          Capture preferred lunch times, days, and the default lottery cadence.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Lunch time (24h)
          <select
            className={`${selectStyles} mt-2`}
            value={lunchTime}
            onChange={(event) => setLunchTime(event.target.value)}
          >
            {timeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value} · {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Lottery frequency
          <select
            className={`${selectStyles} mt-2`}
            value={frequency}
            onChange={(event) => setFrequency(event.target.value)}
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every other week</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <div className="text-sm sm:col-span-2">
          Preferred days
          <div className="mt-2 flex flex-wrap gap-2">
            {dayOptions.map((day) => (
              <label
                key={day.value}
                className="flex items-center gap-2 rounded-full border border-[rgba(20,18,21,0.2)] bg-white/70 px-3 py-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={preferredDays.includes(day.value)}
                  onChange={() => toggleDay(day.value)}
                />
                {day.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div>
        <Button
          variant="ghost"
          onClick={handleSave}
          disabled={status === 'saving'}
        >
          {status === 'saving' ? 'Saving...' : 'Save preferences'}
        </Button>
      </div>
      <Notice>
        Saved lunch time: {lunchTime} ({readableTime} local time)
      </Notice>
      {status === 'saved' ? <Notice>Preferences saved.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
    </div>
  );
}

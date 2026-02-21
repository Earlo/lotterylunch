'use client';

import type { ApiError } from '@/webui/api/client';
import { Button } from '@/webui/components/ui/Button';
import { Notice } from '@/webui/components/ui/Notice';
import { selectBaseStyles } from '@/webui/components/ui/formStyles';
import { updateUserProfile } from '@/webui/mutations/user';
import { fetchUserProfile } from '@/webui/queries/user';
import { useEffect, useMemo, useState } from 'react';

const selectStyles = `${selectBaseStyles} px-4 py-2 text-sm`;

const shortNoticeOptions = [
  {
    value: 'strict',
    label: 'Advance notice only',
    description: 'I need plenty of notice before adjusting my calendar.',
  },
  {
    value: 'standard',
    label: 'Same-day OK',
    description: 'I can adjust for same-day changes when needed.',
  },
  {
    value: 'flexible',
    label: 'Last-minute OK',
    description: 'I am comfortable with short-notice changes.',
  },
] as const;

const weekStartOptions = [
  {
    value: 'monday',
    label: 'Monday',
    description: 'Week view starts on Monday.',
  },
  {
    value: 'sunday',
    label: 'Sunday',
    description: 'Week view starts on Sunday.',
  },
] as const;

const clockFormatOptions = [
  {
    value: 'h24',
    label: '24-hour',
    description: 'Times display as 13:30.',
  },
  {
    value: 'ampm',
    label: 'AM/PM',
    description: 'Times display as 1:30 PM.',
  },
] as const;

export function PreferencesSettings() {
  const [shortNoticePreference, setShortNoticePreference] = useState<
    'strict' | 'standard' | 'flexible'
  >('standard');
  const [weekStartDay, setWeekStartDay] = useState<'monday' | 'sunday'>(
    'monday',
  );
  const [clockFormat, setClockFormat] = useState<'h24' | 'ampm'>('h24');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserProfile()
      .then((profile) => {
        if (profile.shortNoticePreference) {
          setShortNoticePreference(profile.shortNoticePreference);
        }
        if (profile.weekStartDay) {
          setWeekStartDay(profile.weekStartDay);
        }
        if (profile.clockFormat) {
          setClockFormat(profile.clockFormat);
        }
      })
      .catch(() => null);
  }, []);

  const selectedOption = useMemo(
    () =>
      shortNoticeOptions.find(
        (option) => option.value === shortNoticePreference,
      ),
    [shortNoticePreference],
  );
  const selectedWeekStartOption = useMemo(
    () => weekStartOptions.find((option) => option.value === weekStartDay),
    [weekStartDay],
  );
  const selectedClockFormatOption = useMemo(
    () => clockFormatOptions.find((option) => option.value === clockFormat),
    [clockFormat],
  );

  const handleSave = async () => {
    setStatus('saving');
    setError(null);
    try {
      await updateUserProfile({
        shortNoticePreference,
        weekStartDay,
        clockFormat,
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
        <h2 className="text-2xl font-semibold">Calendar preferences</h2>
        <p className="mt-1 text-sm text-[rgba(20,18,21,0.7)]">
          Set your flexibility plus how the schedule calendar should be displayed.
        </p>
      </div>

      <div className="grid gap-3 sm:max-w-lg">
        <label className="text-sm">
          Short-notice flexibility
          <select
            className={`${selectStyles} mt-2`}
            value={shortNoticePreference}
            onChange={(event) =>
              setShortNoticePreference(
                event.target.value as 'strict' | 'standard' | 'flexible',
              )
            }
          >
            {shortNoticeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[rgba(20,18,21,0.6)]">
          {selectedOption?.description}
        </p>
        <label className="text-sm">
          Week starts on
          <select
            className={`${selectStyles} mt-2`}
            value={weekStartDay}
            onChange={(event) =>
              setWeekStartDay(event.target.value as 'monday' | 'sunday')
            }
          >
            {weekStartOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[rgba(20,18,21,0.6)]">
          {selectedWeekStartOption?.description}
        </p>
        <label className="text-sm">
          Time display
          <select
            className={`${selectStyles} mt-2`}
            value={clockFormat}
            onChange={(event) =>
              setClockFormat(event.target.value as 'h24' | 'ampm')
            }
          >
            {clockFormatOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[rgba(20,18,21,0.6)]">
          {selectedClockFormatOption?.description}
        </p>
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
        Current preference: {selectedOption?.label ?? 'Not set'}.
        {' '}
        Week starts on {selectedWeekStartOption?.label ?? 'Monday'}.
        {' '}
        Time display: {selectedClockFormatOption?.label ?? '24-hour'}.
      </Notice>
      {status === 'saved' ? <Notice>Preferences saved.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
    </div>
  );
}

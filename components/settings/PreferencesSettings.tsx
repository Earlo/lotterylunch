'use client';

import { Button } from '@/components/ui/Button';
import { selectBaseStyles } from '@/components/ui/formStyles';
import { Notice } from '@/components/ui/Notice';
import { useCancelableEffect } from '@/hooks/useCancelableEffect';
import { getErrorMessage } from '@/lib/webui/api/client';
import { updateUserProfile } from '@/lib/webui/mutations/user';
import { fetchUserProfile } from '@/lib/webui/queries/user';
import { useCallback, useMemo, useState, type FormEvent } from 'react';

const selectStyles = `${selectBaseStyles} px-4 py-2 text-sm`;

const shortNoticeOptions = [
  {
    value: 'strict',
    label: 'Advance notice only',
    description: 'Schedule lunches at least 24 hours after the draw runs.',
  },
  {
    value: 'standard',
    label: 'Same-day OK',
    description: 'Schedule lunches at least one hour after the draw runs.',
  },
  {
    value: 'flexible',
    label: 'Last-minute OK',
    description: 'Any future lunch time is OK, with no minimum notice.',
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
  const [shortNoticePreference, setShortNoticePreference] = useState<'strict' | 'standard' | 'flexible'>('standard');
  const [weekStartDay, setWeekStartDay] = useState<'monday' | 'sunday'>('monday');
  const [clockFormat, setClockFormat] = useState<'h24' | 'ampm'>('h24');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCancelableEffect(
    useCallback((isCancelled, signal) => {
      fetchUserProfile(signal)
        .then((profile) => {
          if (isCancelled()) return;
          if (profile.shortNoticePreference) {
            setShortNoticePreference(profile.shortNoticePreference);
          }
          if (profile.weekStartDay) {
            setWeekStartDay(profile.weekStartDay);
          }
          if (profile.clockFormat) {
            setClockFormat(profile.clockFormat);
          }
          setLoaded(true);
          setError(null);
        })
        .catch((err) => {
          if (isCancelled()) return;
          setError(getErrorMessage(err, 'Unable to load preferences.'));
        });
    }, []),
  );

  const selectedOption = useMemo(
    () => shortNoticeOptions.find((option) => option.value === shortNoticePreference),
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

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loaded || status === 'saving') return;
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
      setError(getErrorMessage(err, 'Unable to save preferences.'));
      setStatus('error');
    }
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        void handleSave(event);
      }}
    >
      <div>
        <p className="text-xs tracking-[0.3em] text-(--moss) uppercase">Preferences</p>
        <h2 className="text-2xl font-semibold">Calendar preferences</h2>
        <p className="mt-1 text-sm text-[rgba(20,18,21,0.7)]">
          Set your flexibility plus how the schedule calendar should be displayed.
        </p>
      </div>

      <fieldset disabled={!loaded || status === 'saving'} className="grid gap-3 sm:max-w-lg">
        <label className="text-sm">
          Short-notice flexibility
          <select
            className={`${selectStyles} mt-2`}
            value={shortNoticePreference}
            onChange={(event) =>
              setShortNoticePreference(
                event.target.value === 'strict'
                  ? 'strict'
                  : event.target.value === 'flexible'
                    ? 'flexible'
                    : 'standard',
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
        <p className="text-xs text-[rgba(20,18,21,0.6)]">{selectedOption?.description}</p>
        <label className="text-sm">
          Week starts on
          <select
            className={`${selectStyles} mt-2`}
            value={weekStartDay}
            onChange={(event) => setWeekStartDay(event.target.value === 'sunday' ? 'sunday' : 'monday')}
          >
            {weekStartOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[rgba(20,18,21,0.6)]">{selectedWeekStartOption?.description}</p>
        <label className="text-sm">
          Time display
          <select
            className={`${selectStyles} mt-2`}
            value={clockFormat}
            onChange={(event) => setClockFormat(event.target.value === 'ampm' ? 'ampm' : 'h24')}
          >
            {clockFormatOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[rgba(20,18,21,0.6)]">{selectedClockFormatOption?.description}</p>
      </fieldset>

      <div>
        <Button variant="ghost" type="submit" disabled={!loaded || status === 'saving'}>
          {status === 'saving' ? 'Saving...' : 'Save preferences'}
        </Button>
      </div>
      {!loaded && !error ? <Notice>Loading preferences...</Notice> : null}
      {loaded ? (
        <Notice>
          Current preference: {selectedOption?.label ?? 'Not set'}. Week starts on{' '}
          {selectedWeekStartOption?.label ?? 'Monday'}. Time display: {selectedClockFormatOption?.label ?? '24-hour'}.
        </Notice>
      ) : null}
      {status === 'saved' ? <Notice>Preferences saved.</Notice> : null}
      {error ? <Notice role="alert">{error}</Notice> : null}
      {!loaded && error ? (
        <div>
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              reload();
            }}
          >
            Retry loading preferences
          </Button>
        </div>
      ) : null}
    </form>
  );
}

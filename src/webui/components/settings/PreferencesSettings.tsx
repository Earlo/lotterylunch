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

export function PreferencesSettings() {
  const [shortNoticePreference, setShortNoticePreference] = useState<
    'strict' | 'standard' | 'flexible'
  >('standard');
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

  const handleSave = async () => {
    setStatus('saving');
    setError(null);
    try {
      await updateUserProfile({
        shortNoticePreference,
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
        <h2 className="text-2xl font-semibold">Calendar flexibility</h2>
        <p className="mt-1 text-sm text-[rgba(20,18,21,0.7)]">
          Tell us how quickly you can adjust your calendar when a match is ready.
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
      </Notice>
      {status === 'saved' ? <Notice>Preferences saved.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
    </div>
  );
}

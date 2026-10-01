'use client';

import { authClient } from '@/lib/auth-client';
import { getErrorMessage } from '@/webui/api/client';
import { Button } from '@/webui/components/ui/Button';
import { Input } from '@/webui/components/ui/Input';
import { Notice } from '@/webui/components/ui/Notice';
import { useCancelableEffect } from '@/webui/hooks/useCancelableEffect';
import { updateUserProfile } from '@/webui/mutations/user';
import { fetchUserProfile } from '@/webui/queries/user';
import { useMemo, useState, type FormEvent } from 'react';

export function AccountSettings() {
  const { data: session } = authClient.useSession();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [area, setArea] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useCancelableEffect(
    (isCancelled, signal) => {
      if (!session?.user?.id) return;
      fetchUserProfile(signal)
        .then((profile) => {
          if (isCancelled()) return;
          setName(profile.name ?? session.user?.name ?? '');
          setTimezone(profile.timezone ?? '');
          setArea(profile.area ?? '');
          setPhotoUrl(profile.image ?? '');
          setError(null);
          setLoaded(true);
        })
        .catch((err) => {
          if (isCancelled()) return;
          setError(getErrorMessage(err, 'Unable to load profile.'));
        });
    },
    [session?.user?.id, loadAttempt],
  );

  const email = session?.user?.email ?? 'Signed-in user';
  const canSave = useMemo(
    () =>
      Boolean(name.trim() || timezone.trim() || area.trim() || photoUrl.trim()),
    [name, timezone, area, photoUrl],
  );

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loaded || !canSave || status === 'saving') return;
    setStatus('saving');
    setError(null);
    try {
      await updateUserProfile({
        name: name.trim() || undefined,
        timezone: timezone.trim() || undefined,
        area: area.trim() || undefined,
        image: photoUrl.trim() || undefined,
      });
      setStatus('saved');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to save profile.'));
      setStatus('error');
    }
  };

  return (
    <form className="grid gap-4" onSubmit={handleSave}>
      <div>
        <p className="text-xs tracking-[0.3em] text-(--moss) uppercase">
          Account
        </p>
        <h2 className="text-2xl font-semibold">Profile details</h2>
        <p className="mt-1 text-sm text-[rgba(20,18,21,0.7)]">
          Manage your identity, timezone, and location signals used by matches.
        </p>
      </div>

      <fieldset
        disabled={!loaded || status === 'saving'}
        className="grid gap-3 sm:grid-cols-2"
      >
        <label className="text-sm">
          Name
          <Input
            className="mt-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ada Lovelace"
            autoComplete="name"
            maxLength={120}
          />
        </label>
        <label className="text-sm">
          Email
          <Input className="mt-2" value={email} disabled />
        </label>
        <label className="text-sm">
          Timezone
          <Input
            className="mt-2"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="America/Los_Angeles"
            maxLength={80}
          />
        </label>
        <label className="text-sm">
          Area
          <Input
            className="mt-2"
            value={area}
            onChange={(event) => setArea(event.target.value)}
            placeholder="Downtown SF"
            maxLength={120}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Photo URL
          <Input
            className="mt-2"
            value={photoUrl}
            onChange={(event) => setPhotoUrl(event.target.value)}
            placeholder="https://"
            type="url"
          />
        </label>
      </fieldset>

      <div>
        <Button
          variant="ghost"
          type="submit"
          disabled={!loaded || !canSave || status === 'saving'}
        >
          {status === 'saving' ? 'Saving...' : 'Save profile'}
        </Button>
      </div>
      {!loaded && !error ? <Notice>Loading profile...</Notice> : null}
      {status === 'saved' ? <Notice>Profile saved.</Notice> : null}
      {error ? <Notice role="alert">{error}</Notice> : null}
      {!loaded && error ? (
        <div>
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            Retry loading profile
          </Button>
        </div>
      ) : null}
    </form>
  );
}

'use client';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Notice } from '@/components/ui/Notice';
import { useCancelableEffect } from '@/hooks/useCancelableEffect';
import { authClient } from '@/lib/auth-client';
import { getErrorMessage } from '@/lib/webui/api/client';
import { updateUserProfile } from '@/lib/webui/mutations/user';
import { fetchUserProfile } from '@/lib/webui/queries/user';
import { useCallback, useMemo, useState, type FormEvent } from 'react';

export function AccountSettings() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const sessionName = session?.user?.name;
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [area, setArea] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCancelableEffect(
    useCallback(
      (isCancelled, signal) => {
        if (!userId) return;
        fetchUserProfile(signal)
          .then((profile) => {
            if (isCancelled()) return;
            setName(profile.name ?? sessionName ?? '');
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
      [userId, sessionName],
    ),
  );

  const email = session?.user?.email ?? 'Signed-in user';
  const canSave = useMemo(
    () => Boolean(name.trim() || timezone.trim() || area.trim() || photoUrl.trim()),
    [name, timezone, area, photoUrl],
  );

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loaded || !canSave || status === 'saving') return;
    setStatus('saving');
    setError(null);
    try {
      await updateUserProfile({
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(timezone.trim() ? { timezone: timezone.trim() } : {}),
        ...(area.trim() ? { area: area.trim() } : {}),
        ...(photoUrl.trim() ? { image: photoUrl.trim() } : {}),
      });
      setStatus('saved');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to save profile.'));
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
        <p className="text-xs tracking-[0.3em] text-(--moss) uppercase">Account</p>
        <h2 className="text-2xl font-semibold">Profile details</h2>
        <p className="mt-1 text-sm text-[rgba(20,18,21,0.7)]">
          Manage your identity, timezone, and location signals used by matches.
        </p>
      </div>

      <fieldset disabled={!loaded || status === 'saving'} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm" htmlFor="profile-name">
          Name
          <Input
            id="profile-name"
            className="mt-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ada Lovelace"
            autoComplete="name"
            maxLength={120}
          />
        </label>
        <label className="text-sm" htmlFor="profile-email">
          Email
          <Input id="profile-email" className="mt-2" value={email} disabled />
        </label>
        <label className="text-sm" htmlFor="profile-timezone">
          Timezone
          <Input
            id="profile-timezone"
            className="mt-2"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="America/Los_Angeles"
            maxLength={80}
          />
        </label>
        <label className="text-sm" htmlFor="profile-area">
          Area
          <Input
            id="profile-area"
            className="mt-2"
            value={area}
            onChange={(event) => setArea(event.target.value)}
            placeholder="Downtown SF"
            maxLength={120}
          />
        </label>
        <label className="text-sm sm:col-span-2" htmlFor="profile-image">
          Photo URL
          <Input
            id="profile-image"
            className="mt-2"
            value={photoUrl}
            onChange={(event) => setPhotoUrl(event.target.value)}
            placeholder="https://"
            type="url"
          />
        </label>
      </fieldset>

      <div>
        <Button variant="ghost" type="submit" disabled={!loaded || !canSave || status === 'saving'}>
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
              reload();
            }}
          >
            Retry loading profile
          </Button>
        </div>
      ) : null}
    </form>
  );
}

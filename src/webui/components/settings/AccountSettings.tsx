'use client';

import { useEffect, useMemo, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import type { ApiError } from '@/webui/api/client';
import { Button } from '@/webui/components/ui/Button';
import { Input } from '@/webui/components/ui/Input';
import { Notice } from '@/webui/components/ui/Notice';
import { fetchUserProfile } from '@/webui/queries/user';
import { updateUserProfile } from '@/webui/mutations/user';

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

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchUserProfile()
      .then((profile) => {
        setName(profile.name ?? session.user?.name ?? '');
        setTimezone(profile.timezone ?? '');
        setArea(profile.area ?? '');
        setPhotoUrl(profile.image ?? '');
      })
      .catch((err) => {
        const apiError = err as ApiError;
        setError(apiError.message ?? 'Unable to load profile.');
      });
  }, [session?.user?.id, session?.user?.name]);

  const email = session?.user?.email ?? 'Signed-in user';
  const canSave = useMemo(
    () => Boolean(name.trim() || timezone.trim() || area.trim() || photoUrl.trim()),
    [name, timezone, area, photoUrl],
  );

  const handleSave = async () => {
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
      const apiError = err as ApiError;
      setError(apiError.message ?? 'Unable to save profile.');
      setStatus('error');
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--moss)]">
          Account
        </p>
        <h2 className="text-2xl font-semibold">Profile details</h2>
        <p className="mt-1 text-sm text-[color:rgba(20,18,21,0.7)]">
          Manage your identity, timezone, and location signals used by matches.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Name
          <Input
            className="mt-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ada Lovelace"
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
          />
        </label>
        <label className="text-sm">
          Area
          <Input
            className="mt-2"
            value={area}
            onChange={(event) => setArea(event.target.value)}
            placeholder="Downtown SF"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Photo URL
          <Input
            className="mt-2"
            value={photoUrl}
            onChange={(event) => setPhotoUrl(event.target.value)}
            placeholder="https://"
          />
        </label>
      </div>

      <div>
        <Button variant="ghost" onClick={handleSave} disabled={!canSave || status === 'saving'}>
          {status === 'saving' ? 'Saving...' : 'Save profile'}
        </Button>
      </div>
      {status === 'saved' ? <Notice>Profile saved.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
    </div>
  );
}

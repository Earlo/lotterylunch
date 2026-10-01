'use client';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { authClient } from '@/lib/auth-client';
import { getErrorMessage } from '@/lib/webui/api/client';
import { resolvePortalCallback } from '@/lib/webui/authRedirect';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AuthButton() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const nextPath = new URLSearchParams(window.location.search).get('next');
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: resolvePortalCallback(nextPath, window.location.origin),
      });
      if (result.error) throw new Error(result.error.message ?? 'Authentication failed.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to sign in. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message ?? 'Authentication failed.');
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to sign out. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (isPending) {
    return (
      <Button variant="ghost" disabled>
        Checking session...
      </Button>
    );
  }

  return (
    <div className="grid gap-2">
      {session ? (
        <Button
          variant="ghost"
          onClick={() => {
            void handleSignOut();
          }}
          disabled={busy}
        >
          {busy ? 'Signing out...' : 'Sign out'}
        </Button>
      ) : (
        <Button
          variant="accent"
          onClick={() => {
            void handleSignIn();
          }}
          disabled={busy}
        >
          {busy ? 'Signing in...' : 'Sign in with Google'}
        </Button>
      )}
      {error ? <Notice role="alert">{error}</Notice> : null}
    </div>
  );
}

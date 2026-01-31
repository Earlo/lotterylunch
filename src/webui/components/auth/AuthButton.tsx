'use client';

import { signIn, signOut, useSession } from 'next-auth/react';

import { Button } from '@/webui/components/ui/Button';

export default function AuthButton() {
  const { data: session, status } = useSession();

  const handleSignIn = () => {
    signIn('google').catch(console.error);
  };

  const handleSignOut = () => {
    signOut().catch(console.error);
  };

  if (status === 'loading') {
    return (
      <Button variant="ghost" disabled>
        Checking session...
      </Button>
    );
  }

  return session ? (
    <Button variant="ghost" onClick={handleSignOut}>
      Sign out
    </Button>
  ) : (
    <Button variant="accent" onClick={handleSignIn}>
      Sign in with Google
    </Button>
  );
}

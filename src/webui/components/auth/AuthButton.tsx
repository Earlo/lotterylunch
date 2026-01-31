'use client';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/webui/components/ui/Button';

export default function AuthButton() {
  const { data: session, isPending } = authClient.useSession();

  const handleSignIn = async () => {
    try {
      await authClient.signIn.social({ provider: 'google' });
    } catch (error) {
      console.error(error);
    }
  };

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
    } catch (error) {
      console.error(error);
    }
  };

  if (isPending) {
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

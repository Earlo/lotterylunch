'use client';

import { signIn, signOut, useSession } from 'next-auth/react';

export default function AuthButton() {
  const { data: session } = useSession();

  const handleSignIn = () => {
    signIn('google', { redirect: false })
      .then((res) => {
        if (res.error) console.error(res.error);
      })
      .catch(console.error);
  };

  const handleSignOut = () => {
    signOut().catch(console.error);
  };

  return session ? (
    <button onClick={handleSignOut}>Sign out</button>
  ) : (
    <button onClick={handleSignIn}>Sign in with Google</button>
  );
}

'use client';

import type { ReactNode } from 'react';
import { useSession } from 'next-auth/react';

export function ClientAuthGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { status } = useSession();

  if (status === 'loading') {
    return fallback ?? <p className="text-sm text-[color:rgba(20,18,21,0.6)]">Loading session...</p>;
  }

  if (status === 'unauthenticated') {
    return (
      <p className="text-sm text-[color:rgba(20,18,21,0.6)]">
        Sign in to access this section.
      </p>
    );
  }

  return <>{children}</>;
}

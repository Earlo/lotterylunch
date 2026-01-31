'use client';

import { authClient } from '@/lib/auth-client';
import type { ReactNode } from 'react';

export function ClientAuthGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      fallback ?? (
        <p className="text-sm text-[rgba(20,18,21,0.6)]">Loading session...</p>
      )
    );
  }

  if (!session?.user?.id) {
    return (
      <p className="text-sm text-[rgba(20,18,21,0.6)]">
        Sign in to access this section.
      </p>
    );
  }

  return <>{children}</>;
}

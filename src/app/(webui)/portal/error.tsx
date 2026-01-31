'use client';

import { useEffect } from 'react';

import { Button } from '@/webui/components/ui/Button';

export default function PortalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[portal] error boundary', error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-24">
      <div className="rounded-[var(--radius-lg)] border border-[color:rgba(20,18,21,0.2)] bg-white/80 p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Something went off script</h2>
        <p className="mt-2 text-sm text-[color:rgba(20,18,21,0.7)]">
          Try reloading the portal view. If this keeps happening, let us know.
        </p>
        <div className="mt-4">
          <Button variant="ghost" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}

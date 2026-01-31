import type { ReactNode } from 'react';

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:rgba(20,18,21,0.15)] bg-[color:rgba(20,18,21,0.04)] px-4 py-3 text-xs text-[color:rgba(20,18,21,0.7)]">
      {children}
    </div>
  );
}

import type { ReactNode } from 'react';

export function Notice({ children, role = 'status' }: { children: ReactNode; role?: 'status' | 'alert' }) {
  return (
    <div
      role={role}
      className="rounded-md border border-[rgba(20,18,21,0.15)] bg-[rgba(20,18,21,0.04)] px-4 py-3 text-xs text-[rgba(20,18,21,0.7)]"
    >
      {children}
    </div>
  );
}

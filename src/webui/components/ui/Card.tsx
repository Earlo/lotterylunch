import type { ReactNode } from 'react';

export function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:rgba(20,18,21,0.1)] bg-white/70 p-6 shadow-sm backdrop-blur">
      <h3 className="mb-2 text-lg font-semibold text-[color:var(--ink)]">
        {title}
      </h3>
      {children}
    </div>
  );
}

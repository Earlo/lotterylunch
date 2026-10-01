import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed border-[rgba(20,18,21,0.2)] bg-white/60 p-8 text-left shadow-sm backdrop-blur">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[rgba(20,18,21,0.7)]">{description}</p>
      </div>
      {children}
      {action ? <div>{action}</div> : null}
    </div>
  );
}

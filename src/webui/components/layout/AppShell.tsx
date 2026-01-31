import type { ReactNode } from 'react';

import { PortalNav } from '@/webui/components/layout/PortalNav';

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute -left-20 top-10 h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,107,53,0.25),transparent_65%)] blur-2xl" />
      <div className="pointer-events-none absolute -right-20 top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,rgba(27,77,62,0.2),transparent_65%)] blur-3xl" />

      <header className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-8 pt-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--moss)]">
              Portal
            </p>
            <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-sm text-[color:rgba(20,18,21,0.7)]">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex gap-3">{actions}</div> : null}
        </div>
        <PortalNav />
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-20">{children}</main>
    </div>
  );
}

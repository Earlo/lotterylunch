import type { ComponentPropsWithoutRef } from 'react';

export function Input({ className, ...rest }: ComponentPropsWithoutRef<'input'>) {
  return (
    <input
      className={[
        'w-full rounded-[var(--radius-md)] border border-[color:rgba(20,18,21,0.2)] bg-white/80 px-4 py-2 text-sm text-[color:var(--ink)] shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--haze)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}

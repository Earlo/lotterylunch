import type { ComponentPropsWithoutRef } from 'react';

export function Input({
  className,
  ...rest
}: ComponentPropsWithoutRef<'input'>) {
  return (
    <input
      className={[
        'w-full rounded-md border border-[rgba(20,18,21,0.2)] bg-white/80 px-4 py-2 text-sm text-(--ink) shadow-sm transition focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 focus-visible:ring-offset-(--haze) focus-visible:outline-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}

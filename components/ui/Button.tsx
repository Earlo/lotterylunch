import { cn } from '@/lib/helpers';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

const baseStyles =
  'inline-flex items-center justify-center gap-2 rounded-full border border-transparent px-5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 focus-visible:ring-offset-(--haze) disabled:cursor-not-allowed disabled:opacity-60';

const variants = {
  primary: 'bg-(--ink) text-(--haze) shadow-(--shadow-lift) hover:-translate-y-px hover:bg-[rgba(20,18,21,0.9)]',
  ghost: 'border-[rgba(20,18,21,0.15)] text-(--ink) hover:border-[rgba(20,18,21,0.35)] hover:bg-[rgba(20,18,21,0.04)]',
  accent: 'bg-(--ember) text-(--ink) hover:brightness-105',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

type ButtonProps<T extends ElementType> = {
  as?: T;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children'>;

export function Button<T extends ElementType = 'button'>({
  as,
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps<T>) {
  const Component = as ?? 'button';
  const isButton = Component === 'button';

  return (
    <Component
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...(isButton ? { type: 'button' } : {})}
      {...rest}
    >
      {children}
    </Component>
  );
}

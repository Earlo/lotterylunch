'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { label: 'Overview', href: '/portal' },
  { label: 'Groups', href: '/portal/groups' },
  { label: 'Settings', href: '/portal/settings' },
] as const;

export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Portal" className="flex flex-wrap items-center gap-4 text-sm">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={
            pathname === item.href || (item.href !== '/portal' && pathname.startsWith(`${item.href}/`))
              ? 'page'
              : undefined
          }
          className="rounded-full border border-transparent px-3 py-1 text-[rgba(20,18,21,0.7)] transition hover:border-[rgba(20,18,21,0.15)] hover:text-(--ink)"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

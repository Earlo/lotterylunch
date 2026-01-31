import type { ReactNode } from 'react';
import { Fraunces, Space_Grotesk } from 'next/font/google';

const bodyFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const displayFont = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export default function WebUILayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${bodyFont.variable} ${displayFont.variable} min-h-screen`}>
      {children}
    </div>
  );
}

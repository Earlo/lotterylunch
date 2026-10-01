import '@/styles/globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'LotteryLunch',
    template: '%s | LotteryLunch',
  },
  description: 'Connect with colleagues through lunch groups, shared availability, and calendar invitations.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-(--haze) text-(--ink) antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import './globals.css';

import { Providers } from './providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head />
      <body className="min-h-screen bg-(--haze) text-(--ink) antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

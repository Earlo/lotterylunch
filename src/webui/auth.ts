import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';

export async function requirePortalSession(nextPath: string) {
  const headerList = await headers();
  const session = await auth.api.getSession({
    headers: Object.fromEntries(headerList.entries()),
  });

  if (!session?.user?.id) {
    const encoded = encodeURIComponent(nextPath);
    redirect(`/?next=${encoded}`);
  }

  return session;
}

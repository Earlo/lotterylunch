import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export async function requirePortalSession(nextPath: string) {
  const session = await auth();

  if (!session?.user?.id) {
    const encoded = encodeURIComponent(nextPath);
    redirect(`/?next=${encoded}`);
  }

  return session;
}

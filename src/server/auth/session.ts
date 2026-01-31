import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { unauthorized } from '@/server/http/errors';

export async function requireUser() {
  const headerList = await headers();
  const session = await auth.api.getSession({
    headers: Object.fromEntries(headerList.entries()),
  });
  const userId = session?.user?.id;

  if (!userId) {
    throw unauthorized();
  }

  return {
    session,
    userId,
  };
}

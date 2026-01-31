import { auth } from '@/lib/auth';
import { unauthorized } from '@/server/http/errors';

export async function requireUser() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw unauthorized();
  }

  return {
    session,
    userId,
  };
}


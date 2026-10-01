import crypto from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { unauthorized } from '@/lib/server/http/errors';
import { headers } from 'next/headers';

export async function requireUser() {
  const headerList = await headers();
  const session = await auth.api.getSession({
    headers: Object.fromEntries(headerList.entries()),
  });
  let userId = session?.user?.id;

  if (!userId) {
    const authHeader = headerList.get('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const apiToken = await prisma.apiToken.findUnique({
        where: { tokenHash },
      });

      if (apiToken) {
        userId = apiToken.userId;
        await prisma.apiToken.update({
          where: { id: apiToken.id },
          data: { lastUsedAt: new Date() },
        });
      }
    }
  }

  if (!userId) {
    throw unauthorized();
  }

  return {
    session,
    userId,
  };
}

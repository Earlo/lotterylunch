import { prisma } from '@/lib/prisma';
import { notFound } from '@/server/http/errors';
import crypto from 'crypto';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createApiToken(userId: string, name: string) {
  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = hashToken(rawToken);

  const record = await prisma.apiToken.create({
    data: {
      userId,
      name,
      tokenHash,
    },
  });

  return {
    id: record.id,
    name: record.name,
    token: rawToken,
    createdAt: record.createdAt,
  };
}

export async function listApiTokens(userId: string) {
  return prisma.apiToken.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeApiToken(userId: string, id: string) {
  const token = await prisma.apiToken.findUnique({ where: { id } });
  if (!token || token.userId !== userId) throw notFound('Token not found');
  await prisma.apiToken.delete({ where: { id } });
  return { id, deleted: true as const };
}

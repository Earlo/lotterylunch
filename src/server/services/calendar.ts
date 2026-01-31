import { prisma } from '@/lib/prisma';
import { notFound } from '@/server/http/errors';
import type { CreateCalendarArtifactInput } from '@/server/schemas/calendar';
import { emitWebhookEvent } from '@/server/services/webhooks';

export async function listCalendarConnections(userId: string) {
  return prisma.calendarConnection.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
  });
}

export async function createCalendarConnection(
  userId: string,
  provider: 'google' | 'outlook' | 'apple' | 'ics',
) {
  return prisma.calendarConnection.create({
    data: {
      userId,
      provider,
      status: 'connected',
      oauthTokens: {},
    },
  });
}

export async function deleteCalendarConnection(userId: string, id: string) {
  const connection = await prisma.calendarConnection.findUnique({
    where: { id },
  });

  if (!connection || connection.userId !== userId) {
    throw notFound('Calendar connection not found');
  }

  await prisma.calendarConnection.delete({ where: { id } });
  return { id, deleted: true as const };
}

export async function createCalendarArtifact(
  matchId: string,
  userId: string,
  input: CreateCalendarArtifactInput,
) {
  const artifact = await prisma.calendarArtifact.create({
    data: {
      matchId,
      type: 'ics',
      payload: {
        ...input,
      },
    },
  });

  await emitWebhookEvent(userId, 'calendar.artifact.created', {
    matchId,
    artifactId: artifact.id,
  });

  return artifact;
}

export async function getCalendarArtifact(id: string) {
  const artifact = await prisma.calendarArtifact.findUnique({ where: { id } });
  if (!artifact) throw notFound('Calendar artifact not found');
  return artifact;
}

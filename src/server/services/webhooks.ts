import { prisma } from '@/lib/prisma';
import { notFound } from '@/server/http/errors';
import crypto from 'crypto';

export async function listWebhooks(userId: string) {
  return prisma.webhookEndpoint.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createWebhook(
  userId: string,
  url: string,
  events: string[],
) {
  const secret = crypto.randomBytes(24).toString('hex');
  return prisma.webhookEndpoint.create({
    data: {
      userId,
      url,
      events,
      secret,
      isActive: true,
    },
  });
}

export async function updateWebhook(
  userId: string,
  id: string,
  input: { url?: string; events?: string[]; isActive?: boolean },
) {
  const webhook = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!webhook || webhook.userId !== userId)
    throw notFound('Webhook not found');
  return prisma.webhookEndpoint.update({
    where: { id },
    data: {
      url: input.url,
      events: input.events,
      isActive: input.isActive,
    },
  });
}

export async function deleteWebhook(userId: string, id: string) {
  const webhook = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!webhook || webhook.userId !== userId)
    throw notFound('Webhook not found');
  await prisma.webhookEndpoint.delete({ where: { id } });
  return { id, deleted: true as const };
}

export async function emitWebhookEvent(
  userId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      userId,
      isActive: true,
      events: { has: event },
    },
  });

  if (endpoints.length === 0) return { delivered: 0 };

  await prisma.webhookDelivery.createMany({
    data: endpoints.map((endpoint) => ({
      webhookId: endpoint.id,
      event,
      payload,
      status: 'pending',
      attempts: 0,
    })),
  });

  return { delivered: endpoints.length };
}

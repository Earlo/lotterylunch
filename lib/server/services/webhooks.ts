import crypto from 'crypto';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { notFound } from '@/lib/server/http/errors';
import type { UpdateWebhookInput } from '@/lib/server/schemas/webhooks';

export async function listWebhooks(userId: string) {
  return prisma.webhookEndpoint.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createWebhook(userId: string, url: string, events: string[]) {
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

export async function updateWebhook(userId: string, id: string, input: UpdateWebhookInput) {
  const webhook = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!webhook || webhook.userId !== userId) throw notFound('Webhook not found');
  return prisma.webhookEndpoint.update({
    where: { id },
    data: {
      ...(input.url !== undefined && { url: input.url }),
      ...(input.events !== undefined && { events: input.events }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
}

export async function deleteWebhook(userId: string, id: string) {
  const webhook = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!webhook || webhook.userId !== userId) throw notFound('Webhook not found');
  await prisma.webhookEndpoint.delete({ where: { id } });
  return { id, deleted: true as const };
}

export async function emitWebhookEvent(userId: string, event: string, payload: Prisma.InputJsonObject) {
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

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { HttpError, notFound } from '@/lib/server/http/errors';
import type { UpdateWebhookInput } from '@/lib/server/schemas/webhooks';

function unavailable() {
  return new HttpError(501, 'internal_error', 'Webhook delivery is not available');
}

export async function listWebhooks(userId: string) {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return endpoints.map((endpoint) => Object.assign(endpoint, { isActive: false, deliveryAvailable: false }));
}

export function createWebhook(_userId: string, _url: string, _events: string[]) {
  return Promise.reject(unavailable());
}

export async function updateWebhook(userId: string, id: string, input: UpdateWebhookInput) {
  const webhook = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!webhook || webhook.userId !== userId) throw notFound('Webhook not found');
  if (input.isActive) throw unavailable();
  return prisma.webhookEndpoint.update({
    where: { id },
    data: {
      ...(input.url !== undefined && { url: input.url }),
      ...(input.events !== undefined && { events: input.events }),
      isActive: false,
    },
  });
}

export async function deleteWebhook(userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const webhook = await tx.webhookEndpoint.findUnique({ where: { id } });
    if (!webhook || webhook.userId !== userId) throw notFound('Webhook not found');
    await tx.webhookDelivery.deleteMany({ where: { webhookId: id } });
    await tx.webhookEndpoint.delete({ where: { id } });
    return { id, deleted: true as const };
  });
}

export function emitWebhookEvent(_userId: string, _event: string, _payload: Prisma.InputJsonObject) {
  // Do not claim delivery or accumulate work with no dispatcher to process it.
  return Promise.resolve({ queued: 0, deliveryAvailable: false });
}

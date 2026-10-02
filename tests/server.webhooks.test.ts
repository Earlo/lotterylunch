import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '@/lib/prisma';
import { HttpError } from '@/lib/server/http/errors';
import { createWebhook, emitWebhookEvent, listWebhooks, updateWebhook } from '@/lib/server/services/webhooks';

const unavailable = (error: unknown) => error instanceof HttpError && error.status === 501;

void test('webhook delivery cannot be created or reactivated while dispatch is unavailable', async (t) => {
  const webhook = { id: 'webhook', userId: 'owner', isActive: true };
  const originalFind = prisma.webhookEndpoint.findUnique.bind(prisma.webhookEndpoint);
  Object.assign(prisma.webhookEndpoint, { findUnique: () => Promise.resolve(webhook) });
  t.after(() => {
    Object.assign(prisma.webhookEndpoint, { findUnique: originalFind });
  });
  await assert.rejects(createWebhook('owner', 'https://example.test/events', ['match.created']), unavailable);
  await assert.rejects(updateWebhook('owner', 'webhook', { isActive: true }), unavailable);
  assert.deepEqual(await emitWebhookEvent('owner', 'match.created', { id: 'match' }), {
    queued: 0,
    deliveryAvailable: false,
  });
});

void test('existing webhook records report delivery unavailable', async (t) => {
  const originalList = prisma.webhookEndpoint.findMany.bind(prisma.webhookEndpoint);
  Object.assign(prisma.webhookEndpoint, {
    findMany: () => Promise.resolve([{ id: 'webhook', isActive: true }]),
  });
  t.after(() => {
    Object.assign(prisma.webhookEndpoint, { findMany: originalList });
  });
  assert.deepEqual(await listWebhooks('owner'), [{ id: 'webhook', isActive: false, deliveryAvailable: false }]);
});

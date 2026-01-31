import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import {
  updateWebhookSchema,
  webhookIdParamsSchema,
} from '@/server/schemas/webhooks';
import { deleteWebhook, updateWebhook } from '@/server/services/webhooks';

type Params = {
  params: Promise<{ webhookId: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { webhookId } = webhookIdParamsSchema.parse(resolved);
    const body = await req.json();
    const input = updateWebhookSchema.parse(body);
    return updateWebhook(userId, webhookId, input);
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { webhookId } = webhookIdParamsSchema.parse(resolved);
    return deleteWebhook(userId, webhookId);
  });
}

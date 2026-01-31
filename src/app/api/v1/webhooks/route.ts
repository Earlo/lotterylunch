import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import { createWebhookSchema } from '@/server/schemas/webhooks';
import { createWebhook, listWebhooks } from '@/server/services/webhooks';

export async function GET() {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    return listWebhooks(userId);
  });
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const body = await req.json();
    const input = createWebhookSchema.parse(body);
    return createWebhook(userId, input.url, input.events);
  });
}

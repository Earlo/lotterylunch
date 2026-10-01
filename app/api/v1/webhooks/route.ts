import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { createWebhookSchema } from '@/lib/server/schemas/webhooks';
import { createWebhook, listWebhooks } from '@/lib/server/services/webhooks';

export async function GET() {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    return listWebhooks(userId);
  });
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const body: unknown = await req.json();
    const input = createWebhookSchema.parse(body);
    return createWebhook(userId, input.url, input.events);
  });
}

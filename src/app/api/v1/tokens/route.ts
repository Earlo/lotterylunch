import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import { createApiTokenSchema } from '@/server/schemas/tokens';
import { createApiToken, listApiTokens } from '@/server/services/tokens';

export async function GET() {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    return listApiTokens(userId);
  });
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const body = await req.json();
    const input = createApiTokenSchema.parse(body);
    return createApiToken(userId, input.name);
  });
}

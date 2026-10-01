import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { inviteTokenParamsSchema } from '@/lib/server/schemas/invites';
import { acceptInvite } from '@/lib/server/services/invites';

type Params = {
  params: Promise<{ token: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { token } = inviteTokenParamsSchema.parse(resolved);
    return acceptInvite(token, userId);
  });
}

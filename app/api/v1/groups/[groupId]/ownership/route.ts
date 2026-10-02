import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { groupIdParamsSchema, transferGroupOwnershipSchema } from '@/lib/server/schemas/memberships';
import { transferGroupOwnership } from '@/lib/server/services/memberships';

type Params = { params: Promise<{ groupId: string }> };

export async function POST(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireUser();
    const { groupId } = groupIdParamsSchema.parse(await params);
    const body: unknown = await req.json();
    const { userId } = transferGroupOwnershipSchema.parse(body);
    return transferGroupOwnership(groupId, actor.userId, userId);
  });
}

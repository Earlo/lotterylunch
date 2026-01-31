import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import {
  createGroupInviteSchema,
  groupInviteParamsSchema,
} from '@/server/schemas/invites';
import { createGroupInvite } from '@/server/services/invites';

type Params = {
  params: Promise<{ groupId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { groupId } = groupInviteParamsSchema.parse(resolved);
    const body = await req.json();
    const input = createGroupInviteSchema.parse(body);

    return createGroupInvite(
      groupId,
      userId,
      input.expiresInDays,
      input.maxUses,
    );
  });
}

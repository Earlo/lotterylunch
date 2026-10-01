import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { createMembershipSchema, groupIdParamsSchema } from '@/lib/server/schemas/memberships';
import { inviteToGroup, joinGroup, listMemberships } from '@/lib/server/services/memberships';

type Params = {
  params: Promise<{
    groupId: string;
  }>;
};

export async function GET(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolvedParams = await params;
    const { groupId } = groupIdParamsSchema.parse(resolvedParams);

    return listMemberships(groupId, userId);
  });
}

export async function POST(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolvedParams = await params;
    const { groupId } = groupIdParamsSchema.parse(resolvedParams);
    const body: unknown = await req.json();
    const input = createMembershipSchema.parse(body);

    // If a userId is provided, treat it as an invite; otherwise this is a join.
    if (input.userId) {
      return inviteToGroup(groupId, userId, input);
    }

    return joinGroup(groupId, userId);
  });
}

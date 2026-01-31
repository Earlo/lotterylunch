import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import { groupIdParamsSchema, createMembershipSchema } from '@/server/schemas/memberships';
import { inviteToGroup, joinGroup, listMemberships } from '@/server/services/memberships';

type Params = {
  params: {
    groupId: string;
  };
};

export async function GET(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const { groupId } = groupIdParamsSchema.parse(params);

    return listMemberships(groupId, userId);
  });
}

export async function POST(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const { groupId } = groupIdParamsSchema.parse(params);
    const body = await req.json();
    const input = createMembershipSchema.parse(body);

    // If a userId is provided, treat it as an invite; otherwise this is a join.
    if (input.userId) {
      return inviteToGroup(groupId, userId, input);
    }

    return joinGroup(groupId, userId);
  });
}

import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import {
  membershipIdParamsSchema,
  updateMembershipSchema,
} from '@/server/schemas/memberships';
import {
  removeMembership,
  updateMembership,
} from '@/server/services/memberships';

type Params = {
  params: {
    groupId: string;
    membershipId: string;
  };
};

export async function PATCH(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const { groupId, membershipId } = membershipIdParamsSchema.parse(params);
    const body = await req.json();
    const input = updateMembershipSchema.parse(body);

    return updateMembership(groupId, userId, membershipId, input);
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const { groupId, membershipId } = membershipIdParamsSchema.parse(params);

    return removeMembership(groupId, userId, membershipId);
  });
}

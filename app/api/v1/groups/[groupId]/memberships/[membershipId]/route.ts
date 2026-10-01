import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { membershipIdParamsSchema, updateMembershipSchema } from '@/lib/server/schemas/memberships';
import { removeMembership, updateMembership } from '@/lib/server/services/memberships';

type Params = {
  params: Promise<{
    groupId: string;
    membershipId: string;
  }>;
};

export async function PATCH(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { groupId, membershipId } = membershipIdParamsSchema.parse(resolved);
    const body: unknown = await req.json();
    const input = updateMembershipSchema.parse(body);

    return updateMembership(groupId, userId, membershipId, input);
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { groupId, membershipId } = membershipIdParamsSchema.parse(resolved);

    return removeMembership(groupId, userId, membershipId);
  });
}

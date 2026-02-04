import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import {
  groupIdParamsSchema,
  updateGroupSchema,
} from '@/server/schemas/groups';
import {
  deleteGroupForUser,
  getGroupForUser,
  updateGroupForUser,
} from '@/server/services/groups';

type Params = {
  params: Promise<{
    groupId: string;
  }>;
};

export async function GET(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { groupId } = groupIdParamsSchema.parse(resolved);

    return getGroupForUser(groupId, userId);
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { groupId } = groupIdParamsSchema.parse(resolved);
    const body = await req.json();
    const input = updateGroupSchema.parse(body);

    return updateGroupForUser(groupId, userId, input);
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { groupId } = groupIdParamsSchema.parse(resolved);

    return deleteGroupForUser(groupId, userId);
  });
}

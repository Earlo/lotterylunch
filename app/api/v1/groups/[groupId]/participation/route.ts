import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { groupIdParamsSchema } from '@/lib/server/schemas/groups';
import { participationSchema } from '@/lib/server/schemas/lottery';
import { getParticipation, setParticipation } from '@/lib/server/services/lottery';

type Params = { params: Promise<{ groupId: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const { groupId } = groupIdParamsSchema.parse(await params);
    return getParticipation(groupId, userId);
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const { groupId } = groupIdParamsSchema.parse(await params);
    const { participating } = participationSchema.parse(await request.json());
    return setParticipation(groupId, userId, participating);
  });
}

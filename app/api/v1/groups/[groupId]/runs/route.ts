import { requireUser } from '@/lib/server/auth/session';
import { handleRoute, jsonCreated } from '@/lib/server/http/responses';
import { groupIdParamsSchema } from '@/lib/server/schemas/groups';
import { executeLotterySchema } from '@/lib/server/schemas/lottery';
import { executeLottery, listLunchRuns } from '@/lib/server/services/lottery';

type Params = { params: Promise<{ groupId: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const { groupId } = groupIdParamsSchema.parse(await params);
    return listLunchRuns(groupId, userId);
  });
}

export async function POST(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const { groupId } = groupIdParamsSchema.parse(await params);
    const input = executeLotterySchema.parse(await request.json());
    return jsonCreated(await executeLottery(groupId, userId, input));
  });
}

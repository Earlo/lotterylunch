import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import {
  createLotterySchema,
  groupLotteryParamsSchema,
} from '@/server/schemas/lotteries';
import { createLottery, listLotteries } from '@/server/services/lotteries';

type Params = {
  params: Promise<{
    groupId: string;
  }>;
};

export async function GET(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { groupId } = groupLotteryParamsSchema.parse(resolved);

    return listLotteries(groupId, userId);
  });
}

export async function POST(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { groupId } = groupLotteryParamsSchema.parse(resolved);
    const body = await req.json();
    const input = createLotterySchema.parse(body);

    return createLottery(groupId, userId, input);
  });
}

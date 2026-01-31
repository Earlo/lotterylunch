import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import {
  createLotterySchema,
  groupLotteryParamsSchema,
} from '@/server/schemas/lotteries';
import { createLottery, listLotteries } from '@/server/services/lotteries';

type Params = {
  params: {
    groupId: string;
  };
};

export async function GET(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const { groupId } = groupLotteryParamsSchema.parse(params);

    return listLotteries(groupId, userId);
  });
}

export async function POST(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const { groupId } = groupLotteryParamsSchema.parse(params);
    const body = await req.json();
    const input = createLotterySchema.parse(body);

    return createLottery(groupId, userId, input);
  });
}

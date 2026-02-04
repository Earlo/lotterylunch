import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import {
  lotteryIdParamsSchema,
  updateLotterySchema,
} from '@/server/schemas/lotteries';
import {
  deleteLottery,
  getLottery,
  updateLottery,
} from '@/server/services/lotteries';

type Params = {
  params: Promise<{
    lotteryId: string;
  }>;
};

export async function GET(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { lotteryId } = lotteryIdParamsSchema.parse(resolved);

    return getLottery(lotteryId, userId);
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { lotteryId } = lotteryIdParamsSchema.parse(resolved);
    const body = await req.json();
    const input = updateLotterySchema.parse(body);

    return updateLottery(lotteryId, userId, input);
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { lotteryId } = lotteryIdParamsSchema.parse(resolved);

    return deleteLottery(lotteryId, userId);
  });
}

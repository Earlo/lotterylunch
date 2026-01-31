import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import { createRunSchema, lotteryRunParamsSchema } from '@/server/schemas/runs';
import { createRun, listRuns } from '@/server/services/runs';

type Params = {
  params: {
    lotteryId: string;
  };
};

export async function GET(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const { lotteryId } = lotteryRunParamsSchema.parse(params);

    return listRuns(lotteryId, userId);
  });
}

export async function POST(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const { lotteryId } = lotteryRunParamsSchema.parse(params);
    const body = await req.json();
    const input = createRunSchema.parse(body);

    return createRun(lotteryId, userId, input);
  });
}

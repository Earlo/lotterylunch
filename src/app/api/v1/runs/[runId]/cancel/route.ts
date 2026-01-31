import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import { runIdParamsSchema } from '@/server/schemas/runs';
import { cancelRun } from '@/server/services/runs';

type Params = {
  params: {
    runId: string;
  };
};

export async function POST(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const { runId } = runIdParamsSchema.parse(params);

    return cancelRun(runId, userId);
  });
}

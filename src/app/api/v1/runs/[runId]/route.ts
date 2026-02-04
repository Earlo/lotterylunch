import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import { runIdParamsSchema } from '@/server/schemas/runs';
import { getRun } from '@/server/services/runs';

type Params = {
  params: Promise<{
    runId: string;
  }>;
};

export async function GET(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { runId } = runIdParamsSchema.parse(resolved);

    return getRun(runId, userId);
  });
}

import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import {
  runParticipationParamsSchema,
  upsertParticipationSchema,
} from '@/server/schemas/participations';
import {
  listParticipations,
  upsertMyParticipation,
} from '@/server/services/participations';

type Params = {
  params: Promise<{
    runId: string;
  }>;
};

export async function GET(_req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { runId } = runParticipationParamsSchema.parse(resolved);

    return listParticipations(runId, userId);
  });
}

export async function POST(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { runId } = runParticipationParamsSchema.parse(resolved);
    const body = await req.json();
    const input = upsertParticipationSchema.parse(body);

    return upsertMyParticipation(runId, userId, input);
  });
}

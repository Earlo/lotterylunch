import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import {
  createCalendarArtifactSchema,
  matchIdParams,
} from '@/server/schemas/calendar';
import { createCalendarArtifact } from '@/server/services/calendar';

type Params = {
  params: Promise<{ matchId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { matchId } = matchIdParams.parse(resolved);
    const body = await req.json();
    const input = createCalendarArtifactSchema.parse(body);
    return createCalendarArtifact(matchId, userId, input);
  });
}

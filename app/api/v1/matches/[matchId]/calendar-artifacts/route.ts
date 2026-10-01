import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { createCalendarArtifactSchema, matchIdParams } from '@/lib/server/schemas/calendar';
import { createCalendarArtifact } from '@/lib/server/services/calendar';

type Params = {
  params: Promise<{ matchId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const resolved = await params;
    const { matchId } = matchIdParams.parse(resolved);
    const body: unknown = await req.json();
    const input = createCalendarArtifactSchema.parse(body);
    return createCalendarArtifact(matchId, userId, input);
  });
}

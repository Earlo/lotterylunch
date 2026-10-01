import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { createCalendarConnectionSchema } from '@/lib/server/schemas/calendar';
import { createCalendarConnection, listCalendarConnections } from '@/lib/server/services/calendar';

export async function GET() {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    return listCalendarConnections(userId);
  });
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const body: unknown = await req.json();
    const input = createCalendarConnectionSchema.parse(body);
    return createCalendarConnection(userId, input.provider);
  });
}

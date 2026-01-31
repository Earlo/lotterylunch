import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import { createCalendarConnectionSchema } from '@/server/schemas/calendar';
import {
  createCalendarConnection,
  listCalendarConnections,
} from '@/server/services/calendar';

export async function GET() {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    return listCalendarConnections(userId);
  });
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    const body = await req.json();
    const input = createCalendarConnectionSchema.parse(body);
    return createCalendarConnection(userId, input.provider);
  });
}

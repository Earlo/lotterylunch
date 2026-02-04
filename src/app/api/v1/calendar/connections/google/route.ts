import { requireUser } from '@/server/auth/session';
import { handleRoute } from '@/server/http/responses';
import { startGoogleCalendarConnectionSchema } from '@/server/schemas/calendar';
import { startGoogleCalendarConnection } from '@/server/services/calendar';

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { userId } = await requireUser();
    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const input = startGoogleCalendarConnectionSchema.parse(body);
    return startGoogleCalendarConnection(userId, input.returnTo);
  });
}

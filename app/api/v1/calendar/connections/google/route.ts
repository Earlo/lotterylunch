import { requireUser } from '@/lib/server/auth/session';
import { handleRoute } from '@/lib/server/http/responses';
import { startGoogleCalendarConnectionSchema } from '@/lib/server/schemas/calendar';
import { startGoogleCalendarConnection } from '@/lib/server/services/calendar';

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

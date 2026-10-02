import crypto from 'crypto';
import { env } from '@/lib/env';
import { requireUser } from '@/lib/server/auth/session';
import { unauthorized } from '@/lib/server/http/errors';
import { handleRoute } from '@/lib/server/http/responses';
import { startGoogleCalendarConnectionSchema } from '@/lib/server/schemas/calendar';
import {
  GOOGLE_CALENDAR_COOKIE,
  GOOGLE_CALENDAR_COOKIE_PATH,
  GOOGLE_CALENDAR_STATE_SECONDS,
  startGoogleCalendarConnection,
} from '@/lib/server/services/calendar';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { userId, session } = await requireUser();
    if (!session?.user) throw unauthorized('Sign in with your browser to connect Google Calendar');
    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const input = startGoogleCalendarConnectionSchema.parse(body);
    const browserNonce = crypto.randomBytes(32).toString('hex');
    const result = await startGoogleCalendarConnection(userId, browserNonce, input.returnTo);
    const cookieStore = await cookies();
    cookieStore.set(GOOGLE_CALENDAR_COOKIE, browserNonce, {
      httpOnly: true,
      secure: new URL(env('BETTER_AUTH_URL')).protocol === 'https:',
      sameSite: 'lax',
      path: GOOGLE_CALENDAR_COOKIE_PATH,
      maxAge: GOOGLE_CALENDAR_STATE_SECONDS,
    });
    return result;
  });
}

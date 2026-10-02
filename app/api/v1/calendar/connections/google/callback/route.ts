import { env } from '@/lib/env';
import { requireUser } from '@/lib/server/auth/session';
import { unauthorized } from '@/lib/server/http/errors';
import {
  completeGoogleCalendarConnection,
  GOOGLE_CALENDAR_COOKIE,
  GOOGLE_CALENDAR_COOKIE_PATH,
} from '@/lib/server/services/calendar';
import { cookies } from 'next/headers';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const baseUrl = env('BETTER_AUTH_URL');
  const cookieStore = await cookies();

  try {
    const { userId, session } = await requireUser();
    if (!session?.user) throw unauthorized('Sign in with your browser to connect Google Calendar');
    const browserNonce = cookieStore.get(GOOGLE_CALENDAR_COOKIE)?.value ?? '';
    const result = await completeGoogleCalendarConnection(url.searchParams, userId, browserNonce);
    const redirectUrl = new URL(result.returnTo, baseUrl);
    redirectUrl.searchParams.set('calendar', result.status === 'connected' ? 'connected' : 'error');
    if (result.status === 'error' && result.error) {
      redirectUrl.searchParams.set('reason', result.error);
    }
    return Response.redirect(redirectUrl.toString());
  } catch (err) {
    console.error('[calendar] google callback failed', err);
    const fallback = new URL('/portal/settings', baseUrl);
    fallback.searchParams.set('calendar', 'error');
    return Response.redirect(fallback.toString());
  } finally {
    cookieStore.set(GOOGLE_CALENDAR_COOKIE, '', {
      httpOnly: true,
      secure: new URL(baseUrl).protocol === 'https:',
      sameSite: 'lax',
      path: GOOGLE_CALENDAR_COOKIE_PATH,
      maxAge: 0,
    });
  }
}

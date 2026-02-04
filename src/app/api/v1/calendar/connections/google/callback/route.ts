import { env } from '@/lib/env';
import { completeGoogleCalendarConnection } from '@/server/services/calendar';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const baseUrl = env('BETTER_AUTH_URL');

  try {
    const result = await completeGoogleCalendarConnection(url.searchParams);
    const redirectUrl = new URL(result.returnTo, baseUrl);
    redirectUrl.searchParams.set(
      'calendar',
      result.status === 'connected' ? 'connected' : 'error',
    );
    if (result.status === 'error' && result.error) {
      redirectUrl.searchParams.set('reason', result.error);
    }
    return Response.redirect(redirectUrl.toString());
  } catch (err) {
    console.error('[calendar] google callback failed', err);
    const fallback = new URL('/portal/settings', baseUrl);
    fallback.searchParams.set('calendar', 'error');
    return Response.redirect(fallback.toString());
  }
}

import { env } from '@/lib/env';
import { badRequest } from '@/lib/server/http/errors';
import type { CreateCalendarArtifactInput } from '@/lib/server/schemas/calendar';
import { z } from 'zod';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const GOOGLE_REQUEST_TIMEOUT_MS = 8_000;

function googleRequestSignal(deadline?: number) {
  const timeout = Math.min(GOOGLE_REQUEST_TIMEOUT_MS, deadline === undefined ? Infinity : deadline - Date.now());
  if (timeout <= 0) throw badRequest('Google Calendar request timed out; please try again');
  return AbortSignal.timeout(timeout);
}

const googleTokenResponseSchema = z.object({
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

type GoogleTokenResponse = z.infer<typeof googleTokenResponseSchema>;

const googleCalendarEventResponseSchema = z.object({
  id: z.string().optional(),
  htmlLink: z.string().optional(),
  status: z.string().optional(),
  error: z.object({ message: z.string().optional() }).optional(),
});

export type GoogleOAuthTokens = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  tokenType?: string;
};

export type GoogleCalendarEvent = {
  id?: string;
  htmlLink?: string;
  status?: string;
};

export function buildGoogleAuthUrl(state: string, redirectUri: string) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', env('GOOGLE_CLIENT_ID'));
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

function normalizeTokenResponse(data: GoogleTokenResponse, refreshToken?: string): GoogleOAuthTokens {
  if (data.error) {
    throw badRequest('Google OAuth failed', {
      error: data.error,
      errorDescription: data.error_description,
    });
  }

  const expiresAt =
    typeof data.expires_in === 'number' ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined;
  const normalizedRefreshToken = data.refresh_token ?? refreshToken;

  return {
    ...(data.access_token !== undefined && { accessToken: data.access_token }),
    ...(normalizedRefreshToken !== undefined && { refreshToken: normalizedRefreshToken }),
    ...(expiresAt !== undefined && { expiresAt }),
    ...(data.scope !== undefined && { scope: data.scope }),
    ...(data.token_type !== undefined && { tokenType: data.token_type }),
  };
}

async function fetchGoogleToken(body: URLSearchParams, deadline?: number): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    signal: googleRequestSignal(deadline),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = googleTokenResponseSchema.parse(await response.json());
  if (!response.ok) {
    throw badRequest('Google OAuth failed', {
      status: response.status,
      error: data.error ?? response.statusText,
      errorDescription: data.error_description,
    });
  }
  return data;
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleOAuthTokens> {
  const body = new URLSearchParams({
    code,
    client_id: env('GOOGLE_CLIENT_ID'),
    client_secret: env('GOOGLE_CLIENT_SECRET'),
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const data = await fetchGoogleToken(body);
  return normalizeTokenResponse(data);
}

export async function refreshGoogleAccessToken(refreshToken: string, deadline?: number): Promise<GoogleOAuthTokens> {
  const body = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    client_secret: env('GOOGLE_CLIENT_SECRET'),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const data = await fetchGoogleToken(body, deadline);
  return normalizeTokenResponse(data, refreshToken);
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  input: Omit<CreateCalendarArtifactInput, 'provider'>,
  deadline?: number,
): Promise<GoogleCalendarEvent> {
  const descriptionParts = [];
  if (input.meetingUrl) descriptionParts.push(`Meeting: ${input.meetingUrl}`);
  if (input.notes) descriptionParts.push(input.notes);

  const eventBody = {
    summary: input.title,
    location: input.location,
    description: descriptionParts.length ? descriptionParts.join('\n\n') : undefined,
    start: {
      dateTime: input.startsAt,
      timeZone: input.timezone,
    },
    end: {
      dateTime: input.endsAt,
      timeZone: input.timezone,
    },
  };

  const response = await fetch(GOOGLE_EVENTS_URL, {
    method: 'POST',
    signal: googleRequestSignal(deadline),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventBody),
  });

  const data = googleCalendarEventResponseSchema.parse(await response.json());

  if (!response.ok) {
    throw badRequest('Google Calendar API error', {
      status: response.status,
      error: data?.error?.message ?? response.statusText,
    });
  }

  return {
    ...(data.id !== undefined && { id: data.id }),
    ...(data.htmlLink !== undefined && { htmlLink: data.htmlLink }),
    ...(data.status !== undefined && { status: data.status }),
  };
}

import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { badRequest, notFound } from '@/server/http/errors';
import {
  buildGoogleAuthUrl,
  createGoogleCalendarEvent,
  exchangeGoogleCode,
  refreshGoogleAccessToken,
  type GoogleOAuthTokens,
} from '@/server/integrations/calendar/google';
import type { CreateCalendarArtifactInput } from '@/server/schemas/calendar';
import { emitWebhookEvent } from '@/server/services/webhooks';
import crypto from 'crypto';

export async function listCalendarConnections(userId: string) {
  const connections = await prisma.calendarConnection.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
  });
  return connections.map((connection) => ({
    ...connection,
    oauthTokens: {},
  }));
}

export async function createCalendarConnection(
  userId: string,
  provider: 'google' | 'outlook' | 'apple' | 'ics',
) {
  if (provider === 'google') {
    throw badRequest('Google Calendar requires OAuth connection flow');
  }

  const connection = await prisma.calendarConnection.create({
    data: {
      userId,
      provider,
      status: 'connected',
      oauthTokens: {},
    },
  });

  return { ...connection, oauthTokens: {} };
}

export async function deleteCalendarConnection(userId: string, id: string) {
  const connection = await prisma.calendarConnection.findUnique({
    where: { id },
  });

  if (!connection || connection.userId !== userId) {
    throw notFound('Calendar connection not found');
  }

  await prisma.calendarConnection.delete({ where: { id } });
  return { id, deleted: true as const };
}

function normalizeReturnTo(value?: string | null) {
  if (!value) return '/portal/settings';
  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/portal/settings';
  }
  return value;
}

function getGoogleRedirectUri() {
  return new URL(
    '/api/v1/calendar/connections/google/callback',
    env('BETTER_AUTH_URL'),
  ).toString();
}

export async function startGoogleCalendarConnection(
  userId: string,
  returnTo?: string | null,
) {
  const state = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const normalizedReturnTo = normalizeReturnTo(returnTo);

  await prisma.verification.create({
    data: {
      identifier: `calendar-google:${state}`,
      value: JSON.stringify({ userId, returnTo: normalizedReturnTo }),
      expiresAt,
    },
  });

  const redirectUri = getGoogleRedirectUri();
  const url = buildGoogleAuthUrl(state, redirectUri);
  return { url };
}

export async function completeGoogleCalendarConnection(
  params: URLSearchParams,
) {
  const state = params.get('state');
  if (!state) throw badRequest('Missing OAuth state');

  const identifier = `calendar-google:${state}`;
  const verification = await prisma.verification.findFirst({
    where: { identifier },
  });

  if (!verification || verification.expiresAt < new Date()) {
    throw badRequest('OAuth state is invalid or expired');
  }

  let payload: { userId?: string; returnTo?: string } = {};
  try {
    payload = JSON.parse(verification.value) as {
      userId?: string;
      returnTo?: string;
    };
  } catch {
    payload = {};
  }

  const returnTo = normalizeReturnTo(payload.returnTo);
  await prisma.verification.deleteMany({ where: { identifier } });

  const error = params.get('error');
  if (error) {
    return { status: 'error' as const, returnTo, error };
  }

  const code = params.get('code');
  if (!code) throw badRequest('Missing authorization code');

  const tokens = await exchangeGoogleCode(code, getGoogleRedirectUri());
  if (!tokens.accessToken) {
    throw badRequest('Google OAuth did not return an access token');
  }

  if (!payload.userId) {
    throw badRequest('Unable to identify user for calendar connection');
  }

  const existing = await prisma.calendarConnection.findFirst({
    where: { userId: payload.userId, provider: 'google' },
  });

  if (existing) {
    await prisma.calendarConnection.update({
      where: { id: existing.id },
      data: {
        status: 'connected',
        oauthTokens: tokens,
      },
    });
  } else {
    await prisma.calendarConnection.create({
      data: {
        userId: payload.userId,
        provider: 'google',
        status: 'connected',
        oauthTokens: tokens,
      },
    });
  }

  return { status: 'connected' as const, returnTo };
}

function extractGoogleTokens(value: unknown): GoogleOAuthTokens {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  return {
    accessToken:
      typeof record.accessToken === 'string' ? record.accessToken : undefined,
    refreshToken:
      typeof record.refreshToken === 'string' ? record.refreshToken : undefined,
    expiresAt:
      typeof record.expiresAt === 'string' ? record.expiresAt : undefined,
    scope: typeof record.scope === 'string' ? record.scope : undefined,
    tokenType:
      typeof record.tokenType === 'string' ? record.tokenType : undefined,
  };
}

async function ensureGoogleAccessToken(connection: {
  id: string;
  oauthTokens: unknown;
}) {
  const tokens = extractGoogleTokens(connection.oauthTokens);

  const needsRefresh = tokens.expiresAt
    ? new Date(tokens.expiresAt).getTime() <= Date.now() + 60 * 1000
    : false;

  if (tokens.accessToken && !needsRefresh) {
    return { accessToken: tokens.accessToken, tokens };
  }

  if (!tokens.refreshToken) {
    throw badRequest('Google Calendar connection needs to be reconnected');
  }

  const refreshed = await refreshGoogleAccessToken(tokens.refreshToken);
  const merged = { ...tokens, ...refreshed };

  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: {
      status: 'connected',
      oauthTokens: merged,
    },
  });

  if (!merged.accessToken) {
    throw badRequest('Google OAuth refresh did not return an access token');
  }

  return { accessToken: merged.accessToken, tokens: merged };
}

async function createGoogleCalendarArtifact(
  matchId: string,
  userId: string,
  input: Omit<CreateCalendarArtifactInput, 'provider'>,
) {
  const connection = await prisma.calendarConnection.findFirst({
    where: { userId, provider: 'google' },
  });

  if (!connection) {
    throw badRequest('Google Calendar is not connected');
  }

  const { accessToken, tokens } = await ensureGoogleAccessToken(connection);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  const timezone = input.timezone ?? user?.timezone ?? 'UTC';

  const event = await createGoogleCalendarEvent(accessToken, {
    ...input,
    timezone,
  });

  if (!event.id) {
    throw badRequest('Google Calendar did not return an event id');
  }

  const artifact = await prisma.calendarArtifact.create({
    data: {
      matchId,
      type: 'google',
      payload: {
        ...input,
        timezone,
        connectionId: connection.id,
        eventId: event.id,
        eventLink: event.htmlLink,
        tokenScope: tokens.scope,
      },
    },
  });

  await emitWebhookEvent(userId, 'calendar.artifact.created', {
    matchId,
    artifactId: artifact.id,
  });

  return artifact;
}

export async function createCalendarArtifact(
  matchId: string,
  userId: string,
  input: CreateCalendarArtifactInput,
) {
  const { provider = 'ics', ...payload } = input;

  if (provider === 'google') {
    return createGoogleCalendarArtifact(matchId, userId, payload);
  }
  if (provider !== 'ics') {
    throw badRequest('Calendar provider not supported yet');
  }

  const artifact = await prisma.calendarArtifact.create({
    data: {
      matchId,
      type: 'ics',
      payload: {
        ...payload,
      },
    },
  });

  await emitWebhookEvent(userId, 'calendar.artifact.created', {
    matchId,
    artifactId: artifact.id,
  });

  return artifact;
}

export async function getCalendarArtifact(id: string) {
  const artifact = await prisma.calendarArtifact.findUnique({ where: { id } });
  if (!artifact) throw notFound('Calendar artifact not found');
  return artifact;
}

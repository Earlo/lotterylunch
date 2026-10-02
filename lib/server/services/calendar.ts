import crypto from 'crypto';
import type { Prisma } from '@/generated/prisma/client';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { requireGroupMembership } from '@/lib/server/auth/authorization';
import { lockGroupForUpdate } from '@/lib/server/db/group-lock';
import { badRequest, forbidden, notFound } from '@/lib/server/http/errors';
import { localRedirectPath } from '@/lib/server/http/redirects';
import {
  buildGoogleAuthUrl,
  createGoogleCalendarEvent,
  exchangeGoogleCode,
  refreshGoogleAccessToken,
  type GoogleOAuthTokens,
} from '@/lib/server/integrations/calendar/google';
import type { CreateCalendarArtifactInput } from '@/lib/server/schemas/calendar';
import { emitWebhookEvent } from '@/lib/server/services/webhooks';
import { z } from 'zod';

const googleConnectionStateSchema = z.object({
  userId: z.string().min(1),
  browserNonceHash: z.string().regex(/^[a-f0-9]{64}$/),
  returnTo: z.string().optional(),
});

export const GOOGLE_CALENDAR_COOKIE = 'lotterylunch.calendar-google';
export const GOOGLE_CALENDAR_COOKIE_PATH = '/api/v1/calendar/connections/google/callback';
export const GOOGLE_CALENDAR_STATE_SECONDS = 10 * 60;

function browserNonceHash(nonce: string) {
  if (!/^[a-f0-9]{64}$/.test(nonce)) throw badRequest('Calendar OAuth browser binding is missing or invalid');
  return crypto.createHash('sha256').update(nonce).digest('hex');
}

export async function listCalendarConnections(userId: string) {
  const connections = await prisma.calendarConnection.findMany({
    where: { userId, provider: 'google' },
    orderBy: { id: 'asc' },
  });
  return connections.map((connection) => {
    connection.oauthTokens = {};
    return connection;
  });
}

export function createCalendarConnection(_userId: string, _provider: string): never {
  throw badRequest('Connect Google Calendar through OAuth; ICS downloads do not require a connection');
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

function getGoogleRedirectUri() {
  return new URL('/api/v1/calendar/connections/google/callback', env('BETTER_AUTH_URL')).toString();
}

export async function startGoogleCalendarConnection(userId: string, browserNonce: string, returnTo?: string | null) {
  const state = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + GOOGLE_CALENDAR_STATE_SECONDS * 1000);
  const normalizedReturnTo = localRedirectPath(returnTo);
  const nonceHash = browserNonceHash(browserNonce);
  const url = buildGoogleAuthUrl(state, getGoogleRedirectUri());

  await prisma.verification.create({
    data: {
      identifier: `calendar-google:${state}`,
      value: JSON.stringify({ userId, browserNonceHash: nonceHash, returnTo: normalizedReturnTo }),
      expiresAt,
    },
  });

  return { url };
}

export async function completeGoogleCalendarConnection(params: URLSearchParams, userId: string, browserNonce: string) {
  const state = params.get('state');
  if (!state || !/^[a-f0-9]{64}$/.test(state)) throw badRequest('Missing or invalid OAuth state');
  const nonceHash = browserNonceHash(browserNonce);

  const identifier = `calendar-google:${state}`;
  const verification = await prisma.verification.findFirst({
    where: { identifier },
  });

  if (!verification || verification.expiresAt <= new Date()) {
    throw badRequest('OAuth state is invalid or expired');
  }

  let payload: z.infer<typeof googleConnectionStateSchema>;
  try {
    payload = googleConnectionStateSchema.parse(JSON.parse(verification.value));
  } catch {
    throw badRequest('OAuth state is invalid or expired');
  }

  if (
    payload.userId !== userId ||
    !crypto.timingSafeEqual(Buffer.from(payload.browserNonceHash, 'hex'), Buffer.from(nonceHash, 'hex'))
  ) {
    throw badRequest('Calendar OAuth must finish in the browser and account that started it');
  }

  const returnTo = localRedirectPath(payload.returnTo);
  const consumed = await prisma.verification.deleteMany({
    where: {
      id: verification.id,
      identifier,
      value: verification.value,
      expiresAt: { gt: new Date() },
    },
  });
  if (consumed.count !== 1) throw badRequest('OAuth state is invalid, expired, or already used');

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

  await prisma.$transaction(async (tx) => {
    // Separate browser sessions can finish different valid states concurrently.
    // Serialize the lookup and write so a user gets one new Google connection.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const existing = await tx.calendarConnection.findFirst({
      where: { userId, provider: 'google' },
      orderBy: { id: 'asc' },
    });
    if (existing) {
      await tx.calendarConnection.update({
        where: { id: existing.id },
        data: { status: 'connected', oauthTokens: tokens },
      });
    } else {
      await tx.calendarConnection.create({
        data: { userId, provider: 'google', status: 'connected', oauthTokens: tokens },
      });
    }
  });

  return { status: 'connected' as const, returnTo };
}

function extractGoogleTokens(value: unknown): GoogleOAuthTokens {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  if (!parsed.success) return {};
  const record = parsed.data;
  const tokens: GoogleOAuthTokens = {};
  for (const key of ['accessToken', 'refreshToken', 'expiresAt', 'scope', 'tokenType'] as const) {
    if (typeof record[key] === 'string') tokens[key] = record[key];
  }
  return tokens;
}

async function ensureGoogleAccessToken(
  connection: { id: string; oauthTokens: unknown },
  db: Pick<Prisma.TransactionClient, 'calendarConnection'>,
  deadline: number,
) {
  const tokens = extractGoogleTokens(connection.oauthTokens);

  const needsRefresh = tokens.expiresAt ? new Date(tokens.expiresAt).getTime() <= Date.now() + 60 * 1000 : false;

  if (tokens.accessToken && !needsRefresh) {
    return { accessToken: tokens.accessToken, tokens };
  }

  if (!tokens.refreshToken) {
    throw badRequest('Google Calendar connection needs to be reconnected');
  }

  const refreshed = await refreshGoogleAccessToken(tokens.refreshToken, deadline);
  const merged = { ...tokens, ...refreshed };

  await db.calendarConnection.update({
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
  tx: Prisma.TransactionClient,
  deadline: number,
) {
  const connection = await tx.calendarConnection.findFirst({
    where: { userId, provider: 'google', status: 'connected' },
  });

  if (!connection) {
    throw badRequest('Google Calendar is not connected');
  }

  const { accessToken, tokens } = await ensureGoogleAccessToken(connection, tx, deadline);
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  const timezone = input.timezone ?? user?.timezone ?? 'UTC';

  const event = await createGoogleCalendarEvent(accessToken, { ...input, timezone }, deadline);

  if (!event.id) {
    throw badRequest('Google Calendar did not return an event id');
  }

  return tx.calendarArtifact.create({
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
}

async function requireCalendarMatchAccess(
  matchId: string,
  userId: string,
  db: Pick<Prisma.TransactionClient, 'match' | 'membership'> = prisma,
) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { groupId: true, memberIds: true, state: true, status: true },
  });
  if (!match) throw notFound('Match not found');
  const membership = await requireGroupMembership(match.groupId, userId, undefined, db);
  const participants = z.array(z.string()).safeParse(match.memberIds);
  if (
    membership.role !== 'owner' &&
    membership.role !== 'admin' &&
    (!participants.success || !participants.data.includes(userId))
  ) {
    throw forbidden('Only match participants or group administrators can access calendar artifacts');
  }
  if (match.state === 'cancelled' || match.status === 'canceled') {
    throw badRequest('Calendar artifacts are unavailable for a canceled match');
  }
}

export async function createCalendarArtifact(matchId: string, userId: string, input: CreateCalendarArtifactInput) {
  const artifact = await prisma.$transaction(
    async (tx) => {
      // Reserve time to persist the response before Prisma's transaction timeout.
      const googleDeadline = Date.now() + 18_000;
      const match = await tx.match.findUnique({ where: { id: matchId }, select: { groupId: true } });
      if (!match) throw notFound('Match not found');
      // Recheck access after the same lock used by membership suspension/removal
      // and group deletion. The lock remains held until the artifact is saved.
      await lockGroupForUpdate(tx, match.groupId);
      await requireCalendarMatchAccess(matchId, userId, tx);
      const { provider = 'ics', ...payload } = input;
      if (provider === 'google') return createGoogleCalendarArtifact(matchId, userId, payload, tx, googleDeadline);
      if (provider !== 'ics') throw badRequest('Calendar provider not supported yet');
      return tx.calendarArtifact.create({ data: { matchId, type: 'ics', payload } });
    },
    { timeout: 20_000 },
  );

  await emitWebhookEvent(userId, 'calendar.artifact.created', {
    matchId,
    artifactId: artifact.id,
  });

  return artifact;
}

export async function getCalendarArtifact(id: string, userId: string) {
  const artifact = await prisma.calendarArtifact.findUnique({ where: { id } });
  if (!artifact) throw notFound('Calendar artifact not found');
  await requireCalendarMatchAccess(artifact.matchId, userId);
  return artifact;
}

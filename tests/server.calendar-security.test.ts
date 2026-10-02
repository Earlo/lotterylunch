import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { prisma } from '@/lib/prisma';
import { HttpError } from '@/lib/server/http/errors';
import { createGoogleCalendarEvent } from '@/lib/server/integrations/calendar/google';
import { createCalendarArtifactSchema, createCalendarConnectionSchema } from '@/lib/server/schemas/calendar';
import {
  completeGoogleCalendarConnection,
  createCalendarArtifact,
  createCalendarConnection,
  getCalendarArtifact,
  startGoogleCalendarConnection,
} from '@/lib/server/services/calendar';

const userId = 'calendar-user';
const browserNonce = 'a'.repeat(64);
const matchId = '7b3bff00-0c77-4d21-b990-9a05b3c117a2';
const groupId = '7b3bff00-0c77-4d21-b990-9a05b3c117a3';
const artifactId = '7b3bff00-0c77-4d21-b990-9a05b3c117a4';
const artifactInput = {
  title: 'Lunch together',
  startsAt: '2026-10-01T12:00:00.000Z',
  endsAt: '2026-10-01T13:00:00.000Z',
  notes: 'Private lunch notes',
};

function httpStatus(status: number) {
  return (error: unknown) => error instanceof HttpError && error.status === status;
}

function mockPrismaMethod<Delegate extends object, Implementation extends (...args: never[]) => unknown>(
  context: TestContext,
  delegate: Delegate,
  method: keyof Delegate,
  implementation: Implementation,
) {
  const original = delegate[method];
  const mocked = context.mock.fn(implementation);
  Object.assign(delegate, { [method]: mocked });
  context.after(() => {
    Object.assign(delegate, { [method]: original });
  });
  return mocked;
}

function mockCalendarTransaction(context: TestContext, beforeLock = () => {}) {
  mockPrismaMethod(context, prisma, '$transaction', (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  mockPrismaMethod(context, prisma, '$queryRaw', () => {
    beforeLock();
    return Promise.resolve([{ id: groupId }]);
  });
  mockPrismaMethod(context, prisma.group, 'findUniqueOrThrow', () => Promise.resolve({ id: groupId }));
}

function mockOAuth(context: TestContext) {
  mockPrismaMethod(context, prisma, '$transaction', (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  mockPrismaMethod(context, prisma, '$queryRaw', () => Promise.resolve([{ id: userId }]));
  const fakeEnvironment = {
    BETTER_AUTH_URL: 'https://lotterylunch.test',
    GOOGLE_CLIENT_ID: 'fake-client-id',
    GOOGLE_CLIENT_SECRET: 'fake-client-secret',
  };
  for (const [key, value] of Object.entries(fakeEnvironment)) {
    const previous = process.env[key];
    process.env[key] = value;
    context.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }

  type StateRecord = { id: string; identifier: string; value: string; expiresAt: Date };
  let state: StateRecord | null = null;
  mockPrismaMethod(context, prisma.verification, 'create', ({ data }: { data: Omit<StateRecord, 'id'> }) => {
    state = { id: 'state-record', ...data };
    return Promise.resolve(state);
  });
  mockPrismaMethod(context, prisma.verification, 'findFirst', ({ where }: { where: { identifier: string } }) => {
    return Promise.resolve(state?.identifier === where.identifier ? { ...state } : null);
  });
  mockPrismaMethod(
    context,
    prisma.verification,
    'deleteMany',
    ({ where }: { where: Omit<StateRecord, 'expiresAt'> & { expiresAt: { gt: Date } } }) => {
      const matches =
        state?.id === where.id &&
        state.identifier === where.identifier &&
        state.value === where.value &&
        state.expiresAt > where.expiresAt.gt;
      if (matches) state = null;
      return Promise.resolve({ count: matches ? 1 : 0 });
    },
  );
  mockPrismaMethod(context, prisma.calendarConnection, 'findFirst', () => Promise.resolve(null));
  const connectionWrites: Array<{ userId: string }> = [];
  mockPrismaMethod(context, prisma.calendarConnection, 'create', ({ data }: { data: { userId: string } }) => {
    connectionWrites.push(data);
    return Promise.resolve({ id: 'connection', ...data });
  });
  const fetchMock = context.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json({ access_token: 'fake-calendar-token', refresh_token: 'fake-refresh-token' })),
  );
  return {
    connectionWrites,
    fetchMock,
    state: () => state,
  };
}

async function startOAuth() {
  const { url } = await startGoogleCalendarConnection(userId, browserNonce, '/portal/settings');
  const state = new URL(url).searchParams.get('state');
  assert.ok(state);
  return new URLSearchParams({ state, code: 'fake-code' });
}

void test('calendar OAuth rejects callbacks from another browser or authenticated account before exchange', async (t) => {
  const fixture = mockOAuth(t);
  const params = await startOAuth();
  assert.ok(fixture.state());
  assert.ok(
    !fixture.state()?.value.includes(browserNonce),
    'the stored state contains only a hash of the browser nonce',
  );

  await assert.rejects(completeGoogleCalendarConnection(params, userId, ''), httpStatus(400));
  await assert.rejects(completeGoogleCalendarConnection(params, userId, 'b'.repeat(64)), httpStatus(400));
  await assert.rejects(completeGoogleCalendarConnection(params, 'different-user', browserNonce), httpStatus(400));
  assert.equal(fixture.fetchMock.mock.callCount(), 0);
  assert.equal(fixture.connectionWrites.length, 0);
  assert.ok(fixture.state(), 'an unrelated callback cannot consume the initiating browser state');

  assert.deepEqual(await completeGoogleCalendarConnection(params, userId, browserNonce), {
    status: 'connected',
    returnTo: '/portal/settings',
  });
  assert.deepEqual(
    fixture.connectionWrites.map((connection) => connection.userId),
    [userId],
  );
  await assert.rejects(completeGoogleCalendarConnection(params, userId, browserNonce), httpStatus(400));
  assert.equal(fixture.fetchMock.mock.callCount(), 1);
});

void test('calendar OAuth atomically consumes state when callbacks race', async (t) => {
  const fixture = mockOAuth(t);
  const params = await startOAuth();
  const results = await Promise.allSettled([
    completeGoogleCalendarConnection(params, userId, browserNonce),
    completeGoogleCalendarConnection(params, userId, browserNonce),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(fixture.fetchMock.mock.callCount(), 1);
  assert.equal(fixture.connectionWrites.length, 1);
});

void test('calendar OAuth rejects expired state and consumes declined consent without attaching credentials', async (t) => {
  const fixture = mockOAuth(t);
  const expiredParams = await startOAuth();
  const state = fixture.state();
  assert.ok(state);
  state.expiresAt = new Date(Date.now() - 1);
  await assert.rejects(completeGoogleCalendarConnection(expiredParams, userId, browserNonce), httpStatus(400));
  const declinedParams = await startOAuth();
  declinedParams.delete('code');
  declinedParams.set('error', 'access_denied');
  assert.deepEqual(await completeGoogleCalendarConnection(declinedParams, userId, browserNonce), {
    status: 'error',
    error: 'access_denied',
    returnTo: '/portal/settings',
  });
  await assert.rejects(completeGoogleCalendarConnection(declinedParams, userId, browserNonce), httpStatus(400));
  assert.equal(fixture.fetchMock.mock.callCount(), 0);
  assert.equal(fixture.connectionWrites.length, 0);
});

void test('calendar artifacts require an active participant or group administrator for both writes and reads', async (t) => {
  mockCalendarTransaction(t);
  let membership: { role: string; status: string } | null = null;
  let ownerId = 'group-owner';
  let match = { groupId, memberIds: [userId], state: 'scheduled', status: 'confirmed' };
  mockPrismaMethod(t, prisma.match, 'findUnique', () => Promise.resolve(match));
  mockPrismaMethod(t, prisma.membership, 'findUnique', () =>
    Promise.resolve(membership ? { id: 'membership', userId, groupId, group: { ownerId }, ...membership } : null),
  );
  const artifact = { id: artifactId, matchId, type: 'ics', payload: artifactInput };
  mockPrismaMethod(t, prisma.calendarArtifact, 'findUnique', () => Promise.resolve(artifact));
  const writes = mockPrismaMethod(t, prisma.calendarArtifact, 'create', () => Promise.resolve(artifact));
  mockPrismaMethod(t, prisma.webhookEndpoint, 'findMany', () => Promise.resolve([]));

  await assert.rejects(createCalendarArtifact(matchId, userId, artifactInput), httpStatus(404));
  await assert.rejects(getCalendarArtifact(artifactId, userId), httpStatus(404));
  membership = { role: 'member', status: 'active' };
  match = { ...match, memberIds: ['another-participant'] };
  await assert.rejects(createCalendarArtifact(matchId, userId, artifactInput), httpStatus(403));
  await assert.rejects(getCalendarArtifact(artifactId, userId), httpStatus(403));
  assert.equal(writes.mock.callCount(), 0);

  match = { ...match, memberIds: [userId] };
  assert.deepEqual(await createCalendarArtifact(matchId, userId, artifactInput), artifact);
  assert.deepEqual(await getCalendarArtifact(artifactId, userId), artifact);
  membership = { role: 'member', status: 'pending' };
  await assert.rejects(createCalendarArtifact(matchId, userId, artifactInput), httpStatus(403));
  await assert.rejects(getCalendarArtifact(artifactId, userId), httpStatus(403));
  membership = { role: 'member', status: 'suspended' };
  await assert.rejects(createCalendarArtifact(matchId, userId, artifactInput), httpStatus(403));
  await assert.rejects(getCalendarArtifact(artifactId, userId), httpStatus(403));

  match = { ...match, memberIds: ['another-participant'] };
  membership = { role: 'admin', status: 'active' };
  assert.deepEqual(await createCalendarArtifact(matchId, userId, artifactInput), artifact);
  assert.deepEqual(await getCalendarArtifact(artifactId, userId), artifact);
  membership = { role: 'owner', status: 'active' };
  await assert.rejects(createCalendarArtifact(matchId, userId, artifactInput), httpStatus(403));
  await assert.rejects(getCalendarArtifact(artifactId, userId), httpStatus(403));
  ownerId = userId;
  assert.deepEqual(await createCalendarArtifact(matchId, userId, artifactInput), artifact);
  assert.deepEqual(await getCalendarArtifact(artifactId, userId), artifact);
  membership = null;
  await assert.rejects(getCalendarArtifact(artifactId, userId), httpStatus(404));
  membership = { role: 'owner', status: 'active' };
  match = { ...match, state: 'cancelled', status: 'canceled' };
  await assert.rejects(createCalendarArtifact(matchId, userId, artifactInput), httpStatus(400));
  await assert.rejects(getCalendarArtifact(artifactId, userId), httpStatus(400));
});

void test('calendar artifact access is rechecked after concurrent suspension before writing or contacting Google', async (t) => {
  let status = 'active';
  mockCalendarTransaction(t, () => {
    status = 'suspended';
  });
  mockPrismaMethod(t, prisma.match, 'findUnique', () =>
    Promise.resolve({ groupId, memberIds: [userId], state: 'scheduled', status: 'confirmed' }),
  );
  mockPrismaMethod(t, prisma.membership, 'findUnique', () =>
    Promise.resolve({ id: 'membership', userId, groupId, role: 'member', status, group: { ownerId: 'owner' } }),
  );
  const writes = mockPrismaMethod(t, prisma.calendarArtifact, 'create', () => {
    throw new Error('A suspended user cannot save a calendar artifact');
  });
  const connectionRead = mockPrismaMethod(t, prisma.calendarConnection, 'findFirst', () => {
    throw new Error('A suspended user cannot use Google Calendar');
  });
  const fetchMock = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('A suspended user cannot create a Google event');
  });

  await assert.rejects(createCalendarArtifact(matchId, userId, { ...artifactInput, provider: 'ics' }), httpStatus(403));
  status = 'active';
  await assert.rejects(
    createCalendarArtifact(matchId, userId, { ...artifactInput, provider: 'google' }),
    httpStatus(403),
  );
  assert.equal(writes.mock.callCount(), 0);
  assert.equal(connectionRead.mock.callCount(), 0);
  assert.equal(fetchMock.mock.callCount(), 0);
});

void test('authorized Google artifacts refresh credentials and persist the returned event', async (t) => {
  mockCalendarTransaction(t);
  mockPrismaMethod(t, prisma.match, 'findUnique', () =>
    Promise.resolve({ groupId, memberIds: [userId], state: 'scheduled', status: 'confirmed' }),
  );
  mockPrismaMethod(t, prisma.membership, 'findUnique', () =>
    Promise.resolve({
      id: 'membership',
      userId,
      groupId,
      role: 'member',
      status: 'active',
      group: { ownerId: 'owner' },
    }),
  );
  const connection = {
    id: 'google-connection',
    oauthTokens: {
      accessToken: 'expired-access',
      refreshToken: 'google-refresh',
      expiresAt: new Date(Date.now() - 1).toISOString(),
    },
  };
  mockPrismaMethod(t, prisma.calendarConnection, 'findFirst', () => Promise.resolve(connection));
  const refreshed = mockPrismaMethod(t, prisma.calendarConnection, 'update', () => Promise.resolve(connection));
  mockPrismaMethod(t, prisma.user, 'findUnique', () => Promise.resolve({ timezone: 'Europe/Helsinki' }));
  mockPrismaMethod(t, prisma.calendarArtifact, 'create', ({ data }: { data: object }) =>
    Promise.resolve({ id: artifactId, ...data }),
  );
  const googleCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
  t.mock.method(globalThis, 'fetch', (url: string | URL | Request, init?: RequestInit) => {
    const address = url instanceof Request ? url.url : url.toString();
    googleCalls.push({ url: address, init });
    return Promise.resolve(
      Response.json(
        address.includes('/token')
          ? { access_token: 'refreshed-access', expires_in: 3600 }
          : { id: 'google-event', htmlLink: 'https://calendar.google.com/event' },
      ),
    );
  });
  for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) {
    const previous = process.env[name];
    process.env[name] = 'fake-google-credential';
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }

  const artifact = await createCalendarArtifact(matchId, userId, { ...artifactInput, provider: 'google' });
  assert.equal(refreshed.mock.callCount(), 1);
  assert.equal(artifact.type, 'google');
  assert.partialDeepStrictEqual(artifact.payload, {
    timezone: 'Europe/Helsinki',
    connectionId: connection.id,
    eventId: 'google-event',
    eventLink: 'https://calendar.google.com/event',
  });
  assert.equal(googleCalls.length, 2);
  assert.ok(googleCalls.every((call) => call.init?.signal instanceof AbortSignal));
  assert.equal(new Headers(googleCalls[1]?.init?.headers).get('Authorization'), 'Bearer refreshed-access');
  const eventRequest = googleCalls[1]?.init;
  assert.ok(eventRequest && typeof eventRequest.body === 'string');
  assert.partialDeepStrictEqual(JSON.parse(eventRequest.body), {
    start: { dateTime: artifactInput.startsAt, timeZone: 'Europe/Helsinki' },
    end: { dateTime: artifactInput.endsAt, timeZone: 'Europe/Helsinki' },
  });
});

void test('Google event requests honor their remaining deadline and reject expired deadlines before contacting Google', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', (_url: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal;
    assert.ok(signal);
    return new Promise<Response>((_resolve, reject) => {
      const onAbort = () => {
        const reason: unknown = signal.reason;
        reject(reason instanceof Error ? reason : new Error('Google Calendar request aborted'));
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    });
  });
  await assert.rejects(createGoogleCalendarEvent('fake-access', artifactInput, Date.now() - 1), httpStatus(400));
  assert.equal(fetchMock.mock.callCount(), 0);

  // AbortSignal.timeout uses an unref'ed timer; keep the test alive until it fires.
  const keepAlive = setTimeout(() => {}, 100);
  t.after(() => clearTimeout(keepAlive));
  await assert.rejects(
    createGoogleCalendarEvent('fake-access', artifactInput, Date.now() + 10),
    (error: unknown) => error instanceof Error && error.name === 'TimeoutError',
  );
  assert.equal(fetchMock.mock.callCount(), 1);
});

void test('unsupported calendar providers cannot create connection records or artifacts', (t) => {
  const writes = mockPrismaMethod(t, prisma.calendarConnection, 'create', () => {
    throw new Error('A placeholder connection must never be written');
  });
  for (const provider of ['outlook', 'apple', 'ics']) {
    assert.equal(createCalendarConnectionSchema.safeParse({ provider }).success, false);
    assert.throws(() => createCalendarConnection(userId, provider), httpStatus(400));
  }
  assert.throws(() => createCalendarConnection(userId, 'google'), httpStatus(400));
  for (const provider of ['outlook', 'apple']) {
    assert.equal(createCalendarArtifactSchema.safeParse({ ...artifactInput, provider }).success, false);
  }
  assert.equal(writes.mock.callCount(), 0);
  assert.equal(
    createCalendarArtifactSchema.safeParse({ ...artifactInput, endsAt: artifactInput.startsAt }).success,
    false,
  );
});

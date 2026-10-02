import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { command, connect, databaseUrl, disposablePostgres, runtimePrisma } from './helpers/postgres.mts';

void test('service regressions use an isolated PostgreSQL database', async (t) => {
  const workdir = await mkdtemp(path.join(tmpdir(), 'lotterylunch-services-'));
  const server = await disposablePostgres(workdir);
  const admin = await connect(server.url);
  const url = databaseUrl(server.url, 'services_regression');
  const db = runtimePrisma(url);
  let stopped = false;
  try {
    await admin.query('CREATE DATABASE services_regression');
    const config = path.join(workdir, 'prisma.config.mjs');
    await writeFile(
      config,
      `export default ${JSON.stringify({
        schema: path.resolve('prisma/schema.prisma'),
        migrations: { path: path.resolve('prisma/migrations') },
        datasource: { url },
      })};\n`,
    );
    await command(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', config]);
    // Inject the disposable client before loading any application service.
    const globalDb = globalThis as typeof globalThis & { prisma?: typeof db };
    globalDb.prisma = db;
    process.env.DATABASE_URL = url;
    const [groups, memberships, invites, availability, calendar, lottery, webhooks, readiness] = await Promise.all([
      import('../lib/server/services/groups'),
      import('../lib/server/services/memberships'),
      import('../lib/server/services/invites'),
      import('../lib/server/services/availability'),
      import('../lib/server/services/calendar'),
      import('../lib/server/services/lottery'),
      import('../lib/server/services/webhooks'),
      import('../app/api/v1/ready/route'),
    ]);
    const owner = await db.user.create({ data: { email: 'owner@example.test' } });
    const adminUser = await db.user.create({ data: { email: 'admin@example.test' } });
    const suspended = await db.user.create({ data: { email: 'suspended@example.test' } });
    const outsider = await db.user.create({ data: { email: 'outsider@example.test' } });
    const invitees = await Promise.all(
      [1, 2].map((number) => db.user.create({ data: { email: `invitee${number}@example.test` } })),
    );
    const group = await groups.createGroup(owner.id, { name: 'Regression lunches' });
    const adminMembership = await memberships.inviteToGroup(group.id, owner.id, {
      userId: adminUser.id,
      role: 'admin',
      status: 'active',
    });
    const suspendedMembership = await memberships.inviteToGroup(group.id, owner.id, { userId: suspended.id });
    await memberships.updateMembership(group.id, owner.id, suspendedMembership.id, { status: 'suspended' });
    const originalOwner = await db.membership.findUniqueOrThrow({
      where: { userId_groupId: { userId: owner.id, groupId: group.id } },
    });

    await t.test('generic membership writes cannot promote an admin or overwrite the original owner', async () => {
      // Untrusted callers can reach services outside Zod; exercise that boundary too.
      // oxlint-disable typescript/no-unsafe-type-assertion -- Deliberately exercise an invalid role at the service boundary.
      await assert.rejects(
        memberships.updateMembership(group.id, adminUser.id, adminMembership.id, { role: 'owner' as 'admin' }),
        { status: 403 },
      );
      // oxlint-enable typescript/no-unsafe-type-assertion
      await assert.rejects(memberships.inviteToGroup(group.id, adminUser.id, { userId: owner.id }), { status: 403 });
      await assert.rejects(
        memberships.updateMembership(group.id, adminUser.id, originalOwner.id, { status: 'suspended' }),
        { status: 403 },
      );
      await assert.rejects(memberships.removeMembership(group.id, owner.id, originalOwner.id), { status: 403 });
      assert.deepEqual(await db.membership.findUniqueOrThrow({ where: { id: originalOwner.id } }), originalOwner);
    });

    await t.test('suspension cannot be bypassed with join, invitation, acceptance, or self-removal', async () => {
      const invite = await invites.createGroupInvite(group.id, owner.id, 7, 3);
      await assert.rejects(memberships.joinGroup(group.id, suspended.id), { status: 403 });
      await assert.rejects(
        memberships.inviteToGroup(group.id, adminUser.id, { userId: suspended.id, status: 'active' }),
        { status: 403 },
      );
      await assert.rejects(invites.acceptInvite(invite.token, suspended.id), { status: 403 });
      await assert.rejects(memberships.removeMembership(group.id, suspended.id, suspendedMembership.id), {
        status: 403,
      });
      assert.equal((await db.groupInvite.findUniqueOrThrow({ where: { id: invite.id } })).uses, 0);
      await memberships.updateMembership(group.id, adminUser.id, suspendedMembership.id, { status: 'active' });
      assert.equal((await memberships.joinGroup(group.id, suspended.id)).status, 'active');
    });

    await t.test('concurrent single-use invite acceptance admits exactly one distinct user', async () => {
      const invite = await invites.createGroupInvite(group.id, owner.id, 7, 1);
      const accepted = await Promise.allSettled(invitees.map((user) => invites.acceptInvite(invite.token, user.id)));
      assert.equal(accepted.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(accepted.filter((result) => result.status === 'rejected').length, 1);
      assert.equal((await db.groupInvite.findUniqueOrThrow({ where: { id: invite.id } })).uses, 1);
      assert.equal(
        await db.membership.count({ where: { groupId: group.id, userId: { in: invitees.map((user) => user.id) } } }),
        1,
      );
    });

    await t.test('failed invite membership creation rolls back the claimed use', async () => {
      const invite = await invites.createGroupInvite(group.id, owner.id, 7, 1);
      await assert.rejects(invites.acceptInvite(invite.token, 'user-does-not-exist'));
      assert.equal((await db.groupInvite.findUniqueOrThrow({ where: { id: invite.id } })).uses, 0);
      assert.equal((await invites.acceptInvite(invite.token, outsider.id)).status, 'active');
    });

    const startAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const endAt = new Date(Date.parse(startAt) + 60 * 60 * 1000).toISOString();
    const slot = { startAt, endAt, type: 'lunch' as const };
    await t.test(
      'availability fully replaces grouped and ungrouped data, clears, and rejects unrelated groups',
      async () => {
        await availability.upsertAvailability(owner.id, [slot, { ...slot, groupId: group.id }]);
        await availability.upsertAvailability(owner.id, [slot]);
        const replaced = await availability.listAvailability(owner.id);
        assert.equal(replaced.length, 1);
        assert.equal(replaced[0]?.groupId, null);
        await availability.upsertAvailability(owner.id, []);
        assert.equal((await availability.listAvailability(owner.id)).length, 0);
        const separate = await groups.createGroup(owner.id, { name: 'Private group' });
        await assert.rejects(availability.upsertAvailability(adminUser.id, [{ ...slot, groupId: separate.id }]), {
          status: 403,
        });
        await groups.deleteGroupForUser(separate.id, owner.id);
      },
    );

    await t.test('failed replacement insertion preserves the previous availability rows', async () => {
      await availability.upsertAvailability(owner.id, [slot]);
      const previous = await availability.listAvailability(owner.id);
      await db.$executeRawUnsafe(
        `CREATE FUNCTION reject_test_availability() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test insert failure'; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER reject_test_availability BEFORE INSERT ON "AvailabilitySlot" FOR EACH ROW EXECUTE FUNCTION reject_test_availability()`,
      );
      try {
        await assert.rejects(availability.upsertAvailability(owner.id, [{ ...slot, groupId: group.id }]));
        assert.deepEqual(await availability.listAvailability(owner.id), previous);
      } finally {
        await db.$executeRawUnsafe('DROP TRIGGER reject_test_availability ON "AvailabilitySlot"');
        await db.$executeRawUnsafe('DROP FUNCTION reject_test_availability()');
      }
    });

    await t.test('concurrent availability replacements do not merge separate saves', async () => {
      const laterSlot = {
        ...slot,
        startAt: new Date(Date.parse(startAt) + 2 * 60 * 60 * 1000).toISOString(),
        endAt: new Date(Date.parse(endAt) + 2 * 60 * 60 * 1000).toISOString(),
      };
      await Promise.all([
        availability.upsertAvailability(owner.id, [slot, { ...slot, groupId: group.id }]),
        availability.upsertAvailability(owner.id, [laterSlot]),
      ]);
      const saved = await availability.listAvailability(owner.id);
      assert.ok(
        (saved.length === 2 && saved.every((row) => row.startAt.toISOString() === startAt)) ||
          (saved.length === 1 && saved[0]?.startAt.toISOString() === laterSlot.startAt),
        'the final state is one complete replacement',
      );
      await availability.upsertAvailability(owner.id, [slot]);
    });

    await t.test(
      'an organizer can persist a real lottery, participants can view results and obtain private calendar output',
      async () => {
        await availability.upsertAvailability(adminUser.id, [slot]);
        await lottery.setParticipation(group.id, owner.id, true);
        await lottery.setParticipation(group.id, adminUser.id, true);
        const input = { windowStart: startAt, windowEnd: endAt, durationMinutes: 60 };
        await assert.rejects(lottery.executeLottery(group.id, suspended.id, input), { status: 403 });
        const run = await lottery.executeLottery(group.id, owner.id, input);
        assert.equal(run.matches.length, 1);
        const match = run.matches[0];
        assert.ok(match);
        assert.deepEqual(new Set(z.array(z.string()).parse(match.memberIds)), new Set([owner.id, adminUser.id]));
        assert.equal((await lottery.listLunchRuns(group.id, adminUser.id))[0]?.id, run.id);
        const artifact = await calendar.createCalendarArtifact(match.id, adminUser.id, {
          title: 'Regression lunch',
          startsAt: startAt,
          endsAt: endAt,
          notes: 'Private notes',
        });
        assert.equal((await calendar.getCalendarArtifact(artifact.id, owner.id)).id, artifact.id);
        await assert.rejects(
          calendar.createCalendarArtifact(match.id, outsider.id, {
            title: 'Unauthorized',
            startsAt: startAt,
            endsAt: endAt,
          }),
          { status: 403 },
        );
        await assert.rejects(calendar.getCalendarArtifact(artifact.id, outsider.id), { status: 403 });
        await memberships.updateMembership(group.id, owner.id, adminMembership.id, { status: 'suspended' });
        await assert.rejects(calendar.getCalendarArtifact(artifact.id, adminUser.id), { status: 403 });
        await memberships.updateMembership(group.id, owner.id, adminMembership.id, { status: 'active' });
        const second = await lottery.executeLottery(group.id, owner.id, input);
        assert.equal(second.matches.length, 0, 'an existing booking prevents duplicate scheduling');
      },
    );

    await t.test(
      'concurrent Google OAuth callbacks keep one connection and consume each browser-bound state',
      async (st) => {
        const user = await db.user.create({ data: { email: 'calendar-concurrency@example.test' } });
        const fakeEnvironment = {
          BETTER_AUTH_URL: 'https://lotterylunch.test',
          GOOGLE_CLIENT_ID: 'fake-client-id',
          GOOGLE_CLIENT_SECRET: 'fake-client-secret',
        };
        for (const [key, value] of Object.entries(fakeEnvironment)) {
          const previous = process.env[key];
          process.env[key] = value;
          st.after(() => {
            if (previous === undefined) delete process.env[key];
            else process.env[key] = previous;
          });
        }
        const existing = await db.calendarConnection.create({
          data: { userId: owner.id, provider: 'google', status: 'connected', oauthTokens: { refreshToken: 'keep-me' } },
        });
        const nonces = ['b'.repeat(64), 'c'.repeat(64)];
        const starts = await Promise.all(nonces.map((nonce) => calendar.startGoogleCalendarConnection(user.id, nonce)));
        const states = starts.map(({ url: authorizationUrl }) => {
          const state = new URL(authorizationUrl).searchParams.get('state');
          assert.ok(state);
          return state;
        });
        const fetchMock = st.mock.method(globalThis, 'fetch', () =>
          Promise.resolve(Response.json({ access_token: 'fake-access', refresh_token: 'fake-refresh' })),
        );
        const blocker = await connect(url);
        let callbacks: Promise<Awaited<ReturnType<typeof calendar.completeGoogleCalendarConnection>>[]> | undefined;
        try {
          await blocker.query('BEGIN');
          await blocker.query('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', [user.id]);
          callbacks = Promise.all(
            states.map((state, index) =>
              calendar.completeGoogleCalendarConnection(
                new URLSearchParams({ state, code: 'fake-code' }),
                user.id,
                nonces[index] ?? '',
              ),
            ),
          );
          const deadline = Date.now() + 3_000;
          let waiting = 0;
          // oxlint-disable no-await-in-loop -- Wait until both callbacks contend on the real user row lock.
          while (waiting < 2 && Date.now() < deadline) {
            await blocker.query('SELECT pg_stat_clear_snapshot()');
            const observed = await blocker.query<{ waiting: string }>(`
            SELECT COUNT(*)::TEXT AS waiting FROM pg_stat_activity
            WHERE datname = current_database() AND pid <> pg_backend_pid()
              AND wait_event_type = 'Lock' AND query LIKE '%FROM "User"%'
          `);
            waiting = Number(observed.rows[0]?.waiting ?? 0);
            if (waiting < 2) await delay(10);
          }
          // oxlint-enable no-await-in-loop
          assert.equal(waiting, 2, 'both callbacks must serialize before looking up a connection');
          await blocker.query('COMMIT');
          assert.ok((await callbacks).every((result) => result.status === 'connected'));
          assert.equal(fetchMock.mock.callCount(), 2);
          const connections = await db.calendarConnection.findMany({ where: { userId: user.id, provider: 'google' } });
          assert.equal(connections.length, 1);
          assert.deepEqual(connections[0]?.oauthTokens, { accessToken: 'fake-access', refreshToken: 'fake-refresh' });
          assert.equal(
            await db.verification.count({
              where: { identifier: { in: states.map((state) => `calendar-google:${state}`) } },
            }),
            0,
          );
          assert.deepEqual(await db.calendarConnection.findUniqueOrThrow({ where: { id: existing.id } }), existing);
        } finally {
          await blocker.query('ROLLBACK');
          await blocker.end();
          await callbacks;
        }
      },
    );

    await t.test('calendar writes wait for concurrent suspension and recheck membership after it commits', async () => {
      const separate = await groups.createGroup(owner.id, { name: 'Calendar authorization race' });
      const member = await memberships.joinGroup(separate.id, outsider.id);
      const match = await db.match.create({
        data: { groupId: separate.id, memberIds: [owner.id, outsider.id], state: 'scheduled', status: 'confirmed' },
      });
      const blocker = await connect(url);
      let creation: Promise<{ status: 'fulfilled' } | { status: 'rejected'; reason: unknown }> | undefined;
      try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT "id" FROM "Group" WHERE "id" = $1 FOR UPDATE', [separate.id]);
        await blocker.query('UPDATE "Membership" SET "status" = \'suspended\' WHERE "id" = $1', [member.id]);
        let finished = false;
        creation = calendar
          .createCalendarArtifact(match.id, outsider.id, {
            title: 'Suspension race',
            startsAt: startAt,
            endsAt: endAt,
          })
          .then(
            () => ({ status: 'fulfilled' as const }),
            (reason: unknown) => ({ status: 'rejected' as const, reason }),
          )
          .finally(() => {
            finished = true;
          });
        const deadline = Date.now() + 3_000;
        let waiting = false;
        // oxlint-disable no-await-in-loop -- Observe the competing request's actual row-lock wait before committing suspension.
        // oxlint-disable no-unmodified-loop-condition -- The competing request changes finished asynchronously.
        while (!finished && !waiting && Date.now() < deadline) {
          await blocker.query('SELECT pg_stat_clear_snapshot()');
          const observed = await blocker.query<{ waiting: boolean }>(`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE datname = current_database() AND pid <> pg_backend_pid()
                AND wait_event_type = 'Lock' AND query LIKE '%FROM "Group"%'
            ) AS waiting
          `);
          waiting = observed.rows[0]?.waiting ?? false;
          if (!waiting && !finished) await delay(10);
        }
        // oxlint-enable no-unmodified-loop-condition
        // oxlint-enable no-await-in-loop
        assert.equal(waiting, true, 'calendar creation must serialize with membership changes');
        await blocker.query('COMMIT');
        const result = await creation;
        assert.equal(result.status, 'rejected');
        if (result.status === 'rejected') {
          assert.ok(result.reason && typeof result.reason === 'object' && 'status' in result.reason);
          assert.equal(result.reason.status, 403);
        }
        assert.equal(await db.calendarArtifact.count({ where: { matchId: match.id } }), 0);
      } finally {
        await blocker.query('ROLLBACK');
        await blocker.end();
        await creation;
        await groups.deleteGroupForUser(separate.id, owner.id);
      }
    });

    await t.test('draws use the timezone committed while waiting for participant locks', async () => {
      const zonedUser = await db.user.create({ data: { email: 'timezone-lock@example.test', timezone: 'UTC' } });
      const partner = await db.user.create({ data: { email: 'timezone-partner@example.test', timezone: 'UTC' } });
      const separate = await groups.createGroup(zonedUser.id, { name: 'Timezone lock regression' });
      await memberships.joinGroup(separate.id, partner.id);
      await lottery.setParticipation(separate.id, zonedUser.id, true);
      await lottery.setParticipation(separate.id, partner.id, true);
      const winter = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 15, 13));
      const winterEnd = new Date(winter.getTime() + 60 * 60 * 1000);
      const weekday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][winter.getUTCDay()];
      await availability.upsertAvailability(zonedUser.id, [
        {
          startAt: '2026-07-01T12:00:00.000Z',
          endAt: '2026-07-01T13:00:00.000Z',
          recurringRule: `FREQ=WEEKLY;BYDAY=${weekday}`,
          type: 'lunch',
        },
      ]);
      await availability.upsertAvailability(partner.id, [
        { startAt: winter.toISOString(), endAt: winterEnd.toISOString(), type: 'lunch' },
      ]);
      const blocker = await connect(url);
      let draw: ReturnType<typeof lottery.executeLottery> | undefined;
      try {
        await blocker.query('BEGIN');
        await blocker.query('UPDATE "User" SET "timezone" = $1 WHERE "id" = $2', ['Europe/Helsinki', zonedUser.id]);
        draw = lottery.executeLottery(separate.id, zonedUser.id, {
          windowStart: winter.toISOString(),
          windowEnd: winterEnd.toISOString(),
          durationMinutes: 60,
        });
        const deadline = Date.now() + 3_000;
        let waiting = false;
        // oxlint-disable no-await-in-loop -- Commit the profile only after observing the draw waiting on the participant lock.
        while (!waiting && Date.now() < deadline) {
          await blocker.query('SELECT pg_stat_clear_snapshot()');
          const observed = await blocker.query<{ waiting: boolean }>(`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE datname = current_database() AND pid <> pg_backend_pid()
                AND wait_event_type = 'Lock' AND query LIKE '%FROM "User"%'
            ) AS waiting
          `);
          waiting = observed.rows[0]?.waiting ?? false;
          if (!waiting) await delay(10);
        }
        // oxlint-enable no-await-in-loop
        assert.equal(waiting, true, 'the draw must wait for a concurrent profile update');
        await blocker.query('COMMIT');
        const run = await draw;
        assert.equal(run.matches.length, 1, 'the fresh Helsinki timezone shifts the winter recurrence to 13:00 UTC');
        assert.equal(run.matches[0]?.scheduledFor?.toISOString(), winter.toISOString());
      } finally {
        await blocker.query('ROLLBACK');
        await blocker.end();
        await draw;
        await groups.deleteGroupForUser(separate.id, zonedUser.id);
      }
    });

    await t.test('concurrent draws across groups cannot book shared participants twice', async () => {
      const other = await groups.createGroup(owner.id, { name: 'Concurrent group' });
      await memberships.joinGroup(other.id, adminUser.id);
      await lottery.setParticipation(other.id, owner.id, true);
      await lottery.setParticipation(other.id, adminUser.id, true);
      const laterSlot = {
        ...slot,
        startAt: new Date(Date.parse(startAt) + 24 * 60 * 60 * 1000).toISOString(),
        endAt: new Date(Date.parse(endAt) + 24 * 60 * 60 * 1000).toISOString(),
      };
      await availability.upsertAvailability(owner.id, [laterSlot]);
      await availability.upsertAvailability(adminUser.id, [laterSlot]);
      const input = { windowStart: laterSlot.startAt, windowEnd: laterSlot.endAt, durationMinutes: 60 };
      const runs = await Promise.all([
        lottery.executeLottery(group.id, owner.id, input),
        lottery.executeLottery(other.id, owner.id, input),
      ]);
      assert.equal(runs.flatMap((run) => run.matches).length, 1);
      await groups.deleteGroupForUser(other.id, owner.id);
    });

    await t.test('ownership transfers are explicit and update both canonical owner and roles', async () => {
      await assert.rejects(memberships.transferGroupOwnership(group.id, adminUser.id, owner.id), { status: 403 });
      await memberships.transferGroupOwnership(group.id, owner.id, adminUser.id);
      assert.equal((await db.group.findUniqueOrThrow({ where: { id: group.id } })).ownerId, adminUser.id);
      assert.equal((await db.membership.findUniqueOrThrow({ where: { id: adminMembership.id } })).role, 'owner');
      assert.equal((await db.membership.findUniqueOrThrow({ where: { id: originalOwner.id } })).role, 'admin');
      await assert.rejects(memberships.transferGroupOwnership(group.id, owner.id, outsider.id), { status: 403 });
    });

    await t.test(
      'webhook activation is unavailable and endpoint deletion removes historical delivery rows',
      async () => {
        await assert.rejects(webhooks.createWebhook(owner.id, 'https://example.test/webhook', ['match.created']), {
          status: 501,
        });
        const endpoint = await db.webhookEndpoint.create({
          data: {
            userId: owner.id,
            url: 'https://example.test/webhook',
            events: ['match.created'],
            secret: 'test-secret',
            deliveries: { create: { event: 'match.created', payload: {}, status: 'pending' } },
          },
        });
        await webhooks.deleteWebhook(owner.id, endpoint.id);
        assert.equal(await db.webhookDelivery.count({ where: { webhookId: endpoint.id } }), 0);
      },
    );

    await t.test(
      'group deletion cleans dependent rows transactionally and preserves other groups and personal availability',
      async () => {
        const other = await groups.createGroup(owner.id, { name: 'Keep me' });
        await availability.upsertAvailability(owner.id, [slot, { ...slot, groupId: group.id }]);
        await groups.deleteGroupForUser(group.id, adminUser.id);
        assert.equal(await db.group.findUnique({ where: { id: group.id } }), null);
        for (const count of await Promise.all([
          db.membership.count({ where: { groupId: group.id } }),
          db.groupInvite.count({ where: { groupId: group.id } }),
          db.lunchRun.count({ where: { groupId: group.id } }),
          db.match.count({ where: { groupId: group.id } }),
          db.calendarArtifact.count(),
          db.lunchEvent.count(),
          db.availabilitySlot.count({ where: { groupId: group.id } }),
        ]))
          assert.equal(count, 0);
        assert.ok(await db.group.findUnique({ where: { id: other.id } }));
        assert.equal(await db.availabilitySlot.count({ where: { userId: owner.id, groupId: null } }), 1);
      },
    );

    await t.test('readiness reflects a database outage', async () => {
      assert.equal((await readiness.GET()).status, 200);
      await db.$disconnect();
      await admin.end();
      await server.stop();
      stopped = true;
      const response = await readiness.GET();
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.deepEqual(await response.json(), { status: 'unavailable', service: 'lotterylunch-api' });
    });
  } finally {
    await db.$disconnect();
    await admin.end().catch(() => {});
    if (!stopped) await server.stop();
    await rm(workdir, { recursive: true, force: true });
  }
});

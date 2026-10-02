import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  type Account,
  type Authenticator,
  type AvailabilitySlot,
  type CalendarConnection,
  type Group,
  type LunchEvent,
  type Match,
  type Membership,
  type Session,
  type User,
  type Verification,
  type VerificationToken,
} from '../generated/prisma/client';
import { command, connect, databaseUrl, disposablePostgres, runtimePrisma } from './helpers/postgres.mts';

type AccountRow = Omit<Account, 'legacyType' | 'legacyTokenType' | 'legacySessionState'> & {
  type: Account['legacyType'];
  token_type: Account['legacyTokenType'];
  session_state: Account['legacySessionState'];
};

const root = fileURLToPath(new URL('..', import.meta.url));
const prismaCli = path.join(root, 'node_modules/prisma/build/index.js');
const migrationRoot = path.join(root, 'prisma/migrations');
const legacyLastMigration = '20260206194000_add_week_start_and_clock_format';
const reconciliationMigration = '20261001000000_reconcile_better_auth_and_api_schema';
const restorationMigration = '20261001010000_restore_missing_auth_columns';
const ownerRepairMigration = '20261002000000_repair_group_owners';
const migrationCount = (await readdir(migrationRoot)).filter((name) => /^\d{14}_/.test(name)).length;

// Prisma's DateTime columns represent UTC without a PostgreSQL time zone.
// Parse them consistently even when the test runner uses a different time zone.
pg.types.setTypeParser(1114, (value) => new Date(`${value.replace(' ', 'T')}Z`));

async function prismaConfig(filename: string, schema: string, migrations: string) {
  await writeFile(
    filename,
    `export default { ...${JSON.stringify({ schema, migrations: { path: migrations } })}, datasource: { url: process.env.DATABASE_URL, shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } };\n`,
  );
  return filename;
}

async function prisma(url: string, args: string[], config: string) {
  return await command(process.execPath, [prismaCli, ...args, '--config', config], {
    env: {
      ...process.env,
      DATABASE_URL: url,
      DIRECT_URL: url,
      SHADOW_DATABASE_URL: databaseUrl(url, 'migration_shadow'),
      CHECKPOINT_DISABLE: '1',
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
    },
  });
}

async function assertSchemaMatches(url: string, config: string) {
  await prisma(
    url,
    [
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      path.join(root, 'prisma/schema.prisma'),
      '--exit-code',
    ],
    config,
  );
}

async function schemaSnapshot(client: pg.Client) {
  return (
    await client.query<{ kind: string; definition: string }>(`
      SELECT 'column' AS kind,
             jsonb_build_array(table_name, column_name, data_type, udt_name, is_nullable, column_default)::text AS definition
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      UNION ALL
      SELECT 'index', jsonb_build_array(tablename, indexname, indexdef)::text
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      UNION ALL
      SELECT 'constraint', jsonb_build_array(conrelid::regclass::text, conname, pg_get_constraintdef(oid))::text
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace AND conrelid <> 0
        AND conrelid <> '"_prisma_migrations"'::regclass
      UNION ALL
      SELECT 'enum', jsonb_build_array(t.typname, e.enumlabel, e.enumsortorder)::text
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typnamespace = 'public'::regnamespace
      ORDER BY kind, definition
    `)
  ).rows;
}

async function authDataSnapshot(client: pg.Client, includeRepairColumns = false) {
  const userRow = includeRepairColumns ? 'to_jsonb(t)' : "to_jsonb(t) - 'emailVerifiedAt'";
  const accountRow = includeRepairColumns
    ? 'to_jsonb(t)'
    : "to_jsonb(t) - ARRAY['type', 'token_type', 'session_state']";
  return (
    await client.query<{ table_name: string; record: string }>(`
      SELECT 'User' AS table_name, (${userRow})::text AS record FROM "User" t
      UNION ALL
      SELECT 'Account', (${accountRow})::text FROM "Account" t
      UNION ALL
      SELECT 'Session', to_jsonb(t)::text FROM "Session" t
      UNION ALL
      SELECT 'verification', to_jsonb(t)::text FROM "verification" t
      UNION ALL
      SELECT 'VerificationToken', to_jsonb(t)::text FROM "VerificationToken" t
      ORDER BY table_name, record
    `)
  ).rows;
}

async function preexistingBetterAuthSchema(client: pg.Client) {
  // Reproduce the old startup's db-pushed schema without depending on Git history.
  await client.query(`
    ALTER TABLE "User" DROP COLUMN "emailVerifiedAt";
    ALTER TABLE "Account" DROP COLUMN "type", DROP COLUMN "token_type", DROP COLUMN "session_state";
    DROP INDEX "Account_userId_idx";
    DROP INDEX "Session_userId_idx";
    DROP INDEX "verification_identifier_idx";
    INSERT INTO "User" ("id", "email", "emailVerified", "updatedAt") VALUES
      ('preexisting-verified', 'verified@example.test', true, '2025-05-20 10:00:00'),
      ('preexisting-unverified', 'unverified@example.test', false, '2025-05-21 10:00:00');
    INSERT INTO "Account" (
      "id", "userId", "providerId", "accountId", "accessToken", "refreshToken", "idToken",
      "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope", "updatedAt"
    ) VALUES
      ('existing-account-verified', 'preexisting-verified', 'google', 'google-verified',
       'existing-access-verified', 'existing-refresh-verified', 'existing-id-verified',
       '2035-05-20 09:00:00', '2035-06-20 09:00:00', 'openid email profile', '2025-05-20 10:00:00'),
      ('existing-account-unverified', 'preexisting-unverified', 'google', 'google-unverified',
       'existing-access-unverified', 'existing-refresh-unverified', 'existing-id-unverified',
       '2035-05-21 09:00:00', NULL, 'openid email', '2025-05-21 10:00:00');
    INSERT INTO "Session" ("id", "token", "userId", "expiresAt", "ipAddress", "userAgent", "updatedAt") VALUES
      ('existing-session-verified', 'existing-token-verified', 'preexisting-verified',
       '2035-05-20 09:00:00', '127.0.0.1', 'verified-test-agent', '2025-05-20 10:00:00'),
      ('existing-session-unverified', 'existing-token-unverified', 'preexisting-unverified',
       '2035-05-21 09:00:00', NULL, 'unverified-test-agent', '2025-05-21 10:00:00');
    INSERT INTO "verification" ("id", "identifier", "value", "expiresAt", "updatedAt") VALUES
      ('existing-verification', 'verified@example.test', 'existing-verification-value',
       '2035-05-20 09:00:00', '2025-05-20 10:00:00');
  `);
}

void test('migration history builds the current schema and preserves legacy records', async (t) => {
  const workdir = await mkdtemp(path.join(tmpdir(), 'lotterylunch-migrations-'));
  let server: Awaited<ReturnType<typeof disposablePostgres>> | undefined;
  let admin: pg.Client | undefined;
  try {
    server = await disposablePostgres(workdir);
    const serverUrl = server.url;
    admin = await connect(server.url);
    await admin.query('CREATE DATABASE migration_fresh');
    await admin.query('CREATE DATABASE migration_legacy');
    await admin.query('CREATE DATABASE migration_preexisting');
    await admin.query('CREATE DATABASE migration_recorded');
    await admin.query('CREATE DATABASE migration_shadow');
    await admin.query('CREATE DATABASE migration_initial');
    await admin.query('CREATE DATABASE migration_initial_failed');
    const freshUrl = databaseUrl(server.url, 'migration_fresh');
    const legacyUrl = databaseUrl(server.url, 'migration_legacy');
    const preexistingUrl = databaseUrl(server.url, 'migration_preexisting');
    const recordedUrl = databaseUrl(server.url, 'migration_recorded');
    const currentConfig = await prismaConfig(
      path.join(workdir, 'current.config.mjs'),
      path.join(root, 'prisma/schema.prisma'),
      migrationRoot,
    );

    await t.test('all migrations deploy from an empty database without schema drift', async () => {
      await prisma(freshUrl, ['migrate', 'deploy'], currentConfig);
      await assertSchemaMatches(freshUrl, currentConfig);
      await prisma(freshUrl, ['migrate', 'deploy'], currentConfig);
      const runtimeClient = runtimePrisma(freshUrl);
      try {
        const user = await runtimeClient.user.create({
          data: {
            email: 'fresh@example.test',
            accounts: {
              create: {
                providerId: 'credential',
                accountId: 'fresh-account',
              },
            },
            sessions: {
              create: {
                token: 'fresh-session',
                expiresAt: new Date('2035-05-20T09:00:00Z'),
              },
            },
          },
          include: { accounts: true, sessions: true },
        });
        const account = user.accounts[0];
        const session = user.sessions[0];
        assert.ok(account && session);
        assert.ok(user.id && account.id && session.id);
        assert.equal(user.emailVerified, false);
        assert.equal(user.weekStartDay, 'monday');
        assert.equal(account.userId, user.id);
        assert.equal(account.legacyType, null);
        assert.equal(session.userId, user.id);
        assert.ok(user.updatedAt instanceof Date);
        assert.equal(
          (
            await runtimeClient.session.findUniqueOrThrow({
              where: { token: 'fresh-session' },
              include: { user: true },
            })
          ).user.email,
          'fresh@example.test',
        );
      } finally {
        await runtimeClient.$disconnect();
      }
    });

    await t.test(
      'populated initial schemas preserve photos and timestamps through explicit recovery',
      async (initialTest) => {
        const initialMigration = '20250514224159_init';
        const nextauthMigration = '20250519153939_nextauth';
        const recovery = await readFile(path.join(root, 'prisma/recovery/upgrade-initial-nextauth.sql'), 'utf8');
        // Each database exercises a different migration history and must advance sequentially.
        // oxlint-disable no-await-in-loop -- Recovery operations depend on each database's preceding schema state.
        for (const failed of [false, true]) {
          await initialTest.test(
            failed
              ? 'recovers a previously failed NextAuth migration'
              : 'upgrades before historical migration is attempted',
            async () => {
              const initialUrl = databaseUrl(serverUrl, failed ? 'migration_initial_failed' : 'migration_initial');
              const initialRoot = path.join(workdir, failed ? 'initial-failed' : 'initial-clean');
              await cp(path.join(migrationRoot, 'migration_lock.toml'), path.join(initialRoot, 'migration_lock.toml'), {
                recursive: true,
              });
              await cp(path.join(migrationRoot, initialMigration), path.join(initialRoot, initialMigration), {
                recursive: true,
              });
              const config = await prismaConfig(
                path.join(workdir, `${failed ? 'failed' : 'clean'}.config.mjs`),
                path.join(root, 'prisma/schema.prisma'),
                initialRoot,
              );
              await prisma(initialUrl, ['migrate', 'deploy'], config);
              const client = await connect(initialUrl);
              const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
              try {
                await client.query(
                  'INSERT INTO "User" ("id", "email", "authProvider", "photoUrl", "createdAt") VALUES ($1,$2,$3,$4,$5)',
                  [id, 'initial@example.test', 'google', 'https://example.test/photo.jpg', '2025-05-15T09:00:00Z'],
                );
                if (failed) {
                  await cp(path.join(migrationRoot, nextauthMigration), path.join(initialRoot, nextauthMigration), {
                    recursive: true,
                  });
                  await assert.rejects(prisma(initialUrl, ['migrate', 'deploy'], config), /updatedAt|23502/);
                  await assert.rejects(prisma(initialUrl, ['migrate', 'deploy'], config), /P3009/);
                }
                await client.query(recovery);
                const recovered = (
                  await client.query<{ image: string; updatedAt: Date }>(
                    'SELECT "image", "updatedAt" FROM "User" WHERE id = $1',
                    [id],
                  )
                ).rows[0];
                assert.equal(recovered?.image, 'https://example.test/photo.jpg');
                assert.equal(recovered?.updatedAt.toISOString(), '2025-05-15T09:00:00.000Z');
                await prisma(initialUrl, ['migrate', 'resolve', '--applied', nextauthMigration], currentConfig);
                await prisma(initialUrl, ['migrate', 'deploy'], currentConfig);
                await assertSchemaMatches(initialUrl, currentConfig);
                const runtime = runtimePrisma(initialUrl);
                try {
                  const user = await runtime.user.findUniqueOrThrow({ where: { id } });
                  assert.equal(user.image, 'https://example.test/photo.jpg');
                  assert.equal(user.updatedAt.toISOString(), '2025-05-15T09:00:00.000Z');
                } finally {
                  await runtime.$disconnect();
                }
                await assert.rejects(client.query(recovery), /successfully applied later migrations/);
                await client.query('ROLLBACK');
                assert.equal(
                  (await client.query<{ count: number }>('SELECT count(*)::int AS count FROM "User"')).rows[0]?.count,
                  1,
                );
              } finally {
                await client.end();
              }
            },
          );
        }
        // oxlint-enable no-await-in-loop
      },
    );

    await t.test('owner repair restores overwritten or missing owners and removes stray ownership roles', async () => {
      const db = runtimePrisma(freshUrl);
      const client = await connect(freshUrl);
      try {
        const owner = await db.user.findUniqueOrThrow({ where: { email: 'fresh@example.test' } });
        const administrator = await db.user.create({ data: { email: 'rogue-owner@example.test' } });
        const damaged = await db.group.create({ data: { ownerId: owner.id, name: 'Damaged owner' } });
        const missing = await db.group.create({ data: { ownerId: owner.id, name: 'Missing owner membership' } });
        const overwritten = await db.membership.create({
          data: { userId: owner.id, groupId: damaged.id, role: 'member', groupRole: 'member', status: 'pending' },
        });
        const rogue = await db.membership.create({
          data: { userId: administrator.id, groupId: damaged.id, role: 'owner', groupRole: 'owner', status: 'active' },
        });
        const suspendedGroup = await db.group.create({ data: { ownerId: owner.id, name: 'Suspension remains' } });
        const suspended = await db.membership.create({
          data: { userId: administrator.id, groupId: suspendedGroup.id, status: 'suspended' },
        });
        await client.query('DELETE FROM "_prisma_migrations" WHERE migration_name = $1', [ownerRepairMigration]);
        await prisma(freshUrl, ['migrate', 'deploy'], currentConfig);
        const restored = await db.membership.findUniqueOrThrow({ where: { id: overwritten.id } });
        assert.equal(restored.role, 'owner');
        assert.equal(restored.groupRole, 'owner');
        assert.equal(restored.status, 'active');
        assert.equal(restored.joinedAt.getTime(), overwritten.joinedAt.getTime());
        assert.equal((await db.membership.findUniqueOrThrow({ where: { id: rogue.id } })).role, 'member');
        assert.equal(
          (
            await db.membership.findUniqueOrThrow({
              where: { userId_groupId: { userId: owner.id, groupId: missing.id } },
            })
          ).role,
          'owner',
        );
        assert.deepEqual(await db.membership.findUniqueOrThrow({ where: { id: suspended.id } }), suspended);
        // Repeated repair leaves valid memberships and timestamps unchanged.
        await client.query(await readFile(path.join(migrationRoot, ownerRepairMigration, 'migration.sql'), 'utf8'));
        assert.deepEqual(await db.membership.findUniqueOrThrow({ where: { id: overwritten.id } }), restored);
        await assertSchemaMatches(freshUrl, currentConfig);
      } finally {
        await db.$disconnect();
        await client.end();
      }
    });

    await t.test('the upgrade retains legacy identities, authentication, and relationships', async () => {
      const legacyPrisma = path.join(workdir, 'legacy-prisma');
      await cp(path.join(root, 'prisma/schema.prisma'), path.join(legacyPrisma, 'schema.prisma'), { recursive: true });
      await cp(
        path.join(migrationRoot, 'migration_lock.toml'),
        path.join(legacyPrisma, 'migrations/migration_lock.toml'),
        { recursive: true },
      );
      const migrationNames = (await readdir(migrationRoot))
        .filter((name) => name <= legacyLastMigration && /^\d{14}_/.test(name))
        .toSorted();
      assert.ok(migrationNames.includes(legacyLastMigration), 'historical migration boundary must exist');
      await Promise.all(
        migrationNames.map((name) =>
          cp(path.join(migrationRoot, name), path.join(legacyPrisma, 'migrations', name), { recursive: true }),
        ),
      );
      const legacyConfig = await prismaConfig(
        path.join(workdir, 'legacy.config.mjs'),
        path.join(legacyPrisma, 'schema.prisma'),
        path.join(legacyPrisma, 'migrations'),
      );
      await prisma(legacyUrl, ['migrate', 'deploy'], legacyConfig);
      const client = await connect(legacyUrl);
      try {
        await client.query(await readFile(path.join(root, 'tests/fixtures/migrations/legacy.sql'), 'utf8'));
        await prisma(legacyUrl, ['migrate', 'deploy'], currentConfig);
        await assertSchemaMatches(legacyUrl, currentConfig);
        const ownerId = '11111111-1111-4111-8111-111111111111';
        const memberId = '22222222-2222-4222-8222-222222222222';
        const groupId = '33333333-3333-4333-8333-333333333333';
        const users = (await client.query<User>('SELECT * FROM "User" ORDER BY "email"')).rows;
        assert.equal(users.length, 2);
        assert.ok(users[0] && users[1]);
        assert.ok(users[1].emailVerifiedAt);
        assert.equal(users[0].id, memberId);
        assert.equal(users[0].emailVerified, false);
        assert.equal(users[1].id, ownerId);
        assert.equal(users[1].emailVerified, true);
        assert.equal(users[1].emailVerifiedAt.toISOString(), '2025-05-20T10:00:00.000Z');
        assert.equal(users[1].image, 'https://example.test/owner.png');
        assert.equal(users[1].timezone, 'Europe/Helsinki');
        assert.equal(users[1].shortNoticePreference, 'flexible');
        assert.equal(users[1].weekStartDay, 'sunday');
        assert.equal(users[1].clockFormat, 'ampm');
        assert.equal(users[1].createdAt.toISOString(), '2025-05-20T09:00:00.000Z');
        assert.equal(users[1].updatedAt.toISOString(), '2025-05-20T10:00:00.000Z');

        const accounts = (await client.query<AccountRow>('SELECT * FROM "Account" ORDER BY "providerId"')).rows;
        assert.equal(accounts.length, 2);
        assert.ok(accounts[0] && accounts[1]);
        assert.ok(accounts[1].accessTokenExpiresAt);
        assert.equal(new Set(accounts.map((account) => account.id)).size, 2);
        assert.ok(accounts.every((account) => account.id));
        assert.equal(accounts[0].accountId, 'github-member');
        assert.equal(accounts[0].userId, memberId);
        assert.equal(accounts[0].accessTokenExpiresAt, null);
        assert.equal(accounts[1].accountId, 'google-owner');
        assert.equal(accounts[1].userId, ownerId);
        assert.equal(accounts[1].accessToken, 'google-access');
        assert.equal(accounts[1].refreshToken, 'google-refresh');
        assert.equal(accounts[1].idToken, 'google-id');
        assert.equal(accounts[1].scope, 'openid profile email');
        assert.equal(accounts[1].type, 'oauth');
        assert.equal(accounts[1].token_type, 'Bearer');
        assert.equal(accounts[1].session_state, 'legacy-session-state');
        assert.equal(accounts[1].accessTokenExpiresAt.toISOString(), new Date(2_000_000_000_000).toISOString());

        const sessions = (await client.query<Session>('SELECT * FROM "Session" ORDER BY "token"')).rows;
        assert.equal(sessions.length, 2);
        assert.ok(sessions[0] && sessions[1]);
        assert.equal(new Set(sessions.map((session) => session.id)).size, 2);
        assert.ok(sessions.every((session) => session.id));
        assert.equal(sessions[0].token, 'legacy-member-session');
        assert.equal(sessions[0].userId, memberId);
        assert.equal(sessions[0].expiresAt.toISOString(), '2035-05-21T09:00:00.000Z');
        assert.equal(sessions[1].token, 'legacy-owner-session');
        assert.equal(sessions[1].userId, ownerId);

        const group = (await client.query<Group>('SELECT * FROM "Group"')).rows[0];
        assert.ok(group);
        assert.equal(group.id, groupId);
        assert.equal(group.ownerId, ownerId);
        assert.equal(group.name, 'Legacy Lunch');
        assert.equal(group.location, 'Helsinki');
        assert.equal(group.visibility, 'invite_only');
        assert.equal(group.groupVisibility, 'invite_only');
        const memberships = (await client.query<Membership>('SELECT * FROM "Membership" ORDER BY "joinedAt"')).rows;
        assert.deepEqual(
          memberships.map(({ userId, groupId: membershipGroup, role, groupRole, status }) => ({
            userId,
            groupId: membershipGroup,
            role,
            groupRole,
            status,
          })),
          [
            {
              userId: ownerId,
              groupId,
              role: 'owner',
              groupRole: 'owner',
              status: 'active',
            },
            {
              userId: memberId,
              groupId,
              role: 'admin',
              groupRole: 'admin',
              status: 'suspended',
            },
          ],
        );
        assert.ok(memberships[0]);
        assert.equal(memberships[0].createdAt.toISOString(), '2025-05-22T12:01:00.000Z');

        const connection = (await client.query<CalendarConnection>('SELECT * FROM "CalendarConnection"')).rows[0];
        assert.ok(connection);
        assert.equal(connection.userId, ownerId);
        assert.deepEqual(connection.oauthTokens, {
          accessToken: 'calendar-access',
        });
        const slot = (await client.query<AvailabilitySlot>('SELECT * FROM "AvailabilitySlot"')).rows[0];
        assert.ok(slot);
        assert.equal(slot.userId, memberId);
        assert.equal(slot.groupId, groupId);
        const matches = (
          await client.query<Pick<Match, 'state' | 'status'>>(
            'SELECT "state", "status" FROM "Match" ORDER BY "scheduledFor"',
          )
        ).rows;
        assert.deepEqual(matches, [
          { state: 'scheduled', status: 'confirmed' },
          { state: 'cancelled', status: 'canceled' },
        ]);
        assert.equal(
          (await client.query<Pick<LunchEvent, 'venue'>>('SELECT "venue" FROM "LunchEvent"')).rows[0]?.venue,
          'Legacy Cafe',
        );
        assert.equal(
          (await client.query<Pick<VerificationToken, 'token'>>('SELECT "token" FROM "VerificationToken"')).rows[0]
            ?.token,
          'legacy-verification-token',
        );
        const verification = (await client.query<Verification>('SELECT * FROM "verification"')).rows[0];
        assert.ok(verification);
        assert.equal(verification.identifier, 'owner@example.test');
        assert.equal(verification.value, 'legacy-verification-token');
        assert.equal(verification.expiresAt.toISOString(), '2035-05-20T09:00:00.000Z');
        const authenticator = (await client.query<Authenticator>('SELECT * FROM "Authenticator"')).rows[0];
        assert.ok(authenticator);
        assert.equal(authenticator.userId, ownerId);
        assert.equal(authenticator.counter, 7);

        const runtimeClient = runtimePrisma(legacyUrl);
        try {
          const owner = await runtimeClient.user.findUniqueOrThrow({
            where: { id: ownerId },
            include: {
              accounts: true,
              sessions: true,
              memberships: { include: { group: true } },
              calendarConnections: true,
            },
          });
          assert.ok(owner.accounts[0] && owner.sessions[0] && owner.memberships[0] && owner.calendarConnections[0]);
          assert.equal(owner.emailVerified, true);
          assert.equal(owner.accounts[0].legacyType, 'oauth');
          assert.equal(owner.accounts[0].accessToken, 'google-access');
          assert.equal(owner.sessions[0].token, 'legacy-owner-session');
          assert.equal(owner.memberships[0].group.groupVisibility, 'invite_only');
          assert.deepEqual(owner.calendarConnections[0].oauthTokens, {
            accessToken: 'calendar-access',
          });
          assert.equal((await runtimeClient.verification.findFirstOrThrow()).value, 'legacy-verification-token');
        } finally {
          await runtimeClient.$disconnect();
        }

        await assert.rejects(
          client.query('INSERT INTO "Membership" ("id", "userId", "groupId", "updatedAt") VALUES ($1, $2, $3, NOW())', [
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'missing-user',
            groupId,
          ]),
          { code: '23503' },
        );
        await assert.rejects(
          client.query(
            'INSERT INTO "Account" ("id", "accountId", "providerId", "userId", "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
            ['duplicate-account', 'google-owner', 'google', ownerId],
          ),
          { code: '23505' },
        );
        await client.query('INSERT INTO "User" ("id", "email", "updatedAt") VALUES ($1, $2, NOW())', [
          'modern-user',
          'modern@example.test',
        ]);
        await client.query(
          'INSERT INTO "Account" ("id", "accountId", "providerId", "userId", "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
          ['modern-account', 'modern-user', 'credential', 'modern-user'],
        );
        await client.query(
          'INSERT INTO "Session" ("id", "token", "userId", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
          ['modern-session', 'modern-session-token', 'modern-user', '2035-05-20 09:00:00'],
        );
        await client.query('DELETE FROM "User" WHERE "id" = $1', ['modern-user']);
        assert.equal(
          (
            await client.query<{ count: number }>('SELECT count(*)::int AS count FROM "Account" WHERE "userId" = $1', [
              'modern-user',
            ])
          ).rows[0]?.count,
          0,
        );
        assert.equal(
          (
            await client.query<{ count: number }>('SELECT count(*)::int AS count FROM "Session" WHERE "userId" = $1', [
              'modern-user',
            ])
          ).rows[0]?.count,
          0,
        );
        await prisma(legacyUrl, ['migrate', 'deploy'], currentConfig);
      } finally {
        await client.end();
      }
    });

    await t.test(
      'recovery preserves a preexisting Better Auth schema and resolves only the failed reconciliation',
      async () => {
        await prisma(preexistingUrl, ['migrate', 'deploy'], currentConfig);
        const client = await connect(preexistingUrl);
        try {
          await preexistingBetterAuthSchema(client);
          // Historical migrations were already baselined; reconciliation and the new repair are pending.
          await client.query('DELETE FROM "_prisma_migrations" WHERE migration_name = ANY($1::text[])', [
            [reconciliationMigration, restorationMigration],
          ]);
          const previousHistory = (
            await client.query<{ record: string }>(
              'SELECT to_jsonb(m)::text AS record FROM "_prisma_migrations" m ORDER BY migration_name',
            )
          ).rows;
          assert.equal(previousHistory.length, migrationCount - 2);
          const originalSchema = await schemaSnapshot(client);
          const originalData = await authDataSnapshot(client);
          assert.equal(originalData.length, 7);

          await assert.rejects(
            prisma(preexistingUrl, ['migrate', 'deploy'], currentConfig),
            new RegExp(`Applying migration .${reconciliationMigration}`),
          );
          const failed = (
            await client.query<{ logs: string | null; finished_at: Date | null; rolled_back_at: Date | null }>(
              'SELECT logs, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1',
              [reconciliationMigration],
            )
          ).rows[0];
          assert.ok(failed);
          assert.ok(failed.logs === null || /GroupVisibility|current transaction is aborted/.test(failed.logs));
          assert.equal(failed.finished_at, null);
          assert.equal(failed.rolled_back_at, null);
          assert.deepEqual(await schemaSnapshot(client), originalSchema);
          assert.deepEqual(await authDataSnapshot(client), originalData);
          await assert.rejects(prisma(preexistingUrl, ['migrate', 'deploy'], currentConfig), /P3009/);

          const repair = await readFile(
            path.join(root, 'prisma/recovery/reconcile-preexisting-better-auth.sql'),
            'utf8',
          );
          await client.query(repair);
          assert.deepEqual(await authDataSnapshot(client), originalData);
          await assertSchemaMatches(preexistingUrl, currentConfig);
          const repairedSchema = await schemaSnapshot(client);
          const repairedData = await authDataSnapshot(client, true);
          await client.query(repair);
          assert.deepEqual(await schemaSnapshot(client), repairedSchema);
          assert.deepEqual(await authDataSnapshot(client, true), repairedData);

          await prisma(preexistingUrl, ['migrate', 'resolve', '--applied', reconciliationMigration], currentConfig);
          await prisma(preexistingUrl, ['migrate', 'deploy'], currentConfig);
          await assertSchemaMatches(preexistingUrl, currentConfig);
          const historyAfterRecovery = (
            await client.query<{ record: string }>(
              'SELECT to_jsonb(m)::text AS record FROM "_prisma_migrations" m WHERE migration_name <> ALL($1::text[]) ORDER BY migration_name',
              [[reconciliationMigration, restorationMigration]],
            )
          ).rows;
          assert.deepEqual(historyAfterRecovery, previousHistory);
          const unresolved = (
            await client.query<{ count: number }>(
              'SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL',
            )
          ).rows[0];
          assert.equal(unresolved?.count, 0);
          assert.deepEqual(await authDataSnapshot(client, true), repairedData);

          const runtimeClient = runtimePrisma(preexistingUrl);
          try {
            const users = await runtimeClient.user.findMany({
              orderBy: { id: 'asc' },
              include: { accounts: true, sessions: true },
            });
            assert.deepEqual(
              users.map(({ id, emailVerified, emailVerifiedAt }) => ({ id, emailVerified, emailVerifiedAt })),
              [
                { id: 'preexisting-unverified', emailVerified: false, emailVerifiedAt: null },
                { id: 'preexisting-verified', emailVerified: true, emailVerifiedAt: null },
              ],
            );
            assert.ok(users.every((user) => user.accounts.length === 1 && user.sessions.length === 1));
            assert.equal(
              (await runtimeClient.verification.findUniqueOrThrow({ where: { id: 'existing-verification' } })).value,
              'existing-verification-value',
            );
          } finally {
            await runtimeClient.$disconnect();
          }
        } finally {
          await client.end();
        }
      },
    );

    await t.test('deployment repairs missing auth columns after reconciliation was already recorded', async () => {
      await prisma(recordedUrl, ['migrate', 'deploy'], currentConfig);
      const client = await connect(recordedUrl);
      const runtimeClient = runtimePrisma(recordedUrl);
      try {
        await preexistingBetterAuthSchema(client);
        // Reproduce the database before the forward repair was introduced, retaining recorded reconciliation.
        await client.query('DELETE FROM "_prisma_migrations" WHERE migration_name = $1', [restorationMigration]);
        const recordedReconciliation = (
          await client.query<{ finished_at: Date | null; rolled_back_at: Date | null }>(
            'SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1',
            [reconciliationMigration],
          )
        ).rows[0];
        assert.ok(recordedReconciliation?.finished_at);
        assert.equal(recordedReconciliation.rolled_back_at, null);
        const originalHistory = (
          await client.query<{ record: string }>(
            'SELECT to_jsonb(m)::text AS record FROM "_prisma_migrations" m ORDER BY migration_name',
          )
        ).rows;
        assert.equal(originalHistory.length, migrationCount - 1);
        const originalData = await authDataSnapshot(client);
        assert.equal(originalData.length, 7);
        const accountLookup = {
          where: { providerId: 'google', accountId: 'google-verified' },
        };
        await assert.rejects(runtimeClient.account.findMany(accountLookup), { code: 'P2022' });

        const deployment = await prisma(recordedUrl, ['migrate', 'deploy'], currentConfig);
        assert.match(deployment, new RegExp(`Applying migration .${restorationMigration}`));
        await assertSchemaMatches(recordedUrl, currentConfig);
        assert.deepEqual(await authDataSnapshot(client), originalData);
        const historyAfterRepair = (
          await client.query<{ record: string }>(
            'SELECT to_jsonb(m)::text AS record FROM "_prisma_migrations" m WHERE migration_name <> $1 ORDER BY migration_name',
            [restorationMigration],
          )
        ).rows;
        assert.deepEqual(historyAfterRepair, originalHistory);

        const accounts = await runtimeClient.account.findMany(accountLookup);
        assert.equal(accounts.length, 1);
        assert.ok(accounts[0]);
        assert.equal(accounts[0].id, 'existing-account-verified');
        assert.equal(accounts[0].userId, 'preexisting-verified');
        assert.equal(accounts[0].accessToken, 'existing-access-verified');
        assert.equal(accounts[0].refreshToken, 'existing-refresh-verified');
        assert.equal(accounts[0].idToken, 'existing-id-verified');
        assert.equal(accounts[0].legacyType, null);
        assert.equal(accounts[0].legacyTokenType, null);
        assert.equal(accounts[0].legacySessionState, null);
        const users = await runtimeClient.user.findMany({
          orderBy: { id: 'asc' },
          include: { accounts: true, sessions: true },
        });
        assert.deepEqual(
          users.map(({ id, emailVerified, emailVerifiedAt }) => ({ id, emailVerified, emailVerifiedAt })),
          [
            { id: 'preexisting-unverified', emailVerified: false, emailVerifiedAt: null },
            { id: 'preexisting-verified', emailVerified: true, emailVerifiedAt: null },
          ],
        );
        assert.ok(users.every((user) => user.accounts.length === 1 && user.sessions.length === 1));
        assert.equal(
          (await runtimeClient.verification.findUniqueOrThrow({ where: { id: 'existing-verification' } })).value,
          'existing-verification-value',
        );

        const repairedSchema = await schemaSnapshot(client);
        const repairedData = await authDataSnapshot(client, true);
        assert.match(await prisma(recordedUrl, ['migrate', 'deploy'], currentConfig), /No pending migrations/);
        assert.deepEqual(await schemaSnapshot(client), repairedSchema);
        assert.deepEqual(await authDataSnapshot(client, true), repairedData);
      } finally {
        await runtimeClient.$disconnect();
        await client.end();
      }
    });
  } finally {
    await admin?.end();
    await server?.stop();
    await rm(workdir, { recursive: true, force: true });
  }
});

import { PrismaPg } from '@prisma/adapter-pg';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  access,
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { tsImport } from 'tsx/esm/api';

const root = fileURLToPath(new URL('..', import.meta.url));
const prismaCli = path.join(root, 'node_modules/prisma/build/index.js');
const migrationRoot = path.join(root, 'prisma/migrations');
const legacyLastMigration = '20260206194000_add_week_start_and_clock_format';

// Prisma's DateTime columns represent UTC without a PostgreSQL time zone.
// Parse them consistently even when the test runner uses a different time zone.
pg.types.setTypeParser(
  1114,
  (value) => new Date(`${value.replace(' ', 'T')}Z`),
);

async function command(program, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: root,
      env: process.env,
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const deadline = setTimeout(() => child.kill('SIGTERM'), 120_000);
    deadline.unref();
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    child.on('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(deadline);
      if (code === 0) resolve(output);
      else
        reject(
          new Error(
            `${program} ${args.join(' ')} failed (${code}):\n${output}`,
          ),
        );
    });
  });
}

async function localPostgresBin() {
  const candidates = [process.env.POSTGRES_BIN];
  try {
    candidates.push((await command('pg_config', ['--bindir'])).trim());
  } catch {
    /* Docker is the fallback when local server binaries are absent. */
  }
  try {
    const versions = await readdir('/usr/lib/postgresql');
    versions.sort((a, b) => Number(b) - Number(a));
    candidates.push(
      ...versions.map((version) => `/usr/lib/postgresql/${version}/bin`),
    );
  } catch {
    /* This path is specific to Debian-based systems. */
  }
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await Promise.all(
        ['initdb', 'pg_ctl'].map((name) => access(path.join(candidate, name))),
      );
      return candidate;
    } catch {
      /* Client-only installations cannot start a disposable server. */
    }
  }
}

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function disposablePostgres(workdir) {
  const bin = await localPostgresBin();
  if (bin && process.getuid?.() !== 0) {
    const data = path.join(workdir, 'postgres');
    const port = await unusedPort();
    await command(path.join(bin, 'initdb'), [
      '-D',
      data,
      '-U',
      'postgres',
      '-A',
      'trust',
      '--no-locale',
    ]);
    await command(path.join(bin, 'pg_ctl'), [
      '-D',
      data,
      '-l',
      path.join(workdir, 'postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${port} -k ${workdir}`,
      '-w',
      'start',
    ]);
    return {
      url: `postgresql://postgres@127.0.0.1:${port}/postgres`,
      stop: () =>
        command(path.join(bin, 'pg_ctl'), [
          '-D',
          data,
          '-m',
          'immediate',
          '-w',
          'stop',
        ]),
    };
  }

  const name = `lotterylunch-migrations-${randomBytes(8).toString('hex')}`;
  const password = randomBytes(16).toString('hex');
  try {
    await command('docker', [
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--publish',
      '127.0.0.1::5432',
      '--tmpfs',
      '/var/lib/postgresql',
      '--env',
      `POSTGRES_PASSWORD=${password}`,
      'postgres:18',
    ]);
    const address = (await command('docker', ['port', name, '5432'])).trim();
    assert.match(address, /^127\.0\.0\.1:\d+$/);
    return {
      url: `postgresql://postgres:${password}@${address}/postgres`,
      stop: () => command('docker', ['rm', '--force', name]),
    };
  } catch (error) {
    await command('docker', ['rm', '--force', name]).catch(() => {});
    throw new Error(
      'Migration tests require local PostgreSQL server binaries (set POSTGRES_BIN if needed) or Docker. They never use DATABASE_URL.',
      { cause: error },
    );
  }
}

async function connect(url) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    const client = new pg.Client({
      connectionString: url,
      connectionTimeoutMillis: 1000,
    });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      await delay(200);
    }
  }
  throw lastError;
}

function databaseUrl(url, database) {
  const result = new URL(url);
  result.pathname = `/${database}`;
  return result.toString();
}

async function prismaConfig(filename, schema, migrations) {
  await writeFile(
    filename,
    `export default { ...${JSON.stringify({ schema, migrations: { path: migrations } })}, datasource: { url: process.env.DATABASE_URL, shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } };\n`,
  );
  return filename;
}

async function prisma(url, args, config) {
  return await command(
    process.execPath,
    [prismaCli, ...args, '--config', config],
    {
      env: {
        ...process.env,
        DATABASE_URL: url,
        DIRECT_URL: url,
        SHADOW_DATABASE_URL: databaseUrl(url, 'migration_shadow'),
        CHECKPOINT_DISABLE: '1',
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
      },
    },
  );
}

async function assertSchemaMatches(url, config) {
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

async function runtimePrisma(url) {
  const { PrismaClient } = await tsImport(
    '../src/generated/prisma/client.ts',
    import.meta.url,
  );
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

test('migration history builds the current schema and preserves legacy records', async (t) => {
  const workdir = await mkdtemp(
    path.join(tmpdir(), 'lotterylunch-migrations-'),
  );
  let server;
  let admin;
  try {
    server = await disposablePostgres(workdir);
    admin = await connect(server.url);
    await admin.query('CREATE DATABASE migration_fresh');
    await admin.query('CREATE DATABASE migration_legacy');
    await admin.query('CREATE DATABASE migration_shadow');
    const freshUrl = databaseUrl(server.url, 'migration_fresh');
    const legacyUrl = databaseUrl(server.url, 'migration_legacy');
    const currentConfig = await prismaConfig(
      path.join(workdir, 'current.config.mjs'),
      path.join(root, 'prisma/schema.prisma'),
      migrationRoot,
    );

    await t.test(
      'all migrations deploy from an empty database without schema drift',
      async () => {
        await prisma(freshUrl, ['migrate', 'deploy'], currentConfig);
        await assertSchemaMatches(freshUrl, currentConfig);
        await prisma(freshUrl, ['migrate', 'deploy'], currentConfig);
        const runtimeClient = await runtimePrisma(freshUrl);
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
          assert.ok(user.id && user.accounts[0].id && user.sessions[0].id);
          assert.equal(user.emailVerified, false);
          assert.equal(user.weekStartDay, 'monday');
          assert.equal(user.accounts[0].userId, user.id);
          assert.equal(user.accounts[0].legacyType, null);
          assert.equal(user.sessions[0].userId, user.id);
          assert.ok(user.updatedAt instanceof Date);
          assert.equal(
            (
              await runtimeClient.session.findUnique({
                where: { token: 'fresh-session' },
                include: { user: true },
              })
            ).user.email,
            'fresh@example.test',
          );
        } finally {
          await runtimeClient.$disconnect();
        }
      },
    );

    await t.test(
      'the upgrade retains legacy identities, authentication, and relationships',
      async () => {
        const legacyPrisma = path.join(workdir, 'legacy-prisma');
        await cp(
          path.join(root, 'prisma/schema.prisma'),
          path.join(legacyPrisma, 'schema.prisma'),
          { recursive: true },
        );
        await cp(
          path.join(migrationRoot, 'migration_lock.toml'),
          path.join(legacyPrisma, 'migrations/migration_lock.toml'),
          { recursive: true },
        );
        const migrationNames = (await readdir(migrationRoot))
          .filter(
            (name) => name <= legacyLastMigration && /^\d{14}_/.test(name),
          )
          .sort();
        assert.ok(
          migrationNames.includes(legacyLastMigration),
          'historical migration boundary must exist',
        );
        for (const name of migrationNames) {
          await cp(
            path.join(migrationRoot, name),
            path.join(legacyPrisma, 'migrations', name),
            { recursive: true },
          );
        }
        const legacyConfig = await prismaConfig(
          path.join(workdir, 'legacy.config.mjs'),
          path.join(legacyPrisma, 'schema.prisma'),
          path.join(legacyPrisma, 'migrations'),
        );
        await prisma(legacyUrl, ['migrate', 'deploy'], legacyConfig);
        const client = await connect(legacyUrl);
        try {
          await client.query(
            await readFile(
              path.join(root, 'tests/fixtures/migrations/legacy.sql'),
              'utf8',
            ),
          );
          await prisma(legacyUrl, ['migrate', 'deploy'], currentConfig);
          await assertSchemaMatches(legacyUrl, currentConfig);
          const ownerId = '11111111-1111-4111-8111-111111111111';
          const memberId = '22222222-2222-4222-8222-222222222222';
          const groupId = '33333333-3333-4333-8333-333333333333';
          const users = (
            await client.query('SELECT * FROM "User" ORDER BY "email"')
          ).rows;
          assert.equal(users.length, 2);
          assert.equal(users[0].id, memberId);
          assert.equal(users[0].emailVerified, false);
          assert.equal(users[1].id, ownerId);
          assert.equal(users[1].emailVerified, true);
          assert.equal(
            users[1].emailVerifiedAt.toISOString(),
            '2025-05-20T10:00:00.000Z',
          );
          assert.equal(users[1].image, 'https://example.test/owner.png');
          assert.equal(users[1].timezone, 'Europe/Helsinki');
          assert.equal(users[1].shortNoticePreference, 'flexible');
          assert.equal(users[1].weekStartDay, 'sunday');
          assert.equal(users[1].clockFormat, 'ampm');
          assert.equal(
            users[1].createdAt.toISOString(),
            '2025-05-20T09:00:00.000Z',
          );
          assert.equal(
            users[1].updatedAt.toISOString(),
            '2025-05-20T10:00:00.000Z',
          );

          const accounts = (
            await client.query('SELECT * FROM "Account" ORDER BY "providerId"')
          ).rows;
          assert.equal(accounts.length, 2);
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
          assert.equal(
            accounts[1].accessTokenExpiresAt.toISOString(),
            new Date(2_000_000_000_000).toISOString(),
          );

          const sessions = (
            await client.query('SELECT * FROM "Session" ORDER BY "token"')
          ).rows;
          assert.equal(sessions.length, 2);
          assert.equal(new Set(sessions.map((session) => session.id)).size, 2);
          assert.ok(sessions.every((session) => session.id));
          assert.equal(sessions[0].token, 'legacy-member-session');
          assert.equal(sessions[0].userId, memberId);
          assert.equal(
            sessions[0].expiresAt.toISOString(),
            '2035-05-21T09:00:00.000Z',
          );
          assert.equal(sessions[1].token, 'legacy-owner-session');
          assert.equal(sessions[1].userId, ownerId);

          const group = (await client.query('SELECT * FROM "Group"')).rows[0];
          assert.equal(group.id, groupId);
          assert.equal(group.ownerId, ownerId);
          assert.equal(group.name, 'Legacy Lunch');
          assert.equal(group.location, 'Helsinki');
          assert.equal(group.visibility, 'invite_only');
          assert.equal(group.groupVisibility, 'invite_only');
          const memberships = (
            await client.query('SELECT * FROM "Membership" ORDER BY "joinedAt"')
          ).rows;
          assert.deepEqual(
            memberships.map(
              ({
                userId,
                groupId: membershipGroup,
                role,
                groupRole,
                status,
              }) => ({
                userId,
                groupId: membershipGroup,
                role,
                groupRole,
                status,
              }),
            ),
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
          assert.equal(
            memberships[0].createdAt.toISOString(),
            '2025-05-22T12:01:00.000Z',
          );

          const connection = (
            await client.query('SELECT * FROM "CalendarConnection"')
          ).rows[0];
          assert.equal(connection.userId, ownerId);
          assert.deepEqual(connection.oauthTokens, {
            accessToken: 'calendar-access',
          });
          const slot = (await client.query('SELECT * FROM "AvailabilitySlot"'))
            .rows[0];
          assert.equal(slot.userId, memberId);
          assert.equal(slot.groupId, groupId);
          const matches = (
            await client.query(
              'SELECT "state", "status" FROM "Match" ORDER BY "scheduledFor"',
            )
          ).rows;
          assert.deepEqual(matches, [
            { state: 'scheduled', status: 'confirmed' },
            { state: 'cancelled', status: 'canceled' },
          ]);
          assert.equal(
            (await client.query('SELECT "venue" FROM "LunchEvent"')).rows[0]
              .venue,
            'Legacy Cafe',
          );
          assert.equal(
            (await client.query('SELECT "token" FROM "VerificationToken"'))
              .rows[0].token,
            'legacy-verification-token',
          );
          const verification = (
            await client.query('SELECT * FROM "verification"')
          ).rows[0];
          assert.equal(verification.identifier, 'owner@example.test');
          assert.equal(verification.value, 'legacy-verification-token');
          assert.equal(
            verification.expiresAt.toISOString(),
            '2035-05-20T09:00:00.000Z',
          );
          const authenticator = (
            await client.query('SELECT * FROM "Authenticator"')
          ).rows[0];
          assert.equal(authenticator.userId, ownerId);
          assert.equal(authenticator.counter, 7);

          const runtimeClient = await runtimePrisma(legacyUrl);
          try {
            const owner = await runtimeClient.user.findUnique({
              where: { id: ownerId },
              include: {
                accounts: true,
                sessions: true,
                memberships: { include: { group: true } },
                calendarConnections: true,
              },
            });
            assert.equal(owner.emailVerified, true);
            assert.equal(owner.accounts[0].legacyType, 'oauth');
            assert.equal(owner.accounts[0].accessToken, 'google-access');
            assert.equal(owner.sessions[0].token, 'legacy-owner-session');
            assert.equal(
              owner.memberships[0].group.groupVisibility,
              'invite_only',
            );
            assert.deepEqual(owner.calendarConnections[0].oauthTokens, {
              accessToken: 'calendar-access',
            });
            assert.equal(
              (await runtimeClient.verification.findFirst()).value,
              'legacy-verification-token',
            );
          } finally {
            await runtimeClient.$disconnect();
          }

          await assert.rejects(
            client.query(
              'INSERT INTO "Membership" ("id", "userId", "groupId", "updatedAt") VALUES ($1, $2, $3, NOW())',
              ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'missing-user', groupId],
            ),
            { code: '23503' },
          );
          await assert.rejects(
            client.query(
              'INSERT INTO "Account" ("id", "accountId", "providerId", "userId", "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
              ['duplicate-account', 'google-owner', 'google', ownerId],
            ),
            { code: '23505' },
          );
          await client.query(
            'INSERT INTO "User" ("id", "email", "updatedAt") VALUES ($1, $2, NOW())',
            ['modern-user', 'modern@example.test'],
          );
          await client.query(
            'INSERT INTO "Account" ("id", "accountId", "providerId", "userId", "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
            ['modern-account', 'modern-user', 'credential', 'modern-user'],
          );
          await client.query(
            'INSERT INTO "Session" ("id", "token", "userId", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
            [
              'modern-session',
              'modern-session-token',
              'modern-user',
              '2035-05-20 09:00:00',
            ],
          );
          await client.query('DELETE FROM "User" WHERE "id" = $1', [
            'modern-user',
          ]);
          assert.equal(
            (
              await client.query(
                'SELECT count(*)::int AS count FROM "Account" WHERE "userId" = $1',
                ['modern-user'],
              )
            ).rows[0].count,
            0,
          );
          assert.equal(
            (
              await client.query(
                'SELECT count(*)::int AS count FROM "Session" WHERE "userId" = $1',
                ['modern-user'],
              )
            ).rows[0].count,
            0,
          );
          await prisma(legacyUrl, ['migrate', 'deploy'], currentConfig);
        } finally {
          await client.end();
        }
      },
    );
  } finally {
    await admin?.end();
    await server?.stop();
    await rm(workdir, { recursive: true, force: true });
  }
});

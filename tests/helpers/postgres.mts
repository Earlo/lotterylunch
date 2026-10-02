import assert from 'node:assert/strict';
import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../../generated/prisma/client';

const root = fileURLToPath(new URL('../..', import.meta.url));

export function command(program: string, args: string[], options: SpawnOptionsWithoutStdio = {}) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: root,
      env: process.env,
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const deadline = setTimeout(() => child.kill('SIGTERM'), 120_000);
    deadline.unref();
    let output = '';
    child.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      output += data.toString();
    });
    child.on('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(deadline);
      if (code === 0) resolve(output);
      else reject(new Error(`${program} ${args.join(' ')} failed (${code}):\n${output}`));
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
    candidates.push(
      ...versions.toSorted((a, b) => Number(b) - Number(a)).map((version) => `/usr/lib/postgresql/${version}/bin`),
    );
  } catch {
    /* This path is specific to Debian-based systems. */
  }
  const available = await Promise.all(
    candidates
      .filter((candidate): candidate is string => Boolean(candidate))
      .map(async (candidate) => {
        try {
          await Promise.all(['initdb', 'pg_ctl'].map((name) => access(path.join(candidate, name))));
          return candidate;
        } catch {
          /* Client-only installations cannot start a disposable server. */
          return undefined;
        }
      }),
  );
  return available.find((candidate) => candidate !== undefined);
}

async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

export async function disposablePostgres(workdir: string) {
  const bin = await localPostgresBin();
  if (bin && process.getuid?.() !== 0) {
    const data = path.join(workdir, 'postgres');
    const port = await unusedPort();
    await command(path.join(bin, 'initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale']);
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
      stop: () => command(path.join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop']),
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

export async function connect(url: string) {
  const deadline = Date.now() + 30_000;
  let lastError = new Error('Timed out connecting to disposable PostgreSQL');
  // oxlint-disable no-await-in-loop -- Each connection retry depends on the preceding attempt and backoff.
  while (Date.now() < deadline) {
    const client = new pg.Client({
      connectionString: url,
      connectionTimeoutMillis: 1000,
    });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('PostgreSQL connection failed', { cause: error });
      await client.end().catch(() => {});
      await delay(200);
    }
  }
  // oxlint-enable no-await-in-loop
  throw lastError;
}

export function databaseUrl(url: string, database: string) {
  const result = new URL(url);
  result.pathname = `/${database}`;
  return result.toString();
}

export function runtimePrisma(url: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

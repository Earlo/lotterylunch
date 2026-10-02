import assert from 'node:assert/strict';
import { spawn, type ChildProcess, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  availabilitySlotSchema,
  groupDetailSchema,
  groupSummarySchema,
  userProfileSchema,
} from '../lib/webui/api/schemas';
import { zonedDateParts } from '../lib/zonedDateTime';
import { command, connect, databaseUrl, disposablePostgres, runtimePrisma } from './helpers/postgres.mts';

const root = fileURLToPath(new URL('..', import.meta.url));
const secret = 'browser-test-secret-at-least-32-characters';
const profileTimezone = 'Europe/Helsinki';
const cdpMessageSchema = z.object({
  id: z.number().int().optional(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string(), data: z.unknown().optional() }).optional(),
});
const evaluationSchema = z.object({
  result: z.object({ value: z.unknown().optional() }),
  exceptionDetails: z.unknown().optional(),
});
const browserTargetSchema = z.object({ webSocketDebuggerUrl: z.string().url() });
const runsSchema = z.array(
  z.object({ matches: z.array(z.object({ id: z.string(), memberIds: z.array(z.string()) })) }),
);

type LoggedChild = { process: ChildProcess; output: string; error: Error | undefined };
type PendingCommand = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function startChild(program: string, args: string[], options: SpawnOptionsWithoutStdio = {}): LoggedChild {
  const child: LoggedChild = {
    process: spawn(program, args, { cwd: root, ...options, stdio: ['ignore', 'pipe', 'pipe'] }),
    output: '',
    error: undefined,
  };
  const capture = (data: Buffer) => {
    child.output = `${child.output}${data.toString()}`.slice(-64_000);
  };
  child.process.stdout?.on('data', capture);
  child.process.stderr?.on('data', capture);
  child.process.on('error', (error) => {
    child.error = error;
  });
  return child;
}

function assertRunning(child: LoggedChild) {
  if (child.error) throw child.error;
  if (child.process.exitCode !== null || child.process.signalCode !== null) {
    throw new Error(`Child process exited unexpectedly:\n${child.output}`);
  }
}

async function stopChild(child: LoggedChild | undefined) {
  if (!child?.process.pid || child.process.exitCode !== null || child.process.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.process.once('exit', () => resolve()));
  child.process.kill('SIGTERM');
  await Promise.race([exited, delay(3000)]);
  if (child.process.exitCode === null && child.process.signalCode === null) {
    child.process.kill('SIGKILL');
    await exited;
  }
}

async function freePort() {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve, reject) => listener.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function chromeExecutable() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  const available = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        await access(candidate);
        return candidate;
      } catch {
        return undefined;
      }
    }),
  );
  const executable = available.find((candidate) => candidate !== undefined);
  if (!executable) throw new Error('Browser integration tests require Chrome or Chromium; set CHROME_BIN.');
  return executable;
}

async function eventually<T>(fn: () => T | Promise<T>, description: string): Promise<NonNullable<T>> {
  let last: unknown;
  // oxlint-disable no-await-in-loop -- Each retry depends on the preceding attempt and backoff.
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await delay(100);
  }
  // oxlint-enable no-await-in-loop
  throw new Error(`Timed out: ${description}`, { cause: last });
}

async function cdp(url: string, sockets: WebSocket[]) {
  const ws = new WebSocket(url);
  sockets.push(ws);
  const pending = new Map<number, PendingCommand>();
  let next = 0;
  const fail = (error: Error) => {
    for (const pendingCommand of pending.values()) {
      clearTimeout(pendingCommand.timer);
      pendingCommand.reject(error);
    }
    pending.clear();
  };
  ws.addEventListener('message', (event) => {
    const data: unknown = event.data;
    if (typeof data !== 'string') return;
    try {
      const raw: unknown = JSON.parse(data);
      const message = cdpMessageSchema.parse(raw);
      if (message.id === undefined) return;
      const pendingCommand = pending.get(message.id);
      if (!pendingCommand) return;
      clearTimeout(pendingCommand.timer);
      pending.delete(message.id);
      if (message.error) pendingCommand.reject(new Error(message.error.message));
      else pendingCommand.resolve(message.result);
    } catch (error) {
      fail(new Error('Invalid Chrome DevTools response', { cause: error }));
    }
  });
  ws.addEventListener('close', () => fail(new Error('Chrome DevTools connection closed')));
  ws.addEventListener('error', () => fail(new Error('Chrome DevTools connection failed')));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out connecting to Chrome DevTools')), 15_000);
    ws.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('Could not connect to Chrome DevTools'));
      },
      { once: true },
    );
    ws.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
  return {
    send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
      return new Promise((resolve, reject) => {
        if (ws.readyState !== WebSocket.OPEN) {
          reject(new Error('Chrome DevTools is not connected'));
          return;
        }
        const id = ++next;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Chrome DevTools timeout: ${method}`));
        }, 15_000);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

await test(
  'production browser journey preserves profile timezone and private lunch results',
  { timeout: 120_000 },
  async (context) => {
    const executable = await chromeExecutable();
    const workdir = await mkdtemp(path.join(tmpdir(), 'lotterylunch-browser-'));
    const sockets: WebSocket[] = [];
    let postgres: Awaited<ReturnType<typeof disposablePostgres>> | undefined;
    let admin: Awaited<ReturnType<typeof connect>> | undefined;
    let db: ReturnType<typeof runtimePrisma> | undefined;
    let app: LoggedChild | undefined;
    let chrome: LoggedChild | undefined;
    let failure: Error | undefined;
    try {
      postgres = await disposablePostgres(workdir);
      admin = await connect(postgres.url);
      await admin.query('CREATE DATABASE browser_regression');
      const dbUrl = databaseUrl(postgres.url, 'browser_regression');
      const config = path.join(workdir, 'prisma.config.mjs');
      await writeFile(
        config,
        `export default ${JSON.stringify({
          schema: path.join(root, 'prisma/schema.prisma'),
          migrations: { path: path.join(root, 'prisma/migrations') },
          datasource: { url: dbUrl },
        })};\n`,
      );
      await command(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', config]);
      const database = runtimePrisma(dbUrl);
      db = database;
      const users = await Promise.all(
        ['Owner', 'Member', 'Outsider'].map((name) =>
          database.user.create({
            data: {
              name,
              email: `${name.toLowerCase()}@example.test`,
              timezone: profileTimezone,
              area: 'Old area',
              image: 'https://example.test/photo.png',
            },
          }),
        ),
      );
      const cookies = await Promise.all(
        users.map(async (user) => {
          const token = randomUUID();
          await database.session.create({
            data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3_600_000) },
          });
          const signed = `${token}.${createHmac('sha256', secret).update(token).digest('base64')}`;
          return encodeURIComponent(signed);
        }),
      );
      const port = await freePort();
      const origin = `http://localhost:${port}`;
      const application = startChild(
        process.execPath,
        ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)],
        {
          env: {
            ...process.env,
            NODE_ENV: 'production',
            DATABASE_URL: dbUrl,
            BETTER_AUTH_URL: origin,
            BETTER_AUTH_SECRET: secret,
            GOOGLE_CLIENT_ID: 'fake-client',
            GOOGLE_CLIENT_SECRET: 'fake-secret',
            NEXT_TELEMETRY_DISABLED: '1',
          },
        },
      );
      app = application;
      await eventually(async () => {
        assertRunning(application);
        return (await fetch(`${origin}/api/v1/ready`, { signal: AbortSignal.timeout(1000) })).ok;
      }, 'app startup (run npm run build before this test)');

      function request(index: number | null, route: string, options: RequestInit = {}) {
        const headers = new Headers(options.headers);
        if (options.body) headers.set('Content-Type', 'application/json');
        if (index !== null) {
          const cookie = cookies[index];
          assert.ok(cookie, 'Known authenticated test user');
          headers.set('Cookie', `better-auth.session_token=${cookie}`);
        }
        return fetch(`${origin}${route}`, { ...options, headers });
      }
      async function groups(index: number) {
        const response = await request(index, '/api/v1/groups');
        assert.equal(response.status, 200);
        return groupSummarySchema.array().parse(await response.json());
      }
      assert.equal((await request(null, '/api/v1/groups')).status, 401);
      assert.equal((await request(0, '/api/auth/get-session')).status, 200);

      const debugPort = await freePort();
      const browserProcess = startChild(executable, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-background-networking',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
        `--user-data-dir=${path.join(workdir, 'chrome')}`,
        `--remote-debugging-port=${debugPort}`,
        'about:blank',
      ]);
      chrome = browserProcess;
      await eventually(async () => {
        assertRunning(browserProcess);
        return (await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: AbortSignal.timeout(1000) })).ok;
      }, 'Chrome startup');
      const target = browserTargetSchema.parse(
        await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then((response) =>
          response.json(),
        ),
      );
      const browser = await cdp(target.webSocketDebuggerUrl, sockets);
      await browser.send('Network.enable');
      await browser.send('Page.enable');
      await browser.send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' });

      async function evaluate(expression: string): Promise<unknown> {
        const result = evaluationSchema.parse(
          await browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
        );
        if (result.exceptionDetails !== undefined) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
      }
      function bodyContains(text: string) {
        return evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`).then((value) =>
          z.boolean().parse(value),
        );
      }
      async function navigate(index: number, route: string, expected: string) {
        const cookie = cookies[index];
        assert.ok(cookie);
        await browser.send('Network.setCookie', {
          name: 'better-auth.session_token',
          value: cookie,
          url: origin,
          httpOnly: true,
          sameSite: 'Lax',
        });
        await browser.send('Page.navigate', { url: `${origin}${route}` });
        await eventually(
          async () =>
            z
              .boolean()
              .parse(
                await evaluate(
                  `location.href === ${JSON.stringify(`${origin}${route}`)} && document.readyState === 'complete' && document.body.innerText.includes(${JSON.stringify(expected)})`,
                ),
              ),
          `page ${route}`,
        );
        await delay(250);
      }
      async function click(text: string) {
        await eventually(
          async () =>
            z
              .boolean()
              .parse(
                await evaluate(
                  `(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) return false; button.click(); return true; })()`,
                ),
              ),
          `click ${text}`,
        );
      }
      async function set(selector: string, value: string) {
        await evaluate(
          `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) throw Error('missing control'); Object.getOwnPropertyDescriptor(input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', {bubbles:true})); })()`,
        );
      }

      await navigate(0, '/portal/groups', 'Create a group');
      await set('input[aria-label="Group name"]', 'Browser lunches');
      await click('Create group');
      const group = await eventually(
        async () => (await groups(0)).find((row) => row.name === 'Browser lunches'),
        'create group',
      );
      context.diagnostic('Authenticated browser group creation works on a randomly assigned origin.');
      await navigate(1, '/portal/groups', 'Join a group');
      await set('input[aria-label="Group ID"]', group.id);
      await click('Join group');
      await eventually(async () => (await groups(1)).length === 1, 'member join');

      // oxlint-disable no-await-in-loop -- Each user's browser interactions form a sequential UI journey.
      for (const index of [1, 0]) {
        await navigate(index, `/portal/groups/${group.id}`, 'Join lottery');
        await click('Join lottery');
        await eventually(() => bodyContains('Pause participation'), 'participation');
        await navigate(index, '/portal/settings', 'Add slot');
        await eventually(
          async () => z.boolean().parse(await evaluate(`!document.querySelector('#availability-start').disabled`)),
          'availability load',
        );
        await set('form select:has(option[value="weekdays"])', 'weekdays');
        await set('#availability-start', '12:00');
        await set('#availability-end', '13:00');
        await click('Add slot');
        await click('Save availability');
        await eventually(() => bodyContains('Preferred times saved.'), 'availability save');
        const availability = availabilitySlotSchema
          .array()
          .parse(await request(index, '/api/v1/availability').then((response) => response.json()));
        assert.equal(availability.length, 7, 'Every day has persisted availability');
        for (const slot of availability) {
          const start = zonedDateParts(new Date(slot.startAt), profileTimezone);
          const end = zonedDateParts(new Date(slot.endAt), profileTimezone);
          assert.deepEqual(
            [start.hour, start.minute, end.hour, end.minute],
            [12, 0, 13, 0],
            'Persisted availability uses the Helsinki profile timezone despite a New York browser',
          );
        }
        if (index === 0) {
          await set('#profile-name', '');
          await set('#profile-area', '');
          await set('#profile-image', '');
          await click('Save profile');
          await eventually(async () => {
            const profile = userProfileSchema.parse(
              await request(0, '/api/v1/users/me').then((response) => response.json()),
            );
            return profile.name === null && profile.area === null && profile.image === null;
          }, 'clear optional profile');
          await navigate(0, '/portal/settings', 'Add slot');
          assert.equal(
            await evaluate("document.querySelector('#profile-name').value"),
            '',
            'Cleared profile name stays empty after reload',
          );
          await set('select:has(option[value="sunday"])', 'sunday');
          await set('select:has(option[value="ampm"])', 'ampm');
          await click('Save preferences');
          await eventually(
            async () => (await bodyContains('Preferences saved.')) && (await bodyContains('12:00 PM')),
            'live schedule preferences',
          );
        }
      }
      // oxlint-enable no-await-in-loop
      context.diagnostic(
        'Two users opt in and save profile-timezone availability; clearing profile fields and updating preferences persist.',
      );

      await navigate(0, `/portal/groups/${group.id}`, 'Run lunch lottery');
      await click('Run lunch lottery');
      await eventually(() => bodyContains('Lottery saved: 1 lunch'), 'lottery execution');
      const runs = runsSchema.parse(
        await request(0, `/api/v1/groups/${group.id}/runs`).then((response) => response.json()),
      );
      const run = runs[0];
      assert.ok(run);
      assert.equal(run.matches.length, 1);
      const match = run.matches[0];
      assert.ok(match);
      assert.deepEqual(new Set(match.memberIds), new Set(users.slice(0, 2).map((user) => user.id)));
      await click('Create calendar file');
      const artifactPath = await eventually(
        async () =>
          z
            .string()
            .optional()
            .parse(
              await evaluate(`document.querySelector('a[href^="/api/v1/calendar-artifacts/"]')?.getAttribute('href')`),
            ),
        'calendar output',
      );
      const calendar = await request(0, artifactPath);
      assert.equal(calendar.status, 200);
      const calendarText = await calendar.text();
      assert.match(calendarText, /BEGIN:VCALENDAR/);
      assert.ok(calendarText.includes(`UID:${match.id}@lotterylunch`), 'ICS imports share the stable lunch identity');
      await navigate(0, `/portal/groups/${group.id}`, 'Download calendar file');
      assert.equal(
        await evaluate(`document.querySelector('a[href^="/api/v1/calendar-artifacts/"]')?.getAttribute('href')`),
        artifactPath,
        'the saved calendar action remains available after reloading results',
      );
      assert.equal(await database.calendarArtifact.count({ where: { matchId: match.id } }), 1);
      assert.equal((await request(null, artifactPath)).status, 401);
      assert.equal((await request(2, artifactPath)).status, 404);
      context.diagnostic(
        'Browser draw results and private ICS work; anonymous and unrelated users cannot download the artifact.',
      );

      await click('Edit group');
      await set('#group-edit-name', 'Browser lunches edited');
      await click('Save group');
      await eventually(
        async () =>
          groupDetailSchema.parse(await request(0, `/api/v1/groups/${group.id}`).then((response) => response.json()))
            .name === 'Browser lunches edited',
        'group edit',
      );
      await navigate(1, `/portal/groups/${group.id}`, 'Leave group');
      await click('Leave group');
      await eventually(async () => (await groups(1)).length === 0, 'member leave');
      await navigate(0, `/portal/groups/${group.id}`, 'Delete group');
      await evaluate('window.confirm = () => true');
      await click('Delete group');
      await eventually(async () => (await groups(0)).length === 0, 'group delete');
      assert.equal(await database.group.count(), 0);
      assert.equal(await database.match.count(), 0);
      context.diagnostic('Browser group editing, member leave, and deletion with dependent results passed.');
    } catch (error) {
      if (app?.output) context.diagnostic(`Next.js output:\n${app.output}`);
      if (chrome?.output) context.diagnostic(`Chrome output:\n${chrome.output}`);
      failure = error instanceof Error ? error : new Error('Browser journey failed', { cause: error });
    } finally {
      for (const socket of sockets) socket.close();
      const stopped = await Promise.allSettled([stopChild(chrome), stopChild(app)]);
      const disconnected = await Promise.allSettled([db?.$disconnect(), admin?.end()]);
      async function removeDatabase() {
        try {
          await postgres?.stop();
        } finally {
          await rm(workdir, { recursive: true, force: true });
        }
      }
      const removed = await Promise.allSettled([removeDatabase()]);
      const failed = [...stopped, ...disconnected, ...removed].filter((result) => result.status === 'rejected');
      if (failed.length) {
        const reasons = failed.map((result) => {
          const reason: unknown = result.reason;
          return reason;
        });
        context.diagnostic(`Browser test cleanup failed: ${reasons.map(String).join('; ')}`);
        failure ??= new AggregateError(reasons, 'Browser test cleanup failed');
      }
    }
    if (failure) throw failure;
  },
);

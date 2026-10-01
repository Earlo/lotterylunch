import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { ApiError, apiFetch, getErrorMessage } from '../lib/webui/api/client.ts';
import { resolvePortalCallback } from '../lib/webui/authRedirect.ts';
import { fetchGroups } from '../lib/webui/queries/groups.ts';

type SentRequest = {
  path: Parameters<typeof fetch>[0];
  init: RequestInit & { headers: Headers };
};

function mockResponse(context: TestContext, response: Response) {
  const mockFetch: typeof fetch = () => Promise.resolve(response);
  context.mock.method(globalThis, 'fetch', mockFetch);
}

const abortFetch: typeof fetch = (_path, init) => {
  const signal = init?.signal;
  assert.ok(signal);
  return new Promise<Response>((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => {
        const reason: unknown = signal.reason;
        reject(reason instanceof Error ? reason : new Error('Request aborted'));
      },
      { once: true },
    );
  });
};

await test('apiFetch preserves all HeadersInit representations and request options', async (t) => {
  const cases: { name: string; headers: HeadersInit }[] = [
    {
      name: 'Headers object',
      headers: new Headers({
        Authorization: 'Bearer test',
        'content-type': 'application/custom',
      }),
    },
    {
      name: 'header tuples',
      headers: [
        ['Authorization', 'Bearer test'],
        ['content-type', 'application/custom'],
      ],
    },
    {
      name: 'header record',
      headers: {
        Authorization: 'Bearer test',
        'content-type': 'application/custom',
      },
    },
  ];
  await Promise.all(
    cases.map(({ name, headers }) =>
      t.test(name, async (context) => {
        const sent: SentRequest[] = [];
        const mockFetch: typeof fetch = (path, init = {}) => {
          sent.push({ path, init: { ...init, headers: new Headers(init.headers) } });
          return Promise.resolve(Response.json({ saved: true }));
        };
        context.mock.method(globalThis, 'fetch', mockFetch);
        const controller = new AbortController();
        assert.deepEqual(
          await apiFetch('/api/example', {
            method: 'PATCH',
            headers,
            body: '{}',
            credentials: 'same-origin',
            signal: controller.signal,
          }),
          { saved: true },
        );
        assert.equal(sent.length, 1);
        const request = sent[0];
        assert.ok(request);
        assert.equal(request.path, '/api/example');
        assert.equal(request.init.method, 'PATCH');
        assert.equal(request.init.credentials, 'same-origin');
        assert.equal(request.init.signal, controller.signal);
        assert.equal(request.init.headers.get('Authorization'), 'Bearer test');
        assert.equal(request.init.headers.get('Content-Type'), 'application/custom');
        assert.equal(request.init.headers.get('Accept'), 'application/json');
        assert.equal(new Headers(headers).get('Accept'), null, 'caller headers must not be mutated');
      }),
    ),
  );
});

await test('apiFetch sets JSON headers only when appropriate', async (t) => {
  const sent: Headers[] = [];
  const mockFetch: typeof fetch = (_path, init) => {
    sent.push(new Headers(init?.headers));
    return Promise.resolve(Response.json({}));
  };
  t.mock.method(globalThis, 'fetch', mockFetch);
  await apiFetch('/api/example');
  await apiFetch('/api/example', { method: 'POST', body: '{}' });
  await apiFetch('/api/example', { method: 'POST', body: new FormData() });
  await apiFetch('/api/example', { headers: { Accept: 'application/custom' } });
  assert.equal(sent.length, 4);
  const [empty, json, multipart, custom] = sent;
  assert.ok(empty && json && multipart && custom);
  assert.equal(empty.get('Content-Type'), null);
  assert.equal(json.get('Content-Type'), 'application/json');
  assert.equal(multipart.get('Content-Type'), null, 'fetch must supply the multipart boundary');
  assert.equal(custom.get('Accept'), 'application/custom');
});

await test('apiFetch accepts a successful response without a JSON body', async (t) => {
  mockResponse(t, new Response(null, { status: 204 }));
  assert.equal(await apiFetch('/api/example', { method: 'DELETE' }), null);
});

await test('API validation errors retain status and details and summarize at most three issues', async (t) => {
  const details = {
    issues: [
      { path: ['slots', 0, 'startAt'], message: 'Invalid date' },
      { path: [], message: 'Missing fields' },
      { path: ['name'], message: 'Too long' },
      { path: ['image'], message: 'Invalid URL' },
    ],
  };
  mockResponse(t, Response.json({ error: { message: 'Invalid request', details } }, { status: 400 }));
  await assert.rejects(apiFetch('/api/example'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.name, 'ApiError');
    assert.equal(error.status, 400);
    assert.deepEqual(error.details, details);
    assert.equal(
      error.message,
      'Invalid request: slots.0.startAt: Invalid date; request: Missing fields; name: Too long',
    );
    return true;
  });
});

await test('API errors handle legacy payloads and malformed or non-JSON bodies', async (t) => {
  const cases: { name: string; response: Response; message: string; details: unknown }[] = [
    {
      name: 'legacy error message',
      response: Response.json({ error: 'Forbidden', details: 0 }, { status: 403 }),
      message: 'Forbidden',
      details: 0,
    },
    {
      name: 'malformed validation details',
      response: Response.json({ error: { message: 'Bad input', details: { issues: 'invalid' } } }, { status: 400 }),
      message: 'Bad input',
      details: { issues: 'invalid' },
    },
    {
      name: 'empty message',
      response: Response.json({ error: '' }, { status: 503 }),
      message: 'Request failed (HTTP 503).',
      details: undefined,
    },
    {
      name: 'null payload',
      response: Response.json(null, { status: 503 }),
      message: 'Request failed (HTTP 503).',
      details: undefined,
    },
    {
      name: 'HTML response',
      response: new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
      message: 'Bad Gateway',
      details: undefined,
    },
  ];
  await Promise.all(
    cases.map(({ name, response, message, details }) =>
      t.test(name, async (context) => {
        mockResponse(context, response);
        await assert.rejects(apiFetch('/api/example'), (error: unknown) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.message, message);
          assert.equal(error.status, response.status);
          assert.deepEqual(error.details, details);
          return true;
        });
      }),
    ),
  );
});

await test('group queries reject malformed successful API responses', async (t) => {
  mockResponse(t, Response.json([{ id: 'group-1', name: 'Lunch crew' }]));
  await assert.rejects(fetchGroups(), { name: 'ZodError' });
});

await test('apiFetch preserves network failures and aborts', async (t) => {
  const networkError = new TypeError('Network unavailable');
  const networkFetch: typeof fetch = () => Promise.reject(networkError);
  t.mock.method(globalThis, 'fetch', networkFetch);
  await assert.rejects(apiFetch('/api/example'), (error: unknown) => error === networkError);

  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', abortFetch);
  const request = apiFetch('/api/example', { signal: controller.signal });
  controller.abort();
  const abortReason: unknown = controller.signal.reason;
  await assert.rejects(request, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error, abortReason);
    assert.equal(error.name, 'AbortError');
    return true;
  });
});

await test('getErrorMessage safely handles arbitrary thrown values and empty messages', () => {
  assert.equal(getErrorMessage(new Error('Failed'), 'Fallback'), 'Failed');
  assert.equal(getErrorMessage({ message: 'Validation failed' }, 'Fallback'), 'Validation failed');
  for (const error of [null, undefined, 'failed', { message: '   ' }, { message: 3 }]) {
    assert.equal(getErrorMessage(error, 'Fallback'), 'Fallback');
  }
});

await test('sign-in redirects preserve portal destinations and reject external or unrelated URLs', () => {
  const origin = 'https://lunch.example';
  assert.equal(
    resolvePortalCallback('/portal/groups/123?tab=members#invite', origin),
    '/portal/groups/123?tab=members#invite',
  );
  assert.equal(resolvePortalCallback(`${origin}/portal/settings`, origin), '/portal/settings');
  for (const path of [
    null,
    '',
    '//evil.example/portal',
    'https://evil.example/portal',
    '/portal/../../other',
    '/other',
    '/portals',
    'javascript:alert(1)',
  ]) {
    assert.equal(resolvePortalCallback(path, origin), '/portal');
  }
});

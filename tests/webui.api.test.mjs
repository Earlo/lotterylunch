import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ApiError,
  apiFetch,
  getErrorMessage,
} from '../src/webui/api/client.ts';
import { resolvePortalCallback } from '../src/webui/authRedirect.ts';

test('apiFetch preserves all HeadersInit representations and request options', async (t) => {
  for (const headers of [
    new Headers({
      Authorization: 'Bearer test',
      'content-type': 'application/custom',
    }),
    [
      ['Authorization', 'Bearer test'],
      ['content-type', 'application/custom'],
    ],
    { Authorization: 'Bearer test', 'content-type': 'application/custom' },
  ]) {
    let sent;
    t.mock.method(globalThis, 'fetch', async (path, init) => {
      sent = { path, init };
      return Response.json({ saved: true });
    });
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
    assert.equal(sent.path, '/api/example');
    assert.equal(sent.init.method, 'PATCH');
    assert.equal(sent.init.credentials, 'same-origin');
    assert.equal(sent.init.signal, controller.signal);
    assert.equal(sent.init.headers.get('Authorization'), 'Bearer test');
    assert.equal(sent.init.headers.get('Content-Type'), 'application/custom');
    assert.equal(sent.init.headers.get('Accept'), 'application/json');
    assert.equal(
      new Headers(headers).get('Accept'),
      null,
      'caller headers must not be mutated',
    );
  }
});

test('apiFetch sets JSON headers only when appropriate', async (t) => {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (_path, init) => {
    sent.push(init);
    return Response.json({});
  });
  await apiFetch('/api/example');
  await apiFetch('/api/example', { method: 'POST', body: '{}' });
  await apiFetch('/api/example', { method: 'POST', body: new FormData() });
  await apiFetch('/api/example', { headers: { Accept: 'application/custom' } });
  assert.equal(sent[0].headers.get('Content-Type'), null);
  assert.equal(sent[1].headers.get('Content-Type'), 'application/json');
  assert.equal(
    sent[2].headers.get('Content-Type'),
    null,
    'fetch must supply the multipart boundary',
  );
  assert.equal(sent[3].headers.get('Accept'), 'application/custom');
});

test('apiFetch accepts a successful response without a JSON body', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 204 }),
  );
  assert.equal(await apiFetch('/api/example', { method: 'DELETE' }), null);
});

test('API validation errors retain status and details and summarize at most three issues', async (t) => {
  const details = {
    issues: [
      { path: ['slots', 0, 'startAt'], message: 'Invalid date' },
      { path: [], message: 'Missing fields' },
      { path: ['name'], message: 'Too long' },
      { path: ['image'], message: 'Invalid URL' },
    ],
  };
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      {
        error: { message: 'Invalid request', details },
      },
      { status: 400 },
    ),
  );
  await assert.rejects(apiFetch('/api/example'), (error) => {
    assert.ok(error instanceof Error);
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

test('API errors handle legacy payloads and malformed or non-JSON bodies', async (t) => {
  const cases = [
    [
      Response.json({ error: 'Forbidden', details: 0 }, { status: 403 }),
      'Forbidden',
      0,
    ],
    [
      Response.json(
        { error: { message: 'Bad input', details: { issues: 'invalid' } } },
        { status: 400 },
      ),
      'Bad input',
      { issues: 'invalid' },
    ],
    [
      Response.json({ error: '' }, { status: 503 }),
      'Request failed (HTTP 503).',
      undefined,
    ],
    [
      Response.json(null, { status: 503 }),
      'Request failed (HTTP 503).',
      undefined,
    ],
    [
      new Response('<html>Bad gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
      }),
      'Bad Gateway',
      undefined,
    ],
  ];
  for (const [response, message, details] of cases) {
    t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(apiFetch('/api/example'), (error) => {
      assert.equal(error.message, message);
      assert.equal(error.status, response.status);
      assert.deepEqual(error.details, details);
      return true;
    });
  }
});

test('apiFetch preserves network failures and aborts', async (t) => {
  const networkError = new TypeError('Network unavailable');
  t.mock.method(globalThis, 'fetch', async () => {
    throw networkError;
  });
  await assert.rejects(
    apiFetch('/api/example'),
    (error) => error === networkError,
  );

  const controller = new AbortController();
  t.mock.method(
    globalThis,
    'fetch',
    (_path, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  const request = apiFetch('/api/example', { signal: controller.signal });
  controller.abort();
  await assert.rejects(
    request,
    (error) =>
      error === controller.signal.reason && error.name === 'AbortError',
  );
});

test('getErrorMessage safely handles arbitrary thrown values and empty messages', () => {
  assert.equal(getErrorMessage(new Error('Failed'), 'Fallback'), 'Failed');
  assert.equal(
    getErrorMessage({ message: 'Validation failed' }, 'Fallback'),
    'Validation failed',
  );
  for (const error of [
    null,
    undefined,
    'failed',
    { message: '   ' },
    { message: 3 },
  ]) {
    assert.equal(getErrorMessage(error, 'Fallback'), 'Fallback');
  }
});

test('sign-in redirects preserve portal destinations and reject external or unrelated URLs', () => {
  const origin = 'https://lunch.example';
  assert.equal(
    resolvePortalCallback('/portal/groups/123?tab=members#invite', origin),
    '/portal/groups/123?tab=members#invite',
  );
  assert.equal(
    resolvePortalCallback(`${origin}/portal/settings`, origin),
    '/portal/settings',
  );
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
/* global globalThis */

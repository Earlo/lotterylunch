import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import { badRequest } from '@/server/http/errors';
import { localRedirectPath } from '@/server/http/redirects';
import { handleRoute } from '@/server/http/responses';

test('route helpers preserve calendar downloads and response headers', async () => {
  const download = new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lunch.ics"',
    },
  });

  const response = await handleRoute(async () => download);

  assert.equal(response, download);
  assert.equal(
    response.headers.get('Content-Type'),
    'text/calendar; charset=utf-8',
  );
  assert.equal(
    response.headers.get('Content-Disposition'),
    'attachment; filename="lunch.ics"',
  );
  assert.equal(await response.text(), 'BEGIN:VCALENDAR\r\nEND:VCALENDAR');
});

test('route helpers return JSON for data and the existing envelope for HTTP errors', async () => {
  const data = await handleRoute(async () => ({ id: 'group-1' }));
  assert.equal(data.status, 200);
  assert.deepEqual(await data.json(), { id: 'group-1' });

  const error = await handleRoute(async () => {
    throw badRequest('Invalid calendar', { field: 'endsAt' });
  });
  assert.equal(error.status, 400);
  assert.deepEqual(await error.json(), {
    error: {
      code: 'bad_request',
      message: 'Invalid calendar',
      details: { field: 'endsAt' },
    },
  });
});

test('Zod 4 validation failures retain issue details and a 400 response', async () => {
  const response = await handleRoute(async () =>
    z.object({ name: z.string() }).parse({ name: 1 }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'bad_request');
  assert.equal(body.error.message, 'Validation failed');
  assert.equal(body.error.details.issues[0].code, 'invalid_type');
  assert.deepEqual(body.error.details.issues[0].path, ['name']);
});

test('OAuth return paths stay on the application origin after URL normalization', () => {
  assert.equal(
    localRedirectPath('/portal/settings?tab=calendar#connected'),
    '/portal/settings?tab=calendar#connected',
  );
  for (const value of [
    null,
    '',
    'https://external.example',
    '//external.example',
    '/\\external.example',
    '/\t/external.example',
    '//[invalid',
  ]) {
    assert.equal(localRedirectPath(value), '/portal/settings');
  }
});

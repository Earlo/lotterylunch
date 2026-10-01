import assert from 'node:assert/strict';
import test from 'node:test';

import { SlidingWindowRateLimiter } from '@/server/http/rate-limit';

test('the request budget is independent for each client', () => {
  const limiter = new SlidingWindowRateLimiter({
    windowMs: 60_000,
    maxRequests: 2,
    maxClients: 10,
  });

  assert.equal(limiter.check('client-a', 0).allowed, true);
  assert.equal(limiter.check('client-a', 1000).allowed, true);
  assert.deepEqual(limiter.check('client-a', 1500), {
    allowed: false,
    retryAfterSeconds: 59,
  });
  assert.equal(limiter.check('client-b', 1500).allowed, true);
});

test('rejected requests do not extend the window and slots expire at the boundary', () => {
  const limiter = new SlidingWindowRateLimiter({
    windowMs: 1000,
    maxRequests: 2,
    maxClients: 10,
  });

  assert.equal(limiter.check('client', 0).allowed, true);
  assert.equal(limiter.check('client', 100).allowed, true);
  for (let now = 200; now < 1000; now += 1) {
    assert.deepEqual(limiter.check('client', now), {
      allowed: false,
      retryAfterSeconds: 1,
    });
  }
  assert.equal(limiter.check('client', 1000).allowed, true);
  assert.equal(limiter.check('client', 1100).allowed, true);
  assert.equal(limiter.check('client', 1101).allowed, false);
});

test('excess client addresses share a bounded overflow budget', () => {
  const limiter = new SlidingWindowRateLimiter({
    windowMs: 1000,
    maxRequests: 2,
    maxClients: 1,
  });

  assert.equal(limiter.check('known-client', 0).allowed, true);
  assert.equal(limiter.check('overflow-a', 0).allowed, true);
  assert.equal(limiter.check('overflow-b', 0).allowed, true);
  for (let index = 0; index < 1000; index += 1) {
    assert.equal(limiter.check(`overflow-${index}`, 0).allowed, false);
  }
  assert.equal(limiter.check('known-client', 0).allowed, true);
});

test('stale client buckets are evicted and overflow requests recover after expiry', () => {
  const limiter = new SlidingWindowRateLimiter({
    windowMs: 1000,
    maxRequests: 1,
    maxClients: 1,
  });

  assert.equal(limiter.check('stale-client', 0).allowed, true);
  assert.equal(limiter.check('overflow-old', 0).allowed, true);
  assert.equal(limiter.check('overflow-other', 999).allowed, false);

  // The stale slot becomes a dedicated bucket; overflow has its own new slot.
  assert.equal(limiter.check('new-client', 1000).allowed, true);
  assert.equal(limiter.check('overflow-new', 1000).allowed, true);
  assert.equal(limiter.check('new-client', 1000).allowed, false);
  assert.equal(limiter.check('overflow-another', 1000).allowed, false);
});

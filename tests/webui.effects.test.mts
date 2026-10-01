import assert from 'node:assert/strict';
import test from 'node:test';
import { createCancelableEffect } from '../lib/webui/cancelableEffect.ts';

type EffectState = {
  isCancelled: () => boolean;
  signal: AbortSignal;
};

await test('effect cleanup exposes cancellation and abort before invoking caller cleanup', () => {
  const started: EffectState[] = [];
  const cleaned: { cancelled: boolean; aborted: boolean }[] = [];
  const cleanup = createCancelableEffect((isCancelled, signal) => {
    started.push({ isCancelled, signal });
    assert.equal(isCancelled(), false);
    assert.equal(signal.aborted, false);
    return () => {
      cleaned.push({ cancelled: isCancelled(), aborted: signal.aborted });
    };
  });
  assert.equal(started.length, 1);
  const effect = started[0];
  assert.ok(effect);
  cleanup();
  assert.equal(effect.isCancelled(), true);
  assert.equal(effect.signal.aborted, true);
  assert.deepEqual(cleaned, [{ cancelled: true, aborted: true }]);
});

await test('separate effects keep their cancellation state independent', () => {
  const started: EffectState[] = [];
  const capture = (isCancelled: () => boolean, signal: AbortSignal) => {
    started.push({ isCancelled, signal });
  };
  const cleanupFirst = createCancelableEffect(capture);
  const cleanupSecond = createCancelableEffect(capture);
  const [first, second] = started;
  assert.ok(first && second);
  assert.notEqual(first.signal, second.signal);
  cleanupFirst();
  assert.equal(first.isCancelled(), true);
  assert.equal(first.signal.aborted, true);
  assert.equal(second.isCancelled(), false);
  assert.equal(second.signal.aborted, false);
  cleanupSecond();
  assert.equal(second.isCancelled(), true);
});

await test('a retried request discards stale completion from a cancelled effect', async () => {
  const stale = Promise.withResolvers<string>();
  const current = Promise.withResolvers<string>();
  const saved: string[] = [];
  const requests: Promise<void>[] = [];
  const cleanupStale = createCancelableEffect((isCancelled) => {
    requests.push(
      stale.promise.then((value) => {
        if (!isCancelled()) saved.push(value);
      }),
    );
  });
  cleanupStale();
  const cleanupCurrent = createCancelableEffect((isCancelled) => {
    requests.push(
      current.promise.then((value) => {
        if (!isCancelled()) saved.push(value);
      }),
    );
  });
  current.resolve('updated preferred times');
  stale.resolve('obsolete preferred times');
  await Promise.all(requests);
  assert.deepEqual(saved, ['updated preferred times']);
  cleanupCurrent();
});

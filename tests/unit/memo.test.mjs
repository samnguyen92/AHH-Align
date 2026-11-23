import { test } from 'node:test';
import assert from 'node:assert/strict';

const { memoizeAsync } = await import('../../src/lib/memo.ts');

function clock() {
  const c = { t: 0, now: () => c.t };
  return c;
}

test('a value is loaded once and reused until it expires', async () => {
  const c = clock();
  let loads = 0;
  const get = memoizeAsync(async () => ++loads, { ttlMs: 1000, now: c.now });
  assert.equal(await get(), 1);
  c.t = 999;
  assert.equal(await get(), 1);
  c.t = 1001;
  assert.equal(await get(), 2);
  assert.equal(loads, 2);
});

test('simultaneous callers share ONE load (no stampede on the database)', async () => {
  let loads = 0;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const get = memoizeAsync(async () => { loads++; await gate; return 'rows'; }, { ttlMs: 1000 });
  const calls = Array.from({ length: 24 }, () => get());
  release();
  assert.deepEqual(await Promise.all(calls), Array(24).fill('rows'));
  assert.equal(loads, 1);
});

test('different keys are cached separately', async () => {
  let loads = 0;
  const get = memoizeAsync(async (n) => { loads++; return n * 2; }, { ttlMs: 1000, key: (n) => String(n) });
  assert.deepEqual([await get(1), await get(2), await get(1), await get(2)], [2, 4, 2, 4]);
  assert.equal(loads, 2);
});

test('a failed load is not cached: the stale value is served, or the error reaches the caller', async () => {
  const c = clock();
  let fail = false;
  let loads = 0;
  const get = memoizeAsync(async () => { loads++; if (fail) throw new Error('db down'); return 'fresh'; }, { ttlMs: 1000, now: c.now });
  await assert.rejects(async () => { fail = true; await get(); }, /db down/);  // nothing to fall back on
  fail = false;
  assert.equal(await get(), 'fresh');
  c.t = 5000;
  fail = true;
  assert.equal(await get(), 'fresh');  // expired, load fails: the old value beats an error page
  fail = false;
  c.t = 5001;
  assert.equal(await get(), 'fresh');
  assert.equal(loads, 4);  // the failure was retried, never remembered
});

test('clear() forgets the values so the next call loads again', async () => {
  let loads = 0;
  const get = memoizeAsync(async () => ++loads, { ttlMs: 60000 });
  await get();
  get.clear();
  assert.equal(await get(), 2);
});

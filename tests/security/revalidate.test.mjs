import { test } from 'node:test';
import assert from 'node:assert/strict';

const { checkRevalidateRequest } = await import('../../src/lib/revalidate-guard.ts');
const SECRET = 'a-long-random-secret-for-tests-0123456789';

test('wrong or missing secret looks like a missing page', () => {
  assert.deepEqual(checkRevalidateRequest('', SECRET, ['/']), { ok: false, status: 404 });
  assert.deepEqual(checkRevalidateRequest('nope', SECRET, ['/']), { ok: false, status: 404 });
  assert.deepEqual(checkRevalidateRequest(SECRET + 'x', SECRET, ['/']), { ok: false, status: 404 });
});

test('right secret allows plain site paths', () => {
  assert.deepEqual(checkRevalidateRequest(SECRET, SECRET, ['/', '/clinics/anchor-dental']), {
    ok: true,
    paths: ['/', '/clinics/anchor-dental'],
  });
});

test('odd paths and oversized lists are refused', () => {
  for (const paths of [['//evil.com'], ['https://evil.com'], ['/a b'], ['/a/../b'], [], Array(11).fill('/'), 'x', [1], undefined]) {
    assert.deepEqual(checkRevalidateRequest(SECRET, SECRET, paths), { ok: false, status: 400 }, JSON.stringify(paths));
  }
});

test('the route is disabled when no (or a short) secret is configured', () => {
  assert.equal(checkRevalidateRequest('', '', ['/']).ok, false);
  assert.deepEqual(checkRevalidateRequest('short', 'short', ['/']), { ok: false, status: 404 });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNextPath } from '../../src/lib/safe-redirect.ts';

test('accepts same-site relative paths', () => {
  assert.equal(safeNextPath('/dashboard'), '/dashboard');
  assert.equal(safeNextPath('/admin/clinics?x=1#y'), '/admin/clinics?x=1#y');
});

test('rejects open-redirect shapes', () => {
  for (const bad of [
    '//evil.example',
    '//evil.example/path',
    '/\\evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    'dashboard',
    '/ok\nSet-Cookie: x=1',
    '',
    null,
    undefined,
  ]) {
    assert.equal(safeNextPath(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(safeNextPath('//evil.example', '/dashboard'), '/dashboard');
});

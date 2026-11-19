import { test } from 'node:test';
import assert from 'node:assert/strict';

const MODULE = '../../src/lib/auth/token.ts';
const ADMIN_UUID = '9246d47e-27b2-4617-bf9f-0f240855bb19';
const DEV_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';

// Load a fresh copy of the module (it reads env lazily, but keep tests isolated anyway).
async function load() {
  return import(`${MODULE}?t=${Math.random()}`);
}

function withEnv(env, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const DEV = { NODE_ENV: 'development', AUTH_SECRET: undefined, JWT_SECRET: undefined };

test('N-01: a bare user UUID is NOT a valid session token', async () => {
  const { verifySessionToken } = await load();
  withEnv(DEV, () => {
    assert.equal(verifySessionToken(ADMIN_UUID), null);
    assert.equal(verifySessionToken(ADMIN_UUID.toUpperCase()), null);
  });
});

test('garbage, empty and malformed tokens are rejected', async () => {
  const { verifySessionToken } = await load();
  withEnv(DEV, () => {
    for (const bad of ['', 'abc', 'a.b.c', '.', 'x.', '.y', null, undefined]) {
      assert.equal(verifySessionToken(bad), null, `should reject ${JSON.stringify(bad)}`);
    }
  });
});

test('a correctly signed token round-trips', async () => {
  const { createSessionToken, verifySessionToken } = await load();
  withEnv(DEV, () => {
    const token = createSessionToken({ id: ADMIN_UUID, email: 'a@b.co', role: 'provider' });
    assert.equal(verifySessionToken(token)?.userId, ADMIN_UUID);
  });
});

test('a tampered payload is rejected', async () => {
  const { createSessionToken, verifySessionToken } = await load();
  withEnv(DEV, () => {
    const token = createSessionToken({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    const [, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ userId: ADMIN_UUID, exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    assert.equal(verifySessionToken(`${forged}.${sig}`), null);
  });
});

test('N-03: a token signed with the old public default secret is rejected', async () => {
  const crypto = await import('node:crypto');
  const { verifySessionToken } = await load();
  withEnv({ NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(40) }, () => {
    const payload = Buffer.from(
      JSON.stringify({ userId: ADMIN_UUID, exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    const sig = crypto
      .createHmac('sha256', 'ahh_super_secret_auth_key_2026_self_hosted')
      .update(payload)
      .digest('base64url');
    assert.equal(verifySessionToken(`${payload}.${sig}`), null);
  });
});

test('expired tokens and tokens without exp are rejected', async () => {
  const crypto = await import('node:crypto');
  const { verifySessionToken } = await load();
  withEnv(DEV, () => {
    const make = (obj) => {
      const p = Buffer.from(JSON.stringify(obj)).toString('base64url');
      return `${p}.${crypto.createHmac('sha256', DEV_SECRET).update(p).digest('base64url')}`;
    };
    assert.equal(verifySessionToken(make({ userId: ADMIN_UUID, exp: 1 })), null);
    assert.equal(verifySessionToken(make({ userId: ADMIN_UUID })), null);
  });
});

test('N-03: production refuses to sign without a strong AUTH_SECRET', async () => {
  const { createSessionToken, verifySessionToken } = await load();
  withEnv({ NODE_ENV: 'production', AUTH_SECRET: undefined, JWT_SECRET: undefined }, () => {
    assert.throws(() => createSessionToken({ id: ADMIN_UUID }), /AUTH_SECRET/);
    // verification fails closed instead of falling back to a weak secret
    assert.equal(verifySessionToken(ADMIN_UUID), null);
  });
  withEnv({ NODE_ENV: 'production', AUTH_SECRET: 'short' }, () => {
    assert.throws(() => createSessionToken({ id: ADMIN_UUID }), /AUTH_SECRET/);
  });
  withEnv({ NODE_ENV: 'production', AUTH_SECRET: 'y'.repeat(32) }, () => {
    assert.ok(createSessionToken({ id: ADMIN_UUID }));
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('pg');

// No database is needed: intercept the query call and inspect the SQL that would be sent.
const calls = [];
pg.Pool.prototype.query = async function (sql, params) {
  calls.push({ sql: String(sql), params });
  return { rows: [{ total: '0' }] };
};

const { PgQueryBuilder, createPostgresClient } = await import('../../src/lib/db/postgres.ts');
const last = () => calls[calls.length - 1];

test('N-04: injection payload in a search term never reaches the SQL text', async () => {
  const evil = 'a%,id" IS NOT NULL OR "1"="1.eq.1';
  const clauses = [`name.ilike.%${evil}%`, `specialty.ilike.%${evil}%`];
  await new PgQueryBuilder('clinics').select('*').neq('status', 'draft').or(clauses.join(',')).execute();
  const { sql, params } = last();
  assert.doesNotMatch(sql, /IS NOT NULL OR/);
  assert.doesNotMatch(sql, /"1"/);
  assert.match(sql, /"name" ILIKE \$\d+/);
  // The malicious fragment is dropped entirely; only the legitimate clause survives, as a bound parameter.
  assert.ok(params.includes('%a%'));
  assert.ok(!params.some((p) => /IS NOT NULL/.test(String(p))));
});

test('N-04: or() drops clauses whose column is not a plain identifier', async () => {
  await new PgQueryBuilder('clinics').select('*').or('x" OR 1=1 --.eq.1').execute();
  assert.doesNotMatch(last().sql, /OR 1=1/);
  assert.doesNotMatch(last().sql, /WHERE/);
});

test('or() keeps legitimate search clauses incl. JSON paths', async () => {
  await new PgQueryBuilder('clinics')
    .select('*')
    .or('name.ilike.%dr%,metadata->>search_text.ilike.%vietnamese%,city.eq.Houston')
    .execute();
  const { sql, params } = last();
  assert.match(sql, /\("name" ILIKE \$1 OR \("metadata"->>'search_text'\) ILIKE \$2 OR "city" = \$3\)/);
  assert.deepEqual(params, ['%dr%', '%vietnamese%', 'Houston']);
});

test('a value containing ".ilike." is not re-split into another column', async () => {
  await new PgQueryBuilder('clinics').select('*').or('name.ilike.%a.ilike.b%').execute();
  assert.deepEqual(last().params, ['%a.ilike.b%']);
});

test('unsafe column names are rejected in filters, ordering and JSON paths', () => {
  const b = () => new PgQueryBuilder('clinics');
  assert.throws(() => b().eq('id"; DROP TABLE clinics;--', 1), /Invalid SQL column/);
  assert.throws(() => b().order('name DESC, (select 1)'), /Invalid SQL column/);
  assert.throws(() => b().eq("metadata->>x'||(select 1)||'", 1), /Invalid JSON key/);
});

test('unsafe table names are rejected', () => {
  assert.throws(() => new PgQueryBuilder('clinics; DROP TABLE users'), /Invalid SQL table name/);
});

test('M-01: UPDATE and DELETE without a WHERE condition are refused', async () => {
  const before = calls.length;
  const upd = await new PgQueryBuilder('clinics').update({ name: 'x' }).execute();
  const del = await new PgQueryBuilder('clinics').delete().execute();
  assert.ok(upd.error && /WHERE/.test(upd.error.message));
  assert.ok(del.error && /WHERE/.test(del.error.message));
  assert.equal(calls.length, before, 'no SQL may be sent');
});

test('UPDATE/DELETE with a condition still work', async () => {
  await new PgQueryBuilder('clinics').update({ name: 'x' }).eq('id', 'abc').execute();
  assert.match(last().sql, /^UPDATE "clinics" SET "name" = \$1 WHERE "id" = \$2/);
  await new PgQueryBuilder('clinics').delete().eq('id', 'abc').execute();
  assert.match(last().sql, /^DELETE FROM "clinics" WHERE "id" = \$1/);
});

test('unsafe column names in insert/update payloads are rejected', async () => {
  const r1 = await new PgQueryBuilder('clinics').insert({ 'name"; DROP': 1 }).execute();
  const r2 = await new PgQueryBuilder('clinics').update({ 'a" = 1, "b': 1 }).eq('id', 1).execute();
  assert.ok(r1.error && r2.error);
});

test('rpc() rejects unsafe function and argument names', async () => {
  const client = createPostgresClient();
  const a = await client.rpc('match_clinic_embeddings(); DROP TABLE x', {});
  const b = await client.rpc('match_clinic_embeddings', { 'q" := 1; --': 1 });
  assert.ok(a.error && b.error);
});

// ---- .select() after a write must not turn the write into a SELECT ----------------------------
// Regression: `.update(...).eq(...).select(...)` used to send a plain SELECT, so edits, newsletter
// sign-ups, claim submissions and status changes returned data but were never saved.

test('update().eq().select().single() sends an UPDATE ... RETURNING, not a SELECT', async () => {
  await new PgQueryBuilder('clinics').update({ status: 'published' }).eq('id', 'abc').select('id,slug,status').maybeSingle().execute();
  assert.match(last().sql, /^UPDATE "clinics" SET "status" = \$1 WHERE "id" = \$2 RETURNING "id", "slug", "status"/);
});

test('insert().select().single() sends an INSERT ... RETURNING', async () => {
  await new PgQueryBuilder('newsletter_subscriptions').insert({ email: 'a@b.co' }).select('id').single().execute();
  assert.match(last().sql, /^INSERT INTO "newsletter_subscriptions" \("email"\) VALUES \(\$1\)\s+RETURNING "id"/);
});

test('upsert().select() and delete().select() stay writes', async () => {
  await new PgQueryBuilder('clinics').upsert({ id: '1', name: 'x' }).select('*').execute();
  assert.match(last().sql, /^INSERT INTO "clinics"/);
  await new PgQueryBuilder('clinics').delete().eq('id', 'x').select('id').execute();
  assert.match(last().sql, /^DELETE FROM "clinics" WHERE "id" = \$1 RETURNING "id"/);
});

test('select() before any write is still a SELECT', async () => {
  await new PgQueryBuilder('clinics').select('id, name').eq('id', 'x').execute();
  assert.match(last().sql, /^SELECT id, name FROM "clinics" WHERE "id" = \$1/);
});

test('an unsupported RETURNING column list falls back to * instead of injecting SQL', async () => {
  await new PgQueryBuilder('clinics').update({ name: 'x' }).eq('id', '1').select('id; DROP TABLE clinics').execute();
  assert.match(last().sql, /RETURNING \*$/);
});

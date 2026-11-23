/**
 * postgres.ts — PostgreSQL Connection Pool & Query Adapter for Asian Health Hub.
 * Provides a drop-in replacement for the Supabase PostgREST client using `pg` (node-postgres),
 * connecting to the local/VPS PostgreSQL 16 container.
 */

import { Pool } from 'pg';

let pool: Pool | null = null;
let schemaEnsured = false;

function ensureSchema(p: Pool) {
  if (schemaEnsured) return;
  schemaEnsured = true;
  p.query(`
    ALTER TABLE clinics ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
    UPDATE clinics SET status = 'published' WHERE status IS NULL;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS public.user_invites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'provider', 'admin', 'superadmin')),
      token_hash TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS public.audit_log (
      id BIGSERIAL PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      target_label TEXT,
      details JSONB NOT NULL DEFAULT '{}'::JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch((err) => {
    console.warn('[db] Schema ensure notice:', err.message);
  });
}

export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  // If in container, 'db:5432'. If on local host, 'localhost:5433'
  return 'postgresql://postgres:ahh_secure_pass_2026@127.0.0.1:5433/asian_health_hub';
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    });
    pool.on('error', (err) => {
      console.error('[pg] Unexpected idle client error:', err);
    });
    ensureSchema(pool);
  }
  return pool;
}

export interface QueryResponse<T = any> {
  data: T | null;
  error: Error | null;
  count: number | null;
}

// SQL identifiers (table/column/function names) cannot be sent as bound
// parameters, so they are interpolated into the query text. Anything that is not a
// plain identifier is rejected, which prevents SQL injection through names.
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const JSON_KEY_RE = /^[A-Za-z0-9_]+$/;
const COLUMN_LIST_RE = /^\s*[A-Za-z_][A-Za-z0-9_]*(\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*\s*$/;
const FUNCTION_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

function assertIdent(name: string, kind = 'identifier'): string {
  const trimmed = String(name ?? '').trim();
  if (!IDENT_RE.test(trimmed)) {
    throw new Error(`[db] Invalid SQL ${kind}: ${JSON.stringify(trimmed).slice(0, 80)}`);
  }
  return trimmed;
}

function assertJsonKey(key: string): string {
  const trimmed = String(key ?? '').trim();
  if (!JSON_KEY_RE.test(trimmed)) {
    throw new Error(`[db] Invalid JSON key: ${JSON.stringify(trimmed).slice(0, 80)}`);
  }
  return trimmed;
}

/** Returns true when `col` is a column reference this builder is willing to emit. */
function isSafeColumnRef(col: string): boolean {
  try {
    formatColumnRef(col);
    return true;
  } catch {
    return false;
  }
}

function formatColumnRef(col: string): string {
  if (col.includes('->>')) {
    const [left, right] = col.split('->>');
    return `("${assertIdent(left, 'column')}"->>'${assertJsonKey(right)}')`;
  }
  if (col.includes('->')) {
    const [left, right] = col.split('->');
    return `("${assertIdent(left, 'column')}"->'${assertJsonKey(right)}')`;
  }
  return `"${assertIdent(col, 'column')}"`;
}

export class PgQueryBuilder<T = any> implements PromiseLike<QueryResponse<T>> {
  private tableName: string;
  private action: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private selectCols: string = '*';
  private returningCols: string = '*';
  private countMode: 'exact' | null = null;
  private whereClauses: string[] = [];
  private params: any[] = [];
  private orderByClauses: string[] = [];
  private limitCount: number | null = null;
  private offsetCount: number | null = null;
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;
  private payload: any = null;
  private upsertTarget: string | null = null;

  constructor(tableName: string) {
    this.tableName = assertIdent(tableName, 'table name');
  }

  /**
   * `.select()` has two meanings, as in the Supabase client this adapter replaces:
   *   - on its own it starts a SELECT query;
   *   - AFTER insert/upsert/update/delete it only says which columns to return from that write
   *     (`.update(...).eq(...).select('id').single()`). It must NOT turn the write into a SELECT,
   *     otherwise the row is never written while the caller still receives data back.
   */
  select(columns: string = '*', options?: { count?: 'exact' }): this {
    if (this.action !== 'select') {
      this.returningCols = columns || '*';
      return this;
    }
    this.action = 'select';
    this.selectCols = columns || '*';
    if (options?.count === 'exact') {
      this.countMode = 'exact';
    }
    return this;
  }

  /** Columns for `RETURNING`: the requested plain column list, otherwise every column. */
  private returningSql(): string {
    const cols = this.returningCols.trim();
    if (cols === '*' || !COLUMN_LIST_RE.test(cols)) return '*';
    return cols
      .split(',')
      .map((c) => `"${assertIdent(c, 'column')}"`)
      .join(', ');
  }

  eq(col: string, val: any): this {
    this.params.push(val);
    this.whereClauses.push(`${formatColumnRef(col)} = $${this.params.length}`);
    return this;
  }

  neq(col: string, val: any): this {
    this.params.push(val);
    const colRef = formatColumnRef(col);
    this.whereClauses.push(`(${colRef} IS NULL OR ${colRef} != $${this.params.length})`);
    return this;
  }

  in(col: string, vals: any[]): this {
    if (!vals || vals.length === 0) {
      this.whereClauses.push('1 = 0');
      return this;
    }
    const placeholders = vals.map((v) => {
      this.params.push(v);
      return `$${this.params.length}`;
    });
    this.whereClauses.push(`${formatColumnRef(col)} IN (${placeholders.join(', ')})`);
    return this;
  }

  contains(col: string, val: any): this {
    this.params.push(val);
    this.whereClauses.push(`${formatColumnRef(col)} @> $${this.params.length}`);
    return this;
  }

  overlaps(col: string, val: any): this {
    this.params.push(val);
    this.whereClauses.push(`${formatColumnRef(col)} && $${this.params.length}`);
    return this;
  }

  ilike(col: string, pattern: string): this {
    this.params.push(pattern);
    this.whereClauses.push(`${formatColumnRef(col)} ILIKE $${this.params.length}`);
    return this;
  }

  gte(col: string, val: any): this {
    this.params.push(val);
    this.whereClauses.push(`${formatColumnRef(col)} >= $${this.params.length}`);
    return this;
  }

  lte(col: string, val: any): this {
    this.params.push(val);
    this.whereClauses.push(`${formatColumnRef(col)} <= $${this.params.length}`);
    return this;
  }

  gt(col: string, val: any): this {
    this.params.push(val);
    this.whereClauses.push(`${formatColumnRef(col)} > $${this.params.length}`);
    return this;
  }

  lt(col: string, val: any): this {
    this.params.push(val);
    this.whereClauses.push(`${formatColumnRef(col)} < $${this.params.length}`);
    return this;
  }

  not(col: string, operator: string, val: any): this {
    if (operator.toLowerCase() === 'is' && val === null) {
      this.whereClauses.push(`${formatColumnRef(col)} IS NOT NULL`);
    } else {
      this.params.push(val);
      this.whereClauses.push(`NOT (${formatColumnRef(col)} = $${this.params.length})`);
    }
    return this;
  }

  or(filterStr: string): this {
    if (!filterStr) return this;
    const orParts: string[] = [];

    for (const part of filterStr.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Split at the earliest operator so a value that happens to contain
      // ".ilike." / ".eq." cannot be re-interpreted as another column.
      const ilikeAt = trimmed.indexOf('.ilike.');
      const eqAt = trimmed.indexOf('.eq.');
      let opAt = -1;
      let op: 'ilike' | 'eq' | null = null;
      if (ilikeAt !== -1 && (eqAt === -1 || ilikeAt < eqAt)) {
        opAt = ilikeAt;
        op = 'ilike';
      } else if (eqAt !== -1) {
        opAt = eqAt;
        op = 'eq';
      }
      if (!op) continue;

      const rawCol = trimmed.slice(0, opAt);
      const rawVal = trimmed.slice(opAt + op.length + 2);

      // Anything that is not a plain column reference is dropped, never interpolated.
      if (!isSafeColumnRef(rawCol)) continue;

      this.params.push(rawVal);
      const sqlOp = op === 'ilike' ? 'ILIKE' : '=';
      orParts.push(`${formatColumnRef(rawCol)} ${sqlOp} $${this.params.length}`);
    }

    if (orParts.length > 0) {
      this.whereClauses.push(`(${orParts.join(' OR ')})`);
    }
    return this;
  }

  order(col: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    const dir = options?.ascending ? 'ASC' : 'DESC';
    const nulls = options?.nullsFirst ? 'NULLS FIRST' : 'NULLS LAST';
    this.orderByClauses.push(`${formatColumnRef(col)} ${dir} ${nulls}`);
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetCount = from;
    this.limitCount = Math.max(0, to - from + 1);
    return this;
  }

  single(): this {
    this.isSingle = true;
    this.limitCount = 1;
    return this;
  }

  maybeSingle(): this {
    this.isMaybeSingle = true;
    this.limitCount = 1;
    return this;
  }

  insert(data: any): this {
    this.action = 'insert';
    this.payload = Array.isArray(data) ? data : [data];
    return this;
  }

  upsert(data: any, options?: { onConflict?: string }): this {
    this.action = 'upsert';
    this.payload = Array.isArray(data) ? data : [data];
    this.upsertTarget = options?.onConflict || null;
    return this;
  }

  update(data: any): this {
    this.action = 'update';
    this.payload = data;
    return this;
  }

  delete(): this {
    this.action = 'delete';
    return this;
  }

  async execute(): Promise<QueryResponse<T>> {
    const client = getPool();
    const whereSql = this.whereClauses.length > 0 ? `WHERE ${this.whereClauses.join(' AND ')}` : '';

    try {
      let totalCount: number | null = null;

      if (this.action === 'select') {
        if (this.countMode === 'exact') {
          const countQuery = `SELECT COUNT(*) AS total FROM "${this.tableName}" ${whereSql}`;
          const countRes = await client.query(countQuery, this.params);
          totalCount = parseInt(countRes.rows[0]?.total || '0', 10);
        }

        const colsSql = this.selectCols === '*' ? '*' : this.selectCols;
        const orderSql = this.orderByClauses.length > 0 ? `ORDER BY ${this.orderByClauses.join(', ')}` : '';
        const limitSql = this.limitCount !== null ? `LIMIT ${this.limitCount}` : '';
        const offsetSql = this.offsetCount !== null ? `OFFSET ${this.offsetCount}` : '';

        const sql = `SELECT ${colsSql} FROM "${this.tableName}" ${whereSql} ${orderSql} ${limitSql} ${offsetSql}`.trim();
        const res = await client.query(sql, this.params);

        if (this.isSingle) {
          if (res.rows.length === 0) {
            return { data: null, error: new Error('No rows found'), count: totalCount };
          }
          return { data: res.rows[0] as T, error: null, count: totalCount };
        }

        if (this.isMaybeSingle) {
          return { data: (res.rows[0] as T) || null, error: null, count: totalCount };
        }

        return { data: res.rows as unknown as T, error: null, count: totalCount !== null ? totalCount : res.rows.length };
      }

      if (this.action === 'insert' || this.action === 'upsert') {
        if (!this.payload || this.payload.length === 0) {
          return { data: [] as unknown as T, error: null, count: 0 };
        }

        const cols = Object.keys(this.payload[0]).map((c) => assertIdent(c, 'column'));
        const colsSql = cols.map((c) => `"${c}"`).join(', ');
        const insertedRows: any[] = [];

        for (const row of this.payload) {
          const rowParams: any[] = [];
          const placeholders = cols.map((c) => {
            rowParams.push(row[c]);
            return `$${rowParams.length}`;
          });

          let conflictSql = '';
          if (this.action === 'upsert') {
            const conflictTarget = this.upsertTarget ? `("${assertIdent(this.upsertTarget, 'column')}")` : '("id")';
            const updateCols = cols
              .filter((c) => c !== 'id' && c !== 'created_at' && c !== this.upsertTarget)
              .map((c) => `"${c}" = EXCLUDED."${c}"`);
            if (updateCols.length > 0) {
              conflictSql = `ON CONFLICT ${conflictTarget} DO UPDATE SET ${updateCols.join(', ')}`;
            } else {
              conflictSql = `ON CONFLICT ${conflictTarget} DO NOTHING`;
            }
          }

          const insertSql = `INSERT INTO "${this.tableName}" (${colsSql}) VALUES (${placeholders.join(', ')}) ${conflictSql} RETURNING ${this.returningSql()}`;
          const res = await client.query(insertSql, rowParams);
          if (res.rows[0]) {
            insertedRows.push(res.rows[0]);
          }
        }

        const returnData = this.isSingle || this.isMaybeSingle ? insertedRows[0] || null : insertedRows;
        return { data: returnData as unknown as T, error: null, count: insertedRows.length };
      }

      if (this.action === 'update') {
        if (this.whereClauses.length === 0) {
          throw new Error(`[db] Refusing to UPDATE "${this.tableName}" without a WHERE condition.`);
        }
        const setCols = Object.keys(this.payload).map((c) => assertIdent(c, 'column'));
        if (setCols.length === 0) {
          return { data: [] as unknown as T, error: null, count: 0 };
        }

        const setParams: any[] = [];
        const setClauses = setCols.map((c) => {
          setParams.push(this.payload[c]);
          return `"${c}" = $${setParams.length}`;
        });

        // Offset the where params indexes
        const offsetIdx = setParams.length;
        const adjustedWhere = this.whereClauses.map((clause) =>
          clause.replace(/\$(\d+)/g, (_, num) => `$${parseInt(num, 10) + offsetIdx}`)
        );
        const whereSqlAdjusted = adjustedWhere.length > 0 ? `WHERE ${adjustedWhere.join(' AND ')}` : '';
        const allParams = [...setParams, ...this.params];

        const updateSql = `UPDATE "${this.tableName}" SET ${setClauses.join(', ')} ${whereSqlAdjusted} RETURNING ${this.returningSql()}`;
        const res = await client.query(updateSql, allParams);
        const returnData = this.isSingle || this.isMaybeSingle ? res.rows[0] || null : res.rows;
        return { data: returnData as unknown as T, error: null, count: res.rows.length };
      }

      if (this.action === 'delete') {
        if (this.whereClauses.length === 0) {
          throw new Error(`[db] Refusing to DELETE from "${this.tableName}" without a WHERE condition.`);
        }
        const deleteSql = `DELETE FROM "${this.tableName}" ${whereSql} RETURNING ${this.returningSql()}`;
        const res = await client.query(deleteSql, this.params);
        return { data: res.rows as unknown as T, error: null, count: res.rows.length };
      }

      return { data: null, error: null, count: 0 };
    } catch (err: any) {
      console.error(`[pg] Error executing ${this.action} on ${this.tableName}:`, err);
      return { data: null, error: err, count: 0 };
    }
  }

  then<TResult1 = QueryResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export function createPostgresClient() {
  return {
    from(table: string) {
      return new PgQueryBuilder(table);
    },
    async rpc(fnName: string, args?: Record<string, any>) {
      if (!FUNCTION_RE.test(fnName)) {
        return { data: null, error: new Error(`[db] Invalid function name: ${JSON.stringify(fnName).slice(0, 80)}`) };
      }
      for (const key of Object.keys(args ?? {})) {
        if (!IDENT_RE.test(key)) {
          return { data: null, error: new Error(`[db] Invalid argument name: ${JSON.stringify(key).slice(0, 80)}`) };
        }
      }
      const client = getPool();
      if (!args || Object.keys(args).length === 0) {
        try {
          const res = await client.query(`SELECT * FROM ${fnName}()`);
          return { data: res.rows, error: null };
        } catch (err: any) {
          return { data: null, error: err };
        }
      }

      const entries = Object.entries(args);
      const params = entries.map(([, val]) =>
        Array.isArray(val) && typeof val[0] === 'number' ? `[${val.join(',')}]` : val
      );
      const namedArgs = entries.map(([key], i) => `"${key}" := $${i + 1}`).join(', ');

      try {
        const res = await client.query(`SELECT * FROM ${fnName}(${namedArgs})`, params);
        return { data: res.rows, error: null };
      } catch {
        try {
          const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
          const res = await client.query(`SELECT * FROM ${fnName}(${placeholders})`, params);
          return { data: res.rows, error: null };
        } catch (err: any) {
          return { data: null, error: err };
        }
      }
    },
    auth: {
      // Sign-in lives in /api/auth/login (bcrypt + signed session token). The old getUser()/signInWithPassword()
      // stubs treated a user id as a token and ignored the password; they were unused and are removed.
      async getSession() {
        return { data: { session: null }, error: null };
      },
      async signOut() {
        return { error: null };
      },
      admin: {
        async listUsers({ page = 1, perPage = 100 }: { page?: number; perPage?: number } = {}) {
          try {
            const client = getPool();
            const offset = (page - 1) * perPage;
            const res = await client.query('SELECT * FROM auth.users ORDER BY created_at DESC LIMIT $1 OFFSET $2', [perPage, offset]);
            const users = res.rows.map((u: any) => ({
              id: u.id,
              email: u.email,
              user_metadata: u.raw_user_meta_data || {},
              app_metadata: u.raw_app_meta_data || {},
              created_at: u.created_at,
              last_sign_in_at: u.last_sign_in_at,
              disabled_at: u.disabled_at ?? null,
            }));
            return { data: { users }, error: null };
          } catch (err: any) {
            return { data: { users: [] }, error: err };
          }
        },
      },
    },
  };
}


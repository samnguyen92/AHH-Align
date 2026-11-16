/**
 * postgres.ts — PostgreSQL Connection Pool & Query Adapter for Asian Health Hub.
 * Provides a drop-in replacement for the Supabase PostgREST client using `pg` (node-postgres),
 * connecting to the local/VPS PostgreSQL 16 container.
 */

import { Pool } from 'pg';

let pool: Pool | null = null;

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
      connectionTimeoutMillis: 5000,
    });
    pool.on('error', (err) => {
      console.error('[pg] Unexpected idle client error:', err);
    });
  }
  return pool;
}

export interface QueryResponse<T = any> {
  data: T | null;
  error: Error | null;
  count: number | null;
}

function formatColumnRef(col: string): string {
  if (col.includes('->>')) {
    const [left, right] = col.split('->>');
    return `("${left.trim()}"->>'${right.trim()}')`;
  }
  if (col.includes('->')) {
    const [left, right] = col.split('->');
    return `("${left.trim()}"->'${right.trim()}')`;
  }
  return `"${col.trim()}"`;
}

export class PgQueryBuilder<T = any> implements PromiseLike<QueryResponse<T>> {
  private tableName: string;
  private action: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private selectCols: string = '*';
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
    this.tableName = tableName;
  }

  select(columns: string = '*', options?: { count?: 'exact' }): this {
    this.action = 'select';
    this.selectCols = columns || '*';
    if (options?.count === 'exact') {
      this.countMode = 'exact';
    }
    return this;
  }

  eq(col: string, val: any): this {
    this.params.push(val);
    this.whereClauses.push(`${formatColumnRef(col)} = $${this.params.length}`);
    return this;
  }

  neq(col: string, val: any): this {
    this.params.push(val);
    this.whereClauses.push(`${formatColumnRef(col)} != $${this.params.length}`);
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
    const parts = filterStr.split(',');
    const orParts: string[] = [];

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (trimmed.includes('.ilike.')) {
        const [rawCol, rawPat] = trimmed.split('.ilike.');
        const pattern = rawPat.replace(/^%/, '%').replace(/%$/, '%');
        this.params.push(pattern);
        orParts.push(`${formatColumnRef(rawCol)} ILIKE $${this.params.length}`);
      } else if (trimmed.includes('.eq.')) {
        const [rawCol, rawVal] = trimmed.split('.eq.');
        this.params.push(rawVal);
        orParts.push(`${formatColumnRef(rawCol)} = $${this.params.length}`);
      }
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

        const cols = Object.keys(this.payload[0]);
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
            const conflictTarget = this.upsertTarget ? `("${this.upsertTarget}")` : '("id")';
            const updateCols = cols
              .filter((c) => c !== 'id' && c !== 'created_at' && c !== this.upsertTarget)
              .map((c) => `"${c}" = EXCLUDED."${c}"`);
            if (updateCols.length > 0) {
              conflictSql = `ON CONFLICT ${conflictTarget} DO UPDATE SET ${updateCols.join(', ')}`;
            } else {
              conflictSql = `ON CONFLICT ${conflictTarget} DO NOTHING`;
            }
          }

          const insertSql = `INSERT INTO "${this.tableName}" (${colsSql}) VALUES (${placeholders.join(', ')}) ${conflictSql} RETURNING *`;
          const res = await client.query(insertSql, rowParams);
          if (res.rows[0]) {
            insertedRows.push(res.rows[0]);
          }
        }

        const returnData = this.isSingle || this.isMaybeSingle ? insertedRows[0] || null : insertedRows;
        return { data: returnData as unknown as T, error: null, count: insertedRows.length };
      }

      if (this.action === 'update') {
        const setCols = Object.keys(this.payload);
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

        const updateSql = `UPDATE "${this.tableName}" SET ${setClauses.join(', ')} ${whereSqlAdjusted} RETURNING *`;
        const res = await client.query(updateSql, allParams);
        const returnData = this.isSingle || this.isMaybeSingle ? res.rows[0] || null : res.rows;
        return { data: returnData as unknown as T, error: null, count: res.rows.length };
      }

      if (this.action === 'delete') {
        const deleteSql = `DELETE FROM "${this.tableName}" ${whereSql} RETURNING *`;
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
      async getUser(token?: string | null) {
        if (!token) return { data: { user: null }, error: new Error('No token') };
        try {
          // Parse token format: 'user_id' or standard base64 session token
          let userId = token;
          if (token.startsWith('user_')) {
            userId = token.replace('user_', '');
          }
          const client = getPool();
          const res = await client.query('SELECT * FROM auth.users WHERE id = $1', [userId]);
          if (res.rows[0]) {
            const row = res.rows[0];
            return {
              data: {
                user: {
                  id: row.id,
                  email: row.email,
                  user_metadata: row.raw_user_meta_data || {},
                },
              },
              error: null,
            };
          }
        } catch {
          // ignore
        }
        return { data: { user: null }, error: new Error('Invalid token') };
      },
      async getSession() {
        return { data: { session: null }, error: null };
      },
      async signInWithPassword({ email }: { email: string; password?: string }) {
        try {
          const client = getPool();
          const res = await client.query('SELECT * FROM auth.users WHERE email = $1', [email]);
          if (res.rows[0]) {
            const user = res.rows[0];
            return {
              data: {
                user: {
                  id: user.id,
                  email: user.email,
                  user_metadata: user.raw_user_meta_data || {},
                },
                session: {
                  access_token: user.id,
                },
              },
              error: null,
            };
          }
          return { data: { user: null, session: null }, error: new Error('User not found') };
        } catch (err: any) {
          return { data: { user: null, session: null }, error: err };
        }
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


"""
pg_client.py — Drop-in PostgreSQL Query Builder & Client for OpenClaw.
Replaces `supabase-py` with direct PostgreSQL connection via `psycopg2`.
Provides the same `.table(name).select(...).eq(...).execute()` API syntax
returning an object with `.data` and `.count`.
"""

import json
import os
import psycopg2
import psycopg2.extras
from psycopg2.extras import RealDictCursor, Json


def get_connection_string() -> str:
    # In Docker container: db:5432. On local host: localhost:5433 or localhost:5432
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    # Try localhost:5433 first, fallback to db:5432
    return "postgresql://postgres:ahh_secure_pass_2026@localhost:5433/asian_health_hub"


class QueryResult:
    def __init__(self, data=None, count=None):
        self.data = data if data is not None else []
        self.count = count


class TableQueryBuilder:
    def __init__(self, conn, table_name: str):
        self.conn = conn
        self.table_name = table_name
        self._action = "select"  # select, insert, upsert, update, delete
        self._select_cols = "*"
        self._count_mode = None  # None or "exact"
        self._where_clauses = []
        self._where_params = []
        self._order_by = []
        self._limit = None
        self._offset = None
        self._payload = None
        self._upsert_conflict = None
        self._single = False

    def select(self, columns: str = "*", count: str = None):
        self._action = "select"
        self._select_cols = columns or "*"
        if count == "exact":
            self._count_mode = "exact"
        return self

    def eq(self, col: str, val):
        self._where_clauses.append(f'"{col}" = %s')
        self._where_params.append(val)
        return self

    def neq(self, col: str, val):
        self._where_clauses.append(f'"{col}" != %s')
        self._where_params.append(val)
        return self

    def in_(self, col: str, vals: list):
        if not vals:
            self._where_clauses.append("1=0")
            return self
        placeholders = ", ".join(["%s"] * len(vals))
        self._where_clauses.append(f'"{col}" IN ({placeholders})')
        self._where_params.extend(vals)
        return self

    def ilike(self, col: str, pattern: str):
        self._where_clauses.append(f'"{col}" ILIKE %s')
        self._where_params.append(pattern)
        return self

    def gte(self, col: str, val):
        self._where_clauses.append(f'"{col}" >= %s')
        self._where_params.append(val)
        return self

    def lte(self, col: str, val):
        self._where_clauses.append(f'"{col}" <= %s')
        self._where_params.append(val)
        return self

    def gt(self, col: str, val):
        self._where_clauses.append(f'"{col}" > %s')
        self._where_params.append(val)
        return self

    def lt(self, col: str, val):
        self._where_clauses.append(f'"{col}" < %s')
        self._where_params.append(val)
        return self

    def not_(self, col: str, op: str, val):
        if op.lower() == "is" and val is None:
            self._where_clauses.append(f'"{col}" IS NOT NULL')
        else:
            self._where_clauses.append(f'NOT ("{col}" = %s)')
            self._where_params.append(val)
        return self

    def order(self, col: str, desc: bool = False, nulls_first: bool = False):
        direction = "DESC" if desc else "ASC"
        nulls = "NULLS FIRST" if nulls_first else "NULLS LAST"
        self._order_by.append(f'"{col}" {direction} {nulls}')
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def range(self, from_idx: int, to_idx: int):
        self._offset = from_idx
        self._limit = max(0, to_idx - from_idx + 1)
        return self

    def single(self):
        self._single = True
        self._limit = 1
        return self

    def maybeSingle(self):
        self._single = True
        self._limit = 1
        return self

    def insert(self, data):
        self._action = "insert"
        self._payload = data if isinstance(data, list) else [data]
        return self

    def upsert(self, data, on_conflict: str = None):
        self._action = "upsert"
        self._payload = data if isinstance(data, list) else [data]
        self._upsert_conflict = on_conflict
        return self

    def update(self, data: dict):
        self._action = "update"
        self._payload = data
        return self

    def delete(self):
        self._action = "delete"
        return self

    def _prepare_val(self, val):
        if isinstance(val, (dict, list)):
            return Json(val)
        return val

    def execute(self) -> QueryResult:
        cur = self.conn.cursor(cursor_factory=RealDictCursor)
        where_sql = ("WHERE " + " AND ".join(self._where_clauses)) if self._where_clauses else ""

        try:
            total_count = None

            if self._action == "select":
                if self._count_mode == "exact":
                    count_query = f'SELECT COUNT(*) FROM "{self.table_name}" {where_sql}'
                    cur.execute(count_query, self._where_params)
                    total_count = cur.fetchone()["count"]

                cols = self._select_cols
                if cols == "*" or not cols:
                    cols_sql = "*"
                elif cols == "id":
                    cols_sql = '"id"'
                else:
                    cols_sql = cols

                order_sql = ("ORDER BY " + ", ".join(self._order_by)) if self._order_by else ""
                limit_sql = f"LIMIT {self._limit}" if self._limit is not None else ""
                offset_sql = f"OFFSET {self._offset}" if self._offset is not None else ""

                query = f'SELECT {cols_sql} FROM "{self.table_name}" {where_sql} {order_sql} {limit_sql} {offset_sql}'.strip()
                cur.execute(query, self._where_params)
                rows = [dict(r) for r in cur.fetchall()]
                res_data = rows[0] if (self._single and rows) else (None if self._single else rows)
                return QueryResult(data=res_data, count=total_count if total_count is not None else len(rows))

            elif self._action in ("insert", "upsert"):
                if not self._payload:
                    return QueryResult(data=[], count=0)
                cols = list(self._payload[0].keys())
                cols_sql = ", ".join(f'"{c}"' for c in cols)
                placeholders = ", ".join(["%s"] * len(cols))

                conflict_sql = ""
                if self._action == "upsert":
                    target = f'("{self._upsert_conflict}")' if self._upsert_conflict else '("slug")' if "slug" in cols else '("id")'
                    update_cols = [f'"{c}" = EXCLUDED."{c}"' for c in cols if c not in ("id", "created_at", self._upsert_conflict)]
                    if update_cols:
                        conflict_sql = f"ON CONFLICT {target} DO UPDATE SET " + ", ".join(update_cols)
                    else:
                        conflict_sql = f"ON CONFLICT {target} DO NOTHING"

                query = f'INSERT INTO "{self.table_name}" ({cols_sql}) VALUES ({placeholders}) {conflict_sql} RETURNING *'
                results = []
                for item in self._payload:
                    params = [self._prepare_val(item.get(c)) for c in cols]
                    cur.execute(query, params)
                    row = cur.fetchone()
                    if row:
                        results.append(dict(row))
                self.conn.commit()
                res_data = results[0] if (self._single and results) else results
                return QueryResult(data=res_data, count=len(results))

            elif self._action == "update":
                if not self._payload:
                    return QueryResult(data=[], count=0)
                set_clauses = []
                params = []
                for k, v in self._payload.items():
                    set_clauses.append(f'"{k}" = %s')
                    params.append(self._prepare_val(v))
                set_sql = ", ".join(set_clauses)
                params.extend(self._where_params)

                query = f'UPDATE "{self.table_name}" SET {set_sql} {where_sql} RETURNING *'
                cur.execute(query, params)
                rows = [dict(r) for r in cur.fetchall()]
                self.conn.commit()
                res_data = rows[0] if (self._single and rows) else rows
                return QueryResult(data=res_data, count=len(rows))

            elif self._action == "delete":
                query = f'DELETE FROM "{self.table_name}" {where_sql} RETURNING *'
                cur.execute(query, self._where_params)
                rows = [dict(r) for r in cur.fetchall()]
                self.conn.commit()
                return QueryResult(data=rows, count=len(rows))

        finally:
            cur.close()


class PGClient:
    def __init__(self, db_url: str = None):
        self.db_url = db_url or get_connection_string()
        self._conn = None

    def _get_conn(self):
        if self._conn is None or self._conn.closed:
            try:
                self._conn = psycopg2.connect(self.db_url)
            except Exception:
                # If localhost:5433 fails, try localhost:5432, or vice versa
                fallback = "postgresql://postgres:ahh_secure_pass_2026@localhost:5433/asian_health_hub" if "5432" in self.db_url else "postgresql://postgres:ahh_secure_pass_2026@127.0.0.1:5433/asian_health_hub"
                self._conn = psycopg2.connect(fallback)
        return self._conn

    def table(self, table_name: str) -> TableQueryBuilder:
        return TableQueryBuilder(self._get_conn(), table_name)

    def from_(self, table_name: str) -> TableQueryBuilder:
        return self.table(table_name)

    def rpc(self, fn_name: str, params: dict = None) -> QueryResult:
        conn = self._get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            param_vals = list((params or {}).values())
            placeholders = ", ".join(["%s"] * len(param_vals))
            query = f"SELECT * FROM {fn_name}({placeholders})"
            cur.execute(query, param_vals)
            rows = [dict(r) for r in cur.fetchall()]
            return QueryResult(data=rows, count=len(rows))
        finally:
            cur.close()


_INSTANCE = None

def create_client(url=None, key=None) -> PGClient:
    global _INSTANCE
    if _INSTANCE is None:
        _INSTANCE = PGClient()
    return _INSTANCE

def get_client() -> PGClient:
    return create_client()


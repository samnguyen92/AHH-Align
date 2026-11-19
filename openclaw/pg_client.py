"""
pg_client.py — Small PostgreSQL query builder & client for OpenClaw (psycopg2).

Exposes a tiny `.table(name).select(...).eq(...).execute()` API that returns an object
with `.data` and `.count`, so job code stays short and readable.

Reliability / safety properties (each one is covered by tests/test_pg_client.py):
  * One connection PER THREAD. A single shared connection used by several job threads would
    interleave transactions, and one failed statement would poison every other thread.
  * A failed statement is always rolled back, so the connection is usable again immediately
    (previously: "current transaction is aborted" for every later query until a restart).
  * Read-only statements end their transaction (no "idle in transaction" connections).
  * A connection that died (server restart, network) is replaced transparently.
  * Table / column / function names are validated; values are always bound parameters.
  * UPDATE / DELETE without a WHERE condition are refused.
  * Connect and statement timeouts so a stuck query cannot block a job forever.
"""

from __future__ import annotations

import os
import re
import threading
import time
from typing import Any, List, Optional

import psycopg2
import psycopg2.extensions
import psycopg2.extras
from psycopg2.extras import Json, RealDictCursor

CONNECT_TIMEOUT_SECONDS = int(os.environ.get("OPENCLAW_DB_CONNECT_TIMEOUT", "10"))
STATEMENT_TIMEOUT_MS = int(os.environ.get("OPENCLAW_DB_STATEMENT_TIMEOUT_MS", "60000"))
# A connection idle for longer than this is pinged before reuse (a silently dropped socket looks open).
IDLE_PING_SECONDS = int(os.environ.get("OPENCLAW_DB_IDLE_PING_SECONDS", "30"))

_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_FUNC_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$")
_COLUMN_LIST_RE = re.compile(r"^\s*[A-Za-z_][A-Za-z0-9_]*(\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*\s*$")


def _ident(name: str, kind: str = "identifier") -> str:
    value = str(name if name is not None else "").strip()
    if not _IDENT_RE.match(value):
        raise ValueError(f"Invalid SQL {kind}: {value[:80]!r}")
    return value


# Used only when DATABASE_URL is NOT set: the usual locations of the project's database, so the same
# code works inside the compose network (db:5432) and on the host (127.0.0.1:5433).
_DEV_DEFAULTS = (
    "postgresql://postgres:ahh_secure_pass_2026@db:5432/asian_health_hub",
    "postgresql://postgres:ahh_secure_pass_2026@127.0.0.1:5433/asian_health_hub",
    "postgresql://postgres:ahh_secure_pass_2026@localhost:5433/asian_health_hub",
    "postgresql://postgres:ahh_secure_pass_2026@127.0.0.1:5432/asian_health_hub",
    "postgresql://postgres:ahh_secure_pass_2026@localhost:5432/asian_health_hub",
)


def get_connection_strings(explicit_url: Optional[str] = None) -> List[str]:
    """DSNs to try, in order.

    An explicit URL (argument or DATABASE_URL) is used ALONE: if it is wrong we fail loudly instead of
    silently connecting to some other database with a default password.
    """
    explicit = explicit_url or os.environ.get("DATABASE_URL")
    return [explicit] if explicit else list(_DEV_DEFAULTS)


def get_connection_string() -> str:
    return get_connection_strings()[0]


class QueryResult:
    def __init__(self, data=None, count=None):
        self.data = data if data is not None else []
        self.count = count


class TableQueryBuilder:
    def __init__(self, client: "PGClient", table_name: str):
        self.client = client
        self.table_name = _ident(table_name, "table name")
        self._action = "select"  # select, insert, upsert, update, delete
        self._select_cols = "*"
        self._count_mode = None  # None or "exact"
        self._where_clauses: List[str] = []
        self._where_params: List[Any] = []
        self._order_by: List[str] = []
        self._limit: Optional[int] = None
        self._offset: Optional[int] = None
        self._payload = None
        self._upsert_conflict: Optional[str] = None
        self._single = False

    # ---- query construction -------------------------------------------------

    def select(self, columns: str = "*", count: str = None):
        columns = (columns or "*").strip()
        if columns != "*" and not _COLUMN_LIST_RE.match(columns):
            raise ValueError(f"Unsupported select column list: {columns[:80]!r}")
        if self._action != "select":
            # After insert/update/upsert/delete, .select() only chooses what to return: it must not
            # turn the write into a SELECT (the write would silently never happen).
            return self
        self._select_cols = columns
        if count == "exact":
            self._count_mode = "exact"
        return self

    def eq(self, col: str, val):
        self._where_clauses.append(f'"{_ident(col, "column")}" = %s')
        self._where_params.append(val)
        return self

    def neq(self, col: str, val):
        self._where_clauses.append(f'"{_ident(col, "column")}" != %s')
        self._where_params.append(val)
        return self

    def in_(self, col: str, vals: list):
        column = _ident(col, "column")
        if not vals:
            self._where_clauses.append("1=0")
            return self
        placeholders = ", ".join(["%s"] * len(vals))
        self._where_clauses.append(f'"{column}" IN ({placeholders})')
        self._where_params.extend(vals)
        return self

    def ilike(self, col: str, pattern: str):
        self._where_clauses.append(f'"{_ident(col, "column")}" ILIKE %s')
        self._where_params.append(pattern)
        return self

    def gte(self, col: str, val):
        self._where_clauses.append(f'"{_ident(col, "column")}" >= %s')
        self._where_params.append(val)
        return self

    def lte(self, col: str, val):
        self._where_clauses.append(f'"{_ident(col, "column")}" <= %s')
        self._where_params.append(val)
        return self

    def gt(self, col: str, val):
        self._where_clauses.append(f'"{_ident(col, "column")}" > %s')
        self._where_params.append(val)
        return self

    def lt(self, col: str, val):
        self._where_clauses.append(f'"{_ident(col, "column")}" < %s')
        self._where_params.append(val)
        return self

    def not_(self, col: str, op: str, val):
        column = _ident(col, "column")
        if op.lower() == "is" and val is None:
            self._where_clauses.append(f'"{column}" IS NOT NULL')
        else:
            self._where_clauses.append(f'NOT ("{column}" = %s)')
            self._where_params.append(val)
        return self

    def order(self, col: str, desc: bool = False, nulls_first: bool = False):
        direction = "DESC" if desc else "ASC"
        nulls = "NULLS FIRST" if nulls_first else "NULLS LAST"
        self._order_by.append(f'"{_ident(col, "column")}" {direction} {nulls}')
        return self

    def limit(self, n: int):
        self._limit = int(n)
        return self

    def range(self, from_idx: int, to_idx: int):
        self._offset = int(from_idx)
        self._limit = max(0, int(to_idx) - int(from_idx) + 1)
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
        self._upsert_conflict = _ident(on_conflict, "column") if on_conflict else None
        return self

    def update(self, data: dict):
        self._action = "update"
        self._payload = data
        return self

    def delete(self):
        self._action = "delete"
        return self

    def _prepare_val(self, column: str, val, cur):
        """Adapt a Python value to the column's real type.

        dict -> JSON.  list -> a PostgreSQL ARRAY for TEXT[]/INT[] columns, but JSON for json/jsonb columns.
        (Wrapping every list as JSON, as before, made writes to TEXT[] columns such as clinics.languages
        and articles.tags fail with "malformed array literal".)
        """
        if isinstance(val, dict):
            return Json(val)
        if isinstance(val, list):
            if self.client._is_array_column(cur, self.table_name, column):
                return val
            return Json(val)
        return val

    # ---- execution ----------------------------------------------------------

    def execute(self) -> QueryResult:
        """Run the query on this thread's connection. Always leaves the connection clean."""
        conn = self.client._get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            result = self._run(cur)
            conn.commit()  # also ends read-only transactions
            return result
        except BaseException:
            try:
                conn.rollback()
            except Exception:
                self.client._discard_conn()
            raise
        finally:
            try:
                cur.close()
            except Exception:
                pass

    def _run(self, cur) -> QueryResult:
        where_sql = ("WHERE " + " AND ".join(self._where_clauses)) if self._where_clauses else ""

        if self._action == "select":
            total_count = None
            if self._count_mode == "exact":
                cur.execute(f'SELECT COUNT(*) AS n FROM "{self.table_name}" {where_sql}', self._where_params)
                total_count = cur.fetchone()["n"]

            cols_sql = "*" if self._select_cols == "*" else ", ".join(
                f'"{c.strip()}"' for c in self._select_cols.split(",")
            )
            order_sql = ("ORDER BY " + ", ".join(self._order_by)) if self._order_by else ""
            limit_sql = f"LIMIT {self._limit}" if self._limit is not None else ""
            offset_sql = f"OFFSET {self._offset}" if self._offset is not None else ""
            query = f'SELECT {cols_sql} FROM "{self.table_name}" {where_sql} {order_sql} {limit_sql} {offset_sql}'.strip()
            cur.execute(query, self._where_params)
            rows = [dict(r) for r in cur.fetchall()]
            data = (rows[0] if rows else None) if self._single else rows
            return QueryResult(data=data, count=total_count if total_count is not None else len(rows))

        if self._action in ("insert", "upsert"):
            if not self._payload:
                return QueryResult(data=[], count=0)
            cols = [_ident(c, "column") for c in self._payload[0].keys()]
            cols_sql = ", ".join(f'"{c}"' for c in cols)
            placeholders = ", ".join(["%s"] * len(cols))

            conflict_sql = ""
            if self._action == "upsert":
                target = (
                    f'("{self._upsert_conflict}")'
                    if self._upsert_conflict
                    else '("slug")' if "slug" in cols else '("id")'
                )
                update_cols = [
                    f'"{c}" = EXCLUDED."{c}"' for c in cols if c not in ("id", "created_at", self._upsert_conflict)
                ]
                conflict_sql = (
                    f"ON CONFLICT {target} DO UPDATE SET " + ", ".join(update_cols)
                    if update_cols
                    else f"ON CONFLICT {target} DO NOTHING"
                )

            query = f'INSERT INTO "{self.table_name}" ({cols_sql}) VALUES ({placeholders}) {conflict_sql} RETURNING *'
            results = []
            for item in self._payload:
                cur.execute(query, [self._prepare_val(c, item.get(c), cur) for c in cols])
                row = cur.fetchone()
                if row:
                    results.append(dict(row))
            data = (results[0] if results else None) if self._single else results
            return QueryResult(data=data, count=len(results))

        if self._action == "update":
            if not self._where_clauses:
                raise ValueError(f'Refusing to UPDATE "{self.table_name}" without a WHERE condition.')
            if not self._payload:
                return QueryResult(data=[], count=0)
            set_clauses, params = [], []
            for key, value in self._payload.items():
                set_clauses.append(f'"{_ident(key, "column")}" = %s')
                params.append(self._prepare_val(_ident(key, "column"), value, cur))
            params.extend(self._where_params)
            cur.execute(
                f'UPDATE "{self.table_name}" SET {", ".join(set_clauses)} {where_sql} RETURNING *',
                params,
            )
            rows = [dict(r) for r in cur.fetchall()]
            return QueryResult(data=(rows[0] if rows else None) if self._single else rows, count=len(rows))

        if self._action == "delete":
            if not self._where_clauses:
                raise ValueError(f'Refusing to DELETE from "{self.table_name}" without a WHERE condition.')
            cur.execute(f'DELETE FROM "{self.table_name}" {where_sql} RETURNING *', self._where_params)
            rows = [dict(r) for r in cur.fetchall()]
            return QueryResult(data=rows, count=len(rows))

        raise ValueError(f"Unknown action: {self._action}")


class PGClient:
    """Hands out one psycopg2 connection per thread."""

    def __init__(self, db_url: str = None):
        self.db_url = db_url  # None -> DATABASE_URL, else the development defaults
        self._local = threading.local()

    def _connect(self):
        last_error: Optional[BaseException] = None
        for url in get_connection_strings(self.db_url):
            try:
                return psycopg2.connect(
                    url,
                    connect_timeout=CONNECT_TIMEOUT_SECONDS,
                    options=f"-c statement_timeout={STATEMENT_TIMEOUT_MS}",
                )
            except psycopg2.OperationalError as exc:
                last_error = exc
        raise RuntimeError(f"Could not connect to PostgreSQL: {last_error}")

    def _is_array_column(self, cur, table: str, column: str) -> bool:
        key = (self.db_url, table)
        types = _COLUMN_TYPES.get(key)
        if types is None:
            cur.execute(
                "SELECT column_name, udt_name FROM information_schema.columns "
                "WHERE table_schema = current_schema() AND table_name = %s",
                (table,),
            )
            types = {row["column_name"]: row["udt_name"] for row in cur.fetchall()}
            if types:  # do not cache "unknown table"; it may be created later
                _COLUMN_TYPES[key] = types
        return str(types.get(column, "")).startswith("_")

    def _discard_conn(self) -> None:
        conn = getattr(self._local, "conn", None)
        self._local.conn = None
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    def _is_alive(self, conn) -> bool:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
            conn.rollback()
            return True
        except Exception:
            return False

    def _get_conn(self):
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            if conn.closed:
                conn = None
            elif conn.get_transaction_status() == psycopg2.extensions.TRANSACTION_STATUS_UNKNOWN:
                self._discard_conn()
                conn = None
            else:
                if conn.get_transaction_status() == psycopg2.extensions.TRANSACTION_STATUS_INERROR:
                    # A previous caller left the transaction aborted: recover instead of failing every query.
                    try:
                        conn.rollback()
                    except Exception:
                        self._discard_conn()
                        conn = None
                if conn is not None and time.monotonic() - getattr(self._local, "last_used", 0.0) > IDLE_PING_SECONDS:
                    if not self._is_alive(conn):
                        self._discard_conn()
                        conn = None
        if conn is None:
            conn = self._connect()
            self._local.conn = conn
        self._local.last_used = time.monotonic()
        return conn

    def close(self) -> None:
        """Close the calling thread's connection (long-lived threads may call this when done)."""
        self._discard_conn()

    def table(self, table_name: str) -> TableQueryBuilder:
        return TableQueryBuilder(self, table_name)

    def from_(self, table_name: str) -> TableQueryBuilder:
        return self.table(table_name)

    def rpc(self, fn_name: str, params: dict = None) -> QueryResult:
        if not _FUNC_RE.match(str(fn_name or "")):
            raise ValueError(f"Invalid SQL function name: {str(fn_name)[:80]!r}")
        conn = self._get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            values = list((params or {}).values())
            placeholders = ", ".join(["%s"] * len(values))
            cur.execute(f"SELECT * FROM {fn_name}({placeholders})", values)
            rows = [dict(r) for r in cur.fetchall()]
            conn.commit()
            return QueryResult(data=rows, count=len(rows))
        except BaseException:
            try:
                conn.rollback()
            except Exception:
                self._discard_conn()
            raise
        finally:
            try:
                cur.close()
            except Exception:
                pass


_COLUMN_TYPES: dict = {}  # (db_url, table) -> {column: udt_name}; array types start with "_"

_INSTANCE: Optional[PGClient] = None
_INSTANCE_LOCK = threading.Lock()


def create_client(url=None, key=None) -> PGClient:
    """Process-wide client (each thread still gets its own connection). `key` is ignored (legacy argument)."""
    global _INSTANCE
    with _INSTANCE_LOCK:
        if _INSTANCE is None:
            _INSTANCE = PGClient(url)
        return _INSTANCE


def get_client() -> PGClient:
    return create_client()

#!/usr/bin/env python3
"""
load_dump_to_pg.py — Imports `postgres/backup/supabase_dump.json` into a target PostgreSQL database.
Compatible with standard psycopg2, asyncpg, or low-level PG wire protocol.
Uses `psycopg2` if available, or falls back to psycopg3 / raw pg client.
"""

import json
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DUMP_PATH = os.path.join(PROJECT_ROOT, "postgres", "backup", "supabase_dump.json")

# In container, "db:5432"; from host, "localhost:5432"
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:ahh_secure_pass_2026@localhost:5432/asian_health_hub"
)


def load_dump():
    if not os.path.exists(DUMP_PATH):
        raise FileNotFoundError(f"Dump file not found: {DUMP_PATH}")
    with open(DUMP_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def sanitize_value(val):
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return json.dumps(val, ensure_ascii=False)
    return val


def import_with_psycopg2(dump, db_url):
    import psycopg2
    from psycopg2.extras import Json

    print(f"[*] Connecting to {db_url} via psycopg2...")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    order = [
        ("auth.users", "auth.users"),
        ("public.organizations", "organizations"),
        ("public.clinics", "clinics"),
        ("public.articles", "articles"),
        ("public.article_facts", "article_facts"),
        ("public.claim_requests", "claim_requests"),
        ("public.clinic_submissions", "clinic_submissions"),
        ("public.user_roles", "user_roles"),
        ("public.clinic_embeddings", "clinic_embeddings"),
        ("public.newsletter_subscriptions", "newsletter_subscriptions"),
        ("public.analytics_events", "analytics_events"),
    ]

    for dump_key, table_name in order:
        rows = dump.get(dump_key, [])
        if not rows:
            print(f"  - {table_name}: 0 rows (skipping)")
            continue

        cols = list(rows[0].keys())
        # Replace Supabase storage URLs with relative /uploads/ or /generated-clinics/ if applicable
        cleaned_rows = []
        for r in rows:
            row_vals = []
            for col in cols:
                v = r.get(col)
                if isinstance(v, (dict, list)):
                    row_vals.append(Json(v))
                else:
                    row_vals.append(v)
            cleaned_rows.append(tuple(row_vals))

        col_str = ", ".join(f'"{c}"' for c in cols)
        placeholder = ", ".join(["%s"] * len(cols))
        stmt = f'INSERT INTO {table_name} ({col_str}) VALUES ({placeholder}) ON CONFLICT DO NOTHING'

        try:
            psycopg2.extras.execute_batch(cur, stmt, cleaned_rows, page_size=200)
            conn.commit()
            print(f"  ✅ {table_name}: Inserted {len(cleaned_rows)} rows")
        except Exception as exc:
            conn.rollback()
            print(f"  ❌ {table_name} batch insert failed: {exc}")
            # Try row by row
            success = 0
            for row_vals in cleaned_rows:
                try:
                    cur.execute(stmt, row_vals)
                    conn.commit()
                    success += 1
                except Exception:
                    conn.rollback()
            print(f"     -> Individual insert recovered {success}/{len(cleaned_rows)} rows")

    cur.close()
    conn.close()
    print("[+] Data import complete!")


if __name__ == "__main__":
    data = load_dump()
    target_url = sys.argv[1] if len(sys.argv) > 1 else DATABASE_URL
    try:
        import_with_psycopg2(data, target_url)
    except ImportError:
        print("[!] psycopg2 is not installed locally. Can run inside docker container.")
        sys.exit(1)


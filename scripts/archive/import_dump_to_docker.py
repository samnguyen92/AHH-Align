#!/usr/bin/env python3
"""
import_dump_to_docker.py — Converts `postgres/backup/supabase_dump.json` into SQL statements
and pipes them into `asian-health-hub-db` container via `docker exec -i`.
"""

import json
import os
import subprocess
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DUMP_PATH = os.path.join(PROJECT_ROOT, "postgres", "backup", "supabase_dump.json")
SQL_OUT_PATH = os.path.join(PROJECT_ROOT, "postgres", "backup", "restore_dump.sql")

CONTAINER_NAME = "asian-health-hub-db"
DB_NAME = "asian_health_hub"
DB_USER = "postgres"


ARRAY_COLUMNS = {
    ("public.clinics", "languages"),
    ("public.articles", "tags"),
}


def escape_sql_value(val, table_name=None, col_name=None):
    if val is None:
        return "NULL"
    if (table_name, col_name) in ARRAY_COLUMNS:
        if isinstance(val, list):
            if not val:
                return "ARRAY[]::text[]"
            escaped_items = ["'" + str(x).replace("'", "''") + "'" for x in val]
            return "ARRAY[" + ", ".join(escaped_items) + "]::text[]"
        return "ARRAY[]::text[]"

    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, (dict, list)):
        s = json.dumps(val, ensure_ascii=False)
        return "'" + s.replace("'", "''") + "'::jsonb"
    s = str(val)
    return "'" + s.replace("'", "''") + "'"


def generate_sql():
    with open(DUMP_PATH, "r", encoding="utf-8") as f:
        dump = json.load(f)

    lines = [
        "SET search_path = public, auth;",
    ]

    order = [
        ("auth.users", "auth.users"),
        ("public.organizations", "public.organizations"),
        ("public.clinics", "public.clinics"),
        ("public.articles", "public.articles"),
        ("public.article_facts", "public.article_facts"),
        ("public.claim_requests", "public.claim_requests"),
        ("public.clinic_submissions", "public.clinic_submissions"),
        ("public.user_roles", "public.user_roles"),
        ("public.clinic_embeddings", "public.clinic_embeddings"),
        ("public.newsletter_subscriptions", "public.newsletter_subscriptions"),
        ("public.analytics_events", "public.analytics_events"),
    ]

    for dump_key, table_name in order:
        rows = dump.get(dump_key, [])
        if not rows:
            continue

        cols = list(rows[0].keys())
        col_list_str = ", ".join(f'"{c}"' for c in cols)

        lines.append(f"-- Inserting {len(rows)} rows into {table_name}")
        for r in rows:
            val_strs = [escape_sql_value(r.get(c), table_name, c) for c in cols]
            val_list_str = ", ".join(val_strs)
            lines.append(
                f"INSERT INTO {table_name} ({col_list_str}) VALUES ({val_list_str}) ON CONFLICT DO NOTHING;"
            )

    sql_content = "\n".join(lines)
    with open(SQL_OUT_PATH, "w", encoding="utf-8") as f:
        f.write(sql_content)

    print(f"[+] Generated SQL dump at {SQL_OUT_PATH} ({len(sql_content) / (1024*1024):.2f} MB)")


def execute_in_docker():
    cmd = f'docker exec -i {CONTAINER_NAME} psql -U {DB_USER} -d {DB_NAME} < "{SQL_OUT_PATH}"'
    print(f"[*] Executing SQL in container {CONTAINER_NAME}...")
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        print("[!] Execution error:", res.stderr[:500])
        sys.exit(1)
    else:
        print("[+] Success!")
        # Print summary of errors or commits
        output_lines = res.stdout.strip().splitlines()
        inserts = sum(1 for ln in output_lines if ln.startswith("INSERT"))
        print(f"[+] Total INSERTs completed: {inserts}")


if __name__ == "__main__":
    generate_sql()
    execute_in_docker()

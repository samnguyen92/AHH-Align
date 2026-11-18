#!/usr/bin/env python3
"""openclaw/audit_languages.py

Audits clinic language tags in PostgreSQL against the VISIBLE text of each clinic's official website
(home page + /about if reachable), and normalizes language lists using ``openclaw/languages.py``.

Usage:
  python openclaw/audit_languages.py --sample=20          # dry-run audit on 20 clinics, outputs CSV + summary
  python openclaw/audit_languages.py --sample=20 --apply  # apply verified fixes to clinics with clear site evidence
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from languages import detect_languages, language_family, normalize_language_list, verify_languages  # noqa: E402

ROOT_DIR = Path("/app") if Path("/app/public").exists() else Path(__file__).resolve().parent.parent
REPORTS_DIR = Path(__file__).resolve().parent / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)


def fetch_html(url: str, timeout: int = 10) -> str:
    if not url:
        return ""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read(1_500_000)
            return raw.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def fetch_clinic_site_html(website: str) -> str:
    home = fetch_html(website, timeout=10)
    if not home:
        return ""
    parsed = urllib.parse.urlparse(website if "://" in website else "https://" + website)
    base = f"{parsed.scheme}://{parsed.netloc}"
    about = fetch_html(base + "/about", timeout=7) or fetch_html(base + "/about-us", timeout=7)
    return home + "\n" + about


def audit_sample(rows: list[dict], apply_fixes: bool = False, conn=None) -> list[dict]:
    results = []
    for idx, c in enumerate(rows, 1):
        meta = c.get("metadata") or {}
        website = (
            meta.get("website")
            or meta.get("google_website_url")
            or meta.get("source_url")
            or ""
        ).strip()
        db_langs = normalize_language_list(c.get("languages") or [])
        html = fetch_clinic_site_html(website) if website else ""

        if not html:
            status = "UNREACHABLE"
            site_langs = []
            evidence = {}
            dropped = []
        else:
            detected = detect_languages(html)
            kept, ev, dropped = verify_languages(db_langs, html)
            for k, q in detected.items():
                if k not in kept:
                    kept.append(k)
                    ev[k] = q
            site_langs = ["English", *[x for x in kept if x != "English"]] if kept else []
            evidence = ev
            non_en_db = {x for x in db_langs if x != "English"}
            non_en_site = {x for x in site_langs if x != "English"}
            if not non_en_site:
                status = "NO_SITE_CLAIM"
            elif non_en_db == non_en_site:
                status = "MATCH"
            else:
                status = "MISMATCH"

        row_report = {
            "index": idx,
            "slug": c["slug"],
            "name": c["name"],
            "city": f"{c.get('city') or ''}, {c.get('state') or ''}".strip(", "),
            "website": website,
            "db_languages": ", ".join(db_langs),
            "site_languages": ", ".join(site_langs),
            "families": ", ".join(sorted({language_family(x) for x in (site_langs or db_langs) if language_family(x) and language_family(x) != "English"})),
            "status": status,
            "dropped_unverified": ", ".join([d for d in dropped if d != "English"]),
            "evidence": " | ".join(f"{k}: {v}" for k, v in evidence.items() if k != "English"),
        }
        results.append(row_report)
        print(
            f"[{idx:02d}/{len(rows)}] {c['slug']:<32} | DB: {row_report['db_languages']:<30} "
            f"| Site: {row_report['site_languages'] or '-':<28} | {status}"
        )

        if apply_fixes and conn is not None:
            new_meta = dict(meta)
            if status in ("MATCH", "MISMATCH") and site_langs:
                new_meta["languages_verified"] = True
                new_meta["languages_evidence"] = [f"{k}: {v}" for k, v in evidence.items() if k != "English"]
                new_langs = site_langs
            else:
                new_meta["languages_verified"] = False
                new_langs = db_langs or ["English"]
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE clinics SET languages = %s, metadata = %s WHERE id = %s",
                    (new_langs, json.dumps(new_meta), c["id"]),
                )
            conn.commit()

    csv_path = REPORTS_DIR / "language_audit_sample.csv"
    if results:
        with open(csv_path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(results[0].keys()))
            writer.writeheader()
            writer.writerows(results)
        print(f"\n[+] Saved audit CSV to {csv_path}")
    return results


def main() -> None:
    import subprocess

    sample_n = 20
    apply_fixes = "--apply" in sys.argv
    for arg in sys.argv[1:]:
        if arg.startswith("--sample="):
            sample_n = int(arg.split("=", 1)[1])

    db_url = os.environ.get("DATABASE_URL") or "postgresql://postgres:ahh_secure_pass_2026@127.0.0.1:5433/asian_health_hub"
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor

        conn = psycopg2.connect(db_url)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, slug, name, city, state, languages, metadata
                    FROM clinics
                    WHERE COALESCE(metadata->>'website', metadata->>'google_website_url', metadata->>'source_url') IS NOT NULL
                      AND COALESCE(specialty, '') != 'Hospital'
                    ORDER BY (metadata->>'rating_count')::int DESC NULLS LAST
                    LIMIT %s
                    """,
                    (sample_n,),
                )
                rows = cur.fetchall()
            audit_sample(rows, apply_fixes=apply_fixes, conn=conn)
        finally:
            conn.close()
    except ImportError:
        js = f"""
        import pg from 'pg';
        const pool = new pg.Pool({{ connectionString: {json.dumps(db_url)} }});
        const res = await pool.query(`
          SELECT id, slug, name, city, state, languages, metadata
          FROM clinics
          WHERE COALESCE(metadata->>'website', metadata->>'google_website_url', metadata->>'source_url') IS NOT NULL
            AND COALESCE(specialty, '') != 'Hospital'
          ORDER BY (metadata->>'rating_count')::int DESC NULLS LAST
          LIMIT {sample_n}
        `);
        console.log(JSON.stringify(res.rows));
        await pool.end();
        """
        out = subprocess.check_output(["node", "--input-type=module", "-e", js], cwd=str(ROOT_DIR), text=True)
        rows = json.loads(out)
        audit_sample(rows, apply_fixes=False, conn=None)


if __name__ == "__main__":
    main()

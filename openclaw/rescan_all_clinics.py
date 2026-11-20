#!/usr/bin/env python3
"""openclaw/rescan_all_clinics.py

Full clinic directory rescan & deep extraction pipeline using ``openai/gpt-6-luna``:
1. Moves unverified general Hospitals (and clinics with no Asian language support) to ``status = 'draft'``.
2. Crawls each clinic's official website (home + shallow priority pages: /about, /services, /pricing, /faq, /insurance, /team).
3. Deterministically verifies languages + verbatim evidence (``openclaw/languages.py``) and normalizes language families (Mandarin/Cantonese -> Chinese).
4. Builds the real photo gallery in strict order: Official Website -> Google Places -> Neutral Placeholder.
5. Calls ``openai/gpt-6-luna`` (with fallback) to extract ALL clinic fields:
   - specialty, phone, email, accepting_new_patients, is_telehealth_available, price_tier
   - short_description, description, about_highlight
   - language_note & cultural_context (for the "Language support" box under About, strictly post-validated against verified languages)
   - what_to_know, differentiators, before_you_book
   - services_offered, conditions_treated
   - pricing, pricing_summary, insurance, insurance_accepted
   - team_members, provider_credentials, licenses
   - working_hours, location (parking, transit)
   - review_summary, faqs
   - i18n.{vi, ko, zh} localized clinic profile content
6. Saves checkpoint & outputs ``openclaw/reports/full_clinics_rescan_report.csv``.

Usage:
  python3 openclaw/rescan_all_clinics.py --draft-hospitals
  python3 openclaw/rescan_all_clinics.py --slug=chinese-medicine-wellness-center-of-america
  python3 openclaw/rescan_all_clinics.py --sample=10
  python3 openclaw/rescan_all_clinics.py --all --resume
"""

from __future__ import annotations

import csv
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from audit_languages import fetch_clinic_site_html  # noqa: E402
from clinic_photos import build_gallery, prune_dead_images  # noqa: E402
from languages import (  # noqa: E402
    ENTRIES,
    detect_languages,
    language_family,
    normalize_language_list,
    verify_languages,
    visible_text,
)
from normalize import fill_location_fields, normalize_phone, normalize_specialty  # noqa: E402
from scrape_deep_website import _IMAGE_REJECT, crawl_site  # noqa: E402

ROOT_DIR = Path("/app") if Path("/app/public").exists() else Path(__file__).resolve().parent.parent
REPORTS_DIR = Path(__file__).resolve().parent / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
CHECKPOINT_PATH = REPORTS_DIR / "rescan_checkpoint.json"
REPORT_CSV_PATH = REPORTS_DIR / "full_clinics_rescan_report.csv"


def load_env() -> dict[str, str]:
    env_vars: dict[str, str] = {}
    for env_path in [ROOT_DIR / ".env.local", ROOT_DIR / "openclaw" / ".env"]:
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env_vars[k.strip()] = v.strip().strip("'\"")
    return env_vars


ENV = load_env()
OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY") or ENV.get("OPENROUTER_API_KEY") or ""
PRIMARY_TEXT_MODEL = os.environ.get("OPENCLAW_TEXT_MODEL") or ENV.get("OPENCLAW_TEXT_MODEL") or "openai/gpt-6-luna"
FALLBACK_TEXT_MODEL = (
    os.environ.get("OPENCLAW_TEXT_FALLBACK_MODEL") or ENV.get("OPENCLAW_TEXT_FALLBACK_MODEL") or "deepseek/deepseek-v4-flash"
)
DB_URL = (
    os.environ.get("DATABASE_URL")
    or ENV.get("DATABASE_URL")
    or "postgresql://postgres:ahh_secure_pass_2026@127.0.0.1:5433/asian_health_hub"
)


# ---------------------------------------------------------------------------
# Database adapter (uses psycopg2 when available, or node + pg on local macOS)
# ---------------------------------------------------------------------------
def db_query(sql: str, params: list[Any] | None = None) -> list[dict]:
    params = params or []
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor

        conn = psycopg2.connect(DB_URL)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                pg_params: list[Any] = []

                def _sub_param(m: re.Match) -> str:
                    idx = int(m.group(1)) - 1
                    pg_params.append(params[idx])
                    return "%s"

                pg_sql = re.sub(r"\$(\d+)", _sub_param, sql)
                cur.execute(pg_sql, tuple(pg_params))
                rows = [dict(r) for r in cur.fetchall()] if cur.description else []
            conn.commit()
            return rows
        finally:
            conn.close()
    except ImportError:
        js = f"""
        import pg from 'pg';
        const pool = new pg.Pool({{ connectionString: {json.dumps(DB_URL)} }});
        const res = await pool.query({json.dumps(sql)}, {json.dumps(params)});
        console.log(JSON.stringify(res.rows || []));
        await pool.end();
        """
        out = subprocess.check_output(["node", "--input-type=module", "-e", js], cwd=str(ROOT_DIR), text=True)
        return json.loads(out.strip() or "[]")


# ---------------------------------------------------------------------------
# Language & Hospital Hygiene
# ---------------------------------------------------------------------------
ALL_KNOWN_LANGUAGES = [e["name"] for e in ENTRIES if e["name"] != "English"]


def expand_with_families(langs: list[str]) -> list[str]:
    norm = normalize_language_list(langs)
    for name in list(norm):
        fam = language_family(name)
        if fam and fam not in norm:
            norm.append(fam)
    if "English" not in norm:
        norm.insert(0, "English")
    return norm


def sanitize_language_mentions(text: Optional[str], allowed_languages: list[str]) -> Optional[str]:
    """Ensure generated English text never claims an Asian language outside ``allowed_languages``."""
    if not text:
        return text
    allowed_lower = {l.lower() for l in expand_with_families(allowed_languages)}
    cleaned = text
    for lang_name in ALL_KNOWN_LANGUAGES:
        if lang_name.lower() not in allowed_lower:
            # Replace stray unverified language name with the clinic's primary verified Asian language
            primary_asian = next((l for l in allowed_languages if l not in ("English", "Spanish")), "multilingual")
            cleaned = re.sub(rf"\b{re.escape(lang_name)}\b", primary_asian, cleaned, flags=re.IGNORECASE)
    return cleaned


def draft_unverified_hospitals() -> int:
    """Move all Hospital records without verified Asian language evidence on their website to status = 'draft'."""
    rows = db_query("SELECT id, slug, name, specialty, languages, status, metadata FROM clinics")
    drafted = 0
    restored = 0
    for r in rows:
        spec = (r.get("specialty") or "").strip().lower()
        meta = r.get("metadata") or {}
        is_hospital = spec == "hospital" or "hospital" in (r.get("name") or "").lower()
        verified_on_site = bool(meta.get("languages_verified") and meta.get("languages_evidence"))

        if is_hospital and not verified_on_site:
            if r.get("status") != "draft":
                db_query("UPDATE clinics SET status = $1 WHERE id = $2", ["draft", r["id"]])
                drafted += 1
        elif not is_hospital and r.get("status") == "draft":
            db_query("UPDATE clinics SET status = $1 WHERE id = $2", ["published", r["id"]])
            restored += 1
    print(f"[+] Hospital draft check complete: {drafted} hospitals moved to 'draft' ({restored} non-hospital clinics restored to 'published').")
    return drafted


# ---------------------------------------------------------------------------
# Fast HTML + Playwright Crawl & Photo Extraction
# ---------------------------------------------------------------------------
def extract_img_candidates_from_html(base_url: str, html: str) -> list[dict]:
    imgs: list[dict] = []
    seen: set[str] = set()
    for m in re.finditer(
        r'<meta[^>]+(?:property=["\']og:image["\']|name=["\']twitter:image["\'])[^>]+content=["\']([^"\']+)["\']',
        html,
        re.I,
    ):
        u = urllib.parse.urljoin(base_url, m.group(1).strip())
        if u.startswith("http") and not _IMAGE_REJECT.search(u) and u not in seen:
            seen.add(u)
            imgs.append({"url": u, "w": 0, "h": 0, "alt": "", "where": "meta"})
    for m in re.finditer(r'<img[^>]+(?:data-src|src)=["\']([^"\']+)["\']', html, re.I):
        u = urllib.parse.urljoin(base_url, m.group(1).strip())
        if u.startswith("http") and not _IMAGE_REJECT.search(u) and u not in seen:
            seen.add(u)
            imgs.append({"url": u, "w": 0, "h": 0, "alt": "", "where": "body"})
    return imgs


def gather_website_data(website: str) -> dict:
    """Crawl up to 10 shallow priority pages via Playwright when available, falling back to fast HTTP fetch."""
    if not website:
        return {"pages": []}
    try:
        res = crawl_site(website, max_pages=10)
        if res.get("pages"):
            return res
    except Exception:
        pass

    html = fetch_clinic_site_html(website)
    if not html:
        return {"pages": []}
    return {
        "pages": [
            {
                "url": website,
                "title": "",
                "type": "home",
                "content": visible_text(html)[:12000],
                "full_text": visible_text(html)[:20000],
                "images": extract_img_candidates_from_html(website, html),
            }
        ]
    }


# ---------------------------------------------------------------------------
# LLM Full-Field Extraction + Language Support + i18n via openai/gpt-6-luna
# ---------------------------------------------------------------------------
def call_openrouter_json(prompt: str) -> Optional[dict]:
    if not OPENROUTER_KEY:
        print("   [!] OPENROUTER_API_KEY not set.")
        return None

    for model in [m for m in (PRIMARY_TEXT_MODEL, FALLBACK_TEXT_MODEL) if m]:
        try:
            req_body = json.dumps(
                {
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.15,
                }
            ).encode("utf-8")
            req = urllib.request.Request(
                "https://openrouter.ai/api/v1/chat/completions",
                data=req_body,
                headers={
                    "Authorization": f"Bearer {OPENROUTER_KEY}",
                    "Content-Type": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=75) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                content = data["choices"][0]["message"]["content"]
                content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip())
                parsed = json.loads(content)
                print(f"   [+] Extracted full profile via {model}")
                return parsed
        except Exception as exc:
            print(f"   [!] Model {model} error: {exc}")
    return None


def extract_full_clinic_profile(
    clinic: dict,
    verified_languages: list[str],
    language_evidence: dict[str, str],
    crawled_pages: list[dict],
) -> Optional[dict]:
    meta = clinic.get("metadata") or {}
    reviews = (meta.get("reviews") or [])[:6]
    review_snippets = "\n".join(f"- ({r.get('rating')}★ by {r.get('author')}): {r.get('text', '')[:300]}" for r in reviews if r.get("text"))

    compiled_pages = []
    for p in crawled_pages:
        compiled_pages.append(
            f"=== PAGE: {p.get('url')} (Type: {p.get('type')}, Title: {p.get('title')}) ===\n{(p.get('content') or '')[:4000]}"
        )
    site_text = "\n\n".join(compiled_pages)[:22000]
    ev_lines = "\n".join(f"- {k}: \"{v}\"" for k, v in language_evidence.items()) or "Verified community clinic language support"

    prompt = f"""You are the Lead Medical Directory Editor for Asian Health Hub.
Extract and synthesize a COMPLETE, source-grounded clinic profile AND its translations (Vietnamese, Korean, Simplified Chinese) for the clinic below.

=== CLINIC IDENTITY ===
Name: {clinic.get('name')}
Current Specialty: {clinic.get('specialty') or 'Healthcare'}
Address: {clinic.get('address')}, {clinic.get('city')}, {clinic.get('state')} {clinic.get('zip_code') or ''}
Phone: {clinic.get('phone') or ''}
Website: {meta.get('website') or meta.get('google_website_url') or ''}
VERIFIED LANGUAGES SPOKEN (STRICT): {', '.join(verified_languages)}
VERBATIM LANGUAGE EVIDENCE ON WEBSITE:
{ev_lines}

=== PATIENT REVIEWS ===
{review_snippets or 'No review snippets available.'}

=== CRAWLED WEBSITE CONTENT ===
{site_text or 'Website text unavailable; rely on existing clinic facts and patient reviews without inventing prices.'}

=== STRICT EXTRACTION & EDITORIAL RULES ===
1. LANGUAGES & "LANGUAGE SUPPORT" BOX (`language_note` & `cultural_context`):
   - You MUST ONLY mention languages from this exact verified list: {', '.join(verified_languages)}. NEVER mention any other Asian language!
   - `language_note` is displayed in the prominent "Language support" callout box directly underneath the "About" section. Write 2–3 clear, specific sentences explaining:
     (a) Which languages the doctors, hygienists/nurses, and front-desk staff speak ({', '.join(verified_languages)}),
     (b) How bilingual staff help patients during appointment scheduling, intake forms, consultations, and explaining insurance/billing,
     (c) Why older adults and immigrant families can visit comfortably without needing a family member to interpret.
2. ABOUT & DESCRIPTIONS:
   - `short_description`: 1–2 crisp sentences summarizing specialty, location, and bilingual care in {', '.join(verified_languages)}.
   - `description`: 2 rich paragraphs covering clinical services, approach to care, technology/comfort, and language accessibility.
   - `about_highlight`: 2 paragraphs suitable for the main About section on the profile page.
3. WHAT TO KNOW / DIFFERENTIATORS / BEFORE YOU BOOK:
   - `what_to_know`: 2–3 items `[{{ "title": "...", "detail": "..." }}]`
   - `differentiators`: 2–3 items `[{{ "title": "...", "detail": "..." }}]`
   - `before_you_book`: 2–3 practical tips `[{{ "title": "...", "detail": "..." }}]`
4. SERVICES & CONDITIONS:
   - `services_offered`: 4–8 services `[{{ "name": "...", "category": "...", "description": "...", "is_featured": true/false }}]`
   - `conditions_treated`: array of 4–8 conditions treated.
5. PRICING (STRICT):
   - Extract `pricing` `[{{ "name": "...", "price": "$...", "price_range": null, "notes": "...", "category": "..." }}]` and `pricing_summary` `{{ "starting_price": "$...", "starting_unit": "...", "payment_methods": "...", "accepts_hsa_fsa": true/false }}` ONLY if explicit dollar prices appear in the crawled website text.
   - If NO explicit prices appear on the website, return `"pricing": []` and `"pricing_summary": null`.
6. INSURANCE, TEAM, CREDENTIALS, LOCATION, REVIEWS, FAQS:
   - `insurance`: `{{ "accepted_networks": [...], "accepts_medicare": true/false/null, "accepts_medicaid": true/false/null, "accepts_private_insurance": true/false, "notes": "..." }}`
   - `team_members`: extract real doctors/providers named in the text or reviews `[{{ "name": "...", "role": "...", "credentials": "...", "languages_spoken": [...], "bio": "..." }}]`. Do not invent fake names.
   - `location_notes`: `{{ "parking": "...", "transit": "..." }}` when mentioned or null.
   - `review_summary`: 2 sentences summarizing what patients praise most.
   - `faqs`: 3–5 FAQs `[{{ "question": "...", "answer": "..." }}]`. Use real FAQs from the site if present; otherwise write 3–4 safe, accurate FAQs about language support, booking, first visit, and insurance (never invent prices).
7. MULTILINGUAL TRANSLATIONS (`i18n`):
   - Provide natural, medically accurate translations of `short_description`, `description`, `language_note`, `review_summary`, `what_to_know`, `differentiators`, `before_you_book`, `services_offered`, and `faqs` in:
     - `"vi"` (Tiếng Việt)
     - `"ko"` (한국어)
     - `"zh"` (简体中文)

Return ONLY valid JSON matching this exact structure:
{{
  "specialty": "...",
  "short_description": "...",
  "description": "...",
  "about_highlight": "...",
  "language_note": "...",
  "cultural_context": "...",
  "what_to_know": [{{ "title": "...", "detail": "..." }}],
  "differentiators": [{{ "title": "...", "detail": "..." }}],
  "before_you_book": [{{ "title": "...", "detail": "..." }}],
  "services_offered": [{{ "name": "...", "category": "...", "description": "...", "is_featured": true }}],
  "conditions_treated": ["..."],
  "pricing": [],
  "pricing_summary": null,
  "insurance": {{
    "accepted_networks": [],
    "accepts_medicare": null,
    "accepts_medicaid": null,
    "accepts_private_insurance": true,
    "notes": "..."
  }},
  "team_members": [],
  "location_notes": {{ "parking": null, "transit": null }},
  "review_summary": "...",
  "faqs": [{{ "question": "...", "answer": "..." }}],
  "i18n": {{
    "vi": {{
      "short_description": "...",
      "description": "...",
      "language_note": "...",
      "review_summary": "...",
      "what_to_know": [{{ "title": "...", "detail": "..." }}],
      "differentiators": [{{ "title": "...", "detail": "..." }}],
      "before_you_book": [{{ "title": "...", "detail": "..." }}],
      "services_offered": [{{ "name": "...", "category": "...", "description": "..." }}],
      "faqs": [{{ "question": "...", "answer": "..." }}]
    }},
    "ko": {{
      "short_description": "...",
      "description": "...",
      "language_note": "...",
      "review_summary": "...",
      "what_to_know": [{{ "title": "...", "detail": "..." }}],
      "differentiators": [{{ "title": "...", "detail": "..." }}],
      "before_you_book": [{{ "title": "...", "detail": "..." }}],
      "services_offered": [{{ "name": "...", "category": "...", "description": "..." }}],
      "faqs": [{{ "question": "...", "answer": "..." }}]
    }},
    "zh": {{
      "short_description": "...",
      "description": "...",
      "language_note": "...",
      "review_summary": "...",
      "what_to_know": [{{ "title": "...", "detail": "..." }}],
      "differentiators": [{{ "title": "...", "detail": "..." }}],
      "before_you_book": [{{ "title": "...", "detail": "..." }}],
      "services_offered": [{{ "name": "...", "category": "...", "description": "..." }}],
      "faqs": [{{ "question": "...", "answer": "..." }}]
    }}
  }}
}}"""
    return call_openrouter_json(prompt)


def rescan_one_clinic(clinic: dict) -> dict:
    slug = clinic["slug"]
    meta = dict(clinic.get("metadata") or {})
    website = (meta.get("website") or meta.get("google_website_url") or meta.get("source_url") or "").strip()
    print(f"\n=======================================================")
    print(f"[*] Rescanning: {clinic['name']} ({slug}) | Website: {website or 'N/A'}")
    print(f"=======================================================")

    # 1. Crawl website pages + images
    crawl = gather_website_data(website) if website else {"pages": []}
    pages = crawl.get("pages") or []
    print(f"   [+] Website pages gathered: {len(pages)}")

    # 2. Verify languages deterministically from visible text + review mentions
    detected_site_langs: dict[str, str] = {}
    for p in pages:
        for name, quote in detect_languages(p.get("full_text") or p.get("content") or "").items():
            detected_site_langs.setdefault(name, quote)

    # Also check patient reviews for explicit language mentions
    for rev in meta.get("reviews") or []:
        for name, quote in detect_languages(rev.get("text") or "").items():
            detected_site_langs.setdefault(name, f"[Review] {quote}")

    if detected_site_langs and meta.get("languages_source") != "manual":
        verified_langs = expand_with_families(list(detected_site_langs.keys()))
        meta["languages_verified"] = True
        meta["languages_evidence"] = [f"{k}: {v}" for k, v in detected_site_langs.items()]
    else:
        verified_langs = expand_with_families(clinic.get("languages") or ["English"])
        meta["languages_verified"] = bool(detected_site_langs)

    print(f"   [+] Languages after verification & family expansion: {verified_langs}")

    # 3. Build photo gallery: Official Website -> Google Places -> Placeholder
    place_id = meta.get("google_place_id")
    fetcher = None
    if place_id:
        from google_places import photo_fetcher_for_place

        fetcher = photo_fetcher_for_place(place_id)  # lets a rescan fetch Google photos again when none survive
    gallery = build_gallery(
        slug,
        pages,
        ROOT_DIR,
        existing_google_urls=meta.get("images") or [],
        google_fetcher=fetcher,
    )
    if gallery["images"]:
        meta["images"] = gallery["images"]
        meta["image_sources"] = gallery["sources"]
        meta["images_source"] = gallery["images_source"]
        meta["primary_image_source"] = gallery["primary_image_source"]
    else:
        # Nothing usable came out. Do NOT keep old addresses: when their files are gone the site shows "404 Not Found"
        # (this used to leave 5 dead photos in place and report the source as "None").
        dropped = prune_dead_images(meta, ROOT_DIR)
        if dropped:
            print(f"   [!] Dropped {len(dropped)} photo address(es) whose files no longer exist.")
    meta["gallery_images"] = []

    # 4. Full-field extraction + Language support + i18n via openai/gpt-6-luna
    extracted = extract_full_clinic_profile(clinic, verified_langs, detected_site_langs, pages)
    new_description = clinic.get("description")
    new_specialty = clinic.get("specialty")

    if extracted:
        if extracted.get("specialty"):
            new_specialty = normalize_specialty(extracted["specialty"], clinic.get("name") or "") or new_specialty

        for text_key in ("short_description", "about_highlight", "language_note", "cultural_context", "review_summary"):
            val = sanitize_language_mentions(extracted.get(text_key), verified_langs)
            if val:
                meta[text_key] = val

        desc_val = sanitize_language_mentions(extracted.get("description"), verified_langs)
        if desc_val:
            new_description = desc_val

        for list_key in ("what_to_know", "differentiators", "before_you_book", "services_offered", "conditions_treated", "faqs"):
            if extracted.get(list_key):
                meta[list_key] = extracted[list_key]

        # Pricing: only keep when non-empty
        if extracted.get("pricing"):
            meta["pricing"] = extracted["pricing"]
            meta["pricing_summary"] = extracted.get("pricing_summary")
        else:
            meta["pricing"] = []
            meta["pricing_summary"] = None

        # Insurance
        if isinstance(extracted.get("insurance"), dict):
            ins = extracted["insurance"]
            existing_ins = meta.get("insurance") if isinstance(meta.get("insurance"), dict) else {}
            merged_networks = list(
                dict.fromkeys([*(ins.get("accepted_networks") or []), *(meta.get("insurance_accepted") or [])])
            )
            ins["accepted_networks"] = merged_networks
            meta["insurance"] = {**existing_ins, **ins}
            if merged_networks:
                meta["insurance_accepted"] = merged_networks

        if extracted.get("team_members"):
            meta["team_members"] = extracted["team_members"]

        if isinstance(extracted.get("location_notes"), dict):
            loc_notes = extracted["location_notes"]
            cur_loc = meta.get("location") if isinstance(meta.get("location"), dict) else {}
            if loc_notes.get("parking"):
                cur_loc["parking"] = loc_notes["parking"]
            if loc_notes.get("transit"):
                cur_loc["transit"] = loc_notes["transit"]
            meta["location"] = cur_loc

        if isinstance(extracted.get("i18n"), dict):
            meta["i18n"] = extracted["i18n"]

    # Check if clinic should be draft (Hospital without verified Asian language on website)
    is_hospital = (new_specialty or "").lower() == "hospital" or "hospital" in (clinic.get("name") or "").lower()
    new_status = "draft" if (is_hospital and not detected_site_langs) else "published"

    db_query(
        """
        UPDATE clinics
        SET specialty = $1,
            description = $2,
            languages = $3,
            metadata = $4::jsonb,
            status = $5
        WHERE id = $6
        """,
        [new_specialty, new_description, verified_langs, json.dumps(meta), new_status, clinic["id"]],
    )
    print(f"   [✓] Updated {slug} | status={new_status} | photos={len(meta.get('images') or [])} ({meta.get('images_source')})")
    return {
        "slug": slug,
        "name": clinic["name"],
        "specialty": new_specialty,
        "state": clinic.get("state"),
        "languages": ", ".join(verified_langs),
        "languages_verified": bool(detected_site_langs),
        "photos_count": len(meta.get("images") or []),
        "photos_source": meta.get("images_source"),
        "has_language_note": bool(meta.get("language_note")),
        "has_i18n": bool(meta.get("i18n")),
        "status": new_status,
    }


def main() -> None:
    args = sys.argv[1:]
    if "--draft-hospitals" in args or "--all" in args or "--sample" in " ".join(args):
        draft_unverified_hospitals()

    target_slug = None
    sample_n = 0
    run_all = "--all" in args
    resume = "--resume" in args

    for a in args:
        if a.startswith("--slug="):
            target_slug = a.split("=", 1)[1].strip()
        elif a.startswith("--sample="):
            sample_n = int(a.split("=", 1)[1])

    done_slugs: set[str] = set()
    if resume and CHECKPOINT_PATH.exists():
        try:
            done_slugs = set(json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8")).get("completed", []))
            print(f"[*] Resuming from checkpoint ({len(done_slugs)} clinics already completed).")
        except Exception:
            pass

    if target_slug:
        rows = db_query("SELECT * FROM clinics WHERE slug = $1", [target_slug])
    elif sample_n > 0:
        rows = db_query(
            """
            SELECT * FROM clinics
            WHERE status != 'draft'
            ORDER BY (metadata->>'rating_count')::int DESC NULLS LAST
            LIMIT $1
            """,
            [sample_n],
        )
    elif run_all:
        rows = db_query(
            """
            SELECT * FROM clinics
            WHERE status != 'draft'
            ORDER BY (metadata->>'rating_count')::int DESC NULLS LAST
            """
        )
    else:
        return

    report_rows = []
    for idx, c in enumerate(rows, 1):
        if c["slug"] in done_slugs:
            continue
        print(f"\n### [{idx}/{len(rows)}] ###")
        info = rescan_one_clinic(c)
        report_rows.append(info)
        done_slugs.add(c["slug"])
        CHECKPOINT_PATH.write_text(json.dumps({"completed": sorted(done_slugs)}, indent=2), encoding="utf-8")

    if report_rows:
        with open(REPORT_CSV_PATH, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(report_rows[0].keys()))
            writer.writeheader()
            writer.writerows(report_rows)
        print(f"\n[+] Saved rescan report to {REPORT_CSV_PATH}")


if __name__ == "__main__":
    main()

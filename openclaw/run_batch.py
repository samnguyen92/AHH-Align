"""
run_batch.py — OpenClaw batch clinic pipeline.

Reads targets from targets.json (same directory). Each target may have:
  name         (required) — clinic name passed to searcher and extractor
  domain       (optional) — domain hint for the URL search
  notes        (optional) — free-text description, not used in pipeline
  force_refresh (optional) — set true to re-scrape even if already in DB

Idempotency: before scraping, checks if a clinic with the same slug already
exists in Supabase. Skips if found (unless force_refresh = true).
"""

import json
import os
import sys
import time
from typing import Optional

from dotenv import load_dotenv

# Load env vars from openclaw/.env and Next.js ../.env.local
load_dotenv(".env")
load_dotenv("../.env.local")

from db import generate_slug, insert_clinic
from extractor import extract_clinic_data
from google_places import enrich_clinic_with_google_places
from image_generator import generate_clinic_image
from scraper import scrape_content_from_url
from searcher import search_hospital_url
from third_party_profiles import enrich_clinic_with_third_party_profiles

# Seconds to wait between clinics — avoids hammering search APIs and target sites
BATCH_RATE_LIMIT_SECONDS = float(os.environ.get("OPENCLAW_BATCH_RATE_LIMIT", "2"))

# Path to the targets config file
TARGETS_FILE = os.path.join(os.path.dirname(__file__), "targets.json")


def _load_targets() -> list:
    """Load clinic targets from targets.json."""
    if not os.path.exists(TARGETS_FILE):
        print(f"[!] targets.json not found at {TARGETS_FILE}")
        print("    Create targets.json with a JSON array of {name, domain} objects.")
        sys.exit(1)

    with open(TARGETS_FILE, encoding="utf-8") as f:
        targets = json.load(f)

    if not isinstance(targets, list) or not targets:
        print("[!] targets.json must be a non-empty JSON array.")
        sys.exit(1)

    return targets


def _check_env() -> None:
    missing = []
    if not os.environ.get("OPENROUTER_API_KEY"):
        missing.append("OPENROUTER_API_KEY")
    if not os.environ.get("NEXT_PUBLIC_SUPABASE_URL"):
        missing.append("NEXT_PUBLIC_SUPABASE_URL")
    if not (os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")):
        missing.append("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY")

    if missing:
        print(f"[!] Missing environment variables: {', '.join(missing)}")
        print("    Copy them from Next.js .env.local to openclaw/.env")
        sys.exit(1)


def _clinic_already_exists(name: str) -> bool:
    """
    Check if a clinic with the same slug already exists in Supabase.
    This prevents re-scraping clinics that were already processed successfully.
    """
    try:
        from supabase import create_client

        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url or not supabase_key:
            return False

        supabase = create_client(supabase_url, supabase_key)
        slug = generate_slug(name)
        result = supabase.table("clinics").select("id, name").eq("slug", slug).limit(1).execute()
        if result.data:
            print(f"[*] Clinic already in DB (slug: {slug}): {result.data[0].get('name')}")
            return True
        return False
    except Exception as exc:
        # If check fails, proceed with scraping (safe default)
        print(f"[!] DB pre-check failed for '{name}': {exc}. Proceeding with scraping.")
        return False


def _process_target(target: dict) -> bool:
    """
    Run the full pipeline for one clinic target.
    Returns True if successfully saved to DB.
    """
    name = target.get("name", "").strip()
    domain = target.get("domain", "").strip() or None
    force_refresh = bool(target.get("force_refresh", False))

    if not name:
        print("[!] Skipping target with no name.")
        return False

    print(f"\n{'='*50}")
    print(f"  Processing: {name}")
    if domain:
        print(f"  Domain hint: {domain}")
    print(f"{'='*50}")

    # ── Idempotency check ──────────────────────────────────────────────────────
    if not force_refresh and _clinic_already_exists(name):
        print(f"[*] Skipping '{name}' — already in DB. Set force_refresh=true to re-process.")
        return False

    # ── 1. Search ──────────────────────────────────────────────────────────────
    url = search_hospital_url(name, domain)
    if not url:
        print(f"[!] Could not find URL for '{name}'. Skipping.")
        return False

    # ── 2. Scrape ──────────────────────────────────────────────────────────────
    content = scrape_content_from_url(url)
    text = content.get("markdown_content") or content.get("text") or ""
    if not text:
        print(f"[!] Scraping returned no useful text for {url}. Skipping.")
        return False

    # ── 3. Extract ─────────────────────────────────────────────────────────────
    data = extract_clinic_data(name, content)
    if not data:
        print(f"[!] Extraction failed for '{name}'. Skipping.")
        return False

    data["source_url"] = url

    # Attach scraped images (Google Places enrichment may replace these)
    source_images = content.get("images", [])
    if source_images:
        data["images"] = source_images

    # Propagate scraper-detected links and metadata
    for link_key in ["website", "appointment_url"]:
        if not data.get(link_key) and content.get(link_key):
            data[link_key] = content[link_key]

    for scrape_key in ["json_ld_schemas", "important_links", "iframe_sources"]:
        if content.get(scrape_key):
            data[scrape_key] = content[scrape_key]

    # ── 4. Enrich with Google Places ───────────────────────────────────────────
    data = enrich_clinic_with_google_places(data)

    # ── 4b. Optional third-party profiles (Zocdoc, Healthgrades, etc.) ─────────
    data = enrich_clinic_with_third_party_profiles(data)

    # Prefer Google Places photos when available; otherwise use website images
    # or generate a fallback image with AI.
    if not data.get("images"):
        generated_image = generate_clinic_image(data)
        if generated_image:
            data["images"] = [generated_image]

    # ── 5. Save to Supabase ────────────────────────────────────────────────────
    success = insert_clinic(data)
    if success:
        print(f"[+] Saved clinic: {name}")
    else:
        print(f"[!] DB insert/update failed for '{name}'.")

    return bool(success)


def main() -> None:
    print("=========================================")
    print(" OpenClaw AI Pipeline — Batch Processor  ")
    print("=========================================\n")

    _check_env()

    targets = _load_targets()
    print(f"[*] Loaded {len(targets)} target(s) from targets.json\n")

    success_count = 0
    skipped_count = 0

    for index, target in enumerate(targets, start=1):
        print(f"\n[{index}/{len(targets)}]", end=" ")

        result = _process_target(target)
        if result:
            success_count += 1
        elif not bool(target.get("force_refresh")) and _clinic_already_exists(target.get("name", "")):
            # Already counted as skipped — just don't double-count
            pass
        else:
            skipped_count += 1

        # Rate limiting between targets to avoid overwhelming search APIs and sites
        if index < len(targets):
            time.sleep(BATCH_RATE_LIMIT_SECONDS)

    print(f"\n{'='*50}")
    print(f" Batch complete!")
    print(f" Processed:  {success_count}/{len(targets)} clinics saved")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()

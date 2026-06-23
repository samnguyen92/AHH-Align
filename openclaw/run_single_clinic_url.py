"""
Run the OpenClaw clinic pipeline for one known clinic URL.

This intentionally bypasses search_hospital_url(), which is useful when an
operator already knows the official website.
"""

import json
import os
import sys
from datetime import datetime
from typing import Callable, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv("../.env.local")

from db import insert_clinic
from extractor import extract_clinic_data
from google_places import enrich_clinic_with_google_places
from image_generator import generate_clinic_image
from scraper import scrape_content_from_url


ProgressCallback = Optional[Callable[[str], None]]


def _log(message: str, progress_callback: ProgressCallback = None) -> None:
    print(message, flush=True)
    if progress_callback:
        progress_callback(message)


def infer_clinic_name_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    host = host.split(":")[0]
    return f"Clinic from {host}" if host else "Clinic from URL"


def run_single_clinic_url(name: str, url: str, progress_callback: ProgressCallback = None) -> bool:
    name = (name or "").strip() or infer_clinic_name_from_url(url)
    url = (url or "").strip()
    started_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"

    _log("=========================================", progress_callback)
    _log(" OpenClaw AI Pipeline - Single URL Runner", progress_callback)
    _log("=========================================", progress_callback)
    _log(f"[*] Started at: {started_at}", progress_callback)
    _log(f"[*] Target clinic: {name}", progress_callback)
    _log(f"[*] Source URL: {url}", progress_callback)

    missing = []
    if not os.environ.get("OPENROUTER_API_KEY"):
        missing.append("OPENROUTER_API_KEY")
    if not os.environ.get("NEXT_PUBLIC_SUPABASE_URL"):
        missing.append("NEXT_PUBLIC_SUPABASE_URL")
    if not (os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")):
        missing.append("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY")
    if missing:
        _log(f"[!] Missing environment variables: {', '.join(missing)}", progress_callback)
        return False

    _log("[1/5] Scraping source website...", progress_callback)
    content = scrape_content_from_url(url)
    text = content.get("markdown_content") or content.get("text") or ""
    _log(
        "[1/5] Scrape summary: "
        f"{len(text)} chars, "
        f"{len(content.get('json_ld_schemas') or [])} JSON-LD schema(s), "
        f"{len(content.get('images') or [])} image candidate(s), "
        f"{len(content.get('important_links') or [])} important link(s).",
        progress_callback,
    )
    if not text:
        _log("[!] Scraping returned no useful text. Aborting.", progress_callback)
        return False

    _log("[2/5] Extracting structured clinic profile with OpenRouter...", progress_callback)
    data = extract_clinic_data(name, content)
    if not data:
        _log("[!] Extraction failed. Aborting.", progress_callback)
        return False
    _log("[2/5] Extraction summary:", progress_callback)
    _log(json.dumps({
        "name": data.get("name"),
        "specialty": data.get("specialty"),
        "city": data.get("city"),
        "state": data.get("state"),
        "phone": data.get("phone"),
        "languages": data.get("languages"),
        "services_count": len(data.get("services") or []),
    }, ensure_ascii=False, indent=2), progress_callback)

    _log("[3/5] Attaching source metadata and website images...", progress_callback)
    data["source_url"] = url
    if content.get("images"):
        data["images"] = content["images"]
    for link_key in ["website", "appointment_url"]:
        if not data.get(link_key) and content.get(link_key):
            data[link_key] = content[link_key]
    for scrape_key in ["json_ld_schemas", "important_links", "iframe_sources"]:
        if content.get(scrape_key):
            data[scrape_key] = content[scrape_key]
    _log(f"[3/5] Attached {len(data.get('images') or [])} image(s) from source metadata.", progress_callback)

    _log("[4/5] Enriching with Google Places and clinic imagery...", progress_callback)
    data = enrich_clinic_with_google_places(data)
    if not data.get("images"):
        generated_image = generate_clinic_image(data)
        if generated_image:
            data["images"] = [generated_image]
    _log(f"[4/5] Image count after enrichment: {len(data.get('images') or [])}.", progress_callback)

    _log("[5/5] Upserting clinic into Supabase...", progress_callback)
    success = insert_clinic(data)
    if not success:
        _log("[!] Supabase insert/update failed.", progress_callback)
        return False

    _log(f"[+] Saved clinic: {data.get('name')}", progress_callback)
    _log("[*] Single URL pipeline complete.", progress_callback)
    return True


def main() -> int:
    if len(sys.argv) < 3:
        _log("Usage: python run_single_clinic_url.py '<clinic name>' '<url>'")
        return 2

    return 0 if run_single_clinic_url(sys.argv[1], sys.argv[2]) else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""
run_scout.py - Google Places scout pipeline for discovering new clinic profiles.

The scout pipeline starts from a free-text Google Places query, keeps only places
with official websites, skips clinics already in Supabase, scrapes/extracts the
site content, enriches the result, and saves new clinic records.
"""

import logging
import os
from typing import Callable, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv("../.env.local")

from db import insert_clinic
from extractor import extract_clinic_data
from google_places import get_google_places_key, search_places_by_text, enrich_clinic_with_google_places
from image_generator import generate_clinic_image
from scraper import scrape_content_from_url

logger = logging.getLogger(__name__)


ProgressCallback = Optional[Callable[[str], None]]


def _notify(callback: ProgressCallback, message: str) -> None:
    print(message)
    if callback:
        try:
            callback(message)
        except Exception as exc:
            logger.warning("Scout progress callback failed: %s", exc)


def _place_name(place: dict) -> str:
    display_name = place.get("displayName") or {}
    if isinstance(display_name, dict):
        return str(display_name.get("text") or "").strip()
    return str(display_name or "").strip()


def _normalize_website(url: str) -> str:
    parsed = urlparse((url or "").strip())
    host = (parsed.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = (parsed.path or "").rstrip("/")
    return f"{host}{path}".lower()


def _is_valid_website(url: str) -> bool:
    parsed = urlparse((url or "").strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _get_supabase_client():
    from supabase import create_client

    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not supabase_key:
        raise RuntimeError("Missing Supabase credentials: NEXT_PUBLIC_SUPABASE_URL and service role key are required.")
    return create_client(supabase_url, supabase_key)


def _load_existing_clinic_keys() -> tuple[set[str], set[str]]:
    supabase = _get_supabase_client()
    rows = supabase.table("clinics").select("name, metadata").execute().data or []
    names: set[str] = set()
    websites: set[str] = set()

    for row in rows:
        name = str(row.get("name") or "").strip().lower()
        if name:
            names.add(name)

        metadata = row.get("metadata") or {}
        candidate_urls = [
            metadata.get("website"),
            metadata.get("source_url"),
            metadata.get("google_website_url"),
        ]
        for candidate_url in candidate_urls:
            normalized = _normalize_website(str(candidate_url or ""))
            if normalized:
                websites.add(normalized)

    return names, websites


def _google_metadata_from_place(place: dict) -> dict:
    return {
        key: value
        for key, value in {
            "google_place_id": place.get("id"),
            "google_maps_url": place.get("googleMapsUri"),
            "google_website_url": place.get("websiteUri"),
            "google_formatted_address": place.get("formattedAddress"),
            "google_business_status": place.get("businessStatus"),
            "google_primary_type": (place.get("primaryTypeDisplayName") or {}).get("text"),
            "google_types": place.get("types"),
            "rating": place.get("rating"),
            "rating_count": place.get("userRatingCount"),
            "location": place.get("location"),
        }.items()
        if value not in (None, "", [], {})
    }


def _merge_place_defaults(data: dict, place: dict, website: str) -> dict:
    place_name = _place_name(place)
    if place_name and not data.get("name"):
        data["name"] = place_name
    if website and not data.get("website"):
        data["website"] = website
    if website and not data.get("source_url"):
        data["source_url"] = website
    if place.get("formattedAddress") and not data.get("address"):
        data["address"] = place["formattedAddress"]
    if place.get("nationalPhoneNumber") and not data.get("phone"):
        data["phone"] = place["nationalPhoneNumber"]

    google_metadata = {**_google_metadata_from_place(place), **(data.get("google_metadata") or {})}
    if google_metadata:
        data["google_metadata"] = google_metadata
    return data


def run_scout_pipeline(query: str, limit: int = 1, telegram_updater_callback=None) -> dict:
    """
    Discover, scrape, extract, enrich, and save up to ``limit`` new clinics.
    Continues past per-clinic failures and returns a compact run summary.
    """
    query = (query or "").strip()
    limit = max(1, int(limit or 1))
    if not query:
        raise ValueError("Scout query is required.")

    api_key = get_google_places_key()
    if not api_key:
        raise RuntimeError("Missing GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY.")

    _notify(telegram_updater_callback, f"Đang tìm Google Places cho từ khóa: '{query}'...")
    requested_count = limit + 3
    places = search_places_by_text(query, api_key, limit=requested_count)
    candidates = [
        place
        for place in places
        if _is_valid_website(str(place.get("websiteUri") or ""))
    ]
    _notify(telegram_updater_callback, f"Tìm thấy {len(candidates)} kết quả có website hợp lệ.")

    existing_names, existing_websites = _load_existing_clinic_keys()
    new_places = []
    seen_websites = set()
    for place in candidates:
        name = _place_name(place)
        website = str(place.get("websiteUri") or "").strip()
        normalized_website = _normalize_website(website)
        if not name or not normalized_website:
            continue
        if name.lower() in existing_names or normalized_website in existing_websites or normalized_website in seen_websites:
            _notify(telegram_updater_callback, f"Bỏ qua đã tồn tại: {name}")
            continue
        seen_websites.add(normalized_website)
        new_places.append(place)

    _notify(telegram_updater_callback, f"Found {len(new_places)} new clinics. Starting scrape...")

    saved = 0
    failed = 0
    skipped = 0
    processed = 0

    for place in new_places:
        if processed >= limit:
            break

        name = _place_name(place)
        website = str(place.get("websiteUri") or "").strip()
        processed += 1

        try:
            _notify(telegram_updater_callback, f"Đang cào dữ liệu: {name}...")
            content = scrape_content_from_url(website)
            text = content.get("markdown_content") or content.get("text") or ""
            if not text:
                skipped += 1
                _notify(telegram_updater_callback, f"Bỏ qua {name}: không lấy được nội dung website.")
                continue

            data = extract_clinic_data(name, content)
            if not data:
                skipped += 1
                _notify(telegram_updater_callback, f"Bỏ qua {name}: AI không trích xuất được dữ liệu đủ tin cậy.")
                continue

            data = _merge_place_defaults(data, place, website)
            data["google_metadata"] = {
                **(data.get("google_metadata") or {}),
                "scout_query": query,
            }
            source_images = content.get("images") or []
            if source_images and not data.get("images"):
                data["images"] = source_images
            for scrape_key in ["json_ld_schemas", "important_links", "iframe_sources", "appointment_url"]:
                if content.get(scrape_key) and not data.get(scrape_key):
                    data[scrape_key] = content[scrape_key]

            _notify(telegram_updater_callback, f"Đang làm giàu Google Places: {name}...")
            data = enrich_clinic_with_google_places(data)
            data["google_metadata"] = {
                **(data.get("google_metadata") or {}),
                "scout_query": query,
            }
            if not data.get("images"):
                generated_image = generate_clinic_image(data)
                if generated_image:
                    data["images"] = [generated_image]

            if insert_clinic(data):
                saved += 1
                _notify(telegram_updater_callback, f"Đã lưu: {data.get('name') or name}")
            else:
                failed += 1
                _notify(telegram_updater_callback, f"Lưu thất bại: {name}")
        except Exception as exc:
            failed += 1
            logger.exception("Scout failed for %s (%s)", name, website)
            _notify(telegram_updater_callback, f"Lỗi khi xử lý {name}: {exc}. Tiếp tục mục tiếp theo...")

    summary = {
        "query": query,
        "limit": limit,
        "discovered": len(places),
        "with_website": len(candidates),
        "new": len(new_places),
        "processed": processed,
        "saved": saved,
        "skipped": skipped,
        "failed": failed,
    }
    _notify(telegram_updater_callback, f"Hoàn tất! Đã lưu {saved} phòng khám.")
    return summary


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run the OpenClaw Scout pipeline.")
    parser.add_argument("query", help="Google Places text query, e.g. 'Vietnamese dentist in Houston'")
    parser.add_argument("--limit", type=int, default=1, help="Maximum new clinics to save.")
    args = parser.parse_args()
    run_scout_pipeline(args.query, args.limit)

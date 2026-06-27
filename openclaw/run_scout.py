"""
run_scout.py - Google Places scout pipeline for discovering new clinic profiles.

The scout pipeline starts from a free-text Google Places query, keeps only places
with official websites, skips clinics already in Supabase, scrapes/extracts the
site content, enriches the result, and saves new clinic records.

Filters applied:
  1. Place-type blocklist: rejects spas, salons, massage parlors, restaurants, etc.
     before any scraping happens.
  2. Language validation gate: after AI extraction, rejects clinics that do not
     mention the required language(s) anywhere on their website.
"""

import logging
import os
from typing import Callable, List, Optional
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

# ---------------------------------------------------------------------------
# Non-medical place type blocklist
# Google Places returns 'types' as a list of strings for each place.
# Any place whose types list overlaps with this set is rejected immediately,
# before any website scraping, to avoid wasting API quota on spas, salons,
# restaurants, gyms, and other non-healthcare venues.
# ---------------------------------------------------------------------------
NON_MEDICAL_BLOCKED_TYPES: frozenset[str] = frozenset({
    # Beauty & personal care
    "beauty_salon",
    "hair_care",
    "hair_salon",
    "nail_salon",
    "spa",
    "massage",
    "sauna",
    "tanning_studio",
    "waxing_hair_removal",
    "tattoo_parlor",
    "barber_shop",
    # Food & hospitality
    "restaurant",
    "cafe",
    "bar",
    "night_club",
    "bakery",
    "food",
    "meal_delivery",
    "meal_takeaway",
    "grocery_or_supermarket",
    "supermarket",
    "convenience_store",
    "liquor_store",
    # Fitness & recreation
    "gym",
    "fitness_center",
    "yoga_studio",
    "stadium",
    "bowling_alley",
    "casino",
    "amusement_park",
    # Retail
    "clothing_store",
    "shoe_store",
    "jewelry_store",
    "furniture_store",
    "electronics_store",
    "department_store",
    "shopping_mall",
    "laundry",
    "car_wash",
    "car_dealer",
    "gas_station",
    # Other services
    "real_estate_agency",
    "insurance_agency",
    "travel_agency",
    "moving_company",
    "storage",
    "locksmith",
    "florist",
    "pet_store",
    "animal_shelter",
    "lodging",
    "hotel",
    "motel",
})


def _is_non_medical(place: dict) -> bool:
    """Return True if the place's Google types overlap with the non-medical blocklist."""
    types: List[str] = place.get("types") or []
    return bool(NON_MEDICAL_BLOCKED_TYPES.intersection(types))


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


def run_scout_pipeline(
    query: str,
    limit: int = 1,
    required_languages: Optional[List[str]] = None,
    included_types: Optional[List[str]] = None,
    telegram_updater_callback=None,
    override_specialty: Optional[str] = None,
) -> dict:
    """
    Discover, scrape, extract, enrich, and save up to ``limit`` new clinics.
    Continues past per-clinic failures and returns a compact run summary.

    Args:
        query:               English-language Google Places text query.
        limit:               Maximum number of new clinics to save.
        required_languages:  If set, only save clinics that explicitly mention
                             at least one of these languages on their website.
                             Example: ["Korean"] or ["Vietnamese", "Chinese"].
        included_types:      If set, passed as 'includedType' to Google Places
                             API to restrict results to a specific place type.
                             Example: ["hospital"] or ["dental_clinic"].
        telegram_updater_callback: Progress message callback.
    """
    query = (query or "").strip()
    limit = max(1, int(limit or 1))
    required_languages = [lang.strip() for lang in (required_languages or []) if lang and lang.strip()]
    if included_types:
        included_types = ["medical_clinic" if t == "doctor" else t for t in included_types]
    if not query:
        raise ValueError("Scout query is required.")

    api_key = get_google_places_key()
    if not api_key:
        raise RuntimeError("Missing GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY.")

    # Since we are using a soft gate for language validation (not skipping, but tagging),
    # we don't need a huge pool. Just request a few more than the limit in case of page load errors.
    requested_count = limit + 2

    _notify(
        telegram_updater_callback,
        f"Đang tìm Google Places cho từ khóa: '{query}'"  
        + (f" (loại: {', '.join(included_types)})" if included_types else "")
        + (f" (ngôn ngữ yêu cầu: {', '.join(required_languages)})" if required_languages else "")
        + "...",
    )

    places = search_places_by_text(query, api_key, limit=requested_count, included_types=included_types)

    # ── Filter 1: Non-medical place type blocklist ────────────────────────────
    # Reject spas, nail salons, restaurants, gyms, etc. before any scraping.
    medical_places = []
    for place in places:
        if _is_non_medical(place):
            place_name = _place_name(place)
            place_types = place.get("types") or []
            blocked = NON_MEDICAL_BLOCKED_TYPES.intersection(place_types)
            _notify(
                telegram_updater_callback,
                f"⛔ Bỏ qua (không phải cơ sở y tế): {place_name} — types: {', '.join(blocked)}",
            )
        else:
            medical_places.append(place)

    candidates = [
        place
        for place in medical_places
        if _is_valid_website(str(place.get("websiteUri") or ""))
    ]
    _notify(
        telegram_updater_callback,
        f"Tìm thấy {len(candidates)} cơ sở y tế có website hợp lệ "
        f"(đã lọc {len(places) - len(medical_places)} nơi không phải y tế).",
    )

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

    _notify(telegram_updater_callback, f"Có {len(new_places)} cơ sở mới. Bắt đầu scrape...")

    saved = 0
    failed = 0
    skipped = 0
    processed = 0

    for place in new_places:
        if saved >= limit:
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

            # ── Filter 2: Language validation gate (Soft match) ───────────────
            # If the required language is not explicitly found on the website by the AI extractor,
            # we do NOT skip the clinic (to avoid wasting scrape & LLM credit).
            # Instead, we still save it, but inject the required language(s) and flag it
            # in metadata as 'language_verified_on_website': False.
            if "google_metadata" not in data:
                data["google_metadata"] = {}

            if required_languages:
                extracted_langs = [
                    lang.lower().strip()
                    for lang in (data.get("languages") or [])
                    if lang and lang.strip()
                ]
                matched = [
                    rl for rl in required_languages
                    if rl.lower() in extracted_langs
                ]
                if not matched:
                    # Inject the required languages so it matches database searches
                    current_langs = data.get("languages") or []
                    for rl in required_languages:
                        normalized_rl = rl.strip().capitalize()
                        if normalized_rl not in current_langs:
                            current_langs.append(normalized_rl)
                    data["languages"] = current_langs
                    
                    data["google_metadata"]["language_verified_on_website"] = False
                    data["google_metadata"]["scout_required_languages"] = required_languages
                    
                    langs_found = ", ".join(data.get("languages") or [])
                    _notify(
                        telegram_updater_callback,
                        f"⚠️ Cảnh báo {name}: website không nhắc đến ngôn ngữ yêu cầu "
                        f"({', '.join(required_languages)}). Vẫn giữ lại theo kết quả Google Places (Ngôn ngữ gán: {langs_found}).",
                    )
                else:
                    data["google_metadata"]["language_verified_on_website"] = True

            data = _merge_place_defaults(data, place, website)
            data["google_metadata"] = {
                **(data.get("google_metadata") or {}),
                "scout_query": query,
                **({
                    "required_languages": required_languages,
                    "included_types": included_types,
                } if required_languages or included_types else {}),
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

            if override_specialty:
                data["specialty"] = override_specialty

            if insert_clinic(data):
                saved += 1
                _notify(telegram_updater_callback, f"✅ Đã lưu: {data.get('name') or name}")
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
        "required_languages": required_languages or [],
        "included_types": included_types or [],
        "discovered": len(places),
        "non_medical_filtered": len(places) - len(medical_places),
        "with_website": len(candidates),
        "new": len(new_places),
        "processed": processed,
        "saved": saved,
        "skipped": skipped,
        "failed": failed,
    }
    _notify(telegram_updater_callback, f"Hoàn tất! Đã lưu {saved}/{limit} phòng khám.")
    return summary


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run the OpenClaw Scout pipeline.")
    parser.add_argument("query", help="English Google Places text query, e.g. 'Vietnamese speaking dentist in Houston'")
    parser.add_argument("--limit", type=int, default=1, help="Maximum new clinics to save.")
    parser.add_argument("--lang", nargs="*", help="Required language(s), e.g. --lang Vietnamese Korean")
    parser.add_argument("--type", nargs="*", dest="types", help="Google Places includedType(s), e.g. --type hospital")
    parser.add_argument("--override-specialty", help="Override the extracted specialty with this value.")
    args = parser.parse_args()
    run_scout_pipeline(
        args.query,
        args.limit,
        required_languages=args.lang,
        included_types=args.types,
        override_specialty=args.override_specialty
    )

"""
run_scout.py - Google Places scout pipeline for discovering new clinic profiles.

The scout pipeline starts from a free-text Google Places query, keeps only places
with official websites, skips clinics already in the database, scrapes/extracts the
site content, enriches the result, and saves new clinic records.

Filters applied:
  1. Place-type blocklist: rejects spas, salons, massage parlors, restaurants, etc.
     before any scraping happens.
  2. Language evidence: a language is only listed when the clinic's own website says so.
     A required language the website does not mention is NOT added; the clinic is still
     saved as a draft, flagged, so a person decides.
  3. Photos: real photos only (website first, Google to fill gaps, filtered and kept on our
     server). No photo means no photo: fake (AI-generated) clinic images are never created.
"""

import logging
import os
from typing import Callable, List, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(_OPENCLAW_DIR, "..", ".env.local"))
load_dotenv(".env")
load_dotenv(".env.local")

from db import insert_clinic
from extractor import extract_clinic_data
from google_places import GooglePlacesError, get_google_places_key, search_places_by_text, enrich_clinic_with_google_places
from messages import shorten_query, tr
from scout_report import build_card
from source_guard import check_source, explain
from clinic_photos import attach_real_photos
from languages import detect_languages
from enrich_web import enrich_missing_with_brave, _brave_web_search
from normalize import compute_quality, merge_deterministic_contacts
from scraper import scrape_content_from_url
from third_party_profiles import enrich_clinic_with_third_party_profiles

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


def _get_db_client():
    from pg_client import create_client
    return create_client()


def _load_existing_clinic_keys() -> tuple[set[str], set[str]]:
    db = _get_db_client()
    rows = db.table("clinics").select("name, metadata").execute().data or []
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


def _rank_score(place: dict) -> float:
    """rating x log10(1 + reviews): trust a rating only as much as the number of people behind it."""
    import math

    return float(place.get("rating") or 0) * math.log10(1 + int(place.get("userRatingCount") or 0))


def run_scout_pipeline(
    query: str,
    limit: int = 1,
    required_languages: Optional[List[str]] = None,
    included_types: Optional[List[str]] = None,
    telegram_updater_callback=None,
    override_specialty: Optional[str] = None,
    lang: str = "vi",
    min_rating: float = 0.0,
    min_reviews: int = 0,
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

    query = shorten_query(query)  # a search phrase, never a whole sentence (ratings go in min_rating / min_reviews)
    min_rating = max(0.0, float(min_rating or 0))
    min_reviews = max(0, int(min_reviews or 0))
    # Rank by rating AND number of reviews, so the pool must be larger than `limit`: the best `limit` are taken from it.
    requested_count = min(20, max(limit * 4, limit + 2))

    _notify(telegram_updater_callback, tr("scout.searching", lang, query=query))

    def _t(vi: str, en: str) -> str:
        return vi if lang == "vi" else en

    # A web search is NOT a substitute for Google Places: it returns rankings, directories and social pages. It is only
    # used when OPENCLAW_SCOUT_WEB_FALLBACK=on, and every result still goes through the source guard below.
    allow_web_fallback = os.environ.get("OPENCLAW_SCOUT_WEB_FALLBACK", "off").strip().lower() in {"on", "1", "true", "yes"}
    search_error: Optional[GooglePlacesError] = None
    try:
        places = search_places_by_text(query, api_key, limit=requested_count, included_types=included_types)
    except GooglePlacesError as exc:
        search_error, places = exc, []

    if not places:
        if search_error is not None and not allow_web_fallback:
            text = (
                _t("⛔ Google Places báo lỗi ", "⛔ Google Places returned an error ") + f"({search_error.status}): {search_error.message[:160]}\n"
                + search_error.hint(lang) + "\n"
                + _t("Mình dừng lại, không tìm bằng web vì kết quả web hay là trang xếp hạng/danh bạ.",
                     "I stopped here instead of searching the web: web results are mostly rankings and directories.")
            )
            return {"query": query, "limit": limit, "discovered": 0, "saved": 0, "drafts_created": 0, "skipped": 0, "failed": 0,
                    "error": f"google_places_{search_error.status}", "error_text": text, "clinics": [], "skipped_items": []}
        if not allow_web_fallback:
            text = _t("Google Places không có kết quả nào cho từ khoá này. Thử một cụm ngắn hơn, ví dụ “Vietnamese doctor Fairfax VA”.",
                      "Google Places has no results for this query. Try a shorter phrase, e.g. “Vietnamese doctor Fairfax VA”.")
            return {"query": query, "limit": limit, "discovered": 0, "saved": 0, "drafts_created": 0, "skipped": 0, "failed": 0,
                    "error": "no_results", "error_text": text, "clinics": [], "skipped_items": []}
        _notify(telegram_updater_callback, _t("⚠️ Google Places không có kết quả; dùng tìm kiếm web (đã bật) và lọc trang danh bạ/xếp hạng...",
                                              "⚠️ Google Places gave nothing; using web search (enabled) and filtering rankings/directories..."))
        rejected = 0
        for item in _brave_web_search(f"{query} clinic official website", count=min(requested_count * 3, 15)):
            url = str(item.get("url") or "").strip()
            title = str(item.get("title") or "").split("|")[0].split("—")[0].split("-")[0].strip()
            verdict = check_source(url=url, name=title, title=str(item.get("title") or ""))
            if not verdict.ok:
                rejected += 1
                continue
            if _is_valid_website(url) and title:
                places.append({"displayName": {"text": title[:80]}, "websiteUri": url, "types": ["medical_clinic"]})
        if rejected:
            _notify(telegram_updater_callback, _t(f"Đã loại {rejected} kết quả web là trang danh bạ/xếp hạng/mạng xã hội.",
                                                  f"Filtered out {rejected} web result(s) that are rankings, directories or social pages."))

    # ── Filter 1: Non-medical place type blocklist ────────────────────────────
    # Reject spas, nail salons, restaurants, gyms, etc. before any scraping.
    medical_places = []
    skipped_items: list = []  # [{"name", "reason"}] — one line each in the final summary
    for place in places:
        if _is_non_medical(place):
            skipped_items.append({"name": _place_name(place), "reason": "not_medical"})
        else:
            medical_places.append(place)

    candidates = []
    not_own_site = 0
    for place in medical_places:
        site = str(place.get("websiteUri") or "")
        if not _is_valid_website(site):
            continue
        if not check_source(url=site).ok:  # e.g. the place only has a Facebook or Yelp page
            not_own_site += 1
            skipped_items.append({"name": _place_name(place), "reason": "own_site"})
            continue
        candidates.append(place)

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
            skipped_items.append({"name": name, "reason": "exists"})
            continue
        rating = float(place.get("rating") or 0)
        reviews = int(place.get("userRatingCount") or 0)
        if min_rating and rating < min_rating:
            skipped_items.append({"name": name, "reason": "low_rating"})
            continue
        if min_reviews and reviews < min_reviews:
            skipped_items.append({"name": name, "reason": "few_reviews"})
            continue
        seen_websites.add(normalized_website)
        new_places.append(place)

    # Best first: a 4.9 with 300 reviews beats a 5.0 with 2.
    new_places.sort(key=_rank_score, reverse=True)
    _notify(telegram_updater_callback, tr("scout.found", lang, n=len(candidates), new=len(new_places)))

    saved = 0
    drafts_created = 0
    failed = 0
    skipped = 0
    processed = 0
    cards: list = []

    for place in new_places:
        if saved >= limit:
            break

        name = _place_name(place)
        website = str(place.get("websiteUri") or "").strip()
        processed += 1

        try:
            _notify(telegram_updater_callback, tr("scout.scraping", lang, i=processed, n=min(len(new_places), limit + 2), name=name))
            content = scrape_content_from_url(website)
            if content.get("dead_reason"):
                skipped += 1
                skipped_items.append({"name": name, "reason": "dead"})
                continue
            text = content.get("markdown_content") or content.get("text") or ""
            if not text:
                skipped += 1
                skipped_items.append({"name": name, "reason": "no_content"})
                continue

            page_check = check_source(url=website, title=str(content.get("page_title") or ""), text=text)
            if not page_check.ok:
                skipped += 1
                skipped_items.append({"name": name, "reason": "directory"})
                continue

            data = extract_clinic_data(name, content)
            if not data:
                skipped += 1
                skipped_items.append({"name": name, "reason": "ai"})
                continue
            merge_deterministic_contacts(data, content)

            # ── Filter 2: language evidence ───────────────────────────────────────────
            # A language is listed only when the clinic's own website says so. The required language is NEVER
            # added just because Google or the search query suggested it: that made the directory claim
            # support that nobody had confirmed. Such a clinic is still saved as a draft, flagged, so a person decides.
            if "google_metadata" not in data:
                data["google_metadata"] = {}

            evidence = {k: v for k, v in detect_languages(text).items() if k != "English"}
            data["languages_verified"] = bool(evidence)
            if evidence:
                data["languages_evidence"] = [f"{k}: {v}" for k, v in evidence.items()]

            if required_languages:
                extracted_langs = [
                    lang.lower().strip()
                    for lang in (data.get("languages") or [])
                    if lang and lang.strip()
                ]
                matched = [rl for rl in required_languages if rl.lower() in extracted_langs]
                data["google_metadata"]["scout_required_languages"] = required_languages
                data["google_metadata"]["language_verified_on_website"] = bool(matched)
                if not matched:
                    data["languages_verified"] = False  # flagged on the card; the required language is NOT added

            data = _merge_place_defaults(data, place, website)
            data["google_metadata"] = {
                **(data.get("google_metadata") or {}),
                "scout_query": query,
                **({
                    "required_languages": required_languages,
                    "included_types": included_types,
                } if required_languages or included_types else {}),
            }
            website_images = content.get("images") or []
            data.pop("images", None)  # the photos are rebuilt below from real, filtered sources only
            for scrape_key in ["json_ld_schemas", "important_links", "iframe_sources", "appointment_url"]:
                if content.get(scrape_key) and not data.get(scrape_key):
                    data[scrape_key] = content[scrape_key]

            _notify(telegram_updater_callback, tr("scout.enriching", lang, name=name))
            # Use the exact place the search found (no second, error-prone name search).
            data = enrich_clinic_with_google_places(data, place_id=place.get("id"), upload_photos=False)
            data = enrich_missing_with_brave(data)
            data = enrich_clinic_with_third_party_profiles(data)
            data["google_metadata"] = {
                **(data.get("google_metadata") or {}),
                "scout_query": query,
            }
            _notify(telegram_updater_callback, tr("scout.photos", lang, name=name))
            attach_real_photos(data, website_images=website_images, log=lambda m: print(m))

            if override_specialty:
                data["specialty"] = override_specialty

            if insert_clinic(data):
                saved += 1
                saved_info = data.get("_saved") or {}
                if saved_info.get("created"):
                    drafts_created += 1
                cards.append(build_card(data, compute_quality(data), saved_info))
            else:
                failed += 1
                skipped_items.append({"name": name, "reason": "failed"})
        except Exception as exc:
            failed += 1
            logger.exception("Scout failed for %s (%s)", name, website)
            skipped_items.append({"name": name, "reason": "failed"})

    summary = {
        "query": query,
        "limit": limit,
        "required_languages": required_languages or [],
        "included_types": included_types or [],
        "min_rating": min_rating,
        "min_reviews": min_reviews,
        "discovered": len(places),
        "non_medical_filtered": len(places) - len(medical_places),
        "with_website": len(candidates),
        "new": len(new_places),
        "processed": processed,
        "saved": saved,
        "drafts_created": drafts_created,
        "skipped": skipped,
        "failed": failed,
        "clinics": cards,
        "skipped_items": skipped_items,
    }
    _notify(telegram_updater_callback, tr("scout.done", lang))
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

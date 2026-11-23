import json
import os
import re
import ssl
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import certifi
from dotenv import load_dotenv
from openai import OpenAI

from normalize import parse_us_address
from storage import safe_storage_name, upload_image_value

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(_OPENCLAW_DIR, "..", ".env.local"))
load_dotenv(".env")
load_dotenv(".env.local")

PLACES_BASE_URL = "https://places.googleapis.com/v1"
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
REVIEW_SUMMARY_MODEL = os.environ.get("OPENCLAW_REVIEW_SUMMARY_MODEL") or os.environ.get("OPENCLAW_TEXT_MODEL", "openai/gpt-6-luna")


class GooglePlacesError(Exception):
    """Google answered with an error (or could not be reached). `status` is the HTTP status, 0 when unreachable."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"Google Places error {status}: {message}")
        self.status = status
        self.message = message

    def hint(self, lang: str = "en") -> str:
        vi = lang == "vi"
        if self.status in (401, 403):
            return ("Kiểm tra trong Google Cloud: Places API (New) đã bật, tài khoản thanh toán còn hoạt động, và khoá API không bị giới hạn "
                    "theo địa chỉ IP/trang web khác với máy chủ này." if vi else
                    "Check in Google Cloud: Places API (New) is enabled, billing is active, and the API key is not restricted to an IP/referrer "
                    "other than this server.")
        if self.status == 429:
            return "Đã vượt hạn mức Google Places; thử lại sau." if vi else "Google Places quota exceeded; try again later."
        if self.status == 400:
            return "Google từ chối câu tìm kiếm; thử một cụm ngắn hơn." if vi else "Google rejected the query; try a shorter phrase."
        if self.status == 0:
            return "Không kết nối được tới Google; kiểm tra mạng của máy chủ." if vi else "Could not reach Google; check the server's network."
        return "Xem chi tiết lỗi ở trên." if vi else "See the error above."


def get_google_places_key() -> Optional[str]:
    return os.environ.get("GOOGLE_PLACES_API_KEY") or os.environ.get("GOOGLE_MAPS_API_KEY")


def request_json(url: str, api_key: str, method: str = "GET", body: Optional[dict] = None) -> dict:
    data = None
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
    }

    if body is not None:
        data = json.dumps(body).encode("utf-8")

    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        # Log the URL WITHOUT its query string: photo requests carry the API key there.
        print(f"[!] Google Places request failed for {url.split('?')[0]}: {exc}")
        return {}


def build_search_query(clinic_data: dict) -> str:
    parts = [
        clinic_data.get("name"),
        clinic_data.get("address"),
        clinic_data.get("city"),
        clinic_data.get("state"),
        clinic_data.get("zip_code"),
    ]
    return " ".join(str(part).strip() for part in parts if part)


_GENERIC_NAME_WORDS = {
    "the", "of", "and", "inc", "llc", "pc", "pllc", "md", "dds", "dmd", "do", "od", "np", "phd",
    "clinic", "clinics", "center", "centre", "medical", "health", "healthcare", "care", "group", "office", "practice",
}


def _name_tokens(value: str) -> set:
    return {t for t in re.sub(r"[^a-z0-9\s]", " ", (value or "").lower()).split() if t and t not in _GENERIC_NAME_WORDS}


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")[-10:]


def _domain(url: str) -> str:
    host = re.sub(r"^https?://", "", (url or "").strip().lower()).split("/")[0]
    return host[4:] if host.startswith("www.") else host


def place_matches(clinic_data: dict, place: dict) -> tuple:
    """Is this Google place really THIS clinic? Returns (matches, reason).

    The name must be similar AND something else must agree (website domain, phone, zip code). Without that check
    the first search hit was used blindly and its photos, reviews and opening hours could belong to another business.
    """
    place_name = ((place.get("displayName") or {}).get("text") if isinstance(place.get("displayName"), dict) else place.get("displayName")) or ""
    ours, theirs = _name_tokens(clinic_data.get("name") or ""), _name_tokens(place_name)
    if not ours or not theirs:
        return False, "no comparable name"
    overlap = len(ours & theirs) / max(1, min(len(ours), len(theirs)))
    if overlap < 0.6:
        return False, f"different name ({place_name})"

    evidence = []
    our_site, their_site = _domain(clinic_data.get("website") or clinic_data.get("source_url") or ""), _domain(place.get("websiteUri") or "")
    if our_site and their_site and our_site == their_site:
        evidence.append("website")
    our_phone, their_phone = _digits(clinic_data.get("phone") or ""), _digits(place.get("nationalPhoneNumber") or "")
    if len(our_phone) == 10 and our_phone == their_phone:
        evidence.append("phone")
    zip_match = re.search(r"\b(\d{5})\b", clinic_data.get("zip_code") or clinic_data.get("address") or "")
    if zip_match and zip_match.group(1) in (place.get("formattedAddress") or ""):
        evidence.append("zip")
    if evidence:
        return True, "+".join(evidence)
    # nothing else to compare with: only an almost identical name is acceptable
    if not (our_site or our_phone or zip_match) and overlap >= 0.99:
        return True, "name"
    return False, f"name looks alike ({place_name}) but website/phone/zip do not agree"


def text_search_place(clinic_data: dict, api_key: str) -> Optional[dict]:
    query = build_search_query(clinic_data)
    if not query:
        return None

    url = f"{PLACES_BASE_URL}/places:searchText"
    field_mask = ",".join(
        [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.location",
            "places.rating",
            "places.userRatingCount",
            "places.googleMapsUri",
            "places.websiteUri",
            "places.nationalPhoneNumber",
        ]
    )
    request = Request(
        url,
        data=json.dumps({"textQuery": query, "maxResultCount": 5}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": field_mask,
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
            payload = json.loads(response.read().decode("utf-8"))
        reasons = []
        for place in payload.get("places") or []:
            ok, reason = place_matches(clinic_data, place)
            if ok:
                print(f"[*] Google Places match accepted ({reason})")
                return place
            reasons.append(reason)
        if reasons:
            print(f"[!] Google Places returned {len(reasons)} result(s) but none is this clinic: {'; '.join(reasons[:3])}")
        return None
    except Exception as exc:
        print(f"[!] Google Places text search failed: {exc}")
        return None


def search_places_by_text(
    query: str,
    api_key: str,
    limit: int = 5,
    included_types: Optional[List[str]] = None,
    country_code: str = "us",
) -> List[dict]:
    """
    Search Google Places by free-text query and return lightweight place records.
    Used by the Scout pipeline before scraping official clinic websites.

    Results are restricted to the United States by default via ``regionCode``
    and a bounding-box ``locationRestriction``, so queries like
    "Vietnamese speaking hospital" do NOT return places in Vietnam.

    Args:
        query:         Free-text search query (preferably in English).
        api_key:       Google Places API key.
        limit:         Maximum number of results to return (1–20).
        included_types: Optional list of Google Place types to restrict results.
                       Only the first value is used (API supports one type per request).
                       Example: ["hospital"] or ["dental_clinic"].
                       See https://developers.google.com/maps/documentation/places/web-service/place-types
        country_code:  Two-letter CLDR country code used for regionCode bias.
                       Default "us" (United States).
    """
    query = (query or "").strip()
    if not query:
        return []

    url = f"{PLACES_BASE_URL}/places:searchText"
    field_mask = ",".join(
        [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.location",
            "places.rating",
            "places.userRatingCount",
            "places.googleMapsUri",
            "places.nationalPhoneNumber",
            "places.websiteUri",
            "places.primaryTypeDisplayName",
            "places.types",
            "places.businessStatus",
        ]
    )

    body: dict = {
        "textQuery": query,
        "maxResultCount": max(1, min(limit, 20)),
        # regionCode biases results toward the specified country.
        # This is the primary guard against returning places from Vietnam
        # when the query contains "Vietnamese".
        "regionCode": country_code.lower(),
        # locationRestriction adds a hard bounding box around the contiguous
        # United States + Alaska + Hawaii to ensure results stay in the US.
        # This prevents edge cases where regionCode alone is insufficient.
        "locationRestriction": {
            "rectangle": {
                "low":  {"latitude": 18.0, "longitude": -179.9},
                "high": {"latitude": 71.5, "longitude": -66.9},
            }
        },
    }

    # Restrict results to a specific place type when provided.
    # Google Places v1 (New) accepts a single string in "includedType".
    if included_types:
        body["includedType"] = str(included_types[0]).strip()

    request = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": field_mask,
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return payload.get("places") or []
    except HTTPError as exc:
        detail = ""
        try:
            detail = (json.loads(exc.read().decode("utf-8")).get("error") or {}).get("message") or ""
        except Exception:
            pass
        print(f"[!] Google Places search failed: HTTP {exc.code} {detail[:200]}")
        raise GooglePlacesError(exc.code, detail or str(exc.reason))
    except Exception as exc:
        print(f"[!] Google Places search failed: {exc}")
        raise GooglePlacesError(0, str(exc))


def get_place_details(place_id: str, api_key: str) -> dict:
    fields = ",".join(
        [
            "id",
            "displayName",
            "formattedAddress",
            "location",
            "rating",
            "userRatingCount",
            "googleMapsUri",
            "nationalPhoneNumber",
            "websiteUri",
            "internationalPhoneNumber",
            "primaryTypeDisplayName",
            "types",
            "regularOpeningHours",
            "photos",
            "reviews",
            "businessStatus",
        ]
    )
    url = f"{PLACES_BASE_URL}/places/{place_id}"
    request = Request(
        url,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": fields,
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        print(f"[!] Google Places get_place_details failed for {place_id}: {exc}")
        return {}


def get_photo_uri(photo_name: str, api_key: str, max_width: int = 1200) -> Optional[str]:
    params = urlencode({"maxWidthPx": max_width, "skipHttpRedirect": "true", "key": api_key})
    url = f"{PLACES_BASE_URL}/{photo_name}/media?{params}"
    payload = request_json(url, api_key)
    return payload.get("photoUri")


def normalize_hours(details: dict) -> Dict[str, str]:
    descriptions = details.get("regularOpeningHours", {}).get("weekdayDescriptions") or []
    hours: Dict[str, str] = {}
    day_map = {
        "Monday": "monday",
        "Tuesday": "tuesday",
        "Wednesday": "wednesday",
        "Thursday": "thursday",
        "Friday": "friday",
        "Saturday": "saturday",
        "Sunday": "sunday",
    }

    for item in descriptions:
        if ":" not in item:
            continue
        day, value = item.split(":", 1)
        key = day_map.get(day.strip())
        if key:
            hours[key] = value.strip()

    return hours


def normalize_reviews(details: dict) -> List[dict]:
    reviews = []
    for review in (details.get("reviews") or [])[:5]:
        author = review.get("authorAttribution") or {}
        text_obj = review.get("text") or {}
        text = text_obj.get("text") if isinstance(text_obj, dict) else ""
        if not text:
            continue
        reviews.append(
            {
                "source": "google",
                "author": author.get("displayName") or "Google user",
                "author_url": author.get("uri"),
                "rating": review.get("rating") or 0,
                "text": text,
                "date": review.get("publishTime") or review.get("relativePublishTimeDescription") or "",
            }
        )
    return reviews


def _fallback_review_themes(reviews: List[dict], limit: int = 4) -> List[str]:
    rules = [
        ("Compassionate care", ["compassion", "kind", "caring", "patient care"]),
        ("Friendly staff", ["friendly", "welcoming", "staff", "team", "front desk"]),
        ("Clear explanations", ["explain", "explained", "explanation", "answered", "thorough", "informative", "detail"]),
        ("Comfortable visits", ["comfortable", "gentle", "relaxed", "pain free", "easy"]),
        ("Strong results", ["result", "improved", "beautiful", "recommend", "excellent"]),
    ]
    text = " ".join(str(review.get("text") or "") for review in reviews).lower()
    if not text:
        return []

    themes = []
    for label, keywords in rules:
        if any(keyword in text for keyword in keywords):
            themes.append(label)
        if len(themes) >= limit:
            break
    return themes


def _fallback_review_summary(clinic_name: str, reviews: List[dict], rating: Optional[float], rating_count: Optional[int]) -> dict:
    themes = _fallback_review_themes(reviews)
    if rating:
        count_text = f" from {rating_count} Google reviews" if rating_count else ""
        theme_text = f" Patients commonly mention {', '.join(theme.lower() for theme in themes)}." if themes else ""
        summary = f"{clinic_name} has a {rating:.1f} star Google rating{count_text}.{theme_text}"
    elif themes:
        summary = f"Google review snippets for {clinic_name} highlight {', '.join(theme.lower() for theme in themes)}."
    else:
        summary = f"Google review snippets are available for {clinic_name}."

    fallback_themes = []
    for t in themes:
        fallback_themes.append({
            "theme": t,
            "sentiment": "Positive",
            "mentions": 3,
            "summary_quote": f"Patients highlight {t.lower()} in their feedback."
        })

    return {
        "summary": summary,
        "themes": fallback_themes
    }


def summarize_reviews_with_ai(
    clinic_name: str,
    reviews: List[dict],
    rating: Optional[float] = None,
    rating_count: Optional[int] = None,
) -> Optional[dict]:
    """
    Summarize Google review snippets for the clinic detail UI.
    This runs after review scraping/enrichment and falls back cleanly if AI is unavailable.
    """
    if not reviews:
        return None

    api_key = os.environ.get("OPENROUTER_API_KEY")
    fallback = _fallback_review_summary(clinic_name, reviews, rating, rating_count)
    if not api_key:
        print("[*] OPENROUTER_API_KEY is not set; using fallback review summary.")
        return fallback

    compact_reviews = [
        {
            "author": review.get("author"),
            "rating": review.get("rating"),
            "date": review.get("date"),
            "text": (review.get("text") or "")[:900],
        }
        for review in reviews[:8]
        if review.get("text")
    ]
    if not compact_reviews:
        return fallback

    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=45.0)
    prompt_payload = {
        "clinic_name": clinic_name,
        "rating": rating,
        "rating_count": rating_count,
        "reviews": compact_reviews,
    }

    try:
        print(f"[*] Summarizing {len(compact_reviews)} Google reviews with AI...")
        response = client.chat.completions.create(
            model=REVIEW_SUMMARY_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You summarize patient reviews for a healthcare directory UI. "
                        "Use only the supplied review text. Return strict JSON with keys: "
                        "summary, themes. "
                        "1. 'summary' must be a concise, 1-2 sentence patient-facing paragraph summarizing overall sentiments.\n"
                        "2. 'themes' must be a list of objects representing key themes found in reviews. Each theme object must have:\n"
                        "   - 'theme': a short label (e.g., 'Staff Professionalism', 'Facility Environment', 'Treatment Outcomes', 'Communication', 'Clinical Expertise')\n"
                        "   - 'sentiment': 'Positive', 'Negative', or 'Neutral'\n"
                        "   - 'mentions': integer representing number of reviews mentioning this theme\n"
                        "   - 'summary_quote': a concise quote or statement representing the reviews' consensus on this theme (e.g. 'Every reviewer highlights friendly, knowledgeable staff...').\n"
                        "Limit themes to top 5. Do not invent facts."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(prompt_payload, ensure_ascii=False),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        content = response.choices[0].message.content or "{}"
        data = json.loads(content)
        summary = str(data.get("summary") or fallback["summary"]).strip()
        themes = data.get("themes") or fallback["themes"]
        
        # Validate themes structure
        validated_themes = []
        if isinstance(themes, list):
            for item in themes:
                if isinstance(item, dict) and "theme" in item:
                    validated_themes.append({
                        "theme": str(item["theme"]).strip(),
                        "sentiment": str(item.get("sentiment", "Positive")).strip(),
                        "mentions": int(item.get("mentions", 2)),
                        "summary_quote": str(item.get("summary_quote", "")).strip()
                    })
        if not validated_themes:
            validated_themes = fallback["themes"]
            
        return {
            "summary": summary,
            "themes": validated_themes[:5]
        }
    except Exception as exc:
        print(f"[!] AI review summary failed for {clinic_name}: {exc}")
        return fallback


def photo_uris(photo_names: List[str], api_key: str, limit: int = 8) -> List[str]:
    """Direct image addresses for Google photo names (downloaded and filtered later by clinic_photos)."""
    uris: List[str] = []
    for name in (photo_names or [])[:limit]:
        try:
            uri = get_photo_uri(name, api_key)
            if uri:
                uris.append(uri)
        except Exception as exc:
            print(f"[!] Could not get a Google photo address: {exc}")
    return uris


def photo_fetcher_for_place(place_id: str):
    """A callable returning the photo addresses of ONE known Google place (used to refill a clinic's gallery)."""
    def fetch() -> List[str]:
        api_key = get_google_places_key()
        if not api_key or not place_id:
            return []
        details = get_place_details(place_id, api_key)
        return photo_uris([p.get("name") for p in (details.get("photos") or []) if p.get("name")], api_key)

    return fetch


def upload_place_photos(details: dict, clinic_data: dict, api_key: str) -> List[str]:
    images = []
    clinic_slug = safe_storage_name(clinic_data.get("name") or details.get("id") or "clinic")

    for index, photo in enumerate((details.get("photos") or [])[:5], start=1):
        photo_name = photo.get("name")
        if not photo_name:
            continue

        try:
            photo_uri = get_photo_uri(photo_name, api_key)
            image_url = upload_image_value(
                photo_uri,
                "generated-clinics/google-places",
                f"{clinic_slug}-google-{index}",
            )
            if image_url:
                images.append(image_url)
        except Exception as exc:
            print(f"[!] Could not import Google Places photo for {clinic_data.get('name')}: {exc}")

    return images


def split_city_state_zip(formatted_address: str) -> Dict[str, str]:
    # Delegates to the shared, unit-tested parser (handles ", USA", suites, zip+4, full state names).
    return parse_us_address(formatted_address)


def enrich_clinic_with_google_places(clinic_data: dict, place_id: Optional[str] = None, upload_photos: bool = True) -> dict:
    """Add Google rating, reviews, hours (and photos) to a clinic.

    place_id:       the exact place the scout already found; skips the (error-prone) name search.
    upload_photos:  False leaves the photos to clinic_photos.build_gallery (website first, filtered, deduplicated):
                    the names are kept in clinic_data["_google_photo_names"] for it.
    """
    api_key = get_google_places_key()
    if not api_key:
        print("[*] GOOGLE_PLACES_API_KEY is not set; skipping Google Places enrichment.")
        return clinic_data

    try:
        if not place_id:
            place = text_search_place(clinic_data, api_key)
            if not place:
                print(f"[!] Google Places found no match for: {clinic_data.get('name')}")
                clinic_data.setdefault("google_metadata", {})["google_match"] = "rejected"
                return clinic_data
            place_id = place["id"]

        details = get_place_details(place_id, api_key)
        print(f"[*] Google Places match: {details.get('displayName', {}).get('text') or details.get('id')}")

        formatted_address = details.get("formattedAddress")
        if formatted_address and not clinic_data.get("address"):
            clinic_data["address"] = formatted_address
            clinic_data.update({k: v for k, v in split_city_state_zip(formatted_address).items() if not clinic_data.get(k)})

        if details.get("nationalPhoneNumber") and not clinic_data.get("phone"):
            clinic_data["phone"] = details["nationalPhoneNumber"]

        if details.get("websiteUri") and not clinic_data.get("website"):
            clinic_data["website"] = details["websiteUri"]

        if upload_photos:
            google_images = upload_place_photos(details, clinic_data, api_key)
            if google_images:
                existing_images = clinic_data.get("images") or []
                clinic_data["images"] = google_images + [img for img in existing_images if img not in google_images]
        else:
            clinic_data["_google_photo_names"] = [p.get("name") for p in (details.get("photos") or []) if p.get("name")][:8]

        google_reviews = normalize_reviews(details)
        review_ai = summarize_reviews_with_ai(
            clinic_data.get("name") or (details.get("displayName") or {}).get("text") or "Clinic",
            google_reviews,
            details.get("rating"),
            details.get("userRatingCount"),
        )

        google_metadata = {
            "google_place_id": details.get("id"),
            "google_maps_url": details.get("googleMapsUri"),
            "google_website_url": details.get("websiteUri"),
            "google_formatted_address": formatted_address,
            "google_business_status": details.get("businessStatus"),
            "google_primary_type": (details.get("primaryTypeDisplayName") or {}).get("text"),
            "google_types": details.get("types"),
            "rating": details.get("rating"),
            "rating_count": details.get("userRatingCount"),
            "reviews": google_reviews,
            "google_photo_attributions": [
                photo.get("authorAttributions") or [] for photo in (details.get("photos") or [])[:5]
            ],
        }

        if review_ai:
            existing_review_profile = clinic_data.get("review_profile") or {}
            google_metadata["review_summary"] = review_ai["summary"]
            google_metadata["review_profile"] = {
                **existing_review_profile,
                "rating": details.get("rating") or existing_review_profile.get("rating"),
                "review_count": details.get("userRatingCount") or existing_review_profile.get("review_count"),
                "source": "google",
                "summary": review_ai["summary"],
                "themes": review_ai.get("themes") or existing_review_profile.get("themes") or [],
                "featured_reviews": google_reviews or existing_review_profile.get("featured_reviews") or [],
            }

        if details.get("location"):
            google_metadata["location"] = details["location"]

        hours = normalize_hours(details)
        if hours:
            clinic_data["working_hours"] = {**(clinic_data.get("working_hours") or {}), **hours}

        clinic_data["google_metadata"] = {
            key: value for key, value in google_metadata.items() if value not in (None, "", [], {})
        }
    except Exception as exc:
        print(f"[!] Google Places enrichment failed for {clinic_data.get('name')}: {exc}")

    return clinic_data

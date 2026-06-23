import json
import os
import re
import ssl
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import certifi
from dotenv import load_dotenv
from openai import OpenAI

from storage import safe_storage_name, upload_image_value

load_dotenv(".env")
load_dotenv("../.env.local")

PLACES_BASE_URL = "https://places.googleapis.com/v1"
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
REVIEW_SUMMARY_MODEL = os.environ.get("OPENCLAW_REVIEW_SUMMARY_MODEL", "deepseek/deepseek-chat")


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
    with urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
        return json.loads(response.read().decode("utf-8"))


def build_search_query(clinic_data: dict) -> str:
    parts = [
        clinic_data.get("name"),
        clinic_data.get("address"),
        clinic_data.get("city"),
        clinic_data.get("state"),
        clinic_data.get("zip_code"),
    ]
    return " ".join(str(part).strip() for part in parts if part)


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
        ]
    )
    request = Request(
        url,
        data=json.dumps({"textQuery": query, "maxResultCount": 1}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": field_mask,
        },
        method="POST",
    )

    with urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
        payload = json.loads(response.read().decode("utf-8"))

    places = payload.get("places") or []
    return places[0] if places else None


def search_places_by_text(query: str, api_key: str, limit: int = 5) -> List[dict]:
    """
    Search Google Places by free-text query and return lightweight place records.
    Used by the Scout pipeline before scraping official clinic websites.
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
    request = Request(
        url,
        data=json.dumps({"textQuery": query, "maxResultCount": max(1, min(limit, 20))}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": field_mask,
        },
        method="POST",
    )

    with urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
        payload = json.loads(response.read().decode("utf-8"))

    return payload.get("places") or []


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
    with urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
        return json.loads(response.read().decode("utf-8"))


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

    return {
        "summary": summary,
        "positive_themes": themes,
        "concern_themes": [],
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
                        "summary, positive_themes, concern_themes. The summary must be 1-2 concise "
                        "patient-facing sentences. Themes must be short labels. Do not invent facts."
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
        positive_themes = data.get("positive_themes") if isinstance(data.get("positive_themes"), list) else []
        concern_themes = data.get("concern_themes") if isinstance(data.get("concern_themes"), list) else []
        return {
            "summary": summary,
            "positive_themes": [str(theme).strip() for theme in positive_themes if str(theme).strip()][:5],
            "concern_themes": [str(theme).strip() for theme in concern_themes if str(theme).strip()][:5],
        }
    except Exception as exc:
        print(f"[!] AI review summary failed for {clinic_name}: {exc}")
        return fallback


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
    # Conservative fallback parser for US-style formatted addresses.
    match = re.search(r",\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?", formatted_address)
    if not match:
        return {}
    return {"city": match.group(1), "state": match.group(2), "zip_code": match.group(3)}


def enrich_clinic_with_google_places(clinic_data: dict) -> dict:
    api_key = get_google_places_key()
    if not api_key:
        print("[*] GOOGLE_PLACES_API_KEY is not set; skipping Google Places enrichment.")
        return clinic_data

    try:
        place = text_search_place(clinic_data, api_key)
        if not place:
            print(f"[!] Google Places found no match for: {clinic_data.get('name')}")
            return clinic_data

        details = get_place_details(place["id"], api_key)
        print(f"[*] Google Places match: {details.get('displayName', {}).get('text') or details.get('id')}")

        formatted_address = details.get("formattedAddress")
        if formatted_address and not clinic_data.get("address"):
            clinic_data["address"] = formatted_address
            clinic_data.update({k: v for k, v in split_city_state_zip(formatted_address).items() if not clinic_data.get(k)})

        if details.get("nationalPhoneNumber") and not clinic_data.get("phone"):
            clinic_data["phone"] = details["nationalPhoneNumber"]

        if details.get("websiteUri") and not clinic_data.get("website"):
            clinic_data["website"] = details["websiteUri"]

        google_images = upload_place_photos(details, clinic_data, api_key)
        if google_images:
            existing_images = clinic_data.get("images") or []
            clinic_data["images"] = google_images + [img for img in existing_images if img not in google_images]

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
                "positive_themes": review_ai.get("positive_themes") or existing_review_profile.get("positive_themes") or [],
                "concern_themes": review_ai.get("concern_themes") or existing_review_profile.get("concern_themes") or [],
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

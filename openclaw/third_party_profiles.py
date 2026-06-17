"""
third_party_profiles.py — optional profile enrichment from healthcare directories.

This enriches an already-extracted clinic profile with public profile pages from
aggregators such as Zocdoc and Healthgrades. It intentionally does not replace
the official website or Google Places data; it stores source-attributed metadata
under third_party_profiles for UI/review use.
"""

import json
import os
import re
import urllib.parse
import urllib.request
from typing import Optional
from urllib.parse import urlparse

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(".env")
load_dotenv("../.env.local")


PROVIDERS = {
    "zocdoc": "zocdoc.com",
    "healthgrades": "healthgrades.com",
    "webmd": "webmd.com",
    "vitals": "vitals.com",
}

DEFAULT_PROVIDERS = ("zocdoc", "healthgrades")
SEARCH_TIMEOUT = int(os.environ.get("OPENCLAW_THIRD_PARTY_SEARCH_TIMEOUT", "15"))
JINA_TIMEOUT = int(os.environ.get("OPENCLAW_THIRD_PARTY_JINA_TIMEOUT", "30"))
JINA_MIN_CHARS = int(os.environ.get("OPENCLAW_THIRD_PARTY_JINA_MIN_CHARS", "500"))
PROFILE_MODEL = os.environ.get("OPENCLAW_THIRD_PARTY_PROFILE_MODEL", "deepseek/deepseek-v4-flash")


def third_party_enrichment_enabled() -> bool:
    return os.environ.get("OPENCLAW_ENABLE_THIRD_PARTY_ENRICHMENT", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def configured_providers() -> list[str]:
    raw = os.environ.get("OPENCLAW_THIRD_PARTY_PROVIDERS", "")
    names = [name.strip().lower() for name in raw.split(",") if name.strip()] if raw else list(DEFAULT_PROVIDERS)
    return [name for name in names if name in PROVIDERS]


def _host_matches(url: str, domain: str) -> bool:
    host = urlparse(url).netloc.lower().removeprefix("www.")
    return host == domain or host.endswith(f".{domain}")


def _make_request(url: str, headers: dict, timeout: int = SEARCH_TIMEOUT) -> Optional[str]:
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="ignore")
    except Exception as exc:
        print(f"[!] Third-party request failed for {url}: {exc}")
        return None


def _unwrap_ddg_url(raw_href: str) -> str:
    if "duckduckgo.com/l/?" not in raw_href and not raw_href.startswith("/l/?"):
        return raw_href
    query = urllib.parse.urlparse(raw_href).query
    params = urllib.parse.parse_qs(query)
    return urllib.parse.unquote(params.get("uddg", [""])[0])


def _search_brave(query: str, provider: str, count: int = 5) -> list[dict]:
    api_key = os.environ.get("BRAVE_SEARCH_API_KEY", "").strip()
    if not api_key:
        return []

    search_url = "https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode({
        "q": query,
        "count": min(count, 10),
        "search_lang": "en",
        "country": "US",
        "safesearch": "moderate",
    })
    raw = _make_request(search_url, headers={
        "Accept": "application/json",
        "X-Subscription-Token": api_key,
        "User-Agent": "OpenClaw/1.0 AsianHealthHub",
    })
    if not raw:
        return []

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    domain = PROVIDERS[provider]
    results = (data.get("web") or {}).get("results") or []
    return [
        {"url": item["url"], "title": item.get("title", ""), "provider": provider}
        for item in results
        if item.get("url") and _host_matches(item["url"], domain)
    ][:count]


def _search_ddg(query: str, provider: str, count: int = 5) -> list[dict]:
    from bs4 import BeautifulSoup

    search_url = "https://duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
    html = _make_request(search_url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html",
    })
    if not html:
        return []

    domain = PROVIDERS[provider]
    soup = BeautifulSoup(html, "html.parser")
    results = []
    for result in soup.select(".result"):
        anchor = result.select_one(".result__a") or result.find("a")
        if not anchor:
            continue
        url = _unwrap_ddg_url(anchor.get("href") or "")
        if not url.startswith("http") or not _host_matches(url, domain):
            continue
        results.append({"url": url, "title": anchor.get_text(" ", strip=True), "provider": provider})
        if len(results) >= count:
            break
    return results


def _search_bing(query: str, provider: str, count: int = 5) -> list[dict]:
    from bs4 import BeautifulSoup

    search_url = "https://www.bing.com/search?" + urllib.parse.urlencode({"q": query, "count": count})
    html = _make_request(search_url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    })
    if not html:
        return []

    domain = PROVIDERS[provider]
    soup = BeautifulSoup(html, "html.parser")
    results = []
    for item in soup.select("li.b_algo"):
        anchor = item.select_one("h2 a")
        if not anchor:
            continue
        url = anchor.get("href") or ""
        if not url.startswith("http") or not _host_matches(url, domain):
            continue
        results.append({"url": url, "title": anchor.get_text(" ", strip=True), "provider": provider})
        if len(results) >= count:
            break
    return results


def _query_for_provider(clinic_data: dict, provider: str) -> str:
    parts = [
        clinic_data.get("name"),
        clinic_data.get("address"),
        clinic_data.get("city"),
        clinic_data.get("state"),
    ]
    base = " ".join(str(part).strip() for part in parts if part)
    return f'{base} site:{PROVIDERS[provider]}'


def find_provider_profile(clinic_data: dict, provider: str) -> Optional[dict]:
    query = _query_for_provider(clinic_data, provider)
    print(f"[*] Third-party search ({provider}): {query}")
    seen = set()
    candidates = []

    for search_fn in (_search_brave, _search_ddg, _search_bing):
        for result in search_fn(query, provider, count=5):
            normalized = result["url"].split("#", 1)[0].rstrip("/")
            if normalized in seen:
                continue
            seen.add(normalized)
            candidates.append(result)
        if candidates:
            break

    return candidates[0] if candidates else None


def fetch_profile_markdown(url: str) -> str:
    headers = {
        "X-Return-Format": "markdown",
        "Accept": "application/json",
        "User-Agent": "OpenClaw/1.0 AsianHealthHub",
    }
    api_key = os.environ.get("JINA_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    encoded_url = urllib.parse.quote(url, safe=":/?=&#%+@")
    reader_url = f"https://r.jina.ai/{encoded_url}"
    raw = _make_request(reader_url, headers=headers, timeout=JINA_TIMEOUT)
    if not raw:
        return ""

    try:
        payload = json.loads(raw)
        content = (payload.get("data") or {}).get("content") or ""
    except json.JSONDecodeError:
        content = raw

    content = content.strip()
    if len(content) < JINA_MIN_CHARS:
        print(f"[!] Third-party profile content too short ({len(content)} chars): {url}")
        return ""
    return content


def _extract_rating_fallback(markdown: str) -> dict:
    rating = None
    review_count = None
    rating_match = re.search(r"([0-5](?:\.\d)?)\s*(?:out of|/)\s*5", markdown, flags=re.I)
    if rating_match:
        rating = float(rating_match.group(1))
    count_match = re.search(r"([\d,]+)\s+(?:reviews?|ratings?)", markdown, flags=re.I)
    if count_match:
        review_count = int(count_match.group(1).replace(",", ""))
    return {"rating": rating, "review_count": review_count}


def extract_provider_profile(provider: str, url: str, markdown: str, clinic_data: dict) -> Optional[dict]:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    fallback = _extract_rating_fallback(markdown)
    if not api_key:
        return {
            "source": provider,
            "url": url,
            "rating": fallback.get("rating"),
            "review_count": fallback.get("review_count"),
        }

    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=60.0)
    payload = {
        "provider": provider,
        "url": url,
        "clinic": {
            "name": clinic_data.get("name"),
            "address": clinic_data.get("address"),
            "city": clinic_data.get("city"),
            "state": clinic_data.get("state"),
            "phone": clinic_data.get("phone"),
        },
        "profile_markdown": markdown[:30000],
    }

    try:
        response = client.chat.completions.create(
            model=PROFILE_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract source-attributed healthcare directory profile data. "
                        "Use only the supplied profile markdown. Return strict JSON with keys: "
                        "source, url, profile_name, rating, review_count, specialties, languages, "
                        "insurance_networks, appointment_url, review_snippets, summary. "
                        "review_snippets must be short objects with author, rating, text, date when present. "
                        "Use null or [] for missing values; do not invent facts."
                    ),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        data = json.loads(response.choices[0].message.content or "{}")
    except Exception as exc:
        print(f"[!] Third-party extraction failed for {provider} {url}: {exc}")
        data = {}

    data["source"] = provider
    data["url"] = url
    data.setdefault("rating", fallback.get("rating"))
    data.setdefault("review_count", fallback.get("review_count"))
    return {key: value for key, value in data.items() if value not in (None, "", [], {})}


def _merge_profiles(existing: list, incoming: list) -> list:
    merged = []
    seen = set()
    for profile in (existing or []) + (incoming or []):
        if not isinstance(profile, dict):
            continue
        key = f"{profile.get('source')}|{profile.get('url')}"
        if key in seen:
            continue
        seen.add(key)
        merged.append(profile)
    return merged


def enrich_clinic_with_third_party_profiles(clinic_data: dict) -> dict:
    if not third_party_enrichment_enabled():
        print("[*] Third-party profile enrichment disabled.")
        return clinic_data

    providers = configured_providers()
    if not providers:
        print("[*] No third-party profile providers configured.")
        return clinic_data

    profiles = []
    for provider in providers:
        candidate = find_provider_profile(clinic_data, provider)
        if not candidate:
            print(f"[!] No {provider} profile found for {clinic_data.get('name')}.")
            continue

        markdown = fetch_profile_markdown(candidate["url"])
        if not markdown:
            continue

        profile = extract_provider_profile(provider, candidate["url"], markdown, clinic_data)
        if profile:
            print(f"[+] Third-party profile enriched from {provider}: {candidate['url']}")
            profiles.append(profile)

    if not profiles:
        return clinic_data

    existing_profiles = clinic_data.get("third_party_profiles") or []
    clinic_data["third_party_profiles"] = _merge_profiles(existing_profiles, profiles)
    clinic_data["external_sources"] = [
        {"source": profile.get("source"), "url": profile.get("url")}
        for profile in clinic_data["third_party_profiles"]
        if profile.get("source") and profile.get("url")
    ]

    # Keep Google/official review_profile as primary. Third-party review data is
    # available in metadata for later UI display or audits.
    return clinic_data

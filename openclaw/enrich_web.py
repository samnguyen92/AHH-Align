"""
enrich_web.py - Brave Search fallback enrichment.

Used only when phone / address are still missing after scraping + Google Places (for example when the
Places API returns 403). It never overwrites existing values and only accepts a result when the page
title/snippet clearly mentions the clinic name.
"""

import json
import os
import re
import urllib.parse
import urllib.request
from typing import Optional

from normalize import clean_value, fill_location_fields, find_phones, parse_us_address

BRAVE_WEB_URL = "https://api.search.brave.com/res/v1/web/search"
# Street address followed by ", City, ST 12345" somewhere inside a snippet.
_SNIPPET_ADDRESS_RE = re.compile(
    r"\d{1,6}\s[^,\n]{3,60},\s*[A-Za-z .'-]{2,40},\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?"
)


def _name_tokens(name: str) -> list:
    stop = {"the", "and", "of", "clinic", "center", "centre", "medical", "health", "care", "dental", "group", "inc", "llc"}
    return [t for t in re.findall(r"[a-z0-9]+", (name or "").lower()) if len(t) > 2 and t not in stop]


def _brave_web_search(query: str, count: int = 6) -> list:
    key = os.environ.get("BRAVE_SEARCH_API_KEY")
    if not key:
        return []
    url = f"{BRAVE_WEB_URL}?q={urllib.parse.quote(query)}&count={count}"
    request = urllib.request.Request(
        url, headers={"X-Subscription-Token": key, "Accept": "application/json", "User-Agent": "AsianHealthHub/1.0"}
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return (payload.get("web") or {}).get("results") or []
    except Exception as exc:
        print(f"[!] Brave web search failed: {exc}")
        return []


def enrich_missing_with_brave(data: dict) -> dict:
    """Fill missing phone/address from public search snippets. Returns the same dict."""
    name = clean_value(data.get("name"))
    if not name:
        return data
    need_phone = not clean_value(data.get("phone"))
    need_address = not clean_value(data.get("address"))
    if not (need_phone or need_address):
        return data

    place = " ".join(str(v) for v in (data.get("city"), data.get("state")) if clean_value(v))
    results = _brave_web_search(f'"{name}" {place} phone address'.strip())
    tokens = _name_tokens(name)
    if not results or not tokens:
        return data

    used: Optional[str] = None
    for result in results:
        haystack = f"{result.get('title', '')} {result.get('description', '')}".lower()
        if not all(token in haystack for token in tokens[:2]):
            continue
        text = f"{result.get('title', '')}. {result.get('description', '')}"
        if need_phone and not clean_value(data.get("phone")):
            phones = find_phones(text, limit=1)
            if phones:
                data["phone"] = phones[0]
                used = result.get("url")
        if need_address and not clean_value(data.get("address")):
            match = _SNIPPET_ADDRESS_RE.search(text)
            if match and parse_us_address(match.group(0)):
                data["address"] = match.group(0)
                used = result.get("url")
        if used and (not need_phone or data.get("phone")) and (not need_address or data.get("address")):
            break

    if used:
        fill_location_fields(data)
        sources = list(data.get("external_sources") or [])
        sources.append({"type": "brave_search_fallback", "url": used})
        data["external_sources"] = sources
        print(f"[+] Brave fallback filled missing contact info from {used}")
    else:
        print("[*] Brave fallback found nothing reliable for missing phone/address.")
    return data


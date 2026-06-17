"""
searcher.py — Multi-provider URL search for the OpenClaw clinic pipeline.

Provider chain (in order):
  1. Brave Search API  (primary — fast, structured JSON, site: query support)
  2. DuckDuckGo HTML   (fallback — no API key needed)
  3. Bing HTML         (fallback — broad coverage)
  4. Domain fallback   (last resort — constructs https://{domain})

Set BRAVE_SEARCH_API_KEY in openclaw/.env to enable the primary provider.
Set OPENCLAW_USE_BRAVE_SEARCH=false to disable Brave and start from DDG.
"""

import json
import os
import urllib.parse
import urllib.request
from typing import List, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv("../.env.local")

# ── Configuration ────────────────────────────────────────────────────────────

BRAVE_API_KEY = os.environ.get("BRAVE_SEARCH_API_KEY", "").strip()
USE_BRAVE = bool(BRAVE_API_KEY) and os.environ.get("OPENCLAW_USE_BRAVE_SEARCH", "true").strip().lower() not in {"0", "false", "no"}
SEARCH_TIMEOUT = int(os.environ.get("OPENCLAW_SEARCH_TIMEOUT", "15"))

# Aggregators and social platforms — we want the clinic's own page, not a listing
BLOCKED_DOMAINS = {
    "facebook.com",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "pinterest.com",
    "linkedin.com",
    "reddit.com",
    "yelp.com",
    "zocdoc.com",
    "healthgrades.com",
    "vitals.com",
    "ratemds.com",
    "webmd.com",
    "psychology-today.com",
    "doximity.com",
    "usnews.com",
    "bbb.org",
}

# ── Helpers ──────────────────────────────────────────────────────────────────

def _is_blocked(url: str) -> bool:
    host = urlparse(url).netloc.lower().removeprefix("www.")
    return any(blocked in host for blocked in BLOCKED_DOMAINS)


def _normalize_url(url: str) -> str:
    """Strip trailing slash and fragment for dedup."""
    parsed = urlparse(url)
    clean = parsed._replace(fragment="")
    path = clean.path.rstrip("/") or "/"
    return clean._replace(path=path).geturl()


def _score_url(url: str, domain: Optional[str], name: str) -> int:
    """
    Higher score = better URL match. Used to pick the best result from candidates.

    Scoring:
      +20  URL host exactly matches the target domain
      +10  Target domain is a suffix of the URL host (subdomain match)
      +8   One or more name words appear in host or path
      +5   URL is the root path (homepage)
      +2   URL path depth ≤ 2 (not buried deep)
      +2   URL contains 'contact' or 'about' (high-value pages)
    """
    score = 0
    host = urlparse(url).netloc.lower().removeprefix("www.")
    path = urlparse(url).path.lower()

    if domain:
        clean_domain = domain.lower().removeprefix("www.")
        if host == clean_domain:
            score += 20
        elif host.endswith(f".{clean_domain}"):
            score += 10

    # Name words match (e.g. "Northside Hospital" → "northside" in URL)
    name_words = [w.lower() for w in name.split() if len(w) > 3]
    if any(w in host or w in path for w in name_words):
        score += 8

    # Prefer root / short paths
    if path in ("/", ""):
        score += 5
    elif path.count("/") <= 2:
        score += 2

    if "about" in path or "contact" in path:
        score += 2

    return score


def _make_request(url: str, headers: dict) -> Optional[str]:
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=SEARCH_TIMEOUT) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except Exception as exc:
        raise exc


# ── Search Providers ─────────────────────────────────────────────────────────

def _search_brave(query: str, count: int = 5) -> List[dict]:
    """Call Brave Search API and return deduplicated result list."""
    if not BRAVE_API_KEY:
        return []

    search_url = "https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode({
        "q": query,
        "count": min(count, 20),
        "search_lang": "en",
        "country": "US",
        "safesearch": "moderate",
    })
    try:
        raw = _make_request(search_url, headers={
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": BRAVE_API_KEY,
            "User-Agent": "OpenClaw/1.0 AsianHealthHub",
        })
        # Handle gzip if returned (urllib doesn't auto-decode)
        try:
            data = json.loads(raw)
        except Exception:
            import gzip
            data = json.loads(gzip.decompress(raw.encode("latin-1")).decode("utf-8", errors="ignore"))

        results = (data.get("web") or {}).get("results") or []
        return [
            {"url": r["url"], "title": r.get("title", "")}
            for r in results
            if r.get("url") and not _is_blocked(r["url"])
        ]
    except Exception as exc:
        print(f"[!] Brave Search API failed for '{query}': {exc}")
        return []


def _search_ddg_html(query: str, count: int = 5) -> List[dict]:
    """DuckDuckGo HTML scrape — no API key required."""
    from bs4 import BeautifulSoup

    search_url = "https://duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
    try:
        html = _make_request(search_url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html",
        })
    except Exception as exc:
        print(f"[!] DDG HTML search failed for '{query}': {exc}")
        return []

    soup = BeautifulSoup(html, "html.parser")
    results = []
    for result in soup.select(".result"):
        anchor = result.select_one(".result__a") or result.find("a")
        if not anchor:
            continue
        raw_href = anchor.get("href") or ""

        # DDG wraps real URLs in a redirect — unwrap
        if "duckduckgo.com/l/?" in raw_href or raw_href.startswith("/l/?"):
            try:
                qs = urllib.parse.parse_qs(urllib.parse.urlparse(raw_href).query)
                raw_href = urllib.parse.unquote(qs.get("uddg", [""])[0])
            except Exception:
                continue

        if not raw_href.startswith("http") or _is_blocked(raw_href):
            continue

        results.append({"url": raw_href, "title": anchor.get_text(" ", strip=True)})
        if len(results) >= count:
            break

    return results


def _search_bing_html(query: str, count: int = 5) -> List[dict]:
    """Bing HTML scrape — no API key required."""
    from bs4 import BeautifulSoup

    search_url = "https://www.bing.com/search?" + urllib.parse.urlencode({"q": query, "count": count})
    try:
        html = _make_request(search_url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        })
    except Exception as exc:
        print(f"[!] Bing HTML search failed for '{query}': {exc}")
        return []

    soup = BeautifulSoup(html, "html.parser")
    results = []
    for li in soup.select("li.b_algo"):
        anchor = li.select_one("h2 a")
        if not anchor:
            continue
        url = anchor.get("href") or ""
        if not url.startswith("http") or _is_blocked(url):
            continue
        results.append({"url": url, "title": anchor.get_text(" ", strip=True)})
        if len(results) >= count:
            break

    return results


# ── Public API ───────────────────────────────────────────────────────────────

def search_hospital_url(hospital_name: str, domain: str = None) -> Optional[str]:
    """
    Find the best official URL for a clinic/hospital.

    Strategy:
      - If domain is provided, run a site: query on Brave first.
      - Then run a general name query across all providers.
      - Score every candidate URL and return the highest-scoring one.
      - Fall back to https://{domain} if all providers fail.

    Returns:
      Best URL string, or None if no domain is known and all providers fail.
    """
    base_query = f"{hospital_name} official website"
    site_query = f"{hospital_name} site:{domain}" if domain else base_query

    seen: set = set()
    candidates: List[dict] = []

    def _add_results(results: List[dict]) -> None:
        for r in results:
            norm = _normalize_url(r["url"])
            if norm not in seen:
                seen.add(norm)
                candidates.append({"url": r["url"], "title": r.get("title", "")})

    # ── Round 1: Brave with site: query ──────────────────────────────────────
    if USE_BRAVE and domain:
        print(f"[*] Brave Search (site query): {site_query}")
        _add_results(_search_brave(site_query, count=3))

    # ── Round 2: Brave with base name query ──────────────────────────────────
    if USE_BRAVE and len(candidates) < 3:
        print(f"[*] Brave Search (base query): {base_query}")
        _add_results(_search_brave(base_query, count=5))

    # ── Round 3: DDG HTML fallback ───────────────────────────────────────────
    if len(candidates) < 2:
        query = site_query if domain else base_query
        print(f"[*] DDG HTML fallback: {query}")
        _add_results(_search_ddg_html(query, count=5))

    # ── Round 4: Bing HTML fallback ──────────────────────────────────────────
    if len(candidates) < 2:
        print(f"[*] Bing HTML fallback: {base_query}")
        _add_results(_search_bing_html(base_query, count=5))

    # ── No results: domain fallback ──────────────────────────────────────────
    if not candidates:
        fallback = f"https://{domain}" if domain else None
        print(f"[!] All search providers returned no results for '{hospital_name}'. Fallback: {fallback}")
        return fallback

    # ── Score and pick best candidate ────────────────────────────────────────
    candidates.sort(key=lambda r: -_score_url(r["url"], domain, hospital_name))
    best = candidates[0]["url"]
    print(f"[*] Best URL for '{hospital_name}': {best}  (from {len(candidates)} candidate(s))")
    return best

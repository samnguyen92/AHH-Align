"""
scraper.py — Two-layer web scraper for the OpenClaw clinic pipeline.

Layer 1 — Jina Reader API (primary content):
  - Fast (~3-8s vs Playwright's ~45-90s)
  - Returns clean LLM-ready Markdown without boilerplate
  - Handles Cloudflare / JS-heavy pages automatically
  - Set JINA_API_KEY in openclaw/.env for higher rate limits

Layer 2 — Playwright (metadata + JS fallback):
  - Always runs to extract: JSON-LD schemas, images, iframe sources, important links,
    appointment URLs, page title, meta description
  - If Jina fails, Playwright also handles text content and subpage spidering
  - Timeout is reduced when Jina already provided content

Set OPENCLAW_USE_JINA=false to disable Jina and use Playwright-only mode.
"""

import json
import os
import urllib.parse
import urllib.request

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from markdownify import markdownify as md
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
from urllib.parse import urldefrag, urljoin, urlparse

load_dotenv(".env")
load_dotenv("../.env.local")

# ── Jina Reader configuration ─────────────────────────────────────────────────

JINA_API_KEY  = os.environ.get("JINA_API_KEY", "").strip()
JINA_BASE_URL = "https://r.jina.ai/"
JINA_TIMEOUT  = int(os.environ.get("OPENCLAW_JINA_TIMEOUT", "30"))
USE_JINA      = os.environ.get("OPENCLAW_USE_JINA", "true").strip().lower() not in {"0", "false", "no"}
# Minimum character count for Jina content to be considered valid
JINA_MIN_CHARS = int(os.environ.get("OPENCLAW_JINA_MIN_CHARS", "300"))

# ── Playwright configuration ──────────────────────────────────────────────────

# Reduced from 45000 — Jina already covers content; Playwright just needs metadata
HOMEPAGE_TIMEOUT_MS = int(os.environ.get("OPENCLAW_HOMEPAGE_TIMEOUT_MS", "30000"))
# Further reduced when Jina succeeded — we only need HTML for metadata extraction
METADATA_ONLY_TIMEOUT_MS = int(os.environ.get("OPENCLAW_METADATA_TIMEOUT_MS", "20000"))
SUBPAGE_TIMEOUT_MS  = int(os.environ.get("OPENCLAW_SUBPAGE_TIMEOUT_MS", "12000"))
MAX_SPIDER_SUBPAGES = 4

PAGE_DELIMITER = "\n\n========================================\nPAGE: {url}\n========================================\n\n"

# ── Link / keyword lists ──────────────────────────────────────────────────────

APPOINTMENT_KEYWORDS = (
    "appointment", "appointments", "book", "schedule",
    "request an appointment", "consultation", "consultancy", "new patient",
)

SCHEDULING_HOST_KEYWORDS = (
    "calendly", "zocdoc", "nexhealth", "solutionreach", "patientpop",
    "opencare", "dentrix", "weave", "as.me", "acuityscheduling",
    "squarespacescheduling",
)

IMPORTANT_LINK_KEYWORDS = (
    "appointment", "book", "schedule", "new patient", "contact",
    "location", "hours", "services", "service", "insurance", "pricing",
    "price", "cost", "payment", "membership", "financing", "special",
    "coupon", "provider", "doctor", "dentist", "team", "review",
    "reviews", "patient portal", "forms", "gallery", "photos",
)

SPIDER_LINK_KEYWORDS = (
    "about", "team", "staff", "provider", "providers", "doctor", "doctors",
    "dentist", "dentists", "services", "service", "insurance", "faq",
    "pricing", "price", "cost", "payment", "contact",
)


# ── Jina Reader Layer ─────────────────────────────────────────────────────────

def _fetch_jina_markdown(url: str) -> str:
    """
    Call Jina Reader API to get clean Markdown content from a URL.

    Returns empty string on failure — caller will fall back to Playwright.

    Headers used:
      X-Return-Format: markdown   — clean Markdown output, no HTML boilerplate
      X-With-Generated-Alt: true  — AI-generated alt text for images (useful for clinic photos)
      Accept: application/json    — structured JSON response {data: {content, title, url}}
    """
    headers = {
        "X-Return-Format": "markdown",
        "X-With-Generated-Alt": "true",
        "Accept": "application/json",
        "User-Agent": "OpenClaw/1.0 AsianHealthHub",
    }
    if JINA_API_KEY:
        headers["Authorization"] = f"Bearer {JINA_API_KEY}"

    encoded_url = urllib.parse.quote(url, safe=":/?=&#%+@")
    jina_url = f"{JINA_BASE_URL}{encoded_url}"

    req = urllib.request.Request(jina_url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=JINA_TIMEOUT) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="ignore"))
            content = (payload.get("data") or {}).get("content") or ""
            stripped = content.strip()
            if len(stripped) >= JINA_MIN_CHARS:
                print(f"[+] Jina Reader: {len(stripped)} chars for {url}")
                return stripped
            print(f"[!] Jina content too short ({len(stripped)} chars) for {url} — will use Playwright text.")
            return ""
    except Exception as exc:
        print(f"[!] Jina Reader failed for {url}: {exc}")
        return ""


# ── Playwright Helpers ────────────────────────────────────────────────────────

def _empty_scrape_result(url: str) -> dict:
    return {
        "markdown_content": "",
        "json_ld_schemas": [],
        "images": [],
        "important_links": [],
        "iframe_sources": [],
        "spidered_pages": [],
        "appointment_url": None,
        "page_title": "",
        "meta_description": "",
        "website": url,
        # Backwards-compatible aliases for existing pipeline callers.
        "text": "",
        "links": [],
    }


def _parse_json_ld(script_text: str) -> list:
    """Parse JSON-LD safely; real sites often include malformed or empty blocks."""
    cleaned = (script_text or "").strip()
    if not cleaned:
        return []
    cleaned = cleaned.removeprefix("<!--").removesuffix("-->").strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        print(f"[!] Skipping malformed JSON-LD block: {exc}")
        return []
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        return [parsed]
    return []


def _is_important_link(label: str, href: str) -> bool:
    haystack = f"{label} {href}".lower()
    return any(keyword in haystack for keyword in IMPORTANT_LINK_KEYWORDS)


def _normalized_host(value: str) -> str:
    return urlparse(value).netloc.lower().removeprefix("www.")


def _canonical_url(page_url: str, href: str) -> str:
    absolute_url = urljoin(page_url, href)
    absolute_url, _fragment = urldefrag(absolute_url)
    parsed = urlparse(absolute_url)
    if parsed.scheme not in {"http", "https"}:
        return ""
    path = parsed.path.rstrip("/") or "/"
    return parsed._replace(path=path).geturl()


def _is_same_site(page_url: str, candidate_url: str) -> bool:
    page_host = _normalized_host(page_url)
    candidate_host = _normalized_host(candidate_url)
    return candidate_host == page_host or candidate_host.endswith(f".{page_host}")


def is_likely_appointment_url(page_url: str, candidate_url: str, label_text: str) -> bool:
    if not any(keyword in label_text for keyword in APPOINTMENT_KEYWORDS):
        return False
    page_host = _normalized_host(page_url)
    candidate_host = _normalized_host(candidate_url)
    if not candidate_host:
        return False
    if candidate_host == page_host or candidate_host.endswith(f".{page_host}"):
        return True
    return any(keyword in candidate_host for keyword in SCHEDULING_HOST_KEYWORDS)


def _discover_high_value_internal_links(soup: BeautifulSoup, page_url: str) -> list[dict]:
    """
    One-level spider discovery from the homepage only. Score links by URL path
    and anchor text, then keep the highest-value internal pages for LLM context.
    """
    discovered: list[dict] = []
    seen = {page_url.rstrip("/")}

    for anchor in soup.find_all("a"):
        href = anchor.get("href")
        if not href:
            continue
        if href.lower().startswith(("javascript:", "tel:", "mailto:", "#")):
            continue

        absolute_href = _canonical_url(page_url, href)
        if not absolute_href or not _is_same_site(page_url, absolute_href):
            continue
        if absolute_href.rstrip("/") in seen:
            continue

        label = anchor.get_text(" ", strip=True)
        parsed = urlparse(absolute_href)
        haystack = f"{parsed.path} {label}".lower()
        matched_keywords = [kw for kw in SPIDER_LINK_KEYWORDS if kw in haystack]
        if not matched_keywords:
            continue

        seen.add(absolute_href.rstrip("/"))
        score = len(matched_keywords) * 10
        if label:
            score += 2
        if parsed.path.count("/") <= 2:
            score += 1

        discovered.append({
            "text": label,
            "url": absolute_href,
            "score": score,
            "keywords": matched_keywords,
        })

    discovered.sort(key=lambda link: (-link["score"], link["url"]))
    return discovered[:MAX_SPIDER_SUBPAGES]


def _auto_scroll(page, max_steps: int = 20) -> None:
    """Trigger lazy-loaded content without following any additional links."""
    page.evaluate(
        """
        async ({ maxSteps }) => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                let steps = 0;
                const distance = 650;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight || 0;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    steps += 1;
                    if (totalHeight >= scrollHeight - window.innerHeight || steps >= maxSteps) {
                        clearInterval(timer);
                        window.scrollTo(0, scrollHeight);
                        resolve();
                    }
                }, 250);
            });
        }
        """,
        {"maxSteps": max_steps},
    )


def _render_page_html(page, page_url: str, timeout_ms: int, scroll_steps: int) -> str:
    try:
        page.goto(page_url, timeout=timeout_ms, wait_until="networkidle")
    except Exception as first_error:
        print(f"[!] networkidle timed out for {page_url}; retrying with domcontentloaded: {first_error}")
        page.goto(page_url, timeout=timeout_ms, wait_until="domcontentloaded")
        page.wait_for_timeout(1500)

    _auto_scroll(page, max_steps=scroll_steps)
    page.wait_for_timeout(800)
    return page.content()


def _soup_to_markdown(page_url: str, html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    # NOTE: <nav> and <header> are intentionally kept — they often contain
    # phone numbers, hours links, booking CTAs, and insurance badges.
    # Only remove script/style/svg noise.
    for element in soup(["script", "style", "noscript", "svg"]):
        element.decompose()

    markdown = md(str(soup), heading_style="ATX", strip=["a", "img"])
    lines = [line.rstrip() for line in markdown.splitlines() if line.strip()]
    return PAGE_DELIMITER.format(url=page_url) + "\n".join(lines)


def _extract_metadata_from_soup(url: str, soup: BeautifulSoup) -> dict:
    """Extract all non-text metadata from parsed homepage HTML."""
    page_title = soup.title.get_text(" ", strip=True) if soup.title else ""
    meta_description_tag = soup.find("meta", attrs={"name": "description"})
    meta_description = meta_description_tag.get("content", "").strip() if meta_description_tag else ""

    # JSON-LD — high-confidence structured data (hours, address, reviews)
    json_ld_schemas = []
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        json_ld_schemas.extend(_parse_json_ld(script.string or script.get_text(" ", strip=True)))

    # iframes — often point to booking/review widgets (Calendly, Zocdoc, etc.)
    iframe_sources = []
    for iframe in soup.find_all("iframe"):
        src = iframe.get("src") or iframe.get("data-src")
        if not src:
            continue
        absolute_src = urljoin(url, src)
        if absolute_src.startswith("http") and absolute_src not in iframe_sources:
            iframe_sources.append(absolute_src)

    # Images — OG first, then <img> tags
    images = []
    for selector in [
        ("meta", {"property": "og:image"}),
        ("meta", {"name": "twitter:image"}),
        ("meta", {"property": "og:image:secure_url"}),
    ]:
        tag = soup.find(*selector)
        content = tag.get("content") if tag else None
        if content:
            images.append(urljoin(url, content))

    for img in soup.find_all("img"):
        src = (
            img.get("src")
            or img.get("data-src")
            or img.get("data-lazy-src")
            or img.get("data-original")
            or img.get("data-image")
        )
        if not src:
            srcset = img.get("srcset") or img.get("data-srcset")
            if srcset:
                src = srcset.split(",")[0].strip().split(" ")[0]
        if not src:
            continue
        absolute_src = urljoin(url, src)
        if absolute_src.startswith("http") and absolute_src not in images:
            images.append(absolute_src)
        if len(images) >= 20:
            break

    # Links — important links and appointment detection
    links = []
    important_links = []
    appointment_url = None
    for anchor in soup.find_all("a"):
        href = anchor.get("href")
        if not href:
            continue
        if href.lower().startswith(("javascript:", "tel:", "mailto:", "#")):
            continue
        absolute_href = urljoin(url, href)
        label = anchor.get_text(" ", strip=True)
        if absolute_href.startswith("http"):
            link = {"text": label, "url": absolute_href}
            links.append(link)
            if _is_important_link(label, href) and link not in important_links:
                important_links.append(link)

        label_text = f"{label} {href}".lower()
        if not appointment_url and absolute_href.startswith("http") and is_likely_appointment_url(url, absolute_href, label_text):
            appointment_url = absolute_href
            appointment_link = {"text": label or "Appointment", "url": appointment_url}
            if appointment_link not in important_links:
                important_links.insert(0, appointment_link)

    # iframe-based booking widgets as appointment fallback
    if not appointment_url:
        for iframe_src in iframe_sources:
            iframe_host = urlparse(iframe_src).netloc.lower().removeprefix("www.")
            iframe_text = iframe_src.lower()
            if (
                any(keyword in iframe_host for keyword in SCHEDULING_HOST_KEYWORDS)
                or any(keyword in iframe_text for keyword in APPOINTMENT_KEYWORDS)
            ):
                appointment_url = iframe_src
                important_links.insert(0, {"text": "Appointment iframe", "url": iframe_src})
                break

    if not important_links:
        important_links = links[:40]

    return {
        "page_title": page_title,
        "meta_description": meta_description,
        "json_ld_schemas": json_ld_schemas[:20],    # increased from [:8]
        "iframe_sources": iframe_sources[:20],
        "images": images[:12],
        "links": links,
        "important_links": important_links[:80],
        "appointment_url": appointment_url,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def scrape_content_from_url(url: str) -> dict:
    """
    Two-layer scraping strategy:

    Layer 1 — Jina Reader API (if USE_JINA=true and API accessible):
      Fetch clean Markdown content from the URL. Fast, resilient to Cloudflare.

    Layer 2 — Playwright:
      Always runs to extract metadata (JSON-LD, images, links, appointment URL).
      If Jina failed, also handles text content and subpage spidering.
      Timeout is reduced to METADATA_ONLY_TIMEOUT_MS when Jina succeeded.
    """
    print(f"[*] Scraping URL: {url}")

    # ── Layer 1: Jina Reader ─────────────────────────────────────────────────
    jina_markdown = ""
    if USE_JINA:
        jina_markdown = _fetch_jina_markdown(url)

    # ── Layer 2: Playwright (metadata + content fallback) ───────────────────
    html = ""
    subpage_results: list[dict] = []
    playwright_timeout = METADATA_ONLY_TIMEOUT_MS if jina_markdown else HOMEPAGE_TIMEOUT_MS
    # Scroll steps — fewer when Jina already covered lazy content
    playwright_scroll = 12 if jina_markdown else 20

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"],
            )
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                viewport={"width": 1920, "height": 1080},
            )
            page = context.new_page()

            # Apply stealth once on the main page — subpages inherit the same context
            Stealth().apply_stealth_sync(page)

            html = _render_page_html(page, url, playwright_timeout, scroll_steps=playwright_scroll)
            homepage_soup = BeautifulSoup(html, "html.parser")
            spider_links = _discover_high_value_internal_links(homepage_soup, url)

            # Spider subpages only when Jina did NOT provide content
            # (If Jina succeeded, its output already covers the homepage depth)
            if not jina_markdown and spider_links:
                selected = ", ".join(link["url"] for link in spider_links)
                print(f"[*] Jina unavailable; spidering {len(spider_links)} sub-page(s): {selected}")
                for spider_link in spider_links:
                    sub_url = spider_link["url"]
                    # Reuse context — stealth is inherited, no re-apply needed
                    sub_page = context.new_page()
                    try:
                        sub_html = _render_page_html(sub_page, sub_url, SUBPAGE_TIMEOUT_MS, scroll_steps=10)
                        subpage_results.append({"url": sub_url, "html": sub_html})
                        print(f"[+] Spider scraped sub-page: {sub_url}")
                    except Exception as sub_error:
                        print(f"[!] Spider skipped sub-page {sub_url}: {sub_error}")
                    finally:
                        sub_page.close()

            browser.close()

    except Exception as exc:
        print(f"[!] Playwright failed for {url}: {exc}")
        if not jina_markdown:
            return _empty_scrape_result(url)

    if not html and not jina_markdown:
        return _empty_scrape_result(url)

    # ── Build result ─────────────────────────────────────────────────────────
    soup = BeautifulSoup(html, "html.parser") if html else BeautifulSoup("", "html.parser")
    metadata = _extract_metadata_from_soup(url, soup)

    # Determine primary text content
    if jina_markdown:
        # Jina content is primary — clean, LLM-ready
        primary_text = f"{PAGE_DELIMITER.format(url=url)}{jina_markdown}"
    else:
        # Playwright text content as fallback
        markdown_sections = [_soup_to_markdown(url, html)]
        for subpage in subpage_results:
            markdown_sections.append(_soup_to_markdown(subpage["url"], subpage["html"]))
        primary_text = "\n".join(markdown_sections)

    # Append link/iframe/image context (same as before)
    lines = [primary_text]
    link_lines = [
        f"{link.get('text') or 'Link'}: {link.get('url')}"
        for link in metadata["important_links"][:60]
    ]
    if link_lines:
        lines.extend(["", "## Important Links"] + link_lines)
    if metadata["iframe_sources"]:
        lines.extend(["", "## Iframe Sources"] + [f"Iframe source: {s}" for s in metadata["iframe_sources"][:20]])
    if metadata["images"]:
        lines.extend(["", "## Image Candidates"] + [f"Image candidate: {s}" for s in metadata["images"][:12]])

    markdown_content = "\n".join(lines).strip()
    source_label = "Jina" if jina_markdown else "Playwright"
    print(
        f"[*] Extracted {len(markdown_content)} chars via {source_label} across "
        f"{1 + len(subpage_results)} page(s), "
        f"{len(metadata['json_ld_schemas'])} JSON-LD schemas, "
        f"{len(metadata['images'])} image candidates."
    )

    return {
        "markdown_content": markdown_content,
        "json_ld_schemas": metadata["json_ld_schemas"],
        "images": metadata["images"],
        "important_links": metadata["important_links"],
        "iframe_sources": metadata["iframe_sources"],
        "spidered_pages": [subpage["url"] for subpage in subpage_results],
        "page_title": metadata["page_title"],
        "meta_description": metadata["meta_description"],
        "website": url,
        "appointment_url": metadata["appointment_url"],
        # Backwards-compatible aliases for existing pipeline callers.
        "text": markdown_content,
        "links": metadata["important_links"],
    }


def scrape_text_from_url(url: str) -> str:
    """Backwards-compatible helper for callers that only need text."""
    return scrape_content_from_url(url)["text"]

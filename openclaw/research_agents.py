import json
import os
import re
import time
import urllib.parse
import urllib.request
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, List, Optional

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client as create_supabase_client

from scraper import scrape_content_from_url

warnings.filterwarnings(
    "ignore",
    message=r".*duckduckgo_search.*renamed to.*ddgs.*",
    category=RuntimeWarning,
)
warnings.filterwarnings(
    "ignore",
    message=r"urllib3 v2 only supports OpenSSL.*",
)

load_dotenv(".env")
load_dotenv("../.env.local")

PLANNER_MODEL = os.environ.get("OPENCLAW_RESEARCH_PLANNER_MODEL", "deepseek/deepseek-v4-flash")
DEEP_MODEL = os.environ.get("OPENCLAW_RESEARCH_DEEP_MODEL", "deepseek/deepseek-chat")
REQUEST_TIMEOUT_SECONDS = int(os.environ.get("OPENCLAW_RESEARCH_TIMEOUT", "60"))
REQUEST_RETRIES = int(os.environ.get("OPENCLAW_RESEARCH_RETRIES", "3"))
DEFAULT_TARGET_LINKS = int(os.environ.get("OPENCLAW_RESEARCH_TARGET_LINKS", "12"))
FACT_WORKERS = int(os.environ.get("OPENCLAW_RESEARCH_FACT_WORKERS", "3"))
USE_DDGS_API = os.environ.get("OPENCLAW_USE_DDGS_API", "").strip().lower() in {"1", "true", "yes"}
BRAVE_SEARCH_API_KEY = os.environ.get("BRAVE_SEARCH_API_KEY", "").strip()
USE_BRAVE_SEARCH = bool(BRAVE_SEARCH_API_KEY) and os.environ.get("OPENCLAW_USE_BRAVE_SEARCH", "true").strip().lower() not in {"0", "false", "no"}

BLOCKED_DOMAINS = [
    "facebook.com",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "pinterest.com",
    "reddit.com",
    "linkedin.com",
]


def create_client() -> Optional[OpenAI]:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return None

    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )


def extract_json(content: str) -> dict:
    content = content.strip()
    if "```json" in content:
        content = content.split("```json", 1)[1].split("```", 1)[0].strip()
    elif content.startswith("```"):
        content = content.split("```", 1)[1].split("```", 1)[0].strip()

    return json.loads(content)


def call_worker(
    client: OpenAI,
    model: str,
    role_name: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.2,
) -> str:
    last_error = None

    for attempt in range(1, REQUEST_RETRIES + 1):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
            )
            return response.choices[0].message.content.strip()
        except Exception as exc:
            last_error = exc
            print(f"[!] {role_name} attempt {attempt}/{REQUEST_RETRIES} failed: {exc}")
            if attempt < REQUEST_RETRIES:
                time.sleep(2 * attempt)

    raise RuntimeError(f"{role_name} failed after {REQUEST_RETRIES} retries: {last_error}")


def is_blocked_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    host = parsed.netloc.lower()
    return any(domain in host for domain in BLOCKED_DOMAINS)


def dedupe_results(results: List[dict]) -> List[dict]:
    seen = set()
    clean = []

    for item in results:
        url = item.get("url") or item.get("href")
        if not url or url in seen or is_blocked_url(url):
            continue

        seen.add(url)
        clean.append(
            {
                "title": item.get("title") or item.get("body") or url,
                "url": url,
                "snippet": item.get("snippet") or item.get("body") or "",
            }
        )

    return clean


def normalize_search_url(url: str) -> str:
    if not url:
        return ""

    if url.startswith("//"):
        url = f"https:{url}"

    if url.startswith("/l/") or "duckduckgo.com/l/?" in url:
        parsed = urllib.parse.urlparse(url)
        params = urllib.parse.parse_qs(parsed.query)
        uddg = params.get("uddg", [""])[0]
        if uddg:
            return urllib.parse.unquote(uddg)

    return url


def fetch_search_html(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return response.read().decode("utf-8", errors="ignore")


def search_duckduckgo_api(query: str, max_results: int) -> List[dict]:
    try:
        from duckduckgo_search import DDGS

        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
    except Exception as exc:
        print(f"[!] DuckDuckGo API search failed: {exc}")
        return []

    return dedupe_results(
        [
            {
                "title": item.get("title"),
                "url": item.get("href"),
                "snippet": item.get("body"),
            }
            for item in results
        ]
    )


def search_brave_api(query: str, max_results: int) -> List[dict]:
    if not BRAVE_SEARCH_API_KEY:
        return []

    search_url = "https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode(
        {
            "q": query,
            "count": min(max_results, 20),
            "search_lang": "en",
            "country": "US",
        }
    )
    request = urllib.request.Request(
        search_url,
        headers={
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
            "User-Agent": "OpenClaw/1.0",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            raw = response.read()
            if response.headers.get("content-encoding", "").lower() == "gzip":
                import gzip

                raw = gzip.decompress(raw)
            payload = json.loads(raw.decode("utf-8", errors="ignore"))
    except Exception as exc:
        print(f"[!] Brave Search API failed: {exc}")
        return []

    web_results = (payload.get("web") or {}).get("results") or []
    return dedupe_results(
        [
            {
                "title": item.get("title"),
                "url": item.get("url"),
                "snippet": item.get("description") or item.get("snippet") or "",
            }
            for item in web_results
        ]
    )


def search_duckduckgo_html(query: str, max_results: int) -> List[dict]:
    search_url = "https://duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
    try:
        html = fetch_search_html(search_url)
    except Exception as exc:
        print(f"[!] DuckDuckGo HTML search failed: {exc}")
        return []

    soup = BeautifulSoup(html, "html.parser")
    results = []
    for result in soup.select(".result"):
        anchor = result.select_one(".result__a") or result.find("a")
        if not anchor:
            continue

        url = normalize_search_url(anchor.get("href") or "")
        snippet_tag = result.select_one(".result__snippet")
        results.append(
            {
                "title": anchor.get_text(" ", strip=True),
                "url": url,
                "snippet": snippet_tag.get_text(" ", strip=True) if snippet_tag else "",
            }
        )
        if len(results) >= max_results:
            break

    return dedupe_results(results)


def search_bing_html(query: str, max_results: int) -> List[dict]:
    search_url = "https://www.bing.com/search?" + urllib.parse.urlencode({"q": query, "count": max_results})
    try:
        html = fetch_search_html(search_url)
    except Exception as exc:
        print(f"[!] Bing HTML search failed: {exc}")
        return []

    soup = BeautifulSoup(html, "html.parser")
    results = []
    for result in soup.select("li.b_algo"):
        anchor = result.select_one("h2 a")
        if not anchor:
            continue

        snippet_tag = result.select_one(".b_caption p")
        results.append(
            {
                "title": anchor.get_text(" ", strip=True),
                "url": normalize_search_url(anchor.get("href") or ""),
                "snippet": snippet_tag.get_text(" ", strip=True) if snippet_tag else "",
            }
        )
        if len(results) >= max_results:
            break

    return dedupe_results(results)


def search_web(query: str, max_results: int = 30) -> List[dict]:
    print(f"[*] Searching web for: {query}")
    results = []

    providers = [
        ("DuckDuckGo HTML", search_duckduckgo_html),
        ("Bing HTML", search_bing_html),
    ]
    if USE_BRAVE_SEARCH:
        providers.insert(0, ("Brave Search API", search_brave_api))
    if USE_DDGS_API:
        providers.append(("DuckDuckGo API", search_duckduckgo_api))

    for provider_name, provider in providers:
        provider_results = provider(query, max_results)
        if provider_results:
            print(f"[*] {provider_name} returned {len(provider_results)} usable links.")
            results.extend(provider_results)
            break
        print(f"[*] {provider_name} returned 0 usable links; trying next provider.")

    clean = dedupe_results(results)[:max_results]
    print(f"[*] Search returned {len(clean)} usable links after hard filtering.")
    return clean


def role_search_planner(client: OpenAI, user_request: str) -> dict:
    system_prompt = """
You are Role 1: Search Planner.
Your only job is to analyze user intent, expand search keywords, and decide research scope.
Return only valid JSON.
""".strip()
    user_prompt = f"""
User request:
{user_request}

Create a research plan for Asian Health Hub operations.
Default target_links should be around {DEFAULT_TARGET_LINKS}.

Return JSON:
{{
  "intent": "short description",
  "optimized_query": "best search query",
  "alternate_queries": ["query 2", "query 3"],
  "target_links": 12,
  "notes": "scope notes"
}}
""".strip()
    content = call_worker(client, PLANNER_MODEL, "Search Planner", system_prompt, user_prompt)
    data = extract_json(content)
    data["target_links"] = int(data.get("target_links") or DEFAULT_TARGET_LINKS)
    return data


def role_batch_link_selector(client: OpenAI, plan: dict, links: List[dict]) -> List[dict]:
    system_prompt = """
You are Role 2: Batch Link Selector.
Your only job is to select the most authoritative and useful links from a search result pool.
Label each chosen source as:
- detail: a specific article/report/page with the needed information
- list: a hub/category/search/listing page that may contain deeper article links
Return only valid JSON.
""".strip()
    user_prompt = f"""
Research plan:
{json.dumps(plan, ensure_ascii=False)}

Search result pool:
{json.dumps(links, ensure_ascii=False)[:24000]}

Select 10-12 best sources when possible.
Prefer official medical/government sources, reputable hospital systems, academic sources, major publications, and clearly relevant detailed pages.
Remove low-quality aggregators, social media, video pages, and duplicate topics.

Return JSON:
{{
  "selected_links": [
    {{
      "url": "https://example.com/page",
      "title": "Page title",
      "source_type": "detail",
      "reason": "why selected"
    }}
  ]
}}
""".strip()
    content = call_worker(client, PLANNER_MODEL, "Batch Link Selector", system_prompt, user_prompt)
    try:
        selected = extract_json(content).get("selected_links", [])
    except Exception as exc:
        print(f"[!] Link selector JSON failed, using fallback links: {exc}")
        selected = [
            {
                "url": item["url"],
                "title": item["title"],
                "source_type": "detail",
                "reason": "Fallback selected from search results",
            }
            for item in links[: DEFAULT_TARGET_LINKS]
        ]

    clean = []
    seen = set()
    for item in selected:
        url = item.get("url")
        if not url or url in seen or is_blocked_url(url):
            continue
        seen.add(url)
        clean.append(
            {
                "url": url,
                "title": item.get("title") or url,
                "source_type": item.get("source_type") if item.get("source_type") in {"detail", "list"} else "detail",
                "reason": item.get("reason") or "",
            }
        )
    return clean


def fetch_html(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121 Safari/537.36"
        },
    )
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return response.read().decode("utf-8", errors="ignore")


def extract_links_from_page(url: str, limit: int = 40) -> List[dict]:
    try:
        html = fetch_html(url)
    except Exception as exc:
        print(f"[!] Could not fetch list page links from {url}: {exc}")
        return []

    soup = BeautifulSoup(html, "html.parser")
    links = []
    seen = set()

    for anchor in soup.find_all("a"):
        href = anchor.get("href")
        title = " ".join(anchor.get_text(" ", strip=True).split())
        if not href or not title:
            continue

        absolute_url = urllib.parse.urljoin(url, href)
        if absolute_url in seen or is_blocked_url(absolute_url):
            continue

        parsed = urllib.parse.urlparse(absolute_url)
        if parsed.scheme not in {"http", "https"}:
            continue

        seen.add(absolute_url)
        links.append({"url": absolute_url, "title": title})
        if len(links) >= limit:
            break

    return links


def role_sub_link_extractor(client: OpenAI, parent: dict, candidates: List[dict]) -> List[dict]:
    if not candidates:
        return []

    system_prompt = """
You are Role 3: Sub-link Extractor.
Your only job is to choose the 3 most specific article/report links from a list/hub page.
Return only valid JSON.
""".strip()
    user_prompt = f"""
Parent list page:
{json.dumps(parent, ensure_ascii=False)}

Candidate links:
{json.dumps(candidates, ensure_ascii=False)[:16000]}

Choose up to 3 links that are most specific, recent/relevant, and likely to contain detailed facts.

Return JSON:
{{
  "detail_links": [
    {{"url": "https://example.com/article", "title": "Article title", "reason": "why"}}
  ]
}}
""".strip()
    content = call_worker(client, PLANNER_MODEL, "Sub-link Extractor", system_prompt, user_prompt)
    try:
        selected = extract_json(content).get("detail_links", [])
    except Exception as exc:
        print(f"[!] Sub-link extractor JSON failed, using fallback links: {exc}")
        selected = candidates[:3]

    clean = []
    seen = set()
    for item in selected[:3]:
        url = item.get("url")
        if not url or url in seen or is_blocked_url(url):
            continue
        seen.add(url)
        clean.append(
            {
                "url": url,
                "title": item.get("title") or url,
                "source_type": "detail",
                "reason": item.get("reason") or f"Selected from {parent.get('url')}",
            }
        )
    return clean


def role_fact_extractor(client: OpenAI, source: dict, text: str) -> dict:
    system_prompt = """
You are Role 4.1: Fact Extractor.
Your only job is to extract concise, source-grounded facts from one captured web page.
Do not synthesize across sources. Do not invent.
Return only valid JSON.
""".strip()
    user_prompt = f"""
Source:
{json.dumps(source, ensure_ascii=False)}

Captured text:
{text[:26000]}

Extract facts for a final research report.
Focus on dates, statistics, definitions, claims, uncertainty, recommendations, and source attribution.

Return JSON:
{{
  "source_url": "{source.get('url')}",
  "source_title": "{source.get('title')}",
  "source_reliability": "high/medium/low",
  "key_facts": ["fact 1", "fact 2"],
  "important_quotes_or_terms": ["short term or phrase"],
  "limitations": ["what this source does not cover"]
}}
""".strip()
    content = call_worker(client, DEEP_MODEL, "Fact Extractor", system_prompt, user_prompt, temperature=0.1)
    try:
        return extract_json(content)
    except Exception as exc:
        print(f"[!] Fact extractor JSON failed for {source.get('url')}: {exc}")
        return {
            "source_url": source.get("url"),
            "source_title": source.get("title"),
            "source_reliability": "unknown",
            "key_facts": [content[:1800]],
            "important_quotes_or_terms": [],
            "limitations": ["Fact extractor returned non-JSON content."],
        }


def role_final_editor(client: OpenAI, user_request: str, plan: dict, fact_sheets: List[dict]) -> str:
    system_prompt = """
You are Role 4.2: Final Editor.
Your only job is to synthesize fact sheets into a clear, sourced final report.
Use only the supplied fact sheets. Identify uncertainty and conflicts.
Write in Vietnamese unless the user explicitly asked for English.
Use an executive Telegram-friendly format with emojis and clear sections.
Be concise enough to fit in one Telegram message when possible.
""".strip()
    user_prompt = f"""
Original user request:
{user_request}

Research plan:
{json.dumps(plan, ensure_ascii=False)}

Fact sheets:
{json.dumps(fact_sheets, ensure_ascii=False)[:50000]}

Write the final research report in this exact style:

📌 TỔNG QUAN
1 concise paragraph summarizing the answer.

💡 THÔNG TIN CHI TIẾT
- **Key point 1:** concise fact with source context.
- **Key point 2:** concise fact with source context.
- **Key point 3:** concise fact with source context.
- Include 4-7 bullets maximum.

🔍 NHẬN ĐỊNH SÂU
1-2 concise paragraphs explaining what the findings mean for Asian Health Hub.

⚠️ KHOẢNG TRỐNG / ĐIỂM CHƯA CHẮC
- 2-4 concise bullets only.

✅ HÀNH ĐỘNG ĐỀ XUẤT
- 2-4 concrete next actions.

🔗 NGUỒN THAM KHẢO
- Include 3-6 most relevant sources as Markdown links: [Source title](URL)

Rules:
- Do not paste a long raw list of every processed source.
- Do not include internal role logs.
- Do not mention facts not supported by fact sheets.
- If sources are poor or irrelevant, say that clearly in the overview and next actions.
""".strip()
    return call_worker(client, DEEP_MODEL, "Final Editor", system_prompt, user_prompt, temperature=0.2)


def looks_like_clinic_research(user_request: str) -> bool:
    lowered = user_request.lower()
    return any(
        keyword in lowered
        for keyword in [
            "clinic",
            "clinics",
            "phòng khám",
            "phong kham",
            "doctor",
            "doctors",
            "bác sĩ",
            "bac si",
        ]
    )


def build_clinic_database_fact_sheets(user_request: str) -> List[dict]:
    if not looks_like_clinic_research(user_request):
        return []

    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not supabase_key:
        print("[!] Clinic database fallback skipped: missing Supabase env.")
        return []

    try:
        supabase = create_supabase_client(supabase_url, supabase_key)
        rows = (
            supabase.table("clinics")
            .select("name,slug,description,address,city,state,phone,languages,specialty,metadata")
            .limit(100)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        print(f"[!] Clinic database fallback failed: {exc}")
        return []

    request_lower = user_request.lower()
    wants_vietnamese = any(term in request_lower for term in ["vietnamese", "tiếng việt", "tieng viet", "viet"])
    city_terms = [term for term in ["san jose", "houston", "san francisco", "los angeles", "garden grove"] if term in request_lower]

    scored_rows = []
    for row in rows:
        languages = [str(language).lower() for language in (row.get("languages") or [])]
        city = str(row.get("city") or "").lower()
        address = str(row.get("address") or "").lower()
        score = 0

        if wants_vietnamese and any("vietnam" in language or "tiếng việt" in language for language in languages):
            score += 5
        if city_terms and any(term in city or term in address for term in city_terms):
            score += 4
        if row.get("description"):
            score += 1
        if row.get("metadata"):
            score += 1

        if score > 0:
            scored_rows.append((score, row))

    scored_rows.sort(key=lambda item: item[0], reverse=True)
    selected_rows = [row for _, row in scored_rows[:18]]
    if not selected_rows:
        print("[!] Clinic database fallback found no matching clinics.")
        return []

    print(f"[*] Clinic database fallback found {len(selected_rows)} candidate clinics.")
    fact_sheets = []
    for row in selected_rows:
        slug = row.get("slug") or ""
        source_url = f"/clinics/{slug}" if slug else "Supabase clinics table"
        metadata = row.get("metadata") or {}
        facts = [
            f"Clinic name: {row.get('name')}",
            f"Location: {', '.join(part for part in [row.get('address'), row.get('city'), row.get('state')] if part)}",
            f"Languages listed: {', '.join(row.get('languages') or []) or 'Not listed'}",
            f"Specialty: {row.get('specialty') or 'Not listed'}",
            f"Phone: {row.get('phone') or 'Not listed'}",
        ]
        if row.get("description"):
            facts.append(f"Description: {row.get('description')}")
        if metadata.get("rating"):
            facts.append(f"Rating: {metadata.get('rating')} from {metadata.get('rating_count', 'unknown')} reviews")
        if metadata.get("services"):
            facts.append(f"Services: {', '.join(metadata.get('services') or [])}")

        fact_sheets.append(
            {
                "source_url": source_url,
                "source_title": row.get("name") or "Clinic database record",
                "source_reliability": "medium",
                "key_facts": facts,
                "important_quotes_or_terms": row.get("languages") or [],
                "limitations": [
                    "Fallback source from Asian Health Hub Supabase clinic database because web search returned no usable links.",
                    "Language availability and clinic details should be verified with the clinic before publishing a ranked recommendation.",
                ],
            }
        )

    return fact_sheets


def collect_detail_sources(client: OpenAI, selected_links: List[dict], target_links: int) -> List[dict]:
    detail_sources = []
    seen = set()

    for item in selected_links:
        url = item.get("url")
        if not url or url in seen:
            continue

        if item.get("source_type") == "list":
            print(f"[*] Drilling into list page: {url}")
            candidates = extract_links_from_page(url)
            sub_links = role_sub_link_extractor(client, item, candidates)
            for sub_link in sub_links:
                sub_url = sub_link["url"]
                if sub_url not in seen:
                    seen.add(sub_url)
                    detail_sources.append(sub_link)
        else:
            seen.add(url)
            detail_sources.append(item)

        if len(detail_sources) >= target_links + 6:
            break

    return detail_sources[: max(target_links, min(len(detail_sources), 18))]


def capture_and_extract_fact(client: OpenAI, source: dict, index: int, total: int) -> Optional[dict]:
    print(f"[*] Capture {index}/{total}: {source['url']}")
    captured = scrape_content_from_url(source["url"])
    text = captured.get("text") if isinstance(captured, dict) else ""
    if not text:
        print(f"[!] Skipping empty capture: {source['url']}")
        return None

    return role_fact_extractor(client, source, text)


def run_research(user_request: str) -> str:
    client = create_client()
    if not client:
        return "Missing OPENROUTER_API_KEY in openclaw/.env. Cannot run multi-agent research."

    print("[*] Role 1: Search Planner")
    plan = role_search_planner(client, user_request)
    target_links = max(1, min(int(plan.get("target_links") or DEFAULT_TARGET_LINKS), 18))

    search_queries = [plan["optimized_query"]] + plan.get("alternate_queries", [])[:2]
    master_pool = []
    for query in search_queries:
        master_pool.extend(search_web(query, max_results=30))

    master_pool = dedupe_results(master_pool)
    if not master_pool:
        print("[!] No web search results found after filtering. Trying internal clinic database fallback.")
        fact_sheets = build_clinic_database_fact_sheets(user_request)
        if not fact_sheets:
            return (
                "No search results found after filtering, and no matching internal clinic records were available. "
                "Try a more specific query or configure a dedicated search API."
            )

        print("[*] Role 4.2: Final Editor")
        report = role_final_editor(client, user_request, plan, fact_sheets)
        return report

    print("[*] Role 2: Batch Link Selector")
    selected_links = role_batch_link_selector(client, plan, master_pool)
    if not selected_links:
        return "No sources selected by Batch Link Selector."

    print("[*] Role 3: Sub-link Extractor")
    detail_sources = collect_detail_sources(client, selected_links, target_links)
    if not detail_sources:
        return "No detail sources available after drilling."

    print(f"[*] Execution Phase: extracting facts from {len(detail_sources)} detail pages")
    fact_sheets = []
    max_workers = max(1, min(FACT_WORKERS, len(detail_sources)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(capture_and_extract_fact, client, source, index, len(detail_sources))
            for index, source in enumerate(detail_sources, start=1)
        ]
        for future in as_completed(futures):
            try:
                fact_sheet = future.result()
                if fact_sheet:
                    fact_sheets.append(fact_sheet)
            except Exception as exc:
                print(f"[!] Fact worker failed: {exc}")

    if not fact_sheets:
        return "Could not extract facts from selected sources."

    print("[*] Role 4.2: Final Editor")
    return role_final_editor(client, user_request, plan, fact_sheets)

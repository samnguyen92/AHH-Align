#!/usr/bin/env python3
"""
openclaw/scrape_deep_website.py
Performs deep discovery and extraction of clinic websites (up to 10 prioritized pages)
Focusing on Pricing, Fees, FAQ, Insurance, Services, and About pages.
Prioritizes shallow paths (single slash like /pricing, /about) over deep nested paths.
"""

import sys
import json
import re
import urllib.parse
from urllib.parse import urlparse, urljoin
from playwright.sync_api import sync_playwright

PRIORITY_KEYWORDS = [
    'pricing', 'price', 'prices', 'fees', 'rates', 'cost', 'costs',
    'faq', 'faqs', 'questions',
    'insurance', 'payment', 'financial',
    'services', 'treatments', 'acupuncture', 'care',
    'new-patient', 'first-visit', 'forms',
    'about', 'about-us', 'our-team', 'practitioners', 'doctor'
]

EXCLUDE_PATTERNS = [
    r'\.(pdf|jpg|jpeg|png|gif|webp|svg|css|js|xml|zip|doc|docx)$',
    r'/(tag|category|author|wp-content|wp-includes|feed|cart|checkout|my-account)/',
    r'/(privacy-policy|terms-of-service|disclaimer|copyright)',
    r'[?#]'
]

def score_url(url: str, base_domain: str) -> tuple:
    parsed = urlparse(url)
    path = parsed.path.lower().rstrip('/')
    
    # Exclude non-page resources or spam
    for pat in EXCLUDE_PATTERNS:
        if re.search(pat, path):
            return (-999, 999)

    # Count path depth (number of slashes)
    segments = [s for s in path.split('/') if s]
    depth = len(segments) # 0 for home, 1 for /pricing, 2 for /services/acupuncture

    # Keyword match score
    keyword_score = 0
    for idx, kw in enumerate(PRIORITY_KEYWORDS):
        if kw in path:
            # Earlier keywords in list (pricing, faq) get highest weight
            keyword_score += (len(PRIORITY_KEYWORDS) - idx) * 10
            break

    # Prioritize shallow depth: depth 1 gets strong bonus, depth > 2 penalized
    # User rule: "đọc trang với 1 / trước thay gì đọc theo thứ tự sitemap"
    depth_penalty = depth * 5
    if depth == 1 and keyword_score > 0:
        keyword_score += 25

    return (keyword_score, -depth)

def extract_clean_text(page) -> str:
    # Remove script, style, nav, footer, header to get meaningful body text
    try:
        page.evaluate("""
            () => {
                const removals = ['script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'footer', 'header', '.footer', '.header', '.nav'];
                for (const sel of removals) {
                    document.querySelectorAll(sel).forEach(el => el.remove());
                }
            }
        """)
        text = page.inner_text("body")
        # Collapse multiple spaces and newlines
        clean = re.sub(r'\n\s*\n+', '\n\n', text)
        clean = re.sub(r'[ \t]+', ' ', clean).strip()
        return clean[:6000] # Cap per page
    except Exception:
        return ""

def crawl_site(start_url: str, max_pages: int = 10) -> dict:
    if not start_url.startswith(('http://', 'https://')):
        start_url = 'https://' + start_url

    parsed_start = urlparse(start_url)
    base_domain = parsed_start.netloc.lower().replace('www.', '')

    collected_pages = []
    discovered_urls = set()
    queue = []

    # Proactive high-value probe paths (shallow depth = 1 slash)
    PROBE_PATHS = [
        '/pricing', '/pricing/', '/rates', '/fees', '/cost',
        '/faq', '/faqs', '/frequently-asked-questions',
        '/insurance', '/payment',
        '/about', '/about-us'
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        # Step 1: Crawl homepage & harvest links
        try:
            page.goto(start_url, wait_until="domcontentloaded", timeout=12000)
            homepage_text = extract_clean_text(page)
            collected_pages.append({
                "url": start_url,
                "title": page.title(),
                "type": "home",
                "content": homepage_text[:6000]
            })

            # Extract all internal hrefs
            hrefs = page.eval_on_selector_all("a[href]", "elements => elements.map(el => el.href)")
            for href in hrefs:
                if not href:
                    continue
                full_url = urljoin(start_url, href).split('#')[0].split('?')[0].rstrip('/')
                p_url = urlparse(full_url)
                u_domain = p_url.netloc.lower().replace('www.', '')
                if u_domain == base_domain and full_url not in discovered_urls and full_url != start_url.rstrip('/'):
                    discovered_urls.add(full_url)
                    score = score_url(full_url, base_domain)
                    if score[0] > -900:
                        queue.append((score, full_url))

        except Exception as e:
            sys.stderr.write(f"[!] Error loading homepage {start_url}: {e}\n")

        # Step 2: Proactively add high-value probe URLs if not already discovered
        for p_path in PROBE_PATHS:
            probe_url = f"{parsed_start.scheme}://{parsed_start.netloc}{p_path}".rstrip('/')
            if probe_url not in discovered_urls:
                discovered_urls.add(probe_url)
                score = score_url(probe_url, base_domain)
                queue.append((score, probe_url))

        # Step 3: Try sitemap.xml for any other pages
        try:
            sitemap_url = f"{parsed_start.scheme}://{parsed_start.netloc}/sitemap.xml"
            sm_res = page.request.get(sitemap_url, timeout=4000)
            if sm_res.ok:
                sm_text = sm_res.text()
                locs = re.findall(r'<loc>(https?://[^<]+)</loc>', sm_text)
                for loc in locs:
                    clean_loc = loc.split('#')[0].split('?')[0].rstrip('/')
                    loc_domain = urlparse(clean_loc).netloc.lower().replace('www.', '')
                    if loc_domain == base_domain and clean_loc not in discovered_urls:
                        discovered_urls.add(clean_loc)
                        score = score_url(clean_loc, base_domain)
                        if score[0] > -900:
                            queue.append((score, clean_loc))
        except Exception:
            pass

        # Sort queue:
        # User requirement: "đọc trang với 1 / trước thay gì đọc theo thứ tự sitemap (ví dụ tenmien/aboutus sẽ trước thay gì tenmien/1sub/acd ngay cả khi thứ tự trong sitemap khác nhau)"
        # Sort key: (is_depth_1 DESC, keyword_score DESC, depth ASC)
        def sort_priority(item):
            score_tuple, u = item
            kw_score, neg_depth = score_tuple
            path = urlparse(u).path.strip('/')
            segments = [s for s in path.split('/') if s]
            is_depth_1 = 1 if len(segments) <= 1 else 0
            return (is_depth_1, kw_score, -len(segments))

        queue.sort(key=sort_priority, reverse=True)

        # Deduplicate queue by normalized path
        seen_paths = set()
        filtered_queue = []
        for score, u in queue:
            path = urlparse(u).path.rstrip('/')
            if path not in seen_paths:
                seen_paths.add(path)
                filtered_queue.append(u)

        # Step 4: Crawl top candidate pages up to max_pages
        target_urls = filtered_queue[:max_pages - 1]

        for target_url in target_urls:
            try:
                page.goto(target_url, wait_until="domcontentloaded", timeout=12000)
                content = extract_clean_text(page)
                if len(content) > 100:
                    title = page.title()
                    p_lower = target_url.lower()
                    p_type = "general"
                    if any(k in p_lower for k in ['pricing', 'price', 'fee', 'rate', 'cost']):
                        p_type = "pricing"
                    elif any(k in p_lower for k in ['faq', 'question']):
                        p_type = "faq"
                    elif any(k in p_lower for k in ['insurance', 'payment']):
                        p_type = "insurance"
                    elif any(k in p_lower for k in ['service', 'treatment']):
                        p_type = "services"
                    elif any(k in p_lower for k in ['about', 'team', 'doctor']):
                        p_type = "about"

                    collected_pages.append({
                        "url": target_url,
                        "title": title,
                        "type": p_type,
                        "content": content
                    })
            except Exception:
                continue

        browser.close()

    return {
        "domain": base_domain,
        "pages_crawled": len(collected_pages),
        "pages": collected_pages
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No URL provided"}))
        sys.exit(1)

    url_arg = sys.argv[1].strip()
    result = crawl_site(url_arg)
    print(json.dumps(result))

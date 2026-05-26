from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
from playwright_stealth import Stealth
from urllib.parse import urljoin, urlparse


APPOINTMENT_KEYWORDS = (
    "appointment",
    "book",
    "schedule",
    "request an appointment",
    "new patient",
)

SCHEDULING_HOST_KEYWORDS = (
    "calendly",
    "zocdoc",
    "nexhealth",
    "solutionreach",
    "patientpop",
    "opencare",
    "dentrix",
    "weave",
)


def is_likely_appointment_url(page_url: str, candidate_url: str, label_text: str) -> bool:
    if not any(keyword in label_text for keyword in APPOINTMENT_KEYWORDS):
        return False

    page_host = urlparse(page_url).netloc.lower().removeprefix("www.")
    candidate_host = urlparse(candidate_url).netloc.lower().removeprefix("www.")
    if not candidate_host:
        return False

    if candidate_host == page_host or candidate_host.endswith(f".{page_host}"):
        return True

    return any(keyword in candidate_host for keyword in SCHEDULING_HOST_KEYWORDS)


def scrape_content_from_url(url: str) -> dict:
    """
    Use Playwright to render the page, then extract clean text and image candidates.
    """
    print(f"[*] Scraping URL: {url}")
    html = ""
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--disable-blink-features=AutomationControlled"]
            )
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                viewport={"width": 1920, "height": 1080}
            )
            page = context.new_page()
            
            # Apply stealth to bypass bot protections (like Cloudflare)
            Stealth().apply_stealth_sync(page)
            
            try:
                # Prefer network idle for JS-heavy sites, but fall back when a site keeps long-polling.
                page.goto(url, timeout=45000, wait_until="networkidle")
            except Exception as first_error:
                print(f"[!] networkidle timed out for {url}; retrying with domcontentloaded: {first_error}")
                page.goto(url, timeout=45000, wait_until="domcontentloaded")
                page.wait_for_timeout(4000)
            html = page.content()
            browser.close()
    except Exception as e:
        print(f"[!] Error scraping {url}: {e}")
        return {"text": "", "images": [], "links": [], "website": url, "appointment_url": None}

    if not html:
        return {"text": "", "images": [], "links": [], "website": url, "appointment_url": None}

    # Clean HTML with BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")

    images = []
    for selector in [
        ('meta', {'property': 'og:image'}),
        ('meta', {'name': 'twitter:image'}),
        ('meta', {'property': 'og:image:secure_url'}),
    ]:
        tag = soup.find(*selector)
        content = tag.get("content") if tag else None
        if content:
            images.append(urljoin(url, content))

    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-lazy-src")
        if not src:
            continue
        absolute_src = urljoin(url, src)
        if absolute_src.startswith("http") and absolute_src not in images:
            images.append(absolute_src)
        if len(images) >= 5:
            break

    links = []
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
            links.append({"text": label, "url": absolute_href})

        label_text = f"{label} {href}".lower()
        if not appointment_url and absolute_href.startswith("http") and is_likely_appointment_url(url, absolute_href, label_text):
            appointment_url = absolute_href
    
    # Remove unwanted tags that clutter the text
    for element in soup(["script", "style", "nav", "footer", "header", "noscript", "iframe", "svg"]):
        element.decompose()
        
    # Get text with line breaks
    text = soup.get_text(separator='\n', strip=True)
    
    # Quick compression to save tokens
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    link_lines = []
    for link in links[:40]:
        label = link.get("text") or "Link"
        link_lines.append(f"{label}: {link.get('url')}")

    if link_lines:
        lines.extend(["Page links:"] + link_lines)

    compressed_text = '\n'.join(lines)
    
    print(f"[*] Extracted {len(compressed_text)} characters of text and {len(images)} image candidates.")
    return {
        "text": compressed_text,
        "images": images[:5],
        "links": links[:80],
        "website": url,
        "appointment_url": appointment_url,
    }

def scrape_text_from_url(url: str) -> str:
    """
    Backwards-compatible helper for callers that only need text.
    """
    return scrape_content_from_url(url)["text"]

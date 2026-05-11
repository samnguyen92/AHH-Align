from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
from playwright_stealth import Stealth
from urllib.parse import urljoin

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
            
            # Wait for network idle to ensure dynamic content loads
            page.goto(url, timeout=45000, wait_until="networkidle")
            html = page.content()
            browser.close()
    except Exception as e:
        print(f"[!] Error scraping {url}: {e}")
        return ""

    if not html:
        return {"text": "", "images": []}

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
    
    # Remove unwanted tags that clutter the text
    for element in soup(["script", "style", "nav", "footer", "header", "noscript", "iframe", "svg"]):
        element.decompose()
        
    # Get text with line breaks
    text = soup.get_text(separator='\n', strip=True)
    
    # Quick compression to save tokens
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    compressed_text = '\n'.join(lines)
    
    print(f"[*] Extracted {len(compressed_text)} characters of text and {len(images)} image candidates.")
    return {"text": compressed_text, "images": images[:5]}

def scrape_text_from_url(url: str) -> str:
    """
    Backwards-compatible helper for callers that only need text.
    """
    return scrape_content_from_url(url)["text"]

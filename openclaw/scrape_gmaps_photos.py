#!/usr/bin/env python3
"""
openclaw/scrape_gmaps_photos.py
Extracts public Google Maps photos for a given place_id or query using Playwright.
Returns JSON array of high-res image URLs to stdout.
"""

import json
import re
import sys
import time
from playwright.sync_api import sync_playwright

def get_photos(place_id: str, max_photos: int = 15) -> list:
    url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
    photo_urls = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        page = browser.new_page(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=15000)
            time.sleep(2.5)

            # Click photo button if present
            btn = page.query_selector("button[aria-label*='Photo'], button[aria-label*='photo'], button[jsaction*='pane.heroHeaderImage']")
            if btn:
                try:
                    btn.click()
                    time.sleep(2.5)
                except Exception:
                    pass

            elements = page.query_selector_all("div[style*='background-image'], img")
            raw_urls = set()
            for el in elements:
                src = el.get_attribute("src")
                if src and "googleusercontent" in src:
                    raw_urls.add(src)
                style = el.get_attribute("style") or ""
                m = re.search(r"url\([\"\'\\]?([^\"\'\\)]+)[\"\'\\]?\)", style)
                if m and "googleusercontent" in m.group(1):
                    raw_urls.add(m.group(1))

            for u in raw_urls:
                # Filter out avatar/tiny profile icons
                if "=s100" in u or "=w36" in u or "=w32" in u or "mapslogo" in u:
                    continue
                # Scale up to high-resolution (1200x800)
                if "=w" in u or "=s" in u:
                    high_res = re.sub(r"=w\d+-h\d+.*", "=w1200-h800-k-no", u)
                    high_res = re.sub(r"=s\d+.*", "=w1200-h800-k-no", high_res)
                    photo_urls.append(high_res)
                else:
                    photo_urls.append(u)

        except Exception as e:
            sys.stderr.write(f"[!] Error extracting Google Maps photos: {e}\n")
        finally:
            browser.close()

    # Deduplicate preserving order
    return list(dict.fromkeys(photo_urls))[:max_photos]

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps([]))
        sys.exit(0)

    pid = sys.argv[1].strip()
    result = get_photos(pid)
    print(json.dumps(result))

#!/usr/bin/env python3
"""openclaw/clinic_photos.py

Builds a clinic's photo gallery with a strict source priority:

    1. the clinic's OFFICIAL WEBSITE  (home page first, then the other crawled pages)
    2. Google Maps / Places photos     (only to fill what the website did not provide)
    3. nothing                         -> the site shows a neutral placeholder (never a stock/demo photo)

Quality gates: real photo (size/aspect/not flat), not a logo/icon, no exact or near duplicates across BOTH sources.
"""

from __future__ import annotations

import hashlib
import io
import re
import urllib.request
from pathlib import Path
from typing import Callable, Optional

try:  # Pillow is in requirements.txt; keep a soft fallback so a missing wheel does not break enrichment
    from PIL import Image, ImageStat
except Exception:  # pragma: no cover
    Image = None
    ImageStat = None

MAX_TOTAL = 10
MAX_FROM_WEBSITE = 6
MIN_WIDTH, MIN_HEIGHT = 600, 350
MIN_BYTES = 25_000
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


def download(url: str, referer: Optional[str] = None, timeout: int = 7) -> Optional[bytes]:
    try:
        if url.startswith("//"):
            url = "https:" + url
        headers = {"User-Agent": UA, "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"}
        if referer:
            headers["Referer"] = referer
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as resp:
            data = resp.read(12_000_000)
            return data if len(data) >= MIN_BYTES else None
    except Exception:
        return None


def detect_extension(buf: bytes) -> str:
    if buf[:3] == b"\xff\xd8\xff":
        return "jpg"
    if buf[:4] == b"\x89PNG":
        return "png"
    if buf[:4] == b"RIFF" and buf[8:12] == b"WEBP":
        return "webp"
    return "jpg"


def _average_hash(img) -> int:
    small = img.convert("L").resize((8, 8))
    pixels = list(small.getdata())
    mean = sum(pixels) / 64
    return sum(1 << i for i, p in enumerate(pixels) if p >= mean)


def _hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


class Gallery:
    """Accepts images one by one, rejecting junk and duplicates (exact + near-duplicate)."""

    def __init__(self) -> None:
        self.md5s: set[str] = set()
        self.hashes: list[int] = []

    def accept(self, buf: bytes) -> bool:
        digest = hashlib.md5(buf).hexdigest()
        if digest in self.md5s:
            return False
        if Image is not None:
            try:
                img = Image.open(io.BytesIO(buf))
                img.load()
            except Exception:
                return False
            w, h = img.size
            if w < MIN_WIDTH or h < MIN_HEIGHT or not (0.5 <= w / h <= 3.2):
                return False
            if ImageStat.Stat(img.convert("L")).stddev[0] < 12:  # flat colour block / blank placeholder
                return False
            ahash = _average_hash(img)
            if any(_hamming(ahash, other) <= 5 for other in self.hashes):
                return False
            self.hashes.append(ahash)
        self.md5s.add(digest)
        return True


def website_candidates(pages: list[dict]) -> list[str]:
    """Image URLs in reading order: home page body images, then CSS/meta hero images, then other pages."""
    ordered: list[str] = []
    seen: set[str] = set()
    rank = {"body": 0, "css": 1, "meta": 2}
    for page in pages:  # crawl_site already puts the home page first, then shallow/priority pages
        for item in sorted(page.get("images") or [], key=lambda i: (rank.get(i.get("where"), 3), -(i.get("w") or 0))):
            url = item.get("url")
            if url and url not in seen:
                seen.add(url)
                ordered.append(url)
    return ordered


def build_gallery(
    slug: str,
    website_pages: list[dict],
    root: Path,
    existing_google_urls: Optional[list[str]] = None,
    google_fetcher: Optional[Callable[[], list[str]]] = None,
    log: Callable[[str], None] = print,
) -> dict:
    """Returns {"images": [...], "sources": {url: "website"|"google"}, "images_source": "..."}."""
    web_dir = root / "public" / "uploads" / "generated-clinics" / "website"
    google_dir = root / "public" / "uploads" / "generated-clinics" / "google-places"
    web_dir.mkdir(parents=True, exist_ok=True)
    google_dir.mkdir(parents=True, exist_ok=True)

    gallery = Gallery()
    images: list[str] = []
    sources: dict[str, str] = {}

    # 1) official website (cap candidate downloads so slow CDNs never stall enrichment)
    referer = website_pages[0]["url"] if website_pages else None
    for url in website_candidates(website_pages)[:18]:
        if len([u for u in images if sources[u] == "website"]) >= MAX_FROM_WEBSITE:
            break
        buf = download(url, referer=referer)
        if not buf or not gallery.accept(buf):
            continue
        n = len([u for u in images if sources[u] == "website"]) + 1
        fname = f"{slug}-web-{n}.{detect_extension(buf)}"
        (web_dir / fname).write_bytes(buf)
        public_url = f"/uploads/generated-clinics/website/{fname}"
        images.append(public_url)
        sources[public_url] = "website"
    log(f"   [+] Website photos kept: {len(images)}")

    # 2) Google: reuse files we already downloaded, scrape Maps only if there are none
    google_urls = [u for u in (existing_google_urls or []) if "/google-places/" in u]
    google_items: list[tuple[str, bytes]] = []
    for public_url in google_urls:
        path = root / "public" / public_url.lstrip("/")
        if path.exists():
            google_items.append((public_url, path.read_bytes()))
    if not google_items and google_fetcher:
        for n, remote in enumerate(google_fetcher(), start=1):
            buf = download(remote)
            if buf:
                fname = f"{slug}-google-{n}.{detect_extension(buf)}"
                (google_dir / fname).write_bytes(buf)
                google_items.append((f"/uploads/generated-clinics/google-places/{fname}", buf))
    for public_url, buf in google_items:
        if len(images) >= MAX_TOTAL:
            break
        if gallery.accept(buf):
            images.append(public_url)
            sources[public_url] = "google"
    log(f"   [+] Total photos after Google fill: {len(images)}")

    kinds = {sources[u] for u in images}
    label = "none" if not kinds else ("mixed" if len(kinds) > 1 else next(iter(kinds)))
    primary = sources[images[0]] if images else "none"
    return {"images": images, "sources": sources, "images_source": label, "primary_image_source": primary}

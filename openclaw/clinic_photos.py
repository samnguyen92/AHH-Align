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


# --------------------------------------------------------------------------- integrity + shared entry point

def project_root() -> Path:
    """The folder that holds public/uploads: /app in the Docker containers, the repository root otherwise."""
    return Path("/app") if Path("/app/public").exists() else Path(__file__).resolve().parent.parent


def is_remote(url: str) -> bool:
    return isinstance(url, str) and url.startswith(("http://", "https://"))


def local_file_exists(url: str, root: Optional[Path] = None) -> bool:
    """Does the file behind a site-relative image address (/uploads/..., /brand/...) really exist and have content?"""
    if not isinstance(url, str) or not url.startswith("/") or url.startswith("//"):
        return False
    path = (root or project_root()) / "public" / url.lstrip("/")
    try:
        return path.is_file() and path.stat().st_size > 0
    except OSError:
        return False


def split_images(urls: list, root: Optional[Path] = None) -> tuple:
    """(usable, broken): site-relative files that are gone are broken; remote addresses cannot be checked here."""
    usable, broken = [], []
    for url in urls or []:
        if isinstance(url, str) and (is_remote(url) or local_file_exists(url, root)):
            usable.append(url)
        else:
            broken.append(url)
    return usable, broken


def attach_real_photos(
    data: dict,
    website_images: Optional[list] = None,
    google_fetcher: Optional[Callable[[], list]] = None,
    root: Optional[Path] = None,
    log: Callable[[str], None] = print,
) -> dict:
    """Give a new clinic its photos: the official website first, Google only to fill the gaps, otherwise NONE.

    Every photo is downloaded and kept on our server (never hot-linked), must pass the quality gates (size, shape,
    not flat, not a duplicate) and its source is recorded. A clinic with no real photo shows a neutral placeholder on
    the site; we never invent one (no AI-generated clinic photos).
    """
    from storage import safe_storage_name

    root = root or project_root()
    website = data.get("website") or data.get("source_url") or ""
    pages = [{"url": website, "images": [{"url": u, "where": "body"} for u in (website_images or []) if is_remote(u)]}] if website_images else []
    if google_fetcher is None and data.get("_google_photo_names"):
        names = list(data["_google_photo_names"])

        def google_fetcher() -> list:  # noqa: F811
            from google_places import get_google_places_key, photo_uris

            key = get_google_places_key()
            return photo_uris(names, key) if key else []

    gallery = build_gallery(
        safe_storage_name(data.get("name") or "clinic"), pages, root, existing_google_urls=[], google_fetcher=google_fetcher, log=log,
    )
    data["images"] = gallery["images"]
    data["image_sources"] = gallery["sources"]
    data["images_source"] = gallery["images_source"]
    data["primary_image_source"] = gallery["primary_image_source"]
    data.pop("_google_photo_names", None)
    return data


def _source_label(sources: dict, images: list) -> tuple:
    kinds = {sources.get(u) for u in images if sources.get(u)}
    if not images:
        return "none", "none"
    label = "mixed" if len(kinds) > 1 else (next(iter(kinds)) if kinds else "unknown")
    return label, (sources.get(images[0]) or "unknown")


def repair_gallery(
    slug: str,
    meta: dict,
    root: Optional[Path] = None,
    fetcher: Optional[Callable[[], list]] = None,
    log: Callable[[str], None] = print,
) -> Optional[dict]:
    """Fix a clinic whose photos point at files that no longer exist (what the site shows as "404 Not Found").

    - broken site-relative addresses are dropped (never kept "just in case");
    - when no usable photo is left and a Google place is known, its photos are fetched again through
      build_gallery (quality gates, kept on our server);
    - returns the new image fields to store, or None when nothing needs changing.
    """
    root = root or project_root()
    images = [u for u in (meta.get("images") or []) if isinstance(u, str)]
    usable, broken = split_images(images, root)
    needs_refill = not usable and fetcher is not None
    if not broken and not needs_refill:
        return None

    sources = {u: v for u, v in (meta.get("image_sources") or {}).items() if u in usable}
    if broken:
        log(f"   [!] {len(broken)} photo file(s) are missing and were dropped: {', '.join(broken[:3])}{'…' if len(broken) > 3 else ''}")
    if needs_refill:
        gallery = build_gallery(slug, [], root, existing_google_urls=[], google_fetcher=fetcher, log=log)
        usable = gallery["images"]
        sources = gallery["sources"]
    label, primary = _source_label(sources, usable)
    return {
        "images": usable, "image_sources": sources, "images_source": label, "primary_image_source": primary,
        "removed": broken,
    }


def prune_dead_images(meta: dict, root: Optional[Path] = None) -> list:
    """Keep only photo addresses that can really be served. Updates `meta` in place, returns what was dropped."""
    kept, dropped = split_images(meta.get("images") or [], root)
    meta["images"] = kept
    meta["image_sources"] = {u: v for u, v in (meta.get("image_sources") or {}).items() if u in kept}
    meta["images_source"], meta["primary_image_source"] = _source_label(meta["image_sources"], kept)
    return dropped

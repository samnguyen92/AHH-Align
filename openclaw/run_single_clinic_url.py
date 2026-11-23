"""
Run the OpenClaw clinic pipeline for one known clinic URL.

This intentionally bypasses search_hospital_url(), which is useful when an
operator already knows the official website.
"""

import json
import os
import sys
from datetime import datetime
from typing import Callable, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(_OPENCLAW_DIR, "..", ".env.local"))
load_dotenv(".env")
load_dotenv(".env.local")

from db import insert_clinic
from extractor import extract_clinic_data
from google_places import enrich_clinic_with_google_places
from enrich_web import enrich_missing_with_brave
from clinic_photos import attach_real_photos
from normalize import compute_quality, merge_deterministic_contacts
from scraper import scrape_content_from_url
from source_guard import Verdict, check_source, explain


ProgressCallback = Optional[Callable[[str], None]]


class SourceRejected(Exception):
    """The address or page is a ranking / directory / social page, not one clinic's own website."""

    def __init__(self, verdict: Verdict) -> None:
        super().__init__(verdict.reason)
        self.verdict = verdict


def _log(message: str, progress_callback: ProgressCallback = None) -> None:
    print(message, flush=True)
    if progress_callback:
        progress_callback(message)


def infer_clinic_name_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    host = host.split(":")[0]
    return f"Clinic from {host}" if host else "Clinic from URL"


_STEP_TEXT = {
    "1": ("Đang đọc website...", "Reading the website..."),
    "2": ("Đang trích xuất thông tin phòng khám...", "Extracting the clinic's details..."),
    "3": ("Đang gắn nguồn và ảnh từ website...", "Attaching the source and website photos..."),
    "4": ("Đang bổ sung đánh giá, giờ và ảnh thật...", "Adding reviews, hours and real photos..."),
    "5": ("Đang lưu...", "Saving..."),
}


class _StepForwarder:
    """Only the five step headings reach the chat (once each, in the user's language); the scraper's own log stays in /tail."""

    def __init__(self, callback: ProgressCallback, lang: str) -> None:
        self.callback, self.lang, self.sent = callback, lang, set()

    def __call__(self, message: str) -> None:
        import re

        match = re.match(r"^\[(\d)/5\]", message or "")
        if not self.callback or not match or match.group(1) in self.sent:
            return
        self.sent.add(match.group(1))
        vi, en = _STEP_TEXT.get(match.group(1), ("", ""))
        self.callback(f"({match.group(1)}/5) " + (vi if self.lang == "vi" else en))


def run_single_clinic_url(
    name: str, url: str, progress_callback: ProgressCallback = None, lang: str = "vi", result_sink: Optional[dict] = None,
) -> bool:
    name = (name or "").strip() or infer_clinic_name_from_url(url)
    progress_callback = _StepForwarder(progress_callback, lang) if progress_callback else None
    url = (url or "").strip()
    started_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"

    _log("=========================================", progress_callback)
    _log(" OpenClaw AI Pipeline - Single URL Runner", progress_callback)
    _log("=========================================", progress_callback)
    _log(f"[*] Started at: {started_at}", progress_callback)
    _log(f"[*] Target clinic: {name}", progress_callback)
    _log(f"[*] Source URL: {url}", progress_callback)

    early = check_source(url=url)
    if not early.ok:
        raise SourceRejected(early)  # nothing was fetched

    missing = []
    if not os.environ.get("OPENROUTER_API_KEY"):
        missing.append("OPENROUTER_API_KEY")
    if missing:
        _log(f"[!] Missing environment variables: {', '.join(missing)}", progress_callback)
        return False

    _log("[1/5] Scraping source website...", progress_callback)
    content = scrape_content_from_url(url)
    if content.get("dead_reason"):
        _log(f"[!] Website is not usable: {content['dead_reason']}. Aborting.", progress_callback)
        return False
    text = content.get("markdown_content") or content.get("text") or ""
    page_check = check_source(title=str(content.get("page_title") or ""), text=text)
    if not page_check.ok:
        raise SourceRejected(page_check)  # a list of many clinics: nothing is extracted or saved
    _log(
        "[1/5] Scrape summary: "
        f"{len(text)} chars, "
        f"{len(content.get('json_ld_schemas') or [])} JSON-LD schema(s), "
        f"{len(content.get('images') or [])} image candidate(s), "
        f"{len(content.get('important_links') or [])} important link(s).",
        progress_callback,
    )
    if not text:
        _log("[!] Scraping returned no useful text. Aborting.", progress_callback)
        return False

    _log("[2/5] Extracting structured clinic profile with OpenRouter...", progress_callback)
    data = extract_clinic_data(name, content)
    if not data:
        _log("[!] Extraction failed. Aborting.", progress_callback)
        return False
    merge_deterministic_contacts(data, content)
    _log("[2/5] Extraction summary:", progress_callback)
    _log(json.dumps({
        "name": data.get("name"),
        "specialty": data.get("specialty"),
        "city": data.get("city"),
        "state": data.get("state"),
        "phone": data.get("phone"),
        "languages": data.get("languages"),
        "services_count": len(data.get("services") or []),
    }, ensure_ascii=False, indent=2), progress_callback)

    _log("[3/5] Attaching source metadata and website images...", progress_callback)
    data["source_url"] = url
    website_images = content.get("images") or []
    data.pop("images", None)  # rebuilt below from real, filtered sources only
    for link_key in ["website", "appointment_url"]:
        if not data.get(link_key) and content.get(link_key):
            data[link_key] = content[link_key]
    for scrape_key in ["json_ld_schemas", "important_links", "iframe_sources"]:
        if content.get(scrape_key):
            data[scrape_key] = content[scrape_key]
    _log(f"[3/5] {len(website_images)} website image candidate(s) found.", progress_callback)

    _log("[4/5] Enriching with Google Places and clinic imagery...", progress_callback)
    data = enrich_clinic_with_google_places(data, upload_photos=False)
    data = enrich_missing_with_brave(data)
    attach_real_photos(data, website_images=website_images, log=lambda m: _log(m, progress_callback))
    _log(f"[4/5] Image count after enrichment: {len(data.get('images') or [])}.", progress_callback)

    _log("[5/5] Saving clinic to the database...", progress_callback)
    success = insert_clinic(data)
    if not success:
        _log("[!] Database insert/update failed.", progress_callback)
        return False

    q = compute_quality(data)
    missing_str = f" (missing: {', '.join(q['missing'])})" if q["missing"] else ""
    _log(f"[+] Saved clinic: {data.get('name')} — Quality score: {q['score']}/100{missing_str}", progress_callback)
    saved_info = data.get("_saved") or {}
    if result_sink is not None:
        from scout_report import build_card

        result_sink["card"] = build_card(data, q, saved_info)
    if saved_info.get("created"):
        _log(
            "[📝] Saved as a DRAFT: it is not visible on the website yet. "
            "Review with /drafts, publish with /approve_clinic <slug>.",
            progress_callback,
        )
    _log("[*] Single URL pipeline complete.", progress_callback)
    return True


def main() -> int:
    if len(sys.argv) < 3:
        _log("Usage: python run_single_clinic_url.py '<clinic name>' '<url>'")
        return 2

    return 0 if run_single_clinic_url(sys.argv[1], sys.argv[2]) else 1


if __name__ == "__main__":
    raise SystemExit(main())

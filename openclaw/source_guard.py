"""
source_guard.py — is this page the website of ONE clinic, or a ranking / directory / aggregator?

Production incident: Google Places answered 403, the scout silently fell back to a web search and saved every result
as a "clinic": "About Us", "TOP 10 BEST Doctor Speaking Chinese in Fairfax", a Healthgrades list page, and
"Best Hospitals in Virginia" (a ranking). Content of OTHER sites' listings ended up on clinic pages.

Deterministic rules, no model, cheap and predictable:
  * the address (domain / path) of known directories, ranking sites and social networks;
  * a name or page title that is a ranking or a generic page name ("Top 10 ...", "20 Best ... in ...", "About Us");
  * the text itself: a page full of different phone numbers or doctors is a directory, not one practice.

A real clinic whose name starts with "Best" or "Top" ("Top Acupuncture Clinic") is fine: a ranking needs a number or a
plural noun plus a place.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse

# Hosts (and their subdomains) that list OTHER businesses, rank them, or are social/profile pages.
AGGREGATOR_DOMAINS = (
    "usnews.com", "healthgrades.com", "webmd.com", "zocdoc.com", "vitals.com", "yelp.com", "doximity.com", "ratemds.com",
    "wikipedia.org", "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "tiktok.com", "youtube.com",
    "pinterest.com", "reddit.com", "quora.com", "nextdoor.com", "mapquest.com", "yellowpages.com", "bbb.org", "manta.com",
    "findatopdoc.com", "castleconnolly.com", "newsweek.com", "forbes.com", "healthline.com", "sharecare.com",
    "psychologytoday.com", "goodrx.com", "npidb.org", "npiprofile.com", "birdeye.com", "thumbtack.com", "angi.com",
    "tripadvisor.com", "groupon.com", "opencare.com", "wellness.com", "docinfo.org", "usnews.org",
)

GENERIC_PAGE_NAMES = {
    "about us", "about", "home", "homepage", "contact", "contact us", "welcome", "untitled", "index", "page not found",
    "404", "403 forbidden", "access denied", "just a moment", "attention required", "login", "sign in",
}

_LISTING_PLURALS = r"(?:hospitals|doctors|clinics|dentists|physicians|providers|specialists|pediatricians|therapists|surgeons|centers|practices|urgent cares)"
LISTICLE_NAME_PATTERNS = [re.compile(p, re.IGNORECASE) for p in (
    r"^\s*\d+\s+(?:best|top)\b",                       # "20 Best Primary Care Doctors In Virginia"
    r"\b(?:top|best)\s+\d+\b",                          # "TOP 10 BEST Vietnamese Family Doctor in Fairfax"
    rf"^\s*(?:the\s+)?(?:top|best)\s+(?:rated\s+)?(?:[\w&'/-]+\s+){{0,4}}?{_LISTING_PLURALS}\b.*\b(?:in|near|around|for)\b",  # "Best Hospitals in Virginia"
    r"\bdirectory\b",
    r"\brankings?\b",
    r"^\s*find\s+(?:a|an)\s+(?:doctor|dentist|provider|clinic|physician)\b",
    r"\blist of\b",
    r"\bnear me\b",
)]
PATH_MARKER = re.compile(r"(?:^|/)(?:directory|best-[a-z-]+|top-\d+[a-z-]*|find-a-(?:doctor|dentist|provider)|rankings?)(?:/|$)|-directory(?:/|$)", re.IGNORECASE)

_PHONE = re.compile(r"\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b")
_DOCTOR = re.compile(r"\bDr\.?\s+[A-Z][a-z]+\s+[A-Z][a-z]+")
MAX_PHONES_ONE_PRACTICE = 8
MAX_DOCTORS_ONE_PRACTICE = 15


@dataclass(frozen=True)
class Verdict:
    ok: bool
    kind: str = "ok"      # ok | aggregator | listicle | generic_name | directory_text
    reason: str = ""


OK = Verdict(True)


def _host(url: str) -> str:
    host = (urlparse((url or "").strip()).netloc or "").lower().split("@")[-1].split(":")[0]
    return host[4:] if host.startswith("www.") else host


def check_url(url: str) -> Verdict:
    host = _host(url)
    if not host:
        return OK
    for domain in AGGREGATOR_DOMAINS:
        if host == domain or host.endswith("." + domain):
            return Verdict(False, "aggregator", f"{domain} lists or ranks other businesses; it is not a clinic's own website")
    if PATH_MARKER.search(urlparse(url).path or ""):
        return Verdict(False, "listicle", "the address is a directory or ranking page")
    return OK


def check_name(name: str) -> Verdict:
    clean = " ".join((name or "").split())
    if not clean:
        return OK
    if clean.lower().strip(" .") in GENERIC_PAGE_NAMES:
        return Verdict(False, "generic_name", f"“{clean}” is a page title, not a clinic name")
    if any(p.search(clean) for p in LISTICLE_NAME_PATTERNS):
        return Verdict(False, "listicle", f"“{clean}” reads like a ranking or directory, not one clinic")
    return OK


def check_text(text: str) -> Verdict:
    sample = (text or "")[:80000]
    phones = {re.sub(r"\D", "", p) for p in _PHONE.findall(sample)}
    if len(phones) > MAX_PHONES_ONE_PRACTICE:
        return Verdict(False, "directory_text", f"the page lists {len(phones)} different phone numbers: a directory, not one practice")
    doctors = {m.lower() for m in _DOCTOR.findall(sample)}
    if len(doctors) > MAX_DOCTORS_ONE_PRACTICE:
        return Verdict(False, "directory_text", f"the page names {len(doctors)} different doctors: a directory, not one practice")
    return OK


def check_source(url: str = "", name: str = "", title: str = "", text: str = "") -> Verdict:
    """The first problem found, or OK. Any argument may be left empty."""
    for verdict in (check_url(url), check_name(name), check_name(title), check_text(text)):
        if not verdict.ok:
            return verdict
    return OK


def explain(verdict: Verdict, lang: str = "en") -> str:
    if lang == "vi":
        base = {
            "aggregator": "đây là trang tổng hợp/xếp hạng/mạng xã hội, không phải website riêng của một phòng khám",
            "listicle": "đây là trang xếp hạng hoặc danh bạ, không phải một phòng khám cụ thể",
            "generic_name": "đây là tiêu đề trang chung chung, không phải tên phòng khám",
            "directory_text": "nội dung trang là danh sách nhiều phòng khám/bác sĩ, không phải một phòng khám",
        }.get(verdict.kind, "nguồn không phù hợp")
        return base
    return verdict.reason or "not a single clinic's own website"

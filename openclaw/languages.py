"""Shared language registry + evidence-based verification for the scrapers.

The registry lives in ``src/lib/languages.json`` (also read by the Next.js app), so a new language is a
one-entry change there. This module never guesses: a language is only accepted when the *visible* text
of a source page states it in a language-claim context.

Root cause this fixes (great-care-dental): the old check substring-matched aliases against raw HTML, so
CSS font comments such as ``/* vietnamese */`` verified "Vietnamese", and the generic word "Chinese"
verified both Mandarin and Cantonese.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Iterable, Optional

_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "src" / "lib" / "languages.json",  # repo / mounted /app
    Path(__file__).resolve().parent / "languages.json",
]


def _load() -> list[dict]:
    for path in _CANDIDATES:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))["languages"]
    raise FileNotFoundError("languages.json not found in: " + ", ".join(str(p) for p in _CANDIDATES))


ENTRIES: list[dict] = _load()
_BY_NAME = {e["name"].lower(): e for e in ENTRIES}
_BY_ALIAS: dict[str, dict] = {}
for _e in ENTRIES:
    _BY_ALIAS[_e["name"].lower()] = _e
    for _a in _e["aliases"]:
        _BY_ALIAS[_a.lower()] = _e

# Words after the language name that mean it is NOT a language claim ("Chinese herbal medicine").
_NOT_BEFORE = {
    "Chinese": [
        "medicine", "medicinal", "herb", "herbs", "herbal", "massage", "acupuncture", "tea", "food", "zodiac",
        "new year", "culture", "remed", "cupping", "tui na", "restaurant", "cuisine", "calendar", "astrology",
        "style", "garden", "tradition", "diet", "bodywork", "wellness center",
    ],
    "Korean": ["bbq", "food", "spa", "restaurant", "cuisine", "skin", "beauty", "cosmetic", "style"],
    "Vietnamese": ["restaurant", "food", "pho", "coffee", "cuisine", "market"],
    "Thai": ["massage", "food", "restaurant", "cuisine"],
    "Japanese": ["restaurant", "food", "cuisine", "garden", "style"],
}

# Text around a mention must look like a language claim.
_CONTEXT = re.compile(
    r"speak|spoken|speaking|language|bilingual|multilingual|trilingual|fluent|fluency|interpret|translat|"
    r"available in|care in|service[s]? in|services? are offered|communicat|staff|se habla|we offer|assist|"
    r"patients? (?:in|who)|doctors?|physician|provider|team|receptionist|dentist|clinician|nurse",
    re.IGNORECASE,
)
_LABELLED = re.compile(r"(?:languages?|ngôn ngữ|語言|语言|언어)\s*(?:spoken|offered|available)?\s*[:：\-–]", re.IGNORECASE)


def normalize_language(raw: Optional[str]) -> Optional[str]:
    value = (raw or "").strip().lower()
    if not value:
        return None
    exact = _BY_ALIAS.get(value)
    if exact:
        return exact["name"]
    hits = [e for e in ENTRIES if any(a.lower() in value for a in [e["name"], *e["aliases"]])]
    specific = next((e for e in hits if not e.get("generic")), hits[0] if hits else None)
    return specific["name"] if specific else None


def normalize_language_list(raw: Iterable) -> list[str]:
    out: list[str] = []
    for item in raw or []:
        for piece in re.split(r"[,/;&]|\band\b", str(item or ""), flags=re.IGNORECASE):
            name = normalize_language(piece)
            if name and name not in out:
                out.append(name)
    return out


def language_family(raw: Optional[str]) -> Optional[str]:
    name = normalize_language(raw)
    return _BY_NAME[name.lower()]["family"] if name else None


def visible_text(source: str) -> str:
    """Strip <style>/<script>/<noscript>/comments/CSS blocks and tags so only reader-visible text remains."""
    if not source:
        return ""
    text = re.sub(r"<!--.*?-->", " ", source, flags=re.DOTALL)
    text = re.sub(r"<(script|style|noscript|svg)\b.*?</\1>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.DOTALL)  # stray CSS comments (e.g. "/* vietnamese */")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;|&amp;", " ", text)
    return re.sub(r"\s+", " ", text)


def _alias_regex(alias: str) -> re.Pattern:
    escaped = re.escape(alias)
    if re.search(r"[a-zA-Z]", alias) and alias.isascii():
        return re.compile(rf"(?<![A-Za-z]){escaped}(?![A-Za-z])", re.IGNORECASE)
    return re.compile(escaped, re.IGNORECASE)


def _is_claim(entry: dict, text: str, start: int, end: int) -> bool:
    after = text[end : end + 24].lower().lstrip(" -–,")
    for word in _NOT_BEFORE.get(entry["name"], []) + (_NOT_BEFORE.get(entry["family"], []) if entry.get("generic") else []):
        if after.startswith(word):
            return False
    window = text[max(0, start - 90) : end + 90]
    return bool(_CONTEXT.search(window) or _LABELLED.search(window))


def find_evidence(name: str, source: str) -> Optional[str]:
    """Verbatim snippet (<= 12 words) proving ``name`` is stated in the visible text, else None."""
    entry = _BY_NAME.get((normalize_language(name) or name).lower())
    if not entry:
        return None
    text = visible_text(source)
    for alias in [entry["name"], *entry["aliases"]]:
        for match in _alias_regex(alias).finditer(text):
            if _is_claim(entry, text, match.start(), match.end()):
                words = text[max(0, match.start() - 50) : match.end() + 50].split()
                return " ".join(words[:12])
    return None


def detect_languages(source: str) -> dict[str, str]:
    """{canonical language: evidence} for every non-English language the page states."""
    found: dict[str, str] = {}
    for entry in ENTRIES:
        if entry["name"] == "English":
            continue
        quote = find_evidence(entry["name"], source)
        if quote:
            found[entry["name"]] = quote
    # A specific variant (Mandarin/Cantonese) already implies the umbrella: keep only evidence-backed names.
    return found


def verify_languages(candidates: Iterable, source: str) -> tuple[list[str], dict[str, str], list[str]]:
    """Return (kept, evidence, dropped). English is kept only if the page states it."""
    kept: list[str] = []
    evidence: dict[str, str] = {}
    dropped: list[str] = []
    for name in normalize_language_list(candidates):
        quote = find_evidence(name, source)
        if quote:
            kept.append(name)
            evidence[name] = quote
        else:
            dropped.append(name)
    return kept, evidence, dropped

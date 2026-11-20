"""
grounded_content.py — clinic text that is only ever built from what the clinic's own website says.

The old rescan prompt ORDERED the model to write, for every clinic, that bilingual staff help with scheduling, forms
and billing and that older adults need no family member to interpret, to invent 3-4 "safe" FAQs, 2-3 "differentiators"
and 4-8 services. None of that was checked against the website. This module replaces it:

  1. FACTS    one model call extracts facts, EACH with a verbatim quote from the source. The code then checks the quote
              really is in the source text; a fact whose quote is not found is dropped. Prices, insurance names, team
              names and languages are checked again on their own.
  2. PROSE    the About/short description is written from the verified facts only, then linted: generic marketing
              sentences, unverified languages, dollar amounts and "Dr. X" names that are not in the source are removed.
              If too little is left, a plain deterministic description is used.
  3. LANGUAGE the "Language support" box is built from the language evidence itself (no model). No evidence, no box.
  4. TRANSLATE faithful translation to Vietnamese/Korean/Chinese, verified (same structure, numbers preserved).

An empty section is correct: the site hides sections that have no content.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

LLM = Callable[[str, str, int], dict]  # (system, prompt, max_tokens) -> parsed JSON

TARGET_LANGUAGES = {"vi": "Vietnamese", "ko": "Korean", "zh": "Simplified Chinese"}
MIN_QUOTE_CHARS = 12

# Sentences that claim a service nobody verified. They were produced for EVERY clinic by the old prompt.
BOILERPLATE_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in (
        r"without (?:needing|relying on) a family member",
        r"older adults (?:and|or) immigrant families",
        r"(?:bilingual|multilingual)(?: team| staff)?(?: members?)? (?:can|may|will) help (?:with )?(?:you )?(?:with )?(?:scheduling|booking|appointments?|intake|forms|insurance|billing)",
        r"help(?:s|ing)? (?:patients )?(?:with )?scheduling,? intake forms",
        r"may be able to communicate directly with the clinic",
        r"(?:visit|communicate|receive care|feel) comfortabl[ey]",
        r"explaining insurance(?: or| and)? billing",
    )
]


# --------------------------------------------------------------------------- text helpers

_ABBREVIATION_END = re.compile(r"(?:^|\s)(?:Dr|Mr|Mrs|Ms|Prof|St|Jr|Sr|vs|No|e\.g|i\.e)\.$", re.IGNORECASE)


def split_sentences(paragraph: str) -> List[str]:
    """Sentences, without cutting after "Dr." / "St." (that would split "Dr. Kim treats patients" in two)."""
    pieces = [p for p in re.split(r"(?<=[.!?])\s+", paragraph.strip()) if p]
    sentences: List[str] = []
    for piece in pieces:
        if sentences and _ABBREVIATION_END.search(sentences[-1]):
            sentences[-1] += " " + piece
        else:
            sentences.append(piece)
    return sentences


def has_boilerplate(text: Optional[str]) -> bool:
    return bool(text) and any(p.search(text) for p in BOILERPLATE_PATTERNS)


def drop_sentences(text: Optional[str], should_drop: Callable[[str], bool]) -> str:
    """Remove the sentences for which should_drop is true; paragraphs stay."""
    if not text:
        return ""
    paragraphs = []
    for paragraph in re.split(r"\n\s*\n", text.strip()):
        kept = [s for s in split_sentences(paragraph) if not should_drop(s)]
        if kept:
            paragraphs.append(" ".join(kept))
    return "\n\n".join(paragraphs)


def strip_boilerplate(text: Optional[str]) -> str:
    return drop_sentences(text, lambda s: any(p.search(s) for p in BOILERPLATE_PATTERNS))


def normalize_for_match(value: str) -> str:
    value = (value or "").lower().replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("–", "-").replace("—", "-")
    return re.sub(r"[^a-z0-9À-ỹ぀-ヿ㐀-鿿가-힯]+", " ", value).strip()


def quote_in_source(quote: str, source_norm: str) -> bool:
    """Is every part of the quote (split at "…") a verbatim piece of the source? Short quotes prove nothing."""
    parts = [normalize_for_match(p) for p in re.split(r"\s*(?:\.\.\.|…)\s*", quote or "")]
    parts = [p for p in parts if p]
    return bool(parts) and all(len(p) >= MIN_QUOTE_CHARS and p in source_norm for p in parts)


def _numbers(text: str) -> set:
    return set(re.findall(r"\d+", text or ""))


# --------------------------------------------------------------------------- 1. facts with verified quotes

FACTS_SYSTEM = (
    "You extract FACTS from a clinic's own website for a healthcare directory. A fact is only valid with a VERBATIM quote "
    "copied from the source text (at most 200 characters). If the source does not say it, leave it out: never infer, never "
    "generalise, never write what a clinic of this kind 'usually' offers. Empty lists are the right answer when nothing is stated."
)

FACTS_SCHEMA = """Return ONLY JSON:
{
 "services": [{"name": "", "category": "", "description": "", "quote": ""}],
 "conditions": [{"name": "", "quote": ""}],
 "what_to_know": [{"title": "", "detail": "", "quote": ""}],
 "differentiators": [{"title": "", "detail": "", "quote": ""}],
 "before_you_book": [{"title": "", "detail": "", "quote": ""}],
 "faqs": [{"question": "", "answer": "", "quote": ""}],
 "pricing": [{"name": "", "price": "$", "notes": "", "quote": ""}],
 "insurance_networks": [{"name": "", "quote": ""}],
 "team_members": [{"name": "", "role": "", "credentials": "", "languages_spoken": [], "quote": ""}],
 "location_notes": {"parking": {"text": "", "quote": ""}, "transit": {"text": "", "quote": ""}},
 "interpreter": {"stated": false, "quote": ""},
 "about_points": [{"text": "", "quote": ""}]
}
- what_to_know / differentiators / before_you_book: only things the website itself states (e.g. "walk-ins welcome", "same-day appointments", a stated specialty focus, how to book, what to bring).
- faqs: only questions and answers that appear on the website.
- pricing: only explicit dollar amounts shown on the website.
- interpreter.stated is true only if the website says interpreter/translation services are offered.
- about_points: short factual statements about the practice (history, approach, credentials) the website makes."""


def build_source(pages: List[dict], reviews: Optional[List[dict]] = None, limit_per_page: int = 6000) -> Tuple[str, str]:
    """(text shown to the model, text used to verify quotes). Verification sees ALL the text, the model a bounded part."""
    shown, everything = [], []
    for page in pages or []:
        content = page.get("full_text") or page.get("content") or ""
        everything.append(content)
        shown.append(f"=== PAGE: {page.get('url')} ===\n{content[:limit_per_page]}")
    for review in (reviews or [])[:8]:
        if review.get("text"):
            everything.append(str(review["text"]))
    return "\n\n".join(shown)[:26000], "\n".join(everything)


def extract_facts(clinic: dict, shown_text: str, llm: LLM) -> dict:
    prompt = (
        f"Clinic: {clinic.get('name')} ({clinic.get('specialty') or 'healthcare'}), {clinic.get('city') or ''} {clinic.get('state') or ''}\n\n"
        f"SOURCE (the clinic's website):\n{shown_text}\n\n{FACTS_SCHEMA}"
    )
    return llm(FACTS_SYSTEM, prompt, 4000) or {}


def _items(facts: dict, key: str) -> List[dict]:
    value = facts.get(key)
    return [i for i in value if isinstance(i, dict)] if isinstance(value, list) else []


def verify_facts(facts: dict, source_text: str, evidence_languages: List[str]) -> Tuple[dict, Dict[str, int]]:
    """Keep only facts whose quote is really in the source. Returns (verified, number dropped per kind)."""
    source_norm = normalize_for_match(source_text)
    dropped: Dict[str, int] = {}
    out: Dict[str, Any] = {}

    def keep(kind: str, items: List[dict], extra: Optional[Callable[[dict], bool]] = None) -> List[dict]:
        good = [i for i in items if quote_in_source(str(i.get("quote") or ""), source_norm) and (extra is None or extra(i))]
        if len(good) != len(items):
            dropped[kind] = len(items) - len(good)
        return good

    for kind in ("services", "conditions", "what_to_know", "differentiators", "before_you_book", "faqs", "about_points"):
        out[kind] = keep(kind, _items(facts, kind))
    # a price must be a number that the quote itself shows
    out["pricing"] = keep("pricing", _items(facts, "pricing"), lambda i: bool(_numbers(str(i.get("price")))) and _numbers(str(i.get("price"))) <= _numbers(str(i.get("quote"))))
    out["insurance_networks"] = keep("insurance_networks", _items(facts, "insurance_networks"), lambda i: normalize_for_match(str(i.get("name"))) in source_norm)

    def name_in_source(member: dict) -> bool:
        tokens = [t for t in re.split(r"[\s,.]+", str(member.get("name") or "")) if len(t) > 2]
        return bool(tokens) and any(normalize_for_match(t) in source_norm.split() for t in tokens[-2:])

    team = keep("team_members", _items(facts, "team_members"), name_in_source)
    allowed = {l.lower() for l in evidence_languages}
    for member in team:  # a provider's languages count only when the site's language evidence has them too
        member["languages_spoken"] = [l for l in (member.get("languages_spoken") or []) if str(l).lower() in allowed]
    out["team_members"] = team

    interpreter = facts.get("interpreter") if isinstance(facts.get("interpreter"), dict) else {}
    out["interpreter"] = bool(interpreter.get("stated")) and quote_in_source(str(interpreter.get("quote") or ""), source_norm)
    out["interpreter_quote"] = str(interpreter.get("quote") or "") if out["interpreter"] else ""

    notes = facts.get("location_notes") if isinstance(facts.get("location_notes"), dict) else {}
    location: Dict[str, str] = {}
    for key in ("parking", "transit"):
        item = notes.get(key) if isinstance(notes.get(key), dict) else {}
        if item.get("text") and quote_in_source(str(item.get("quote") or ""), source_norm):
            location[key] = str(item["text"])
    out["location_notes"] = location
    return out, dropped


# --------------------------------------------------------------------------- 3. the language box, from evidence only

def _join(names: List[str]) -> str:
    return names[0] if len(names) == 1 else (", ".join(names[:-1]) + " and " + names[-1] if names else "")


def language_note_from_evidence(verified_languages: List[str], evidence: Dict[str, str], team_members: Optional[List[dict]] = None, interpreter_quote: str = "") -> str:
    """No non-English evidence means no box (empty string). Otherwise only what the website itself says."""
    non_english = [l for l in verified_languages if l.lower() != "english"]
    if not non_english:
        return ""
    sentences = [f"The clinic’s verified spoken languages are {_join(verified_languages)}."]
    quote = next((str(evidence[l]) for l in non_english if evidence.get(l)), "")
    if quote:
        sentences.append(f"Its website says: “{quote.strip()[:160]}”.")
    speakers = [m for m in (team_members or []) if m.get("name") and m.get("languages_spoken")]
    if speakers:
        sentences.append("Listed on the website: " + "; ".join(f"{m['name']} ({', '.join(m['languages_spoken'])})" for m in speakers[:4]) + ".")
    if interpreter_quote:
        sentences.append("The clinic states that interpreter services are available.")
    return " ".join(sentences)


# --------------------------------------------------------------------------- 2. prose from verified facts

PROSE_SYSTEM = (
    "You write short, factual profile text for a healthcare directory from VERIFIED FACTS only. Every claim must come from the "
    "facts given. Do not add marketing, do not describe what such clinics usually offer, do not mention scheduling help, "
    "intake forms, billing help, older adults, immigrant families or family interpreters unless a fact says so. Plain, concrete "
    "wording. If the facts are thin, write less."
)


def _facts_for_prose(facts: dict) -> str:
    lines = []
    for key, label in (("about_points", "About"), ("services", "Services"), ("conditions", "Conditions"), ("differentiators", "Stated strengths"), ("before_you_book", "Before you book")):
        for item in facts.get(key, []):
            lines.append(f"- {label}: " + " ".join(str(item.get(k) or "") for k in ("name", "text", "title", "detail", "description")).strip())
    for member in facts.get("team_members", []):
        lines.append(f"- Team: {member.get('name')}, {member.get('role') or ''} {member.get('credentials') or ''}".strip())
    if facts.get("insurance_networks"):
        lines.append("- Insurance named on the website: " + ", ".join(str(i.get("name")) for i in facts["insurance_networks"][:12]))
    return "\n".join(lines)


def _allowed_language_names(allowed_languages: List[str]) -> set:
    """Names that may appear in text: the verified languages and their family (Chinese covers Mandarin, Cantonese...)."""
    from languages import ENTRIES, language_family, normalize_language_list

    names = set(normalize_language_list(allowed_languages))
    families = names | {language_family(n) for n in names if language_family(n)}
    return {e["name"].lower() for e in ENTRIES if e["name"] in names or language_family(e["name"]) in families} | {n.lower() for n in names} | {"english"}


def lint_prose(text: str, source_text: str, allowed_languages: List[str]) -> str:
    """Remove every sentence that claims something the source does not support."""
    from languages import ENTRIES

    source_norm = normalize_for_match(source_text)
    source_numbers = {n.replace(",", "") for n in re.findall(r"\d[\d,]*", source_text)}
    allowed = _allowed_language_names(allowed_languages)
    known = [e["name"] for e in ENTRIES]

    def unsupported(sentence: str) -> bool:
        if any(p.search(sentence) for p in BOILERPLATE_PATTERNS):
            return True
        lowered = sentence.lower()
        if any(re.search(rf"\b{re.escape(name.lower())}\b", lowered) and name.lower() not in allowed for name in known):
            return True  # a language nobody verified (the old code swapped it for another language: also a lie)
        if any(n.replace(",", "") not in source_numbers for n in re.findall(r"\$\s?(\d[\d,]*)", sentence)):
            return True  # a dollar amount the source never shows
        for name in re.findall(r"\bDr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)", sentence):
            if not all(normalize_for_match(part) in source_norm.split() for part in name.split()):
                return True  # a doctor the source never names
        return False

    return drop_sentences(text, unsupported)


def deterministic_description(clinic: dict, facts: dict) -> str:
    place = ", ".join(p for p in (clinic.get("city"), clinic.get("state")) if p)
    first = f"{clinic.get('name')} is a {(clinic.get('specialty') or 'healthcare').lower()} practice" + (f" in {place}." if place else ".")
    services = [str(s.get("name")) for s in facts.get("services", []) if s.get("name")][:6]
    second = f" Services listed on its website include {_join(services)}." if services else ""
    return first + second


def compose_prose(clinic: dict, facts: dict, source_text: str, allowed_languages: List[str], llm: LLM) -> Dict[str, str]:
    prompt = (
        f"Clinic: {clinic.get('name')} ({clinic.get('specialty') or 'healthcare'}), {clinic.get('city') or ''} {clinic.get('state') or ''}\n"
        f"VERIFIED FACTS:\n{_facts_for_prose(facts) or '(none)'}\n\n"
        'Return ONLY JSON: {"short_description": "1-2 sentences", "description": "1-2 short paragraphs", "about_highlight": "1-2 short paragraphs"}'
    )
    try:
        written = llm(PROSE_SYSTEM, prompt, 1500) or {}
    except Exception:
        written = {}
    out = {}
    for key in ("short_description", "description", "about_highlight"):
        text = lint_prose(str(written.get(key) or ""), source_text, allowed_languages)
        out[key] = text if len(text) >= 60 or key == "short_description" and len(text) >= 30 else ""
    fallback = deterministic_description(clinic, facts)
    out["description"] = out["description"] or fallback
    out["about_highlight"] = out["about_highlight"] or out["description"]
    out["short_description"] = out["short_description"] or split_sentences(fallback)[0]
    return out


# --------------------------------------------------------------------------- 4. faithful translation

TRANSLATABLE_TEXT = ("short_description", "description", "about_highlight", "language_note", "review_summary")
TRANSLATABLE_LISTS = {
    "what_to_know": ("title", "detail"), "differentiators": ("title", "detail"), "before_you_book": ("title", "detail"),
    "services_offered": ("name", "description"), "faqs": ("question", "answer"),
}
CONTENT_FIELDS = set(TRANSLATABLE_TEXT) | set(TRANSLATABLE_LISTS)

TRANSLATE_SYSTEM = (
    "You are a medical translator. Translate faithfully into the requested language. Do NOT add, remove, soften or embellish any "
    "information. Keep names, phone numbers, prices and numbers exactly. Keep the JSON structure and key names identical."
)


def translation_payload(english: dict, only: Optional[set] = None) -> dict:
    payload: Dict[str, Any] = {}
    for key in TRANSLATABLE_TEXT:
        if (only is None or key in only) and english.get(key):
            payload[key] = english[key]
    for key, fields in TRANSLATABLE_LISTS.items():
        items = english.get(key)
        if (only is None or key in only) and isinstance(items, list) and items:
            payload[key] = [{f: i.get(f) or "" for f in fields} for i in items if isinstance(i, dict)]
    return payload


def verify_translation(payload: dict, result: Any) -> bool:
    if not isinstance(result, dict):
        return False
    for key, value in payload.items():
        got = result.get(key)
        if isinstance(value, str):
            if not isinstance(got, str) or not got.strip() or not _numbers(value) <= _numbers(got):
                return False
        else:
            if not isinstance(got, list) or len(got) != len(value):
                return False
            for source_item, got_item in zip(value, got):
                if not isinstance(got_item, dict) or set(got_item) != set(source_item):
                    return False
                if not _numbers(json.dumps(source_item, ensure_ascii=False)) <= _numbers(json.dumps(got_item, ensure_ascii=False)):
                    return False
    return True


def translate(payload: dict, code: str, llm: LLM) -> Optional[dict]:
    """One language. Returns None when the answer is not a faithful, complete translation (after one retry)."""
    if not payload:
        return {}
    prompt = f"Translate into {TARGET_LANGUAGES[code]}.\nReturn ONLY JSON with exactly these keys:\n{json.dumps(payload, ensure_ascii=False)}"
    for _attempt in range(2):
        try:
            result = llm(TRANSLATE_SYSTEM, prompt, 3500)
        except Exception:
            continue
        if verify_translation(payload, result):
            return {k: result[k] for k in payload}
    return None


def refresh_translations(english: dict, existing_i18n: Optional[dict], only: Optional[set], llm: LLM, codes=tuple(TARGET_LANGUAGES)) -> Tuple[dict, Dict[str, str]]:
    """New i18n dict plus {code: "ok"|"failed"|"nothing"}. Fields that became empty are removed from every language."""
    i18n = {code: dict(values) for code, values in (existing_i18n or {}).items() if isinstance(values, dict)}
    payload = translation_payload(english, only)
    status: Dict[str, str] = {}
    cleared = [k for k in (only if only is not None else CONTENT_FIELDS) if not english.get(k) and k in CONTENT_FIELDS]
    for code in codes:
        target = i18n.setdefault(code, {})
        for key in cleared:
            target.pop(key, None)
        if not payload:
            status[code] = "nothing"
            continue
        done = translate(payload, code, llm)
        if done is None:
            status[code] = "failed"
            continue
        target.update(done)
        status[code] = "ok"
    return i18n, status


# --------------------------------------------------------------------------- the model

def _default_llm(system: str, prompt: str, max_tokens: int = 3500) -> dict:
    from openai import OpenAI

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set")
    primary = os.environ.get("OPENCLAW_TEXT_MODEL", "openai/gpt-6-luna")
    backup = os.environ.get("OPENCLAW_TEXT_FALLBACK_MODEL", "deepseek/deepseek-v4-flash")
    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=90)
    last: Optional[Exception] = None
    for model in dict.fromkeys([primary, backup]):
        try:
            response = client.chat.completions.create(
                model=model, temperature=0.1, max_tokens=max_tokens,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            )
            choice = response.choices[0]
            if getattr(choice, "finish_reason", None) == "length":
                raise ValueError("answer cut off")
            text = (choice.message.content or "").strip()
            first, end = text.find("{"), text.rfind("}")
            return json.loads(text[first:end + 1])
        except Exception as exc:
            last = exc
    raise RuntimeError(f"no model produced valid JSON: {last!r}")


def available() -> bool:
    return bool(os.environ.get("OPENROUTER_API_KEY"))


# --------------------------------------------------------------------------- everything together (used by rescan)

def build_grounded_profile(
    clinic: dict,
    verified_languages: List[str],
    language_evidence: Dict[str, str],
    pages: List[dict],
    llm: Optional[LLM] = None,
    translate_too: bool = True,
) -> Optional[dict]:
    """The profile fields rescan stores, built from the website only. None when there is no usable source text."""
    llm = llm or _default_llm
    meta = clinic.get("metadata") or {}
    shown, source = build_source(pages, meta.get("reviews"))
    if len(source.strip()) < 300:
        return None  # nothing to ground on: the caller keeps whatever the clinic already has

    raw = extract_facts(clinic, shown, llm)
    facts, dropped = verify_facts(raw, source, [l for l in verified_languages] + list(language_evidence))
    prose = compose_prose(clinic, facts, source, verified_languages, llm)
    language_note = language_note_from_evidence(verified_languages, language_evidence, facts["team_members"], facts["interpreter_quote"])

    services = [{"name": s.get("name"), "category": s.get("category") or "", "description": s.get("description") or "", "is_featured": False}
                for s in facts["services"] if s.get("name")]
    profile = {
        **prose,
        "language_note": language_note,
        "cultural_context": "",
        "what_to_know": [{"title": i.get("title") or "", "detail": i.get("detail") or ""} for i in facts["what_to_know"]],
        "differentiators": [{"title": i.get("title") or "", "detail": i.get("detail") or ""} for i in facts["differentiators"]],
        "before_you_book": [{"title": i.get("title") or "", "detail": i.get("detail") or ""} for i in facts["before_you_book"]],
        "services_offered": services,
        "conditions_treated": [str(c.get("name")) for c in facts["conditions"] if c.get("name")],
        "pricing": [{"name": p.get("name"), "price": p.get("price"), "notes": p.get("notes") or "", "category": ""} for p in facts["pricing"]],
        "pricing_summary": None,
        "insurance": {"accepted_networks": [str(i.get("name")) for i in facts["insurance_networks"]], "notes": ""},
        "team_members": [{"name": m.get("name"), "role": m.get("role") or "", "credentials": m.get("credentials") or "",
                          "languages_spoken": m.get("languages_spoken") or [], "bio": ""} for m in facts["team_members"]],
        "location_notes": {"parking": facts["location_notes"].get("parking"), "transit": facts["location_notes"].get("transit")},
        "faqs": [{"question": f.get("question") or "", "answer": f.get("answer") or ""} for f in facts["faqs"]],
        "_grounded": True,
        "_grounding": {"dropped_unsupported": dropped},
    }
    if translate_too:
        english = {**profile, "review_summary": meta.get("review_summary")}
        i18n, status = refresh_translations(english, meta.get("i18n"), None, llm)
        profile["i18n"] = i18n
        profile["_grounding"]["translation"] = status
    return profile

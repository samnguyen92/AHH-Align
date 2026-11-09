"""
normalize.py - shared deterministic cleaning / validation helpers for the clinic pipeline.

Everything here is pure (no network, no LLM) so it is cheap to unit test and safe to
run both at ingestion time (db.insert_clinic) and in one-off backfill scripts.
"""

import re
from typing import Any, Dict, Iterable, List, Optional

US_STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA",
    "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
    "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH",
    "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
    "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", "tennessee": "TN",
    "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC",
}
STATE_CODES = set(US_STATES.values())

EMPTY_STRINGS = {"", "null", "none", "n/a", "na", "unknown", "undefined", "nan", "-"}


def clean_value(value: Any) -> Optional[Any]:
    """Return None for empty-ish values (including the literal strings 'null'/'None')."""
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return None if stripped.lower() in EMPTY_STRINGS else stripped
    return value


def normalize_state(value: Any) -> Optional[str]:
    value = clean_value(value)
    if not value or not isinstance(value, str):
        return None
    upper = value.strip().upper().rstrip(".")
    if upper in STATE_CODES:
        return upper
    return US_STATES.get(value.strip().lower())


# "<street...>, <City>, ST 12345[-6789][, USA]"  (also tolerates missing zip and a trailing country)
_ADDRESS_RE = re.compile(
    r",\s*(?P<city>[^,]+?)\s*,\s*(?P<state>[A-Za-z]{2}|[A-Za-z][A-Za-z ]{3,})\.?"
    r"(?:\s+(?P<zip>\d{5})(?:-\d{4})?)?\s*(?:,\s*(?:USA|US|United States(?: of America)?))?\s*$",
    re.IGNORECASE,
)


def parse_us_address(address: Any) -> Dict[str, str]:
    """Extract city / state / zip_code from a US address string. Returns only fields found."""
    address = clean_value(address)
    if not address or not isinstance(address, str):
        return {}
    text = re.sub(r"\s+", " ", address.replace("\n", ", ")).strip().strip(",")
    match = _ADDRESS_RE.search(text)
    if not match:
        return {}
    state = normalize_state(match.group("state"))
    if not state:
        return {}
    result = {"city": match.group("city").strip(), "state": state}
    if match.group("zip"):
        result["zip_code"] = match.group("zip")
    return result


def fill_location_fields(data: dict) -> dict:
    """Fill city/state/zip from address (or location.address / metadata.google_formatted_address) when missing; scrub 'null' strings."""
    for field in ("city", "state", "zip_code", "address", "phone", "specialty"):
        data[field] = clean_value(data.get(field))

    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    location = data.get("location") if isinstance(data.get("location"), dict) else (
        metadata.get("location") if isinstance(metadata.get("location"), dict) else {}
    )
    if not data.get("address"):
        fallback_addr = clean_value(location.get("address")) or clean_value(metadata.get("google_formatted_address")) or clean_value(data.get("google_formatted_address"))
        if fallback_addr:
            data["address"] = fallback_addr

    for field in ("city", "state", "zip_code"):
        if not data.get(field) and clean_value(location.get(field)):
            data[field] = clean_value(location.get(field))

    parsed = (
        parse_us_address(data.get("address"))
        or parse_us_address(location.get("address"))
        or parse_us_address(metadata.get("google_formatted_address"))
    )
    for field, value in parsed.items():
        if not data.get(field):
            data[field] = value

    data["state"] = normalize_state(data.get("state")) or data.get("state")
    if data.get("zip_code"):
        zip_match = re.search(r"\d{5}", str(data["zip_code"]))
        data["zip_code"] = zip_match.group(0) if zip_match else None
    return data


# ── Specialty taxonomy ───────────────────────────────────────────────────────

# Ordered: first matching rule wins. Patterns are matched against the lower-cased raw value.
_SPECIALTY_RULES = [
    (r"acupunct|traditional chinese|chinese medicine|oriental|korean medicine|한의|tcm|herbal", "Acupuncture & TCM"),
    (r"dent|牙|orthodont|periodon|endodont", "Dental"),
    (r"orthop", "Orthopedics"),
    (r"cardio", "Cardiology"),
    (r"ob/?gyn|obstet|gynec|women'?s health", "OB/GYN"),
    (r"ophthalm|optom|eye", "Ophthalmology"),
    (r"pediatr", "Pediatrics"),
    (r"psych|mental|behavioral|counsel", "Mental Health"),
    (r"dermat|skin", "Dermatology"),
    (r"neuro", "Neurology"),
    (r"community health|fqhc|federally qualified|community clinic|family health center|service center", "Community Health Center"),
    (r"hospital|medical center|trauma|emergency|acute care|health system", "Hospital"),
    (r"urgent care", "Urgent Care"),
    (r"internal medicine", "Internal Medicine"),
    (r"family (medic|practice)|family medical", "Family Medicine"),
    (r"primary care|general medical|general practice|physician|direct primary|medical clinic|\bdoctor\b|\bmd\b", "Primary Care"),
]


def normalize_specialty(value: Any, fallback_text: Any = None) -> Optional[str]:
    for candidate in (value, fallback_text):
        cleaned = clean_value(candidate)
        if not cleaned or not isinstance(cleaned, str):
            continue
        lowered = cleaned.lower()
        for pattern, label in _SPECIALTY_RULES:
            if re.search(pattern, lowered):
                return label
    cleaned = clean_value(value)
    if cleaned and isinstance(cleaned, str):
        return cleaned.strip()[:60]
    return None


# ── Phone / email ────────────────────────────────────────────────────────────

_PHONE_RE = re.compile(r"(?<!\d)(?:\+?1[\s.\-]?)?\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-]?(\d{4})(?!\d)")


def normalize_phone(value: Any) -> Optional[str]:
    value = clean_value(value)
    if not value:
        return None
    match = _PHONE_RE.search(str(value))
    if not match:
        return None
    return f"({match.group(1)}) {match.group(2)}-{match.group(3)}"


def find_phones(text: str, limit: int = 5) -> List[str]:
    found: List[str] = []
    for match in _PHONE_RE.finditer(text or ""):
        phone = f"({match.group(1)}) {match.group(2)}-{match.group(3)}"
        if phone not in found:
            found.append(phone)
        if len(found) >= limit:
            break
    return found


# ── Dead / parked domain detection ───────────────────────────────────────────

PARKED_MARKERS = (
    "is parked free", "parked free, courtesy", "this domain is for sale", "domain is for sale",
    "buy this domain", "get this domain", "domain may be for sale", "this domain has expired",
    "sedo domain parking", "parkingcrew", "bodis.com", "hugedomains", "account suspended",
    "this site can't be reached", "default web site page", "under construction", "coming soon",
)
MEDICAL_HINTS = (
    "clinic", "patient", "doctor", "dr.", "dental", "dentist", "medical", "health", "care",
    "appointment", "physician", "hospital", "treatment", "acupuncture",
)


def detect_dead_page(text: str) -> Optional[str]:
    """Return a human readable reason when scraped text is a parked/dead/placeholder page."""
    body = (text or "").strip()
    lowered = body.lower()
    for marker in PARKED_MARKERS[:9]:
        if marker in lowered:
            return f"parked/for-sale domain ('{marker}')"
    words = len(re.findall(r"\w+", body))
    hint_hits = sum(1 for hint in MEDICAL_HINTS if hint in lowered)
    if words < 60 and hint_hits == 0:
        return f"almost no content ({words} words, no medical keywords)"
    return None


# ── Quality score ────────────────────────────────────────────────────────────

def _has(value: Any) -> bool:
    return clean_value(value) not in (None, [], {}, "")


def compute_quality(data: dict) -> Dict[str, Any]:
    """Score a clinic 0-100 and list missing fields. Used for Telegram reports; never blocks publishing."""
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}

    def pick(key: str) -> Any:
        return data.get(key) if _has(data.get(key)) else metadata.get(key)

    languages = pick("languages") or []
    explicit_languages = [lang for lang in languages if str(lang).lower() != "english"]

    checks = [
        ("name", 10, _has(data.get("name"))),
        ("specialty", 10, _has(data.get("specialty"))),
        ("address", 10, _has(data.get("address"))),
        ("city/state", 10, _has(data.get("city")) and _has(data.get("state"))),
        ("zip_code", 5, _has(data.get("zip_code"))),
        ("phone", 10, _has(data.get("phone"))),
        ("website", 5, _has(pick("website"))),
        ("services", 10, _has(pick("services"))),
        ("working_hours", 5, _has(pick("working_hours"))),
        ("images", 10, _has(pick("images"))),
        ("languages (non-default)", 5, bool(explicit_languages)),
        ("insurance", 5, _has(pick("insurance_accepted"))),
        ("team_members", 3, _has(pick("team_members"))),
        ("appointment_url", 2, _has(pick("appointment_url"))),
    ]
    score = sum(weight for _name, weight, ok in checks if ok)
    return {"score": score, "missing": [name for name, _w, ok in checks if not ok]}


def merge_deterministic_contacts(data: dict, scraped: dict) -> dict:
    """Let verified tel:/mailto:/text-derived contacts win over (or fill gaps in) LLM output."""
    verified_phones = [p for p in (scraped.get("phones") or []) if p]
    if verified_phones:
        llm_phone = normalize_phone(data.get("phone"))
        data["phone"] = llm_phone if llm_phone in verified_phones else verified_phones[0]
    elif data.get("phone"):
        data["phone"] = normalize_phone(data["phone"]) or clean_value(data["phone"])

    emails = [e for e in (scraped.get("emails") or []) if e]
    if emails and not clean_value(data.get("email")):
        data["email"] = emails[0]
    return data


def dedupe_keep_order(items: Iterable[Any]) -> List[Any]:
    seen, out = set(), []
    for item in items:
        key = repr(item)
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


# ── Insurance Buckets, Price Tiers, Access Flags & Search Keywords (Tracks B/C/D) ──

_INSURANCE_CANONICAL_RULES = [
    (r"blue\s*cross|blue\s*shield|\bbcbs\b|\banthem\b", "Blue Cross Blue Shield"),
    (r"united\s*health|\buhc\b", "UnitedHealthcare"),
    (r"delta\s*dental|\bdelta\b", "Delta Dental"),
    (r"\baetna\b", "Aetna"),
    (r"\bcigna\b", "Cigna"),
    (r"\bhumana\b", "Humana"),
    (r"\bkaiser\b", "Kaiser Permanente"),
    (r"\bmetlife\b", "MetLife"),
    (r"\bguardian\b", "Guardian"),
    (r"\bprincipal\b", "Principal"),
    (r"united\s*concordia", "United Concordia"),
    (r"\bmedicare\b", "Medicare"),
    (r"\bmedicaid\b|medi-cal|\bchip\b", "Medicaid"),
    (r"\btricare\b", "TRICARE"),
    (r"\bameritas\b", "Ameritas"),
    (r"\bhealth\s*net\b", "Health Net"),
    (r"\bmolina\b", "Molina Healthcare"),
    (r"\bcentene\b|\bambetter\b", "Ambetter"),
    (r"\bvsp\b", "VSP Vision"),
    (r"\beyemed\b", "EyeMed"),
]

_SPECIALTY_MULTILINGUAL_KEYWORDS: Dict[str, List[str]] = {
    "Dental": [
        "dentist", "dental", "nha khoa", "nha sĩ", "trồng răng", "implant", "root canal",
        "crowns", "veneers", "braces", "invisalign", "toothache", "치과", "치과의사", "임플란트", "牙医", "牙科", "种植牙",
    ],
    "Primary Care": [
        "primary care", "family doctor", "general practitioner", "annual physical", "checkup",
        "bác sĩ gia đình", "khám tổng quát", "nội khoa", "내과", "가정의학과", "家庭医生", "全科医生", "内科",
    ],
    "Family Medicine": [
        "family medicine", "family practice", "primary care", "bác sĩ gia đình", "가정의학과", "家庭医学",
    ],
    "Internal Medicine": [
        "internal medicine", "internist", "primary care", "nội khoa", "bác sĩ nội", "내과", "内科",
    ],
    "Acupuncture & TCM": [
        "acupuncture", "chinese medicine", "tcm", "herbal medicine", "cupping", "pain relief",
        "châm cứu", "đông y", "y học cổ truyền", "한의원", "침술", "한약", "中医", "针灸", "中药",
    ],
    "Acupuncture and Chinese Medicine": [
        "acupuncture", "chinese medicine", "tcm", "herbal medicine", "cupping", "pain relief",
        "châm cứu", "đông y", "y học cổ truyền", "한의원", "침술", "한약", "中医", "针灸", "中药",
    ],
    "OB/GYN": [
        "obgyn", "ob/gyn", "obstetrics", "gynecology", "women's health", "prenatal", "pregnancy",
        "sản phụ khoa", "bác sĩ sản", "khám thai", "산부인과", "여성병원", "妇产科", "产科",
    ],
    "Ophthalmology": [
        "ophthalmology", "optometry", "optometrist", "eye doctor", "eye exam", "cataract", "lasik", "glasses",
        "nhãn khoa", "khám mắt", "bác sĩ mắt", "안과", "검안", "眼科", "配镜",
    ],
    "Pediatrics": [
        "pediatrics", "pediatrician", "child doctor", "vaccines", "newborn",
        "nhi khoa", "bác sĩ nhi", "khám trẻ em", "소아과", "소아청소년과", "儿科",
    ],
    "Mental Health": [
        "mental health", "psychiatry", "psychiatrist", "psychology", "therapist", "counseling", "depression", "anxiety",
        "tâm lý", "tâm thần", "trầm cảm", "정신과", "심리상담", "心理医生", "精神科",
    ],
    "Cardiology": [
        "cardiology", "cardiologist", "heart doctor", "ekg", "blood pressure",
        "tim mạch", "bác sĩ tim", "심장내과", "心脏科", "心血管",
    ],
    "Dermatology": [
        "dermatology", "dermatologist", "skin doctor", "acne", "eczema", "skin cancer",
        "da liễu", "bác sĩ da liễu", "피부과", "皮肤科",
    ],
    "Orthopedics": [
        "orthopedics", "orthopedic", "joint pain", "sports medicine", "spine", "knee",
        "cơ xương khớp", "chấn thương chỉnh hình", "정형외과", "骨科",
    ],
    "Community Health Center": [
        "community health", "fqhc", "sliding scale", "medicaid", "medicare", "low cost",
        "trung tâm y tế cộng đồng", "커뮤니티 헬스", "社区医疗中心",
    ],
}

_LANGUAGE_NATIVE_SYNONYMS: Dict[str, List[str]] = {
    "Vietnamese": ["vietnamese", "tiếng việt", "người việt", "bác sĩ việt"],
    "Korean": ["korean", "한국어", "한인", "한국말"],
    "Chinese": ["chinese", "mandarin", "cantonese", "中文", "普通话", "国语", "粤语", "广东话", "华人"],
    "Mandarin": ["mandarin", "chinese", "中文", "普通话", "国语", "tiếng trung", "tiếng phổ thông"],
    "Cantonese": ["cantonese", "chinese", "粤语", "广东话", "tiếng quảng đông"],
}


def normalize_insurance_networks(raw_networks: Any, notes: Optional[str] = None) -> List[str]:
    """Canonicalize insurance network names into clean filterable buckets."""
    items: List[str] = []
    if isinstance(raw_networks, list):
        items.extend(str(x).strip() for x in raw_networks if clean_value(x))
    elif isinstance(raw_networks, str) and clean_value(raw_networks):
        items.extend(s.strip() for s in re.split(r"[,;/|]+", raw_networks) if s.strip())

    canonical: List[str] = []
    for item in items:
        low = item.lower()
        matched = False
        for pattern, label in _INSURANCE_CANONICAL_RULES:
            if re.search(pattern, low):
                if label not in canonical:
                    canonical.append(label)
                matched = True
        if not matched and len(item) <= 48 and not re.search(r"parked domain|not listed|unknown|none", low):
            cleaned = item.strip()
            if cleaned and cleaned not in canonical:
                canonical.append(cleaned)

    if notes and isinstance(notes, str):
        notes_low = notes.lower()
        for pattern, label in _INSURANCE_CANONICAL_RULES:
            if re.search(pattern, notes_low) and label not in canonical:
                canonical.append(label)

    return canonical


def infer_price_tier(data: dict) -> str:
    """Infer a standardized price tier ($, $$, $$$) based on specialty, clinic type, and insurance."""
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    existing = clean_value(metadata.get("price_tier")) or clean_value(data.get("price_tier"))
    if existing in ("$", "$$", "$$$", "$$$$"):
        return str(existing)

    specialty = str(data.get("specialty") or "").lower()
    name = str(data.get("name") or "").lower()
    ins_obj = metadata.get("insurance") if isinstance(metadata.get("insurance"), dict) else {}
    networks = metadata.get("insurance_accepted") or []

    if "community health" in specialty or "fqhc" in name or "community" in name:
        return "$"
    if ins_obj.get("accepts_medicaid") or "Medicaid" in networks:
        return "$"
    if any(k in name or k in specialty for k in ("longevity", "concierge", "aesthetic", "plastic")):
        return "$$$"
    return "$$"


def compute_access_flags(working_hours: Any) -> Dict[str, bool]:
    """Determine open_saturday, open_sunday, and open_weekend from working_hours dict."""
    if not isinstance(working_hours, dict):
        return {"open_saturday": False, "open_sunday": False, "open_weekend": False}

    def is_open_day(val: Any) -> bool:
        cleaned = clean_value(val)
        if not cleaned or not isinstance(cleaned, str):
            return False
        return not bool(re.search(r"\bclosed\b", cleaned.lower()))

    sat = is_open_day(working_hours.get("saturday"))
    sun = is_open_day(working_hours.get("sunday"))
    return {
        "open_saturday": sat,
        "open_sunday": sun,
        "open_weekend": sat or sun,
    }


def build_search_keywords(data: dict) -> List[str]:
    """Build a deduplicated list of lowercase search tokens/phrases for deep directory search."""
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    tokens: List[str] = []

    def add(val: Any) -> None:
        cleaned = clean_value(val)
        if cleaned and isinstance(cleaned, str):
            low = cleaned.strip().lower()
            if low and low not in tokens:
                tokens.append(low)

    specialty = data.get("specialty")
    add(specialty)
    if specialty and specialty in _SPECIALTY_MULTILINGUAL_KEYWORDS:
        for kw in _SPECIALTY_MULTILINGUAL_KEYWORDS[specialty]:
            add(kw)

    for lang in (data.get("languages") or []):
        add(lang)
        for syn in _LANGUAGE_NATIVE_SYNONYMS.get(str(lang), []):
            add(syn)

    for svc in (metadata.get("services") or []):
        if isinstance(svc, str):
            add(svc)
        elif isinstance(svc, dict):
            add(svc.get("name"))
            add(svc.get("category"))

    for svc in (metadata.get("services_offered") or []):
        if isinstance(svc, dict):
            add(svc.get("name"))
            add(svc.get("category"))

    for cond in (metadata.get("conditions_treated") or []):
        add(cond)

    for net in (metadata.get("insurance_accepted") or []):
        add(net)

    for member in (metadata.get("team_members") or []):
        if isinstance(member, dict):
            add(member.get("name"))
            add(member.get("role"))

    creds = metadata.get("provider_credentials")
    if isinstance(creds, dict):
        for p in (creds.get("providers") or []):
            add(p)

    return tokens[:80]


def enrich_directory_buckets(db_payload: dict) -> dict:
    """
    Normalize insurance buckets, infer price_tier, compute weekend access flags,
    and build multilingual search_keywords + search_text inside db_payload['metadata'].
    """
    metadata = dict(db_payload.get("metadata") or {})
    ins_obj = dict(metadata.get("insurance") or {}) if isinstance(metadata.get("insurance"), dict) else {}

    raw_networks = (
        metadata.get("insurance_accepted")
        or ins_obj.get("accepted_networks")
        or []
    )
    notes = ins_obj.get("notes")
    canonical_networks = normalize_insurance_networks(raw_networks, notes=notes)

    if canonical_networks:
        metadata["insurance_accepted"] = canonical_networks
        ins_obj["accepted_networks"] = canonical_networks

    if "Medicare" in canonical_networks or ins_obj.get("accepts_medicare") is True:
        ins_obj["accepts_medicare"] = True
        if "Medicare" not in canonical_networks:
            canonical_networks.append("Medicare")
    if "Medicaid" in canonical_networks or ins_obj.get("accepts_medicaid") is True:
        ins_obj["accepts_medicaid"] = True
        if "Medicaid" not in canonical_networks:
            canonical_networks.append("Medicaid")

    private_nets = [n for n in canonical_networks if n not in ("Medicare", "Medicaid")]
    if private_nets:
        ins_obj["accepts_private_insurance"] = True

    if ins_obj:
        metadata["insurance"] = ins_obj
    if canonical_networks:
        metadata["insurance_accepted"] = canonical_networks

    metadata["price_tier"] = infer_price_tier({**db_payload, "metadata": metadata})

    access = compute_access_flags(metadata.get("working_hours"))
    metadata["open_saturday"] = access["open_saturday"]
    metadata["open_sunday"] = access["open_sunday"]
    metadata["open_weekend"] = access["open_weekend"]

    keywords = build_search_keywords({**db_payload, "metadata": metadata})
    metadata["search_keywords"] = keywords
    metadata["search_text"] = " | ".join(keywords)

    db_payload["metadata"] = metadata
    return db_payload

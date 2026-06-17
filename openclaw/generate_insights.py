import os
import json
import re
import base64
import copy
import time
import threading
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse
import urllib.request
from openai import OpenAI
from supabase import create_client, Client
from dotenv import load_dotenv
from storage import upload_image_value
from progress import report_progress

# Load env vars
load_dotenv(".env")
load_dotenv("../.env.local")

IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"

NATURAL_PHOTO_STYLE = (
    "Shot on Sony A7R IV, 50mm lens, f/2.8 depth of field. "
    "Natural skin texture, subtle wrinkles, unretouched, candid, highly detailed, "
    "photorealistic, everyday life."
)
TEXT_MODEL = "deepseek/deepseek-v4-flash"
CONTENT_WORD_TARGETS = {
    "insight": {"min": 1200, "max": 1500, "label": "1,200-1,500 words"},
    "guide": {"min": 3000, "max": 3500, "label": "3,000-3,500 words"},
}
KEY_TAKEAWAYS_HEADING = "Key Takeaways"
REWRITE_SIMILARITY_THRESHOLD = 0.92
MAX_REWRITE_SIMILARITY_RETRIES = 2
JSON_TEMPERATURE = 0.4
SECTION_TEMPERATURE = 0.35
ARTICLE_VERSIONS_KEY = "versions"
ARTICLE_VERSION_META_KEYS = {
    ARTICLE_VERSIONS_KEY,
    "current_version",
    "version_label",
}
TRUSTED_HEALTH_SOURCE_NAMES = [
    "American Dental Association",
    "National Institute of Dental and Craniofacial Research",
    "National Cancer Institute",
    "U.S. Preventive Services Task Force",
    "CDC",
    "NIH",
    "Pew Research Center",
    "U.S. Census Bureau",
    "KFF",
]
TRUSTED_HEALTH_SOURCES = [
    {"name": "CDC", "domain": "cdc.gov"},
    {"name": "NIH", "domain": "nih.gov"},
    {"name": "MedlinePlus", "domain": "medlineplus.gov"},
    {"name": "National Institute of Dental and Craniofacial Research", "domain": "nidcr.nih.gov"},
    {"name": "National Cancer Institute", "domain": "cancer.gov"},
    {"name": "U.S. Preventive Services Task Force", "domain": "uspreventiveservicestaskforce.org"},
    {"name": "American Dental Association", "domain": "ada.org"},
    {"name": "AHRQ", "domain": "ahrq.gov"},
    {"name": "Office of Minority Health", "domain": "minorityhealth.hhs.gov"},
    {"name": "HealthCare.gov", "domain": "healthcare.gov"},
    {"name": "Medicare", "domain": "medicare.gov"},
    {"name": "CMS", "domain": "cms.gov"},
    {"name": "Health.gov", "domain": "health.gov"},
    {"name": "Pew Research Center", "domain": "pewresearch.org"},
    {"name": "KFF", "domain": "kff.org"},
    {"name": "U.S. Census Bureau", "domain": "census.gov"},
    {"name": "HHS", "domain": "hhs.gov"},
    {"name": "APIAVote", "domain": "apiavote.org"},
    {"name": "AAPCHO", "domain": "aapcho.org"},
]
REFERENCE_SEARCH_MAX_RESULTS = int(os.environ.get("OPENCLAW_REFERENCE_SEARCH_MAX_RESULTS", "5"))
REFERENCE_EVIDENCE_MINIMUM = int(os.environ.get("OPENCLAW_REFERENCE_EVIDENCE_MINIMUM", "5"))
REFERENCE_EVIDENCE_TARGET = int(os.environ.get("OPENCLAW_REFERENCE_EVIDENCE_TARGET", "8"))
REFERENCE_MAX_PER_DOMAIN = int(os.environ.get("OPENCLAW_REFERENCE_MAX_PER_DOMAIN", "2"))
REFERENCE_TEXT_CHAR_LIMIT = int(os.environ.get("OPENCLAW_REFERENCE_TEXT_CHAR_LIMIT", "2600"))
DEFAULT_TOPICS = [
    "How to Prepare for an I-693 Medical Exam",
    "Understanding Dental Insurance for Asian American Families",
    "Finding a Vietnamese-Speaking Primary Care Clinic",
    "Preventive Heart Health Tips for Asian American Adults",
    "How Korean American Families Can Choose Pediatric Care",
    "Vaccination Records for New Immigrant Families",
    "Mental Health Care Access for Asian American Patients",
]

GENERIC_TOPIC_FILLER_WORDS = {
    "a",
    "an",
    "the",
    "one",
    "mot",
    "một",
    "me",
    "my",
    "for",
    "to",
    "cho",
    "toi",
    "tôi",
    "giup",
    "giúp",
    "please",
    "pls",
    "article",
    "bai",
    "bài",
    "blog",
    "content",
    "guide",
    "huong",
    "hướng",
    "dan",
    "dẫn",
    "insight",
    "pillar",
    "post",
    "write",
    "create",
    "generate",
    "tao",
    "tạo",
    "viet",
    "viết",
}
GENERIC_TOPIC_PHRASES = [
    "write an guide insight for me",
    "write a guide for me",
    "write an insight for me",
    "write a blog for me",
    "generate guide for me",
    "generate insight for me",
    "generate blog for me",
    "create guide for me",
    "create insight for me",
    "viet 1 bai insight blog cho toi",
    "viet mot bai insight blog cho toi",
    "viet mot bai guide cho toi",
    "tao mot bai guide cho toi",
    "tao mot bai insight cho toi",
    "viết 1 bài insight blog cho tôi",
    "viết một bài insight blog cho tôi",
    "viết một bài guide cho tôi",
    "tạo một bài guide cho tôi",
    "tạo một bài insight cho tôi",
]

def generate_slug(text: str) -> str:
    text = text.replace("Đ", "D").replace("đ", "d")
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = text.strip('-')
    return text[:180] or "article"

def count_markdown_words(content: str) -> int:
    """Return an approximate word count for Markdown content."""
    text = re.sub(r"```.*?```", " ", content or "", flags=re.DOTALL)
    text = re.sub(r"!\[[^\]]*]\([^)]+\)", " ", text)
    text = re.sub(r"\[([^\]]+)]\([^)]+\)", r"\1", text)
    words = re.findall(r"\b[\w'-]+\b", text)
    return len(words)

def normalize_for_similarity(content: str) -> str:
    plain_text = re.sub(r"```[\s\S]*?```", " ", content or "")
    plain_text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", plain_text)
    plain_text = re.sub(r"\[[^\]]+\]\([^)]+\)", " ", plain_text)
    plain_text = re.sub(r"https?://\S+", " ", plain_text)
    plain_text = re.sub(r"[^a-zA-Z0-9\s]", " ", plain_text)
    plain_text = re.sub(r"\s+", " ", plain_text).strip().lower()
    return plain_text

def normalize_topic_request(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"[^0-9A-Za-zÀ-ỹ\s/-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text

def looks_like_generic_content_request(text: str) -> bool:
    normalized = normalize_topic_request(text)
    if not normalized:
        return True

    if normalized in GENERIC_TOPIC_PHRASES:
        return True

    words = re.findall(r"[0-9A-Za-zÀ-ỹ]+", normalized)
    meaningful_words = [
        word
        for word in words
        if word not in GENERIC_TOPIC_FILLER_WORDS and not word.isdigit()
    ]
    return len(meaningful_words) == 0

def clean_requested_topic(topic: Optional[str], mode: str = "insight") -> str:
    raw_topic = (topic or "").strip()
    if not raw_topic:
        return ""

    normalized = raw_topic.lower()
    for marker in [" về ", " ve ", " about ", " topic "]:
        index = normalized.find(marker)
        if index >= 0:
            candidate = raw_topic[index + len(marker):].strip(" :.-")
            return "" if looks_like_generic_content_request(candidate) else candidate

    prefixes = [
        "/generate_insight",
        "/generate_blog",
        "/generate_guide",
        "viết 1 bài insight blog",
        "viet 1 bai insight blog",
        "viết một bài insight blog",
        "viet mot bai insight blog",
        "tạo một bài insight",
        "tao mot bai insight",
        "viết một bài insight",
        "viet mot bai insight",
        "viết 1 bài insight",
        "viet 1 bai insight",
        "generate insight",
        "create insight",
        "write insight",
        "write an insight",
        "write a insight",
        "tạo một bài blog",
        "tao mot bai blog",
        "viết một bài blog",
        "viet mot bai blog",
        "viết 1 bài blog",
        "viet 1 bai blog",
        "generate blog",
        "create blog",
        "write blog",
        "write a blog",
        "tạo một bài guide",
        "tao mot bai guide",
        "viết một bài guide",
        "viet mot bai guide",
        "viết 1 bài guide",
        "viet 1 bai guide",
        "generate guide",
        "create guide",
        "write guide",
        "write a guide",
        "write an guide",
    ]
    for prefix in prefixes:
        if normalized.startswith(prefix):
            candidate = raw_topic[len(prefix):].strip(" :.-")
            return "" if looks_like_generic_content_request(candidate) else candidate

    return "" if looks_like_generic_content_request(raw_topic) else raw_topic

def content_similarity(left: str, right: str) -> float:
    left_normalized = normalize_for_similarity(left)
    right_normalized = normalize_for_similarity(right)
    if not left_normalized or not right_normalized:
        return 0.0

    left_sample = left_normalized[:24000]
    right_sample = right_normalized[:24000]
    return SequenceMatcher(None, left_sample, right_sample).ratio()

def should_enforce_material_rewrite(instruction: str) -> bool:
    normalized = normalize_for_similarity(instruction)
    words = normalized.split()
    if not normalized:
        return False

    generic_phrases = {
        "rewrite",
        "rewrite article",
        "rewrite the article",
        "rewrite blog",
        "rewrite the blog",
        "rewrite content",
        "rewrite the content",
        "rewrite the blog content as needed",
        "viet lai",
        "viet lai bai",
        "viet lai bai blog",
        "viet lai noi dung",
    }
    if normalized in generic_phrases:
        return True

    rewrite_words = {"rewrite", "rewritten", "regenerate", "improve"}
    return len(words) <= 12 and any(word in rewrite_words for word in words)

def extract_markdown_headings(content: str, limit: int = 18) -> List[str]:
    headings = []
    for line in (content or "").splitlines():
        match = re.match(r"^(#{2,3})\s+(.+?)\s*$", line.strip())
        if not match:
            continue
        headings.append(f"{match.group(1)} {match.group(2)}")
        if len(headings) >= limit:
            break
    return headings

def extract_reference_urls_from_content(content: str) -> List[str]:
    urls = re.findall(r"\]\((https?://[^)]+)\)", content or "")
    clean_urls = []
    seen = set()
    for url in urls:
        url = url.strip().rstrip(").,;]\"'")
        key = normalize_reference_url(url)
        if not key or key in seen:
            continue
        seen.add(key)
        clean_urls.append(url)
    return clean_urls

def should_skip_image_generation(instruction: str) -> bool:
    normalized = normalize_for_similarity(instruction)
    no_image_phrases = [
        "khong can tao lai hinh",
        "khong can phai tao lai hinh",
        "khong tao lai hinh",
        "khong tao hinh",
        "khong can generate image",
        "khong generate image",
        "khong can anh",
        "khong tao anh",
        "do not regenerate image",
        "do not regenerate images",
        "dont regenerate image",
        "dont regenerate images",
        "no image regeneration",
        "skip image generation",
        "keep existing images",
        "reuse existing images",
    ]
    return any(phrase in normalized for phrase in no_image_phrases)

def build_rewrite_reference_label(article: dict) -> str:
    title = article.get("title") or ""
    return clean_reference_search_label(title, max_len=80)

def is_key_takeaways_heading(heading: str) -> bool:
    normalized = unicodedata.normalize("NFKD", heading or "")
    normalized = "".join(c for c in normalized if not unicodedata.combining(c))
    normalized = re.sub(r"[^a-z\s]", " ", normalized.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    
    banned_words = {"takeaway", "takeaways", "summary", "summaries", "recap"}
    words = set(normalized.split())
    if words.intersection(banned_words):
        return True
        
    return normalized in {
        "key points",
        "key point",
        "main points",
        "main point",
        "quick summary",
        "highlights",
        "article highlights",
    }

def is_faq_heading(heading: str) -> bool:
    normalized = unicodedata.normalize("NFKD", heading or "")
    normalized = "".join(c for c in normalized if not unicodedata.combining(c))
    normalized = re.sub(r"[^a-z\s]", " ", normalized.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    
    words = normalized.split()
    if "faq" in words or "faqs" in words:
        return True
    if "frequently asked" in normalized:
        return True
    return False

def is_next_steps_heading(heading: str) -> bool:
    normalized = unicodedata.normalize("NFKD", heading or "")
    normalized = "".join(c for c in normalized if not unicodedata.combining(c))
    normalized = re.sub(r"[^a-z\s]", " ", normalized.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    
    if "next step" in normalized or "next steps" in normalized:
        return True
    return False

def is_references_heading(heading: str) -> bool:
    normalized = unicodedata.normalize("NFKD", heading or "")
    normalized = "".join(c for c in normalized if not unicodedata.combining(c))
    normalized = re.sub(r"[^a-z\s]", " ", normalized.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    
    if "reference" in normalized or "references" in normalized or "source" in normalized or "sources" in normalized:
        return True
    return False

def get_prioritized_sources(label: str) -> List[dict]:
    label_lower = label.lower()
    prioritized = []
    others = []
    
    is_dental = any(w in label_lower for w in ["dental", "teeth", "tooth", "oral", "nha khoa", "răng", "nướu"])
    is_cancer_screening = any(w in label_lower for w in ["cancer", "colorectal", "colon", "rectal", "mammogram", "screening"])
    is_medicare_policy = any(w in label_lower for w in ["medicare", "insurance", "policy", "cost", "enrollment", "bảo hiểm", "học phí", "chi phí"])
    
    for source in TRUSTED_HEALTH_SOURCES:
        domain = source["domain"].lower()
        if is_dental:
            if domain in ["ada.org", "nidcr.nih.gov"]:
                prioritized.append(source)
            else:
                others.append(source)
        elif is_cancer_screening:
            if domain in ["cdc.gov", "cancer.gov", "medlineplus.gov", "uspreventiveservicestaskforce.org", "nih.gov"]:
                prioritized.append(source)
            else:
                others.append(source)
        elif is_medicare_policy:
            if domain in ["medicare.gov", "cms.gov", "healthcare.gov", "kff.org", "hhs.gov", "ahrq.gov"]:
                prioritized.append(source)
            else:
                others.append(source)
        else:
            if domain in ["cdc.gov", "nih.gov", "medlineplus.gov"]:
                prioritized.append(source)
            else:
                others.append(source)
                
    return prioritized + others

def get_direct_reference_urls(label: str) -> List[str]:
    label_lower = label.lower()
    urls: List[str] = []

    if any(w in label_lower for w in ["colorectal", "colon cancer", "rectal cancer"]):
        urls.extend(
            [
                "https://www.cdc.gov/colorectal-cancer/screening/index.html",
                "https://www.cdc.gov/colorectal-cancer/statistics/index.html",
                "https://www.cancer.gov/types/colorectal/screening-fact-sheet",
                "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/colorectal-cancer-screening",
                "https://medlineplus.gov/colorectalcancer.html",
            ]
        )

    return urls

def extract_image_value(message) -> Optional[str]:
    """
    OpenRouter image-preview models can return either text content containing
    a URL/data URL or an images array with image_url.url. Keep both paths.
    """
    images = getattr(message, "images", None)
    if images:
        first_image = images[0]
        image_url = first_image.get("image_url") if isinstance(first_image, dict) else getattr(first_image, "image_url", None)
        if isinstance(image_url, dict):
            return image_url.get("url")
        if hasattr(image_url, "url"):
            return image_url.url

    content = (message.content or "").strip()
    if content.startswith("http") or content.startswith("data:image/"):
        return content

    return None

def save_generated_image(image_value: Optional[str], slug: str, suffix: str = "hero") -> str:
    if not image_value:
        return ""

    safe_suffix = generate_slug(suffix) or "image"
    cloud_url = upload_image_value(image_value, "generated-insights", f"{slug}-{safe_suffix}")
    if cloud_url:
        return cloud_url

    if image_value.startswith("http"):
        return image_value

    if image_value.startswith("data:image/"):
        header, encoded = image_value.split(",", 1)
        extension = header.split(";")[0].split("/")[-1] or "png"
        output_dir = os.path.join("..", "public", "generated-insights")
        os.makedirs(output_dir, exist_ok=True)
        filename = f"{slug}-{safe_suffix}.{extension}"
        output_path = os.path.join(output_dir, filename)

        with open(output_path, "wb") as image_file:
            image_file.write(base64.b64decode(encoded))

        return f"/generated-insights/{filename}"

    return ""

def make_unique_slug(supabase: Client, base_slug: str) -> str:
    slug = base_slug
    suffix = 2

    while True:
        existing = supabase.table("articles").select("id").eq("slug", slug).limit(1).execute()
        if not existing.data:
            return slug

        slug = f"{base_slug}-{suffix}"
        suffix += 1

def iso_now() -> str:
    return datetime.now().isoformat()

def get_article_current_version(seo_meta: dict) -> int:
    raw_version = seo_meta.get("current_version")
    try:
        version = int(raw_version)
    except (TypeError, ValueError):
        version = 0

    if version > 0:
        return version

    versions = seo_meta.get(ARTICLE_VERSIONS_KEY)
    if not isinstance(versions, list):
        return 1

    historical_versions = []
    for item in versions:
        if not isinstance(item, dict):
            continue
        try:
            historical_versions.append(int(item.get("version") or 0))
        except (TypeError, ValueError):
            continue

    return max(historical_versions, default=0) + 1 if historical_versions else 1

def coerce_version(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0

def strip_version_meta(seo_meta: dict) -> dict:
    return {
        key: copy.deepcopy(value)
        for key, value in (seo_meta or {}).items()
        if key not in ARTICLE_VERSION_META_KEYS
    }

def build_article_version_snapshot(article: dict, version: int, saved_at: str) -> Dict[str, Any]:
    seo_meta = article.get("seo_meta") or {}
    return {
        "version": version,
        "label": f"v{version}",
        "saved_at": saved_at,
        "title": article.get("title"),
        "slug": article.get("slug"),
        "excerpt": article.get("excerpt"),
        "content": article.get("content"),
        "category": article.get("category"),
        "tags": copy.deepcopy(article.get("tags") or []),
        "status": article.get("status"),
        "author": article.get("author"),
        "published_at": article.get("published_at"),
        "updated_at": article.get("updated_at"),
        "word_count": count_markdown_words(article.get("content") or ""),
        "rewrite_instruction": seo_meta.get("last_rewrite_instruction"),
        "rewritten_at": seo_meta.get("last_rewritten_at"),
        "seo_meta": strip_version_meta(seo_meta),
    }

def build_rewrite_version_meta(article: dict, data: dict, mode: str, instruction: str, rewritten_at: str) -> dict:
    seo_meta = article.get("seo_meta") or {}
    current_version = get_article_current_version(seo_meta)
    next_version = current_version + 1
    existing_versions = [
        copy.deepcopy(item)
        for item in (seo_meta.get(ARTICLE_VERSIONS_KEY) or [])
        if isinstance(item, dict) and coerce_version(item.get("version")) != current_version
    ]
    existing_versions.append(build_article_version_snapshot(article, current_version, rewritten_at))
    existing_versions.sort(key=lambda item: coerce_version(item.get("version")))

    return {
        **seo_meta,
        "description": data.get("seo_description") or seo_meta.get("description"),
        "keywords": data.get("tags") or article.get("tags") or [],
        "primary_keyword": data.get("primary_keyword"),
        "secondary_keywords": data.get("secondary_keywords", []),
        "content_mode": mode,
        "last_rewrite_instruction": instruction,
        "last_rewritten_at": rewritten_at,
        "current_version": next_version,
        "version_label": f"v{next_version}",
        ARTICLE_VERSIONS_KEY: existing_versions,
    }

def build_trust_and_culture_rules(mode: str = "insight") -> str:
    content_label = "guide" if mode == "guide" else "insight"
    source_names = ", ".join(TRUSTED_HEALTH_SOURCE_NAMES)

    return f"""
    Trust, evidence, and cultural authenticity requirements for this {content_label}:
    - Add 2-4 brief human moments that feel real and specific. Use composite or anonymized examples; never imply a real patient story unless a real source is provided.
    - Replace generic lines like "families face language barriers" with concrete scenes: a parent postponing care because insurance language is confusing, an older adult waiting until pain becomes severe, or a family asking a bilingual relative to call the clinic.
    - Include culturally specific insight when relevant, especially for Vietnamese and Korean American families, without stereotyping or treating either community as monolithic.
    - Explore practical cultural dynamics when relevant: immigrant mindset, healthcare distrust, saving face, financial fear, family hierarchy, traditional beliefs, indirect communication, and reliance on community recommendations.
    - For Vietnamese families when relevant, consider themes like waiting until pain becomes severe, prioritizing children over personal care, fear of expensive treatment, and trust in community referrals.
    - For Korean families when relevant, consider themes like appearance-focused orthodontics, caution around aggressive procedures, respect for authoritative doctors, and strong word-of-mouth trust networks.
    - Include 2-4 evidence-backed statements or statistics when relevant. Prefer sources such as {source_names}.
    - Do not invent exact percentages, study findings, or URLs. If you cannot support an exact number, write a careful qualitative statement and cite the source organization.
    - Tie every statistic or factual claim to patient meaning: what it changes about prevention, timing, cost conversations, language access, or choosing a culturally responsive clinician.
    - The finished article should feel medically credible, emotionally authentic, culturally insightful, and uniquely useful for Asian American patients.
    """

def build_authoritative_depth_rules(mode: str = "insight") -> str:
    content_label = "guide" if mode == "guide" else "insight"

    return f"""
    Specificity and authority requirements for this {content_label}:
    - Do not mention an important topic in only one sentence. If a point is important enough to include, develop it with context, why it matters, what patients should do, and when to ask a clinician or insurance plan.
    - Each major H2 section must include at least 2 substantial paragraphs or one substantial paragraph plus a practical list/table. Avoid thin sections.
    - Prefer specific patient-facing explanations over broad educational claims. Name the barrier, show how it appears in real life, explain the consequence, and give a concrete next step.
    - When discussing cultural patterns, separate observation from medical advice. Explain how the pattern can affect timing, consent, cost conversations, follow-up, or trust.
    - When discussing evidence, connect it to a clinical or practical decision instead of dropping a statistic without interpretation.
    - Avoid filler transitions, generic wellness language, and one-line summaries that could apply to any healthcare article.
    """

def build_reference_style_rules() -> str:
    return """
    Reference style requirements:
    - End with a "## References" section when using external evidence, clinical guidance, statistics, or source material.
    - Use only verified reference evidence supplied in the prompt for URLs, titles, years, statistics, studies, and named citations.
    - Do not invent URLs, page titles, publication years, journal details, report names, DOI links, PMC links, or source organizations.
    - Format references as a numbered Markdown list, not bullet points.
    - Each reference should read like a citation: author or organization, title in quotation marks, publication/source name when available, year or access date when available, and a short linked source label at the end.
    - Use this style:
      1. American Dental Association. "Oral Health Topics: Gum Disease." ADA. [ADA](https://example.com)
      2. National Institute of Dental and Craniofacial Research. "Periodontal Disease in Adults." NIH/NIDCR. [NIDCR](https://example.com)
    - Do not use bare URLs.
    - If only the organization and page title are known from verified evidence, cite only those accurately.
    """

def build_article_visual_contract(mode: str = "insight") -> str:
    return """
    Article visual/template contract for the frontend:
    - The frontend renders Markdown into typed visual blocks. Do not write raw HTML or custom class attributes in `content`.
    - Use stable H2 heading patterns so the renderer can apply the correct infographic class:
      - "## Key Takeaways" -> `article-section--key-takeaways` and `article-infographic--key-takeaways`.
      - Headings containing "Signs", "Warning Signs", or "What to Look For" -> `article-infographic--signs`.
      - Headings containing "Comparing", "Comparison", "Options", "vs", or "Versus" -> `article-infographic--comparison`.
      - Headings containing "Step-by-Step", "Steps", "Next Steps", or "How to" -> `article-infographic--steps`.
      - Headings containing "Checklist", "What to Ask", "Questions to Ask", "Prepare", or "Preparation" -> `article-infographic--checklist`.
      - "## References" -> `article-section--references`.
    - Include one comparison table in a comparison/options section when useful; do not put tables in the opening summary.
    - Include one quote-style callout using Markdown blockquote (`> ...`) only when it adds patient meaning.
    - Use lists for practical signs, checklist items, and steps; these will be styled as infographic cards.
    - Use normal paragraphs for explanations before and after visual blocks.
    - References must stay as a numbered Markdown list so the frontend can style them as compact citations.
    """

def build_guide_structure_rules(mode: str = "insight") -> str:
    if mode != "guide":
        return ""

    return """
    Guide structure and SEO requirements:
    - Do not include an inline "Table of Contents" section inside `content`; the website renders the table of contents in the right sidebar from H2/H3 headings.
    - Build the article as a complete SEO pillar guide, not a long blog post or a stitched-together summary.
    - Use 10-14 SEO-friendly H2 sections, plus H3 subquestions where a topic needs depth.
    - Start with Key Takeaways, then use 2 original intro paragraphs in the first body section to define the reader problem, search intent, and why the guide matters. Do not start the body with a table, FAQ, or table of contents.
    - Each H2 section before FAQ must contain at least 120 words of useful substance. Prefer 2 paragraphs, or 1 paragraph plus a practical list/table.
    - Use the primary keyword or a close variant in the title, opening paragraph, one early H2, one later H2, and the Next Steps/conclusion.
    - H2 headings should answer real search questions: symptoms or decision points, cost, insurance, language access, preparation, risks, when to seek care, cultural considerations, and what to ask a clinician.
    - Include exactly one H2 named "FAQs" with 4-6 H3 question headings. Each FAQ answer needs 2-4 useful sentences.
    - Include exactly one H2 named "Next Steps" near the end before References. It should give a practical checklist readers can act on.
    - Include one comparison table in the body, but do not use a table as a substitute for section depth.
    - Avoid repeated generic sections. Every H2 must add a new decision, scenario, or patient action.
    - Keep the structure continuous from the opening through References; do not write two separate mini-articles in one response.
    """

def build_guide_generation_rules(mode: str = "insight") -> str:
    if mode != "guide":
        return ""

    return """
    Mandatory guide generation plan:
    - Silently plan the guide first, then output only the final JSON. Do not include the plan outside `content`.
    - The guide must feel like one complete, authoritative resource for the topic.
    - Recommended flow:
      1. Opening context for the specific audience and healthcare problem.
      2. What this topic means in practical U.S. healthcare terms.
      3. Why the topic matters for Asian American, Vietnamese, Korean, immigrant, or limited-English families when relevant.
      4. Symptoms, warning signs, eligibility, or decision points relevant to the topic.
      5. Insurance, cost, scheduling, language access, and documentation issues.
      6. What to ask the clinician, clinic, insurer, or pharmacist.
      7. Cultural trust, family decision-making, and communication barriers where relevant.
      8. Prevention, follow-up, and when to seek urgent care.
      9. Comparison table.
      10. FAQs.
      11. Next Steps.
      12. References.
    - Do not stop after FAQ. FAQ and Next Steps are late-guide sections, not the end of the main guide.
    - Do not produce a short draft and rely on later expansion. The first response should already satisfy the minimum word count.
    """

def pick_topic(supabase: Client) -> str:
    existing = supabase.table("articles").select("title").execute().data or []
    existing_titles = {row["title"].strip().lower() for row in existing if row.get("title")}

    for topic in DEFAULT_TOPICS:
        if topic.lower() not in existing_titles:
            return topic

    return f"Asian American Healthcare Guide {datetime.now().strftime('%Y-%m-%d %H%M')}"

def pick_trending_topic(client: OpenAI, supabase: Client, mode: str = "insight") -> str:
    existing = supabase.table("articles").select("title").execute().data or []
    existing_titles = [row["title"] for row in existing if row.get("title")]
    content_type = "SEO insight article" if mode == "insight" else "pillar guide"

    prompt = f"""
    Choose one timely healthcare topic for Asian Health Hub.
    Content type: {content_type}
    Audience: Asian American patients and families in the United States, especially Vietnamese and Korean communities.
    Goal: pick a topic likely to perform well for SEO and patient usefulness right now.

    Avoid these existing titles:
    {json.dumps(existing_titles[-80:], ensure_ascii=False)}

    Prefer topics connected to current seasonality, prevention, insurance/navigation, immigration medical exams, vaccines, mental health, chronic disease, digestive health, dental care, or language-access healthcare.
    Do not choose a generic title. Do not repeat existing titles.

    Output ONLY valid JSON:
    {{
      "topic": "Specific topic to write about"
    }}
    """

    try:
        response = client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=600,
        )
        data = extract_json_payload(response.choices[0].message.content)
        topic = str(data.get("topic") or "").strip()
        if topic:
            print(f"[*] Auto-selected trending topic: {topic}")
            return topic
    except Exception as exc:
        print(f"[!] Could not pick trending topic via AI, using default topic: {exc}")

    return pick_topic(supabase)

def create_article(topic: Optional[str] = None):
    print("[*] Start generate blog.")
    client, supabase = create_clients()
    raw_requested_topic = (topic or os.environ.get("OPENCLAW_ARTICLE_TOPIC") or "").strip()
    requested_topic = clean_requested_topic(raw_requested_topic, mode="insight")
    if requested_topic:
        print(f"[*] Using requested blog topic: {requested_topic}")
    elif raw_requested_topic:
        print(f"[*] Request did not include a specific blog topic: {raw_requested_topic}")
        print("[*] Getting topic for blog...")
    else:
        print("[*] Getting topic for blog...")
    topic = requested_topic or pick_trending_topic(client, supabase, mode="insight")
    print(f"[*] Blog topic selected: {topic}")
    print("[*] Building blog prompt...")
    prompt = build_topic_prompt(topic, mode="insight")
    create_article_from_prompt(client, supabase, prompt, topic, mode="insight")

def create_guide(topic: Optional[str] = None):
    print("[*] Start generate guide.")
    client, supabase = create_clients()
    raw_requested_topic = (topic or os.environ.get("OPENCLAW_GUIDE_TOPIC") or "").strip()
    requested_topic = clean_requested_topic(raw_requested_topic, mode="guide")
    if requested_topic:
        print(f"[*] Using requested guide topic: {requested_topic}")
    elif raw_requested_topic:
        print(f"[*] Request did not include a specific guide topic: {raw_requested_topic}")
        print("[*] Getting topic for guide...")
    else:
        print("[*] Getting topic for guide...")
    topic = requested_topic or pick_trending_topic(client, supabase, mode="guide")
    print(f"[*] Guide topic selected: {topic}")
    print("[*] Building guide prompt...")
    prompt = build_topic_prompt(topic, mode="guide")
    create_article_from_prompt(client, supabase, prompt, topic, mode="guide")

def create_clients():
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ.get("OPENROUTER_API_KEY"),
    )

    supabase: Client = create_client(
        os.environ.get("NEXT_PUBLIC_SUPABASE_URL"),
        os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    )

    return client, supabase

def build_topic_prompt(topic: str, mode: str = "insight") -> str:
    trust_rules = build_trust_and_culture_rules(mode)
    depth_quality_rules = build_authoritative_depth_rules(mode)
    reference_style_rules = build_reference_style_rules()
    visual_contract_rules = build_article_visual_contract(mode)
    guide_structure_rules = build_guide_structure_rules(mode)
    guide_generation_rules = build_guide_generation_rules(mode)

    if mode == "guide":
        content_type = "pillar guide"
        word_count = CONTENT_WORD_TARGETS["guide"]["label"]
        category = "guide"
        depth_rules = """
    - Write as Pillar Content: comprehensive, cohesive, and useful enough to rank for a broad healthcare topic.
    - Cover the full patient journey: definition, why it matters, who is affected, decision points, preparation, cost/insurance, language access, cultural considerations, clinician questions, follow-up, FAQs, and next steps.
    - Include one Markdown comparison table, one practical checklist, 4-6 FAQs, and a clear care-next-step section.
    - Use normal paragraphs for most sections. Use bullets only when they make an action easier to follow.
    - Use H2 and H3 headings with SEO-friendly phrasing, but keep the writing natural and medically cautious.
    - The guide should not read like two articles pasted together. Maintain one clear throughline from opening to References.
    """
    else:
        content_type = "SEO healthcare insight article"
        word_count = CONTENT_WORD_TARGETS["insight"]["label"]
        category = "insight"
        depth_rules = """
    - Write a useful SEO article, not a thin summary.
    - Include a concise intro, 5-7 substantive H2 sections, practical patient tips, a short FAQ, and a medical disclaimer.
    - Include one Markdown table, one practical bullet list, and at most one Markdown blockquote callout.
    - Do not overuse boxed/callout-style content; most sections should be normal paragraphs with occasional lists.
    - Keep the article focused and scannable for patients who need quick but trustworthy guidance.
    """

    return f"""
    Write a high-quality {content_type} for Asian Health Hub.
    Topic: '{topic}'.
    Target length: {word_count}.
    Hard length rule: do not return content shorter than {CONTENT_WORD_TARGETS[mode]["min"]} words.
    The article must be in Markdown format.
    Do not include a top-level H1 title inside `content`; the website already renders the title above the article.
    Start `content` with the opening paragraph or the first H2 section.
    Do not include image markdown, image captions, placeholder text, or lines like "[title] illustration" inside `content`.
    Make the title specific and not generic. Avoid reusing the title "Heart Health for Asians" unless the topic explicitly asks for it.
    Audience: Asian American patients and families navigating healthcare in the United States, especially Vietnamese and Korean communities when relevant.
    SEO requirements:
    - Choose one primary keyword and 4-7 secondary keywords.
    - Put the primary keyword naturally in the title, opening paragraph, one H2, and conclusion.
    - Write an SEO description under 160 characters.
    - Use original phrasing and cautious medical language.
    - Do not make unsupported medical claims. Encourage readers to consult licensed healthcare professionals.
    - Include a final "## References" section with credible source names and URLs when you use statistics, public health guidance, or research findings.
    - Every URL must be written as a clickable Markdown link like "- [Source name](https://example.com/page)".
    - If you cannot confidently provide a URL, cite the source organization in the relevant sentence but do not fabricate a URL.
    {depth_rules}
    {trust_rules}
    {depth_quality_rules}
    {reference_style_rules}
    {visual_contract_rules}
    {guide_structure_rules}
    {guide_generation_rules}
    Image requirements:
    - Provide 3-5 distinct photorealistic editorial photo prompts in `image_prompts`, choosing the count based on the article depth and section variety.
    - First prompt is for the hero image.
    - Remaining prompts are for inline supporting images tied to different major sections of the article.
    - Every prompt must describe a realistic healthcare or everyday patient scene with natural light, real people when relevant, believable clinic/home details, and human warmth.
    - Every prompt must include this natural photo style: {NATURAL_PHOTO_STYLE}
    - Do not request illustrations, icons, diagrams, vector art, 3D renderings, cartoons, infographics, posters, text overlays, floating UI, or symbolic/metaphorical scenes.
    - Every prompt must be visually distinct and must say: photorealistic, documentary-style editorial photography, no text, no logos, no watermarks.

    Output ONLY valid JSON in this exact structure:
    {{
      "title": "Specific article title here",
      "excerpt": "A short SEO-friendly summary.",
      "content": "Full markdown content here",
      "category": "{category}",
      "tags": ["Asian Health", "Primary Care"],
      "seo_description": "SEO description here",
      "primary_keyword": "primary keyword here",
      "secondary_keywords": ["keyword one", "keyword two"],
      "image_prompts": [
        "Photorealistic hero image prompt for this exact article, documentary-style editorial photography, no text, no logos, no watermarks",
        "Photorealistic inline supporting image prompt for section one, documentary-style editorial photography, no text, no logos, no watermarks",
        "Photorealistic inline supporting image prompt for section two, documentary-style editorial photography, no text, no logos, no watermarks"
      ]
    }}
    """

def build_source_url_prompt(source_url: str, source_text: str, mode: str = "insight") -> str:
    safe_text = source_text[:40000]
    is_guide = mode == "guide"
    trust_rules = build_trust_and_culture_rules(mode)
    depth_quality_rules = build_authoritative_depth_rules(mode)
    reference_style_rules = build_reference_style_rules()
    visual_contract_rules = build_article_visual_contract(mode)
    guide_structure_rules = build_guide_structure_rules(mode)
    guide_generation_rules = build_guide_generation_rules(mode)
    content_type = "Pillar Content guide" if is_guide else "SEO healthcare insight article"
    word_count = CONTENT_WORD_TARGETS["guide" if is_guide else "insight"]["label"]
    category = "guide" if is_guide else "insight"
    min_words = CONTENT_WORD_TARGETS["guide" if is_guide else "insight"]["min"]
    depth_rules = (
        "Write a complete SEO pillar guide with 10-14 substantive H2 sections, one Markdown comparison table, one checklist, 4-6 FAQs, and Next Steps. Do not include an inline table of contents; the website sidebar handles navigation. Do not overuse callouts. Do not copy the source structure."
        if is_guide
        else "Include 5-7 substantive H2 sections, practical patient tips, one Markdown table, one bullet list, at most one blockquote callout, a short FAQ, and a medical disclaimer. Do not overuse callouts."
    )
    return f"""
    You are creating an ORIGINAL Asian Health Hub {content_type} based on a reference page.

    Source URL: {source_url}

    Rules:
    - Do NOT copy the source article wording, structure, headings, or long passages.
    - Analyze the source for medical concepts, patient concerns, symptoms, care steps, and practical takeaways.
    - Rewrite as fresh, original content for Asian American patients navigating care in the United States.
    - Use cautious medical language. Encourage readers to consult licensed healthcare professionals.
    - If the source is in Vietnamese, write the final article in English unless the topic clearly requires Vietnamese.
    - Mention the source domain briefly in content as a reference, but do not overquote it.
    - Do not invent specific facts that are not supported by the source or general medical knowledge.
    - Target length: {word_count}.
    - Hard length rule: do not return content shorter than {min_words} words.
    - SEO: choose one primary keyword and 4-7 secondary keywords; use the primary keyword naturally.
    - {depth_rules}
    {trust_rules}
    {depth_quality_rules}
    {reference_style_rules}
    {visual_contract_rules}
    {guide_structure_rules}
    {guide_generation_rules}
    - Include a final "## References" section with the source URL and any other source names clearly supported by the reference text.
    - Provide 3-5 photorealistic editorial photo prompts, choosing the count based on article depth and section variety. The first is the hero image; the remaining prompts are inline supporting images for different major sections.
    - Image prompts must feel like believable documentary healthcare photography: real people when relevant, natural light, realistic clinic/home environments, grounded emotion, and no staged stock-photo exaggeration.
    - Every prompt must include this natural photo style: {NATURAL_PHOTO_STYLE}
    - Do not request illustrations, icons, diagrams, vector art, 3D renderings, cartoons, infographics, posters, text overlays, floating UI, or symbolic/metaphorical scenes.
    - All image prompts must specify: photorealistic, documentary-style editorial photography, no text, no logos, no watermarks.
    - The article should be in Markdown format.
    - Do not include a top-level H1 title inside `content`; the website already renders the title above the article.
    - Start `content` with the opening paragraph or the first H2 section.
    - Do not include image markdown, image captions, placeholder text, or lines like "[title] illustration" inside `content`.

    Reference page text:
    {safe_text}

    Output ONLY valid JSON in this exact structure:
    {{
      "title": "Specific original article title here",
      "excerpt": "A short SEO-friendly summary.",
      "content": "Full original markdown content here",
      "category": "{category}",
      "tags": ["Digestive Health", "Asian Health"],
      "seo_description": "SEO description here",
      "primary_keyword": "primary keyword here",
      "secondary_keywords": ["keyword one", "keyword two"],
      "image_prompts": [
        "Hero image prompt for this exact article, no text, no logos, no watermarks",
        "Inline supporting image prompt for section one, no text, no logos, no watermarks",
        "Inline supporting image prompt for section two, no text, no logos, no watermarks"
      ]
    }}
    """

def build_context_prompt(reference_label: str, reference_text: str, instruction: str, mode: str = "insight") -> str:
    safe_text = reference_text[:32000]
    is_guide = mode == "guide"
    trust_rules = build_trust_and_culture_rules(mode)
    depth_quality_rules = build_authoritative_depth_rules(mode)
    reference_style_rules = build_reference_style_rules()
    visual_contract_rules = build_article_visual_contract(mode)
    guide_structure_rules = build_guide_structure_rules(mode)
    guide_generation_rules = build_guide_generation_rules(mode)
    content_type = "Pillar Content guide" if is_guide else "SEO healthcare insight article"
    word_count = CONTENT_WORD_TARGETS["guide" if is_guide else "insight"]["label"]
    category = "guide" if is_guide else "insight"
    min_words = CONTENT_WORD_TARGETS["guide" if is_guide else "insight"]["min"]
    depth_rules = (
        "Write a complete SEO pillar guide with 10-14 substantive H2 sections, one Markdown comparison table, one checklist, 4-6 FAQs, and Next Steps. Do not include an inline table of contents; the website sidebar handles navigation. Do not overuse callouts. Do not copy the memory structure."
        if is_guide
        else "Include 5-7 substantive H2 sections, practical patient tips, one Markdown table, one bullet list, at most one blockquote callout, a short FAQ, and a medical disclaimer. Do not overuse callouts."
    )

    return f"""
    You are creating an ORIGINAL Asian Health Hub {content_type} from an internal research/context memory.

    User instruction:
    {instruction}

    Reference label:
    {reference_label}

    Rules:
    - Use the research/context memory as the main factual basis.
    - Do NOT copy long passages from the memory. Synthesize and rewrite as original patient-facing content.
    - Preserve source attributions and uncertainty from the research where relevant.
    - If the memory says the evidence is incomplete, be transparent and avoid overclaiming.
    - Use cautious medical and directory language. Encourage readers to verify clinic details directly.
    - Target length: {word_count}.
    - Hard length rule: do not return content shorter than {min_words} words.
    - SEO: choose one primary keyword and 4-7 secondary keywords; use the primary keyword naturally.
    - {depth_rules}
    {trust_rules}
    {depth_quality_rules}
    {reference_style_rules}
    {visual_contract_rules}
    {guide_structure_rules}
    {guide_generation_rules}
    - Include a final "## References" section using the source URLs or source names from the memory when available.
    - Provide 3-5 photorealistic editorial photo prompts, choosing the count based on article depth and section variety. The first is the hero image; the remaining prompts are inline supporting images for different major sections.
    - Image prompts must feel like believable documentary healthcare photography: real people when relevant, natural light, realistic clinic/home environments, grounded emotion, and no staged stock-photo exaggeration.
    - Every prompt must include this natural photo style: {NATURAL_PHOTO_STYLE}
    - Do not request illustrations, icons, diagrams, vector art, 3D renderings, cartoons, infographics, posters, text overlays, floating UI, or symbolic/metaphorical scenes.
    - All image prompts must specify: photorealistic, documentary-style editorial photography, no text, no logos, no watermarks.
    - The article should be in Markdown format.
    - Do not include a top-level H1 title inside `content`; the website already renders the title above the article.
    - Start `content` with the opening paragraph or the first H2 section.
    - Do not include image markdown, image captions, placeholder text, or lines like "[title] illustration" inside `content`.

    Research/context memory:
    {safe_text}

    Output ONLY valid JSON in this exact structure:
    {{
      "title": "Specific original article title here",
      "excerpt": "A short SEO-friendly summary.",
      "content": "Full original markdown content here",
      "category": "{category}",
      "tags": ["Asian Health", "Clinic Directory"],
      "seo_description": "SEO description here",
      "primary_keyword": "primary keyword here",
      "secondary_keywords": ["keyword one", "keyword two"],
      "image_prompts": [
        "Hero image prompt for this exact article, no text, no logos, no watermarks",
        "Inline supporting image prompt for section one, no text, no logos, no watermarks",
        "Inline supporting image prompt for section two, no text, no logos, no watermarks"
      ]
    }}
    """

def build_rewrite_prompt(article: dict, instruction: str, mode: str = "insight") -> str:
    is_guide = mode == "guide"
    trust_rules = build_trust_and_culture_rules(mode)
    depth_quality_rules = build_authoritative_depth_rules(mode)
    reference_style_rules = build_reference_style_rules()
    visual_contract_rules = build_article_visual_contract(mode)
    guide_structure_rules = build_guide_structure_rules(mode)
    guide_generation_rules = build_guide_generation_rules(mode)
    word_count = CONTENT_WORD_TARGETS["guide" if is_guide else "insight"]["label"]
    min_words = CONTENT_WORD_TARGETS["guide" if is_guide else "insight"]["min"]
    category = "guide" if is_guide else "insight"
    existing_content_limit = 18000 if is_guide else 32000
    existing_content = str(article.get("content") or "")[:existing_content_limit]
    existing_headings = extract_markdown_headings(str(article.get("content") or ""), limit=24)
    existing_seo = article.get("seo_meta") or {}

    return f"""
    You are rewriting an EXISTING Asian Health Hub article after the owner requested edits.

    Existing article:
    - ID: {article.get("id")}
    - Current title: {article.get("title")}
    - Current slug, must be preserved by backend: {article.get("slug")}
    - Current category: {article.get("category")}
    - Current tags: {json.dumps(article.get("tags") or [], ensure_ascii=False)}
    - Current primary keyword: {existing_seo.get("primary_keyword")}
    - Current H2/H3 outline: {json.dumps(existing_headings, ensure_ascii=False)}

    Owner rewrite instruction:
    {instruction}

    Existing content:
    {existing_content}

    Rewrite rules:
    - Apply the owner's requested edits precisely.
    - Preserve the article's useful factual content, but improve clarity, structure, SEO, and patient usefulness.
    - If the owner instruction is broad or generic, treat this as a full editorial rewrite, not a light polish.
    - The rewritten article must be visibly different in version comparison: change the opening, rewrite every paragraph in fresh language, improve or reorder headings where useful, and add stronger examples, patient actions, FAQ detail, and references.
    - Do not keep the same paragraph-by-paragraph structure unless the owner explicitly asks for a tiny edit.
    - Target length: {word_count}. Minimum: {min_words} words.
    - Keep `content` in Markdown.
    - Do not include a top-level H1 inside `content`; the website renders the title separately.
    - Use normal paragraphs for most sections.
    - Include one Markdown table only if it helps the requested edit; do not put a table at the beginning unless the owner asks.
    - Include at most one Markdown blockquote callout.
    - Avoid repeated boxed/callout-style sections.
    - If references exist or the owner asks for references, include a final "## References" section.
    - Use cautious medical language and encourage readers to consult licensed healthcare professionals.
    - Do not invent precise statistics, clinic details, or medical claims without source support.
    {trust_rules}
    {depth_quality_rules}
    {reference_style_rules}
    {visual_contract_rules}
    {guide_structure_rules}
    {guide_generation_rules}
    Image requirements:
    - Provide 3-5 distinct photorealistic editorial photo prompts in `image_prompts`, choosing the count based on the rewritten article depth and section variety.
    - First prompt is for the hero image.
    - Remaining prompts are for inline supporting images tied to different major sections of the rewritten article.
    - Every prompt must describe a realistic healthcare or everyday patient scene with natural light, real people when relevant, believable clinic/home details, and human warmth.
    - Every prompt must include this natural photo style: {NATURAL_PHOTO_STYLE}
    - Do not request illustrations, icons, diagrams, vector art, 3D renderings, cartoons, infographics, posters, text overlays, floating UI, or symbolic/metaphorical scenes.
    - Every prompt must be visually distinct and must say: photorealistic, documentary-style editorial photography, no text, no logos, no watermarks.

    Output ONLY valid JSON in this exact structure:
    {{
      "title": "Updated article title here",
      "excerpt": "Updated short SEO-friendly summary.",
      "content": "Full rewritten markdown content here",
      "category": "{category}",
      "tags": ["Asian Health", "Primary Care"],
      "seo_description": "SEO description under 160 characters",
      "primary_keyword": "primary keyword here",
      "secondary_keywords": ["keyword one", "keyword two"],
      "image_prompts": [
        "Photorealistic hero image prompt for this exact rewritten article, documentary-style editorial photography, no text, no logos, no watermarks",
        "Photorealistic inline supporting image prompt for section one, documentary-style editorial photography, no text, no logos, no watermarks",
        "Photorealistic inline supporting image prompt for section two, documentary-style editorial photography, no text, no logos, no watermarks"
      ]
    }}
    """

def repair_json_text(json_text: str) -> List[str]:
    """Return small, safe repair variants for a truncated JSON object."""
    text = json_text.strip()
    variants = [text]
    variants.append(text.rstrip(","))
    variants.append(f"{text}}}")
    variants.append(f'{text}"}}')
    variants.append(f"{text}]}}")
    variants.append(re.sub(r",\s*([}\]])", r"\1", text))
    return list(dict.fromkeys(variants))

def extract_json_candidates(content: str) -> List[str]:
    """Extract likely JSON snippets from plain text or fenced model output."""
    text = (content or "").strip()
    candidates = re.findall(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)

    object_start = text.find("{")
    if object_start != -1:
        object_end = find_json_object_end(text, object_start)
        if object_end != -1:
            candidates.append(text[object_start:object_end])
        else:
            candidates.append(text[object_start:])

    if text.startswith("{"):
        candidates.append(text)

    return [candidate.strip() for candidate in candidates if candidate.strip()]

def extract_json_payload(content: str) -> dict:
    """Parse model JSON with fenced-block extraction and light auto-repair."""
    for candidate in extract_json_candidates(content):
        for repaired in repair_json_text(candidate):
            try:
                parsed = json.loads(repaired)
            except json.JSONDecodeError:
                try:
                    parsed = json.loads(repaired, strict=False)
                except json.JSONDecodeError:
                    continue
            if isinstance(parsed, dict):
                return parsed

    raise ValueError("Could not parse a valid JSON object from model response.")

def normalize_image_prompts(data: dict) -> List[str]:
    prompts = data.get("image_prompts")
    if isinstance(prompts, list):
        cleaned = [str(prompt).strip() for prompt in prompts if str(prompt).strip()]
    else:
        cleaned = []

    legacy_prompt = str(data.get("image_prompt") or "").strip()
    if legacy_prompt and legacy_prompt not in cleaned:
        cleaned.append(legacy_prompt)

    if not cleaned:
        cleaned.append(
            f"Photorealistic documentary-style editorial healthcare photo for {data.get('title', 'Asian Health Hub article')}, diverse Asian American patients in a believable real-world setting, natural light, {NATURAL_PHOTO_STYLE} no text, no logos, no watermarks"
        )

    fallback_prompts = [
        f"Photorealistic documentary-style editorial photo of an Asian American patient having a culturally sensitive conversation with a clinician in a real clinic exam room, natural window light, {NATURAL_PHOTO_STYLE} no text, no logos, no watermarks",
        f"Photorealistic documentary-style editorial photo of a family reviewing healthcare options together at a kitchen table, realistic home details, warm natural light, {NATURAL_PHOTO_STYLE} no text, no logos, no watermarks",
        f"Photorealistic documentary-style editorial photo of preventive care in a clean modern clinic with diverse Asian American patients and staff, realistic candid moment, {NATURAL_PHOTO_STYLE} no text, no logos, no watermarks",
        f"Photorealistic documentary-style editorial photo focused on patient preparation and confidence before a healthcare visit, believable everyday setting, {NATURAL_PHOTO_STYLE} no text, no logos, no watermarks",
    ]

    for fallback in fallback_prompts:
        if len(cleaned) >= 3:
            break
        cleaned.append(f"{fallback}. Article topic: {data.get('title', 'Asian Health Hub article')}")

    return [enforce_photorealistic_image_prompt(prompt) for prompt in cleaned[:5]]

def enforce_photorealistic_image_prompt(prompt: str) -> str:
    """Normalize model-provided prompts away from illustration and toward credible photo output."""
    text = str(prompt or "").strip()
    replacements = {
        "medical illustration": "medical documentary photograph",
        "healthcare illustration": "healthcare documentary photograph",
        "professional illustration": "professional editorial photograph",
        "detailed illustration": "detailed documentary photograph",
        "illustration": "photograph",
        "illustrated": "photographed",
        "cartoon": "documentary photo",
        "vector": "photo",
        "3D render": "photo",
        "3d render": "photo",
        "rendering": "photograph",
        "infographic": "real scene",
    }
    for old, new in replacements.items():
        text = re.sub(re.escape(old), new, text, flags=re.IGNORECASE)

    required_style = (
        "Photorealistic documentary-style editorial healthcare photography; "
        "real people when relevant, believable clinic or home environment, natural light, authentic human expressions, "
        "subtle natural imperfections, realistic skin texture, candid composition. "
        f"{NATURAL_PHOTO_STYLE}"
    )
    negative_style = (
        "Avoid AI-looking faces, plastic skin, over-smoothed features, exaggerated smiles, staged stock-photo poses, "
        "illustration, cartoon, vector art, 3D render, icons, diagrams, infographics, text overlays, logos, watermarks, "
        "readable signage, extra fingers, distorted hands."
    )

    lowered = text.lower()
    if "photorealistic" not in lowered and "documentary-style" not in lowered:
        text = f"{required_style} Scene: {text}"
    if "avoid ai-looking" not in text.lower():
        text = f"{text}. {negative_style}"
    if "sony a7r iv" not in text.lower():
        text = f"{text}. {NATURAL_PHOTO_STYLE}"
    if "no text" not in text.lower():
        text = f"{text}, no text"
    if "no logos" not in text.lower():
        text = f"{text}, no logos"
    if "no watermarks" not in text.lower():
        text = f"{text}, no watermarks"
    return text

def generate_article_images(client: OpenAI, data: dict, slug: str) -> List[str]:
    """Generate all article images in parallel (max 2 concurrent) to respect rate limits."""
    image_prompts = normalize_image_prompts(data)
    suffixes = ["hero", "inline-1", "inline-2", "inline-3", "inline-4"]
    run_id = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    total = len(image_prompts)
    results: dict[int, str] = {}
    semaphore = threading.Semaphore(2)  # max 2 concurrent image requests
    report_progress(f"🎨 Đang tạo {total} hình ảnh cho bài viết...")

    def generate_one(index: int, prompt: str) -> tuple[int, str]:
        with semaphore:
            print(f"[*] Generating image {index + 1}/{total} via {IMAGE_MODEL} using prompt: {prompt}")
            try:
                image_response = client.chat.completions.create(
                    model=IMAGE_MODEL,
                    messages=[
                        {
                            "role": "user",
                            "content": (
                                "Create a photorealistic documentary-style editorial healthcare photograph for Asian Health Hub. "
                                "The image must look like a credible real photograph, not AI art: natural available light, realistic clinic or home details, "
                                "authentic human expressions, natural skin texture, subtle wrinkles, unretouched candid faces, believable hands, diverse Asian American patients when people are shown, "
                                f"{NATURAL_PHOTO_STYLE} "
                                "accurate healthcare context, no text, no logos, no watermarks, no illustration, no cartoon, no 3D render, no infographic. Topic: "
                                f"{prompt}"
                            ),
                        }
                    ],
                )
                image_value = extract_image_value(image_response.choices[0].message)
                url = save_generated_image(image_value, slug, f"{suffixes[index]}-{run_id}")
                return index, url or ""
            except Exception as exc:
                print(f"[!] Image {index + 1}/{total} failed: {exc}")
                return index, ""

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(generate_one, i, prompt)
            for i, prompt in enumerate(image_prompts)
        ]
        for future in as_completed(futures):
            idx, url = future.result()
            if url:
                results[idx] = url

    # Return in original index order (hero first)
    return [results[i] for i in sorted(results)]

def clean_markdown_supplement(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```", 1)[1]
        if content.startswith("markdown"):
            content = content[len("markdown"):].strip()
        content = content.split("```", 1)[0].strip()
    return strip_assistant_chatter(content)

def strip_assistant_chatter(content: str) -> str:
    """Remove model self-commentary that is not article Markdown."""
    chatter_line_patterns = [
        r"^\s*here(?:'|’)?s\s+(?:the\s+)?(?:rewritten\s+)?section\s+in\s+markdown\s*:?\s*$",
        r"^\s*[\"'“”‘’]*\s*next\s+section\s*:\s*.+[\"'“”‘’]*\s*$",
        r"^\s*[\"'“”‘’]*\(?\s*word\s+count\s*:\s*\d+[\w\s.,-]*\)?[\"'“”‘’]*\s*$",
        r"^\s*this\s+(?:revision|version|section|draft)\s*:?\s*$",
        r"^\s*the\s+content\s+avoids\s+.+$",
        r"^\s*it\s+presents\s+the\s+information\s+.+$",
        r"^\s*let\s+me\s+know\s+.+$",
    ]
    chatter_inline_patterns = [
        r"^\s*this\s+version\s+(?:maintains|keeps|uses|includes|focuses|simplifies|improves)\b.+$",
        r"^\s*this\s+revision\s+(?:maintains|keeps|uses|includes|focuses|simplifies|improves)\b.+$",
    ]

    cleaned_lines: List[str] = []
    skipping_revision_list = False

    for line in (content or "").splitlines():
        stripped = line.strip().strip('"“”')

        if skipping_revision_list:
            if not stripped:
                skipping_revision_list = False
                continue
            if re.match(r"^[-*]\s+", stripped):
                continue
            skipping_revision_list = False

        if any(re.match(pattern, stripped, re.IGNORECASE) for pattern in chatter_line_patterns):
            if re.match(r"^\s*this\s+(?:revision|version|section|draft)\s*:?\s*$", stripped, re.IGNORECASE):
                skipping_revision_list = True
            continue

        if any(re.match(pattern, stripped, re.IGNORECASE) for pattern in chatter_inline_patterns):
            continue

        cleaned_lines.append(line)

    cleaned = "\n".join(cleaned_lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned

def find_json_object_end(text: str, start: int) -> int:
    depth = 0
    in_string = False
    escaped = False

    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index + 1

    return -1

def strip_leaked_json_payloads(content: str) -> str:
    """Remove accidental fenced JSON blobs from Markdown content."""
    return re.sub(
        r"```(?:json)?\s*\{[\s\S]*?\"(?:content|image_prompts)\"[\s\S]*?\}\s*```",
        "",
        content or "",
        flags=re.IGNORECASE,
    )

def normalize_reference_line(line: str) -> str:
    line = line.strip().rstrip()
    line = re.sub(r"^\d+[\.)]\s*", "", line)
    line = line.lstrip("-* ").strip()
    return line.rstrip()

def split_reference_sections(content: str) -> tuple[str, List[str]]:
    lines = content.replace("\\n", "\n").splitlines()
    body_lines: List[str] = []
    references: List[str] = []
    in_references = False

    for line in lines:
        if re.match(r"^##\s+References\s*$", line.strip(), re.IGNORECASE):
            in_references = True
            continue

        if in_references and re.match(r"^##\s+\S+", line.strip()):
            in_references = False
            body_lines.append(line)
            continue

        if in_references:
            reference = normalize_reference_line(line)
            if reference:
                references.append(reference)
            continue

        body_lines.append(line)

    return "\n".join(body_lines).strip(), references

def dedupe_references(references: List[str]) -> List[str]:
    unique = []
    seen = set()

    for reference in references:
        url_match = re.search(r"\]\((https?://[^)]+)\)", reference)
        key = url_match.group(1).rstrip("/").lower() if url_match else re.sub(r"\s+", " ", reference).lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(reference)

    return unique

def remove_inline_table_of_contents(content: str) -> str:
    toc_pattern = re.compile(
        r"(?ims)^#{2,3}\s+Table of Contents\s*\n"
        r"(?:(?:\s*\d+[\.)]\s+\[[^\n]+\]\(#[^)]+\)\s*)|(?:\s*[-*]\s+\[[^\n]+\]\(#[^)]+\)\s*)|\s*)*"
    )
    return toc_pattern.sub("", content, count=1).strip()

def normalize_takeaway_bullet(line: str) -> str:
    text = re.sub(r"^\s*(?:[-*+]\s*)?(?:\[[ xX]\]\s*)?", "", line).strip()
    text = re.sub(r"^\d+[\.)]\s*", "", text).strip()
    return text

def extract_first_sentences(text: str, limit: int = 4) -> List[str]:
    plain = re.sub(r"```[\s\S]*?```", " ", text or "")
    plain = re.sub(r"!\[[^\]]*]\([^)]+\)", " ", plain)
    plain = re.sub(r"\[([^\]]+)]\([^)]+\)", r"\1", plain)
    plain = re.sub(r"^#{2,3}\s+.+$", " ", plain, flags=re.MULTILINE)
    plain = re.sub(r"^\s*(?:[-*+]|\d+[\.)]|\[[ xX]\])\s+", " ", plain, flags=re.MULTILINE)
    plain = re.sub(r"\s+", " ", plain).strip()
    sentences = re.split(r"(?<=[.!?])\s+", plain)
    return [sentence.strip() for sentence in sentences if len(sentence.split()) >= 8][:limit]

def build_fallback_key_takeaways(content: str, metadata: Optional[dict] = None) -> str:
    metadata = metadata or {}
    bullets = extract_first_sentences(str(metadata.get("excerpt") or ""), limit=1)
    bullets.extend(extract_first_sentences(content, limit=4))

    cleaned_bullets: List[str] = []
    seen = set()
    for bullet in bullets:
        bullet = normalize_takeaway_bullet(bullet).rstrip()
        if not bullet:
            continue
        key = normalize_for_similarity(bullet)
        if key in seen:
            continue
        seen.add(key)
        cleaned_bullets.append(bullet)
        if len(cleaned_bullets) >= 4:
            break

    if len(cleaned_bullets) < 3:
        title = str(metadata.get("title") or "this health topic").strip()
        defaults = [
            f"Understand the main care decisions, symptoms, costs, and follow-up questions around {title}.",
            "Use the article as a starting point for a conversation with a licensed clinician, clinic staff, or insurance plan.",
            "Pay attention to language access, family decision-making, and cultural trust issues when planning care.",
        ]
        for default in defaults:
            key = normalize_for_similarity(default)
            if key not in seen:
                seen.add(key)
                cleaned_bullets.append(default)
            if len(cleaned_bullets) >= 3:
                break

    bullet_lines = "\n".join(f"- [x] {bullet}" for bullet in cleaned_bullets[:5])
    return f"## {KEY_TAKEAWAYS_HEADING}\n\n{bullet_lines}"

def ensure_key_takeaways_section(content: str, mode: str = "insight", metadata: Optional[dict] = None) -> str:
    if mode not in {"insight", "guide"}:
        return content

    sections = re.split(r"(?=^##\s+)", (content or "").strip(), flags=re.MULTILINE)
    intro_sections: List[str] = []
    other_sections: List[str] = []
    takeaway_section = ""

    for section in sections:
        stripped = section.strip()
        if not stripped:
            continue
        heading_match = re.match(r"^##\s+(.+?)\s*$", stripped, flags=re.MULTILINE)
        if heading_match and is_key_takeaways_heading(heading_match.group(1)):
            takeaway_lines = []
            for line in stripped.splitlines()[1:]:
                bullet = normalize_takeaway_bullet(line)
                if bullet:
                    takeaway_lines.append(f"- [x] {bullet}")
            if takeaway_lines:
                takeaway_section = f"## {KEY_TAKEAWAYS_HEADING}\n\n" + "\n".join(takeaway_lines[:5])
            continue
        if heading_match:
            other_sections.append(stripped)
        else:
            intro_sections.append(stripped)

    if not takeaway_section:
        takeaway_section = build_fallback_key_takeaways(content, metadata)

    ordered_sections = [takeaway_section] + intro_sections + other_sections
    return "\n\n".join(section for section in ordered_sections if section).strip()

def clean_generated_article_content(content: str, mode: str = "insight") -> str:
    cleaned = strip_assistant_chatter(strip_leaked_json_payloads(content or ""))
    body, references = split_reference_sections(cleaned)
    references = dedupe_references(references)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()

    if mode == "guide":
        body = remove_inline_table_of_contents(body)

    if references:
        formatted_references = "\n".join(
            f"{index}. {reference}" for index, reference in enumerate(references, start=1)
        )
        body = f"{body}\n\n## References\n\n{formatted_references}".strip()

    return body

def build_similarity_retry_prompt(
    article: dict,
    instruction: str,
    mode: str,
    similarity: float,
    attempt: int,
    previous_error: str = "",
) -> str:
    target = CONTENT_WORD_TARGETS.get(mode, CONTENT_WORD_TARGETS["insight"])
    trust_rules = build_trust_and_culture_rules(mode)
    depth_quality_rules = build_authoritative_depth_rules(mode)
    reference_style_rules = build_reference_style_rules()
    visual_contract_rules = build_article_visual_contract(mode)
    guide_structure_rules = build_guide_structure_rules(mode)
    existing_content = str(article.get("content") or "")
    current_headings = extract_markdown_headings(existing_content)
    previous_error_note = f"\n    Previous retry problem to avoid: {previous_error}\n" if previous_error else ""

    return f"""
    The previous rewrite is too similar to the existing article and cannot be published as a new version.
    Similarity score: {similarity:.2%}
    Material rewrite retry: {attempt}/{MAX_REWRITE_SIMILARITY_RETRIES}
    {previous_error_note}

    Owner rewrite instruction:
    {instruction}

    Current article metadata:
    - Title: {article.get("title")}
    - Excerpt: {article.get("excerpt")}
    - Category: {article.get("category")}
    - Tags: {json.dumps(article.get("tags") or [], ensure_ascii=False)}

    Current H2/H3 outline to improve, not copy:
    {json.dumps(current_headings, ensure_ascii=False, indent=2)}

    Current article content for factual context only. Do not copy the structure or paragraph wording:
    {existing_content[:16000]}

    Rewrite again with a materially different editorial version while preserving accurate facts and the same general topic.

    Requirements:
    - Keep the same JSON schema.
    - `content` must be {target["label"]}; never below {target["min"]} words.
    - For guide mode, write at least 10 substantial H2 sections plus FAQ and Next Steps.
    - Make the article visibly different in version comparison.
    - Write a new opening and conclusion.
    - Rewrite every paragraph in fresh language.
    - Improve the H2/H3 structure; reorder sections when it improves SEO and reader flow.
    - Add deeper patient-facing examples, decision points, FAQ answers, next steps, and culturally specific guidance where relevant.
    - Do not reuse long phrases or the same paragraph-by-paragraph structure from the existing article.
    - Do not summarize the article into a short draft.
    - Keep `content` in Markdown and do not include a top-level H1.
    - Provide 3-5 distinct image prompts.
    {trust_rules}
    {depth_quality_rules}
    {reference_style_rules}
    {visual_contract_rules}
    {guide_structure_rules}

    Output ONLY valid JSON.
    """

def ensure_rewrite_changes_article(
    client: OpenAI,
    article: dict,
    data: dict,
    instruction: str,
    mode: str,
) -> dict:
    if not should_enforce_material_rewrite(instruction):
        print("[*] Material rewrite similarity guard skipped for specific edit instruction.")
        return data

    existing_content = str(article.get("content") or "")
    last_retry_error = ""

    for attempt in range(0, MAX_REWRITE_SIMILARITY_RETRIES + 1):
        rewritten_content = str(data.get("content") or "")
        similarity = content_similarity(existing_content, rewritten_content)
        print(f"[*] Rewrite similarity vs existing content after attempt {attempt}: {similarity:.2%}")

        if similarity < REWRITE_SIMILARITY_THRESHOLD:
            return data

        if attempt >= MAX_REWRITE_SIMILARITY_RETRIES:
            break

        print(
            "[*] Rewrite is too similar to the current article. "
            f"Retrying with stricter material-change prompt ({attempt + 1}/{MAX_REWRITE_SIMILARITY_RETRIES})..."
        )
        retry_prompt = build_similarity_retry_prompt(
            article,
            instruction,
            mode,
            similarity,
            attempt + 1,
            last_retry_error,
        )
        try:
            candidate = generate_chunked_article_data(
                client,
                retry_prompt,
                article.get("title") or "rewrite",
                mode,
                article=article,
                instruction=instruction,
            )
            data = candidate
            last_retry_error = ""
        except ValueError as exc:
            last_retry_error = str(exc)
            print(f"[!] Material rewrite retry produced an invalid draft: {last_retry_error}")
            continue

    final_similarity = content_similarity(existing_content, str(data.get("content") or ""))
    raise ValueError(
        "Rewrite is still too similar to the existing article "
        f"({final_similarity:.2%} similarity; threshold is {REWRITE_SIMILARITY_THRESHOLD:.0%}). "
        "Not publishing a new version because readers would not be able to compare meaningful changes."
    )

def call_text_model(client: OpenAI, prompt: str, temperature: float, max_tokens: int) -> str:
    """Call the text model and return message content."""
    response = client.chat.completions.create(
        model=TEXT_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return (response.choices[0].message.content or "").strip()


def generate_section_with_retries(
    client: OpenAI,
    section_prompt: str,
    heading: str,
    mode: str,
    max_retries: int = 2,
) -> str:
    """Call the text model for one section, retrying on transient errors.

    Raises RuntimeError if all attempts fail — caller should let the job
    fail rather than publishing an article with a missing section.
    """
    last_error: Optional[Exception] = None
    max_tokens = 3200 if mode == "guide" else 2200

    for attempt in range(1, max_retries + 2):
        try:
            section = call_text_model(client, section_prompt, SECTION_TEMPERATURE, max_tokens)
            return clean_markdown_supplement(section)
        except Exception as exc:
            last_error = exc
            print(f"[!] Section '{heading}' attempt {attempt}/{max_retries + 1} failed: {exc}")
            if attempt <= max_retries:
                time.sleep(3 * attempt)

    raise RuntimeError(
        f"Section '{heading}' failed after {max_retries + 1} attempts: {last_error}"
    )

def normalize_outline(raw_outline: Any, mode: str) -> List[str]:
    """Coerce an LLM outline into a clean list of H2 heading names."""
    if isinstance(raw_outline, list):
        items = raw_outline
    elif isinstance(raw_outline, str):
        items = raw_outline.splitlines()
    else:
        items = []

    headings: List[str] = []
    seen = set()
    for item in items:
        if isinstance(item, dict):
            heading = str(item.get("heading") or item.get("title") or "").strip()
        else:
            heading = str(item).strip()
        heading = re.sub(r"^#+\s*", "", heading)
        heading = re.sub(r"^\d+[\.)]\s*", "", heading).strip()
        if not heading:
            continue
        key = heading.lower()
        if key in seen:
            continue
        seen.add(key)
        headings.append(heading)

    # Clean out duplicate-prone headings from headings first
    headings = [
        heading
        for heading in headings
        if not is_key_takeaways_heading(heading)
        and not is_faq_heading(heading)
        and not is_references_heading(heading)
        and not is_next_steps_heading(heading)
    ]

    if mode == "guide":
        fallback_headings = [
            "What This Healthcare Topic Means",
            "Why It Matters for Asian American Families",
            "Common Barriers and Decision Points",
            "Insurance, Cost, and Scheduling Questions",
            "Language Access and Communication Support",
            "Cultural Trust and Family Decision-Making",
            "What to Ask Your Clinician",
            "Prevention, Follow-Up, and When to Seek Care",
            "Comparison of Care Options",
        ]
        for heading in fallback_headings:
            if len(headings) >= 10:
                break
            normalized_fallback = clean_reference_search_label(heading, max_len=80).lower()
            if not any(clean_reference_search_label(h, max_len=80).lower() == normalized_fallback for h in headings):
                headings.append(heading)
        return [KEY_TAKEAWAYS_HEADING] + headings[:10] + ["FAQs", "Next Steps", "References"]

    # Insight mode: limit to 5 regular headings to keep word count targeted (1200-1500 words)
    return [KEY_TAKEAWAYS_HEADING] + headings[:5] + ["FAQs", "References"]

def build_metadata_outline_prompt(
    writing_brief: str,
    label: str,
    mode: str,
    article: Optional[dict] = None,
    instruction: str = "",
) -> str:
    """Build the Step 1 prompt for metadata and H2 outline only."""
    is_guide = mode == "guide"
    category = "guide" if is_guide else "insight"
    target = CONTENT_WORD_TARGETS[category]
    outline_count = "8-10" if is_guide else "5-7"
    visual_contract_rules = build_article_visual_contract(mode)
    rewrite_context = ""
    if article:
        rewrite_context = f"""
        Existing article for rewrite:
        - Title: {article.get("title")}
        - Excerpt: {article.get("excerpt")}
        - Category: {article.get("category")}
        - Tags: {json.dumps(article.get("tags") or [], ensure_ascii=False)}
        - Current H2/H3 outline: {json.dumps(extract_markdown_headings(article.get("content") or "", 24), ensure_ascii=False)}
        - Owner instruction: {instruction}
        """

    return f"""
    You are planning an Asian Health Hub {'SEO pillar guide' if is_guide else 'SEO healthcare insight article'}.
    Step 1 only: return metadata and an H2 outline. Do NOT write article body content.

    Label/topic:
    {label}

    Writing brief:
    {writing_brief[:18000]}

    {rewrite_context}

    Requirements:
    - If the writing brief contains older output-format instructions, ignore them. This Step 1 must output metadata and outline only.
    - Output ONLY valid JSON.
    - Do not include `content`.
    - The `outline` must be a list of H2 heading strings, without leading ##.
    - Use {outline_count} substantive H2 headings before References.
    - For guide mode, make the first outline item exactly "Key Takeaways", then include "FAQs", "Next Steps", and "References" as final outline items.
    - For insight mode, make the first outline item exactly "Key Takeaways", then include "FAQs" and "References" near the end.
    - Follow this frontend visual contract when choosing section headings:
    {visual_contract_rules}
    - Choose one primary keyword and 4-7 secondary keywords.
    - Write medically cautious, SEO-friendly metadata for Asian American patients and families.
    - Provide 3-5 distinct image prompts. Every prompt must say no text, no logos, no watermarks.
    - Every image prompt must include this natural photo style: {NATURAL_PHOTO_STYLE}

    JSON schema:
    {{
      "title": "Specific article title here",
      "excerpt": "Short SEO-friendly summary.",
      "category": "{category}",
      "tags": ["Asian Health", "Primary Care"],
      "seo_description": "SEO description under 160 characters",
      "primary_keyword": "primary keyword here",
      "secondary_keywords": ["keyword one", "keyword two"],
      "image_prompts": [
        "Hero image prompt, no text, no logos, no watermarks",
        "Inline image prompt, no text, no logos, no watermarks",
        "Inline image prompt, no text, no logos, no watermarks"
      ],
      "outline": [
        "First H2 heading",
        "Second H2 heading"
      ]
    }}

    Target final article length after section generation: {target["label"]}.
    """

def build_section_prompt(
    metadata: dict,
    outline: List[str],
    heading: str,
    index: int,
    writing_brief: str,
    mode: str,
    article: Optional[dict] = None,
    instruction: str = "",
) -> str:
    """Build the Step 2 prompt for one Markdown section."""
    is_takeaways = is_key_takeaways_heading(heading)
    is_first_body_section = index == 0 or (
        index == 1 and bool(outline) and is_key_takeaways_heading(outline[0])
    )
    is_guide = mode == "guide"
    
    if is_takeaways:
        per_section_words = "90-120"
    elif heading.lower() == "references":
        per_section_words = "80-120"
    elif heading.lower() in {"faqs", "next steps"}:
        per_section_words = "220-280" if is_guide else "140-180"
    else:
        per_section_words = "220-280" if is_guide else "140-180"
        
    visual_contract_rules = build_article_visual_contract(mode)

    rewrite_context = ""
    if article:
        rewrite_context = f"""
        Existing article context for factual continuity. Rewrite in fresh language and do not copy paragraphs:
        {str(article.get("content") or "")[:14000]}

        Owner rewrite instruction:
        {instruction}
        """

    first_section_rule = (
        "- Because this is the first section, start with 2 short opening paragraphs before the H2 heading.\n"
        if is_first_body_section and not is_takeaways
        else ""
    )
    key_takeaways_rule = (
        "- This is the opening summary section. Start directly with `## Key Takeaways`, then write 3-5 concise checked checklist bullets using `- [x]`. Each bullet should summarize a main patient-facing point from the article in one sentence. Do not add intro paragraphs before this heading.\n"
        if is_takeaways
        else ""
    )

    max_words_cap = per_section_words.split("-")[1]

    return f"""
    Write ONLY Markdown for one section of an Asian Health Hub article.
    Do not return JSON. Do not include a top-level H1.
    Return publishable article text only. Do not include analysis, notes, summaries, revision explanations, transition labels, "Next section", "Here is the section", word counts, or "let me know" text.
    Forbidden output examples: "(Word count: 298)", "Next section: ...", "Here's the rewritten section in Markdown:", "This revision:", "This version maintains...", "Let me know if..."

    Article metadata:
    {json.dumps({k: metadata.get(k) for k in ["title", "excerpt", "primary_keyword", "secondary_keywords", "category"]}, ensure_ascii=False)}

    Full H2 outline:
    {json.dumps(outline, ensure_ascii=False, indent=2)}

    Current section: {index + 1}/{len(outline)}
    H2 heading to write: {heading}

    Writing brief:
    {writing_brief[:12000]}

    {rewrite_context}

    Requirements:
    - If the writing brief contains older output-format instructions, ignore them. This Step 2 must output Markdown only.
    - Your entire response must be the article section itself. No preface and no afterword.
    - Start directly with the intro paragraph or `## {heading}`. End directly after the final article sentence/list item/reference.
    {first_section_rule}
    {key_takeaways_rule}
    - Include the section heading exactly as `## {heading}` unless it is preceded by the first-section intro paragraphs.
    - Write exactly {per_section_words} words for this section. Do NOT exceed {max_words_cap} words. Keep content extremely concise, dense, and avoid fluff.
    - Use medically cautious language; avoid unsupported claims and fabricated statistics.
    - Make advice practical for Asian American patients and families in the U.S.
    - Include culturally specific context when relevant, without stereotyping.
    - If this is "FAQs", include 4-6 H3 questions with concise answers.
    - If this is "Next Steps", include a practical checklist.
    - If this is "References", use a numbered Markdown citation list with credible source names and links when supported by the brief.
    - Follow this frontend visual contract for Markdown block types and stable headings:
    {visual_contract_rules}
    - Do not repeat previous outline sections. Stay focused on this heading.
    """

def generate_chunked_article_data(
    client: OpenAI,
    writing_brief: str,
    label: str,
    mode: str,
    article: Optional[dict] = None,
    instruction: str = "",
) -> dict:
    """Generate article metadata first, then section Markdown from the outline."""
    metadata, outline = generate_article_metadata_outline(client, writing_brief, label, mode, article, instruction)
    return generate_article_sections_data(client, writing_brief, metadata, outline, mode, article, instruction)

def generate_article_metadata_outline(
    client: OpenAI,
    writing_brief: str,
    label: str,
    mode: str,
    article: Optional[dict] = None,
    instruction: str = "",
) -> tuple[dict, List[str]]:
    """Generate article metadata and outline without reference evidence side effects."""
    print("[*] Step 1/2: Generating metadata and outline...")
    metadata_prompt = build_metadata_outline_prompt(writing_brief, label, mode, article, instruction)
    metadata_text = call_text_model(client, metadata_prompt, JSON_TEMPERATURE, 3200)
    metadata = extract_json_payload(metadata_text)
    outline = normalize_outline(metadata.get("outline"), mode)
    if not outline:
        raise ValueError("Generated outline is empty; cannot build article content.")

    fallback_title = str(label or "Asian Health Hub Article").strip()
    metadata["title"] = str(metadata.get("title") or fallback_title).strip()
    metadata["excerpt"] = str(metadata.get("excerpt") or metadata["title"]).strip()
    metadata["category"] = "guide" if mode == "guide" else metadata.get("category") or "insight"
    if isinstance(metadata.get("tags"), list):
        metadata["tags"] = [str(tag).strip() for tag in metadata["tags"] if str(tag).strip()]
    else:
        metadata["tags"] = ["Asian Health"]
    metadata["seo_description"] = str(metadata.get("seo_description") or metadata["excerpt"])[:160]
    metadata["primary_keyword"] = str(metadata.get("primary_keyword") or metadata["title"]).strip()
    if isinstance(metadata.get("secondary_keywords"), list):
        metadata["secondary_keywords"] = [
            str(keyword).strip()
            for keyword in metadata["secondary_keywords"]
            if str(keyword).strip()
        ]
    else:
        metadata["secondary_keywords"] = []
    metadata["image_prompts"] = normalize_image_prompts(metadata)
    print(f"[*] Metadata ready: {metadata['title']}")
    print(f"[*] Outline ready: {len(outline)} sections")
    return metadata, outline

def generate_article_sections_data(
    client: OpenAI,
    writing_brief: str,
    metadata: dict,
    outline: List[str],
    mode: str,
    article: Optional[dict] = None,
    instruction: str = "",
) -> dict:
    """Generate section Markdown using prepared metadata, outline, and writing brief."""
    total = len(outline)
    print(f"[*] Step 2/2: Generating {total} Markdown sections...")
    sections: List[str] = []
    for index, heading in enumerate(outline):
        print(f"[*] Generating section {index + 1}/{total}: {heading}")
        # Send a progress ping to Telegram every 3 sections
        if index > 0 and index % 3 == 0:
            report_progress(f"⏳ Đang viết bài... ({index}/{total} sections xong)")
        section_prompt = build_section_prompt(metadata, outline, heading, index, writing_brief, mode, article, instruction)
        section = generate_section_with_retries(client, section_prompt, heading, mode)
        sections.append(section)

    metadata["outline"] = outline
    metadata["content"] = clean_generated_article_content("\n\n".join(sections), mode)
    metadata["content"] = ensure_key_takeaways_section(metadata["content"], mode, metadata)
    word_count = count_markdown_words(metadata["content"])
    print(f"[*] Chunked article word count: {word_count}")
    print("[*] Article content assembled.")
    return metadata

def create_article_from_prompt(
    client: OpenAI,
    supabase: Client,
    prompt: str,
    label: str,
    mode: str = "insight",
    seed_urls: Optional[List[str]] = None,
    reference_query_label: Optional[str] = None,
):
    print("[*] Generating article content via Deepseek...")
    print(f"[*] Input: {label}")
    print(f"[*] Content mode: {mode}")

    try:
        metadata, outline = generate_article_metadata_outline(client, prompt, label, mode)
        evidence_label = build_reference_query_label_from_metadata(
            metadata,
            reference_query_label or label,
        )
        print(f"[*] Reference search label: {evidence_label}")
        evidence = gather_reference_evidence(client, evidence_label, mode, seed_urls=seed_urls)
        verified_prompt = add_reference_evidence_to_prompt(prompt, evidence)
        data = generate_article_sections_data(client, verified_prompt, metadata, outline, mode)
        data["content"] = enforce_verified_references(data["content"], evidence)
        
        base_slug = generate_slug(data["title"])
        slug = make_unique_slug(supabase, base_slug)
        if slug != base_slug:
            print(f"[*] Slug already existed. Using unique slug: {slug}")

        print("[*] Generating article images...")
        image_urls = generate_article_images(client, data, slug)
        print(f"[*] Article images ready: {len(image_urls)}")
        
        seo_meta = {
            "description": data["seo_description"],
            "keywords": data["tags"],
            "primary_keyword": data.get("primary_keyword"),
            "secondary_keywords": data.get("secondary_keywords", []),
            "content_mode": mode,
            "current_version": 1,
            "version_label": "v1",
            ARTICLE_VERSIONS_KEY: [],
        }
        if image_urls:
            seo_meta["og_image"] = image_urls[0]
            seo_meta["images"] = image_urls

        article_payload = {
            "title": data["title"],
            "slug": slug,
            "excerpt": data["excerpt"],
            "content": data["content"],
            "category": data["category"],
            "tags": data["tags"],
            "status": "published",
            "author": "Asian Health Hub Medical Team",
            "published_at": iso_now(),
            "seo_meta": seo_meta
        }

        print(f"[*] Publishing article to Supabase: {data['title']}")
        res = supabase.table("articles").insert(article_payload).execute()
        print(f"[+] Article published successfully: /insights/{slug}")

    except Exception as e:
        print(f"[!] Error: {e}")

def rewrite_article(identifier: str, instruction: str) -> None:
    from admin_actions import find_one_by_identifier

    identifier = identifier.strip()
    instruction = instruction.strip()
    if not identifier:
        print("[!] Missing article id, slug, or title for rewrite.")
        return
    if not instruction:
        print("[!] Missing rewrite instruction.")
        return

    client, supabase = create_clients()
    article = find_one_by_identifier(supabase, "articles", identifier)
    if not article:
        print(f"[!] Article not found: {identifier}")
        return

    seo_meta = article.get("seo_meta") or {}
    mode = seo_meta.get("content_mode") or article.get("category") or "insight"
    mode = "guide" if mode == "guide" else "insight"
    old_words = count_markdown_words(article.get("content") or "")

    print(f"[*] Rewriting article: {article.get('title')}")
    print(f"[*] Slug preserved: {article.get('slug')}")
    print(f"[*] Rewrite instruction: {instruction}")
    print(f"[*] Existing word count: {old_words}")

    prompt = build_rewrite_prompt(article, instruction, mode=mode)
    seed_reference_urls = extract_reference_urls_from_content(article.get("content") or "")
    seed_reference_urls.extend(re.findall(r"https?://\S+", instruction))
    evidence = gather_reference_evidence(
        client,
        build_rewrite_reference_label(article),
        mode,
        seed_urls=seed_reference_urls,
    )
    verified_prompt = add_reference_evidence_to_prompt(prompt, evidence)
    data = generate_chunked_article_data(
        client,
        verified_prompt,
        article.get("title") or identifier,
        mode,
        article=article,
        instruction=instruction,
    )
    data = ensure_rewrite_changes_article(client, article, data, instruction, mode)
    data["content"] = enforce_verified_references(data["content"], evidence)
    new_words = count_markdown_words(data.get("content") or "")

    image_urls = []
    if should_skip_image_generation(instruction):
        print("[*] Rewrite image generation skipped by instruction; keeping existing article images.")
    else:
        try:
            image_urls = generate_article_images(client, data, article.get("slug") or generate_slug(data.get("title") or article.get("title") or "article"))
        except Exception as exc:
            print(f"[!] Could not generate rewrite images; keeping existing article images: {exc}")

    rewritten_at = iso_now()
    updated_seo_meta = build_rewrite_version_meta(article, data, mode, instruction, rewritten_at)
    if image_urls:
        updated_seo_meta["og_image"] = image_urls[0]
        updated_seo_meta["images"] = image_urls

    supabase.table("articles").update(
        {
            "title": data.get("title") or article.get("title"),
            "excerpt": data.get("excerpt") or article.get("excerpt"),
            "content": data["content"],
            "category": data.get("category") or article.get("category"),
            "tags": data.get("tags") or article.get("tags") or [],
            "seo_meta": updated_seo_meta,
            "updated_at": rewritten_at,
        }
    ).eq("id", article["id"]).execute()

    print(f"[+] Article rewritten successfully: /insights/{article.get('slug')}")
    print(f"[*] Version saved: v{updated_seo_meta['current_version']}")
    print(f"[*] Previous versions available in seo_meta.{ARTICLE_VERSIONS_KEY}: {len(updated_seo_meta[ARTICLE_VERSIONS_KEY])}")
    if image_urls:
        print(f"[*] Generated rewrite images: {len(image_urls)}")
    print(f"[*] Word count: {old_words} -> {new_words}")

def is_valid_source_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)

def normalize_reference_url(url: str) -> str:
    parsed = urlparse(url or "")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""

    path = re.sub(r"/+$", "", parsed.path or "")
    return f"{parsed.netloc.lower().removeprefix('www.')}{path}".lower()

def trusted_source_for_url(url: str) -> Optional[dict]:
    parsed_host = urlparse(url or "").netloc.lower().removeprefix("www.")
    if not parsed_host:
        return None

    for source in TRUSTED_HEALTH_SOURCES:
        domain = source["domain"].lower().removeprefix("www.")
        if parsed_host == domain or parsed_host.endswith(f".{domain}"):
            return source
    return None

def reference_source_key(url: str) -> str:
    source = trusted_source_for_url(url)
    if source:
        return source["domain"].lower().removeprefix("www.")
    return urlparse(url or "").netloc.lower().removeprefix("www.")

def is_supported_reference_url(url: str) -> bool:
    parsed = urlparse(url or "")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False

    path = parsed.path.lower()
    return not path.endswith((".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip"))

def clean_reference_search_label(label: str, max_len: int = 80) -> str:
    label = re.sub(r"https?://\S+", " ", label or "")
    label = re.sub(r"[^a-zA-Z0-9\s,/-]", " ", label)
    label = re.sub(r"\s+", " ", label).strip()
    return label[:max_len] or "Asian American healthcare"

def build_core_reference_search_label(label: str) -> str:
    core = clean_reference_search_label(label, max_len=100)
    removable_phrases = [
        "Asian American",
        "Asian Americans",
        "Vietnamese American",
        "Vietnamese Americans",
        "Korean American",
        "Korean Americans",
        "culturally adapted",
        "culturally tailored",
        "for Asian Americans",
        "for Asian American patients",
    ]
    for phrase in removable_phrases:
        core = re.sub(rf"\b{re.escape(phrase)}\b", " ", core, flags=re.IGNORECASE)
    core = re.sub(r"\s+", " ", core).strip(" ,-")
    return clean_reference_search_label(core or label, max_len=80)

def build_reference_query_label_from_metadata(metadata: dict, fallback_label: str = "") -> str:
    pk = metadata.get("primary_keyword")
    if pk and len(pk.strip()) > 3:
        label = pk.strip()
    else:
        label = metadata.get("title") or fallback_label or "Asian American healthcare"
    return clean_reference_search_label(label, max_len=80)

def build_reference_search_queries(label: str, mode: str = "insight") -> List[str]:
    safe_label = clean_reference_search_label(label, max_len=80)
    core_label = build_core_reference_search_label(safe_label)
    prioritized_sources = get_prioritized_sources(f"{safe_label} {core_label}")
    
    queries = []
    
    # 1. Fallback broad queries without site: (we filter URLs in gather_reference_evidence)
    queries.append(f"{safe_label}")
    queries.append(f"{safe_label} Asian American health")
    if core_label != safe_label:
        queries.append(f"{core_label}")
        queries.append(f"{core_label} guidelines")
    
    # 2. Targeted site: queries with prioritized domains first
    for source in prioritized_sources[:6]:
        queries.append(f"{safe_label} site:{source['domain']}")
        if core_label != safe_label:
            queries.append(f"{core_label} site:{source['domain']}")
    for source in prioritized_sources[:6]:
        queries.append(f"{safe_label} health site:{source['domain']}")
    for source in prioritized_sources[6:]:
        queries.append(f"{safe_label} site:{source['domain']}")
        
    # Deduplicate queries while preserving order
    seen_queries = set()
    deduped_queries = []
    for q in queries:
        q_clean = q.strip()
        if q_clean and q_clean not in seen_queries:
            seen_queries.add(q_clean)
            deduped_queries.append(q_clean)
            
    return deduped_queries

def fetch_reference_text_fast(url: str) -> Optional[dict]:
    try:
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        with urllib.request.urlopen(request, timeout=25) as response:
            content_type = response.headers.get("content-type", "").lower()
            if "pdf" in content_type or "html" not in content_type:
                return None
            html = response.read().decode("utf-8", errors="ignore")
    except Exception:
        return None

    try:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")
        title = soup.find("title")
        for element in soup(["script", "style", "nav", "footer", "header", "noscript", "iframe", "svg"]):
            element.decompose()
        text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True)).strip()
        return {
            "title": title.get_text(" ", strip=True) if title else "",
            "text": text,
        }
    except Exception:
        return None

def scrape_reference_url(url: str, title: str = "", source_name: str = "") -> Optional[dict]:
    if not is_valid_source_url(url):
        return None
    if not is_supported_reference_url(url):
        print(f"[!] Reference source skipped because file type is not supported for citation scraping: {url}")
        return None

    trusted_source = trusted_source_for_url(url)
    source_name = source_name or (trusted_source or {}).get("name") or urlparse(url).netloc

    fast_result = fetch_reference_text_fast(url)
    if fast_result and len(fast_result.get("text") or "") >= 500:
        text = fast_result["text"]
        title = title or fast_result.get("title") or ""
    else:
        try:
            from scraper import scrape_content_from_url

            scraped = scrape_content_from_url(url)
        except Exception as exc:
            print(f"[!] Could not scrape reference source {url}: {exc}")
            return None

        text = re.sub(r"\s+", " ", scraped.get("text") or "").strip()

    if len(text) < 500:
        print(f"[!] Reference source skipped because extracted text is too short: {url}")
        return None

    return {
        "title": title or source_name,
        "url": url,
        "source_name": source_name,
        "domain": urlparse(url).netloc.lower().removeprefix("www."),
        "text": text[:REFERENCE_TEXT_CHAR_LIMIT],
    }

def gather_reference_evidence(
    client: OpenAI,
    label: str,
    mode: str = "insight",
    seed_urls: Optional[List[str]] = None,
) -> List[dict]:
    print("[*] Gathering verified reference evidence from trusted sources...")
    evidence: List[dict] = []
    seen_urls = set()
    domain_counts: Dict[str, int] = {}

    for seed_url in seed_urls or []:
        seed_url = seed_url.strip().rstrip(").,;]\"'")
        if not seed_url or seed_url in seen_urls:
            continue
        domain = reference_source_key(seed_url)
        if domain_counts.get(domain, 0) >= REFERENCE_MAX_PER_DOMAIN:
            continue
        seen_urls.add(seed_url)
        source = trusted_source_for_url(seed_url)
        scraped = scrape_reference_url(seed_url, source_name=(source or {}).get("name") or "Provided source")
        if scraped:
            evidence.append(scraped)
            domain_counts[domain] = domain_counts.get(domain, 0) + 1

    for direct_url in get_direct_reference_urls(label):
        if len(evidence) >= REFERENCE_EVIDENCE_TARGET:
            break
        if direct_url in seen_urls:
            continue
        domain = reference_source_key(direct_url)
        if domain_counts.get(domain, 0) >= REFERENCE_MAX_PER_DOMAIN:
            continue
        seen_urls.add(direct_url)
        source = trusted_source_for_url(direct_url)
        scraped = scrape_reference_url(
            direct_url,
            source_name=(source or {}).get("name") or "Direct trusted source",
        )
        if scraped:
            evidence.append(scraped)
            domain_counts[domain] = domain_counts.get(domain, 0) + 1

    if len(evidence) >= REFERENCE_EVIDENCE_TARGET:
        return evidence[:REFERENCE_EVIDENCE_TARGET]

    try:
        from research_agents import search_web
    except Exception as exc:
        print(f"[!] Reference search unavailable; continuing with provided sources only: {exc}")
        return evidence

    consecutive_empty = 0
    max_consecutive_empty = int(os.environ.get("OPENCLAW_REFERENCE_MAX_CONSECUTIVE_EMPTY", "6"))

    for query in build_reference_search_queries(label, mode):
        if len(evidence) >= REFERENCE_EVIDENCE_TARGET:
            break

        if consecutive_empty >= max_consecutive_empty:
            print(
                f"[*] Reference search early-stopped after {consecutive_empty} "
                "consecutive queries yielded no scrapable sources."
            )
            break

        results = search_web(query, max_results=REFERENCE_SEARCH_MAX_RESULTS)
        scraped_this_round = 0
        for result in results:
            if len(evidence) >= REFERENCE_EVIDENCE_TARGET:
                break

            url = result.get("url") or ""
            if url in seen_urls or not trusted_source_for_url(url) or not is_supported_reference_url(url):
                continue

            domain = reference_source_key(url)
            if domain_counts.get(domain, 0) >= REFERENCE_MAX_PER_DOMAIN:
                continue

            seen_urls.add(url)
            source = trusted_source_for_url(url)
            scraped = scrape_reference_url(
                url,
                title=result.get("title") or "",
                source_name=(source or {}).get("name") or "",
            )
            if scraped:
                evidence.append(scraped)
                scraped_domain = reference_source_key(scraped.get("url") or url)
                domain_counts[scraped_domain] = domain_counts.get(scraped_domain, 0) + 1
                scraped_this_round += 1

        if scraped_this_round == 0:
            consecutive_empty += 1
        else:
            consecutive_empty = 0

    if len(evidence) < REFERENCE_EVIDENCE_MINIMUM:
        print(
            "[!] Verified reference evidence below requested minimum: "
            f"{len(evidence)}/{REFERENCE_EVIDENCE_MINIMUM}. Continuing without fabricated citations."
        )
    else:
        print(f"[*] Verified reference evidence ready: {len(evidence)} sources")
    return evidence[:REFERENCE_EVIDENCE_TARGET]

def format_reference_evidence(evidence: List[dict]) -> str:
    if not evidence:
        return """
Verified reference evidence:
- No verified web sources were collected. Do not fabricate URLs, titles, years, or citations. If references are needed, mention source organizations in prose without adding fake links.
""".strip()

    blocks = []
    for index, source in enumerate(evidence, start=1):
        blocks.append(
            "\n".join(
                [
                    f"Source {index}: {source.get('source_name') or source.get('domain')}",
                    f"Title: {source.get('title') or source.get('source_name')}",
                    f"URL: {source.get('url')}",
                    "Extracted content:",
                    str(source.get("text") or "")[:REFERENCE_TEXT_CHAR_LIMIT],
                ]
            )
        )

    return (
        "Verified reference evidence. Use only these sources for factual citations and the final References section. "
        "Do not cite any URL, title, year, organization, study, or statistic that is not supported here.\n\n"
        + "\n\n---\n\n".join(blocks)
    )

def add_reference_evidence_to_prompt(prompt: str, evidence: List[dict]) -> str:
    return f"{prompt.strip()}\n\n{format_reference_evidence(evidence)}\n"

def build_verified_reference_line(source: dict) -> str:
    source_name = source.get("source_name") or source.get("domain") or "Verified source"
    title = str(source.get("title") or source_name).strip()
    url = source.get("url") or ""
    return f'{source_name}. "{title}." [{source_name}]({url})'

def enforce_verified_references(content: str, evidence: List[dict]) -> str:
    if not evidence:
        body, _references = split_reference_sections(content)
        return body.strip()

    body, _references = split_reference_sections(content)
    verified_references: List[str] = []
    seen = set()
    for source in evidence:
        reference = build_verified_reference_line(source)
        key = normalize_reference_url(source.get("url") or "") or normalize_for_similarity(reference)
        if not key or key in seen:
            continue
        seen.add(key)
        verified_references.append(reference)

    formatted_references = "\n".join(
        f"{index}. {reference}" for index, reference in enumerate(verified_references, start=1)
    )
    return f"{body.strip()}\n\n## References\n\n{formatted_references}".strip()

def create_article_from_url(source_url: str):
    create_article_from_url_with_mode(source_url, mode="insight")

def create_guide_from_url(source_url: str):
    create_article_from_url_with_mode(source_url, mode="guide")

def create_article_from_context(reference_text: str, instruction: str, reference_label: str = "Telegram memory", mode: str = "insight"):
    reference_text = reference_text.strip()
    instruction = instruction.strip()
    if not reference_text:
        print("[!] Missing reference context for article generation.")
        return

    client, supabase = create_clients()
    prompt = build_context_prompt(reference_label, reference_text, instruction, mode=mode)
    seed_urls = re.findall(r"https?://\S+", reference_text)
    create_article_from_prompt(
        client,
        supabase,
        prompt,
        instruction or reference_label,
        mode=mode,
        seed_urls=seed_urls,
        reference_query_label=f"{instruction}\n{reference_text[:1200]}",
    )

def create_article_from_url_with_mode(source_url: str, mode: str = "insight"):
    source_url = source_url.strip()
    if not is_valid_source_url(source_url):
        print(f"[!] Invalid source URL: {source_url}")
        return

    from scraper import scrape_content_from_url

    print(f"[*] Scraping source article: {source_url}")
    content = scrape_content_from_url(source_url)
    source_text = content.get("text") or ""
    if not source_text:
        print("[!] Could not extract readable text from source URL.")
        return

    client, supabase = create_clients()
    prompt = build_source_url_prompt(source_url, source_text, mode=mode)
    create_article_from_prompt(
        client,
        supabase,
        prompt,
        source_url,
        mode=mode,
        seed_urls=[source_url],
        reference_query_label=source_text[:1200],
    )

if __name__ == "__main__":
    create_article()

import os
import json
import re
import base64
import copy
import unicodedata
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
from openai import OpenAI
from supabase import create_client, Client
from dotenv import load_dotenv
from storage import upload_image_value

# Load env vars
load_dotenv(".env")
load_dotenv("../.env.local")

IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"
CONTENT_WORD_TARGETS = {
    "insight": {"min": 1200, "max": 1500, "label": "1,200-1,500 words"},
    "guide": {"min": 1900, "max": 2200, "label": "1,900-2,200 words"},
}
MAX_LENGTH_RETRIES = 3
MAX_SUPPLEMENT_RETRIES = 3
ARTICLE_VERSIONS_KEY = "versions"
ARTICLE_VERSION_META_KEYS = {
    ARTICLE_VERSIONS_KEY,
    "current_version",
    "version_label",
}
TRUSTED_HEALTH_SOURCE_NAMES = [
    "American Dental Association",
    "National Institute of Dental and Craniofacial Research",
    "CDC",
    "NIH",
    "Pew Research Center",
    "U.S. Census Bureau",
    "KFF",
]
DEFAULT_TOPICS = [
    "How to Prepare for an I-693 Medical Exam",
    "Understanding Dental Insurance for Asian American Families",
    "Finding a Vietnamese-Speaking Primary Care Clinic",
    "Preventive Heart Health Tips for Asian American Adults",
    "How Korean American Families Can Choose Pediatric Care",
    "Vaccination Records for New Immigrant Families",
    "Mental Health Care Access for Asian American Patients",
]

def generate_slug(text):
    text = text.replace("Đ", "D").replace("đ", "d")
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = text.strip('-')
    return text[:180] or "article"

def count_markdown_words(content: str) -> int:
    plain_text = re.sub(r"```[\s\S]*?```", " ", content or "")
    plain_text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", plain_text)
    plain_text = re.sub(r"\[[^\]]*\]\([^)]+\)", " ", plain_text)
    plain_text = re.sub(r"[#>*_`|~\-\[\]():]", " ", plain_text)
    plain_text = re.sub(r"\s+", " ", plain_text).strip()
    return len(plain_text.split()) if plain_text else 0

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
    - Format references as a numbered Markdown list, not bullet points.
    - Each reference should read like a citation: author or organization, title in quotation marks, publication/source name when available, year or access date when available, and a short linked source label at the end.
    - Use this style:
      1. American Dental Association. "Oral Health Topics: Gum Disease." ADA. [ADA](https://example.com)
      2. National Institute of Dental and Craniofacial Research. "Periodontal Disease in Adults." NIH/NIDCR. [NIDCR](https://example.com)
    - Do not use bare URLs.
    - Do not fabricate author names, publication years, DOI links, PMC links, or journal details. If only the organization and page title are known, cite those accurately.
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
            model="deepseek/deepseek-chat",
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
    client, supabase = create_clients()
    topic = (topic or os.environ.get("OPENCLAW_ARTICLE_TOPIC") or "").strip() or pick_trending_topic(client, supabase, mode="insight")
    prompt = build_topic_prompt(topic, mode="insight")
    create_article_from_prompt(client, supabase, prompt, topic, mode="insight")

def create_guide(topic: Optional[str] = None):
    client, supabase = create_clients()
    topic = (topic or os.environ.get("OPENCLAW_GUIDE_TOPIC") or "").strip() or pick_trending_topic(client, supabase, mode="guide")
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

    if mode == "guide":
        content_type = "pillar guide"
        word_count = CONTENT_WORD_TARGETS["guide"]["label"]
        category = "guide"
        depth_rules = """
    - Write as Pillar Content: comprehensive, structured, and useful enough to rank for a broad healthcare topic.
    - Include a short table of contents, practical step-by-step sections, a comparison table, a checklist, FAQs, and a clear care-next-step section.
    - Cover definitions, symptoms or decision points when relevant, preparation, costs/insurance questions, language access, and when to seek professional care.
    - Include one Markdown table, one practical bullet list, and at most one Markdown blockquote callout.
    - Do not overuse boxed/callout-style content; most sections should be normal paragraphs with occasional lists.
    - Use H2 and H3 headings with SEO-friendly phrasing, but keep the writing natural.
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
    Image requirements:
    - Provide 3-5 distinct image prompts in `image_prompts`, choosing the count based on the article depth and section variety.
    - First prompt is for the hero image.
    - Remaining prompts are for inline supporting images tied to different major sections of the article.
    - Every prompt must be visually distinct and must say no text, no logos, no watermarks.

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
        "Hero image prompt for this exact article, no text, no logos, no watermarks",
        "Inline supporting image prompt for section one, no text, no logos, no watermarks",
        "Inline supporting image prompt for section two, no text, no logos, no watermarks"
      ]
    }}
    """

def build_source_url_prompt(source_url: str, source_text: str, mode: str = "insight") -> str:
    safe_text = source_text[:24000]
    is_guide = mode == "guide"
    trust_rules = build_trust_and_culture_rules(mode)
    depth_quality_rules = build_authoritative_depth_rules(mode)
    reference_style_rules = build_reference_style_rules()
    content_type = "Pillar Content guide" if is_guide else "SEO healthcare insight article"
    word_count = CONTENT_WORD_TARGETS["guide" if is_guide else "insight"]["label"]
    category = "guide" if is_guide else "insight"
    min_words = CONTENT_WORD_TARGETS["guide" if is_guide else "insight"]["min"]
    depth_rules = (
        "Include a table of contents, detailed step-by-step guidance, one Markdown comparison table, one checklist, FAQs, at most one blockquote callout, and care-next-step guidance. Do not overuse callouts."
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
    - Include a final "## References" section with the source URL and any other source names clearly supported by the reference text.
    - Provide 3-5 AI image prompts, choosing the count based on article depth and section variety. The first is the hero image; the remaining prompts are inline supporting images for different major sections. All must specify no text, no logos, no watermarks.
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
    content_type = "Pillar Content guide" if is_guide else "SEO healthcare insight article"
    word_count = CONTENT_WORD_TARGETS["guide" if is_guide else "insight"]["label"]
    category = "guide" if is_guide else "insight"
    min_words = CONTENT_WORD_TARGETS["guide" if is_guide else "insight"]["min"]
    depth_rules = (
        "Include a table of contents, detailed step-by-step guidance, one Markdown comparison table, one checklist, FAQs, at most one blockquote callout, and care-next-step guidance. Do not overuse callouts."
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
    - Include a final "## References" section using the source URLs or source names from the memory when available.
    - Provide 3-5 AI image prompts, choosing the count based on article depth and section variety. The first is the hero image; the remaining prompts are inline supporting images for different major sections. All must specify no text, no logos, no watermarks.
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
    word_count = CONTENT_WORD_TARGETS["guide" if is_guide else "insight"]["label"]
    min_words = CONTENT_WORD_TARGETS["guide" if is_guide else "insight"]["min"]
    category = "guide" if is_guide else "insight"
    existing_content = str(article.get("content") or "")[:32000]
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

    Owner rewrite instruction:
    {instruction}

    Existing content:
    {existing_content}

    Rewrite rules:
    - Apply the owner's requested edits precisely.
    - Preserve the article's useful factual content, but improve clarity, structure, SEO, and patient usefulness.
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
    Image requirements:
    - Provide 3-5 distinct image prompts in `image_prompts`, choosing the count based on the rewritten article depth and section variety.
    - First prompt is for the hero image.
    - Remaining prompts are for inline supporting images tied to different major sections of the rewritten article.
    - Every prompt must be visually distinct and must say no text, no logos, no watermarks.

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
        "Hero image prompt for this exact rewritten article, no text, no logos, no watermarks",
        "Inline supporting image prompt for section one, no text, no logos, no watermarks",
        "Inline supporting image prompt for section two, no text, no logos, no watermarks"
      ]
    }}
    """

def extract_json_payload(content: str) -> dict:
    content = content.strip()
    if "```json" in content:
        content = content.split("```json", 1)[1].split("```", 1)[0].strip()
    elif content.startswith("```"):
        content = content.split("```", 1)[1].split("```", 1)[0].strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return json.loads(content, strict=False)

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
            f"Professional healthcare editorial hero illustration for {data.get('title', 'Asian Health Hub article')}, diverse Asian American patients, no text, no logos, no watermarks"
        )

    fallback_prompts = [
        "Supportive patient education illustration showing a culturally sensitive conversation with an Asian American clinician, no text, no logos, no watermarks",
        "Practical healthcare navigation illustration showing a family reviewing care options at home, no text, no logos, no watermarks",
        "Preventive care illustration in a clean clinic setting with diverse Asian American patients, no text, no logos, no watermarks",
        "Community health illustration focused on preparation, questions, and patient confidence, no text, no logos, no watermarks",
    ]

    for fallback in fallback_prompts:
        if len(cleaned) >= 3:
            break
        cleaned.append(f"{fallback}. Article topic: {data.get('title', 'Asian Health Hub article')}")

    return cleaned[:5]

def generate_article_images(client: OpenAI, data: dict, slug: str) -> List[str]:
    image_urls = []
    image_prompts = normalize_image_prompts(data)
    suffixes = ["hero", "inline-1", "inline-2", "inline-3", "inline-4"]

    for index, image_prompt in enumerate(image_prompts):
        print(f"[*] Generating image {index + 1}/{len(image_prompts)} via {IMAGE_MODEL} using prompt: {image_prompt}")
        image_response = client.chat.completions.create(
            model=IMAGE_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Create a polished editorial healthcare illustration for Asian Health Hub. "
                        "Use a clean, trustworthy medical style, natural light, diverse Asian American patients when people are shown, "
                        "accurate healthcare context, and no text, logos, or watermarks in the image. Topic: "
                        f"{image_prompt}"
                    ),
                }
            ],
        )
        image_value = extract_image_value(image_response.choices[0].message)
        image_url = save_generated_image(image_value, slug, suffixes[index])
        if image_url:
            image_urls.append(image_url)

    return image_urls

def build_length_retry_prompt(data: dict, original_prompt: str, mode: str, current_words: int, attempt: int) -> str:
    target = CONTENT_WORD_TARGETS.get(mode, CONTENT_WORD_TARGETS["insight"])
    missing_words = max(target["min"] - current_words, 0)
    trust_rules = build_trust_and_culture_rules(mode)
    depth_quality_rules = build_authoritative_depth_rules(mode)
    reference_style_rules = build_reference_style_rules()

    return f"""
    The previous JSON draft is too short for Asian Health Hub and must be expanded before publication.
    Retry attempt: {attempt}/{MAX_LENGTH_RETRIES}
    Current content word count: {current_words}
    Minimum required word count: {target["min"]}
    Add at least {missing_words + 250} useful words of original, patient-facing detail.

    Original writing brief:
    {original_prompt}

    Current JSON draft:
    {json.dumps(data, ensure_ascii=False)}

    Rewrite and expand the JSON while preserving the same schema.
    Requirements:
    - `content` must be {target["label"]}; never below {target["min"]} words.
    - Keep `content` in Markdown and do not include a top-level H1.
    - Add deeper explanations, examples, patient-facing action steps, one Markdown table, one practical bullet list, at most one blockquote callout, FAQ, disclaimer, and References when sources are available.
    - Add missing emotional specificity, culturally grounded context, and evidence-backed detail instead of padding with generic educational prose.
    - Do not create repeated callout boxes; use normal paragraphs for most additions.
    - Keep title, excerpt, tags, SEO fields, and image_prompts aligned with the expanded article.
    {trust_rules}
    {depth_quality_rules}
    {reference_style_rules}
    - Output ONLY valid JSON.
    """

def clean_markdown_supplement(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        content = content.split("```", 1)[1]
        if content.startswith("markdown"):
            content = content[len("markdown"):].strip()
        content = content.split("```", 1)[0].strip()
    return content

def generate_supplemental_markdown(client: OpenAI, data: dict, original_prompt: str, mode: str, current_words: int, attempt: int) -> str:
    target = CONTENT_WORD_TARGETS.get(mode, CONTENT_WORD_TARGETS["insight"])
    missing_words = max(target["min"] - current_words, 0)
    desired_words = min(800, max(450, missing_words + 180))
    trust_rules = build_trust_and_culture_rules(mode)
    depth_quality_rules = build_authoritative_depth_rules(mode)
    reference_style_rules = build_reference_style_rules()
    prompt = f"""
    The article below is still too short and needs additional original Markdown sections.
    Return ONLY Markdown to append to the existing `content`. Do not return JSON.

    Original writing brief:
    {original_prompt}

    Existing title:
    {data.get("title")}

    Existing content:
    {data.get("content")}

    Requirements:
    - Write {desired_words}-{desired_words + 180} additional words.
    - Do not repeat existing paragraphs.
    - Use H2/H3 headings only, never H1.
    - Add practical patient guidance, culturally aware context, concrete next steps, brief human moments, and evidence-backed details.
    - If the article lacks a table, list, one quote/callout, FAQ, disclaimer, or clickable References, include the missing block.
    - Do not create repeated callout boxes; use normal paragraphs for most additions.
    - Current word count is {current_words}; minimum required is {target["min"]}.
    - Supplement attempt: {attempt}/{MAX_SUPPLEMENT_RETRIES}.
    {trust_rules}
    {depth_quality_rules}
    {reference_style_rules}
    """

    response = client.chat.completions.create(
        model="deepseek/deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.45,
        max_tokens=6000,
    )
    return clean_markdown_supplement(response.choices[0].message.content or "")

def ensure_article_length(client: OpenAI, data: dict, original_prompt: str, mode: str) -> dict:
    target = CONTENT_WORD_TARGETS.get(mode, CONTENT_WORD_TARGETS["insight"])
    best_data = data
    best_words = count_markdown_words(str(data.get("content") or ""))

    for attempt in range(1, MAX_LENGTH_RETRIES + 1):
        current_words = count_markdown_words(str(data.get("content") or ""))
        print(f"[*] Draft word count after attempt {attempt - 1}: {current_words} words")

        if current_words >= target["min"]:
            return data

        if current_words > best_words:
            best_data = data
            best_words = current_words

        print(f"[*] Draft is shorter than {target['min']} words. Expanding attempt {attempt}/{MAX_LENGTH_RETRIES}...")
        response = client.chat.completions.create(
            model="deepseek/deepseek-chat",
            messages=[{"role": "user", "content": build_length_retry_prompt(data, original_prompt, mode, current_words, attempt)}],
            temperature=0.45,
            max_tokens=14000 if mode == "guide" else 11000,
        )
        data = extract_json_payload(response.choices[0].message.content.strip())

    final_words = count_markdown_words(str(data.get("content") or ""))
    if final_words > best_words:
        best_data = data
        best_words = final_words

    for attempt in range(1, MAX_SUPPLEMENT_RETRIES + 1):
        if best_words >= target["min"]:
            return best_data

        print(f"[*] Generating supplemental Markdown attempt {attempt}/{MAX_SUPPLEMENT_RETRIES}...")
        supplement = generate_supplemental_markdown(client, best_data, original_prompt, mode, best_words, attempt)
        if supplement:
            best_data["content"] = f"{best_data.get('content', '').rstrip()}\n\n{supplement.strip()}"
            best_words = count_markdown_words(str(best_data.get("content") or ""))
            print(f"[*] Word count after supplemental attempt {attempt}: {best_words} words")

    final_words = count_markdown_words(str(best_data.get("content") or ""))
    print(f"[*] Final expanded word count: {final_words} words")

    if final_words < target["min"]:
        raise ValueError(
            f"Generated {mode} is still too short after {MAX_LENGTH_RETRIES} rewrite retries "
            f"and {MAX_SUPPLEMENT_RETRIES} supplemental retries: "
            f"{final_words} words; minimum is {target['min']}. Not publishing short article."
        )

    return best_data

def create_article_from_prompt(client: OpenAI, supabase: Client, prompt: str, label: str, mode: str = "insight"):
    print("[*] Generating article content via Deepseek...")
    print(f"[*] Input: {label}")
    print(f"[*] Content mode: {mode}")

    try:
        # Step 1: Generate Text with Deepseek
        response = client.chat.completions.create(
            model="deepseek/deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=12000 if mode == "guide" else 9500,
        )

        content = response.choices[0].message.content.strip()
        data = extract_json_payload(content)
        data = ensure_article_length(client, data, prompt, mode)
        
        base_slug = generate_slug(data["title"])
        slug = make_unique_slug(supabase, base_slug)
        if slug != base_slug:
            print(f"[*] Slug already existed. Using unique slug: {slug}")

        image_urls = generate_article_images(client, data, slug)
        
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

        print(f"[*] Inserting article: {data['title']}")
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
    response = client.chat.completions.create(
        model="deepseek/deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.55,
        max_tokens=14000 if mode == "guide" else 11000,
    )
    data = extract_json_payload(response.choices[0].message.content.strip())
    data = ensure_article_length(client, data, prompt, mode)
    new_words = count_markdown_words(data.get("content") or "")

    image_urls = []
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
    create_article_from_prompt(client, supabase, prompt, instruction or reference_label, mode=mode)

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
    create_article_from_prompt(client, supabase, prompt, source_url, mode=mode)

if __name__ == "__main__":
    create_article()

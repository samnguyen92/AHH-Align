import json
import os
from typing import Any, List, Optional

import instructor
from openai import OpenAI
from pydantic import BaseModel, Field


class InsuranceInfo(BaseModel):
    accepted_networks: List[str] = Field(
        default_factory=list,
        description="Insurance plans, networks, or payer names explicitly mentioned on the page.",
    )
    accepts_medicaid: Optional[bool] = Field(
        default=None,
        description="True only when Medicaid, Medi-Cal, or a state Medicaid plan is explicitly accepted. None when not mentioned.",
    )
    accepts_medicare: Optional[bool] = Field(
        default=None,
        description="True only when Medicare is explicitly accepted. None when not mentioned.",
    )
    accepts_private_insurance: bool = Field(
        default=False,
        description="True when private/commercial dental or medical insurance is explicitly accepted.",
    )
    out_of_network_available: Optional[bool] = Field(
        default=None,
        description="Whether out-of-network billing or PPO/out-of-network support is mentioned.",
    )
    notes: Optional[str] = Field(
        default=None,
        description="Short note about insurance verification, self-pay, new patient billing, or uncertainty.",
    )


class TeamMember(BaseModel):
    name: str = Field(description="Provider or staff member name exactly as written.")
    role: str = Field(description="Clinical or administrative role, such as physician, dentist, NP, or care coordinator.")
    languages_spoken: List[str] = Field(default_factory=list)
    bio_snippet: Optional[str] = Field(
        default=None,
        description="Brief source-grounded bio detail, credential, or care focus.",
    )


class WorkingHours(BaseModel):
    monday: Optional[str] = None
    tuesday: Optional[str] = None
    wednesday: Optional[str] = None
    thursday: Optional[str] = None
    friday: Optional[str] = None
    saturday: Optional[str] = None
    sunday: Optional[str] = None


class HighlightItem(BaseModel):
    title: str = Field(description="Short UI label, e.g. 'Bilingual Staff' or 'Same-day appointments'.")
    detail: Optional[str] = Field(default=None, description="One sentence explaining the highlight from source content.")
    category: Optional[str] = Field(default=None, description="Access, care, culture, convenience, insurance, technology, or reviews.")


class ServiceOffering(BaseModel):
    name: str = Field(description="Patient-facing service name.")
    category: Optional[str] = Field(default=None, description="Dental, Primary Care, Emergency, Preventive, Cosmetic, etc.")
    description: Optional[str] = Field(default=None, description="Brief source-grounded detail.")
    patient_fit: Optional[str] = Field(default=None, description="Who this service is for, when stated or obvious from source wording.")
    is_featured: bool = False


class PricingItem(BaseModel):
    name: str = Field(description="Procedure, plan, exam, consult, or package name.")
    price: Optional[str] = Field(default=None, description="Exact price if stated, e.g. '$99'.")
    price_range: Optional[str] = Field(default=None, description="Range if stated, e.g. '$80-$150'.")
    notes: Optional[str] = Field(default=None, description="Financing, membership, self-pay, insurance, or caveat note.")
    category: Optional[str] = Field(default=None, description="Exam, cleaning, filling, emergency, cosmetic, membership, etc.")


class LocationInfo(BaseModel):
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = Field(default=None, description="Two-letter US state abbreviation when available.")
    zip_code: Optional[str] = None
    parking: Optional[str] = None
    transit: Optional[str] = None
    nearby_landmarks: List[str] = Field(default_factory=list)
    map_url: Optional[str] = None


class AppointmentInfo(BaseModel):
    appointment_url: Optional[str] = None
    booking_note: Optional[str] = Field(default=None, description="Booking CTA or scheduling instructions.")
    free_consultation_available: Optional[bool] = None
    phone_booking_available: Optional[bool] = None
    online_booking_available: Optional[bool] = None
    new_patient_note: Optional[str] = None


class ReviewItem(BaseModel):
    author: Optional[str] = None
    rating: Optional[float] = None
    text: Optional[str] = None
    date: Optional[str] = None
    source: Optional[str] = None


class ReviewProfile(BaseModel):
    rating: Optional[float] = None
    review_count: Optional[int] = None
    source: Optional[str] = None
    summary: Optional[str] = None
    positive_themes: List[str] = Field(default_factory=list)
    concern_themes: List[str] = Field(default_factory=list)
    featured_reviews: List[ReviewItem] = Field(default_factory=list)


class ClinicExtraction(BaseModel):
    name: str = Field(description="Exact clinic or hospital name, or the requested target name if unclear.")
    about_highlight: str = Field(
        description="Two to three concise paragraphs summarizing the clinic for the profile UI.",
    )
    cultural_context: Optional[str] = Field(
        default=None,
        description="Asian, immigrant, language-access, or culturally responsive care context found in the source.",
    )
    highlights: List[HighlightItem] = Field(
        default_factory=list,
        description="Top profile highlights for the first tab of the clinic detail page.",
    )
    services_offered: List[ServiceOffering] = Field(default_factory=list)
    insurance: InsuranceInfo = Field(default_factory=InsuranceInfo)
    team_members: List[TeamMember] = Field(
        default_factory=list,
        description="Clinical or administrative team members. Include providers and staff listed in the about/team section or explicitly mentioned in user reviews/testimonials with their name and specific role (e.g., dentist, hygienist, assistant, receptionist/front desk)."
    )
    pricing: List[PricingItem] = Field(
        default_factory=list,
        description="Self-pay prices, insurance notes, membership plans, offers, or procedure cost ranges.",
    )
    location: LocationInfo = Field(default_factory=LocationInfo)
    appointment: AppointmentInfo = Field(default_factory=AppointmentInfo)
    review_profile: ReviewProfile = Field(default_factory=ReviewProfile)
    gallery_images: List[str] = Field(default_factory=list)
    working_hours: WorkingHours = Field(default_factory=WorkingHours)
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    review_summary: Optional[str] = None
    short_description: Optional[str] = Field(
        default=None,
        description="A brief 1-2 sentence description of the clinic/hospital for the hero banner. Do NOT reuse the full about us content."
    )

    # Compatibility fields used by the existing DB/frontend pipeline.
    city: Optional[str] = None
    state: Optional[str] = Field(default=None, description="Two-letter US state abbreviation when available.")
    zip_code: Optional[str] = None
    appointment_url: Optional[str] = None
    email: Optional[str] = None
    fax: Optional[str] = None
    specialty: Optional[str] = Field(default=None, description="Primary specialty or facility type.")
    languages: List[str] = Field(
        default_factory=lambda: ["English"],
        description="Languages spoken by the clinic staff or providers. Extract all languages explicitly mentioned in the text (e.g., 'Spanish', 'Vietnamese', 'Korean', 'Chinese', 'Tagalog'). If a specific provider is listed as speaking a language, include that language. If no languages are found, default to ['English']."
    ),
    accepting_new_patients: Optional[bool] = None
    is_telehealth_available: bool = False


def _format_scraped_content(scraped_content: Any) -> str:
    """
    Build an LLM-ready extraction context from scraper output while keeping
    string input backwards-compatible for older callers.
    """
    if isinstance(scraped_content, str):
        return scraped_content

    if not isinstance(scraped_content, dict):
        return ""

    sections = []
    markdown_content = scraped_content.get("markdown_content") or scraped_content.get("text") or ""
    if markdown_content:
        sections.append(f"## Rendered Page Markdown\n{markdown_content}")

    json_ld_schemas = scraped_content.get("json_ld_schemas") or []
    if json_ld_schemas:
        sections.append(
            "## JSON-LD Schema Markup\n"
            + json.dumps(json_ld_schemas[:20], ensure_ascii=False, indent=2)
        )

    important_links = scraped_content.get("important_links") or scraped_content.get("links") or []
    link_lines = [
        f"- {link.get('text') or 'Link'}: {link.get('url')}"
        for link in important_links[:80]
        if isinstance(link, dict) and link.get("url")
    ]
    if link_lines:
        sections.append("## Important Links\n" + "\n".join(link_lines))

    iframe_sources = scraped_content.get("iframe_sources") or []
    if iframe_sources:
        iframe_lines = [f"- {iframe_src}" for iframe_src in iframe_sources[:20]]
        sections.append("## Iframe Sources\n" + "\n".join(iframe_lines))

    appointment_url = scraped_content.get("appointment_url")
    if appointment_url:
        sections.append(f"## Detected Appointment URL\n{appointment_url}")

    page_title = scraped_content.get("page_title")
    meta_description = scraped_content.get("meta_description")
    if page_title or meta_description:
        sections.append(
            "## Page Metadata\n"
            + "\n".join(
                line for line in [
                    f"Title: {page_title}" if page_title else "",
                    f"Description: {meta_description}" if meta_description else "",
                ]
                if line
            )
        )

    images = scraped_content.get("images") or []
    if images:
        image_lines = [f"- {image_src}" for image_src in images[:12]]
        sections.append("## Image Candidates\n" + "\n".join(image_lines))

    return "\n\n".join(sections)


def _with_pipeline_compatibility(extracted: dict) -> dict:
    """
    Preserve UI-first fields while adding aliases expected by the current
    Supabase insert path and clinic profile components.
    """
    services_offered = extracted.get("services_offered") or []
    services = [
        service.get("name")
        for service in services_offered
        if isinstance(service, dict) and service.get("name")
    ]
    insurance = extracted.get("insurance") or {}
    team_members = extracted.get("team_members") or []
    location = extracted.get("location") or {}
    appointment = extracted.get("appointment") or {}
    review_profile = extracted.get("review_profile") or {}

    extracted["description"] = extracted.get("about_highlight")
    extracted["short_description"] = extracted.get("short_description")
    extracted["services"] = services
    extracted["insurance_accepted"] = insurance.get("accepted_networks") or []
    extracted["provider_credentials"] = {
        "providers": [member.get("name") for member in team_members if member.get("name")],
        "professional_memberships": [],
        "education": [],
        "board_certifications": [],
        "residency": [],
        "hospital_affiliations": [],
        "years_in_practice": None,
    }
    extracted["language_note"] = extracted.get("cultural_context")
    extracted["working_hours"] = {
        key: value
        for key, value in (extracted.get("working_hours") or {}).items()
        if value not in (None, "")
    }

    # Merge languages from team members to clinic level
    languages_set = set(extracted.get("languages") or [])
    for member in team_members:
        if isinstance(member, dict) and member.get("languages_spoken"):
            for lang in member["languages_spoken"]:
                if isinstance(lang, str) and lang.strip():
                    languages_set.add(lang.strip())
    
    # Remove empty/null values and ensure proper capitalization
    cleaned_languages = []
    for lang in languages_set:
        cleaned = lang.strip().title()
        if cleaned and cleaned not in cleaned_languages:
            cleaned_languages.append(cleaned)
            
    if not cleaned_languages:
        cleaned_languages = ["English"]
        
    extracted["languages"] = cleaned_languages

    for field in ["address", "city", "state", "zip_code"]:
        if not extracted.get(field) and location.get(field):
            extracted[field] = location[field]

    if not extracted.get("appointment_url") and appointment.get("appointment_url"):
        extracted["appointment_url"] = appointment["appointment_url"]

    if not extracted.get("review_summary") and review_profile.get("summary"):
        extracted["review_summary"] = review_profile["summary"]

    if review_profile.get("rating") is not None:
        extracted["rating"] = review_profile["rating"]
    if review_profile.get("review_count") is not None:
        extracted["rating_count"] = review_profile["review_count"]
    if review_profile.get("featured_reviews"):
        extracted["reviews"] = [
            review for review in review_profile["featured_reviews"]
            if any(review.get(key) for key in ["author", "text", "rating"])
        ]

    if insurance.get("accepts_medicaid") and "Medicaid" not in extracted["insurance_accepted"]:
        extracted["insurance_accepted"].append("Medicaid")
    if insurance.get("accepts_medicare") and "Medicare" not in extracted["insurance_accepted"]:
        extracted["insurance_accepted"].append("Medicare")

    return extracted


def extract_clinic_data(hospital_name: str, text_content) -> Optional[dict]:
    """
    Extract structured clinic data from raw scraped content using Instructor
    and Pydantic instead of manual JSON parsing.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("[!] OPENROUTER_API_KEY is not set.")
        return None

    client = instructor.from_openai(
        OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=75.0),
        mode=instructor.Mode.JSON,
    )

    extraction_context = _format_scraped_content(text_content)
    # DeepSeek supports 64K context; Jina content is richer so we use more of it
    safe_text = extraction_context[:55000]

    system_prompt = (
        "You extract clinic profile data for Asian Health Hub. "
        "Use only the provided webpage content, JSON-LD, links, and iframe sources. "
        "Extract all fields needed for the clinic detail wireframe: highlights, about, short description, cultural context, "
        "insurance, services, team, pricing, location, reviews, booking, hours, phone, and website. "
        "Do not invent providers, prices, insurance, languages, reviews, hours, or cultural context. "
        "If a value is not present, use null or an empty list as appropriate. "
        "For boolean fields like accepts_medicaid and accepts_medicare, use null when not mentioned — do not default to false."
    )
    user_prompt = f"""
    Target clinic or hospital name: {hospital_name}

    Read the source content and extract a patient-facing clinic profile. Prioritize:
    - tab highlights, a 2-3 paragraph about section, and a separate short description (1-2 sentences) for the hero banner
    - culturally relevant Asian, immigrant, bilingual, or language-access context when present
    - insurance networks, Medicaid/Medicare/private insurance, self-pay and verification notes
    - service cards with short descriptions
    - team member cards with roles, languages, and bio snippets
    - transparent pricing, membership, free consult, financing, and procedure cost ranges
    - location details, parking/transit/landmarks, maps links, phone, website, appointment links
    - review rating, review count, positive themes, concern themes, and featured review snippets
    - gallery image URLs from image candidates when they look clinic/provider/location related

    Source content:
    {safe_text}
    """

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    # Primary model: DeepSeek (fast, cost-effective, strong structured extraction)
    PRIMARY_MODEL  = "deepseek/deepseek-v4-flash"
    FALLBACK_MODEL = "minimax/minimax-m3"

    print(f"[*] Sending extraction request to OpenRouter ({PRIMARY_MODEL})...")
    try:
        data = client.chat.completions.create(
            model=PRIMARY_MODEL,
            response_model=ClinicExtraction,
            messages=messages,
            temperature=0.1,
            max_retries=2,
        )
    except Exception as primary_exc:
        print(f"[!] Primary extraction model ({PRIMARY_MODEL}) failed: {primary_exc}")
        print(f"[*] Retrying with fallback model ({FALLBACK_MODEL})...")
        try:
            fallback_client = instructor.from_openai(
                OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=90.0),
                mode=instructor.Mode.JSON,
            )
            data = fallback_client.chat.completions.create(
                model=FALLBACK_MODEL,
                response_model=ClinicExtraction,
                messages=messages,
                temperature=0.1,
                max_retries=2,
            )
        except Exception as fallback_exc:
            print(f"[!] Fallback extraction model ({FALLBACK_MODEL}) also failed: {fallback_exc}")
            return None

    extracted = data.model_dump()
    print(f"[*] Successfully extracted data for {extracted.get('name')}")
    return _with_pipeline_compatibility(extracted)

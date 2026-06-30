import os
import json
import re
from datetime import datetime
from typing import Optional, List
from openai import OpenAI
from supabase import Client
from dotenv import load_dotenv

# Import helpers from generate_insights to reuse core clients, storage and image pipelines
from generate_insights import (
    create_clients,
    save_generated_image,
    generate_slug,
    make_unique_slug,
    iso_now,
    extract_image_value,
    IMAGE_MODEL,
    TEXT_MODEL,
)
from progress import report_progress

# Load environment configurations
load_dotenv(".env")
load_dotenv("../.env.local")


def get_next_issue_info(supabase: Client) -> tuple[str, str]:
    """Retrieve all existing Pulse newsletters to calculate the next issue number and label."""
    try:
        res = supabase.table("articles").select("seo_meta").eq("category", "pulse").execute()
        existing_articles = res.data or []
    except Exception as exc:
        print(f"[!] Error fetching pulse articles: {exc}")
        existing_articles = []

    max_issue = 0
    for art in existing_articles:
        seo_meta = art.get("seo_meta") or {}
        issue_str = seo_meta.get("issue_number") or ""
        match = re.search(r"\d+", issue_str)
        if match:
            max_issue = max(max_issue, int(match.group()))

    next_issue = max_issue + 1
    month_label = datetime.now().strftime("%B %Y")  # e.g., "June 2026"

    return f"#{next_issue}", month_label


def get_recent_clinics(supabase: Client, limit: int = 5) -> List[dict]:
    """Fetch recently verified/added clinics to showcase in the spotlight section of the newsletter."""
    try:
        res = supabase.table("clinics").select("name, specialty, city, state, languages").order("created_at", desc=True).limit(limit).execute()
        return res.data or []
    except Exception as exc:
        print(f"[!] Error fetching recent clinics: {exc}")
        return []


def create_pulse(topic: Optional[str] = None) -> None:
    """Core function to create and publish a new Pulse newsletter issue via AI agent."""
    print("[*] Starting monthly Pulse newsletter generation...")
    client, supabase = create_clients()

    # 1. Fetch metadata
    issue_number, month_label = get_next_issue_info(supabase)
    print(f"[*] Preparing Issue: {issue_number} for {month_label}")

    # 2. Gather clinic spotlight list
    recent_clinics = get_recent_clinics(supabase, limit=5)
    clinics_summary = ""
    if recent_clinics:
        for c in recent_clinics:
            langs = ", ".join(c.get("languages") or ["English"])
            clinics_summary += f"- **{c['name']}** in {c['city']}, {c['state']} (Specialty: {c.get('specialty') or 'General Medicine'}, Languages: {langs})\n"
    else:
        clinics_summary = "- AHH clinic directory continues to grow with newly verified multilingual providers across major US cities.\n"

    # 3. Design the LLM prompt
    topic_focus = (topic or "").strip() or "General wellness and health access tips for immigrant communities"
    prompt = f"""
    You are the Senior Medical & Health Editor for Asian Health Hub (AHH).
    Your task is to write a monthly newsletter issue for "AHH Pulse" (Issue {issue_number}, Month: {month_label}).
    
    Topic focus: {topic_focus}
    
    Here is a list of newly added/verified clinics in our directory to highlight in this newsletter issue:
    {clinics_summary}
    
    Write the newsletter content in English, targeting Vietnamese, Korean, and Chinese American patients and their family caregivers.
    
    Your output MUST be a valid JSON object matching this structure EXACTLY (do not include markdown wrapping inside the JSON, except for the 'content' field):
    {{
      "title": "A warm, engaging, and professional title (e.g. Summer Health Tips for Asian Families + New Verified Clinics in LA)",
      "excerpt": "A short, engaging 2-sentence summary of the issue.",
      "seo_description": "A search-optimized description under 160 characters.",
      "tags": ["newsletter", "health-tips", "community-care"],
      "content": "The full newsletter body in Markdown. Follow this strict outline:
         
         # [Title of the newsletter]
         
         Write a warm editorial greeting (e.g., 'Dear Asian Health Hub community, ...') introducing the issue, the season, and why language-accessible care matters.
         
         ## 5 Crucial Health Tips for [Chủ đề liên quan đến topic_focus]
         Provide 5 practical, culturally-attuned, and evidence-based health tips (e.g., heat safety, preventive screenings, understanding mental health stigma, or dental care) written in clear, reassuring paragraphs. Under each tip, provide 2-3 sentences of explanation.
         
         ## Spotlight: Newly Verified Clinics Added This Month
         Introduce our directory growth. Present the newly added clinics in a neat Markdown table:
         | Clinic Name | Specialty | Location | Language Support |
         | --- | --- | --- | --- |
         (Populate the table with the newly verified clinics provided above.)
         
         ## Tips for Navigating Healthcare without Language Barriers
         Provide 3 actionable tips for patients or caregivers on how to check insurance, prepare bilingual care notes, and verify language interpreters before booking.
         
         ## Medical Disclaimer
         Standard medical disclaimer (e.g., 'The information in this newsletter is for educational purposes only. Please consult a qualified healthcare provider...')
      "
    }}
    
    Remember:
    - Write in a friendly, encouraging, but highly professional medical tone.
    - Focus on cultural contexts (e.g., multi-generational households, traditional diets, language access).
    - Ensure the JSON is valid and correctly escaped. Do not wrap the JSON output in backticks like ```json.
    """

    # 4. Generate the newsletter content
    try:
        report_progress(f"📝 Đang soạn thảo bản tin {issue_number} ({month_label})...")
        response = client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.35,
        )
        content_text = response.choices[0].message.content.strip()
        
        # Clean potential markdown JSON wraps
        if content_text.startswith("```json"):
            content_text = content_text.removeprefix("```json")
        if content_text.endswith("```"):
            content_text = content_text.removesuffix("```")
        content_text = content_text.strip()
        
        data = json.loads(content_text)
    except Exception as e:
        print(f"[!] Error generating or parsing content JSON: {e}")
        # Fallback payload in case of parse errors
        data = {
            "title": f"AHH Pulse Issue {issue_number} - Healthcare Access Update",
            "excerpt": f"Our monthly newsletter on finding language-accessible care, featuring verified clinic spotlights and wellness guides.",
            "seo_description": "Monthly Asian Health Hub newsletter for clinic spotlights and wellness tips.",
            "tags": ["newsletter", "health-access"],
            "content": f"# AHH Pulse Issue {issue_number}\n\nDear Asian Health Hub community,\n\nWe are pleased to share our monthly health newsletter. Our focus this month is on {topic_focus}.\n\n## Spotlight: Clinics Added This Month\n\nWe have expanded our database with verified clinics. Search our directory to find support near you.\n\n*Disclaimer: Educational purposes only.*"
        }

    # 5. Generate cover image for the newsletter
    cover_image_url = ""
    try:
        report_progress("🎨 Đang sinh ảnh bìa cho bản tin...")
        image_prompt = (
            f"A realistic documentary-style photograph of an Asian American family or an elder consulting a friendly doctor, "
            f"warm lighting, everyday life, healthcare concept. Context: {data['title']}"
        )
        image_response = client.chat.completions.create(
            model=IMAGE_MODEL,
            messages=[{"role": "user", "content": image_prompt}],
        )
        image_value = extract_image_value(image_response.choices[0].message)
        base_slug = generate_slug(data["title"])
        slug = make_unique_slug(supabase, base_slug)
        cover_image_url = save_generated_image(image_value, slug, "cover")
    except Exception as exc:
        print(f"[!] Cover image generation failed: {exc}")
        base_slug = generate_slug(data["title"])
        slug = make_unique_slug(supabase, base_slug)

    # 6. Publish to Supabase under 'articles' with category = 'pulse'
    seo_meta = {
        "description": data["seo_description"],
        "keywords": data["tags"],
        "issue_number": issue_number,
        "month_label": month_label,
        "content_mode": "pulse",
        "og_image": cover_image_url,
        "images": [cover_image_url] if cover_image_url else [],
    }

    article_payload = {
        "title": data["title"],
        "slug": slug,
        "excerpt": data["excerpt"],
        "content": data["content"],
        "category": "pulse",
        "tags": data["tags"],
        "status": "published",
        "author": "Asian Health Hub Medical Team",
        "published_at": iso_now(),
        "seo_meta": seo_meta,
    }

    try:
        report_progress("🚀 Đang xuất bản bản tin lên Supabase...")
        supabase.table("articles").insert(article_payload).execute()
        print(f"[+] Article published successfully: /pulse/{slug}")
    except Exception as e:
        print(f"[!] Failed to insert article into Supabase: {e}")


if __name__ == "__main__":
    create_pulse()

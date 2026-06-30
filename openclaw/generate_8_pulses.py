import os
import json
import re
import time
from datetime import datetime
from openai import OpenAI
from supabase import create_client
from dotenv import load_dotenv

from generate_insights import (
    create_clients,
    save_generated_image,
    generate_slug,
    make_unique_slug,
    extract_image_value,
    IMAGE_MODEL,
    TEXT_MODEL,
)
from generate_pulse import get_recent_clinics

load_dotenv(".env")
load_dotenv("../.env.local")

# 8 issues with specific topics and dates
issues_to_generate = [
    {
        "issue": "#6",
        "month": "October 2025",
        "date": "2025-10-25T10:00:00Z",
        "topic": "Breast Cancer Awareness Month, screening recommendations for Asian women and language-accessible mammograms"
    },
    {
        "issue": "#7",
        "month": "November 2025",
        "date": "2025-11-25T10:00:00Z",
        "topic": "Diabetes Awareness Month, healthy traditional Asian diet modifications and endocrinology clinic spots"
    },
    {
        "issue": "#8",
        "month": "December 2025",
        "date": "2025-12-25T10:00:00Z",
        "topic": "Winter wellness, cold weather health tips, blood pressure checks and cardiovascular health in multigenerational homes"
    },
    {
        "issue": "#9",
        "month": "January 2026",
        "date": "2026-01-25T10:00:00Z",
        "topic": "New Year care planning, 2026 health insurance updates, Medicare & Medicaid guides for Asian seniors"
    },
    {
        "issue": "#10",
        "month": "February 2026",
        "date": "2026-02-25T10:00:00Z",
        "topic": "American Heart Month, preventing hypertension, stroke warning signs and low-sodium Asian cooking tips"
    },
    {
        "issue": "#11",
        "month": "March 2026",
        "date": "2026-03-25T10:00:00Z",
        "topic": "Colorectal Cancer Screening Guide, understanding colonoscopy, breaking screening taboos and clinic spot"
    },
    {
        "issue": "#12",
        "month": "April 2026",
        "date": "2026-04-25T10:00:00Z",
        "topic": "Spring allergy survival guide, seasonal allergies vs colds and pediatric allergy tips for families"
    },
    {
        "issue": "#13",
        "month": "May 2026",
        "date": "2026-05-25T10:00:00Z",
        "topic": "AAPI Heritage Month, community health centers history and multilingual mental health support resources"
    }
]

def generate_custom_pulse(client, supabase, issue_number, month_label, published_at, topic_focus):
    print(f"\n[*] Generating Issue {issue_number} ({month_label}) focus: {topic_focus}...")
    
    recent_clinics = get_recent_clinics(supabase, limit=5)
    clinics_summary = ""
    if recent_clinics:
        for c in recent_clinics:
            langs = ", ".join(c.get("languages") or ["English"])
            clinics_summary += f"- **{c['name']}** in {c['city']}, {c['state']} (Specialty: {c.get('specialty') or 'General Medicine'}, Languages: {langs})\n"
    else:
        clinics_summary = "- AHH clinic directory continues to grow with newly verified multilingual providers across major US cities.\n"

    prompt = f"""
    You are the Senior Medical & Health Editor for Asian Health Hub (AHH).
    Your task is to write a monthly newsletter issue for "AHH Pulse" (Issue {issue_number}, Month: {month_label}).
    
    Topic focus: {topic_focus}
    
    Here is a list of clinics in our directory to highlight in this newsletter issue:
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
         (Populate the table with the clinics provided above.)
         
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

    try:
        response = client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.35,
        )
        content_text = response.choices[0].message.content.strip()
        
        if content_text.startswith("```json"):
            content_text = content_text.removeprefix("```json")
        if content_text.endswith("```"):
            content_text = content_text.removesuffix("```")
        content_text = content_text.strip()
        
        data = json.loads(content_text)
    except Exception as e:
        print(f"[!] Error generating/parsing JSON for {issue_number}: {e}")
        return

    # Image generation
    cover_image_url = ""
    try:
        image_prompt = (
            f"A realistic documentary-style photograph of an Asian American family or patients consulting a friendly doctor, "
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
        print(f"[!] Image generation failed: {exc}")
        base_slug = generate_slug(data["title"])
        slug = make_unique_slug(supabase, base_slug)

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
        "published_at": published_at,
        "seo_meta": seo_meta,
    }

    try:
        supabase.table("articles").insert(article_payload).execute()
        print(f"[+] Published Issue {issue_number}: /pulse/{slug}")
    except Exception as e:
        print(f"[!] Failed to insert to database: {e}")

def main():
    client, supabase = create_clients()
    for item in issues_to_generate:
        # Check if the issue already exists to prevent duplicate runs
        existing = supabase.table("articles").select("id").eq("category", "pulse").contains("seo_meta", {"issue_number": item["issue"]}).execute()
        if existing.data:
            print(f"[*] Issue {item['issue']} already exists in Supabase. Skipping.")
            continue
            
        generate_custom_pulse(
            client=client,
            supabase=supabase,
            issue_number=item["issue"],
            month_label=item["month"],
            published_at=item["date"],
            topic_focus=item["topic"]
        )
        # Sleep slightly to prevent API rate limits
        time.sleep(2)

if __name__ == "__main__":
    main()

import os
import uuid
import re
import unicodedata
from supabase import create_client, Client

def generate_slug(text):
    text = text.replace("Đ", "D").replace("đ", "d")
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = text.strip('-')
    return text[:180] or "clinic"


def _merge_lists(existing, incoming, list_key=None):
    """
    Merge scalar/object lists while preserving order and avoiding exact duplicates.
    """
    if not existing:
        return incoming or []
    if not incoming:
        return existing or []

    if list_key == "team_members":
        # Deduplicate by 'name'
        merged = []
        by_name = {}
        for item in existing + incoming:
            if not isinstance(item, dict) or "name" not in item:
                merged.append(item)
                continue
            name = item["name"].strip().lower()
            if name in by_name:
                # Merge fields
                existing_item = by_name[name]
                # Combine bio snippets or take the longer/richer one
                bio1 = existing_item.get("bio_snippet") or ""
                bio2 = item.get("bio_snippet") or ""
                best_bio = bio2 if len(bio2) > len(bio1) else bio1
                existing_item["bio_snippet"] = best_bio or None
                
                # Merge roles (prefer longer/richer role description)
                role1 = existing_item.get("role") or ""
                role2 = item.get("role") or ""
                existing_item["role"] = role2 if len(role2) > len(role1) else role1
                
                # Merge languages spoken
                langs1 = existing_item.get("languages_spoken") or []
                langs2 = item.get("languages_spoken") or []
                merged_langs = list(set(langs1 + langs2))
                existing_item["languages_spoken"] = merged_langs
            else:
                copied = dict(item)
                by_name[name] = copied
                merged.append(copied)
        return merged

    elif list_key == "faqs":
        # Deduplicate by 'question'
        merged = []
        by_question = {}
        for item in existing + incoming:
            if not isinstance(item, dict) or "question" not in item:
                merged.append(item)
                continue
            q = item["question"].strip().lower()
            if q in by_question:
                by_question[q]["answer"] = item.get("answer") or by_question[q].get("answer")
            else:
                copied = dict(item)
                by_question[q] = copied
                merged.append(copied)
        return merged

    elif list_key == "highlights":
        # Deduplicate by 'title'
        merged = []
        by_title = {}
        for item in existing + incoming:
            if not isinstance(item, dict) or "title" not in item:
                merged.append(item)
                continue
            t = item["title"].strip().lower()
            if t in by_title:
                by_title[t]["detail"] = item.get("detail") or by_title[t].get("detail")
            else:
                copied = dict(item)
                by_title[t] = copied
                merged.append(copied)
        return merged

    merged = []
    seen = set()
    for item in existing + incoming:
        key = repr(item)
        if key in seen:
            continue
        seen.add(key)
        merged.append(item)
    return merged


def insert_clinic(clinic_data: dict):
    """
    Insert or update clinic data in Supabase.
    """
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        print("[!] Missing Supabase credentials in .env")
        return False
        
    supabase: Client = create_client(url, key)
    
    # Construct DB payload
    slug = generate_slug(clinic_data.get("name", ""))
    incoming_metadata = {}
    metadata_fields = [
        "services",
        "working_hours",
        "images",
        "insurance_accepted",
        "conditions_treated",
        "accepting_new_patients",
        "provider_credentials",
        "language_note",
        "review_summary",
        "reviews",
        "rating",
        "rating_count",
        "faqs",
        "website",
        "appointment_url",
        "email",
        "fax",
        "source_url",
        "json_ld_schemas",
        "important_links",
        "iframe_sources",
        "about_highlight",
        "short_description",
        "cultural_context",
        "services_offered",
        "insurance",
        "team_members",
        "highlights",
        "pricing",
        "location",
        "appointment",
        "review_profile",
        "gallery_images",
        "third_party_profiles",
        "external_sources",
    ]
    for field in metadata_fields:
        value = clinic_data.get(field)
        if value not in (None, "", [], {}):
            incoming_metadata[field] = value

    if clinic_data.get("google_metadata"):
        incoming_metadata.update(clinic_data.get("google_metadata") or {})

    db_payload = {
        "id": str(uuid.uuid4()),
        "name": clinic_data.get("name"),
        "slug": slug,
        "description": clinic_data.get("description"),
        "address": clinic_data.get("address"),
        "city": clinic_data.get("city"),
        "state": clinic_data.get("state"),
        "zip_code": clinic_data.get("zip_code"),
        "phone": clinic_data.get("phone"),
        "specialty": clinic_data.get("specialty"),
        "languages": clinic_data.get("languages", ["English"]),
        "metadata": incoming_metadata,
        "is_telehealth_available": clinic_data.get("is_telehealth_available", False)
    }
    
    try:
        # Check if clinic already exists by slug (safer than name)
        existing = supabase.table("clinics").select("id, metadata").eq("slug", slug).execute()
        
        if existing.data and len(existing.data) > 0:
            existing_row = existing.data[0]
            existing_metadata = existing_row.get("metadata") or {}
            merged_metadata = {**existing_metadata, **incoming_metadata}
            for list_key in ["images", "reviews", "services", "insurance_accepted", "conditions_treated", "faqs", "third_party_profiles", "external_sources", "team_members", "highlights"]:
                if existing_metadata.get(list_key) and incoming_metadata.get(list_key):
                    merged_metadata[list_key] = _merge_lists(existing_metadata[list_key], incoming_metadata[list_key], list_key)
                elif existing_metadata.get(list_key) and not incoming_metadata.get(list_key):
                    merged_metadata[list_key] = existing_metadata[list_key]

            db_payload["id"] = existing_row["id"]
            db_payload["metadata"] = merged_metadata
            response = supabase.table("clinics").upsert(db_payload).execute()
            print(f"[*] Updated existing clinic in DB: {db_payload['name']}")
        else:
            response = supabase.table("clinics").insert(db_payload).execute()
            print(f"[*] Inserted new clinic into DB: {db_payload['name']}")
            
        return True
    except Exception as e:
        print(f"[!] DB Error: {e}")
        return False

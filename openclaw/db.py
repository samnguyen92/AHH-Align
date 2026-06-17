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


def _merge_lists(existing, incoming):
    """
    Merge scalar/object lists while preserving order and avoiding exact duplicates.
    """
    merged = []
    seen = set()
    for item in (existing or []) + (incoming or []):
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
            for list_key in ["images", "reviews", "services", "insurance_accepted", "conditions_treated", "faqs", "third_party_profiles", "external_sources"]:
                if existing_metadata.get(list_key) and incoming_metadata.get(list_key):
                    merged_metadata[list_key] = _merge_lists(existing_metadata[list_key], incoming_metadata[list_key])
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

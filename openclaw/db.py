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
    incoming_metadata = {
        "services": clinic_data.get("services", []),
        "working_hours": clinic_data.get("working_hours", {}),
    }
    if clinic_data.get("images"):
        incoming_metadata["images"] = clinic_data.get("images")

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
            if existing_metadata.get("images") and not incoming_metadata.get("images"):
                merged_metadata["images"] = existing_metadata["images"]

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

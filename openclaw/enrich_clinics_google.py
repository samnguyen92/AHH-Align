import os

from dotenv import load_dotenv
from supabase import Client, create_client

from google_places import enrich_clinic_with_google_places

load_dotenv(".env")
load_dotenv("../.env.local")


def main():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase secret key")

    supabase: Client = create_client(url, key)
    clinics = supabase.table("clinics").select(
        "id, name, slug, description, address, city, state, zip_code, phone, specialty, languages, metadata"
    ).execute().data or []

    updated = 0
    for clinic in clinics:
        metadata = clinic.get("metadata") or {}
        if metadata.get("google_place_id") and metadata.get("images") and metadata.get("reviews"):
            print(f"[*] Skipping already enriched clinic: {clinic['name']}")
            continue

        print(f"[*] Enriching clinic with Google Places: {clinic['name']}")
        enriched = enrich_clinic_with_google_places({**clinic, "images": metadata.get("images") or []})
        google_metadata = enriched.get("google_metadata")
        if not google_metadata:
            print(f"[!] No Google Places metadata found for: {clinic['name']}")
            continue

        next_metadata = {**metadata, **google_metadata}
        if enriched.get("images"):
            next_metadata["images"] = enriched["images"]
        if enriched.get("working_hours"):
            next_metadata["working_hours"] = {
                **(metadata.get("working_hours") or {}),
                **enriched["working_hours"],
            }

        payload = {"metadata": next_metadata}
        for field in ["address", "city", "state", "zip_code", "phone"]:
            if enriched.get(field) and not clinic.get(field):
                payload[field] = enriched[field]

        supabase.table("clinics").update(payload).eq("id", clinic["id"]).execute()
        updated += 1
        print(f"[+] Updated Google Places metadata: {clinic['name']}")

    print(f"[*] Done. Enriched {updated} clinics.")


if __name__ == "__main__":
    main()

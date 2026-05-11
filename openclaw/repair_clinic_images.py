import os

from dotenv import load_dotenv
from supabase import Client, create_client

from image_generator import generate_clinic_image

load_dotenv(".env")
load_dotenv("../.env.local")

BAD_IMAGE_MARKERS = ["/Users/", "source.unsplash.com"]


def has_usable_image(metadata: dict) -> bool:
    images = metadata.get("images") or []
    if not images:
        return False

    first_image = images[0]
    if not isinstance(first_image, str):
        return False

    return not any(marker in first_image for marker in BAD_IMAGE_MARKERS)


def main():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        raise RuntimeError("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase secret key")

    supabase: Client = create_client(url, key)
    clinics = supabase.table("clinics").select(
        "id, name, slug, city, state, specialty, languages, metadata"
    ).execute().data

    updated = 0
    for clinic in clinics:
        metadata = clinic.get("metadata") or {}
        if has_usable_image(metadata):
            print(f"[*] Skipping clinic with image: {clinic['name']}")
            continue

        print(f"[*] Generating directory image for: {clinic['name']}")
        image_url = generate_clinic_image(clinic)
        if not image_url:
            print(f"[!] No usable image returned for: {clinic['name']}")
            continue

        metadata["images"] = [image_url]
        supabase.table("clinics").update({"metadata": metadata}).eq("id", clinic["id"]).execute()
        updated += 1
        print(f"[+] Updated {clinic['name']}: {image_url}")

    print(f"[*] Done. Updated {updated} clinics.")


if __name__ == "__main__":
    main()

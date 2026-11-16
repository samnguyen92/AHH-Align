#!/usr/bin/env python3
"""
scripts/fetch_google_photos_local.py
Fetches authentic photos from Google Places Photo API and stores them directly
in the local volume `public/uploads/generated-clinics/google-places/`.
Updates PostgreSQL database records with local file paths.
"""

import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from typing import Dict, List, Optional

from dotenv import load_dotenv

# Add openclaw directory to path
_ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.join(_ROOT_DIR, "openclaw"))

load_dotenv(os.path.join(_ROOT_DIR, ".env.local"))
load_dotenv(os.path.join(_ROOT_DIR, "openclaw", ".env"))

from pg_client import create_client
from google_places import get_google_places_key, get_place_details, get_photo_uri

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None

UPLOADS_CLINICS_DIR = os.path.join(_ROOT_DIR, "public", "uploads", "generated-clinics", "google-places")
os.makedirs(UPLOADS_CLINICS_DIR, exist_ok=True)


def safe_slug(value: str) -> str:
    text = (value or "").replace("Đ", "D").replace("đ", "d")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()
    text = re.sub(r"[^a-z0-9\s._-]", "", text)
    text = re.sub(r"[\s_]+", "-", text).strip(".-")
    return text[:80] or "clinic"


def save_photo_webp(photo_url: str, dest_path: str, max_width: int = 1200) -> bool:
    """Download photo, optimize, convert to WebP, and save locally."""
    try:
        req = urllib.request.Request(photo_url, headers={"User-Agent": "Mozilla/5.0 AsianHealthHub/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()

        if Image:
            with Image.open(io.BytesIO(data)) as img:
                img = ImageOps.exif_transpose(img)
                if img.mode not in ("RGB", "RGBA"):
                    img = img.convert("RGBA" if "A" in img.getbands() else "RGB")

                w, h = img.size
                if w > max_width:
                    new_h = int(h * (max_width / w))
                    img = img.resize((max_width, new_h), Image.Resampling.LANCZOS)

                img.save(dest_path, format="WEBP", quality=82, method=6)
        else:
            with open(dest_path, "wb") as f:
                f.write(data)

        return True
    except Exception as exc:
        print(f"      [!] Failed to save photo to {dest_path}: {exc}")
        return False


def main():
    print("=== Starting Google Places Local Photo Pipeline ===")
    api_key = get_google_places_key()
    if not api_key:
        print("[!] No GOOGLE_PLACES_API_KEY found in .env.local or openclaw/.env.")
        print("    Please configure GOOGLE_PLACES_API_KEY to fetch authentic Google Photos.")
        return

    db = create_client()
    res = db.table("clinics").select("id, name, slug, specialty, metadata").execute()
    clinics = res.data or []
    print(f"[*] Found {len(clinics)} clinics in PostgreSQL database.")

    total_downloaded = 0

    for idx, clinic in enumerate(clinics, start=1):
        name = clinic.get("name") or "Clinic"
        slug = clinic.get("slug") or safe_slug(name)
        metadata = clinic.get("metadata") or {}
        place_id = metadata.get("google_place_id")

        if not place_id:
            continue

        existing_images = metadata.get("images") or []
        # Check if local image already exists
        primary_local_path = os.path.join(UPLOADS_CLINICS_DIR, f"{slug}-google-1.webp")
        if os.path.exists(primary_local_path) and os.path.getsize(primary_local_path) > 1000:
            continue

        print(f"[{idx}/{len(clinics)}] Fetching photos for: {name} (Place ID: {place_id})")
        details = get_place_details(place_id, api_key)
        photos = details.get("photos") or []

        if not photos:
            print(f"   [-] No photos listed on Google Places for {name}.")
            continue

        downloaded_urls = []
        for p_idx, photo in enumerate(photos[:3], start=1):
            photo_name = photo.get("name")
            if not photo_name:
                continue

            photo_uri = get_photo_uri(photo_name, api_key)
            if not photo_uri:
                continue

            file_name = f"{slug}-google-{p_idx}.webp"
            dest_file = os.path.join(UPLOADS_CLINICS_DIR, file_name)

            if save_photo_webp(photo_uri, dest_file):
                local_url = f"/uploads/generated-clinics/google-places/{file_name}"
                downloaded_urls.append(local_url)
                total_downloaded += 1
                print(f"   [+] Saved photo: {local_url}")

        if downloaded_urls:
            new_metadata = dict(metadata)
            new_metadata["images"] = downloaded_urls + [
                img for img in existing_images if not img.startswith("/generated-clinics/")
            ]
            db.table("clinics").update({"metadata": new_metadata}).eq("id", clinic["id"]).execute()
            print(f"   [*] Updated clinic metadata in DB with {len(downloaded_urls)} local photos.")

        time.sleep(0.3)

    print(f"\n=== Completed! Downloaded and saved {total_downloaded} local clinic photos ===")


if __name__ == "__main__":
    main()

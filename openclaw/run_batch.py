import os
import sys
from dotenv import load_dotenv

# Load env vars from openclaw/.env and Next.js ../.env.local
load_dotenv(".env")
load_dotenv("../.env.local")

from searcher import search_hospital_url
from scraper import scrape_content_from_url
from extractor import extract_clinic_data
from db import insert_clinic
from image_generator import generate_clinic_image
from google_places import enrich_clinic_with_google_places

# Targets provided by user
TARGETS = [
    {"name": "Northside Hospital Gwinnett", "domain": "northside.com"},
    {"name": "Northside Hospital Duluth", "domain": "northside.com"},
    {"name": "Piedmont Eastside Medical Center", "domain": "piedmont.org"},
    {"name": "Emory Johns Creek Hospital", "domain": "emoryhealthcare.org"},
    {"name": "Northeast Georgia Medical Center Braselton", "domain": "nghs.com"}
]

def check_env():
    missing = []
    if not os.environ.get("OPENROUTER_API_KEY"): missing.append("OPENROUTER_API_KEY")
    if not os.environ.get("NEXT_PUBLIC_SUPABASE_URL"): missing.append("NEXT_PUBLIC_SUPABASE_URL")
    if not (os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")):
        missing.append("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY")
    
    if missing:
        print(f"[!] Missing environment variables: {', '.join(missing)}")
        print("Please copy them from Next.js .env.local to openclaw/.env")
        sys.exit(1)

def main():
    print("=========================================")
    print(" OpenClaw AI Pipeline — Batch Processor  ")
    print("=========================================\n")
    
    check_env()

    success_count = 0

    for target in TARGETS:
        print(f"\n--- Processing: {target['name']} ---")
        
        # 1. Search
        url = search_hospital_url(target['name'], target['domain'])
        if not url:
            continue
            
        # 2. Scrape
        content = scrape_content_from_url(url)
        text = content["text"]
        if not text:
            print("[!] Failed to extract useful text.")
            continue
            
        # 3. Extract
        data = extract_clinic_data(target['name'], text)
        if not data:
            continue

        source_images = content.get("images", [])
        if source_images:
            data["images"] = source_images

        data = enrich_clinic_with_google_places(data)

        # Prefer Google Places photos when available; otherwise keep website images
        # or generate a fallback image.
        if not data.get("images"):
            generated_image = generate_clinic_image(data)
            if generated_image:
                data["images"] = [generated_image]
            
        # 4. Save
        success = insert_clinic(data)
        if success:
            success_count += 1

    print(f"\n=========================================")
    print(f" Batch complete! Successfully processed: {success_count}/{len(TARGETS)}")
    print("=========================================")

if __name__ == "__main__":
    main()

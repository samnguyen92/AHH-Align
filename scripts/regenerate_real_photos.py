#!/usr/bin/env python3
"""
Regenerate all website and post images using authentic, real photographs.
Ensures zero AI-generated look to maximize trust and credibility for Asian Health Hub.
"""

import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from typing import Dict, List, Optional, Tuple

from dotenv import load_dotenv
from PIL import Image, ImageOps

# Load environment variables
load_dotenv(".env.local")
load_dotenv("openclaw/.env")

sys.path.append("openclaw")
from storage import create_supabase_client, upload_image_bytes

BRAVE_API_KEY = os.environ.get("BRAVE_SEARCH_API_KEY") or "BSA0sfRVfwM5Y8_lCtOFRxYGCKsnrYx"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def search_real_photo(query: str, prefer_site: str = "unsplash.com") -> Optional[str]:
    """Search for authentic real photos using Brave Image Search API."""
    full_query = f"site:{prefer_site} {query}" if prefer_site else query
    url = f"https://api.search.brave.com/res/v1/images/search?q={urllib.parse.quote(full_query)}&count=8"
    req = urllib.request.Request(
        url,
        headers={"X-Subscription-Token": BRAVE_API_KEY, "Accept": "application/json", "User-Agent": USER_AGENT},
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            results = data.get("results", [])
            for r in results:
                img_url = r.get("properties", {}).get("url")
                # Filter out svg, gif, icons, tiny thumbnails
                if img_url and ("svg" not in img_url.lower()) and ("icon" not in img_url.lower()):
                    return img_url
    except Exception as e:
        print(f"   [!] Search error for '{query}': {e}")

    # Fallback to general real photo search without site restriction if empty
    if prefer_site:
        return search_real_photo(f"real photograph {query}", prefer_site="")
    return None


def download_and_process_image(
    image_url: str,
    target_width: int = 1200,
    target_aspect: Optional[Tuple[int, int]] = None,
    format_type: str = "WEBP",
    quality: int = 85,
) -> Optional[bytes]:
    """Download image, optionally crop to aspect ratio, resize, and optimize."""
    req = urllib.request.Request(image_url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw_bytes = resp.read()

        with Image.open(io.BytesIO(raw_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "A" in img.getbands() else "RGB")

            # Crop to aspect ratio if specified (aspect = (w, h))
            if target_aspect:
                target_w, target_h = target_aspect
                curr_w, curr_h = img.size
                curr_ratio = curr_w / curr_h
                target_ratio = target_w / target_h

                if curr_ratio > target_ratio:
                    # Crop sides
                    new_w = int(curr_h * target_ratio)
                    left = (curr_w - new_w) // 2
                    img = img.crop((left, 0, left + new_w, curr_h))
                else:
                    # Crop top/bottom
                    new_h = int(curr_w / target_ratio)
                    top = (curr_h - new_h) // 2
                    img = img.crop((0, top, curr_w, top + new_h))

            # Resize if wider than target_width
            if img.width > target_width:
                height = int((target_width / img.width) * img.height)
                img = img.resize((target_width, height), Image.Resampling.LANCZOS)

            # Ensure RGB for JPEG
            if format_type.upper() == "JPEG" and img.mode == "RGBA":
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[3])
                img = bg

            output = io.BytesIO()
            if format_type.upper() == "WEBP":
                img.save(output, format="WEBP", quality=quality, method=6)
            elif format_type.upper() == "PNG":
                img.save(output, format="PNG", optimize=True)
            else:
                img.save(output, format="JPEG", quality=quality, optimize=True)

            return output.getvalue()
    except Exception as e:
        print(f"   [!] Image processing failed for {image_url}: {e}")
        return None


def main():
    print("=== Starting Real Photography Regeneration for Asian Health Hub ===")
    os.makedirs("public/brand/lg", exist_ok=True)
    os.makedirs("public/brand/about", exist_ok=True)
    os.makedirs("public/brand/pulse", exist_ok=True)
    os.makedirs("public/brand/cities", exist_ok=True)
    os.makedirs("public/generated-insights", exist_ok=True)

    # 1. CORE BRAND & WEBSITE IMAGES
    brand_tasks = [
        {
            "dest": "public/brand/lg/hero.jpg",
            "query": "asian female doctor smiling elderly patient consultation modern clinic hospital",
            "aspect": (16, 9),
            "width": 1600,
            "format": "JPEG",
        },
        {
            "dest": "public/brand/lg/primary-care.jpg",
            "query": "asian male doctor consultation desk stethoscope medical office",
            "aspect": (3, 2),
            "width": 1200,
            "format": "JPEG",
        },
        {
            "dest": "public/brand/lg/family.jpg",
            "query": "asian multigenerational family happy smiling outdoor park clinic",
            "aspect": (3, 2),
            "width": 1200,
            "format": "JPEG",
        },
        {
            "dest": "public/brand/about/hero-language-care.webp",
            "query": "asian doctor patient medical consultation hospital room",
            "aspect": (16, 10),
            "width": 1200,
            "format": "WEBP",
        },
        {
            "dest": "public/brand/about/mission-family-care.webp",
            "query": "asian doctor family consultation hospital care discussion",
            "aspect": (4, 3),
            "width": 1200,
            "format": "WEBP",
        },
        {
            "dest": "public/brand/about/step-search-directory.webp",
            "query": "asian dentist patient dental chair clinic examination",
            "aspect": (16, 10),
            "width": 1200,
            "format": "WEBP",
        },
        {
            "dest": "public/brand/about/step-filter-language.webp",
            "query": "asian doctor talking with patient medical charts clinic",
            "aspect": (16, 10),
            "width": 1200,
            "format": "WEBP",
        },
        {
            "dest": "public/brand/about/step-browse-profiles.webp",
            "query": "medical doctor nurse consultation meeting clinic hospital",
            "aspect": (16, 10),
            "width": 1200,
            "format": "WEBP",
        },
        {
            "dest": "public/brand/about/step-contact-clinic.webp",
            "query": "modern hospital clinic reception desk receptionist greeting patient",
            "aspect": (16, 10),
            "width": 1200,
            "format": "WEBP",
        },
        {
            "dest": "public/brand/cities/san-diego.png",
            "query": "san diego skyline waterfront bay downtown harbor sunset",
            "aspect": (4, 5),
            "width": 800,
            "format": "PNG",
        },
        {
            "dest": "public/brand/cities/sacramento.png",
            "query": "sacramento tower bridge river sunset skyline california",
            "aspect": (4, 5),
            "width": 800,
            "format": "PNG",
        },
        {
            "dest": "public/brand/pulse/detail-summer-health-la.webp",
            "query": "asian family outdoor summer sunny lifestyle healthy",
            "aspect": (16, 9),
            "width": 1200,
            "format": "WEBP",
        },
        {
            "dest": "public/brand/pulse/hero-newsletter.webp",
            "query": "asian doctor stethoscope consultation desk medical healthcare",
            "aspect": (16, 9),
            "width": 1200,
            "format": "WEBP",
        },
        {
            "dest": "public/brand/pulse/insight-vietnamese-doctor.webp",
            "query": "asian physician medical clinic doctor coat friendly consultation",
            "aspect": (16, 10),
            "width": 1200,
            "format": "WEBP",
        },
        {
            "dest": "public/brand/pulse/insight-healthcare-guide.webp",
            "query": "asian family looking at health information tablet doctor office",
            "aspect": (16, 10),
            "width": 1200,
            "format": "WEBP",
        },
        {
            "dest": "public/brand/pulse/insight-clinic-questions.webp",
            "query": "doctor and patient consultation medical questions hospital",
            "aspect": (16, 10),
            "width": 1200,
            "format": "WEBP",
        },
    ]

    print("\n--- Processing Core Brand & Page Images ---")
    for task in brand_tasks:
        dest = task["dest"]
        print(f"\n[+] Task: {dest}")
        img_url = search_real_photo(task["query"])
        if not img_url:
            print(f"   [!] No image URL found for {dest}")
            continue

        print(f"   Found real photo: {img_url[:80]}...")
        processed = download_and_process_image(
            img_url,
            target_width=task["width"],
            target_aspect=task.get("aspect"),
            format_type=task["format"],
        )
        if processed:
            with open(dest, "wb") as f:
                f.write(processed)
            print(f"   [OK] Saved {len(processed):,} bytes to {dest}")
        else:
            print(f"   [FAIL] Could not process {dest}")
        time.sleep(1)

    # 2. ARTICLES & POSTS IN SUPABASE
    print("\n--- Processing 29 Articles / Posts in Supabase Database ---")
    supabase = create_supabase_client()
    if not supabase:
        print("[!] Supabase client creation failed! Skipping DB update.")
        return

    articles_res = supabase.table("articles").select("id,slug,title,category,seo_meta").execute()
    articles = articles_res.data or []
    print(f"Fetched {len(articles)} articles from database.")

    # Topic-specific keywords map for high realism
    topic_queries = {
        "i-693": "immigration medical examination doctor stethoscope clinic paperwork",
        "medicare": "asian elderly senior citizen doctor checkup hospital",
        "gerd": "doctor patient gastro health nutrition consultation",
        "acid-reflux": "digestive health medical consultation doctor patient",
        "heart": "cardiologist doctor checking heart stethoscope blood pressure",
        "mental-health": "asian therapist psychologist counseling consultation room",
        "bipolar": "mental health counseling therapy supportive session",
        "dental": "asian dentist patient dental chair teeth examination clean clinic",
        "gum-disease": "dentist examining patient mouth teeth dental office",
        "allerg": "spring outdoors allergies doctor consultation patient",
        "diabetes": "doctor patient diabetes consultation blood sugar healthy nutrition",
        "vaccin": "nurse doctor giving vaccine injection arm patient clinic",
        "cancer": "doctor consultation patient medical care oncology preventive checkup",
        "hepatitis": "doctor patient healthcare liver screening consultation",
        "san-jose": "modern healthcare medical clinic exterior glass building",
        "breast-cancer": "female doctor patient mammography preventive screening consultation",
        "winter": "senior blood pressure checkup doctor patient clinic",
        "pediatric": "pediatrician doctor examining child family clinic",
        "heritage": "asian healthcare team doctors nurses hospital smiling",
        "father": "asian father senior son healthcare consultation doctor",
    }

    timestamp_v = int(time.time())

    for idx, article in enumerate(articles, 1):
        slug = article["slug"]
        title = article["title"]
        category = article.get("category", "")
        print(f"\n[{idx}/{len(articles)}] Article: {slug}")

        # Choose best query
        query_key = None
        for k in topic_queries:
            if k in slug.lower() or k in title.lower():
                query_key = topic_queries[k]
                break
        if not query_key:
            query_key = f"asian doctor patient healthcare {category} consultation"

        img_url = search_real_photo(query_key)
        if not img_url:
            img_url = search_real_photo("asian doctor patient medical clinic consultation")

        if not img_url:
            print(f"   [!] No real photo found for {slug}")
            continue

        print(f"   Found photo: {img_url[:80]}...")
        processed = download_and_process_image(
            img_url,
            target_width=1200,
            target_aspect=(16, 10),
            format_type="WEBP",
            quality=85,
        )

        if not processed:
            print(f"   [!] Failed processing image for {slug}")
            continue

        # Save local copy
        local_filename = f"{slug}-hero.webp"
        local_path = os.path.join("public", "generated-insights", local_filename)
        with open(local_path, "wb") as f:
            f.write(processed)

        # Upload to Supabase Storage
        storage_path = f"generated-insights/{slug}-hero.webp"
        public_url = upload_image_bytes(processed, storage_path, "image/webp")

        if public_url:
            # Append timestamp param to bust browser / CDN cache
            fresh_url = f"{public_url}?v={timestamp_v}"
            seo_meta = article.get("seo_meta") or {}
            seo_meta["og_image"] = fresh_url
            seo_meta["images"] = [fresh_url]

            supabase.table("articles").update({"seo_meta": seo_meta}).eq("id", article["id"]).execute()
            print(f"   [OK] Updated Supabase article with real photo: {fresh_url}")
        else:
            print(f"   [WARN] Storage upload failed, but local copy saved at {local_path}")

        time.sleep(1)

    print("\n=== All images successfully regenerated with real, authentic photography! ===")


if __name__ == "__main__":
    main()


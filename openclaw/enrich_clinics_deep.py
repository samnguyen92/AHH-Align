#!/usr/bin/env python3
"""
openclaw/enrich_clinics_deep.py
Unified deep enrichment pipeline runnable 100% inside the asian-health-hub-openclaw container.
- Scrapes real high-res photos from Google Maps via Playwright
- Saves unique photos directly to /app/public/uploads/generated-clinics/google-places/
- Deep crawls clinic website for pricing, faqs, services, insurance
- Calls OpenRouter AI to extract structured Pricing & FAQs
- Hides pricing if no public pricing found
- Updates PostgreSQL database directly via psycopg2
"""

import os
import sys
import json
import time
import hashlib
import urllib.request
import urllib.parse
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor

# Add openclaw directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scrape_gmaps_photos import get_photos
from scrape_deep_website import crawl_site

ROOT_DIR = Path("/app") if Path("/app/public").exists() else Path(__file__).resolve().parent.parent
UPLOADS_DIR = ROOT_DIR / "public" / "uploads" / "generated-clinics" / "google-places"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Load environment
def load_env():
    env_vars = {}
    for env_path in [ROOT_DIR / ".env.local", ROOT_DIR / "openclaw" / ".env"]:
        if env_path.exists():
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        env_vars[k.strip()] = v.strip().strip("'\"")
    return env_vars

ENV = load_env()
OPENROUTER_KEY = (
    os.environ.get("OPENROUTER_API_KEY")
    or ENV.get("OPENROUTER_API_KEY")
)

def get_db_connection():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        # In Docker container
        db_url = "postgresql://postgres:ahh_secure_pass_2026@db:5432/asian_health_hub"
    conn = None
    try:
        conn = psycopg2.connect(db_url)
    except Exception:
        # Fallback to localhost:5433
        conn = psycopg2.connect("postgresql://postgres:ahh_secure_pass_2026@127.0.0.1:5433/asian_health_hub")
    
    # Ensure status column exists in clinics table
    try:
        with conn.cursor() as cur:
            cur.execute("""
                ALTER TABLE clinics ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
                UPDATE clinics SET status = 'published' WHERE status IS NULL;
            """)
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"[!] ensure_schema notice: {e}")

    return conn

def detect_extension(buf: bytes) -> str:
    if len(buf) > 3 and buf[0] == 0xFF and buf[1] == 0xD8 and buf[2] == 0xFF:
        return "jpg"
    if len(buf) > 4 and buf[0] == 0x89 and buf[1] == 0x50 and buf[2] == 0x4E and buf[3] == 0x47:
        return "png"
    if len(buf) > 12 and buf[0:4] == b"RIFF" and buf[8:12] == b"WEBP":
        return "webp"
    return "jpg"

def download_photo(url: str, timeout: int = 12) -> bytes:
    try:
        if url.startswith("//"):
            url = "https:" + url
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as response:
            data = response.read()
            if len(data) >= 4000:
                return data
    except Exception:
        pass
    return None

def extract_with_openrouter(clinic: dict, crawled_data: dict) -> dict:
    pages = crawled_data.get("pages", [])
    compiled = []
    for p in pages:
        compiled.append(f"=== PAGE: {p['url']} (Type: {p.get('type')}, Title: {p.get('title')}) ===\n{p.get('content', '')[:4500]}")
    compiled_text = "\n\n".join(compiled)[:22000]

    prompt = f"""You are a medical directory data extraction specialist preparing verified data for the Asian Health Hub.
Extract and compile information for this clinic strictly adhering to the schema below.

Clinic Name: {clinic['name']}
Specialty: {clinic.get('specialty') or 'General Healthcare'}
Address: {clinic.get('address')}, {clinic.get('city')}, {clinic.get('state')}
Languages: {', '.join(clinic.get('languages') or [])}

=== CRAWLED WEBSITE PAGES CONTENT ===
{compiled_text}

STRICT EXTRACTION RULES:
1. PRICING:
   - Search the crawled text thoroughly for any explicit fees, consultation prices, service costs, or rates (e.g. from /pricing, /rates, /fees, or home page).
   - If genuine pricing is found, extract items into "pricing" array: [{{ "name": "Item Name", "price": "$150", "price_range": null, "notes": "notes if any", "category": "Category" }}].
   - If genuine starting prices are found, populate "pricing_summary": {{ "starting_price": "$100", "starting_unit": "per visit", "payment_methods": "Visa, MC, Cash", "accepts_hsa_fsa": true/false }}.
   - IMPORTANT: If NO genuine prices are mentioned anywhere on the site, you MUST return "pricing": [] and "pricing_summary": null. DO NOT invent or guess any prices!
2. FAQ:
   - If genuine FAQs exist on the website, extract them faithfully into "faqs": [{{ "question": "...", "answer": "..." }}].
   - If the website does NOT have an FAQ section, generate 3 to 4 SAFE, accurate general FAQs covering: (1) Languages spoken and bilingual staff comfort, (2) Booking and scheduling process, (3) What to prepare for the first visit, (4) Insurance / superbill / payment methods.
   - Do NOT mention fake prices in FAQs.
3. NEXT HEALTH METADATA:
   - "what_to_know": 2-3 items with {{ "title": "...", "detail": "..." }}
   - "differentiators": 2-3 items with {{ "title": "...", "detail": "..." }}
   - "before_you_book": 2-3 items with {{ "title": "...", "detail": "..." }}
   - "cultural_context": 1 paragraph on cultural and language competence in {', '.join(clinic.get('languages') or [])}.
   - "services_offered": 3-6 items with {{ "name": "...", "category": "...", "description": "...", "is_featured": boolean }}

Return ONLY valid JSON matching this structure:
{{
  "pricing": [],
  "pricing_summary": null,
  "faqs": [],
  "what_to_know": [],
  "differentiators": [],
  "before_you_book": [],
  "cultural_context": "...",
  "services_offered": []
}}"""

    req_body = json.dumps({
        "model": "deepseek/deepseek-v4-flash",
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=req_body,
        headers={
            "Authorization": f"Bearer {OPENROUTER_KEY}",
            "Content-Type": "application/json"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"]
            return json.loads(content)
    except Exception as e:
        print(f"   [!] LLM error: {e}")
        return None

def calculate_score(m: dict, photos_count: int) -> int:
    score = 0
    if photos_count >= 5: score += 20
    elif photos_count >= 3: score += 15
    elif photos_count >= 1: score += 10

    if len(m.get("what_to_know") or []) >= 2: score += 15
    if len(m.get("differentiators") or []) >= 2: score += 15
    if len(m.get("before_you_book") or []) >= 2: score += 10
    if len(m.get("services_offered") or []) >= 3: score += 10
    if m.get("cultural_context"): score += 10
    if len(m.get("faqs") or []) >= 3: score += 10
    if len(m.get("pricing") or []) > 0: score += 10

    return min(100, score)

def enrich_clinic(conn, clinic: dict):
    print("\n" + "=" * 55)
    print(f"[*] Processing: {clinic['name']} ({clinic.get('city')}, {clinic.get('state')})")
    print("=" * 55)

    meta = clinic.get("metadata") or {}
    slug = clinic.get("slug") or f"clinic-{clinic['id']}"
    website = meta.get("website") or meta.get("source_url") or meta.get("google_website_url")
    place_id = meta.get("google_place_id")

    # 1. Scrape real Google Maps photos
    print(f"   [*] Fetching real Google Maps photos for place ID {place_id or 'N/A'}...")
    candidate_urls = []
    if place_id:
        try:
            g_photos = get_photos(place_id, max_photos=15)
            print(f"   [+] Found {len(g_photos)} Google Maps photos.")
            candidate_urls.extend(g_photos)
        except Exception as e:
            print(f"   [!] Error getting Google Maps photos: {e}")

    # Download photos
    saved_urls = []
    seen_hashes = set()
    p_idx = 1

    for img_url in candidate_urls:
        if len(saved_urls) >= 10:
            break
        buf = download_photo(img_url)
        if not buf:
            continue
        h = hashlib.md5(buf).hexdigest()
        if h in seen_hashes:
            continue
        seen_hashes.add(h)

        ext = detect_extension(buf)
        fname = f"{slug}-google-{p_idx}.{ext}"
        fpath = UPLOADS_DIR / fname
        with open(fpath, "wb") as f:
            f.write(buf)
        saved_urls.append(f"/uploads/generated-clinics/google-places/{fname}")
        p_idx += 1

    print(f"   [+] Successfully saved {len(saved_urls)} real photos to disk.")

    # 2. Deep crawl website
    print(f"   [*] Deep crawling website: {website}...")
    crawl_result = {"pages": []}
    if website:
        try:
            crawl_result = crawl_site(website, max_pages=10)
            print(f"   [+] Pages crawled: {len(crawl_result.get('pages', []))}")
        except Exception as e:
            print(f"   [!] Deep crawl error: {e}")

    # 3. AI extraction
    print(f"   [*] Extracting Pricing, FAQs, and NEXT HEALTH data via AI...")
    extracted = extract_with_openrouter(clinic, crawl_result)

    new_meta = dict(meta)

    # Images
    if saved_urls:
        new_meta["images"] = saved_urls
    new_meta["gallery_images"] = []

    if extracted:
        # Pricing
        if extracted.get("pricing"):
            new_meta["pricing"] = extracted["pricing"]
            new_meta["pricing_summary"] = extracted.get("pricing_summary")
            print(f"   [+] Found {len(extracted['pricing'])} PRICING ITEMS!")
        else:
            new_meta["pricing"] = []
            new_meta["pricing_summary"] = None
            print("   [-] No public pricing found on site. Pricing section will be hidden.")

        # FAQs
        if extracted.get("faqs"):
            new_meta["faqs"] = extracted["faqs"]
            print(f"   [+] Added {len(extracted['faqs'])} FAQs!")

        # Next health
        for k in ["what_to_know", "differentiators", "before_you_book", "cultural_context", "services_offered"]:
            if extracted.get(k):
                new_meta[k] = extracted[k]

    # Score & status
    score = calculate_score(new_meta, len(new_meta.get("images") or []))
    new_meta["completeness_score"] = score
    status = "published" if score >= 70 else "draft"

    print(f"   [*] Score: {score}/100 -> Status: {status.upper()}")

    with conn.cursor() as cur:
        cur.execute(
            "UPDATE clinics SET metadata = %s, status = %s WHERE id = %s",
            (json.dumps(new_meta), status, clinic["id"])
        )
    conn.commit()
    print("   [✓] Clinic updated in PostgreSQL!")

def main():
    args = sys.argv[1:]
    target_slug = None
    sample_count = 0
    is_all = False

    for a in args:
        if a.startswith("--slug="):
            target_slug = a.split("=", 1)[1]
        elif a.startswith("--sample="):
            sample_count = int(a.split("=", 1)[1])
        elif a == "--all":
            is_all = True

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if target_slug:
                cur.execute("SELECT * FROM clinics WHERE slug = %s", (target_slug,))
                rows = cur.fetchall()
                if not rows:
                    print(f"Clinic not found with slug: {target_slug}")
                    return
                enrich_clinic(conn, rows[0])
            elif sample_count > 0:
                print(f"[*] Running sample test on {sample_count} diverse clinics...")
                cur.execute("""
                    SELECT * FROM clinics
                    WHERE languages && ARRAY['Vietnamese', 'Korean', 'Chinese', 'Mandarin', 'Cantonese']
                    ORDER BY (metadata->>'rating')::numeric DESC NULLS LAST
                    LIMIT %s
                """, (sample_count,))
                rows = cur.fetchall()
                for c in rows:
                    enrich_clinic(conn, c)
            elif is_all:
                print("[*] Running on all top 100 clinics...")
                cur.execute("""
                    SELECT * FROM clinics
                    WHERE languages && ARRAY['Vietnamese', 'Korean', 'Chinese', 'Mandarin', 'Cantonese']
                    ORDER BY (metadata->>'rating')::numeric DESC NULLS LAST
                    LIMIT 100
                """)
                rows = cur.fetchall()
                for idx, c in enumerate(rows):
                    print(f"\n[{idx + 1}/{len(rows)}]")
                    enrich_clinic(conn, c)
            else:
                print("Usage:")
                print("  python enrich_clinics_deep.py --slug=metro-acupuncture")
                print("  python enrich_clinics_deep.py --sample=10")
                print("  python enrich_clinics_deep.py --all")
    finally:
        conn.close()

if __name__ == "__main__":
    main()

import os
import re
from dotenv import load_dotenv
from supabase import create_client, Client

# Load env
load_dotenv("openclaw/.env")
load_dotenv(".env.local")

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

def generate_slug(text):
    text = text.lower()
    # Remove special characters
    text = re.sub(r'[^\w\s-]', '', text)
    # Replace spaces and underscores with hyphens
    text = re.sub(r'[\s_-]+', '-', text)
    # Remove leading/trailing hyphens
    text = text.strip('-')
    return text

def run_migration():
    print("[*] Starting migration: Adding slug column...")
    
    # Step 1: Add column via RPC or Raw SQL if possible. 
    # Since we can't easily run arbitrary SQL via client without RPC, 
    # we'll assume the column might not exist and try to use it.
    # Actually, it's better to tell the user to run the SQL for safety,
    # OR use the 'postgres' connection if we had it.
    # Let's try to update existing records assuming the column exists.
    
    try:
        res = supabase.table("clinics").select("id", "name").execute()
        clinics = res.data
        print(f"[*] Found {len(clinics)} clinics to update.")
        
        for clinic in clinics:
            slug = generate_slug(clinic['name'])
            # We add a small random suffix if there are duplicates, but for now simple
            supabase.table("clinics").update({"slug": slug}).eq("id", clinic['id']).execute()
            print(f"[+] Updated: {clinic['name']} -> {slug}")
            
    except Exception as e:
        print(f"[!] Migration failed: {e}")
        print("[!] Please make sure to run 'ALTER TABLE clinics ADD COLUMN slug TEXT UNIQUE;' in Supabase SQL Editor first.")

if __name__ == "__main__":
    run_migration()

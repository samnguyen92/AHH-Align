import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(".env.local")
load_dotenv("openclaw/.env")

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

res = supabase.table("articles").select("slug").execute()
for a in res.data:
    slug = a['slug']
    print(f"Slug: '{slug}'")
    print(f"Length: {len(slug)}")

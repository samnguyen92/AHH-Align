import os
import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}"
}

# Test searching for the article by slug
slug = "a-complete-guide-to-the-i-693-medical-examination-for-us-immigration-essential-information-for-the-asian-american-community"
endpoint = f"{url}/rest/v1/articles?slug=eq.{slug}&status=eq.published"
res = requests.get(endpoint, headers=headers)
print(f"Slug Query Status: {res.status_code}")
print(f"Slug Query Result: {res.json()}")


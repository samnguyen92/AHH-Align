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

endpoint = f"{url}/rest/v1/articles?select=*"
res = requests.get(endpoint, headers=headers)
print(f"Status: {res.status_code}")
print(f"Body: {res.text}")

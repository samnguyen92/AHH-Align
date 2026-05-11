import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(".env.local")
load_dotenv("openclaw/.env")

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

# Path to the generated image (using a relative-looking path for the UI)
image_path = "/Users/sam92/.gemini/antigravity/brain/c72f69e8-9a32-4d02-89e8-1b667e32978b/i693_medical_exam_guide_1778406809156.png"

# Update existing article
res = supabase.table("articles").update({
    "seo_meta": {
        "description": "Learn everything about the I-693 medical examination for US immigration...",
        "keywords": ["I-693", "USCIS", "Green Card", "Health Exam"],
        "og_image": image_path
    }
}).eq("slug", "a-complete-guide-to-the-i-693-medical-examination-for-us-immigration-essential-information-for-the-asian-american-community").execute()

print(f"Updated article with image: {image_path}")

import base64
import json
import os
import re
import urllib.parse
import urllib.request
from typing import Optional

from openai import OpenAI
from storage import upload_image_value

IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"
NATURAL_PHOTO_STYLE = (
    "Shot on Sony A7R IV, 50mm lens, f/2.8 depth of field. "
    "Natural skin texture, subtle wrinkles, unretouched, candid, highly detailed, "
    "photorealistic, everyday life."
)


def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-")


def extract_image_value(message) -> Optional[str]:
    images = getattr(message, "images", None)
    if images:
        first_image = images[0]
        image_url = first_image.get("image_url") if isinstance(first_image, dict) else getattr(first_image, "image_url", None)
        if isinstance(image_url, dict):
            return image_url.get("url")
        if hasattr(image_url, "url"):
            return image_url.url

    content = (message.content or "").strip()
    if content.startswith("http") or content.startswith("data:image/"):
        return content

    return None


def save_generated_image(image_value: Optional[str], slug: str) -> Optional[str]:
    if not image_value:
        return None

    cloud_url = upload_image_value(image_value, "generated-clinics", slug)
    if cloud_url:
        return cloud_url

    if image_value.startswith("http"):
        return image_value

    if image_value.startswith("data:image/"):
        header, encoded = image_value.split(",", 1)
        extension = header.split(";")[0].split("/")[-1] or "png"
        output_dir = os.path.join("..", "public", "generated-clinics")
        os.makedirs(output_dir, exist_ok=True)
        filename = f"{slug}.{extension}"
        output_path = os.path.join(output_dir, filename)

        with open(output_path, "wb") as image_file:
            image_file.write(base64.b64decode(encoded))

        return f"/generated-clinics/{filename}"

    return None


def search_real_clinic_photo(specialty: str, city: str) -> Optional[str]:
    """Search for authentic real clinic/medical photography on Unsplash."""
    brave_key = os.environ.get("BRAVE_SEARCH_API_KEY")
    if not brave_key:
        return None

    spec = specialty or "medical clinic"
    query = f"site:unsplash.com modern {spec} clinic doctor office consultation"
    url = f"https://api.search.brave.com/res/v1/images/search?q={urllib.parse.quote(query)}&count=5"
    req = urllib.request.Request(
        url,
        headers={"X-Subscription-Token": brave_key, "Accept": "application/json", "User-Agent": "AsianHealthHub/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            for item in data.get("results", []):
                img_url = item.get("properties", {}).get("url")
                if img_url and ("svg" not in img_url.lower()) and ("icon" not in img_url.lower()):
                    return img_url
    except Exception as exc:
        print(f"[!] Real clinic photo search error: {exc}")
    return None


def generate_clinic_image(clinic_data: dict) -> Optional[str]:
    name = clinic_data.get("name") or "Asian Health Hub clinic"
    specialty = clinic_data.get("specialty") or "healthcare"
    city = clinic_data.get("city") or "the United States"
    languages = ", ".join(clinic_data.get("languages") or ["English"])
    slug = slugify(name)

    # 1. Prefer authentic real photography
    real_photo_url = search_real_clinic_photo(specialty, city)
    if real_photo_url:
        print(f"[+] Found authentic real clinic photo for {name}: {real_photo_url}")
        cloud_url = save_generated_image(real_photo_url, slug)
        if cloud_url:
            return cloud_url

    # 2. Fallback to AI image preview if search fails
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("[!] OPENROUTER_API_KEY is not set; skipping fallback image generation.")
        return None

    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
    prompt = (
        "Create a photorealistic documentary-style editorial healthcare photograph for a directory card. "
        "It must look like a credible real photo, not AI art: welcoming modern clinic interior or exterior, warm natural light, clean medical environment, "
        "authentic human expressions, natural skin texture, subtle wrinkles, unretouched candid faces, believable hands, diverse Asian American patients or staff when people are present. "
        f"{NATURAL_PHOTO_STYLE} "
        "No logos, no text, no readable signage, no illustration, no cartoon, no 3D render, no infographic, no plastic skin, no exaggerated stock-photo posing. "
        f"Clinic context: {name}, {specialty}, {city}. Languages: {languages}."
    )

    try:
        print(f"[*] Generating clinic image via {IMAGE_MODEL}: {name}")
        response = client.chat.completions.create(
            model=IMAGE_MODEL,
            messages=[{"role": "user", "content": prompt}],
        )
        image_value = extract_image_value(response.choices[0].message)
        return save_generated_image(image_value, slug)
    except Exception as exc:
        print(f"[!] Clinic image generation failed for {name}: {exc}")
        return None

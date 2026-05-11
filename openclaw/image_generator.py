import base64
import os
import re
from typing import Optional

from openai import OpenAI

IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"


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


def generate_clinic_image(clinic_data: dict) -> Optional[str]:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("[!] OPENROUTER_API_KEY is not set; skipping image generation.")
        return None

    name = clinic_data.get("name") or "Asian Health Hub clinic"
    specialty = clinic_data.get("specialty") or "healthcare"
    city = clinic_data.get("city") or "the United States"
    languages = ", ".join(clinic_data.get("languages") or ["English"])
    slug = slugify(name)

    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
    prompt = (
        "Create a realistic, polished editorial photo-style image for a healthcare directory card. "
        "Show a welcoming modern clinic interior or exterior, warm natural light, clean medical environment, "
        "diverse Asian American patients or staff when people are present, no logos, no text, no readable signage. "
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

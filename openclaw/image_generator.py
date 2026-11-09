import base64
import os
import re
from typing import Optional

from openai import OpenAI
from storage import upload_image_value

# Models are configurable via .env. Primary -> fallback is tried in order.
IMAGE_MODEL = os.environ.get("OPENCLAW_IMAGE_MODEL", "openai/gpt-image-2.5-sunburst")
IMAGE_FALLBACK_MODEL = os.environ.get("OPENCLAW_IMAGE_FALLBACK_MODEL", "google/gemini-3.1-flash-image")

# Shared prompt building blocks. The goal is a believable documentary photograph, never stock/AI gloss,
# and NEVER any text, watermark or stamp inside the frame.
PHOTO_REALISM = (
    "Photojournalistic documentary photograph, shot on a full-frame camera with a 35mm or 50mm prime lens at f/4, "
    "available natural light only (window light or ordinary overhead clinic lighting), slightly muted realistic colour, "
    "very fine natural grain, a little imperfect framing as if taken by a staff photographer on an ordinary day. "
    "People, if any, are candid and mid-action (talking, reading a chart, listening), not looking at the camera, "
    "with natural skin texture, visible pores, small asymmetries, flyaway hair and ordinary everyday clothing."
)
PHOTO_NEGATIVE = (
    "Absolutely NO text, letters, numbers, logos, signage, captions, watermarks, stamps, borders or UI overlays anywhere in the image. "
    "Not an illustration, painting, 3D render, cartoon or infographic. Avoid plastic or waxy skin, perfect symmetry, "
    "over-smiling stock-photo poses, glossy HDR, oversaturated colours, shallow bokeh blobs, distorted hands or extra fingers, "
    "fake-looking medical equipment, and gibberish writing on walls or screens."
)


def build_clinic_prompt(clinic_data: dict) -> str:
    name = clinic_data.get("name") or "a community clinic"
    specialty = (clinic_data.get("specialty") or "healthcare").strip()
    city = clinic_data.get("city") or "a US city"
    state = clinic_data.get("state") or ""
    languages = [lang for lang in (clinic_data.get("languages") or []) if str(lang).lower() != "english"]
    cultural = (
        f"Subtle cues of a neighbourhood serving {', '.join(languages)}-speaking families are fine (e.g. a multilingual-looking waiting area) "
        "but must not rely on readable text. "
        if languages
        else ""
    )
    return (
        f"Wide 4:3 photograph of the real-feeling interior of a small independent {specialty} clinic in {city}{', ' + state if state else ''}: "
        "the reception and waiting area or a bright treatment room, clean but lived-in, with ordinary furniture, a few plants, "
        "paperwork on the desk and slightly worn details. No patients' faces in focus; at most one staff member seen from behind or at the edge of the frame. "
        f"{cultural}{PHOTO_REALISM} {PHOTO_NEGATIVE} Clinic context (do not render the name): {name}."
    )


def build_article_prompt(topic: str) -> str:
    return (
        "Editorial photograph for a patient-education health article about Asian American families and healthcare. "
        f"Scene: {topic}. Show a believable everyday healthcare or family-care moment with ordinary diverse Asian American people "
        "in a real clinic, pharmacy, kitchen or living room, appropriate to the topic. "
        f"{PHOTO_REALISM} {PHOTO_NEGATIVE}"
    )


def generate_image_value(client: OpenAI, prompt: str) -> Optional[str]:
    """Generate one image trying IMAGE_MODEL then IMAGE_FALLBACK_MODEL. Returns data URL / URL or None."""
    for model in [m for m in (IMAGE_MODEL, IMAGE_FALLBACK_MODEL) if m]:
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                extra_body={"modalities": ["image", "text"]},
            )
            image_value = extract_image_value(response.choices[0].message)
            if image_value:
                print(f"[+] Image generated via {model}")
                return image_value
            print(f"[!] {model} returned no image; trying next model.")
        except Exception as exc:
            print(f"[!] Image model {model} failed: {exc}")
    return None


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


def generate_clinic_image(clinic_data: dict) -> Optional[str]:
    """Generate a realistic clinic photo (used only when no real photo from the website/Google Places exists)."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("[!] OPENROUTER_API_KEY is not set; skipping image generation.")
        return None

    name = clinic_data.get("name") or "Asian Health Hub clinic"
    slug = slugify(name)
    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=120.0)
    print(f"[*] Generating clinic image: {name}")
    image_value = generate_image_value(client, build_clinic_prompt(clinic_data))
    return save_generated_image(image_value, slug) if image_value else None

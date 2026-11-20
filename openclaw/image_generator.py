import base64
import os
import re
from typing import Optional

from openai import OpenAI
from storage import upload_image_value
from image_style import build_image_messages, mosaic_prompt

# Models are configurable via .env. Primary -> fallback is tried in order.
IMAGE_MODEL = os.environ.get("OPENCLAW_IMAGE_MODEL", "openai/gpt-image-2.5-sunburst")
IMAGE_FALLBACK_MODEL = os.environ.get("OPENCLAW_IMAGE_FALLBACK_MODEL", "google/gemini-3.1-flash-image")

# The look of every generated image is defined in image_style.py (Mosaic redesign style + reference photos).


def build_article_prompt(topic: str) -> str:
    return mosaic_prompt(
        "article",
        f"{topic}. A believable everyday healthcare or family-care moment with ordinary Asian American people, "
        "appropriate to the topic",
    )


def generate_image_value(client: OpenAI, prompt: str, kind: str = "article") -> Optional[str]:
    """Generate one image in the Mosaic style (reference photos attached), trying IMAGE_MODEL then
    IMAGE_FALLBACK_MODEL. If a model rejects image input, retry it text-only. Returns data URL / URL or None."""
    for model in [m for m in (IMAGE_MODEL, IMAGE_FALLBACK_MODEL) if m]:
        for with_refs in (True, False):
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=build_image_messages(prompt, kind, with_references=with_refs),
                    extra_body={"modalities": ["image", "text"]},
                )
                image_value = extract_image_value(response.choices[0].message)
                if image_value:
                    print(f"[+] Image generated via {model} ({'with' if with_refs else 'without'} style references)")
                    return image_value
                print(f"[!] {model} returned no image ({'with' if with_refs else 'without'} references).")
            except Exception as exc:
                print(f"[!] Image model {model} failed ({'with' if with_refs else 'without'} references): {exc}")
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

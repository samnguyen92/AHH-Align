import base64
import os
from typing import Optional

from dotenv import load_dotenv
from openai import OpenAI
from supabase import Client, create_client

load_dotenv(".env")
load_dotenv("../.env.local")

IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"
BAD_IMAGE_MARKERS = ["/Users/", "source.unsplash.com"]


def is_bad_image_url(value: Optional[str]) -> bool:
    if not value:
        return True

    return any(marker in value for marker in BAD_IMAGE_MARKERS)


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
        output_dir = os.path.join("..", "public", "generated-insights")
        os.makedirs(output_dir, exist_ok=True)
        filename = f"{slug}.{extension}"
        output_path = os.path.join(output_dir, filename)

        with open(output_path, "wb") as image_file:
            image_file.write(base64.b64decode(encoded))

        return f"/generated-insights/{filename}"

    return None


def generate_article_image(client: OpenAI, article: dict) -> Optional[str]:
    prompt = (
        "Create a polished editorial healthcare illustration for Asian Health Hub. "
        "Use a clean, trustworthy medical style, natural light, diverse Asian American patients, "
        "and no text in the image. "
        f"Article title: {article.get('title')}. "
        f"Summary: {article.get('excerpt') or article.get('category') or 'healthcare guide'}."
    )

    response = client.chat.completions.create(
        model=IMAGE_MODEL,
        messages=[{"role": "user", "content": prompt}],
    )

    image_value = extract_image_value(response.choices[0].message)
    return save_generated_image(image_value, article["slug"])


def main():
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not openrouter_key or not supabase_url or not supabase_key:
        raise RuntimeError("Missing OPENROUTER_API_KEY, NEXT_PUBLIC_SUPABASE_URL, or Supabase secret key")

    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=openrouter_key)
    supabase: Client = create_client(supabase_url, supabase_key)

    articles = supabase.table("articles").select("id, slug, title, excerpt, category, seo_meta").execute().data

    for article in articles:
        seo_meta = article.get("seo_meta") or {}
        current_image = seo_meta.get("og_image")

        if not is_bad_image_url(current_image):
            print(f"[*] Skipping valid image: {article['title']}")
            continue

        print(f"[*] Generating image for: {article['title']}")
        image_url = generate_article_image(client, article)

        if not image_url:
            print(f"[!] No usable image returned for: {article['title']}")
            continue

        seo_meta["og_image"] = image_url
        supabase.table("articles").update({"seo_meta": seo_meta}).eq("id", article["id"]).execute()
        print(f"[+] Updated image: {image_url}")


if __name__ == "__main__":
    main()

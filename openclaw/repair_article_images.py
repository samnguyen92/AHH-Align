import base64
import os
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from openai import OpenAI
from supabase import Client, create_client
from storage import upload_image_value

load_dotenv(".env")
load_dotenv("../.env.local")

IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"
NATURAL_PHOTO_STYLE = (
    "Shot on Sony A7R IV, 50mm lens, f/2.8 depth of field. "
    "Natural skin texture, subtle wrinkles, unretouched, candid, highly detailed, "
    "photorealistic, everyday life."
)
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


def save_generated_image(image_value: Optional[str], slug: str, suffix: str = "repair") -> Optional[str]:
    if not image_value:
        return None

    cloud_url = upload_image_value(image_value, "generated-insights", f"{slug}-{suffix}")
    if cloud_url:
        return cloud_url

    if image_value.startswith("http"):
        return image_value

    if image_value.startswith("data:image/"):
        header, encoded = image_value.split(",", 1)
        extension = header.split(";")[0].split("/")[-1] or "png"
        output_dir = os.path.join("..", "public", "generated-insights")
        os.makedirs(output_dir, exist_ok=True)
        filename = f"{slug}-{suffix}.{extension}"
        output_path = os.path.join(output_dir, filename)

        with open(output_path, "wb") as image_file:
            image_file.write(base64.b64decode(encoded))

        return f"/generated-insights/{filename}"

    return None


def generate_article_image(client: OpenAI, article: dict, image_index: int = 1, run_id: Optional[str] = None) -> Optional[str]:
    image_role = "hero cover" if image_index == 1 else f"supporting inline image {image_index - 1}"
    prompt = (
        "Create a photorealistic documentary-style editorial healthcare photograph for Asian Health Hub. "
        "The image must look like a credible real photograph, not AI art: natural available light, realistic clinic or home details, "
        "authentic human expressions, natural skin texture, subtle wrinkles, unretouched candid faces, believable hands, diverse Asian American patients when people are shown, "
        f"{NATURAL_PHOTO_STYLE} "
        "accurate healthcare context, no text, no logos, no watermarks, no readable signage. "
        "Avoid illustration, cartoon, vector art, 3D render, infographic, plastic skin, over-smoothed faces, exaggerated smiles, staged stock-photo poses, extra fingers, or distorted hands. "
        f"Image role: {image_role}. Make this visually distinct from the other article images. "
        f"Article title: {article.get('title')}. "
        f"Summary: {article.get('excerpt') or article.get('category') or 'healthcare guide'}."
    )

    response = client.chat.completions.create(
        model=IMAGE_MODEL,
        messages=[{"role": "user", "content": prompt}],
    )

    image_value = extract_image_value(response.choices[0].message)
    suffix = f"repair-{image_index}-{run_id}" if run_id else f"repair-{image_index}"
    return save_generated_image(image_value, article["slug"], suffix)


def article_matches(article: dict, identifier: str) -> bool:
    target = (identifier or "").strip().lower()
    if not target:
        return False

    candidates = [
        str(article.get("id") or ""),
        str(article.get("slug") or ""),
        str(article.get("title") or ""),
    ]
    seo_meta = article.get("seo_meta") or {}
    candidates.extend(str(slug) for slug in (seo_meta.get("legacy_slugs") or []) if slug)

    normalized_candidates = [candidate.strip().lower() for candidate in candidates if candidate]
    return any(target == candidate or target in candidate for candidate in normalized_candidates)


def find_article(articles: list[dict], identifier: str) -> dict:
    matches = [article for article in articles if article_matches(article, identifier)]
    if not matches:
        raise ValueError(f"No article found for target: {identifier}")
    if len(matches) > 1:
        exact = [
            article for article in matches
            if identifier.strip().lower() in {
                str(article.get("id") or "").strip().lower(),
                str(article.get("slug") or "").strip().lower(),
                str(article.get("title") or "").strip().lower(),
            }
        ]
        if len(exact) == 1:
            return exact[0]
        titles = "; ".join(str(article.get("title") or article.get("slug") or article.get("id")) for article in matches[:5])
        raise ValueError(f"Target matched multiple articles. Please use an exact id, slug, or full title. Matches: {titles}")
    return matches[0]


def regenerate_article_images(identifier: str, image_count: int = 3) -> None:
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not openrouter_key or not supabase_url or not supabase_key:
        raise RuntimeError("Missing OPENROUTER_API_KEY, NEXT_PUBLIC_SUPABASE_URL, or Supabase secret key")

    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=openrouter_key)
    supabase: Client = create_client(supabase_url, supabase_key)
    articles = supabase.table("articles").select("id, slug, title, excerpt, category, seo_meta").execute().data
    article = find_article(articles, identifier)
    count = max(1, min(int(image_count or 3), 5))

    print(f"[*] Force regenerating {count} image(s) for article: {article['title']}")
    image_urls = []
    run_id = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    for image_number in range(1, count + 1):
        image_url = generate_article_image(client, article, image_number, run_id=run_id)
        if image_url:
            image_urls.append(image_url)

    if not image_urls:
        raise RuntimeError(f"No usable images returned for: {article['title']}")

    seo_meta = article.get("seo_meta") or {}
    previous_images = []
    if isinstance(seo_meta.get("og_image"), str):
        previous_images.append(seo_meta["og_image"])
    previous_images.extend(image for image in (seo_meta.get("images") or []) if isinstance(image, str))
    if previous_images:
        seo_meta["previous_images"] = list(dict.fromkeys(previous_images))[:10]

    seo_meta["og_image"] = image_urls[0]
    seo_meta["images"] = image_urls[:5]
    supabase.table("articles").update({"seo_meta": seo_meta}).eq("id", article["id"]).execute()
    print(f"[+] Replaced article images: {len(image_urls)} image(s)")
    print(f"[*] og_image: {image_urls[0]}")


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
        current_images = [
            image for image in (seo_meta.get("images") or [])
            if isinstance(image, str) and not is_bad_image_url(image)
        ]

        if not is_bad_image_url(current_image) and len(current_images) >= 3:
            print(f"[*] Skipping article with enough valid images: {article['title']}")
            continue

        if not is_bad_image_url(current_image) and current_image not in current_images:
            current_images.insert(0, current_image)

        needed = max(3 - len(current_images), 1 if is_bad_image_url(current_image) else 0)
        print(f"[*] Generating {needed} image(s) for: {article['title']}")

        for image_number in range(len(current_images) + 1, len(current_images) + needed + 1):
            image_url = generate_article_image(client, article, image_number)
            if image_url:
                current_images.append(image_url)

        if not current_images:
            print(f"[!] No usable images returned for: {article['title']}")
            continue

        seo_meta["og_image"] = current_images[0]
        seo_meta["images"] = current_images[:5]
        supabase.table("articles").update({"seo_meta": seo_meta}).eq("id", article["id"]).execute()
        print(f"[+] Updated article images: {len(seo_meta['images'])} image(s)")


if __name__ == "__main__":
    main()

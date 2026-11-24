import base64
import os
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from openai import OpenAI
from admin_actions import normalize_article_identifier
from pg_client import create_client
from pg_client import PGClient as Client
from storage import (
    convert_image_to_webp,
    safe_storage_name,
    upload_image_bytes,
    upload_image_value,
)

load_dotenv(".env")
load_dotenv("../.env.local")

from image_generator import generate_image_value, build_article_prompt
from image_style import MOSAIC_STYLE
NATURAL_PHOTO_STYLE = MOSAIC_STYLE
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
    topic = (
        f"{article.get('title')}. Summary: {article.get('excerpt') or article.get('category') or 'healthcare guide'}. "
        f"Image role: {image_role}; make it visually distinct from the other article images"
    )
    image_value = generate_image_value(client, build_article_prompt(topic), kind="hero" if image_index == 1 else "article")
    suffix = f"repair-{image_index}-{run_id}" if run_id else f"repair-{image_index}"
    return save_generated_image(image_value, article["slug"], suffix)


def article_matches(article: dict, identifier: str) -> bool:
    raw_target = (identifier or "").strip().lower()
    norm_target = normalize_article_identifier(identifier).strip().lower()
    if not norm_target and not raw_target:
        return False

    candidates = [
        str(article.get("id") or ""),
        str(article.get("slug") or ""),
        str(article.get("title") or ""),
    ]
    seo_meta = article.get("seo_meta") or {}
    candidates.extend(str(slug) for slug in (seo_meta.get("legacy_slugs") or []) if slug)

    normalized_candidates = [candidate.strip().lower() for candidate in candidates if candidate]
    targets = [t for t in dict.fromkeys([norm_target, raw_target]) if t]
    return any(t == candidate or t in candidate for t in targets for candidate in normalized_candidates)


def find_article(articles: list[dict], identifier: str) -> dict:
    matches = [article for article in articles if article_matches(article, identifier)]
    if not matches:
        raise ValueError(f"No article found for target: {identifier}")
    if len(matches) > 1:
        norm_lower = normalize_article_identifier(identifier).strip().lower()
        raw_lower = (identifier or "").strip().lower()
        exact = [
            article for article in matches
            if {norm_lower, raw_lower} & {
                str(article.get("id") or "").strip().lower(),
                str(article.get("slug") or "").strip().lower(),
                str(article.get("title") or "").strip().lower(),
                *(str(s).strip().lower() for s in ((article.get("seo_meta") or {}).get("legacy_slugs") or []) if s),
            }
        ]
        if len(exact) == 1:
            return exact[0]
        titles = "; ".join(str(article.get("title") or article.get("slug") or article.get("id")) for article in matches[:5])
        raise ValueError(f"Target matched multiple articles. Please use an exact id, slug, or full title. Matches: {titles}")
    return matches[0]


def _article_url_path(article: dict) -> str:
    slug = article.get("slug") or ""
    category = (article.get("category") or "").strip().lower()
    prefix = "/pulse" if category == "pulse" else "/insights"
    return f"{prefix}/{slug}"


def _backup_previous_images(seo_meta: dict) -> None:
    previous_images = list(seo_meta.get("previous_images") or [])
    if isinstance(seo_meta.get("og_image"), str) and seo_meta["og_image"]:
        previous_images.insert(0, seo_meta["og_image"])
    for img in (seo_meta.get("images") or []):
        if isinstance(img, str) and img:
            previous_images.append(img)
    if previous_images:
        seo_meta["previous_images"] = list(dict.fromkeys(previous_images))[:12]


def regenerate_article_images(identifier: str, image_count: Optional[int] = None, scope: str = "all") -> None:
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")

    if not openrouter_key:
        raise RuntimeError("Missing OPENROUTER_API_KEY")

    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=openrouter_key)
    db = create_client()
    articles = db.table("articles").select("id, slug, title, excerpt, category, seo_meta").execute().data
    article = find_article(articles, identifier)

    is_pulse = (article.get("category") or "").strip().lower() == "pulse"
    clean_scope = (scope or "all").strip().lower()
    cover_only = is_pulse or clean_scope == "cover"
    count = 1 if cover_only else max(1, min(int(image_count or 3), 5))
    url_path = _article_url_path(article)

    print(f"[*] Force regenerating {count} image(s) (scope={'cover' if cover_only else 'all'}) for {url_path}: {article['title']}")
    image_urls = []
    run_id = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    for image_number in range(1, count + 1):
        image_url = generate_article_image(client, article, image_number, run_id=run_id)
        if image_url:
            image_urls.append(image_url)

    if not image_urls:
        raise RuntimeError(f"No usable images returned for: {article['title']}")

    seo_meta = dict(article.get("seo_meta") or {})
    _backup_previous_images(seo_meta)

    if cover_only:
        new_cover = image_urls[0]
        seo_meta["og_image"] = new_cover
        if is_pulse:
            seo_meta["images"] = [new_cover]
        else:
            existing_images = [img for img in (seo_meta.get("images") or []) if isinstance(img, str) and img]
            if existing_images:
                existing_images[0] = new_cover
                seo_meta["images"] = existing_images[:5]
            else:
                seo_meta["images"] = [new_cover]
    else:
        seo_meta["og_image"] = image_urls[0]
        seo_meta["images"] = image_urls[:5]

    db.table("articles").update({"seo_meta": seo_meta}).eq("id", article["id"]).execute()
    print(f"[+] Replaced image(s) for {url_path}: {len(image_urls)} new image(s)")
    print(f"[*] og_image: {seo_meta['og_image']}")


def replace_article_image_from_file(identifier: str, local_image_path: str, image_index: int = 0) -> None:
    """Upload a user-provided image file (e.g. from Telegram) and set it on an Insight or Pulse article."""
    if not local_image_path or not os.path.isfile(local_image_path):
        raise ValueError(f"Uploaded image file not found: {local_image_path}")

    db = create_client()
    articles = db.table("articles").select("id, slug, title, excerpt, category, seo_meta").execute().data
    article = find_article(articles, identifier)

    with open(local_image_path, "rb") as fh:
        raw_bytes = fh.read()
    if not raw_bytes:
        raise ValueError("Uploaded image file is empty.")

    converted = convert_image_to_webp(raw_bytes)
    if converted:
        out_bytes, content_type, ext = converted
    else:
        out_bytes = raw_bytes
        ext = os.path.splitext(local_image_path)[1].lstrip(".").lower() or "jpg"
        content_type = f"image/{'jpeg' if ext == 'jpg' else ext}"

    run_id = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    safe_slug = safe_storage_name(article.get("slug") or "article")
    storage_path = f"generated-insights/{safe_slug}-custom-{run_id}.{ext}"
    uploaded_url = upload_image_bytes(out_bytes, storage_path, content_type)
    if not uploaded_url:
        raise RuntimeError(f"Failed to save uploaded image to storage: {storage_path}")

    seo_meta = dict(article.get("seo_meta") or {})
    _backup_previous_images(seo_meta)

    is_pulse = (article.get("category") or "").strip().lower() == "pulse"
    idx = max(0, int(image_index or 0))
    if is_pulse or idx == 0:
        seo_meta["og_image"] = uploaded_url

    if is_pulse:
        seo_meta["images"] = [uploaded_url]
    else:
        existing_images = [img for img in (seo_meta.get("images") or []) if isinstance(img, str) and img]
        if idx < len(existing_images):
            existing_images[idx] = uploaded_url
        elif idx == 0:
            existing_images = [uploaded_url]
        else:
            existing_images.append(uploaded_url)
        seo_meta["images"] = existing_images[:5]

    db.table("articles").update({"seo_meta": seo_meta}).eq("id", article["id"]).execute()
    url_path = _article_url_path(article)
    print(f"[+] Uploaded custom image for {url_path}: {uploaded_url}")
    print(f"[*] og_image: {seo_meta.get('og_image')}")


def main():
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")

    if not openrouter_key:
        raise RuntimeError("Missing OPENROUTER_API_KEY")

    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=openrouter_key)
    db = create_client()

    articles = db.table("articles").select("id, slug, title, excerpt, category, seo_meta").execute().data

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
        db.table("articles").update({"seo_meta": seo_meta}).eq("id", article["id"]).execute()
        print(f"[+] Updated article images: {len(seo_meta['images'])} image(s)")


if __name__ == "__main__":
    main()

import mimetypes
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from supabase import Client, create_client

from storage import safe_storage_name, upload_image_bytes

load_dotenv(".env")
load_dotenv("../.env.local")


LOCAL_PREFIXES = {
    "/generated-insights/": ("articles", "generated-insights", "../public/generated-insights"),
    "/generated-clinics/": ("clinics", "generated-clinics", "../public/generated-clinics"),
}


def get_supabase() -> Client:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase secret key")
    return create_client(url, key)


def is_local_generated_image(value: Any) -> bool:
    return isinstance(value, str) and any(value.startswith(prefix) for prefix in LOCAL_PREFIXES)


def local_image_to_storage_url(value: str) -> Optional[str]:
    for prefix, (_, storage_folder, local_folder) in LOCAL_PREFIXES.items():
        if not value.startswith(prefix):
            continue

        filename = value.removeprefix(prefix)
        local_path = os.path.normpath(os.path.join(local_folder, filename))
        if not os.path.exists(local_path):
            print(f"[!] Missing local image file: {local_path}")
            return None

        content_type = mimetypes.guess_type(local_path)[0] or "image/png"
        storage_name = safe_storage_name(os.path.splitext(filename)[0])
        extension = os.path.splitext(filename)[1].lstrip(".") or "png"
        storage_path = f"{storage_folder}/{storage_name}.{extension}"

        with open(local_path, "rb") as image_file:
            return upload_image_bytes(image_file.read(), storage_path, content_type)

    return None


def migrate_article_images(supabase: Client) -> int:
    articles = supabase.table("articles").select("id, title, seo_meta").execute().data or []
    updated = 0

    for article in articles:
        seo_meta: Dict[str, Any] = article.get("seo_meta") or {}
        changed = False

        og_image = seo_meta.get("og_image")
        if is_local_generated_image(og_image):
            cloud_url = local_image_to_storage_url(og_image)
            if cloud_url:
                seo_meta["og_image"] = cloud_url
                changed = True

        images = seo_meta.get("images")
        if isinstance(images, list):
            migrated_images: List[Any] = []
            for image in images:
                if is_local_generated_image(image):
                    migrated_images.append(local_image_to_storage_url(image) or image)
                else:
                    migrated_images.append(image)
            if migrated_images != images:
                seo_meta["images"] = migrated_images
                changed = True

        if changed:
            supabase.table("articles").update({"seo_meta": seo_meta}).eq("id", article["id"]).execute()
            updated += 1
            print(f"[+] Migrated article images: {article.get('title')}")

    return updated


def migrate_clinic_images(supabase: Client) -> int:
    clinics = supabase.table("clinics").select("id, name, metadata").execute().data or []
    updated = 0

    for clinic in clinics:
        metadata: Dict[str, Any] = clinic.get("metadata") or {}
        images = metadata.get("images")
        if not isinstance(images, list):
            continue

        migrated_images: List[Any] = []
        for image in images:
            if is_local_generated_image(image):
                migrated_images.append(local_image_to_storage_url(image) or image)
            else:
                migrated_images.append(image)

        if migrated_images != images:
            metadata["images"] = migrated_images
            supabase.table("clinics").update({"metadata": metadata}).eq("id", clinic["id"]).execute()
            updated += 1
            print(f"[+] Migrated clinic images: {clinic.get('name')}")

    return updated


def main():
    supabase = get_supabase()
    article_count = migrate_article_images(supabase)
    clinic_count = migrate_clinic_images(supabase)
    print(f"[*] Done. Migrated {article_count} articles and {clinic_count} clinics.")


if __name__ == "__main__":
    main()

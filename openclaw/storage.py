import base64
import mimetypes
import os
import re
import unicodedata
from io import BytesIO
from typing import Optional, Tuple
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv(".env")
load_dotenv("../.env.local")

DEFAULT_BUCKET = "generated-images"


def safe_storage_name(value: str) -> str:
    text = value.replace("Đ", "D").replace("đ", "d")
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s._-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip(".-") or "image"


def get_storage_bucket() -> str:
    return os.environ.get("SUPABASE_STORAGE_BUCKET") or DEFAULT_BUCKET


def create_supabase_client() -> Optional[Client]:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        return None

    return create_client(url, key)


def parse_data_image(image_value: str) -> Optional[Tuple[bytes, str, str]]:
    if not image_value.startswith("data:image/"):
        return None

    header, encoded = image_value.split(",", 1)
    mime_type = header.split(";")[0].replace("data:", "") or "image/png"
    extension = mime_type.split("/")[-1] or "png"
    return base64.b64decode(encoded), mime_type, extension


def download_image(image_url: str) -> Optional[Tuple[bytes, str, str]]:
    if not image_url.startswith("http"):
        return None

    request = Request(image_url, headers={"User-Agent": "AsianHealthHubOpenClaw/1.0"})
    with urlopen(request, timeout=30) as response:
        body = response.read()
        content_type = response.headers.get("content-type", "").split(";")[0]

    if not content_type.startswith("image/"):
        parsed_path = urlparse(image_url).path
        guessed_type, _ = mimetypes.guess_type(parsed_path)
        content_type = guessed_type or "image/png"

    extension = mimetypes.guess_extension(content_type) or ".png"
    return body, content_type, extension.lstrip(".")


def convert_image_to_webp(image_bytes: bytes) -> Optional[Tuple[bytes, str, str]]:
    try:
        from PIL import Image, ImageOps
    except ImportError:
        print("[!] Pillow is not installed; cannot convert image to WebP before upload.")
        return None

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image = ImageOps.exif_transpose(image)
            if image.mode not in {"RGB", "RGBA"}:
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")

            output = BytesIO()
            image.save(output, format="WEBP", quality=84, method=6)
            return output.getvalue(), "image/webp", "webp"
    except Exception as exc:
        print(f"[!] WebP conversion failed; uploading original image instead: {exc}")
        return None


def get_public_url(supabase: Client, bucket: str, path: str) -> str:
    response = supabase.storage.from_(bucket).get_public_url(path)
    if isinstance(response, str):
        return response
    if isinstance(response, dict):
        return response.get("publicUrl") or response.get("public_url") or response.get("signedURL") or ""
    return getattr(response, "public_url", "") or getattr(response, "publicUrl", "") or str(response)


def upload_image_bytes(
    image_bytes: bytes,
    storage_path: str,
    content_type: str,
    bucket: Optional[str] = None,
) -> Optional[str]:
    supabase = create_supabase_client()
    if not supabase:
        print("[!] Missing Supabase credentials; skipping cloud image upload.")
        return None

    bucket_name = bucket or get_storage_bucket()
    normalized_path = storage_path.lstrip("/")

    try:
        supabase.storage.from_(bucket_name).upload(
            path=normalized_path,
            file=image_bytes,
            file_options={
                "cache-control": "31536000",
                "content-type": content_type,
                "upsert": "true",
            },
        )
        public_url = get_public_url(supabase, bucket_name, normalized_path)
        print(f"[+] Uploaded image to Supabase Storage: {public_url}")
        return public_url
    except Exception as exc:
        print(
            f"[!] Supabase Storage upload failed for bucket '{bucket_name}' path '{normalized_path}': {exc}"
        )
        return None


def upload_image_value(image_value: Optional[str], folder: str, filename_base: str) -> Optional[str]:
    if not image_value:
        return None

    parsed = parse_data_image(image_value)
    if not parsed and image_value.startswith("http"):
        try:
            parsed = download_image(image_value)
        except Exception as exc:
            print(f"[!] Could not download generated image URL for cloud upload: {exc}")
            return image_value

    if not parsed:
        return None

    image_bytes, content_type, extension = convert_image_to_webp(parsed[0]) or parsed
    safe_extension = extension.lower().replace("jpeg", "jpg")
    storage_path = f"{folder.strip('/')}/{safe_storage_name(filename_base)}.{safe_extension}"
    return upload_image_bytes(image_bytes, storage_path, content_type)

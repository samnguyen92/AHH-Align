import base64
import os
import re
import ssl
import unicodedata
from io import BytesIO
from typing import Optional, Tuple
from urllib.request import Request, urlopen

import certifi
from dotenv import load_dotenv

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(_OPENCLAW_DIR, "..", ".env.local"))
load_dotenv(".env")
load_dotenv(".env.local")

SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


def safe_storage_name(value: str) -> str:
    text = value.replace("Đ", "D").replace("đ", "d")
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s._-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip(".-") or "image"


def get_uploads_dir() -> str:
    """Find the active public/uploads directory either in local dev or Docker."""
    candidates = [
        os.path.join(_OPENCLAW_DIR, "..", "public", "uploads"),
        os.path.join("/app", "public", "uploads"),
        os.path.join(os.getcwd(), "public", "uploads"),
    ]
    for cand in candidates:
        cand_abs = os.path.abspath(cand)
        if os.path.exists(os.path.dirname(cand_abs)):
            os.makedirs(cand_abs, exist_ok=True)
            return cand_abs
    fallback = os.path.abspath(os.path.join(_OPENCLAW_DIR, "..", "public", "uploads"))
    os.makedirs(fallback, exist_ok=True)
    return fallback


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
    with urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
        body = response.read()
        content_type = response.headers.get("content-type", "").split(";")[0]

    if not content_type.startswith("image/"):
        return None

    extension = content_type.split("/")[-1].replace("jpeg", "jpg") or "jpg"
    return body, content_type, extension


def convert_image_to_webp(image_bytes: bytes) -> Optional[Tuple[bytes, str, str]]:
    try:
        from PIL import Image

        with Image.open(BytesIO(image_bytes)) as image:
            if image.format == "WEBP":
                return image_bytes, "image/webp", "webp"

            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")

            output = BytesIO()
            image.save(output, format="WEBP", quality=84, method=6)
            return output.getvalue(), "image/webp", "webp"
    except Exception as exc:
        print(f"[!] WebP conversion failed; saving original image instead: {exc}")
        return None


def upload_image_bytes(
    image_bytes: bytes,
    storage_path: str,
    content_type: str,
    bucket: Optional[str] = None,
) -> Optional[str]:
    """
    Save image to local Docker Volume (public/uploads/) and return '/uploads/...'.

    Returns None when the file could not be written. It must NEVER return a URL for a file that does not exist:
    that is how a clinic ended up with 5 photos in the database and 5 "404 Not Found" on the website.
    """
    normalized_path = storage_path.lstrip("/")

    try:
        target_dir = get_uploads_dir()
        dest_file = os.path.join(target_dir, normalized_path)
        os.makedirs(os.path.dirname(dest_file), exist_ok=True)
        with open(dest_file, "wb") as f:
            f.write(image_bytes)
        if not os.path.isfile(dest_file) or os.path.getsize(dest_file) != len(image_bytes):
            raise OSError("the file is missing or truncated after writing")
        local_url = f"/uploads/{normalized_path}"
        print(f"[+] Saved image to local storage: {local_url}")
        return local_url
    except Exception as exc:
        print(f"[!] Local image save error (nothing was saved): {exc}")
        return None


def upload_image_value(image_value: Optional[str], folder: str, filename_base: str) -> Optional[str]:
    if not image_value:
        return None

    parsed = parse_data_image(image_value)
    if not parsed and image_value.startswith("http"):
        try:
            parsed = download_image(image_value)
        except Exception as exc:
            print(f"[!] Could not download generated image URL: {exc}")
            return image_value

    if not parsed:
        return None

    image_bytes, content_type, extension = convert_image_to_webp(parsed[0]) or parsed
    safe_extension = extension.lower().replace("jpeg", "jpg")
    storage_path = f"{folder.strip('/')}/{safe_storage_name(filename_base)}.{safe_extension}"
    return upload_image_bytes(image_bytes, storage_path, content_type)

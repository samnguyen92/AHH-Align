"""
photo_judge.py — a vision model decides whether each candidate photo really shows THIS clinic's place.

Why: size/shape/duplicate gates cannot tell a waiting room from a logo, a lunch photo a reviewer posted, a map
screenshot, a patient's face, or the sign of a different business.

Cost is kept small and bounded on purpose:
  * ONE request per clinic (all its candidate photos together), not one per photo;
  * photos are shrunk to 512 px JPEG and sent at "low" detail;
  * answers are cached by photo hash, so a rescan never pays twice for the same photo;
  * a hard daily limit of photos (OPENCLAW_VISION_DAILY_IMAGES, default 400); beyond it the heuristics alone decide;
  * the real token usage of every review is stored in the clinic ("photo_review") and summed by /quality.

If the model is unreachable or answers nonsense, nothing is filtered by it (the size/duplicate gates still apply).
Set OPENCLAW_VISION=off to switch it off.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

KEEP_CATEGORIES = ("exterior", "interior_reception", "interior_treatment", "equipment", "staff_professional")
REJECT_CATEGORIES = ("logo_or_icon", "text_graphic", "map_or_screenshot", "food_or_product", "people_candid", "other_business", "other")
HERO_ORDER = {name: rank for rank, name in enumerate(KEEP_CATEGORIES)}
MIN_QUALITY = 3

MAX_IMAGES_PER_CALL = int(os.environ.get("OPENCLAW_VISION_MAX_IMAGES", "10"))
DAILY_IMAGE_LIMIT = int(os.environ.get("OPENCLAW_VISION_DAILY_IMAGES", "400"))
THUMB_SIDE = 512
CACHE_DIR = Path(os.environ.get("OPENCLAW_CACHE_DIR") or Path(__file__).resolve().parent / ".cache")

SYSTEM_PROMPT = """You review candidate photos for a directory of healthcare clinics serving Asian American patients.
For EACH numbered image decide what it shows and whether it is suitable as a photo of THIS clinic's place.

Categories (pick exactly one):
- exterior: the clinic's building, entrance or street sign
- interior_reception: waiting room, front desk, lobby
- interior_treatment: exam or treatment room, dental chair, procedure room
- equipment: medical equipment or a clearly clinical setting
- staff_professional: posed, professional photo of doctors or staff
- logo_or_icon: logo, icon, badge, favicon, decorative symbol
- text_graphic: banner, flyer, slide or any picture that is mostly text or a designed graphic
- map_or_screenshot: map, screenshot of a website or app
- food_or_product: food, drinks, shopping, products, vehicles, scenery unrelated to care
- people_candid: patients, customers or private persons whose faces are visible (candid or user-posted)
- other_business: the sign or branding clearly shows a DIFFERENT business than the clinic named below
- other: anything else unusable (blurry, dark, stock-looking, not a place)

Be strict: when unsure, do not choose a "keep" category. Rate quality 1-5 (sharp, well lit, well framed).
Reply with JSON only:
{"images":[{"index":1,"category":"exterior","quality":4,"reason":"short reason"}]}"""


class Verdict(dict):
    """{"category", "quality", "keep", "reason"}"""


def enabled() -> bool:
    return os.environ.get("OPENCLAW_VISION", "on").strip().lower() not in {"off", "0", "false", "no"} and bool(os.environ.get("OPENROUTER_API_KEY"))


def vision_model() -> str:
    return os.environ.get("OPENCLAW_VISION_MODEL") or os.environ.get("OPENCLAW_TEXT_MODEL") or "openai/gpt-6-luna"


# --------------------------------------------------------------------------- budget + cache

def _usage_path() -> Path:
    return CACHE_DIR / "vision_usage.json"


def _cache_path() -> Path:
    return CACHE_DIR / "photo_verdicts.json"


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_json(path: Path, data: dict) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data), encoding="utf-8")
    except OSError as exc:
        print(f"[!] Could not save {path.name}: {exc}")


def images_left_today() -> int:
    used = _read_json(_usage_path()).get(time.strftime("%Y-%m-%d"), 0)
    return max(0, DAILY_IMAGE_LIMIT - int(used))


def _count_images(n: int) -> None:
    usage = _read_json(_usage_path())
    today = time.strftime("%Y-%m-%d")
    _write_json(_usage_path(), {today: int(usage.get(today, 0)) + n})  # older days are dropped on purpose


def _cache_key(image_bytes: bytes, clinic_name: str) -> str:
    return hashlib.md5(image_bytes).hexdigest() + ":" + hashlib.md5((clinic_name or "").lower().encode()).hexdigest()[:8]


# --------------------------------------------------------------------------- the model call

def _thumbnail_data_url(image_bytes: bytes) -> Optional[str]:
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes))
        img.load()
        img = img.convert("RGB")
        img.thumbnail((THUMB_SIDE, THUMB_SIDE))
        out = io.BytesIO()
        img.save(out, "JPEG", quality=70)
        return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()
    except Exception:
        return None


def _decide(raw: dict) -> Verdict:
    category = str(raw.get("category") or "other").strip().lower()
    try:
        quality = int(raw.get("quality") or 0)
    except (TypeError, ValueError):
        quality = 0
    keep = category in KEEP_CATEGORIES and quality >= MIN_QUALITY
    return Verdict(category=category, quality=quality, keep=keep, reason=str(raw.get("reason") or "")[:120])


def _call_model(client: Any, model: str, clinic: dict, urls: List[str]) -> Dict[str, Any]:
    content: List[dict] = [{"type": "text", "text": json.dumps({
        "clinic": {k: clinic.get(k) for k in ("name", "specialty", "city", "state") if clinic.get(k)}, "image_count": len(urls)}, ensure_ascii=False)}]
    for number, url in enumerate(urls, start=1):
        content.append({"type": "text", "text": f"Image {number}:"})
        content.append({"type": "image_url", "image_url": {"url": url, "detail": "low"}})
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": content}],
        temperature=0.0,
        max_tokens=250 + 90 * len(urls),
    )
    choice = response.choices[0]
    if getattr(choice, "finish_reason", None) == "length":
        raise ValueError("the answer was cut off")
    text = (choice.message.content or "").strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    first, last = text.find("{"), text.rfind("}")
    parsed = json.loads(text[first:last + 1])
    usage = getattr(response, "usage", None)
    return {
        "images": parsed.get("images") or [],
        "tokens_in": int(getattr(usage, "prompt_tokens", 0) or 0),
        "tokens_out": int(getattr(usage, "completion_tokens", 0) or 0),
    }


def judge_photos(
    clinic: dict,
    photos: List[tuple],
    client: Any = None,
    log: Callable[[str], None] = print,
) -> Optional[Dict[str, Any]]:
    """photos: [(key, image_bytes)]. Returns {"verdicts": {key: Verdict}, "model", "tokens_in", "tokens_out", "judged", "cached"}
    or None when nothing was judged (switched off, over the daily limit, model failure)."""
    if not photos or not enabled():
        return None

    name = clinic.get("name") or ""
    cache = _read_json(_cache_path())
    verdicts: Dict[str, Verdict] = {}
    pending: List[tuple] = []  # (key, cache_key, data_url)
    for key, image_bytes in photos[:MAX_IMAGES_PER_CALL]:
        ckey = _cache_key(image_bytes, name)
        if ckey in cache:
            verdicts[key] = _decide(cache[ckey])
            continue
        data_url = _thumbnail_data_url(image_bytes)
        if data_url:
            pending.append((key, ckey, data_url))

    result = {"verdicts": verdicts, "model": vision_model(), "tokens_in": 0, "tokens_out": 0, "judged": 0, "cached": len(verdicts)}
    if not pending:
        return result if verdicts else None

    if len(pending) > images_left_today():
        log(f"   [!] Daily limit of {DAILY_IMAGE_LIMIT} photo reviews reached: the size/duplicate gates alone decide today.")
        return result if verdicts else None

    try:
        if client is None:
            from openai import OpenAI

            client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"], timeout=90)
        answer = _call_model(client, vision_model(), clinic, [item[2] for item in pending])
    except Exception as exc:
        log(f"   [!] Photo review unavailable ({exc!r}): nothing was filtered by the model.")
        return result if verdicts else None

    _count_images(len(pending))
    by_index = {}
    for item in answer["images"]:
        try:
            by_index[int(item.get("index"))] = item
        except (TypeError, ValueError, AttributeError):
            continue
    for number, (key, ckey, _url) in enumerate(pending, start=1):
        raw = by_index.get(number)
        if not raw:
            continue  # the model skipped it: unknown, so the other gates decide
        cache[ckey] = {"category": raw.get("category"), "quality": raw.get("quality"), "reason": raw.get("reason")}
        verdicts[key] = _decide(raw)
    _write_json(_cache_path(), cache)
    result.update(tokens_in=answer["tokens_in"], tokens_out=answer["tokens_out"], judged=len(pending))
    log(f"   [+] Photo review: {len(pending)} judged, {result['cached']} from cache ({answer['tokens_in']} tokens in / {answer['tokens_out']} out)")
    return result


def order_and_filter(keys: List[str], verdicts: Dict[str, Verdict]) -> tuple:
    """(kept_keys, rejected: [{key, category, reason}]). Best hero first: exterior, reception, treatment room, ..."""
    kept, rejected = [], []
    for position, key in enumerate(keys):
        verdict = verdicts.get(key)
        if verdict is not None and not verdict["keep"]:
            rejected.append({"key": key, "category": verdict["category"], "reason": verdict["reason"]})
        else:
            kept.append((HERO_ORDER.get(verdict["category"], len(HERO_ORDER)) if verdict else len(HERO_ORDER), -(verdict["quality"] if verdict else 0), position, key))
    kept.sort()
    return [item[3] for item in kept], rejected

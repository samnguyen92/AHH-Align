"""openclaw/image_style.py

The ONE place that defines how Asian Health Hub AI images look. Everything that generates an image
(insights/guides/blog heroes, Pulse covers, Telegram bot jobs, AI web-edit, clinic fallbacks) must go through
``mosaic_prompt`` / ``build_image_messages`` so the output matches the Mosaic redesign.

The look is derived from the redesign's own photography (public/brand/photos/*): soft natural window or
dappled-garden light, a calm sage-green + warm cream palette, warm Asian American people of varied ages shown
close and intimate with genuine expressions, clean uncluttered backgrounds, fine film grain. Those very photos
are attached to each request as style references.
"""

from __future__ import annotations

import base64
import io
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

_ROOT = Path("/app") if Path("/app/public").exists() else Path(__file__).resolve().parent.parent
PHOTOS_DIR = _ROOT / "public" / "brand" / "photos"

# Style references per kind (first = strongest match). All live in the redesign's brand photo set.
REFERENCES: dict[str, list[str]] = {
    "hero": ["h1-hero.webp", "d1-hero-ground.webp", "b2-hands-hero.webp"],
    "article": ["h1-hero.webp", "c2-card-vi.webp", "a3-guide-left.webp"],
    "pulse_cover": ["b2-hands-hero.webp", "h1-hero.webp", "c1-bg-garden.webp"],
    "portrait": ["c2-card-vi.webp", "c3-card-ko.webp", "c4-card-zh.webp"],
    "clinic_interior": ["h1-hero.webp", "clinic-1.webp"],
    "web": ["h1-hero.webp", "c2-card-vi.webp", "b2-hands-hero.webp"],
}

MOSAIC_STYLE = (
    "Match the attached reference photos exactly in look and feel (the Asian Health Hub 'Mosaic' style): "
    "refined editorial photography with soft, natural window light or dappled garden light, a calm sage-green and "
    "warm cream colour palette (muted mint walls, linen and olive-knit clothing, soft green foliage and leaf shadows), "
    "gentle natural depth of field with creamy background blur, warm true-to-life skin tones with natural texture "
    "and fine film grain, uncluttered composition with generous clean negative space. "
    "Subjects are Asian American people of varied ages (elders, parents, doctors in white coats) in an intimate "
    "close or medium frame, with warm genuine expressions; they may smile or look toward the camera. "
    "Mood: calm, trustworthy, human and caring; high-end magazine quality, never clinical or cold."
)

MOSAIC_NEGATIVE = (
    "Absolutely NO text, letters, numbers, logos, signage, captions, watermarks or UI overlays anywhere. "
    "Not an illustration, painting, 3D render, cartoon, infographic or stock-photo cliche. Avoid plastic or waxy skin, "
    "oversaturated or neon colours, harsh flash, glossy HDR, dramatic cinematic grading, cluttered backgrounds, "
    "distorted hands or extra fingers, fake-looking medical equipment and gibberish writing."
)

_KIND_BRIEF = {
    "hero": "Wide hero photograph with room for headline text on one side. Scene: {subject}.",
    "article": "Editorial photograph for a patient-education health article. Scene: {subject}.",
    "pulse_cover": "Cover photograph for the monthly AHH Pulse newsletter. Scene: {subject}.",
    "portrait": "Warm close portrait of a member of the community, softly out-of-focus garden background. Subject: {subject}.",
    "clinic_interior": (
        "Bright, calm interior of a small independent clinic: reception or treatment room with soft natural light and "
        "a few plants, no recognisable faces. Clinic context (do not render the name): {subject}."
    ),
    "web": "Photograph for a website section. Scene: {subject}.",
}


def mosaic_prompt(kind: str, subject: str, extra: str = "") -> str:
    brief = _KIND_BRIEF.get(kind, _KIND_BRIEF["article"]).format(subject=(subject or "a caring healthcare moment").strip())
    return " ".join(part for part in (brief, MOSAIC_STYLE, extra.strip(), MOSAIC_NEGATIVE) if part)


def apply_mosaic_style(prompt: str, kind: str = "article") -> str:
    """Rewrite a free-form model/user prompt into the Mosaic look (used for LLM-authored image prompts)."""
    text = re.sub(
        r"documentary[- ]style|photojournalistic|candid documentary|natural documentary healthcare photography|"
        r"imperfect everyday composition|unretouched candid faces|35mm editorial framing",
        "Mosaic editorial",
        str(prompt or "").strip(),
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\b(?:illustration|illustrated|cartoon|vector|3d render|infographic)\b", "photograph", text, flags=re.IGNORECASE)
    if "mosaic" not in text.lower():
        return mosaic_prompt(kind, text)
    return f"{text}. {MOSAIC_STYLE} {MOSAIC_NEGATIVE}"


@lru_cache(maxsize=32)
def _reference_data_url(filename: str) -> Optional[str]:
    path = PHOTOS_DIR / filename
    if not path.exists():
        return None
    try:
        from PIL import Image

        img = Image.open(path).convert("RGB")
        img.thumbnail((768, 768))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=82)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


def reference_parts(kind: str, limit: int = 3) -> list[dict]:
    parts = []
    for name in REFERENCES.get(kind, REFERENCES["article"])[:limit]:
        url = _reference_data_url(name)
        if url:
            parts.append({"type": "image_url", "image_url": {"url": url}})
    return parts


def build_image_messages(prompt: str, kind: str = "article", with_references: bool = True) -> list[dict]:
    """Chat messages for an image model; the Mosaic photos are attached as style references."""
    refs = reference_parts(kind) if with_references else []
    if not refs:
        return [{"role": "user", "content": prompt}]
    return [{"role": "user", "content": [{"type": "text", "text": prompt}, *refs]}]

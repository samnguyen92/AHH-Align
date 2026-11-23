"""scout_report.py — what the bot shows after a scout / import: ONE short summary plus ONE card per new clinic.

The old output was a stream of progress lines followed by the raw log of the scraper; the person could not tell which
clinics were recommended or which to approve. Pure functions here, so the wording is testable.
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List, Optional

from messages import tr

SHORT_LANGUAGE = {"English": "EN", "Vietnamese": "VI", "Korean": "KO", "Chinese": "ZH", "Mandarin": "ZH", "Cantonese": "YUE", "Spanish": "ES"}


def build_card(data: dict, quality: dict, saved_info: Optional[dict]) -> Dict[str, Any]:
    """The facts the person needs to decide, from the data that was just saved."""
    saved_info = saved_info or {}
    gm = data.get("google_metadata") or {}
    return {
        "name": data.get("name"), "slug": saved_info.get("slug"), "city": data.get("city"), "state": data.get("state"),
        "languages": list(data.get("languages") or []), "languages_verified": bool(data.get("languages_verified")),
        "language_flag": gm.get("language_verified_on_website") is False,
        "rating": gm.get("rating") or data.get("rating"), "rating_count": gm.get("rating_count") or data.get("rating_count"),
        "photos": len(data.get("images") or []), "images_source": data.get("images_source"),
        "quality": quality.get("score"), "missing": list(quality.get("missing") or []),
        "created": bool(saved_info.get("created")), "status": saved_info.get("status"),
    }


def _langs(card: dict) -> str:
    names = [SHORT_LANGUAGE.get(l, l) for l in card.get("languages") or []] or ["?"]
    return ", ".join(names) + (" ✅" if card.get("languages_verified") else "")


def card_text(card: dict, lang: str = "vi") -> str:
    vi = lang == "vi"
    place = ", ".join(p for p in (card.get("city"), card.get("state")) if p)
    head = f"**{card.get('name')}**" + (f" — {place}" if place else "")
    rating = f"⭐ {card['rating']} ({card['rating_count']})" if card.get("rating") else ("⭐ chưa có đánh giá" if vi else "⭐ no rating yet")
    photos = (f"{card['photos']} ảnh" if vi else f"{card['photos']} photo(s)") if card.get("photos") else ("không có ảnh" if vi else "no photo")
    facts = " · ".join([rating, _langs(card), photos, (f"điểm {card['quality']}/100" if vi else f"score {card['quality']}/100")])
    lines = [head, facts]
    if card.get("language_flag"):
        lines.append("⚠️ Website không nhắc đến ngôn ngữ bạn yêu cầu (chưa gán ngôn ngữ đó)" if vi else "⚠️ The website does not mention the requested language (it was not added)")
    if card.get("missing"):
        lines.append(("Thiếu: " if vi else "Missing: ") + ", ".join(card["missing"][:5]))
    if card.get("created"):
        lines.append("📝 Nháp, chưa hiện trên web, chờ bạn duyệt" if vi else "📝 Draft, not on the website yet: waiting for you")
    else:
        lines.append(f"🔄 Đã có trong hệ thống (trạng thái: {card.get('status') or '?'})" if vi else f"🔄 Already in the directory (status: {card.get('status') or '?'})")
    return "\n".join(lines)


def summary_text(summary: dict, lang: str = "vi") -> str:
    vi = lang == "vi"
    if summary.get("error_text"):
        return summary["error_text"]
    cards: List[dict] = summary.get("clinics") or []
    drafts = sum(1 for c in cards if c.get("created"))
    if cards:
        head = (f"✅ Xong: lưu {drafts} clinic NHÁP chờ bạn duyệt (xếp theo đánh giá)." if vi else f"✅ Done: saved {drafts} DRAFT clinic(s) waiting for you (ranked by rating).")
    else:
        head = "Không có clinic mới nào phù hợp." if vi else "No new clinic matched."
    asked = []
    if summary.get("min_rating"):
        asked.append(f"≥{summary['min_rating']}⭐")
    if summary.get("min_reviews"):
        asked.append((f"≥{summary['min_reviews']} lượt đánh giá" if vi else f"≥{summary['min_reviews']} reviews"))
    lines = [head + (f" ({', '.join(asked)})" if asked else "")]
    reasons = Counter(item["reason"] for item in summary.get("skipped_items") or [])
    if reasons:
        parts = [f"{n} {tr('skip.' + reason, lang)}" for reason, n in reasons.most_common()]
        lines.append(("Bỏ qua " if vi else "Skipped ") + f"{sum(reasons.values())}: " + " · ".join(parts))
    if cards:
        lines.append("👇 " + ("Duyệt hoặc từ chối từng clinic ở các thẻ bên dưới." if vi else "Approve or reject each clinic on the cards below."))
    return "\n".join(lines)

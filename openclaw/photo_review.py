"""photo_review.py — run the vision review over clinics that ALREADY have photos (the /review_photos command)."""

from __future__ import annotations

from pathlib import Path
from typing import Callable, List, Optional

from clinic_photos import _source_label, is_remote, local_file_exists, project_root
from photo_judge import enabled, judge_photos, order_and_filter


def review_clinics(
    db,
    target: str = "all",
    limit: int = 20,
    root: Optional[Path] = None,
    judge: Callable = judge_photos,
    log: Callable[[str], None] = print,
) -> dict:
    """target: a slug / name, or "all" (then only clinics never reviewed, at most `limit`, newest first)."""
    root = root or project_root()
    rows = db.table("clinics").select("id,name,slug,specialty,city,state,metadata").execute().data or []
    if target and target.lower() != "all":
        needle = target.strip().lower()
        rows = [r for r in rows if needle in {str(r.get("slug", "")).lower(), str(r.get("name", "")).lower()}] or \
               [r for r in rows if needle in str(r.get("name", "")).lower()][:5]
    else:
        rows = [r for r in rows if not (r.get("metadata") or {}).get("photo_review") and (r.get("metadata") or {}).get("images")]
    rows = rows[: max(1, limit)]

    summary = {"clinics": 0, "judged": 0, "kept": 0, "rejected": 0, "tokens_in": 0, "tokens_out": 0, "skipped": 0}
    if not enabled():
        log("[!] Photo review is off (OPENCLAW_VISION=off or no OPENROUTER_API_KEY).")
        summary["skipped"] = len(rows)
        return summary

    for row in rows:
        meta = dict(row.get("metadata") or {})
        urls = [u for u in (meta.get("images") or []) if isinstance(u, str) and local_file_exists(u, root)]
        remote = [u for u in (meta.get("images") or []) if is_remote(u)]  # cannot be read from disk: left untouched
        if not urls:
            summary["skipped"] += 1
            continue
        photos = [(u, (root / "public" / u.lstrip("/")).read_bytes()) for u in urls]
        outcome = judge({**row, "city": row.get("city")}, photos, log=log)
        if not outcome or not outcome.get("verdicts"):
            summary["skipped"] += 1
            continue
        kept, rejected = order_and_filter(urls, outcome["verdicts"])
        for item in rejected:
            if "/generated-clinics/" in item["key"]:
                (root / "public" / item["key"].lstrip("/")).unlink(missing_ok=True)
        sources = {u: v for u, v in (meta.get("image_sources") or {}).items() if u in kept}
        meta["images"] = kept + remote
        meta["image_sources"] = sources
        meta["images_source"], meta["primary_image_source"] = _source_label(sources, kept)
        meta["photo_review"] = {
            "model": outcome.get("model"), "judged": outcome.get("judged", 0), "cached": outcome.get("cached", 0),
            "tokens_in": outcome.get("tokens_in", 0), "tokens_out": outcome.get("tokens_out", 0),
            "rejected": [{"url": r["key"], "category": r["category"], "reason": r["reason"]} for r in rejected],
        }
        db.table("clinics").update({"metadata": meta}).eq("id", row["id"]).execute()
        summary["clinics"] += 1
        summary["judged"] += outcome.get("judged", 0)
        summary["kept"] += len(kept)
        summary["rejected"] += len(rejected)
        summary["tokens_in"] += outcome.get("tokens_in", 0)
        summary["tokens_out"] += outcome.get("tokens_out", 0)
        why = ", ".join(sorted({r["category"] for r in rejected})) or "none"
        log(f"[*] {row.get('name')}: kept {len(kept)}, rejected {len(rejected)} ({why})")
    return summary


def format_summary(summary: dict, lang: str = "vi") -> str:
    vi = lang == "vi"
    if summary["skipped"] and not summary["clinics"] and not summary["judged"]:
        return "Chưa chấm được ảnh nào (đã tắt, hết hạn mức hôm nay, hoặc không có ảnh đọc được)." if vi else "No photo could be reviewed (off, daily limit reached, or no readable photo)."
    line = (
        f"✅ Đã chấm ảnh {summary['clinics']} clinic: giữ {summary['kept']}, loại {summary['rejected']}. "
        f"Token dùng: {summary['tokens_in']} vào / {summary['tokens_out']} ra (ảnh đã chấm trước đó lấy từ cache, không tốn thêm)."
        if vi else
        f"✅ Reviewed photos of {summary['clinics']} clinic(s): kept {summary['kept']}, rejected {summary['rejected']}. "
        f"Tokens used: {summary['tokens_in']} in / {summary['tokens_out']} out (previously judged photos come from the cache)."
    )
    return line

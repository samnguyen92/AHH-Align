"""quality_report.py — one scorecard for the whole directory (what /quality shows).

Pure functions over clinic rows, so it is testable without a database or the file system.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from clinic_photos import is_remote, local_file_exists, project_root
from normalize import has_real_photos

BOILERPLATE_MARKERS = (
    "without relying on a family member",
    "may be able to communicate directly with the clinic",
)
TRANSLATIONS = ("vi", "ko", "zh")


def _images(meta: dict) -> List[str]:
    return [u for u in (meta.get("images") or []) if isinstance(u, str) and u]


def analyze_clinic(row: dict, root: Optional[Path] = None, file_exists: Optional[Callable[[str], bool]] = None) -> List[str]:
    """The problems of ONE clinic, as short codes."""
    meta = row.get("metadata") or {}
    exists = file_exists or (lambda url: local_file_exists(url, root))
    images = _images(meta)
    problems: List[str] = []

    servable = [u for u in images if is_remote(u) or exists(u)]  # a photo whose file is gone is not a photo
    if not has_real_photos({**meta, "images": servable}):
        problems.append("no_real_photo")
    if any(u.startswith("/") and not exists(u) for u in images):
        problems.append("broken_photo_file")
    if any(is_remote(u) for u in images):
        problems.append("hotlinked_photo")
    if meta.get("languages_verified") is not True:
        problems.append("languages_unverified")
    if (meta.get("language_verified_on_website") is False):
        problems.append("scout_language_flag")
    if any(marker in str(meta.get("language_note") or "").lower() for marker in BOILERPLATE_MARKERS):
        problems.append("boilerplate_language_note")
    if len(str(row.get("description") or "")) < 150:
        problems.append("short_description")
    if not meta.get("working_hours"):
        problems.append("no_hours")
    if not (meta.get("services") or meta.get("services_offered")):
        problems.append("no_services")
    if servable and not meta.get("photo_review"):
        problems.append("photos_not_reviewed")
    i18n = meta.get("i18n") if isinstance(meta.get("i18n"), dict) else {}
    if any(code not in i18n for code in TRANSLATIONS):
        problems.append("missing_translation")
    return problems


def build_report(rows: List[dict], root: Optional[Path] = None, file_exists: Optional[Callable[[str], bool]] = None, worst: int = 8) -> Dict[str, Any]:
    root = root or project_root()
    counts: Counter = Counter()
    per_clinic = []
    sources: Counter = Counter()
    review = {"clinics": 0, "judged": 0, "rejected": 0, "tokens_in": 0, "tokens_out": 0}
    for row in rows:
        done = (row.get("metadata") or {}).get("photo_review")
        if isinstance(done, dict):
            review["clinics"] += 1
            review["judged"] += int(done.get("judged") or 0)
            review["rejected"] += len(done.get("rejected") or [])
            review["tokens_in"] += int(done.get("tokens_in") or 0)
            review["tokens_out"] += int(done.get("tokens_out") or 0)
        problems = analyze_clinic(row, root, file_exists)
        counts.update(problems)
        sources[(row.get("metadata") or {}).get("images_source") or "unknown"] += 1
        if problems:
            per_clinic.append((len(problems), row.get("slug") or row.get("name"), row.get("status"), problems))
    # broken files matter most (the visitor sees an error), then the number of problems
    per_clinic.sort(key=lambda item: (("broken_photo_file" not in item[3]), -item[0]))
    return {
        "total": len(rows),
        "by_status": dict(Counter(r.get("status") or "unknown" for r in rows)),
        "problems": dict(counts),
        "photo_sources": dict(sources),
        "photo_review": review,
        "worst": [{"slug": slug, "status": status, "problems": problems} for _n, slug, status, problems in per_clinic[:worst]],
    }


LABELS = {
    "broken_photo_file": ("Ảnh có trong DB nhưng file không tồn tại (web báo 404)", "Photos in the database whose file is missing (404 on the site)"),
    "no_real_photo": ("Không có ảnh thật", "No real photo"),
    "photos_not_reviewed": ("Ảnh chưa được model nhìn ảnh kiểm tra (/review_photos)", "Photos not yet checked by the vision review (/review_photos)"),
    "hotlinked_photo": ("Ảnh còn là link ngoài, chưa lưu về máy chủ", "Photos still hot-linked, not stored on our server"),
    "languages_unverified": ("Ngôn ngữ chưa xác minh trên website", "Languages not verified on the website"),
    "scout_language_flag": ("Scout gắn cờ: website không nhắc ngôn ngữ yêu cầu", "Scout flag: the website does not mention the required language"),
    "boilerplate_language_note": ("Ô Language Support dùng câu mẫu chung chung", "Language Support box uses the generic template sentence"),
    "short_description": ("Mô tả quá ngắn (dưới 150 ký tự)", "Description too short (under 150 characters)"),
    "no_hours": ("Thiếu giờ làm việc", "No opening hours"),
    "no_services": ("Thiếu dịch vụ", "No services"),
    "missing_translation": ("Thiếu bản dịch VI/KO/ZH", "Missing VI/KO/ZH translation"),
}


def format_report(report: Dict[str, Any], lang: str = "vi") -> str:
    vi = lang == "vi"
    total = report["total"] or 1
    status = ", ".join(f"{k}: {v}" for k, v in sorted(report["by_status"].items()))
    lines = [f"📊 **{'Chất lượng dữ liệu' if vi else 'Data quality'}**: {report['total']} clinic ({status})", ""]
    for code, (label_vi, label_en) in LABELS.items():
        count = report["problems"].get(code, 0)
        mark = "✅" if count == 0 else ("🔴" if code in ("broken_photo_file", "no_real_photo") else "🟡")
        lines.append(f"{mark} {label_vi if vi else label_en}: {count} ({round(count * 100 / total)}%)")
    sources = ", ".join(f"{k}: {v}" for k, v in sorted(report["photo_sources"].items()))
    lines += ["", f"{'Nguồn ảnh' if vi else 'Photo sources'}: {sources}"]
    review = report.get("photo_review") or {}
    if review.get("clinics"):
        lines.append(
            f"{'Chấm ảnh bằng AI' if vi else 'AI photo review'}: {review['clinics']} clinic, {review['judged']} ảnh gửi đi, loại {review['rejected']}; "
            f"token {review['tokens_in']} vào / {review['tokens_out']} ra"
            if vi else
            f"AI photo review: {review['clinics']} clinic(s), {review['judged']} photos sent, {review['rejected']} rejected; "
            f"tokens {review['tokens_in']} in / {review['tokens_out']} out"
        )
    if report["worst"]:
        lines += ["", f"**{'Cần xử lý trước' if vi else 'Fix first'}**:"]
        for item in report["worst"]:
            lines.append(f"• `{item['slug']}` ({item['status']}): {', '.join(item['problems'][:4])}")
    if report["problems"].get("broken_photo_file"):
        lines += ["", "👉 " + ("Sửa ảnh hỏng: `/repair_clinic_images`" if vi else "Fix dead photos: `/repair_clinic_images`")]
    return "\n".join(lines)

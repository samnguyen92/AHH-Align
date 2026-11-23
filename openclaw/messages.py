"""messages.py — the words the bot says, in the user's language.

One place for the user-facing text of the long-running flows (jobs, scout, scraping), so an English conversation is
English from the first word to the last (it used to mix Vietnamese progress lines, English status lines and raw
internal job names).
"""

from __future__ import annotations

import re
from typing import Optional

# ----------------------------------------------------------------------------- short, readable names

def shorten(text: str, limit: int = 48) -> str:
    """Cut at a word boundary and add "…" (the old [:36] left "providing p" in the middle of a word)."""
    clean = " ".join((text or "").split())
    if len(clean) <= limit:
        return clean
    cut = clean[:limit].rsplit(" ", 1)[0].rstrip(" ,;:-–—") or clean[:limit]
    return cut + "…"


def shorten_query(query: str, limit: int = 80) -> str:
    """A search phrase, not a sentence: keep the part before ";" / " - " and bound its length."""
    first = re.split(r"[;]| prioriti[sz]e | sorted by | ranked by | with the highest ", query or "", maxsplit=1, flags=re.IGNORECASE)[0]
    return shorten(first.strip(" ,.;"), limit)


# ----------------------------------------------------------------------------- action names the user can read

ACTION_LABELS = {
    "inspect_clinic": ("kiểm tra clinic", "check clinic"),
    "rescan_clinic": ("quét lại clinic", "rescan clinic"),
    "update_clinic": ("sửa thông tin clinic", "edit clinic"),
    "undo_clinic_edit": ("hoàn tác thay đổi clinic", "undo the edit of clinic"),
    "approve_clinic": ("duyệt clinic", "approve clinic"),
    "reject_clinic": ("ẩn clinic", "hide clinic"),
    "delete_clinic": ("xoá clinic", "delete clinic"),
    "find_clinics": ("tìm clinic mới", "search for new clinics"),
    "scrape_clinic_url": ("nhập clinic từ website", "import a clinic from its website"),
    "web_edit": ("sửa giao diện web", "edit the website"),
    "seo_setup": ("cài đặt SEO", "set up SEO"),
    "stats_question": ("tra cứu số liệu", "look up stats"),
    "stats_report": ("báo cáo thống kê", "stats report"),
    "rescan_all_clinics": ("quét lại nhiều clinic", "rescan several clinics"),
    "generate_insight": ("viết bài insight", "write an insight article"),
    "generate_guide": ("viết guide", "write a guide"),
    "review_clinic_photos": ("chấm ảnh clinic", "review clinic photos"),
    "clean_clinic_content": ("dọn câu mẫu của clinic", "clean generic clinic text"),
    "check_data_quality": ("kiểm tra chất lượng dữ liệu", "check data quality"),
    "web_pr_merge": ("đưa thay đổi lên website", "publish the website change"),
}


def describe_action(name: str, lang: str) -> str:
    """"find_clinics: Vietnamese doctor Virginia" -> "search for new clinics: Vietnamese doctor Virginia" (never the raw id)."""
    if not name:
        return name
    kind, sep, rest = name.partition(":")
    labels = ACTION_LABELS.get(kind.strip())
    if not labels:
        return name
    label = labels[0] if lang == "vi" else labels[1]
    return f"{label}{sep} {rest.strip()}".rstrip(": ").strip() if rest.strip() else label


# ----------------------------------------------------------------------------- catalogue

CATALOG = {
    "job.working": ("⏳ Đang thực hiện: {what}", "⏳ Working on: {what}"),
    "job.done": ("✅ Xong: {what}", "✅ Done: {what}"),
    "job.stopped": ("⚠️ Đã dừng: {what}", "⚠️ Stopped: {what}"),
    "job.failed": ("❌ Không thành công: {what}\n\n{detail}\n\nXem log đầy đủ bằng /tail.", "❌ Failed: {what}\n\n{detail}\n\nSee the full log with /tail."),
    "job.crashed": ("❌ Lỗi khi {what}: {detail}", "❌ Error during {what}: {detail}"),
    "job.already": ("{what} đang chạy rồi.", "{what} is already running."),
    "approved": ("Đã xác nhận. Bắt đầu: {what}", "Approved. Starting: {what}"),
    "canceled": ("Đã hủy: {what}", "Canceled: {what}"),
    "no_pending": ("Không có thao tác nào đang chờ duyệt.", "There is no pending action waiting for approval."),
    "no_pending_cancel": ("Không có thao tác nào đang chờ để hủy.", "There is no pending action to cancel."),
    "expired": ("Yêu cầu đó đã hết hạn ({what}). Chưa có gì bị thay đổi, bạn gửi lại giúp mình nhé.", "That request expired ({what}). Nothing was changed; send it again."),
    # scout
    "scout.searching": ("Đang tìm trên Google Places: “{query}”", "Searching Google Places: “{query}”"),
    "scout.found": ("Tìm thấy {n} nơi hợp lệ, {new} nơi mới.", "Found {n} valid places, {new} new."),
    "scout.scraping": ("({i}/{n}) Đang đọc website: {name}", "({i}/{n}) Reading the website: {name}"),
    "scout.enriching": ("Đang bổ sung đánh giá, giờ, ảnh: {name}", "Adding reviews, hours, photos: {name}"),
    "scout.photos": ("Đang chọn ảnh thật: {name}", "Choosing real photos: {name}"),
    "card.approved": ("✅ Đã duyệt: clinic đã lên website.", "✅ Approved: the clinic is now on the website."),
    "card.rejected": ("❌ Đã từ chối: clinic bị ẩn (khôi phục được).", "❌ Rejected: the clinic is hidden (can be restored)."),
    "card.already": ("ℹ️ Clinic này không còn là bản nháp (trạng thái: {status}).", "ℹ️ This clinic is no longer a draft (status: {status})."),
    "card.expired": ("Thẻ này đã hết hạn. Dùng /drafts để xem các clinic chờ duyệt.", "This card has expired. Use /drafts to see the clinics waiting for review."),
    "scout.done": ("Hoàn tất.", "Finished."),
    # skip reasons (one word each, shown in the final summary)
    "skip.exists": ("đã có trong hệ thống", "already in the directory"),
    "skip.not_medical": ("không phải cơ sở y tế", "not a healthcare place"),
    "skip.own_site": ("không có website riêng", "no website of its own"),
    "skip.directory": ("là trang danh bạ/xếp hạng", "a directory or ranking page"),
    "skip.dead": ("website không dùng được", "website unusable"),
    "skip.no_content": ("không đọc được nội dung", "could not read the website"),
    "skip.ai": ("không trích xuất được dữ liệu đủ tin cậy", "could not extract reliable data"),
    "skip.low_rating": ("đánh giá thấp hơn mức yêu cầu", "rating below the requested minimum"),
    "skip.few_reviews": ("ít lượt đánh giá hơn mức yêu cầu", "fewer reviews than requested"),
    "skip.failed": ("lỗi khi xử lý", "processing error"),
}


def tr(key: str, lang: Optional[str], **values) -> str:
    entry = CATALOG.get(key)
    if not entry:
        return key
    text = entry[0] if lang == "vi" else entry[1]
    try:
        return text.format(**values)
    except (KeyError, IndexError):
        return text

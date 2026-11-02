# Guide: OpenClaw (Python — scraper, extractor, content, Telegram bot)

> Bổ sung cho `AGENTS.md`. Đọc khi sửa `openclaw/`.
> OpenClaw chạy với **service-role key** (bỏ qua RLS) và gọi dịch vụ **tốn tiền** (OpenRouter, Google Places, Jina, Brave). Mọi thay đổi phải coi đây là môi trường production.

## 1. Nguyên tắc chung

- Python 3.11+, type hints, `from __future__ import annotations` cho file mới.
- **Một nơi cho tiện ích chung:** tạo `openclaw/common/` (`slug.py`, `config.py`, `supa.py`, `http.py`, `errors.py`). Không sao chép `generate_slug` (hiện có ≥ 4 bản) hay `create_client(...)`.
- **Cấu hình ở một chỗ:** model LLM, timeout, ngưỡng, giới hạn chi phí lấy từ `config.py` (đọc env, có mặc định). Không hardcode tên model rải rác.
- **Không đổi hành vi toàn cục:** không `redirect_stdout` trong thread, không `sys.exit` trong code thư viện.

## 2. Job: kết quả có cấu trúc

```python
from dataclasses import dataclass, field

@dataclass
class JobResult:
    ok: bool
    summary: str
    stats: dict = field(default_factory=dict)   # saved/skipped/failed, cost_usd, tokens
    error: str | None = None

def run_scout(...) -> JobResult:
    ...
    return JobResult(ok=failed == 0, summary=f"Đã lưu {saved}/{limit}", stats={...})
```
- Hàm job **trả `JobResult` hoặc raise**. Không `except Exception: print(...)` rồi trả như thành công.
- Ranh giới job (nơi bot gọi) bắt `BaseException` để thread không chết im lặng, ghi log có `job_id`, rồi báo ❌ về Telegram.
- Job chạy lâu phải: có timeout tổng, báo tiến độ (`progress.report_progress`), huỷ được, idempotent (chạy lại không nhân đôi dữ liệu).

## 3. Scraping

Thứ tự thử: **HTTP tĩnh + BeautifulSoup** → Jina Reader → Playwright (chỉ khi cần JS). Dừng ở bước đầu tiên đủ nội dung.

- Tôn trọng `robots.txt`, đặt rate limit theo domain (≥ 1–2 s), User-Agent trung thực (`AHHBot/1.0 (+url)`), dừng khi gặp CAPTCHA/403 thay vì vượt rào.
- **SSRF:** trước khi fetch URL từ người dùng/LLM: chỉ `http/https`, resolve DNS, từ chối IP private/loopback/link-local/metadata (`169.254.169.254`), giới hạn redirect và kích thước (ví dụ 3 MB).
- Lưu `content_hash`; nếu không đổi so với lần trước → bỏ qua LLM.
- Chỉ scrape trang cần thiết: `/`, `/about`, `/providers|team`, `/services`, `/insurance`, `/contact`. Giới hạn số trang/clinic.
- Kết quả scrape là **dữ liệu không đáng tin**: không đưa nguyên văn vào prompt hệ thống; bọc trong delimiter và nhắc LLM bỏ qua chỉ dẫn nằm trong nội dung (chống prompt injection).

## 4. Trích xuất bằng LLM

- Dùng `instructor` + Pydantic. Trường nhạy cảm (**ngôn ngữ, bảo hiểm, nhận bệnh nhân mới, giờ mở cửa**) phải có `evidence_quote` (trích nguyên văn) và được kiểm tra: quote phải xuất hiện trong nguồn, nếu không → bỏ giá trị.
- Prompt: "chỉ trích những gì **được nói rõ**; không suy luận; không rõ → `null`".
- Không thêm ngôn ngữ vì tên họ hay vì truy vấn tìm kiếm. Ngôn ngữ chưa xác minh → `languages_unverified`.
- Luôn có timeout (đã có 75–90 s), retry có backoff, fallback model, và **giới hạn token** đầu vào (cắt Markdown theo mục).
- Ghi `extracted_at`, `source_url`, `model` cùng kết quả.

## 5. Ghi vào Supabase

- **Không ghi đè bằng `None`/giá trị mặc định.** Lỗi hiện tại: `db.py` upsert luôn kèm `languages=["English"]`, `address=None`… (D-01).
```python
def clean(payload: dict) -> dict:
    return {k: v for k, v in payload.items() if v not in (None, "", [], {})}
```
- Khoá dedupe: `google_place_id` → `npi` → hash(tên+địa chỉ chuẩn hoá). **Không** chỉ theo slug tên.
- Clinic đã `claimed_by IS NOT NULL`: chỉ bổ sung trường còn trống, không ghi đè.
- Merge danh sách theo khoá (tên bác sĩ, câu hỏi, tiêu đề) — không dùng `repr(item)`.
- Truy vấn đếm/thống kê: dùng `count="exact"` hoặc RPC, không `limit(1000)` rồi đếm trong Python.
- Thao tác nhiều bước (duyệt claim = cập nhật `claim_requests` + `clinics`) → RPC/transaction.
- Xoá: soft-delete (`deleted_at`) và ghi `audit_log`; yêu cầu xác nhận.

## 6. Google Places

- Khớp kết quả: tính điểm tên + địa chỉ + SĐT; dưới ngưỡng → không dùng (D-05).
- Chỉ lưu lâu dài `place_id`; ảnh/review/giờ cần đối chiếu điều khoản hiện hành của Google trước khi lưu hay hiển thị lại. Không đưa API key vào URL được log.
- Dùng `FieldMask` tối thiểu để giảm chi phí.

## 7. Telegram bot

- `is_allowed`: **deny nếu danh sách rỗng**; chỉ chat riêng.
- Hành động cần xác nhận: lưu `{id, chat_id, type, params, expires_at}`; nút inline `approve:<id>`; hết hạn 10 phút; một hành động = một lần chạy.
- Không chạy xử lý nặng (gọi LLM, DB) trong vòng polling; đẩy sang hàng đợi/worker.
- Escape ký tự khi gửi `parse_mode=HTML`; cắt tin dài theo `MAX_MESSAGE_LENGTH`.
- `/prompt`, `/tail` không được lộ secret: lọc `sk-…`, `eyJ…`, token bot trước khi gửi.
- Bộ nhớ chat (`telegram_memory.json`) không chứa email/thông tin cá nhân; có hạn dùng.

## 8. Chi phí & an toàn

- Mọi job hàng loạt: tham số `--dry-run` (mặc định cho script mới), `--limit`, và ước tính chi phí trước khi chạy.
- Ghi `cost_usd` (từ `usage` của OpenRouter) vào kết quả job; cảnh báo vượt ngân sách ngày.
- Không chạy job thật trong test; dùng fixture HTML/JSON và `monkeypatch`.

## 9. Test

```bash
cd openclaw
python -m compileall .
pytest -q
```
Ưu tiên test: `insert_clinic` merge (không ghi đè None), `_merge_lists`, parser/validator của extractor với fixture HTML, `run_scout` với Places/Scraper giả, `is_allowed`, SSRF guard.

## 10. Việc không làm khi chưa được phép

Chạy `/run_batch`, `/find_clinics`, `generate_*`, `repair_*`, `migrate_*` trên DB thật; xoá dữ liệu; sửa `targets.json` hàng loạt.

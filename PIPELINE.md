# OpenClaw — AI Data Pipeline

> Tên mã nội bộ cho hệ thống AI Agent chạy ngầm, tự động thu thập và chuẩn hóa dữ liệu y tế.

## Tổng quan

OpenClaw là "trái tim" của Asian Health Hub. Thay vì nhập liệu thủ công, hệ thống này chạy 24/7 để:
1. Thu thập dữ liệu bác sĩ/phòng khám từ nhiều nguồn
2. Dùng AI (LLM) bóc tách thông tin từ HTML thô
3. Hợp nhất dữ liệu, loại bỏ trùng lặp
4. Tự động tạo nội dung SEO (Insights & Guides)

## Pipeline 4 Bước

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  BƯỚC 1      │     │  BƯỚC 2      │     │  BƯỚC 3          │     │  BƯỚC 4          │
│  Baseline    │────▶│  AI Scraping │────▶│  Extract & Merge │────▶│  Content Gen     │
│  (NPI Data)  │     │  (Playwright)│     │  (LLM + Pydantic)│     │  (AI Articles)   │
└──────────────┘     └──────────────┘     └──────────────────┘     └──────────────────┘
```

---

### Bước 1: Baseline — Khởi tạo từ NPI Registry

**Nguồn dữ liệu**: [NPPES NPI Registry](https://npiregistry.cms.hhs.gov/) (Chính phủ Mỹ, miễn phí)

**Quy trình**:
1. Query NPI API theo **họ đặc trưng châu Á** (danh sách dưới)
2. Lấy các trường: `npi_number`, `first_name`, `last_name`, `specialty`, `address`, `city`, `state`, `zip`, `phone`
3. Insert vào bảng `clinics` với `metadata.npi_number`

**Danh sách họ mục tiêu** (mở rộng theo thời gian):
```
Vietnamese: Nguyen, Tran, Le, Pham, Hoang, Phan, Vu, Vo, Dang, Bui, Do, Ho, Ngo, Duong, Ly
Korean:     Kim, Lee, Park, Choi, Jung, Kang, Cho, Yoon, Jang, Lim, Han, Oh, Shin, Seo, Kwon
Chinese:    Wang, Li, Zhang, Liu, Chen, Yang, Huang, Wu, Zhou, Xu, Sun, Ma, Zhu, Hu, Lin
```

**Output**: Bảng `clinics` được mồi (seed) ~10,000+ bản ghi cơ bản.

---

### Bước 2: AI Scraping — Thu thập dữ liệu chi tiết

**Công cụ**: Python + Playwright (stealth mode) + rotating proxies

**Quy trình**:
1. Với mỗi clinic từ Bước 1, tìm **website chính thức** qua Google Search
2. Truy cập website → lấy **HTML thô** toàn bộ trang
3. Song song, query **Google Maps API** và **Yelp API** để lấy:
   - Reviews & ratings
   - Working hours
   - Photos
   - Languages spoken (nếu có)

**Stealth Techniques**:
- Random User-Agent rotation
- Request throttling (2-5s delay giữa các request)
- Playwright stealth plugin (`playwright-stealth`)
- Proxy rotation (residential proxies)

**Output**: Raw HTML + Google/Yelp JSON cho mỗi clinic.

---

### Bước 3: Extract & Merge — Bóc tách + Hợp nhất bằng LLM

**Công cụ**: OpenAI GPT-4o / DeepSeek + Pydantic validation

**Quy trình**:
1. Gửi raw HTML vào LLM với prompt chuẩn hóa:
   ```
   Extract from this clinic webpage:
   - Languages spoken by staff
   - Working hours
   - Insurance accepted
   - Services/specialties offered
   Return as structured JSON matching the schema.
   ```
2. Validate output bằng **Pydantic model** (đảm bảo đúng format)
3. **Merge logic** — Ưu tiên dữ liệu:
   - Website chính thức > Google Maps > Yelp > NPI
   - Nếu conflict → giữ dữ liệu mới nhất hoặc từ nguồn tin cậy hơn
4. Deduplicate bằng: `(name + address + city)` hoặc `npi_number`
5. Update bảng `clinics.metadata` (JSONB) và `clinics.languages`

**Pydantic Model** (Python):
```python
class ClinicExtraction(BaseModel):
    languages: list[str] = []
    working_hours: dict[str, str] = {}  # {"monday": "9:00 AM - 5:00 PM", ...}
    insurance_accepted: list[str] = []
    rating: float | None = None
    rating_count: int | None = None
    reviews: list[ReviewItem] = []
```

**Output**: Bảng `clinics` được enriched với dữ liệu đầy đủ.

---

### Bước 4: Content Generation — Tạo bài viết SEO tự động

**Mục đích**: Tạo hàng nghìn bài **Insights & Guides** để phủ sóng Google.

**Quy trình**:
1. **Trend Analysis**: Phân tích Google Trends / keyword research cho các chủ đề y tế phổ biến trong cộng đồng gốc Á
2. **Fact Collection**: Thu thập facts từ nguồn uy tín (CDC, WHO, NIH)
3. **AI Writing**: LLM viết bài hoàn chỉnh dựa trên facts + SEO keywords
4. **Human Review**: Biên tập viên duyệt → Xuất bản

**Ví dụ bài viết mục tiêu**:
- "Hướng dẫn khám sức khỏe I-693 cho thẻ xanh — Quy trình A-Z"
- "Top 10 phòng khám nói tiếng Việt tại San Jose"
- "Cách sử dụng bảo hiểm Medi-Cal cho người Việt mới định cư"

**Output**: Bảng `articles` (chưa tạo) chứa bài viết + trạng thái (draft/published).

---

## Kiến trúc Kỹ thuật Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                     PYTHON ENGINE (FastAPI)                   │
│                                                               │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌────────┐ │
│  │ NPI      │  │ Playwright   │  │ LLM       │  │ Content│ │
│  │ Fetcher  │  │ Scraper      │  │ Extractor │  │ Writer │ │
│  │          │  │ (stealth)    │  │ (GPT-4o)  │  │        │ │
│  └────┬─────┘  └──────┬───────┘  └─────┬─────┘  └───┬────┘ │
│       │               │               │             │       │
│       └───────────────┴───────┬───────┴─────────────┘       │
│                               │                              │
│                     ┌─────────▼─────────┐                   │
│                     │  Task Queue       │                   │
│                     │  (Celery / Redis) │                   │
│                     └─────────┬─────────┘                   │
│                               │                              │
└───────────────────────────────┼──────────────────────────────┘
                                │
                      ┌─────────▼─────────┐
                      │  Supabase         │
                      │  PostgreSQL       │
                      │  (clinics table)  │
                      └───────────────────┘
```

## API Endpoints (Planned)

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `POST` | `/api/pipeline/seed-npi` | Trigger NPI baseline seeding |
| `POST` | `/api/pipeline/scrape` | Trigger scraping cho batch clinics |
| `POST` | `/api/pipeline/extract` | Trigger LLM extraction cho raw data |
| `POST` | `/api/pipeline/generate-content` | Trigger AI content generation |
| `GET`  | `/api/pipeline/status` | Xem trạng thái pipeline hiện tại |

## Telegram Operator Bot

OpenClaw có thể chạy như một Telegram bot để bạn điều khiển backend mà không cần mở terminal.

### Cấu hình

Trong `openclaw/.env`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
OPENROUTER_API_KEY=...
OPENCLAW_AGENT_MODEL=deepseek/deepseek-chat
OPENCLAW_INTENT_MODEL=deepseek/deepseek-v4-flash
OPENCLAW_RESEARCH_PLANNER_MODEL=deepseek/deepseek-v4-flash
OPENCLAW_RESEARCH_DEEP_MODEL=deepseek-v3.2:cloud
OPENCLAW_RESEARCH_TIMEOUT=60
OPENCLAW_RESEARCH_RETRIES=3
OPENCLAW_RESEARCH_TARGET_LINKS=12
OPENCLAW_RESEARCH_FACT_WORKERS=3
OPENCLAW_USE_DDGS_API=false
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ALLOWED_USER_IDS=123456789
TELEGRAM_MAX_JOB_OUTPUT_CHUNKS=12
OPENCLAW_MEMORY_MAX_CHARS=60000
```

- Tạo bot bằng `@BotFather`.
- Lấy Telegram user id bằng `@userinfobot`.
- `TELEGRAM_ALLOWED_USER_IDS` nên luôn được set để tránh người lạ trigger job tốn tiền.

### Chạy bot

```bash
cd openclaw
python telegram_bot.py
```

Nếu terminal đang hiển thị prompt trong thư mục `openclaw` rồi, chỉ cần chạy:

```bash
python telegram_bot.py
```

### Commands

| Command | Mô tả |
|---------|-------|
| `/status` | Kiểm tra env, kết nối Supabase, số clinics/articles |
| `/run_batch` | Chạy search → scrape → extract → save cho target clinics trong `run_batch.py` |
| `/repair_clinic_images` | Generate ảnh còn thiếu cho directory clinics |
| `/repair_article_images` | Generate ảnh còn thiếu cho articles |
| `/repair_article_slugs` | Sửa article slug có tiếng Việt/ký tự đặc biệt sang ASCII URL-safe |
| `/delete_article <id\|slug\|title>` | Xoá một article sau khi approve |
| `/delete_clinic <id\|slug\|name>` | Xoá một clinic sau khi approve |
| `/generate_insight [topic]` | Generate một SEO insight khoảng 1200-1500 words và 2 ảnh AI. Nếu không truyền topic, OpenClaw tự chọn topic chưa dùng |
| `/generate_insight_from_url <url...>` | Đọc một hoặc nhiều link tham khảo, AI phân tích nội dung, viết bài insight gốc khoảng 1200-1500 words và publish lên website |
| `/generate_guide [topic]` | Generate một guide chuyên sâu dạng Pillar Content khoảng 2000 words và 2 ảnh AI |
| `/generate_guide_from_url <url...>` | Đọc một hoặc nhiều link tham khảo, AI phân tích nội dung, viết guide chuyên sâu khoảng 2000 words và publish lên website |
| `/research <topic>` | Chạy pipeline nghiên cứu đa tác nhân và trả về báo cáo có nguồn |
| `/ask <message>` | Hỏi OpenClaw AI agent bằng ngôn ngữ tự nhiên |
| `/prompt` | Xem system prompt hiện tại của agent |
| `/tail` | Xem log gần nhất từ `openclaw/openclaw.log` |
| `/help` | Hiển thị menu |

Ngoài slash command, bạn cũng có thể nhắn text bình thường. Bot sẽ đóng vai thư ký vận hành: phân tích intent, tóm tắt tác vụ sắp chạy, rồi hỏi xác nhận. Nếu đúng, trả lời:

```text
approve
```

Bot chỉ bắt đầu job sau khi nhận approve. Bạn có thể hủy bằng:

```text
cancel
```

Prompt của agent nằm ở `openclaw/agent_prompt.py`.

Ví dụ tạo insight từ URL tham khảo:

```text
/generate_insight_from_url https://www.pharmacity.vn/benh/trao-nguoc-da-day.html
```

OpenClaw sẽ scrape nội dung, dùng AI phân tích các ý y tế chính, sau đó viết bài **nguyên bản** cho Asian Health Hub. Prompt đã yêu cầu không sao chép wording, heading, hoặc cấu trúc dài của nguồn.

Ví dụ tạo guide chuyên sâu từ URL tham khảo:

```text
/generate_guide_from_url https://www.pharmacity.vn/benh/trao-nguoc-da-day.html
```

Guide khác với insight thường: prompt yêu cầu dạng **Pillar Content** dài hơn, có cấu trúc chi tiết, checklist/bảng, FAQ, phần next steps, và 2 ảnh AI.

Ví dụ chạy nghiên cứu đa tác nhân:

```text
/research Hanta virus symptoms prevention and latest public health guidance
```

Research pipeline gồm 5 role chuyên biệt:

1. **Search Planner**: phân tích intent, mở rộng keyword, quyết định số nguồn mục tiêu.
2. **Batch Link Selector**: chọn nguồn tốt nhất từ pool kết quả search, phân loại `detail` hoặc `list`.
3. **Sub-link Extractor**: đào link con từ trang `list`/hub.
4. **Fact Extractor**: scrape từng detail page và trích xuất facts cuốn chiếu.
5. **Final Editor**: tổng hợp fact sheets thành báo cáo cuối cùng có source notes.

## Lưu ý Quan trọng

1. **Rate Limiting**: NPI API giới hạn ~200 requests/giây. Google/Yelp API có quota riêng.
2. **Legal**: Scraping phải tuân thủ `robots.txt`. Dữ liệu NPI là public domain.
3. **Cost**: LLM calls tốn tiền. Ưu tiên batch processing và cache kết quả.
4. **Deduplication**: Luôn check trùng bằng `npi_number` hoặc `(name, address, city)` trước khi insert.

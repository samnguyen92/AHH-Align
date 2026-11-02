# REPO OVERVIEW — Asian Health Hub

> Tóm tắt cấu trúc, luồng dữ liệu và cách các phần kết nối với nhau. Dựa trên việc đọc code ở commit `b1c2688`.
> Phần nào chưa đọc kỹ được ghi rõ ở mục 9.

## 1. Mục tiêu sản phẩm

Giúp người Mỹ gốc Á tìm phòng khám/bác sĩ **nói tiếng mẹ đẻ** (Việt, Hàn, Hoa…), theo **chuyên khoa + thành phố + ngôn ngữ**; giúp phòng khám tiếp cận bệnh nhân.

Ba trụ cột (README):
1. **Smart Directory** — tìm kiếm, hồ sơ clinic (giờ mở cửa, bảo hiểm, đội ngũ, review, bản đồ).
2. **Insights & Guides** (+ **Pulse** newsletter) — bài viết y tế AI tạo, kéo SEO.
3. **Claim Profile** — chủ phòng khám xác nhận và cập nhật hồ sơ.

## 2. Kiến trúc

```
                 Người dùng / Chủ clinic
                          │
                 ┌────────▼─────────┐
                 │ Next.js 16 (Vercel│   Server Components + Route Handlers
                 │ hoặc Docker)      │   src/app, src/services
                 └────────┬─────────┘
                          │ anon key (đọc) / service-role (ghi, chỉ server)
                 ┌────────▼─────────┐
                 │ Supabase          │   Postgres + RLS, Auth, Storage,
                 │                   │   pgvector (chưa có pipeline nạp)
                 └────────▲─────────┘
                          │ service-role key
                 ┌────────┴─────────┐        ┌─────────────────┐
                 │ OpenClaw (Python) │◄──────►│ Telegram bot    │
                 │ scraper/extractor │ thread │ (long-polling)  │
                 │ content/image gen │        └─────────────────┘
                 └──┬────┬────┬─────┘
          Jina Reader│    │    │OpenRouter (DeepSeek, MiniMax, Gemini image)
          Playwright │    │Google Places API (New)
                     │Brave/DDG/Bing search
```

Lưu ý: tài liệu cũ (`ARCHITECTURE.md`) nhắc FastAPI trên Fly.io; thực tế bot chạy trực tiếp bằng `python telegram_bot.py` (xem `openclaw/Dockerfile`, `docker-compose.yml`). `/api/admin/pipeline` gọi `OPENCLAW_API_URL` nhưng không có server nào nhận → chạy chế độ dry-run.

## 3. Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| `src/app/` | Trang và API (App Router). `[state]/[city]/[specialty]` là landing SEO; `clinics/[slug]`, `insights`, `pulse`, `claim`, `dashboard`, `admin`, `auth` |
| `src/app/api/` | `admin/*` (clinics, claims, users/role, media, pipeline, analytics), `claim`, `search`, `analytics`, `newsletter/subscribe`, `dashboard/clinic`, `auth/me`, `health/supabase` |
| `src/services/` | Tầng dữ liệu: `clinic-service` (838 dòng), `article-service`, `admin-service`, `auth-service`, `semantic-search`, `supabase-*` |
| `src/components/` | `admin/`, `auth/`, `claim/`, `clinic/` (profile, gallery), `home/`, `insights/`, `layout/`, `search/`, `ui/` (shadcn), `lg/` (hệ thiết kế "Longevity") |
| `src/lib/` | `supabase/`, `auth/session-cookie`, `telegram`, `local-seo`, `json-ld`, `analytics`, `clinic-image`, `article-image` |
| `src/proxy.ts` | (Next 16 thay middleware) chuyển hướng `/admin`, `/dashboard` nếu không có cookie |
| `supabase/schema.sql`, `seed.sql` | Schema, RLS, hàm `is_admin`, trigger slug/role, `match_clinic_embeddings` |
| `openclaw/` | Toàn bộ pipeline Python (mục 4) |
| Tài liệu | `README`, `ARCHITECTURE`, `PIPELINE`, `DEPLOYMENT`, `GIT_WORKFLOW`, `implementation_plan*.md`, `task.md`, `walkthrough.md` |
| Script rời | `check_*.py`, `migrate_slugs.py`, `update_article_image.py`, `test_service.py` (gốc repo) |

## 4. OpenClaw (Python)

| Module | Vai trò |
|---|---|
| `telegram_bot.py` (2.1k dòng) | Long-polling; lệnh slash + chat tự nhiên → `analyze_request` (LLM "intent analyzer") → tạo *pending action* → chờ `approve` → `run_job` trong thread. Có bộ nhớ theo chat (`telegram_memory.json`) |
| `jobs.py` | Bọc từng tác vụ, bắt stdout, ghi `openclaw.log` (xoay vòng 5MB×3) |
| `run_scout.py` | Khám phá: Google Places → lọc không-y-tế → lọc đã tồn tại → scrape → extract → enrich → ảnh → lưu |
| `run_batch.py` + `targets.json` | Chạy danh sách mục tiêu: `searcher` tìm URL → scrape → extract → Google → (third-party) → lưu |
| `run_single_clinic_url.py` | Thêm/cập nhật một clinic từ URL |
| `scraper.py` | Jina Reader (markdown) + Playwright stealth (JSON-LD, ảnh, iframe, link đặt lịch, spider ≤4 trang con) |
| `extractor.py` | `instructor` + Pydantic (`ClinicExtraction`): dịch vụ, bảo hiểm, đội ngũ, giá, giờ, địa điểm, đặt lịch, review… DeepSeek → fallback MiniMax |
| `google_places.py` | Tìm/Chi tiết/ảnh/review; tóm tắt review bằng LLM; chuẩn hoá giờ |
| `third_party_profiles.py` | (tuỳ chọn, tắt mặc định) Zocdoc/Healthgrades/… |
| `searcher.py` | Brave → DDG HTML → Bing HTML; chấm điểm URL; chặn domain thư mục |
| `extractor` → `db.py` | `insert_clinic`: dedupe theo slug, merge `metadata` JSONB |
| `storage.py` | Tải ảnh, đổi WebP (Pillow), upload Supabase Storage |
| `image_generator.py` | Ảnh clinic bằng Gemini image qua OpenRouter |
| `generate_insights.py` (2.5k dòng) | Sinh bài Insight/Guide: chọn chủ đề, outline, từng section, bằng chứng tham chiếu, ảnh, publish; `rewrite_article` có phiên bản |
| `generate_pulse.py`, `generate_8_pulses.py`, `generate_june_pulse.py` | Bản tin tháng AHH Pulse |
| `research_agents.py` | Đa tác tử: Search Planner → Link Selector → Sub-link Extractor → Fact Extractor → Final Editor |
| `admin_actions.py` | Xoá, đổi ảnh đại diện, newsletter, claim, analytics (qua Telegram) |
| `repair_*`, `enrich_clinics_google.py`, `migrate_images_to_storage.py` | Job sửa dữ liệu hàng loạt |
| `agent_prompt.py`, `ai_agent.py` | System prompt + chat `/ask` |

### Luồng "scout" điển hình (`/find_clinics Vietnamese dentist in Houston | 3`)

1. `search_places_by_text` (ràng buộc bounding box nước Mỹ).
2. Lọc loại không phải y tế (`NON_MEDICAL_BLOCKED_TYPES`) → lọc website hợp lệ → lọc đã có trong DB (tên/website).
3. Với mỗi nơi mới: `scrape_content_from_url` → `extract_clinic_data` → "language gate" mềm → `enrich_clinic_with_google_places` → ảnh (website hoặc AI) → `insert_clinic`.
4. Báo tiến độ về Telegram qua callback.

## 5. Mô hình dữ liệu (Supabase)

`organizations`, `clinics` (cột chuẩn + `metadata JSONB` chứa gần như toàn bộ dữ liệu giàu), `articles`, `article_facts`, `claim_requests`, `clinic_submissions`, `user_roles`, `clinic_embeddings` (vector 1536), `analytics_events`, `newsletter_subscriptions`.

- RLS bật cho mọi bảng; đọc công khai `clinics` và `articles` đã `published`.
- Trigger: `set_clinic_slug`, `handle_new_user_role` (tạo `user_roles`, chỉ nhận `user`/`provider`).
- Hàm: `is_admin`, `is_superadmin` (SECURITY DEFINER), `match_clinic_embeddings`.
- `metadata` chứa: `images`, `working_hours`, `services_offered`, `insurance`, `team_members`, `pricing`, `faqs`, `review_profile`, `google_*`, `third_party_profiles`…

## 6. Xác thực và phân quyền

- Đăng nhập bằng Supabase Auth ở client; access token lưu vào cookie `ahh-access-token` bằng JS (`session-cookie.ts`).
- API route đọc token từ header `Authorization: Bearer` hoặc cookie, gọi `supabase.auth.getUser(token)`.
- Vai trò: `user | provider | admin | superadmin` trong `user_roles`. **Lỗi nghiêm trọng:** code đọc role từ `user_metadata` (S-01 trong `ISSUES_AUDIT.md`).

## 7. Rendering & SEO

SSG: trang tĩnh; ISR: `/[state]/[city]`, `/[state]/[city]/[specialty]`, `/pulse/[slug]`; SSR: `/search`, `/clinics/[slug]`, admin, dashboard. Có `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, JSON-LD cho site/organization/city.

## 8. Biến môi trường chính

| Biến | Dùng ở |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Web (client + server) |
| `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Server web + OpenClaw (**bí mật**) |
| `SUPABASE_STORAGE_BUCKET` | Upload ảnh |
| `OPENROUTER_API_KEY` | Mọi LLM + ảnh |
| `GOOGLE_PLACES_API_KEY` | Scout/enrich |
| `JINA_API_KEY`, `BRAVE_SEARCH_API_KEY` | Scrape/search (tuỳ chọn) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS`, `TELEGRAM_ADMIN_CHAT_ID` | Bot và thông báo từ web |
| `OPENAI_API_KEY` | Embedding cho semantic search (chưa có pipeline nạp embedding) |
| `OPENCLAW_API_URL`, `OPENCLAW_API_TOKEN` | Điều khiển pipeline từ admin (chưa có server) |

## 9. Độ phủ của lần kiểm tra

**Đã đọc kỹ:** `db.py`, `storage.py`, `image_generator.py`, `google_places.py`, `admin_actions.py`, `jobs.py`, `run_scout.py`, `run_batch.py`, phần đầu `scraper.py` và `extractor.py`, `agent_prompt.py`, `ai_agent.py`, khung và luồng điều khiển của `telegram_bot.py`, `create_article_from_prompt` và các hàm hạ tầng của `generate_insights.py`, `clinic-service.ts` (phần search/slug/SEO), `auth-service.ts`, tất cả API route đã liệt kê ở mục 3 trừ `admin/analytics`, `admin/articles`, `claim/status`, `health`, `schema.sql` (bảng, RLS, hàm), `sitemap/robots`, `clinic-image`, `next.config.ts`, Dockerfile, docker-compose.

**Chỉ lướt (grep/đọc đầu file):** các prompt chi tiết trong `generate_insights.py` (dòng 612–1260, 1315–1700), `research_agents.py`, `third_party_profiles.py`, `searcher.py`, `run_single_clinic_url.py`, `repair_*`, `generate_pulse*.py`, `telegram_bot.py` (các hàm `analyze_request`, `build_*_action`), các page/component UI (`lg-clinic-profile.tsx`, `clinics-management.tsx`, `pulse/*`, `article-editor.tsx`…).

**Chưa chạy:** pipeline, bot, API với dữ liệu thật; các lỗi trong `ISSUES_AUDIT.md` có nhãn 🔎 được xác nhận bằng đọc code chứ chưa tái hiện trên môi trường thật.

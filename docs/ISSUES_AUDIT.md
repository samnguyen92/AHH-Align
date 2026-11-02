# ISSUES AUDIT — Asian Health Hub

> Kiểm tra ngày 2026-11-02 trên commit `b1c2688` (nhánh mặc định).
> Phạm vi: toàn bộ `openclaw/` (Python), `src/` (Next.js), `supabase/schema.sql`, cấu hình Docker/Next.
> File này là **danh sách sống**: khi sửa xong một lỗi, đổi trạng thái và ghi PR.

## 0. Cách kiểm chứng và độ tin cậy

| Nhãn | Ý nghĩa |
|---|---|
| ✅ **Đã chạy** | Có lệnh/đầu ra thực tế (tsc, eslint, build, compileall) |
| 🔎 **Xác nhận bằng code** | Đọc code trực tiếp, đường đi lỗi rõ ràng, **chưa chạy exploit/test thực tế** |
| ⚠️ **Suy luận** | Cần thử trên môi trường thật trước khi kết luận |

Không có credential Supabase/OpenRouter/Telegram trong môi trường kiểm tra, nên **chưa chạy** pipeline, bot, hay API với dữ liệu thật.

### Kết quả lệnh đã chạy (baseline)

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | ✅ Sạch, 0 lỗi |
| `python -m compileall openclaw` | ✅ Biên dịch được |
| `npx eslint src` | ❌ **56 lỗi, 21 cảnh báo** — 48 × `no-explicit-any`, 6 × `react-hooks/set-state-in-effect`, 2 × `react/no-unescaped-entities`. Tập trung: `clinics-management.tsx` (19), `pulse/[slug]/page.tsx` (18), `admin/analytics/page.tsx` (5), `pulse/page.tsx` (4) |
| `npx next build` (không có env) | ❌ **Thất bại** khi prerender `/_not-found`: `Missing Supabase environment variables` ném từ module `src/services/supabase-client.ts` (xem [B-01](#b-01)) |
| Test tự động | ❌ Không có (chỉ `test_service.py` và các `check_*.py` chạy tay) |

---

## 1. Tổng quan theo mức độ

| Mức | Số lỗi | Ý nghĩa |
|---|---|---|
| 🔴 Critical | 3 | Bị khai thác từ bên ngoài / lộ quyền quản trị |
| 🟠 High | 13 | Mất/sai dữ liệu, bypass kiểm soát, rủi ro pháp lý-nội dung |
| 🟡 Medium | 22 | Lỗi logic, độ tin cậy, SEO, hiệu năng |
| 🟢 Low | 10 | Dọn dẹp, hardening |

Thứ tự ưu tiên đề xuất: **S-01 → S-02 → S-03 → D-01 → D-02 → D-03 → C-01 → C-02 → B-01**.

---

## 2. 🔴 Critical — Bảo mật

### S-01 — Leo thang quyền admin/superadmin qua `user_metadata.role` 🔎
- **Vị trí:** `src/services/auth-service.ts:179` (đọc `role` từ `user_metadata`), `:73` (`isAdminUser` trả `true` ngay nếu `user.role` là admin/superadmin, **trước khi** tra DB), `:86` (`isSuperAdminUser` tương tự).
- **Cơ chế:** `user_metadata` do chính người dùng ghi được (`supabase.auth.updateUser({ data: { role: 'superadmin' } })`). Hàm `getUserFromAccessToken` đưa giá trị này vào `CurrentUser.role`; `requireAdminFromRequest` và `requireSuperAdminFromRequest` tin nó.
- **Ảnh hưởng:** bất kỳ tài khoản đã đăng nhập nào có thể gọi các API admin: sửa/xoá clinic (`/api/admin/clinics/[id]`), duyệt claim (`/api/admin/claims/[id]`), upload media (`/api/admin/media`), điều khiển pipeline, **đổi role của người khác** (`/api/admin/users/[id]/role`, yêu cầu superadmin — cũng bị vượt qua).
- **Lưu ý:** trigger DB `handle_new_user_role` đã chặn gán `admin` ở bảng `user_roles`, nhưng code app kiểm `user.role` từ metadata **trước**, nên trigger không cứu được.
- **Cách sửa:**
  1. Bỏ `role` khỏi `getUserFromAccessToken`; luôn tra `user_roles` (hoặc `app_metadata`, chỉ service-role ghi được).
  2. `isAdminUser` / `isSuperAdminUser` chỉ dựa vào kết quả DB (có cache ngắn trong request).
  3. Xoá `role: 'provider'` khỏi metadata trong `signup-form.tsx:27` (trigger đã xử lý).
  4. Thêm test: user có metadata `role=superadmin` nhưng không có dòng DB → 403.
  5. Kiểm tra log Supabase Auth xem có user nào đã từng `updateUser` với role lạ; rà bảng `user_roles` và `auth.users.raw_user_meta_data->>'role'`.

### S-02 — Bot Telegram mở cho mọi người nếu quên cấu hình 🔎
- **Vị trí:** `openclaw/telegram_bot.py:264-265` — `return not self.allowed_user_ids or user_id in self.allowed_user_ids`.
- **Ảnh hưởng:** nếu `TELEGRAM_ALLOWED_USER_IDS` rỗng (mặc định trong `.env.example`), **bất kỳ ai tìm thấy bot** đều dùng được lệnh xoá clinic/bài, duyệt claim, xem email newsletter, chạy job tốn tiền.
- **Cách sửa:** mặc định từ chối; refuse khởi động bot khi biến rỗng. Đồng thời kiểm tra `chat.type == "private"`.

### S-03 — Mass assignment: chủ clinic ghi đè được bất kỳ trường `metadata` nào 🔎
- **Vị trí:** `src/app/api/dashboard/clinic/route.ts:45-60` (`{ ...currentMetadata, ...body.metadata }`); `src/app/api/admin/clinics/[id]/route.ts` tương tự; RLS `clinics_auth_update` cho phép `claimed_by = auth.uid()` cập nhật **cả cột `metadata`** trực tiếp bằng anon key.
- **Ảnh hưởng:** provider đặt `metadata.rating`, `rating_count`, `review_profile`, `reviews`, `google_place_id`, `language_verified_on_website`… → rating/review giả, nhãn "verified" giả, ảnh hưởng thứ hạng (sắp xếp theo `metadata->rating`).
- **Cách sửa:** allowlist trường provider được sửa (hours, services, languages, phone, website, about…). Trường do hệ thống sở hữu (rating, reviews, google_*, verified) chuyển sang cột/bảng riêng không cho provider ghi; siết RLS dùng `WITH CHECK` kèm trigger bảo vệ cột.

---

## 3. 🟠 High

### Bảo mật & truy cập

#### S-04 — RLS `WITH CHECK (true)` cho mọi user đã đăng nhập 🔎
- **Vị trí:** `supabase/schema.sql` — 7 policy `WITH CHECK (true)` cho `authenticated`: `organizations_auth_insert` (:358), `organizations_auth_update` (:364), `clinics_auth_insert` (:374), `articles_auth_insert` (:396), `article_facts_auth_insert` (:418), `article_facts_auth_update` (:424), `clinic_embeddings_auth_insert` (:467).
- **Ảnh hưởng:** ai đăng ký tài khoản cũng `insert` được clinic/article/article_facts/embedding và sửa organization/article_facts bằng anon key từ trình duyệt (spam, nội dung độc hại, SEO spam trong sitemap, đầu độc semantic search).
- **Sửa:** insert chỉ cho admin (`public.is_admin(auth.uid())`); Python dùng service-role nên không ảnh hưởng.

#### S-05 — Claim "guest" không xác thực, không rate-limit, không chống spam 🔎
- **Vị trí:** `src/app/api/claim/route.ts` (Flow 1 và Flow 2 đều chấp nhận không đăng nhập).
- **Vấn đề:** không giới hạn độ dài, không CAPTCHA, không xác minh email; kiểm tra trùng bằng `proof_data->>email` do client tự khai; mỗi request gửi 1 tin Telegram → có thể flood bot admin.
- **Sửa:** Turnstile/hCaptcha, rate limit theo IP+email, xác minh email (magic link) trước khi tạo claim, giới hạn kích thước `proof_data`/`notes`.

#### S-06 — Duyệt claim của khách (không có `user_id`) khoá clinic vô chủ 🔎
- **Vị trí:** `src/app/api/admin/claims/[id]/route.ts:52-60` và `openclaw/admin_actions.py` `approve_claim` — set `claimed_by = claim.user_id` (có thể `null`) cùng `is_claimed = true`.
- **Ảnh hưởng:** clinic hiển thị "đã claim" nhưng không ai sở hữu; chặn mọi claim sau (`409 already claimed`).
- **Sửa:** từ chối duyệt khi `user_id` null (yêu cầu claimant tạo tài khoản/liên kết trước); dùng transaction/RPC cho 2 bước cập nhật.

#### S-07 — Claim: không kiểm tra chuyển trạng thái, từ chối không thu hồi quyền 🔎
- **Vị trí:** `admin/claims/[id]/route.ts` — cho phép `rejected → approved`, `approved → rejected` bất kỳ lúc nào; đổi `approved → rejected` **không** reset `clinics.claimed_by`/`is_claimed`. Hai bước cập nhật không nguyên tử.
- **Sửa:** state machine `pending → approved|rejected` một chiều; RPC trong một transaction; có API "thu hồi" riêng.

#### S-08 — Telegram HTML injection khi thông báo claim/newsletter 🔎
- **Vị trí:** `src/app/api/claim/route.ts` (chèn `clinic_name`, `full_name`, `updates`… thẳng vào chuỗi `parse_mode: 'HTML'`), `src/lib/telegram.ts`.
- **Ảnh hưởng:** ký tự `<` làm Telegram từ chối tin (mất thông báo claim); kẻ tấn công chèn thẻ `<a href>` giả mạo trong tin gửi cho admin (phishing).
- **Sửa:** `escapeHtml()` mọi giá trị người dùng; kiểm `res.ok` và retry/ghi log khi gửi lỗi.

#### S-09 — Lỗ hổng PostgREST filter injection / wildcard trong tìm kiếm 🔎
- **Vị trí:** `src/services/clinic-service.ts:55` (`city.ilike.%${c}%` trong `.or()`), `:69` (`name.ilike.%${params.query}%,address.ilike.…`).
- **Vấn đề:** `query` chứa `,` `)` `.` có thể thêm điều kiện lọc tuỳ ý vào chuỗi `or`; `%`/`_` không được escape → quét rộng, tốn tài nguyên.
- **Sửa:** escape theo cú pháp PostgREST hoặc chuyển sang RPC `search_clinics(...)` / full-text search (có sẵn GIN index); giới hạn độ dài `query`.

#### S-10 — Open redirect qua tham số `next` ⚠️
- **Vị trí:** `src/components/auth/login-form.tsx:16`, `src/app/api/auth/me/route.ts:8` — chỉ kiểm `startsWith('/')`; `//evil.example` thỏa điều kiện.
- **Sửa:** từ chối `//` và `/\`; so khớp với allowlist đường dẫn.

### Dữ liệu & nội dung

#### D-01 — Upsert ghi đè dữ liệu cũ bằng `None` / mặc định 🔎
- **Vị trí:** `openclaw/db.py:164-199` — `db_payload` luôn có `description, address, city, state, zip_code, phone, specialty` (có thể `None`), `languages` mặc định `["English"]`, `is_telehealth_available` mặc định `False`; rồi `upsert(db_payload)`.
- **Ảnh hưởng:** chạy lại scraper trên clinic đã có (kể cả khi lần scrape mới thiếu trường) **xoá** địa chỉ/SĐT/ngôn ngữ đã có hoặc đã được chủ clinic cập nhật; đặt lại `languages=["English"]` làm mất ngôn ngữ châu Á.
- **Sửa:** chỉ đưa trường có giá trị vào payload; merge `languages` bằng union; bỏ qua clinic có `claimed_by`; chỉ cập nhật trường rỗng hoặc có `confidence` cao hơn.

#### D-02 — Gán ngôn ngữ chưa xác minh vào `languages[]` 🔎
- **Vị trí:** `openclaw/run_scout.py:337-371` — khi website không nhắc ngôn ngữ yêu cầu, code **vẫn thêm** ngôn ngữ đó vào `data["languages"]`, chỉ đánh cờ `language_verified_on_website=False` trong metadata.
- **Ảnh hưởng:** bộ lọc ngôn ngữ (`languages @> ['Vietnamese']`) là giá trị cốt lõi của sản phẩm; mọi clinic "Vietnamese dentist in Houston" do Google trả về đều xuất hiện là nói tiếng Việt dù chưa kiểm chứng. UI không đọc cờ này. → Bệnh nhân đến clinic không có ai nói tiếng mẹ đẻ.
- **Sửa:** lưu vào `languages_unverified`; chỉ thêm vào `languages` khi có bằng chứng (website, nhân viên, xác nhận của clinic); hiển thị huy hiệu "Đã xác minh" / "Chưa xác minh" trên UI.

#### D-03 — Dữ liệu giả hiển thị như thật 🔎
- **Vị trí:** `src/services/clinic-service.ts:128-…` (`SAMPLE_NEXT_HEALTH_CLINIC`) — hồ sơ hoàn chỉnh của "Next Health" với **bác sĩ tên cụ thể, NPI, review có tên tác giả, giá, địa chỉ**, `claimed_by: 'next-health-verified'`. Được trả về từ `getClinicBySlug('next-health')` **khi DB không có** hoặc lỗi (`:529, :544, :550`), và dùng ở `src/app/page.tsx:124-218` làm clinic nổi bật khi DB trống. Cùng file: 3 testimonial bịa (`page.tsx:103`: "Mai T.", "Joon K.", "Linh P.") và `FALLBACK_CLINICS` giả.
- **Rủi ro:** thông tin y tế/đánh giá giả về một doanh nghiệp có thật có thể bị coi là sai sự thật/phỉ báng; vi phạm quy định về testimonial; làm hỏng niềm tin.
- **Sửa:** xoá khỏi `services/`; chuyển sang `supabase/seed.sql` hoặc fixture chỉ bật khi `NODE_ENV !== 'production'`; trang chủ hiển thị trạng thái rỗng thay vì dữ liệu giả; testimonial chỉ dùng của người thật có đồng ý.

#### D-04 — Bài viết y khoa AI tự động xuất bản, gán tác giả "Medical Team" 🔎
- **Vị trí:** `openclaw/generate_insights.py:2084-2085` (`"status": "published"`, `"author": "Asian Health Hub Medical Team"`); cũng ở `generate_8_pulses.py:191`, `generate_june_pulse.py:150`.
- **Rủi ro:** nội dung YMYL xuất bản không người duyệt, gán cho "đội ngũ y khoa" có thể không tồn tại → vấn đề E-E-A-T với Google, trách nhiệm pháp lý, thông tin sai gây hại.
- **Sửa:** mặc định `status='draft'`; thêm `reviewed_by`, `reviewed_at`; hiển thị "Soạn thảo với AI, đã được [tên người] rà soát"; bắt buộc ≥ N nguồn trong `article_facts`.

#### D-05 — Google Places: lưu ảnh/review lâu dài và khớp clinic chỉ bằng top-1 🔎⚠️
- **Vị trí:** `openclaw/google_places.py` `text_search_place` (`maxResultCount: 1`, không kiểm tra tên/địa chỉ có khớp), `upload_place_photos` (tải ảnh Google về Storage của mình), `normalize_reviews` (lưu nguyên văn review).
- **Rủi ro:** (1) gắn nhầm ảnh/review/giờ mở cửa của clinic khác; (2) điều khoản Google Places hạn chế cache/lưu trữ nội dung (ảnh, review) — cần đối chiếu điều khoản hiện hành trước khi tiếp tục.
- **Sửa:** tính điểm tương đồng tên + địa chỉ + SĐT, chỉ chấp nhận khi vượt ngưỡng; lưu `place_id` và gọi lại API khi hiển thị theo đúng điều khoản; gắn attribution.

#### D-06 — `getSafeClinicImageSrc` loại bỏ mọi ảnh scrape từ website clinic 🔎
- **Vị trí:** `src/lib/clinic-image.ts:25-47` — chỉ cho Supabase, Google, Wix và **`anchordentalga.com`** (hard-code một clinic cụ thể); mọi domain khác trả `null`. `next.config.ts` cũng chỉ liệt kê 5 host này.
- **Ảnh hưởng:** ảnh "thật từ website clinic" mà scraper thu thập (và `agent_prompt.py` nói là ưu tiên) **không bao giờ hiển thị**; clinic rơi về ảnh AI sinh ra hoặc icon rỗng.
- **Sửa:** pipeline tải ảnh về Supabase Storage (đã có `storage.py`) rồi lưu URL Storage; bỏ allowlist theo từng clinic.

---

## 4. 🟡 Medium

### Pipeline / Python

| ID | Vấn đề | Vị trí | Hướng sửa |
|---|---|---|---|
| P-01 🔎 | `sys.exit(1)` trong `_check_env()` / `_load_targets()` chạy trong thread của bot. `SystemExit` không bị `except Exception` bắt → thread chết im lặng, người dùng không nhận phản hồi | `run_batch.py:46, 53, 70`; `jobs.py` `_run_with_captured_output` chỉ bắt `Exception` | Raise `RuntimeError`; bắt `BaseException` tại ranh giới job |
| P-02 🔎 | `redirect_stdout/stderr` là **global** của process → nhiều job chạy song song lẫn log của nhau; `running_jobs` chỉ chặn trùng *tên* | `jobs.py:58-77`, `telegram_bot.py:278-315` | Dùng `logging` có `job_id`, hàng đợi job (1 worker cho job nặng) |
| P-03 🔎 | Job lỗi vẫn báo "Finished". `_run_with_captured_output` nuốt exception (chỉ in traceback); `create_article_from_prompt` có `except Exception: print` | `jobs.py:65-76`, `generate_insights.py:2095` | Trả `JobResult(ok, error, stats)`; bot hiển thị ❌ |
| P-04 🔎 | Slug dựa trên tên → hai chi nhánh cùng tên ghi đè nhau; `scout` dedupe theo website/place_id nhưng `insert_clinic` dedupe theo slug | `db.py:114,148`; `run_scout.py` | Khoá dedupe chính: `google_place_id` / `npi` / (tên+địa chỉ chuẩn hoá); slug = tên + thành phố |
| P-05 🔎 | `_merge_lists` fallback dùng `repr(item)` để khử trùng, merge `{**existing, **incoming}` cho metadata: dữ liệu mới ghi đè dữ liệu cũ (cả khi cũ tốt hơn) | `db.py` | Merge theo trường với `confidence`/`extracted_at` |
| P-06 🔎 | Playwright luôn chạy dù Jina đã có nội dung; scrape tuần tự, `networkidle` dễ chờ tối đa timeout | `scraper.py` `scrape_content_from_url`; `run_scout.py` | Fetch tĩnh trước; chỉ dùng Playwright khi cần JS; xử lý song song có giới hạn |
| P-07 🔎 | `run_batch.main()` gọi lại `_clinic_already_exists` (truy vấn DB) sau mỗi lần thất bại để phân loại "skipped" → đếm sai và tốn truy vấn | `run_batch.py:197-203` | Trả enum kết quả từ `_process_target` |
| P-08 🔎 | `check_analytics` chỉ lấy 1000 sự kiện, `get_analytics_summary` 3000 → số liệu 30 ngày bị cắt âm thầm; `datetime.utcnow()` deprecated | `admin_actions.py:451, 543` | Đếm bằng SQL (`count`, `group by`) / RPC |
| P-09 🔎 | `find_one_by_identifier` nuốt exception của cột không phải `id`; fallback `ilike '%input%'` — người dùng nhập `%` khớp mọi thứ | `admin_actions.py` | Parse kiểu identifier rõ ràng (UUID / slug); escape wildcard |
| P-10 🔎 | `delete_clinic` xoá thẳng, không kiểm tra `claim_requests`/`claimed_by`; `delete_article` nuốt lỗi xoá `article_facts` | `admin_actions.py` | Soft-delete (`deleted_at`), kiểm tra ràng buộc, ghi audit log |
| P-11 🔎 | Pending action của bot không có TTL/ID: "approve" vài giờ sau vẫn chạy hành động cũ; `offset` cập nhật trước khi xử lý (mất tin khi crash); xử lý đồng bộ trong vòng polling (LLM chặn việc nhận tin) | `telegram_bot.py:2088-2120` | TTL 10 phút, nút inline `approve:<id>`, worker thread |
| P-12 🔎 | `fetch_reference_text_fast` / `scrape_*` fetch URL do người dùng đưa, không chặn IP nội bộ/metadata (SSRF); không giới hạn kích thước response | `generate_insights.py:2286`, `research_agents.py` `fetch_html`, `scraper.py` | Resolve DNS, chặn private/loopback/link-local, giới hạn byte |

### Web

| ID | Vấn đề | Vị trí | Hướng sửa |
|---|---|---|---|
| B-01 ✅ | `next build` thất bại khi thiếu env vì `throw` ở cấp module trong client Supabase; ảnh hưởng CI/Docker nếu quên build-arg | `src/services/supabase-client.ts`, `src/lib/supabase/client.ts:10` | Khởi tạo lazy; hoặc fail rõ ràng ở bước CI |
| B-02 🔎 | `sitemap.ts` lấy host từ header `Host`/`X-Forwarded-Host` (có thể bị giả → sitemap/cache poisoning), `force-dynamic` truy vấn toàn bộ mỗi lần; một file tới 50.000 URL (giới hạn của chuẩn sitemap) | `src/app/sitemap.ts:22-24` | Dùng `NEXT_PUBLIC_SITE_URL`; chia sitemap (`generateSitemaps`); `lastmod` = `updated_at` thay vì `created_at` |
| B-03 🔎 | `getTopCityCombos`/`getTopSpecialtyCombos` `limit(5000)` rồi đếm ở client → đếm sai khi > 5000 clinic (mục tiêu 10.000+); `getAvailableLanguages` kéo toàn bảng chỉ để lấy danh sách ngôn ngữ | `clinic-service.ts:642, 692`, `getAvailableLanguages` | Dùng view/RPC `GROUP BY`, cache |
| B-04 🔎 | Sắp xếp theo `metadata->rating` (JSONB, không index) → quét toàn bảng khi lọc rộng; clinic thiếu rating đứng sau cùng dù mới & đầy đủ | `clinic-service.ts:73-77` | Cột `rating`, `rating_count` riêng + index; công thức xếp hạng có độ tin cậy (Bayesian) |
| B-05 🔎 | `PATCH /api/admin/clinics/[id]` coi thiếu trường = `null` (`address ?? null`) → cập nhật từng phần sẽ **xoá** dữ liệu; `PATCH /api/dashboard/clinic` đặt `languages: []` nếu thiếu | 2 route trên | Chỉ cập nhật trường có trong body; validate bằng Zod |
| B-06 ⚠️ | Token Supabase lưu trong cookie JS-đọc-được (`document.cookie`) `Max-Age=604800`, nhưng access token Supabase hết hạn sớm (mặc định 1 giờ) và không có refresh → admin/dashboard "mất phiên" sau ~1 giờ; dễ bị đánh cắp qua XSS | `src/lib/auth/session-cookie.ts` | Dùng `@supabase/ssr` (cookie httpOnly + refresh trong middleware/proxy) |
| B-07 🔎 | `proxy.ts` chỉ kiểm cookie có tồn tại, không xác thực → chuyển hướng sai/đúng chỉ mang tính giao diện (API vẫn tự kiểm) | `src/proxy.ts` | Xác thực token/role ở server layout hoặc proxy |
| B-08 🔎 | `/api/analytics` ghi bằng service-role, không rate limit, `metadata` không giới hạn kích thước → có thể bơm đầy bảng | `src/app/api/analytics/route.ts` | Giới hạn kích thước, rate limit, sampling |
| B-09 ✅ | 56 lỗi ESLint (chủ yếu `any`), build chưa được kiểm trong CI | xem mục 0 | Thêm CI chạy `tsc`, `lint`, `build`; sửa dần theo file |
| B-10 🔎 | Phần lớn tài liệu (`ARCHITECTURE.md`, `implementation_plan.md`) mô tả FastAPI trên Fly.io và các route `/api/clinics`; thực tế bot chạy polling, không có server FastAPI nên `/api/admin/pipeline` (gọi `OPENCLAW_API_URL`) luôn ở chế độ dry-run | `ARCHITECTURE.md`, `src/app/api/admin/pipeline/route.ts` | Cập nhật tài liệu; hoặc xây API thật cho pipeline |

---

## 5. 🟢 Low / Hardening

| ID | Vấn đề | Vị trí |
|---|---|---|
| L-01 | `JsonLd` dùng `JSON.stringify` trong `dangerouslySetInnerHTML` không escape `<` (hiện chỉ nhận dữ liệu thành phố/site, nhưng sẽ nguy hiểm nếu dùng cho dữ liệu clinic) | `src/lib/json-ld.tsx` |
| L-02 | `getSafeClinicImageSrc` chấp nhận `//host/x.png` (protocol-relative) và `data:image/` lớn | `src/lib/clinic-image.ts:27-33` |
| L-03 | Log và file nội bộ bị commit dù `.gitignore` đã liệt kê: `next_dev.log` (chứa đường dẫn máy cá nhân), `openclaw/scrape_190.log`, `.antigravitycli/` | gốc repo |
| L-04 | Hàng trăm ảnh sinh ra nằm trong `public/generated-insights/` (tên tiếng Việt dài) được commit → repo phình, deploy chậm; `save_generated_image` ghi vào `../public` khi upload cloud thất bại (không bền trên Docker/Vercel) | `public/`, `generate_insights.py:484-509`, `image_generator.py:46-65` |
| L-05 | Nhiều bản `generate_slug`/`safe_storage_name` khác nhau (`db.py`, `admin_actions.py`, `storage.py`, `generate_insights.py`, `image_generator.slugify`) → slug không nhất quán | `openclaw/` |
| L-06 | Script rời rạc ở gốc repo và `openclaw/` (`check_*.py`, `migrate_slugs.py`, `scrape_80/190_clinics.py`…) không có tài liệu/test | gốc, `openclaw/` |
| L-07 | `openclaw/requirements.txt` không ghim phiên bản; có `fastapi`/`uvicorn` nhưng tôi không thấy server FastAPI nào trong repo; `docker-compose` mount source vào container bot | `openclaw/requirements.txt`, `docker-compose.yml` |
| L-08 | `telegram_memory.json` lưu output job (có thể chứa email/dữ liệu nội bộ) dạng plaintext | `telegram_bot.py:16-95` |
| L-09 | `get_photo_uri` đặt API key trong query string (xuất hiện trong log proxy) | `google_places.py` |
| L-10 | Model LLM hardcode rải rác (`deepseek-v4-flash`, `minimax-m3`, `gemini-3.1-flash-image-preview`, `deepseek-chat`…), không có cấu hình tập trung, không theo dõi chi phí | `extractor.py:370-371`, `generate_insights.py:25,39`, `image_generator.py:9`… |

---

## 6. Điểm tốt cần giữ

- Ranh giới **fallback hai lớp** (Jina → Playwright, DeepSeek → MiniMax) và schema trích xuất Pydantic rõ ràng.
- Bước **xác nhận (approve)** cho thao tác phá huỷ trong bot; tách `jobs.py` khỏi `telegram_bot.py`.
- `generate_insights.py` có: nguồn đáng tin (CDC/NIH…), thu thập bằng chứng, `enforce_verified_references`, kiểm tra độ tương đồng khi rewrite, lưu phiên bản bài (`seo_meta.versions`), `legacy_slugs`.
- Ảnh được chuyển WebP, `cache-control` dài, upload Storage (`storage.py`).
- Schema có RLS bật mọi bảng, hàm `is_admin` `SECURITY DEFINER`, trigger tạo `user_roles` và slug.
- TypeScript sạch ở chế độ strict (`tsc` 0 lỗi).

---

## 7. Kế hoạch sửa đề xuất (PR nhỏ, độc lập)

| PR | Nội dung | Lỗi đóng |
|---|---|---|
| 1 | Auth: bỏ role từ metadata, test | S-01 |
| 2 | Bot: mặc định deny, TTL approve, escape Telegram HTML | S-02, S-08, P-11 |
| 3 | RLS + migration `supabase/migrations/…` | S-04, S-03 (phần RLS) |
| 4 | Claim flow: state machine, RPC nguyên tử, captcha, rate limit | S-05, S-06, S-07 |
| 5 | Dashboard/Admin PATCH: allowlist + Zod | S-03, B-05 |
| 6 | `insert_clinic`: không ghi đè None, union languages, dedupe theo place_id | D-01, P-04, P-05 |
| 7 | Languages: `languages_unverified` + huy hiệu xác minh | D-02 |
| 8 | Xoá dữ liệu mẫu khỏi production | D-03 |
| 9 | Articles mặc định draft + duyệt | D-04 |
| 10 | Ảnh: re-host về Storage, bỏ allowlist theo clinic | D-06, L-04 |
| 11 | Job runner (`JobResult`, logging có `job_id`, không `sys.exit`) | P-01, P-02, P-03 |
| 12 | Tìm kiếm: escape/RPC, cột rating, index | S-09, B-03, B-04 |
| 13 | CI: `tsc`, `lint`, `build`, `compileall`, pytest | B-01, B-09 |
| 14 | Dọn repo: log, ảnh sinh ra, script rời | L-03…L-06 |

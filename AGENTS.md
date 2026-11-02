<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Asian Health Hub (AHH) — Agent Rules

> Quy tắc bắt buộc cho mọi AI agent (Claude Code, Cursor, Codex, Antigravity…) làm việc trong repo này.
> Đọc file này trước, sau đó đọc guide chuyên đề trong `docs/agent-guides/` khi đụng tới khu vực tương ứng.

## 1. Bối cảnh sản phẩm (đọc trước khi code)

AHH là thư mục phòng khám cho người Mỹ gốc Á, tìm theo **ngôn ngữ + chuyên khoa + thành phố**. Đây là **sản phẩm y tế (YMYL)**:

- Dữ liệu sai (ngôn ngữ, bảo hiểm, giờ mở cửa) làm bệnh nhân mất thời gian và mất tin tưởng. **Chính xác quan trọng hơn đầy đủ.**
- **Không bao giờ bịa dữ liệu** (review, bác sĩ, NPI, testimonial, số liệu) và hiển thị như thật. Dữ liệu mẫu phải được gắn nhãn rõ và không xuất hiện ở production.
- Nội dung do AI tạo ra phải có nguồn, có trạng thái duyệt, và không giả danh người thật/đội ngũ y khoa.

Ba phần của hệ thống:

| Phần | Thư mục | Ghi chú |
|---|---|---|
| Web (Next.js 16, React 19, Tailwind 4) | `src/` | Server Components mặc định |
| Database (Supabase: Postgres, Auth, RLS, Storage, pgvector) | `supabase/schema.sql` | Nguồn sự thật cho schema |
| OpenClaw (Python: scraper, extractor, content gen, Telegram bot) | `openclaw/` | Dùng service-role key, chạy ngoài Vercel |

Tài liệu nền: `README.md`, `ARCHITECTURE.md`, `PIPELINE.md`, `docs/REPO_OVERVIEW.md`. Lỗi đã biết: `docs/ISSUES_AUDIT.md` — **đọc trước khi sửa auth, RLS, claim, hoặc pipeline**.

## 2. Quy trình làm việc

1. **Đọc trước, sửa sau.** Đọc file liên quan và `docs/ISSUES_AUDIT.md`. Không đoán API của Next.js 16 / Supabase — đọc docs trong `node_modules/next/dist/docs/`.
2. **Thay đổi nhỏ, một mục đích.** Không gộp refactor với sửa lỗi. Không đổi format cả file khi chỉ sửa vài dòng.
3. **Không tự tạo file/tài liệu mới** nếu chưa được yêu cầu (trừ test cho code mới).
4. **Kiểm chứng trước khi báo xong** (xem mục 7). Nói rõ phần nào đã chạy, phần nào chưa.
5. **Hỏi trước khi làm việc không đảo ngược được:** xoá dữ liệu, đổi schema/RLS trên DB thật, chạy scraper/LLM hàng loạt tốn tiền, gửi tin nhắn Telegram/email, push/force-push.
6. Branch: `feat/…`, `fix/…`, `chore/…`. Commit message theo `type(scope): mô tả`. Xem `GIT_WORKFLOW.md`.

## 3. Quy tắc bảo mật (không thương lượng)

- **Không đọc quyền (role) từ `user_metadata`.** Người dùng tự sửa được trường này. Chỉ tin bảng `user_roles` (hoặc `app_metadata`/JWT claim do server ký). Mọi check admin phải gọi DB, không short-circuit bằng dữ liệu từ token do client kiểm soát.
- **Service-role key chỉ ở server.** Không import `createServerSupabaseClient` vào Client Component. Không bao giờ prefix `NEXT_PUBLIC_` cho secret. Không log key, token, email người dùng.
- **Mọi API route mutating phải:** (a) xác thực, (b) kiểm quyền, (c) validate input (Zod hoặc kiểm tra thủ công kiểu dữ liệu + độ dài), (d) dùng allowlist trường được ghi — **không spread `body` hay `body.metadata` thẳng vào DB.**
- **Không nội suy input người dùng vào filter của PostgREST** (`.or("name.ilike.%${q}%")`). Escape `%`, `_`, `,`, `(`, `)` hoặc dùng RPC/`textSearch`.
- **Endpoint public ghi dữ liệu** (analytics, claim, newsletter) cần giới hạn kích thước, rate limit, và chống spam.
- **Telegram `parse_mode: HTML`:** escape toàn bộ input người dùng bằng `escapeHtml()` trước khi gửi.
- **Bot Telegram:** mặc định **từ chối** nếu `TELEGRAM_ALLOWED_USER_IDS` rỗng. Thao tác phá huỷ phải qua bước xác nhận có hạn dùng (TTL) và gắn với ID hành động.
- **Redirect:** `next` param phải bắt đầu bằng `/` và **không** bắt đầu bằng `//` hoặc `/\`.
- **RLS:** policy mới không được dùng `WITH CHECK (true)` cho role `authenticated` trên bảng dữ liệu công khai. Mặc định deny, mở từng quyền tối thiểu.
- **Dữ liệu từ scraper/LLM là không đáng tin.** Escape khi render, không chèn vào `dangerouslySetInnerHTML` (JSON-LD phải thay `<` bằng `<`), không dùng làm đường dẫn file hoặc URL fetch mà không kiểm tra (chặn IP nội bộ/SSRF).

## 4. Quy tắc code — Web (TypeScript / Next.js)

- Mặc định **Server Component**. Chỉ thêm `'use client'` khi cần state, effect, event handler.
- Luồng dữ liệu: `components/` → `services/` → `lib/supabase/`. Component không gọi Supabase trực tiếp (trừ auth client-side).
- TypeScript strict: **không dùng `any`** (hiện có 48 lỗi `no-explicit-any` — không thêm mới, sửa dần khi đụng tới file). Dùng `unknown` + type guard hoặc Zod.
- Mọi service function: `try/catch`, trả giá trị fallback an toàn, log có tiền tố `[service-name]`.
- **Không `throw` ở cấp module** vì thiếu env (làm `next build` thất bại khi thiếu biến). Kiểm tra lazy trong hàm.
- **Không hardcode dữ liệu mẫu/giả vào `services/`** hay page production. Seed mẫu để trong `supabase/seed.sql` hoặc `fixtures/`.
- Ảnh: dùng `next/image`; host ngoài phải nằm trong `next.config.ts` `remotePatterns`. Ảnh scrape phải được **re-host lên Supabase Storage** trước khi lưu vào DB.
- SEO: trang động cần `generateMetadata`, canonical, và schema.org phù hợp. URL tuyệt đối lấy từ `NEXT_PUBLIC_SITE_URL`, **không** từ header `Host`.
- Đặt tên: component `kebab-case.tsx`, service `kebab-case.ts`, type trong `src/types/`.
- Chạy `npm run lint` và `npx tsc --noEmit` trước khi báo xong. Không thêm `eslint-disable` để lách lỗi.

## 5. Quy tắc code — Python (`openclaw/`)

- Python 3.11+. Type hints cho hàm public. Không dùng `print` làm cơ chế báo kết quả cho job mới — dùng `logging` và **trả về/raise** kết quả có cấu trúc.
- **Job phải báo lỗi thật.** Không `except Exception: print(...)` rồi coi như thành công. Raise hoặc trả `{"ok": False, "error": ...}`.
- **Không `sys.exit()` trong code chạy trong thread** (bot thread sẽ chết im lặng vì `SystemExit` không bị `except Exception` bắt). Raise `RuntimeError`.
- Một hàm `slugify` duy nhất trong module chung. Hiện có 3–4 bản sao khác nhau — không tạo thêm.
- **Upsert phải không ghi đè bằng `None`.** Chỉ đưa vào payload các trường có giá trị; merge metadata theo từng trường, và không ghi đè trường đã được chủ phòng khám chỉnh sửa (`claimed_by IS NOT NULL`).
- Mọi lời gọi mạng/LLM: timeout, retry có backoff, và giới hạn chi phí (số token, số URL).
- Mọi dữ liệu trích xuất phải kèm **nguồn và thời điểm** (`source_url`, `extracted_at`). Không suy luận ngôn ngữ/bảo hiểm khi trang web không nói rõ.
- **Không gán ngôn ngữ chưa xác minh vào `languages[]`** (bộ lọc chính của sản phẩm). Lưu vào trường riêng (`languages_unverified`) hoặc để `[]`.
- Scraper: tôn trọng robots.txt/ToS của nguồn, rate-limit, User-Agent trung thực. Với Google Places: chỉ lưu `place_id` lâu dài; ảnh/review phải tuân thủ điều khoản hiển thị của Google.

## 6. Nội dung & ảnh do AI tạo

- Bài viết AI **mặc định `status = 'draft'`**; chỉ publish sau khi người duyệt. Không ghi `author` là "Medical Team" nếu không có người thật duyệt.
- Mỗi tuyên bố y khoa cần nguồn trong `article_facts` (CDC, NIH, CMS, …). Không có nguồn thì không viết.
- Ảnh AI phải gắn nhãn "AI-generated". **Không dùng ảnh AI làm ảnh đại diện của một phòng khám thật** như thể là ảnh thật của họ.
- Model/prompt đặt trong config/env, không hardcode rải rác.

## 7. Định nghĩa "xong" (Definition of Done)

- [ ] `npx tsc --noEmit` sạch
- [ ] `npm run lint` không thêm lỗi mới (so với baseline trong `docs/ISSUES_AUDIT.md`)
- [ ] `npm run build` qua (có đủ env mẫu)
- [ ] Python: `python -m compileall openclaw` + `pytest` cho phần đã sửa
- [ ] Đã thử luồng chính bằng tay hoặc bằng test; ghi rõ trong mô tả PR những gì **chưa** kiểm chứng
- [ ] Không có secret, log, file `.env`, ảnh sinh ra, `*.log` trong diff
- [ ] Cập nhật `docs/ISSUES_AUDIT.md` nếu đóng/mở một lỗi đã liệt kê
- [ ] Migration SQL mới đặt trong `supabase/migrations/` (idempotent), không sửa trực tiếp `schema.sql` mà không kèm migration

## 8. Những thứ không được commit

`.env*` (trừ `*.example`), `*.log`, `telegram_memory.json`, `public/generated-*/` (ảnh sinh ra → lưu ở Supabase Storage), `.next/`, `node_modules/`, thư mục công cụ cá nhân (`.antigravitycli/`).

## 9. Guide chuyên đề

| Khi làm việc với | Đọc |
|---|---|
| Next.js, Supabase, API route, auth, RLS | `docs/agent-guides/web-nextjs-supabase.md` |
| Scraper, extractor, Telegram bot, job | `docs/agent-guides/openclaw-python.md` |
| Bài viết/ảnh AI, dữ liệu clinic, nội dung y tế | `docs/agent-guides/content-and-data-quality.md` |
| Review bảo mật / trước khi merge | `docs/agent-guides/security-checklist.md` |

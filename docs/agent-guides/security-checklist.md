# Guide: Security checklist (review / trước khi merge)

> Dùng khi review PR hoặc tự rà sau khi code. Tick từng mục áp dụng. Lỗi đã biết: `docs/ISSUES_AUDIT.md`.

## A. Xác thực & phân quyền
- [ ] Quyền lấy từ **DB (`user_roles`)**, không từ `user_metadata` / body / query / header do client kiểm soát
- [ ] Mọi route ghi dữ liệu có xác thực + kiểm quyền (không dựa vào `proxy.ts`)
- [ ] Kiểm quyền **sở hữu** (IDOR): người dùng chỉ sửa tài nguyên của mình (`claimed_by`, `user_id`)
- [ ] Hành động quản trị ghi `audit_log` (ai, làm gì, khi nào)
- [ ] Redirect `next` không chấp nhận `//` hoặc `/\` hoặc URL tuyệt đối

## B. Input & truy vấn
- [ ] Validate bằng schema (Zod/Pydantic): kiểu, độ dài, enum
- [ ] **Allowlist** trường được ghi; không spread `body`/`metadata`
- [ ] Không nội suy input vào `.or()`/`.filter()` của PostgREST; escape `% _ , ( )`
- [ ] Giới hạn `limit`, độ dài `query`, kích thước JSON (ví dụ ≤ 16 KB)
- [ ] Upload: kiểm MIME thực + kích thước tối đa + tên file an toàn; không SVG nếu không sanitize

## C. Dữ liệu & RLS
- [ ] Bảng mới bật RLS; policy mặc định deny
- [ ] Không `WITH CHECK (true)` cho `authenticated` trên dữ liệu công khai
- [ ] Cột hệ thống (role, rating, claimed_by, verified) không UPDATE được bởi người dùng thường
- [ ] Hàm `SECURITY DEFINER` đặt `search_path` và không nhận input để ghép SQL
- [ ] Migration idempotent, có rollback ghi chú

## D. Bí mật & cấu hình
- [ ] Không secret trong code, log, commit, `NEXT_PUBLIC_*`
- [ ] Service-role chỉ ở server/Python; không import vào Client Component
- [ ] `.env*`, `*.log`, `telegram_memory.json`, ảnh sinh ra không nằm trong diff
- [ ] Log không chứa token, email, SĐT, nội dung form

## E. Đầu ra & tiêm nhiễm
- [ ] Dữ liệu từ scraper/LLM/người dùng được escape khi render
- [ ] `dangerouslySetInnerHTML` chỉ cho nội dung đã sanitize; JSON-LD thay `<` → `<`
- [ ] Markdown bài viết render qua `react-markdown` (không bật `rehype-raw` trừ khi sanitize)
- [ ] Telegram `parse_mode=HTML`: `escapeHtml` mọi giá trị chèn vào
- [ ] Prompt LLM: nội dung bên ngoài nằm trong khối dữ liệu có delimiter; LLM không có quyền gọi hành động phá huỷ

## F. Mạng ra ngoài (SSRF / chi phí)
- [ ] URL do người dùng/LLM cung cấp: chỉ http/https, chặn IP nội bộ & metadata, giới hạn redirect/kích thước/timeout
- [ ] Endpoint công khai tốn tài nguyên (search, analytics, claim, newsletter): rate limit + CAPTCHA khi cần
- [ ] Job tốn tiền có `--limit`, ngân sách, `--dry-run`

## G. Bot Telegram
- [ ] Deny-by-default theo `TELEGRAM_ALLOWED_USER_IDS`; chỉ chat riêng
- [ ] Hành động phá huỷ: xác nhận có ID + TTL
- [ ] Không in secret ở `/prompt`, `/tail`, `/status`

## H. Quyền riêng tư & tuân thủ
- [ ] Không thu thập thông tin sức khoẻ cá nhân khi chưa có chính sách/pháp lý rõ
- [ ] Email/SĐT người dùng chỉ dùng đúng mục đích; có cách huỷ đăng ký newsletter
- [ ] Dữ liệu bên thứ ba (Google, Zocdoc, Healthgrades…) dùng đúng điều khoản
- [ ] Nội dung AI có nhãn; nội dung y tế có cảnh báo

## Lệnh tự kiểm tra nhanh

```bash
git diff --stat
git diff | grep -nE "(sk-or-|service_role|SUPABASE_SECRET|eyJ[A-Za-z0-9_-]{20,}|BEGIN (RSA|PRIVATE))" || echo "no obvious secrets"
grep -rnE "user_metadata|WITH CHECK \(true\)|dangerouslySetInnerHTML|\.or\(`|sys\.exit" src openclaw supabase | head -50
npx tsc --noEmit && npm run lint
python -m compileall openclaw
```

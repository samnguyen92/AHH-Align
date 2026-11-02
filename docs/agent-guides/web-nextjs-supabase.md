# Guide: Web (Next.js 16 + Supabase)

> Bổ sung cho `AGENTS.md`. Đọc khi sửa `src/`, `supabase/`.
> **Next.js 16 khác bản bạn biết**: đọc `node_modules/next/dist/docs/` (chạy `npm ci` trước). Ví dụ: `src/proxy.ts` thay cho `middleware.ts`; `params`/`searchParams`/`cookies()`/`headers()` là **async**.

## 1. Cấu trúc & luồng

```
app/ (page, route)  →  services/  →  lib/supabase/  →  Supabase
components/ (UI)    ┘
```
- Page/Server Component gọi `services/*`. Client Component gọi `/api/*` hoặc Supabase client **chỉ cho auth**.
- Client anon: `createServerAnonClient()` (tôn trọng RLS). Service-role: `createServerSupabaseClient()` — **chỉ trong route handler/server action sau khi đã xác thực và kiểm quyền**.

## 2. Mẫu API route mutating (bắt buộc)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod'; // thêm dependency nếu chưa có
import { requireAdminFromRequest } from '@/services/auth-service';
import { createServerSupabaseClient } from '@/services/supabase-server';

export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  languages: z.array(z.string().trim().max(40)).max(20).optional(),
  // KHÔNG có `metadata: z.record(...)` tự do — liệt kê từng khoá được phép
}).strict();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminFromRequest(req);          // 1. xác thực + quyền (tra DB)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null)); // 2. validate
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { id } = await params;
  const patch = Object.fromEntries(                          // 3. chỉ cập nhật trường có mặt
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  );
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from('clinics').update(patch).eq('id', id).select('id,slug').single();
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 }); // không lộ error.message
  return NextResponse.json({ clinic: data });
}
```
Checklist: xác thực → quyền (DB) → validate → allowlist → update từng phần → không lộ lỗi nội bộ → `revalidatePath` đúng chỗ.

## 3. Auth & vai trò

- **Chỉ tin `user_roles`** (qua `getUserRole`). `user_metadata` là dữ liệu người dùng tự ghi — không dùng cho quyền. (Xem S-01 trong `docs/ISSUES_AUDIT.md`.)
- Kiểm quyền ở **mỗi route**, không chỉ ở `proxy.ts` (chỉ chuyển hướng UI).
- Dự kiến chuyển sang `@supabase/ssr` (cookie httpOnly + refresh). Khi làm: bỏ `document.cookie` trong `session-cookie.ts`.
- `next` redirect: chấp nhận khi `/^\/(?!\/|\\)/.test(next)`.

## 4. Supabase & RLS

- Schema thay đổi → thêm file `supabase/migrations/YYYYMMDDHHMM_ten.sql` idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`), **cập nhật `schema.sql` cho khớp**.
- Policy mới: mặc định deny. Không dùng `WITH CHECK (true)` cho `authenticated`. Ghi dữ liệu công khai (analytics, newsletter) đi qua API có rate limit, không mở RLS.
- Cột do hệ thống sở hữu (rating, reviews, verified, claimed_by, role) → bảo vệ bằng trigger hoặc tách bảng; người dùng không UPDATE được.
- Tìm kiếm: không nội suy chuỗi người dùng vào `.or()`. Escape hoặc dùng RPC:
```ts
const esc = (s: string) => s.replace(/[\\%_,()]/g, (m) => `\\${m}`);
```
- Đếm/nhóm (thành phố, ngôn ngữ, chuyên khoa) → view/RPC `GROUP BY`, **không** `select('*').limit(5000)` rồi đếm ở JS.
- Truy vấn danh sách: chọn cột cần (`select('id,name,slug,…')`), tránh `select('*')` kèm `metadata` lớn.

## 5. Component & UI

- Server Component mặc định; `'use client'` ở lá cây nhỏ nhất có thể.
- Không `setState` đồng bộ trong `useEffect` (lint `react-hooks/set-state-in-effect`): đồng bộ từ `searchParams` bằng key (`<Form key={searchParams.toString()}>`) hoặc dẫn xuất trong render.
- Không `any`. Kiểu của `metadata` đặt ở `src/types/database.ts` (`ClinicMetadata`) và dùng type guard khi đọc.
- Văn bản có dấu nháy trong JSX: `&apos;`/`&quot;` hoặc `{"…"}`.
- Ảnh: `next/image` + host trong `remotePatterns`. Ảnh clinic lấy từ Supabase Storage; không thêm domain của từng clinic vào allowlist.
- Hệ thiết kế: dùng `components/ui/*` (shadcn) và token trong `globals.css`; đừng thêm CSS global mới cho một component.
- Truy cập: `alt` có nghĩa, nhãn form, tương phản, hoạt động ở 360px; ngôn ngữ: dùng `lang` đúng cho nội dung tiếng Việt/Hàn/Hoa.

## 6. SEO

- `generateMetadata` có `title`, `description`, `alternates.canonical`, `openGraph`.
- URL tuyệt đối từ `NEXT_PUBLIC_SITE_URL` (`lib/site.ts`), **không** từ header `Host`.
- JSON-LD: `JSON.stringify(data).replace(/</g, '\\u003c')`. Dùng `MedicalClinic`/`Physician` chỉ với dữ liệu đã xác minh.
- Sitemap > 50.000 URL → `generateSitemaps()`; `lastmod` = `updated_at`.
- Trang landing `thành phố × chuyên khoa` phải có nội dung riêng (không chỉ danh sách) và `noindex` nếu < 3 clinic.

## 7. Env & build

- `NEXT_PUBLIC_*` là công khai. Secret không bao giờ có tiền tố này.
- Không `throw` ở cấp module khi thiếu env; kiểm tra trong hàm (lỗi hiện tại: B-01 làm `next build` fail).
- Cập nhật `.env.local.example` khi thêm biến.

## 8. Lệnh

```bash
npm ci
npx tsc --noEmit
npm run lint
NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x npm run build
```
Baseline lint hiện tại: 56 lỗi (xem `ISSUES_AUDIT.md` §0) — không làm tăng.

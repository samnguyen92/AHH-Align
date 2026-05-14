# Asian Health Hub (AHH)

> AI-powered Healthcare Directory for Asian Americans — Tìm bác sĩ nói tiếng mẹ đẻ của bạn.

## Mục tiêu

Giúp bệnh nhân người Mỹ gốc Á (Việt Nam, Hàn Quốc, Trung Quốc...) dễ dàng tìm kiếm **phòng khám có bác sĩ nói tiếng mẹ đẻ** và am hiểu văn hóa của họ. Thông tin này hiện nằm rải rác, truyền miệng, không có trên các nền tảng lớn như Zocdoc.

## 3 Trụ cột Sản phẩm

| # | Tính năng | Mô tả |
|---|-----------|-------|
| 1 | **Smart Directory** | Tìm kiếm phòng khám theo **Chuyên khoa + Thành phố + Ngôn ngữ**. Hiển thị reviews, bản đồ, giờ mở cửa, liên hệ. |
| 2 | **Insights & Guides** | Bài viết y tế AI-generated (VD: "Hướng dẫn khám I-693 cho thẻ xanh"). Mục đích: kéo SEO traffic từ Google. |
| 3 | **Claim Profile** | Chủ phòng khám tự xác thực (verify) hồ sơ, cập nhật thông tin, tiếp cận bệnh nhân. |

## Tech Stack

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND                              │
│  Next.js 16 (App Router) + React 19 + TypeScript        │
│  Tailwind CSS v4 + ShadcnUI/Base UI primitives          │
│  Static Generation cho SEO tối ưu                       │
├─────────────────────────────────────────────────────────┤
│                  BACKEND (Next.js API)                    │
│  Route Handlers (app/api/*)                              │
│  Server Actions + Server Components                      │
│  Supabase JS Client                                      │
├─────────────────────────────────────────────────────────┤
│              AI DATA ENGINE (OpenClaw)                    │
│  Python scripts + Playwright stealth scraping             │
│  BeautifulSoup + OpenRouter/DeepSeek extraction           │
├─────────────────────────────────────────────────────────┤
│                    DATABASE                               │
│  PostgreSQL (Supabase) + pgvector                        │
│  RLS enabled — public SELECT, authenticated INSERT/UPDATE │
└─────────────────────────────────────────────────────────┘
```

## Cấu trúc Thư mục

```
asian-health-hub/
├── src/
│   ├── app/                    # Next.js App Router (pages, layouts, API routes)
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Landing page
│   │   ├── globals.css         # Tailwind + ShadcnUI base styles
│   │   └── api/                # Route Handlers (REST API)
│   ├── components/
│   │   ├── ui/                 # ShadcnUI primitives (button, input, card...)
│   │   └── [feature]/          # Feature components (search-bar, clinic-card...)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts       # Browser Supabase client (anon key, cho Client Components)
│   │   │   └── server.ts       # Server Supabase client (service role key + anon variant)
│   │   └── utils.ts            # cn() helper từ ShadcnUI
│   ├── services/
│   │   └── clinic-service.ts   # Data access layer: searchClinics(), getClinicById()
│   └── types/
│       └── database.ts         # TypeScript interfaces mirror PostgreSQL schema
├── supabase/
│   ├── schema.sql              # DB schema through Phase 5 + RLS policies
│   └── seed.sql                # Sample clinic data
├── openclaw/                   # AI Data Engine scripts
│   ├── run_batch.py            # Search → scrape → extract → save clinics
│   ├── generate_insights.py    # Generate and publish article drafts/content
│   ├── scraper.py              # Playwright scraper
│   ├── extractor.py            # LLM structured extraction
│   └── db.py                   # Supabase insert/upsert helpers
├── .env.local.example          # Template environment variables
├── components.json             # ShadcnUI configuration
├── tsconfig.json               # TypeScript strict mode enabled
├── PIPELINE.md                 # Tài liệu chi tiết AI Data Pipeline
├── ARCHITECTURE.md             # Kiến trúc hệ thống & quy ước code
└── README.md                   # File này
```

## Cài đặt & Chạy

### Yêu cầu
- Node.js 18+ & npm
- Python 3.12+ (cho AI Engine, phase sau)
- Tài khoản Supabase (free tier OK)

### 1. Clone & Install
```bash
cd asian-health-hub
npm install
```

### 2. Cấu hình Environment
```bash
cp .env.local.example .env.local
# Mở .env.local, điền:
#   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
#   SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 3. Khởi tạo Database
- Mở Supabase Dashboard → SQL Editor
- Paste nội dung `supabase/schema.sql` và chạy

### 4. Chạy Dev Server
```bash
npm run dev
# → http://localhost:3000
```

## Database Schema (Tóm tắt)

| Bảng | Mục đích | Key columns |
|------|----------|-------------|
| `organizations` | Tổ chức y tế mẹ (VD: Kaiser) | `id`, `name`, `website` |
| `clinics` | Phòng khám chi tiết | `id`, `slug`, `org_id` (FK), `name`, `city`, `state`, `languages[]`, `specialty`, `metadata` |
| `articles` | Insights & Guides | `id`, `slug`, `title`, `content`, `category`, `tags[]`, `status`, `seo_meta` |
| `article_facts` | Facts/nguồn cho bài viết | `id`, `article_id`, `fact_text`, `source_url`, `verified` |

**RLS Policies:**
- `SELECT` → public (mọi người đọc được)
- `INSERT` / `UPDATE` → authenticated only

## Coding Conventions

- **TypeScript**: `strict: true`, không dùng `any`, bắt buộc `interface`/`type`
- **App Router only**: KHÔNG dùng `pages/` directory
- **Server Components trước**: Chỉ dùng `'use client'` khi thực sự cần (interactivity)
- **Error handling**: Mọi DB query / API call phải bọc `try/catch`
- **Import alias**: `@/*` → `./src/*`

## Roadmap

- [x] **Phase 1**: Foundation — Next.js + ShadcnUI + DB Schema + Supabase client
- [x] **Phase 2**: Landing Page UI + Search Page
- [x] **Phase 3**: Clinic Detail Page + Map Integration scaffold
- [x] **Phase 4**: Python AI Engine (OpenClaw) — search/scrape/extract/upsert scripts
- [x] **Phase 5**: Insights & Guides (AI content generation)
- [x] **Phase 6**: Claim Profile + Auth flow — login/signup, claim requests, provider dashboard
- [x] **Phase 7**: SEO optimization + Static Generation — sitemap, robots, ISR, programmatic local pages

## License

Private — All rights reserved.

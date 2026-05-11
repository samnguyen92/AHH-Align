# Kiến trúc Hệ thống — Asian Health Hub

## Tổng quan Kiến trúc

```
                    ┌─────────────────────────────┐
                    │         USERS                │
                    │  (Bệnh nhân + Chủ phòng khám)│
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │     NEXT.JS APP (Vercel)      │
                    │                               │
                    │  ┌─────────────────────────┐ │
                    │  │  App Router (Frontend)   │ │
                    │  │  - Server Components     │ │
                    │  │  - Client Components     │ │
                    │  │  - Static Generation     │ │
                    │  └────────────┬────────────┘ │
                    │               │               │
                    │  ┌────────────▼────────────┐ │
                    │  │  Route Handlers (API)    │ │
                    │  │  - /api/clinics          │ │
                    │  │  - /api/search           │ │
                    │  │  - /api/claim            │ │
                    │  └────────────┬────────────┘ │
                    └───────────────┼───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │        SUPABASE                │
                    │  ┌──────────────────────────┐ │
                    │  │  PostgreSQL + pgvector    │ │
                    │  │  Auth (Supabase Auth)     │ │
                    │  │  Storage (Images)         │ │
                    │  │  RLS Policies             │ │
                    │  └──────────────────────────┘ │
                    └───────────────▲───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │     PYTHON ENGINE (Fly.io)     │
                    │  ┌──────────────────────────┐ │
                    │  │  FastAPI                  │ │
                    │  │  Playwright Scrapers      │ │
                    │  │  LLM Extractors           │ │
                    │  │  Content Generators       │ │
                    │  └──────────────────────────┘ │
                    └───────────────────────────────┘
```

## Nguyên tắc Kiến trúc

### 1. Modular Monolith (Next.js)
- Frontend và Backend API cùng trong một codebase Next.js
- Tách biệt logic bằng **layers**: `components/` → `services/` → `lib/supabase/`
- Không tách microservice cho phần web — chỉ Python engine là tách riêng

### 2. Server-First Rendering
- **Mặc định = Server Component** (không cần `'use client'`)
- Chỉ dùng Client Component khi cần: form input, click handlers, local state
- Data fetching trong Server Components → gọi `services/` trực tiếp
- Tối ưu SEO bằng Static Generation (`generateStaticParams`)

### 3. Data Flow

```
[Server Component] 
    → calls services/clinic-service.ts
    → calls lib/supabase/server.ts (createServerAnonClient)
    → queries Supabase PostgreSQL
    → returns typed data (types/database.ts)
    → renders HTML on server

[Client Component]
    → calls /api/* Route Handlers (fetch)
    → OR calls lib/supabase/client.ts directly
    → updates UI with state
```

## Quy ước Code

### TypeScript
```typescript
// ✅ ĐÚNG — Luôn define interface
interface ClinicCardProps {
  clinic: Clinic;
  onSelect?: (id: string) => void;
}

// ❌ SAI — Không dùng any
function handleData(data: any) { ... }

// ✅ ĐÚNG — Dùng type narrowing
function handleData(data: unknown) {
  if (isClinic(data)) { ... }
}
```

### File Naming
```
components/ui/button.tsx           # ShadcnUI primitives (lowercase)
components/search/search-bar.tsx   # Feature components (kebab-case)
services/clinic-service.ts        # Service layer (kebab-case)
types/database.ts                 # Type definitions (kebab-case)
app/clinics/[id]/page.tsx         # Next.js pages (Next.js convention)
```

### Component Pattern
```typescript
// Server Component (default) — không có 'use client'
import { searchClinics } from '@/services/clinic-service';

export default async function ClinicsPage() {
  const result = await searchClinics({ city: 'San Jose' });
  return <ClinicList clinics={result.data} />;
}

// Client Component — chỉ khi cần interactivity
'use client';
import { useState } from 'react';

export function SearchBar() {
  const [query, setQuery] = useState('');
  // ...
}
```

### Error Handling
```typescript
// ✅ Mọi service function phải try/catch
export async function getClinicById(id: string): Promise<Clinic | null> {
  try {
    const { data, error } = await supabase.from('clinics').select('*').eq('id', id).single();
    if (error) throw error;
    return data as Clinic;
  } catch (err) {
    console.error('[clinic-service] getClinicById error:', err);
    return null;  // Graceful fallback, không crash
  }
}
```

## Database Conventions

### Bảng đã tạo (Phase 5 hiện tại)
| Bảng | Status | File |
|------|--------|------|
| `organizations` | ✅ Created | `supabase/schema.sql` |
| `clinics` | ✅ Created | `supabase/schema.sql` |
| `articles` | ✅ Created | `supabase/schema.sql` |
| `article_facts` | ✅ Created | `supabase/schema.sql` |

### Bảng sẽ tạo (Phase tương lai)
| Bảng | Mục đích | Phase |
|------|----------|-------|
| `claim_requests` | Yêu cầu claim profile | Phase 6 |
| `users` | Supabase Auth (tự động) | Phase 6 |
| `clinic_embeddings` | pgvector cho semantic search | Phase 7 |

### RLS Pattern
```sql
-- Mọi bảng public data đều follow pattern này:
-- 1. Public SELECT (ai cũng đọc được)
-- 2. Authenticated INSERT/UPDATE (phải đăng nhập)
-- 3. KHÔNG cho DELETE qua API (chỉ admin qua Dashboard)
```

## Environment Variables

| Variable | Nơi dùng | Bắt buộc |
|----------|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | ✅ |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` hoặc `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | ✅ |
| `SUPABASE_SECRET_KEY` hoặc `SUPABASE_SERVICE_ROLE_KEY` | Server/OpenClaw writes | ✅ |
| `OPENROUTER_API_KEY` | OpenClaw LLM extraction/content | Phase 4+ |
| `GOOGLE_MAPS_API_KEY` | Clinic detail page | Phase 3+ |

## Deployment Target

| Component | Platform | Lý do |
|-----------|----------|-------|
| Next.js App | **Vercel** | Zero-config, Edge Functions, ISR |
| Python Engine | **Fly.io** hoặc **Railway** | Long-running tasks, Playwright support |
| Database | **Supabase** (managed) | Free tier generous, built-in Auth & RLS |

## Quy trình Phát triển

```
1. Tạo branch feature
2. Viết code theo layers: types/ → services/ → components/ → app/
3. Test locally (npm run dev)
4. Build check (npm run build) — phải pass, không lỗi TypeScript
5. Commit & merge
```

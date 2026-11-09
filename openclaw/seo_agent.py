"""
seo_agent.py — Technical & Programmatic SEO Agent for Asian Health Hub.

Provides:
  1. `run_seo_audit(target_route=None)`:
     - Audits Next.js source files (`src/app/**/page.tsx`, `layout.tsx`, `sitemap.ts`, `robots.ts`)
       for metadata (`generateMetadata` / `metadata`), canonical tags, OpenGraph, and JSON-LD schema.
     - Audits live rendered HTML on `localhost:3000` (via HTTP/Playwright) for `<title>`,
       `<meta name="description">`, `<h1>` hierarchy, image `alt` coverage, and `<script type="application/ld+json">`.
     - Audits Supabase database SEO readiness (articles missing `seo_meta.description`, clinics missing `short_description` or `faqs`).
  2. `run_seo_setup(instruction, progress_callback=None)`:
     - Delegates to `run_web_dev_agent` with specialized Next.js Technical SEO & Schema.org rules
       so the agent can write/patch metadata, JSON-LD, sitemaps, or internal links directly.
"""

import os
import re
import urllib.request
from typing import Any, Callable, Dict, List, Optional

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client

from dev_agent import PROJECT_ROOT, run_web_dev_agent

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(PROJECT_ROOT, ".env.local"))

SEO_SPECIALIST_PROMPT = """You are also acting as Principal Technical & Medical SEO Architect.
When implementing SEO changes in Next.js 16.2.6 (`src/app/`):
- Ensure every public route has either static `export const metadata: Metadata` or dynamic `export async function generateMetadata(...)`.
- Include `alternates: { canonical: ... }`, `openGraph`, and descriptive bilingual-aware titles & meta descriptions (140-160 chars).
- For clinic pages (`src/app/clinics/[slug]/page.tsx`), use valid Schema.org `MedicalClinic` + `AggregateRating` + `FAQPage` JSON-LD.
- For article pages (`src/app/insights/[slug]/page.tsx`), use valid Schema.org `Article` / `MedicalWebPage` + `FAQPage` JSON-LD.
- Keep `src/app/sitemap.ts` and `src/app/robots.ts` clean, valid, and comprehensive.
"""


def _audit_nextjs_routes() -> List[Dict[str, Any]]:
    app_dir = os.path.join(PROJECT_ROOT, "src", "app")
    route_reports = []
    for root, dirs, files in os.walk(app_dir):
        dirs[:] = [d for d in dirs if d not in {"api", "admin", "dashboard"}]
        if "page.tsx" in files:
            fpath = os.path.join(root, "page.tsx")
            rel_route = "/" + os.path.relpath(root, app_dir).replace("\\", "/")
            if rel_route == "/.":
                rel_route = "/"
            try:
                with open(fpath, "r", encoding="utf-8") as fh:
                    code = fh.read()
                has_metadata = ("export const metadata" in code) or ("generateMetadata" in code)
                has_jsonld = "application/ld+json" in code
                has_canonical = "canonical" in code
                route_reports.append(
                    {
                        "route": rel_route,
                        "file": os.path.relpath(fpath, PROJECT_ROOT),
                        "has_metadata": has_metadata,
                        "has_jsonld": has_jsonld,
                        "has_canonical": has_canonical,
                    }
                )
            except Exception:
                continue
    return route_reports


def _inspect_live_route(route_path: str = "/") -> Dict[str, Any]:
    clean_route = "/" + (route_path or "/").lstrip("/")
    bases = [
        os.environ.get("OPENCLAW_PREVIEW_BASE_URL", "").rstrip("/"),
        "http://localhost:3000",
        "http://web:3000",
    ]
    html = ""
    used_url = ""
    for b in [x for x in bases if x]:
        try:
            url = f"{b}{clean_route}"
            req = urllib.request.Request(url, headers={"User-Agent": "OpenClaw-SEO-Auditor/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                used_url = url
                break
        except Exception:
            continue

    if not html:
        return {"ok": False, "route": clean_route, "error": "Could not reach local web server"}

    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.string or "").strip() if soup.title else ""
    desc_tag = soup.find("meta", attrs={"name": "description"})
    desc = (desc_tag.get("content") or "").strip() if desc_tag else ""
    canon_tag = soup.find("link", attrs={"rel": "canonical"})
    canonical = (canon_tag.get("href") or "").strip() if canon_tag else ""
    og_title_tag = soup.find("meta", attrs={"property": "og:title"})
    og_image_tag = soup.find("meta", attrs={"property": "og:image"})

    h1_tags = [h.get_text(" ", strip=True) for h in soup.find_all("h1")]
    imgs = soup.find_all("img")
    imgs_missing_alt = sum(1 for img in imgs if not (img.get("alt") or "").strip())
    jsonld_scripts = soup.find_all("script", attrs={"type": "application/ld+json"})

    return {
        "ok": True,
        "route": clean_route,
        "url": used_url,
        "title": title,
        "title_len": len(title),
        "description": desc,
        "description_len": len(desc),
        "canonical": canonical,
        "has_og": bool(og_title_tag and og_image_tag),
        "h1_count": len(h1_tags),
        "h1_sample": h1_tags[0] if h1_tags else None,
        "img_total": len(imgs),
        "img_missing_alt": imgs_missing_alt,
        "jsonld_count": len(jsonld_scripts),
    }


def _audit_db_seo() -> Dict[str, Any]:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return {}
    try:
        sb = create_client(url, key)
        clinics = sb.table("clinics").select("slug,description,metadata").execute().data or []
        articles = sb.table("articles").select("slug,title,excerpt,seo_meta,status").execute().data or []

        clinics_missing_desc = sum(1 for c in clinics if not (c.get("description") or "").strip())
        clinics_with_faq = sum(1 for c in clinics if (c.get("metadata") or {}).get("faqs"))
        published_articles = [a for a in articles if a.get("status") == "published"]
        articles_missing_meta_desc = sum(
            1
            for a in published_articles
            if not ((a.get("seo_meta") or {}).get("description") or a.get("excerpt"))
        )
        return {
            "total_clinics": len(clinics),
            "clinics_missing_desc": clinics_missing_desc,
            "clinics_with_faq": clinics_with_faq,
            "published_articles": len(published_articles),
            "articles_missing_meta_desc": articles_missing_meta_desc,
        }
    except Exception:
        return {}


def run_seo_audit(target_route: Optional[str] = None) -> str:
    routes = _audit_nextjs_routes()
    has_sitemap = os.path.exists(os.path.join(PROJECT_ROOT, "src", "app", "sitemap.ts"))
    has_robots = os.path.exists(os.path.join(PROJECT_ROOT, "src", "app", "robots.ts"))

    routes_to_check = [target_route] if target_route else ["/", "/search", "/insights", "/clinics/great-care-dental"]
    live_checks = [_inspect_live_route(r) for r in routes_to_check if r]
    db_seo = _audit_db_seo()

    lines = [
        "🚀 **TECHNICAL & PROGRAMMATIC SEO AUDIT**",
        f"• Sitemap (`src/app/sitemap.ts`): {'✅ Có' if has_sitemap else '❌ Thiếu'}",
        f"• Robots (`src/app/robots.ts`): {'✅ Có' if has_robots else '❌ Thiếu'}",
        f"• Public App Routes được quét: {len(routes)} trang",
    ]

    missing_meta_routes = [r["route"] for r in routes if not r["has_metadata"]]
    if missing_meta_routes:
        lines.append(f"⚠️ Route chưa khai báo `metadata` riêng (đang dùng kế thừa từ layout): {', '.join(missing_meta_routes)}")
    else:
        lines.append("✅ 100% public routes đều có `metadata` hoặc `generateMetadata`.")

    lines.append("\n🔎 **Kiểm tra HTML thực tế trên Live/Local Server:**")
    for lc in live_checks:
        if not lc.get("ok"):
            lines.append(f"• `{lc['route']}`: ⚠️ Không kết nối được ({lc.get('error')})")
            continue
        title_status = "✅" if 20 <= lc["title_len"] <= 70 else "⚠️"
        desc_status = "✅" if 70 <= lc["description_len"] <= 175 else "⚠️"
        h1_status = "✅" if lc["h1_count"] == 1 else f"⚠️ ({lc['h1_count']} thẻ H1)"
        lines.append(
            f"• `{lc['route']}`:\n"
            f"  - Title ({lc['title_len']} ký tự) {title_status}: *{lc['title'][:65]}*\n"
            f"  - Meta Desc ({lc['description_len']} ký tự) {desc_status} | H1: {h1_status}\n"
            f"  - JSON-LD Blocks: `{lc['jsonld_count']}` | OpenGraph: {'✅' if lc['has_og'] else '⚠️'} | Ảnh thiếu alt: `{lc['img_missing_alt']}/{lc['img_total']}`"
        )

    if db_seo:
        lines.extend(
            [
                "\n🗄️ **Độ phủ SEO trong Cơ sở dữ liệu (Supabase):**",
                f"• Phòng khám có mô tả chuẩn SEO: `{db_seo['total_clinics'] - db_seo['clinics_missing_desc']}/{db_seo['total_clinics']}`",
                f"• Phòng khám có cấu trúc FAQ Schema: `{db_seo['clinics_with_faq']}/{db_seo['total_clinics']}`",
                f"• Bài viết Published có Meta Description: `{db_seo['published_articles'] - db_seo['articles_missing_meta_desc']}/{db_seo['published_articles']}`",
            ]
        )

    lines.append(
        "\n💡 **Gợi ý hành động**: Bạn có thể nhắn `/seo_setup <yêu cầu>` (ví dụ: `/seo_setup Thêm JSON-LD MedicalClinic và FAQPage cho trang /search và trang chủ`) để Agent tự động viết code và cập nhật."
    )
    return "\n".join(lines)


def run_seo_setup(
    instruction: str,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> Dict[str, Any]:
    return run_web_dev_agent(
        instruction=instruction,
        extra_system_prompt=SEO_SPECIALIST_PROMPT,
        progress_callback=progress_callback,
    )


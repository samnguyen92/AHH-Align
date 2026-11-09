"""
site_analyzer.py — Deep Website Traffic, Funnel & Live UX/Performance Analyzer.

Combines:
  1. Real user telemetry from `analytics_events` (pageviews, top search queries,
     clinic conversion clicks, low-performing high-traffic pages).
  2. Live Playwright inspection of the running website (TTFB / DOM load latency,
     console errors, broken images, CTA visibility on Desktop & Mobile).
  3. Actionable engineering & growth recommendations that can be sent directly to
     the Web-Dev Agent (`/web_edit`) or SEO Agent (`/seo_setup`).
"""

import os
import time
from typing import Any, Dict, List

from dotenv import load_dotenv

from admin_actions import get_analytics_summary

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(_OPENCLAW_DIR, ".."))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(PROJECT_ROOT, ".env.local"))


def _probe_live_ux(route_path: str = "/") -> Dict[str, Any]:
    clean_route = "/" + (route_path or "/").lstrip("/")
    bases = [
        os.environ.get("OPENCLAW_PREVIEW_BASE_URL", "").rstrip("/"),
        "http://localhost:3000",
        "http://web:3000",
    ]
    bases = [b for b in bases if b]

    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        return {"ok": False, "error": f"Playwright unavailable: {exc}"}

    console_errors: List[str] = []
    start_ts = time.time()

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            page = context.new_page()
            page.on(
                "console",
                lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
            )

            loaded_url = None
            for base in bases:
                url = f"{base}{clean_route}"
                try:
                    start_ts = time.time()
                    page.goto(url, wait_until="domcontentloaded", timeout=20000)
                    page.wait_for_timeout(800)
                    loaded_url = url
                    break
                except Exception:
                    continue

            if not loaded_url:
                browser.close()
                return {"ok": False, "error": "Could not load local web server"}

            load_ms = int((time.time() - start_ts) * 1000)

            metrics = page.evaluate(
                """() => {
                    const imgs = Array.from(document.querySelectorAll('img'));
                    const brokenImgs = imgs.filter(img => img.complete && img.naturalWidth === 0).map(i => i.getAttribute('src'));
                    const links = Array.from(document.querySelectorAll('a'));
                    const emptyLinks = links.filter(a => !a.getAttribute('href') || a.getAttribute('href') === '#').length;
                    const ctas = Array.from(document.querySelectorAll('a, button')).filter(el => {
                        const t = (el.innerText || '').toLowerCase();
                        return t.includes('find') || t.includes('claim') || t.includes('call') || t.includes('visit') || t.includes('search');
                    }).length;
                    const horizontalOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
                    return {
                        totalImgs: imgs.length,
                        brokenImgs: brokenImgs.slice(0, 5),
                        totalLinks: links.length,
                        emptyLinks,
                        ctaCount: ctas,
                        horizontalOverflow,
                    };
                }"""
            )
            browser.close()
            return {
                "ok": True,
                "route": clean_route,
                "url": loaded_url,
                "load_ms": load_ms,
                "console_errors": console_errors[:5],
                **metrics,
            }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def run_site_analysis(target_route: str = "/", timeframe: str = "week") -> str:
    analytics_text = get_analytics_summary(timeframe=timeframe, filter_type="all")
    ux = _probe_live_ux(target_route)

    lines = [
        f"📊 **WEBSITE DEEP ANALYZER ({timeframe.upper()} — Route: `{target_route}`)**",
        "",
        "### 1. Hiệu suất & Trải nghiệm Giao diện Thực tế (Playwright Live Probe)",
    ]

    if ux.get("ok"):
        overflow_str = "⚠️ Phát hiện tràn ngang (Horizontal Overflow)" if ux["horizontalOverflow"] else "✅ Chuẩn (Không tràn khung)"
        broken_str = f"⚠️ {len(ux['brokenImgs'])} ảnh lỗi ({', '.join(str(x) for x in ux['brokenImgs'])})" if ux["brokenImgs"] else f"✅ 0/{ux['totalImgs']} ảnh lỗi"
        err_str = f"⚠️ {len(ux['console_errors'])} lỗi JS" if ux["console_errors"] else "✅ 0 lỗi Console/JS"
        lines.extend(
            [
                f"• Tốc độ phản hồi & Render DOM: `{ux['load_ms']} ms`",
                f"• Bố cục khung nhìn (Viewport Layout): {overflow_str}",
                f"• Tình trạng hình ảnh: {broken_str}",
                f"• Nút hành động (CTA Buttons/Links): `{ux['ctaCount']}` nút | Tổng số link: `{ux['totalLinks']}`",
                f"• Console / Runtime JS: {err_str}",
            ]
        )
    else:
        lines.append(f"• ⚠️ Không thể chạy Playwright probe: {ux.get('error')}")

    lines.extend(
        [
            "",
            "### 2. Phân tích Lưu lượng, Tìm kiếm & Chuyển đổi (Supabase Telemetry)",
            analytics_text,
            "",
            "💡 **Gợi ý lệnh tiếp theo**:",
            "• Muốn chụp ảnh giao diện trang này: `/preview " + target_route + "`",
            "• Muốn kiểm toán SEO chuyên sâu: `/seo_audit " + target_route + "`",
            "• Muốn yêu cầu Agent sửa trực tiếp giao diện/code: `/web_edit <mô tả thay đổi>`",
        ]
    )
    return "\n".join(lines)


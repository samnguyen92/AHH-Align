"""
stats_agent.py — Website Stats Analyst Agent.

Flow ("Text-to-Metrics"):
    question -> plan (LLM JSON, with keyword fallback) -> metrics (Python, read-only)
             -> deterministic summary lines (numbers come ONLY from metrics)
             -> optional LLM "insights" (2-3 bullets, told not to invent numbers)
             -> short answer + offer of a detailed report

`answer_stats_question()` returns a short, complete answer (default).
`build_detailed_report()` writes a full Markdown report (+ charts when matplotlib is installed).
Google Search Console / GA4 data is merged in automatically when connected; otherwise the agent
says so and points to /connect_gsc and /connect_ga4.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

import gsc_client
import stats_metrics as sm

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(_OPENCLAW_DIR, "..", ".env.local"))

REPORTS_DIR = os.path.join(_OPENCLAW_DIR, "reports")
VALID_SCOPES = ("overview", "traffic", "posts", "clinics", "seo")
PLANNER_MODEL = os.environ.get("OPENCLAW_INTENT_MODEL", "deepseek/deepseek-v4-flash")
NARRATOR_MODEL = os.environ.get("OPENCLAW_STATS_MODEL", os.environ.get("OPENCLAW_TEXT_MODEL", "openai/gpt-6-luna"))

PERIOD_LABELS_EN = {"today": "Today", "week": "Past 7 days", "month": "Past 28 days", "quarter": "Past 90 days"}
PERIOD_LABELS_VI = sm.PERIOD_LABELS

ISSUE_LABELS_VI = {
    "missing_title": "thiếu title",
    "title_length": "title sai độ dài (20–70)",
    "missing_description": "thiếu meta description",
    "description_length": "description sai độ dài (70–175)",
    "h1_count": "H1 không đúng 1 thẻ",
    "missing_canonical": "thiếu canonical",
    "missing_jsonld": "thiếu JSON-LD",
    "noindex": "đang noindex",
    "images_missing_alt": "ảnh thiếu alt",
}

ISSUE_LABELS_EN = {
    "missing_title": "missing title",
    "title_length": "invalid title length (20–70)",
    "missing_description": "missing meta description",
    "description_length": "invalid description length (70–175)",
    "h1_count": "H1 count not 1",
    "missing_canonical": "missing canonical",
    "missing_jsonld": "missing JSON-LD",
    "noindex": "noindex enabled",
    "images_missing_alt": "images missing alt text",
}


# ----------------------------------------------------------------------------
# Small formatting helpers
# ----------------------------------------------------------------------------

def _n(value: Any) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, float) and not value.is_integer():
        return f"{value:,.1f}"
    return f"{int(value):,}"


def _delta(cur: Optional[float], prev: Optional[float], lang: str = "en") -> str:
    if cur is None or prev is None:
        return ""
    is_vi = lang == "vi"
    change = sm.pct_change(cur, prev)
    if change is None:
        if not cur:
            return ""
        return "(kỳ trước: 0)" if is_vi else "(prev: 0)"
    arrow = "▲" if change > 0 else "▼" if change < 0 else "•"
    return f"({arrow} {change:+.0f}% vs kỳ trước)" if is_vi else f"({arrow} {change:+.0f}% vs prev)"


def _top(items: List[Tuple[str, int]], limit: int = 3, lang: str = "en") -> str:
    if items:
        return ", ".join(f"{k} ({v})" for k, v in items[:limit])
    return "chưa có" if lang == "vi" else "none"


# ----------------------------------------------------------------------------
# Planner
# ----------------------------------------------------------------------------

def _keyword_plan(question: str) -> Dict[str, Any]:
    q = (question or "").lower()
    if re.search(r"hôm nay|hom nay|today", q):
        period = "today"
    elif re.search(r"quý|quy |quarter|90 ?(ngày|day)", q):
        period = "quarter"
    elif re.search(r"tháng|thang|month|30 ?(ngày|day)", q):
        period = "month"
    else:
        period = "week"

    scopes: List[str] = []
    if re.search(r"\bseo\b|sitemap|index|meta|schema|json-?ld|ranking|xếp hạng|thứ hạng|gsc|search console", q):
        scopes.append("seo")
    if re.search(r"\bbài\b|\bbai\b|post|article|insight|blog|guide", q):
        scopes.append("posts")
    if re.search(r"clinic|phòng khám|phong kham|directory|claim|subscriber|newsletter", q):
        scopes.append("clinics")
    if re.search(r"view|lượt xem|luot xem|traffic|visitor|truy cập|truy cap|search|tìm kiếm|tim kiem|click|trang nào|page", q):
        scopes.append("traffic")
    if not scopes:
        scopes = ["overview"]
    detail = bool(re.search(r"chi tiết|chi tiet|detail|full report|báo cáo đầy đủ|bao cao day du", q))
    return {"scopes": scopes, "period": period, "detail": detail, "source": "keywords"}


def plan_question(question: str) -> Dict[str, Any]:
    fallback = _keyword_plan(question)
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return fallback
    try:
        from openai import OpenAI

        client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=25)
        system = (
            "You are a planner for a website stats assistant. Return ONLY JSON: "
            '{"scopes": [..], "period": "today|week|month|quarter", "detail": true|false}. '
            "scopes is a non-empty subset of: overview (general health), traffic (views, sessions, pages, "
            "searches, clicks, referrers), posts (blog articles), clinics (directory, claims, newsletter), "
            "seo (technical SEO, sitemap, Google Search Console). Use overview for generic questions like "
            "'how is the website doing'. detail=true only if the user explicitly asks for a detailed/full report. "
            "Default period is week."
        )
        resp = client.chat.completions.create(
            model=PLANNER_MODEL,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": question}],
            temperature=0,
            max_tokens=120,
        )
        text = (resp.choices[0].message.content or "").strip()
        if "```" in text:
            text = text.split("```json")[-1].split("```")[0] if "```json" in text else text.split("```")[1]
        data = json.loads(text.strip())
        scopes = [s for s in data.get("scopes", []) if s in VALID_SCOPES] or fallback["scopes"]
        period = data.get("period") if data.get("period") in sm.PERIOD_DAYS else fallback["period"]
        return {"scopes": scopes, "period": period, "detail": bool(data.get("detail")), "source": "llm"}
    except Exception as exc:
        print(f"[!] Stats planner fell back to keywords: {exc}")
        return fallback


# ----------------------------------------------------------------------------
# Data collection
# ----------------------------------------------------------------------------

def collect_data(scopes: List[str], period: str) -> Dict[str, Any]:
    want = set(scopes)
    if "overview" in want:
        want |= {"traffic", "posts", "clinics"}
    data: Dict[str, Any] = {"period": period}
    errors: Dict[str, str] = {}

    traffic = None
    if want & {"traffic", "posts"}:
        try:
            traffic = sm.metric_traffic(period)
            if "traffic" in want:
                data["traffic"] = traffic
        except Exception as exc:
            errors["traffic"] = str(exc)[:160]
    if "posts" in want:
        try:
            data["posts"] = sm.metric_posts(traffic)
        except Exception as exc:
            errors["posts"] = str(exc)[:160]
    if "clinics" in want:
        try:
            data["clinics"] = sm.metric_clinics(period)
        except Exception as exc:
            errors["clinics"] = str(exc)[:160]
    if "seo" in want:
        try:
            data["seo"] = sm.metric_seo_internal()
        except Exception as exc:
            errors["seo"] = str(exc)[:160]
        data["google"] = collect_google(period)

    if "overview" in want and gsc_client.gsc_configured():
        data["google"] = collect_google(period)

    data["errors"] = errors
    return data


def collect_google(period: str) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "gsc_connected": gsc_client.gsc_configured(),
        "ga4_connected": gsc_client.ga4_configured(),
    }
    if out["gsc_connected"]:
        try:
            out["gsc"] = gsc_client.fetch_gsc(period)
        except Exception as exc:
            out["gsc_error"] = str(exc)[:200]
    if out["ga4_connected"]:
        try:
            out["ga4"] = gsc_client.fetch_ga4(period)
        except Exception as exc:
            out["ga4_error"] = str(exc)[:200]
    return out


# ----------------------------------------------------------------------------
# Deterministic summaries (SHORT)
# ----------------------------------------------------------------------------

def short_traffic(t: Dict[str, Any], lang: str = "en") -> List[str]:
    c, p = t["counts"], t["prev_counts"]
    is_vi = lang == "vi"
    sess_msg = (
        f" · Sessions: {_n(t['sessions'])} {_delta(t['sessions'], t['prev_sessions'], lang=lang)}"
        if t["sessions"]
        else (" · Sessions: chưa đủ dữ liệu (tracking mới bật)" if is_vi else " · Sessions: collecting initial data")
    )
    lines = [f"👁 Views: {_n(c['page_view'])} {_delta(c['page_view'], p['page_view'], lang=lang)}{sess_msg}"]

    s_title = "🔎 Tìm kiếm: " if is_vi else "🔎 Searches: "
    s_line = f"{s_title}{_n(c['search_query'])} {_delta(c['search_query'], p['search_query'], lang=lang)}"
    if t["zero_result_rate"] is not None:
        zero_msg = " · không có kết quả: " if is_vi else " · zero-results: "
        s_line += f"{zero_msg}{t['zero_result_searches']}/{t['searches_with_result_count']} ({t['zero_result_rate']}%)"
    lines.append(s_line)

    if t["top_queries"]:
        q_label = "   Từ khóa top: " if is_vi else "   Top searches: "
        lines.append(f"{q_label}{_top(t['top_queries'], lang=lang)}")
    if t["zero_result_queries"]:
        z_label = "   ⚠️ Tìm không ra: " if is_vi else "   ⚠️ Zero-result queries: "
        lines.append(f"{z_label}{_top(t['zero_result_queries'], lang=lang)}")

    actions = t["click_actions"]
    c_label = "📞 Liên hệ clinic: " if is_vi else "📞 Clinic contacts: "
    card_label = " · mở hồ sơ từ danh sách: " if is_vi else " · profile opens: "
    lines.append(
        f"{c_label}{_n(t['contact_clicks'])} "
        f"(call {actions.get('call', 0)} · website {actions.get('website', 0)} · directions {actions.get('directions', 0)} · booking {actions.get('booking', 0)})"
        f"{card_label}{actions.get('card', 0)}"
    )
    if t["top_pages"]:
        p_label = "🏆 Top trang: " if is_vi else "🏆 Top pages: "
        lines.append(f"{p_label}{_top(t['top_pages'], lang=lang)}")
    if t["referrers"] and not (len(t["referrers"]) == 1 and t["referrers"][0][0] == "(direct)"):
        r_label = "🌐 Nguồn: " if is_vi else "🌐 Referrers: "
        lines.append(f"{r_label}{_top(t['referrers'], lang=lang)}")
    if t["small_sample"]:
        sm_label = (
            f"ℹ️ Mẫu nhỏ ({_n(c['page_view'])} views) — xu hướng chỉ mang tính tham khảo."
            if is_vi
            else f"ℹ️ Small sample ({_n(c['page_view'])} views) — trends are directional."
        )
        lines.append(sm_label)
    return lines


def short_posts(p: Dict[str, Any], lang: str = "en") -> List[str]:
    is_vi = lang == "vi"
    post_label = "📝 Bài viết: " if is_vi else "📝 Articles: "
    days_label = (
        f" · +{p['new_7d']} trong 7 ngày, +{p['new_30d']} trong 30 ngày · TB {p['avg_words']} từ"
        if is_vi
        else f" · +{p['new_7d']} in 7d, +{p['new_30d']} in 30d · Avg {p['avg_words']} words"
    )
    lines = [f"{post_label}{p['published']} published ({p['by_status'].get('draft', 0)} draft){days_label}"]
    if p["top_posts"]:
        top_l = "🔥 Bài nhiều view: " if is_vi else "🔥 Top articles: "
        lines.append(top_l + "; ".join(f"{x['title'][:48]} ({x['views']})" for x in p["top_posts"][:3]))
    elif p["views_known"]:
        noview_l = "🔥 Chưa ghi nhận view nào cho bài viết trong kỳ này." if is_vi else "🔥 No article views recorded in this period."
        lines.append(noview_l)
    seo_l = (
        f"⚠️ SEO bài: thiếu description {len(p['missing_description'])} · thiếu og_image {len(p['missing_og_image'])} · "
        f"chưa có keyword {len(p['missing_primary_keyword'])} · >14 ngày không view {p['published_without_views_count']}"
        if is_vi
        else
        f"⚠️ Article SEO: missing description {len(p['missing_description'])} · missing og_image {len(p['missing_og_image'])} · "
        f"missing keyword {len(p['missing_primary_keyword'])} · zero views >14d: {p['published_without_views_count']}"
    )
    lines.append(seo_l)
    return lines


def short_clinics(c: Dict[str, Any], lang: str = "en") -> List[str]:
    is_vi = lang == "vi"
    m = c["missing_pct"]
    c_time = f" (+{c['new_7d']} trong 7 ngày, +{c['new_30d']} trong 30 ngày)" if is_vi else f" (+{c['new_7d']} in 7d, +{c['new_30d']} in 30d)"
    lines = [
        f"🏥 Clinics: {c['total']}{c_time} · claimed {c['claimed']} · telehealth {c['telehealth']}",
    ]
    if is_vi:
        lines.append(f"✅ Chất lượng dữ liệu: TB {_n(c['avg_quality'])}/100 · {c['below_70_count']} clinic <70 · thiếu ảnh {m['images']}% · bảo hiểm {m['insurance']}% · giờ {m['hours']}% · bác sĩ {m['doctors']}%")
        lines.append(f"📍 Top city: {_top(c['cities'], 3, lang=lang)} · Ngôn ngữ: {_top(c['languages'], 3, lang=lang)}")
    else:
        lines.append(f"✅ Data Quality: Avg {_n(c['avg_quality'])}/100 · {c['below_70_count']} <70 · missing images {m['images']}% · insurance {m['insurance']}% · hours {m['hours']}% · doctors {m['doctors']}%")
        lines.append(f"📍 Top cities: {_top(c['cities'], 3, lang=lang)} · Languages: {_top(c['languages'], 3, lang=lang)}")

    queue = []
    if c.get("pending_claims") is not None:
        queue.append(f"claims chờ duyệt {c['pending_claims']}" if is_vi else f"pending claims {c['pending_claims']}")
    if c.get("pending_submissions") is not None:
        queue.append(f"submissions chờ duyệt {c['pending_submissions']}" if is_vi else f"pending submissions {c['pending_submissions']}")
    if c.get("newsletter_subscribers") is not None:
        news_time = f" (+{c.get('newsletter_new_in_period') or 0} trong kỳ)" if is_vi else f" (+{c.get('newsletter_new_in_period') or 0} in period)"
        queue.append(f"newsletter {c['newsletter_subscribers']}{news_time}")
    if queue:
        lines.append("📥 " + " · ".join(queue))
    if c["supply_gaps"]:
        g = c["supply_gaps"][0]
        if is_vi:
            lines.append(f"🎯 Thiếu nguồn cung nhất: {g['language']} · {g['specialty']} tại {g['city']}, {g['state']} (hiện {g['count']})")
        else:
            lines.append(f"🎯 Top supply gap: {g['language']} · {g['specialty']} in {g['city']}, {g['state']} (currently {g['count']})")
    return lines


def short_seo(s: Dict[str, Any], g: Optional[Dict[str, Any]], lang: str = "en") -> List[str]:
    is_vi = lang == "vi"
    issues_dict = ISSUE_LABELS_VI if is_vi else ISSUE_LABELS_EN
    lines: List[str] = []
    if not s.get("ok"):
        lines.append(f"🔧 Audit nội bộ: không chạy được — {s.get('error')}" if is_vi else f"🔧 Internal Audit: failed — {s.get('error')}")
    else:
        broken = len(s["pages_broken"])
        if is_vi:
            lines.append(f"🔧 Audit nội bộ: {s['pages_checked']} trang mẫu · điểm sức khỏe {s['health_score']}/100 · {broken} trang lỗi HTTP")
        else:
            lines.append(f"🔧 Internal Audit: {s['pages_checked']} sampled pages · health score {s['health_score']}/100 · {broken} HTTP errors")
        issues = sorted(s["issue_counts"].items(), key=lambda kv: kv[1], reverse=True)[:3]
        if issues:
            iss_title = "   Lỗi phổ biến: " if is_vi else "   Top issues: "
            lines.append(iss_title + ", ".join(f"{issues_dict.get(k, k)} ({v})" for k, v in issues))
        cov = s.get("coverage")
        if cov:
            if is_vi:
                lines.append(
                    f"🗺 Sitemap: {s['sitemap_urls']} URL · clinics {cov['clinics_in_sitemap']}/{cov['clinics_in_db']} · bài {cov['posts_in_sitemap']}/{cov['published_posts_in_db']}"
                    + (" · ⚠️ sitemap chưa phủ hết" if cov["clinics_in_sitemap"] < cov["clinics_in_db"] or cov["posts_in_sitemap"] < cov["published_posts_in_db"] else "")
                )
            else:
                lines.append(
                    f"🗺 Sitemap: {s['sitemap_urls']} URLs · clinics {cov['clinics_in_sitemap']}/{cov['clinics_in_db']} · posts {cov['posts_in_sitemap']}/{cov['published_posts_in_db']}"
                    + (" · ⚠️ sitemap incomplete" if cov["clinics_in_sitemap"] < cov["clinics_in_db"] or cov["posts_in_sitemap"] < cov["published_posts_in_db"] else "")
                )
        if s.get("avg_ms") is not None:
            if is_vi:
                lines.append(f"⚡ Phản hồi TB {s['avg_ms']}ms · robots.txt {'OK' if s.get('robots_ok') else 'LỖI'}")
            else:
                lines.append(f"⚡ Avg response {s['avg_ms']}ms · robots.txt {'OK' if s.get('robots_ok') else 'ERROR'}")
    lines += short_google(g, lang=lang)
    return lines


def short_google(g: Optional[Dict[str, Any]], lang: str = "en") -> List[str]:
    if not g:
        return []
    is_vi = lang == "vi"
    lines: List[str] = []
    if not g.get("gsc_connected"):
        lines.append(
            "ℹ️ Chưa kết nối Google Search Console → chưa có impressions/vị trí từ khóa thật. Gõ `/connect_gsc` để thêm."
            if is_vi else
            "ℹ️ Google Search Console not connected → real impressions/positions unavailable. Type `/connect_gsc` to link."
        )
    elif g.get("gsc_error"):
        lines.append(f"⚠️ GSC error: {g['gsc_error']}")
    elif g.get("gsc"):
        t, pt = g["gsc"]["totals"], g["gsc"]["prev_totals"]
        pos_label = "vị trí TB" if is_vi else "avg position"
        lines.append(
            f"📊 Google (GSC): {_n(t['clicks'])} clicks {_delta(t['clicks'], pt['clicks'], lang=lang)} · {_n(t['impressions'])} impressions {_delta(t['impressions'], pt['impressions'], lang=lang)} · CTR {t['ctr']}% · {pos_label} {t['position']}"
        )
        if g["gsc"]["near_top10_queries"]:
            q = g["gsc"]["near_top10_queries"][0]
            opp_l = "   🎯 Cơ hội: " if is_vi else "   🎯 Opportunity: "
            lines.append(f"{opp_l}“{q['key']}” #{q['position']} ({q['impressions']} impressions)")
    if g.get("ga4_connected") and g.get("ga4"):
        t = g["ga4"]["totals"]
        lines.append(f"📈 GA4: {_n(t.get('sessions'))} sessions · {_n(t.get('users'))} users · {_n(t.get('views'))} views")
    elif g.get("ga4_error"):
        lines.append(f"⚠️ GA4 error: {g['ga4_error']}")
    return lines


def build_short_lines(data: Dict[str, Any], scopes: List[str], lang: str = "en") -> List[str]:
    lines: List[str] = []
    for key, fn in (("traffic", short_traffic), ("posts", short_posts), ("clinics", short_clinics)):
        if key in data:
            lines += fn(data[key], lang=lang)
    if "seo" in data:
        lines += short_seo(data["seo"], data.get("google"), lang=lang)
    elif data.get("google") and "overview" in scopes:
        lines += short_google(data["google"], lang=lang)
    for key, err in (data.get("errors") or {}).items():
        err_prefix = "⚠️ Không lấy được dữ liệu" if lang == "vi" else "⚠️ Could not fetch"
        lines.append(f"{err_prefix} `{key}`: {err}")
    return lines


# ----------------------------------------------------------------------------
# Insights + suggested actions
# ----------------------------------------------------------------------------

def rule_based_insights(data: Dict[str, Any], lang: str = "en") -> List[str]:
    is_vi = lang == "vi"
    out: List[str] = []
    t = data.get("traffic")
    if t:
        if t["small_sample"]:
            out.append(
                "Lượng truy cập còn thấp nên các % thay đổi dễ dao động — ưu tiên tăng nguồn truy cập trước khi tối ưu chuyển đổi."
                if is_vi else
                "Traffic volume is still low, so % changes can fluctuate — prioritize acquiring visitors before funnel optimization."
            )
        if t["zero_result_rate"] and t["zero_result_rate"] >= 20:
            out.append(
                f"{t['zero_result_rate']}% lượt tìm kiếm không ra kết quả — đây là nhu cầu thực tế cần bổ sung phòng khám."
                if is_vi else
                f"{t['zero_result_rate']}% of searches had zero results — represents real patient demand to add clinics for."
            )
        if t["counts"]["page_view"] and not t["contact_clicks"]:
            out.append(
                "Có lượt xem nhưng chưa ghi nhận lượt liên hệ clinic nào — kiểm tra nút Call/Website trên hồ sơ clinic."
                if is_vi else
                "Pageviews recorded but zero clinic contact clicks — verify Call/Website CTA buttons on clinic profiles."
            )
    p = data.get("posts")
    if p and p["published_without_views_count"]:
        out.append(
            f"{p['published_without_views_count']} bài đã đăng >14 ngày chưa có view — cân nhắc cải thiện tiêu đề hoặc chia sẻ."
            if is_vi else
            f"{p['published_without_views_count']} articles published >14d with 0 views — consider updating titles or internal links."
        )
    c = data.get("clinics")
    if c and c["below_70_count"]:
        out.append(
            f"{c['below_70_count']} clinic có điểm chất lượng dưới 70, cần bổ sung thông tin."
            if is_vi else
            f"{c['below_70_count']} clinics scored below 70 data quality, needing more details."
        )
    return out[:3]


def _compact_for_llm(data: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    t = data.get("traffic")
    if t:
        out["traffic"] = {
            k: t.get(k)
            for k in (
                "counts", "prev_counts", "sessions", "zero_result_rate", "top_queries", "zero_result_queries",
                "click_actions", "top_pages", "funnel", "small_sample",
            )
        }
    p = data.get("posts")
    if p:
        out["posts"] = {
            k: p.get(k)
            for k in ("published", "new_7d", "new_30d", "top_posts", "published_without_views_count")
        }
        out["posts"]["missing_description"] = len(p["missing_description"])
        out["posts"]["missing_og_image"] = len(p["missing_og_image"])
    c = data.get("clinics")
    if c:
        out["clinics"] = {
            k: c.get(k)
            for k in ("total", "new_7d", "avg_quality", "below_70_count", "missing_pct", "pending_claims", "supply_gaps")
        }
    s = data.get("seo")
    if s and s.get("ok"):
        out["seo"] = {k: s.get(k) for k in ("pages_checked", "health_score", "issue_counts", "coverage", "pages_broken")}
    g = data.get("google")
    if g:
        out["google"] = {"gsc_connected": g.get("gsc_connected"), "gsc": (g.get("gsc") or {}).get("totals")}
    return out


def llm_insights(data: Dict[str, Any], question: str, lang: str = "en") -> List[str]:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return rule_based_insights(data, lang=lang)
    try:
        from openai import OpenAI

        compact = json.dumps(_compact_for_llm(data), ensure_ascii=False)[:6000]
        client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=40)
        is_vi = lang == "vi"
        sys_prompt = (
            "You are a senior data analyst for Asian Health Hub. Based ONLY on the provided JSON metrics, "
            "write 2-3 concise bullet points (max 25 words each) in fluent ENGLISH: key observation and recommended next steps. "
            "STRICT RULE: NEVER invent numbers; only quote numbers from the JSON. If sample is small (small_sample=true), explicitly note it. "
            "Start each bullet with '- '."
            if not is_vi else
            "Bạn là chuyên viên phân tích website. Chỉ dựa vào JSON số liệu được cung cấp, viết 2-3 gạch đầu dòng "
            "nhận xét ngắn (tối đa 25 từ mỗi dòng) bằng TIẾNG VIỆT: điều đáng chú ý nhất và việc nên làm. "
            "TUYỆT ĐỐI không bịa số; chỉ trích số có trong JSON. Nếu mẫu nhỏ (small_sample=true) phải nói rõ "
            "chưa đủ kết luận. Không lặp lại toàn bộ số liệu. Mỗi dòng bắt đầu bằng '- '."
        )
        resp = client.chat.completions.create(
            model=NARRATOR_MODEL,
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": f"Question: {question}\n\nMetrics:\n{compact}"},
            ],
            temperature=0.2,
            max_tokens=260,
        )
        text = (resp.choices[0].message.content or "").strip()
        bullets = [ln.lstrip("-• ").strip() for ln in text.splitlines() if ln.strip().startswith(("-", "•"))]
        return bullets[:3] or rule_based_insights(data, lang=lang)
    except Exception as exc:
        print(f"[!] Stats narrator fell back to rules: {exc}")
        return rule_based_insights(data, lang=lang)


def suggest_actions(data: Dict[str, Any], lang: str = "en") -> List[str]:
    is_vi = lang == "vi"
    actions: List[str] = []
    t = data.get("traffic")
    if t and t["zero_result_queries"]:
        q = t["zero_result_queries"][0][0]
        actions.append(
            f"Lấp nhu cầu tìm không ra: `/find_clinics {q} | 3`"
            if is_vi else
            f"Fill zero-result demand: `/find_clinics {q} | 3`"
        )
    p = data.get("posts")
    if p and p["missing_description"]:
        actions.append(
            f"Bổ sung meta description: `/rewrite_article {p['missing_description'][0]} | thêm meta description`"
            if is_vi else
            f"Add meta description: `/rewrite_article {p['missing_description'][0]} | add meta description`"
        )
    c = data.get("clinics")
    if c and c["below_70_count"]:
        actions.append("Xem clinic điểm thấp: `/clinic_quality 70`" if is_vi else "Inspect low quality clinics: `/clinic_quality 70`")
    if c and c.get("pending_claims"):
        actions.append("Duyệt claims đang chờ: `/check_claims`" if is_vi else "Review pending claims: `/check_claims`")
    s = data.get("seo")
    if s and s.get("ok"):
        if s["issue_counts"].get("missing_jsonld"):
            actions.append("Thêm JSON-LD: `/seo_setup Thêm JSON-LD cho các trang đang thiếu`" if is_vi else "Add JSON-LD: `/seo_setup Add structured JSON-LD schema to pages`")
        if s["issue_counts"].get("h1_count"):
            actions.append("Sửa H1: `/seo_setup Mỗi trang chỉ có đúng 1 thẻ H1`" if is_vi else "Fix H1: `/seo_setup Ensure exactly 1 H1 per page`")
    g = data.get("google")
    if g and not g.get("gsc_connected") and "seo" in data:
        actions.append("Kết nối Google Search Console: `/connect_gsc`" if is_vi else "Connect Google Search Console: `/connect_gsc`")
    return actions[:4]


# ----------------------------------------------------------------------------
# Public API: short answer
# ----------------------------------------------------------------------------

def answer_stats_question(
    question: str,
    plan: Optional[Dict[str, Any]] = None,
    lang: str = "en",
) -> Dict[str, Any]:
    plan = plan or plan_question(question)
    data = collect_data(plan["scopes"], plan["period"])
    is_vi = lang == "vi"
    period_labels = PERIOD_LABELS_VI if is_vi else PERIOD_LABELS_EN
    label = period_labels.get(plan["period"], plan["period"])

    header = f"📊 **Thống kê website — {label}** (UTC)" if is_vi else f"📊 **Website Analytics — {label}** (UTC)"
    body = build_short_lines(data, plan["scopes"], lang=lang)
    insights = llm_insights(data, question, lang=lang) if body else []
    actions = suggest_actions(data, lang=lang)

    parts = [header, ""] + body
    if insights:
        ins_header = "💡 Nhận xét:" if is_vi else "💡 Key Insights:"
        parts += ["", ins_header] + [f"• {i}" for i in insights]
    if actions:
        act_header = "👉 Nên làm tiếp:" if is_vi else "👉 Recommended Actions:"
        parts += ["", act_header] + [f"• {a}" for a in actions]
    scope_arg = "" if "overview" in plan["scopes"] else f" {plan['scopes'][0]}"
    cta = (
        f"📄 Cần báo cáo chi tiết (bảng đầy đủ + biểu đồ + file .md)? Gõ `/stats_report{scope_arg} {plan['period']}`"
        if is_vi else
        f"📄 Need a detailed report (full tables + charts + .md file)? Type `/stats_report{scope_arg} {plan['period']}`"
    )
    parts += ["", cta]
    return {"text": "\n".join(parts), "plan": plan, "data": data, "lang": lang}


# ----------------------------------------------------------------------------
# Detailed report (Markdown + optional charts)
# ----------------------------------------------------------------------------

def _table(headers: List[str], rows: List[List[Any]], lang: str = "en") -> List[str]:
    if not rows:
        return ["_Không có dữ liệu._" if lang == "vi" else "_No data._", ""]
    out = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    for r in rows:
        out.append("| " + " | ".join(str(x).replace("|", "/") for x in r) + " |")
    return out + [""]


def _md_traffic(t: Dict[str, Any], lang: str = "en") -> List[str]:
    is_vi = lang == "vi"
    c, p = t["counts"], t["prev_counts"]
    md = [
        "## Traffic & hành vi" if is_vi else "## Traffic & Behavior",
        f"_Khoảng thời gian: {t['window']['start']} → {t['window']['end']} (UTC)_" if is_vi else f"_Window: {t['window']['start']} → {t['window']['end']} (UTC)_",
        "",
    ]
    md += _table(
        ["Chỉ số", "Kỳ này", "Kỳ trước", "Thay đổi"] if is_vi else ["Metric", "Current", "Previous", "Change"],
        [
            ["Page views", _n(c["page_view"]), _n(p["page_view"]), _delta(c["page_view"], p["page_view"], lang=lang) or "—"],
            ["Sessions", _n(t["sessions"]), _n(t["prev_sessions"]), _delta(t["sessions"], t["prev_sessions"], lang=lang) or "—"],
            ["Tìm kiếm" if is_vi else "Searches", _n(c["search_query"]), _n(p["search_query"]), _delta(c["search_query"], p["search_query"], lang=lang) or "—"],
            ["Click clinic (mọi loại)" if is_vi else "Clinic clicks (all)", _n(c["clinic_click"]), _n(p["clinic_click"]), _delta(c["clinic_click"], p["clinic_click"], lang=lang) or "—"],
            ["Bắt đầu claim" if is_vi else "Claim starts", _n(c["claim_start"]), _n(p["claim_start"]), _delta(c["claim_start"], p["claim_start"], lang=lang) or "—"],
        ],
        lang=lang,
    )
    if t["views_per_session"]:
        md.append(
            f"Trang/phiên: **{t['views_per_session']}** · độ phủ session_id: {t['session_coverage']}% số page view."
            if is_vi else
            f"Pages/session: **{t['views_per_session']}** · session_id coverage: {t['session_coverage']}% of page views."
        )
        md.append("")
    f = t["funnel"]
    md += ["### Phễu" if is_vi else "### Funnel", ""] + _table(
        ["Bước", "Số lượng"] if is_vi else ["Step", "Count"],
        [
            ["Xem trang /search" if is_vi else "View /search", _n(f["search_page_views"])],
            ["Lượt tìm kiếm" if is_vi else "Searches", _n(f["searches"])],
            ["Xem hồ sơ clinic" if is_vi else "Clinic profile views", _n(f["clinic_page_views"])],
            ["Liên hệ clinic (call/website/directions/booking/email)" if is_vi else "Clinic contacts (call/website/directions/booking/email)", _n(f["contact_clicks"])],
            ["Bắt đầu claim" if is_vi else "Claim starts", _n(f["claim_start"])],
        ],
        lang=lang,
    )
    md += ["### Top trang" if is_vi else "### Top Pages", ""] + _table(["Trang" if is_vi else "Page", "Views"], [[a, b] for a, b in t["top_pages"]], lang=lang)
    md += ["### Từ khóa tìm kiếm" if is_vi else "### Search Queries", ""] + _table(["Từ khóa" if is_vi else "Query", "Lượt" if is_vi else "Count"], [[a, b] for a, b in t["top_queries"]], lang=lang)
    if t["zero_result_queries"]:
        md += [f"### Tìm không ra kết quả ({t['zero_result_rate']}%)" if is_vi else f"### Zero-Result Queries ({t['zero_result_rate']}%)", ""] + _table(["Từ khóa" if is_vi else "Query", "Lượt" if is_vi else "Count"], [[a, b] for a, b in t["zero_result_queries"]], lang=lang)
    md += ["### Clinic được liên hệ nhiều nhất" if is_vi else "### Most Contacted Clinics", ""] + _table(["Clinic", "Lượt liên hệ" if is_vi else "Contacts"], [[a, b] for a, b in t["top_clicked_clinics"]], lang=lang)
    md += ["### Hành động liên hệ" if is_vi else "### Contact Actions", ""] + _table(["Loại" if is_vi else "Action", "Lượt" if is_vi else "Count"], [[k, v] for k, v in sorted(t["click_actions"].items(), key=lambda kv: -kv[1])], lang=lang)
    md += ["### Nguồn, thiết bị, vị trí" if is_vi else "### Referrers, Devices & Locations", ""]
    md += _table(["Nguồn giới thiệu" if is_vi else "Referrer", "Views"], [[a, b] for a, b in t["referrers"]], lang=lang)
    md += _table(["Thiết bị" if is_vi else "Device", "Views"], [[k, v] for k, v in t["devices"].items()], lang=lang)
    md += _table(["Quốc gia" if is_vi else "Country", "Views"], [[a, b] for a, b in t["countries"]], lang=lang)
    md += _table(["Thành phố" if is_vi else "City", "Views"], [[a, b] for a, b in t["cities"]], lang=lang)
    if t["small_sample"]:
        md += [f"> ⚠️ Mẫu nhỏ ({_n(c['page_view'])} views): chưa đủ để kết luận xu hướng." if is_vi else f"> ⚠️ Small sample ({_n(c['page_view'])} views): trends are directional only.", ""]
    return md


def _md_posts(p: Dict[str, Any], lang: str = "en") -> List[str]:
    is_vi = lang == "vi"
    md = ["## Bài viết (Insights/Guides)" if is_vi else "## Articles (Insights/Guides)", ""]
    md += _table(
        ["Chỉ số", "Giá trị"] if is_vi else ["Metric", "Value"],
        [
            ["Tổng" if is_vi else "Total", p["total"]], ["Published", p["published"]], ["Theo trạng thái" if is_vi else "By status", p["by_status"]],
            ["Mới 7 ngày" if is_vi else "New 7d", p["new_7d"]], ["Mới 30 ngày" if is_vi else "New 30d", p["new_30d"]], ["Số từ trung bình" if is_vi else "Avg word count", p["avg_words"]],
            ["Loại nội dung" if is_vi else "Content modes", p["content_modes"]],
        ],
        lang=lang,
    )
    md += ["### Danh mục" if is_vi else "### Categories", ""] + _table(["Danh mục" if is_vi else "Category", "Bài" if is_vi else "Articles"], [[a, b] for a, b in p["categories"]], lang=lang)
    md += ["### Top bài theo views" if is_vi else "### Top Articles by Views", ""] + _table(["Bài" if is_vi else "Article", "Views"], [[x["title"], x["views"]] for x in p["top_posts"]], lang=lang)
    md += ["### Vấn đề SEO của bài" if is_vi else "### Article SEO Issues", ""] + _table(
        ["Vấn đề", "Số bài", "Ví dụ"] if is_vi else ["Issue", "Count", "Examples"],
        [
            ["Thiếu description" if is_vi else "Missing description", len(p["missing_description"]), ", ".join(map(str, p["missing_description"][:3]))],
            ["Thiếu og_image" if is_vi else "Missing og_image", len(p["missing_og_image"]), ", ".join(map(str, p["missing_og_image"][:3]))],
            ["Chưa có primary keyword" if is_vi else "Missing primary keyword", len(p["missing_primary_keyword"]), ", ".join(map(str, p["missing_primary_keyword"][:3]))],
            ["Ít hơn 3 ảnh" if is_vi else "Fewer than 3 images", len(p["fewer_than_3_images"]), ", ".join(map(str, p["fewer_than_3_images"][:3]))],
        ],
        lang=lang,
    )
    if p["published_without_views"]:
        md += ["### Bài >14 ngày chưa có view" if is_vi else "### Articles >14d Without Views", ""] + _table(["Bài" if is_vi else "Article", "Tuổi (ngày)" if is_vi else "Age (days)"], [[x["title"], x["age_days"]] for x in p["published_without_views"]], lang=lang)
    return md


def _md_clinics(c: Dict[str, Any], lang: str = "en") -> List[str]:
    is_vi = lang == "vi"
    m = c["missing_pct"]
    md = ["## Danh bạ clinic" if is_vi else "## Clinic Directory", ""]
    md += _table(
        ["Chỉ số", "Giá trị"] if is_vi else ["Metric", "Value"],
        [
            ["Tổng clinic" if is_vi else "Total clinics", c["total"]], ["Mới 7 / 30 ngày" if is_vi else "New 7d / 30d", f"{c['new_7d']} / {c['new_30d']}"],
            ["Đã claim" if is_vi else "Claimed", c["claimed"]], ["Có telehealth" if is_vi else "Telehealth", c["telehealth"]],
            ["Điểm chất lượng TB" if is_vi else "Avg quality score", _n(c["avg_quality"])], ["Clinic dưới 70 điểm" if is_vi else "Clinics <70 score", c["below_70_count"]],
            ["Thiếu ảnh / bảo hiểm / giờ / bác sĩ" if is_vi else "Missing images / insurance / hours / doctors", f"{m['images']}% / {m['insurance']}% / {m['hours']}% / {m['doctors']}%"],
            ["Claims chờ duyệt" if is_vi else "Pending claims", _n(c.get("pending_claims"))], ["Submissions chờ duyệt" if is_vi else "Pending submissions", _n(c.get("pending_submissions"))],
            ["Newsletter (mới trong kỳ)" if is_vi else "Newsletter (new in period)", f"{_n(c.get('newsletter_subscribers'))} (+{c.get('newsletter_new_in_period') or 0})"],
        ],
        lang=lang,
    )
    md += ["### Chuyên khoa" if is_vi else "### Specialties", ""] + _table(["Chuyên khoa" if is_vi else "Specialty", "Clinic"], [[a, b] for a, b in c["specialties"]], lang=lang)
    md += ["### Thành phố" if is_vi else "### Cities", ""] + _table(["Thành phố" if is_vi else "City", "Clinic"], [[a, b] for a, b in c["cities"]], lang=lang)
    md += ["### Ngôn ngữ" if is_vi else "### Languages", ""] + _table(["Ngôn ngữ" if is_vi else "Language", "Clinic"], [[a, b] for a, b in c["languages"]], lang=lang)
    md += ["### Clinic điểm thấp nhất" if is_vi else "### Lowest Quality Clinics", ""] + _table(["Clinic", "Slug", "Điểm" if is_vi else "Score"], [[x["name"], x["slug"], x["score"]] for x in c["lowest_quality"]], lang=lang)
    md += ["### Khoảng trống nguồn cung" if is_vi else "### Supply Gaps", ""] + _table(
        ["Thành phố", "Ngôn ngữ", "Chuyên khoa", "Hiện có"] if is_vi else ["City", "Language", "Specialty", "Current Count"],
        [[f"{g['city']}, {g['state']}", g["language"], g["specialty"], g["count"]] for g in c["supply_gaps"]],
        lang=lang,
    )
    return md


def _md_seo(s: Dict[str, Any], g: Optional[Dict[str, Any]], lang: str = "en") -> List[str]:
    is_vi = lang == "vi"
    issue_labels = ISSUE_LABELS_VI if is_vi else ISSUE_LABELS_EN
    md = ["## SEO & trang" if is_vi else "## SEO & Pages", ""]
    if not s.get("ok"):
        md += [f"Audit nội bộ không chạy được: {s.get('error')}" if is_vi else f"Internal audit failed: {s.get('error')}", ""]
    else:
        md += _table(
            ["Chỉ số", "Giá trị"] if is_vi else ["Metric", "Value"],
            [
                ["Trang đã audit (mẫu)" if is_vi else "Sampled pages audited", s["pages_checked"]], ["Điểm sức khỏe" if is_vi else "Health score", f"{s['health_score']}/100"],
                ["Trang sạch (không lỗi)" if is_vi else "Clean pages (no issues)", s["pages_clean"]], ["Trang lỗi HTTP" if is_vi else "Broken HTTP pages", len(s["pages_broken"])],
                ["Title trùng / Description trùng" if is_vi else "Duplicate titles / descriptions", f"{s['duplicate_titles']} / {s['duplicate_descriptions']}"],
                ["Phản hồi TB" if is_vi else "Avg response time", f"{s.get('avg_ms')} ms"], ["robots.txt", "OK" if s.get("robots_ok") else ("Lỗi" if is_vi else "Error")],
                ["robots.txt có sitemap" if is_vi else "robots.txt has sitemap", ("Có" if is_vi else "Yes") if s.get("robots_has_sitemap") else ("Không" if is_vi else "No")],
                ["URL trong sitemap" if is_vi else "Sitemap URLs", s["sitemap_urls"]],
            ],
            lang=lang,
        )
        md += ["### Phân loại lỗi" if is_vi else "### Issue Breakdown", ""] + _table(
            ["Lỗi", "Số trang"] if is_vi else ["Issue", "Pages"],
            [[issue_labels.get(k, k), v] for k, v in sorted(s["issue_counts"].items(), key=lambda kv: -kv[1])],
            lang=lang,
        )
        md += ["### Trang có nhiều lỗi nhất" if is_vi else "### Pages with Most Issues", ""] + _table(
            ["Trang", "Lỗi"] if is_vi else ["Page", "Issues"],
            [[w["path"], ", ".join(issue_labels.get(i, i) for i in w["issues"])] for w in s["worst_pages"]],
            lang=lang,
        )
        if s["pages_broken"]:
            md += ["### Trang lỗi HTTP" if is_vi else "### Broken HTTP Pages", ""] + [f"- `{p}`" for p in s["pages_broken"]] + [""]
        md += ["### Trang chậm nhất" if is_vi else "### Slowest Pages", ""] + _table(["Trang" if is_vi else "Page", "ms"], [[x["path"], x["ms"]] for x in s["slowest"]], lang=lang)
        if s.get("coverage"):
            cov = s["coverage"]
            md += ["### Độ phủ sitemap" if is_vi else "### Sitemap Coverage", ""] + _table(
                ["Loại", "Trong DB", "Trong sitemap"] if is_vi else ["Type", "In DB", "In Sitemap"],
                [["Clinics", cov["clinics_in_db"], cov["clinics_in_sitemap"]], ["Bài viết" if is_vi else "Articles", cov["published_posts_in_db"], cov["posts_in_sitemap"]]],
                lang=lang,
            )
    md += ["### Dữ liệu từ Google" if is_vi else "### Google Search Console & GA4 Data", ""]
    if not g or not g.get("gsc_connected"):
        md += [
            "Chưa kết nối **Google Search Console** → chưa có impressions, CTR, vị trí từ khóa và trạng thái index thật. Gõ `/connect_gsc` để thêm."
            if is_vi else
            "**Google Search Console** is not connected → real impressions, CTR, keyword positions, and index status are unavailable. Type `/connect_gsc` to link.",
            "",
        ]
    elif g.get("gsc_error"):
        md += [f"GSC error: {g['gsc_error']}", ""]
    elif g.get("gsc"):
        gs = g["gsc"]
        t, pt = gs["totals"], gs["prev_totals"]
        md += [f"_Range: {gs['range']}_", ""]
        md += _table(
            ["Chỉ số", "Kỳ này", "Kỳ trước", "Thay đổi"] if is_vi else ["Metric", "Current", "Previous", "Change"],
            [
                ["Clicks", _n(t["clicks"]), _n(pt["clicks"]), _delta(t["clicks"], pt["clicks"], lang=lang) or "—"],
                ["Impressions", _n(t["impressions"]), _n(pt["impressions"]), _delta(t["impressions"], pt["impressions"], lang=lang) or "—"],
                ["CTR", f"{t['ctr']}%", f"{pt['ctr']}%", "—"],
                ["Vị trí TB" if is_vi else "Avg Position", t["position"], pt["position"], "—"],
            ],
            lang=lang,
        )
        md += ["#### Top từ khóa" if is_vi else "#### Top Queries", ""] + _table(["Từ khóa" if is_vi else "Query", "Clicks", "Impr.", "CTR %", "Vị trí" if is_vi else "Position"], [[q["key"], q["clicks"], q["impressions"], q["ctr"], q["position"]] for q in gs["top_queries"][:10]], lang=lang)
        md += ["#### Cơ hội: gần top 10" if is_vi else "#### Opportunities: Near Top 10", ""] + _table(["Từ khóa" if is_vi else "Query", "Vị trí" if is_vi else "Position", "Impr."], [[q["key"], q["position"], q["impressions"]] for q in gs["near_top10_queries"]], lang=lang)
        md += ["#### Trang nhiều impression nhưng CTR thấp" if is_vi else "#### High-Impression Low-CTR Pages", ""] + _table(["Trang" if is_vi else "Page", "Impr.", "CTR %", "Vị trí" if is_vi else "Position"], [[p["key"], p["impressions"], p["ctr"], p["position"]] for p in gs["low_ctr_pages"]], lang=lang)
    if g and g.get("ga4"):
        ga = g["ga4"]
        md += ["#### GA4", ""] + _table(["Kênh" if is_vi else "Channel", "Sessions"], [[c["channel"], c["sessions"]] for c in ga["channels"]], lang=lang)
    return md


def _make_charts(data: Dict[str, Any], stamp: str, lang: str = "en") -> List[str]:
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception:
        return []

    is_vi = lang == "vi"
    paths: List[str] = []
    t = data.get("traffic")
    if t and t["daily_views"]:
        fig, ax = plt.subplots(figsize=(8, 3.6))
        days, vals = list(t["daily_views"].keys()), list(t["daily_views"].values())
        ax.plot(days, vals, marker="o", color="#024E44")
        ax.fill_between(range(len(days)), vals, alpha=0.12, color="#024E44")
        ax.set_title("Page views theo ngày (UTC)" if is_vi else "Daily Page Views (UTC)")
        ax.set_xticks(range(len(days)))
        ax.set_xticklabels([d[5:] for d in days], rotation=45, ha="right", fontsize=8)
        ax.grid(alpha=0.25)
        fig.tight_layout()
        path = os.path.join(REPORTS_DIR, f"stats_{stamp}_views.png")
        fig.savefig(path, dpi=130)
        plt.close(fig)
        paths.append(path)

        f = t["funnel"]
        fig, ax = plt.subplots(figsize=(7, 3.4))
        labels = ["Xem /search", "Tìm kiếm", "Xem hồ sơ", "Liên hệ", "Claim"] if is_vi else ["View /search", "Searches", "Profile Views", "Contacts", "Claims"]
        values = [f["search_page_views"], f["searches"], f["clinic_page_views"], f["contact_clicks"], f["claim_start"]]
        ax.barh(labels[::-1], values[::-1], color="#7BA05B")
        ax.set_title("Phễu hành vi" if is_vi else "User Conversion Funnel")
        for i, v in enumerate(values[::-1]):
            ax.text(v, i, f" {v}", va="center", fontsize=8)
        fig.tight_layout()
        path = os.path.join(REPORTS_DIR, f"stats_{stamp}_funnel.png")
        fig.savefig(path, dpi=130)
        plt.close(fig)
        paths.append(path)
    return paths


def build_detailed_report(scopes: Optional[List[str]] = None, period: str = "week", lang: str = "en") -> Dict[str, Any]:
    is_vi = lang == "vi"
    scopes = [s for s in (scopes or ["overview", "seo"]) if s in VALID_SCOPES] or ["overview", "seo"]
    if "overview" in scopes and "seo" not in scopes:
        scopes = scopes + ["seo"]
    data = collect_data(scopes, period)
    os.makedirs(REPORTS_DIR, exist_ok=True)
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M")
    period_labels = PERIOD_LABELS_VI if is_vi else PERIOD_LABELS_EN

    md: List[str] = [
        "# Báo cáo thống kê Asian Health Hub" if is_vi else "# Asian Health Hub Analytics Report",
        (
            f"_Tạo lúc {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC · Kỳ: {period_labels.get(period, period)}_"
            if is_vi else
            f"_Generated at {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC · Period: {period_labels.get(period, period)}_"
        ),
        "",
    ]
    insights = llm_insights(data, "Tóm tắt báo cáo chi tiết" if is_vi else "Executive summary of detailed analytics report", lang=lang)
    if insights:
        md += ["## Tóm tắt nhanh" if is_vi else "## Executive Summary", ""] + [f"- {i}" for i in insights] + [""]
    if "traffic" in data:
        md += _md_traffic(data["traffic"], lang=lang)
    if "posts" in data:
        md += _md_posts(data["posts"], lang=lang)
    if "clinics" in data:
        md += _md_clinics(data["clinics"], lang=lang)
    if "seo" in data:
        md += _md_seo(data["seo"], data.get("google"), lang=lang)
    actions = suggest_actions(data, lang=lang)
    if actions:
        md += ["## Việc nên làm tiếp" if is_vi else "## Recommended Next Actions", ""] + [f"1. {a}" for a in actions] + [""]
    for key, err in (data.get("errors") or {}).items():
        md += [f"> ⚠️ Không lấy được `{key}`: {err}" if is_vi else f"> ⚠️ Could not fetch `{key}`: {err}"]

    path = os.path.join(REPORTS_DIR, f"stats_{stamp}.md")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(md))
    charts = _make_charts(data, stamp, lang=lang)
    return {
        "markdown_path": path,
        "chart_paths": charts,
        "charts_available": bool(charts),
        "summary": "\n".join(build_short_lines(data, scopes, lang=lang)[:10]),
    }


def parse_stats_args(arg_text: str) -> Tuple[List[str], str]:
    """Parse '/stats posts month' style arguments into (scopes, period)."""
    scopes: List[str] = []
    period = "week"
    for tok in (arg_text or "").lower().split():
        if tok in sm.PERIOD_DAYS:
            period = tok
        elif tok in ("day", "ngay", "ngày"):
            period = "today"
        elif tok in ("tuan", "tuần"):
            period = "week"
        elif tok in ("thang", "tháng"):
            period = "month"
        elif tok in ("post", "posts", "bai", "bài", "articles"):
            scopes.append("posts")
        elif tok in ("clinic", "clinics", "directory"):
            scopes.append("clinics")
        elif tok in ("traffic", "views", "view", "search", "searches"):
            scopes.append("traffic")
        elif tok in ("seo", "pages", "page"):
            scopes.append("seo")
        elif tok in VALID_SCOPES:
            scopes.append(tok)
    return (scopes or ["overview"]), period


# ----------------------------------------------------------------------------
# Anomaly detection
# ----------------------------------------------------------------------------

def check_anomalies(lang: str = "en") -> Dict[str, Any]:
    """Detect anomalies across traffic, content, SEO, and operations."""
    is_vi = lang == "vi"
    anomalies: List[Dict[str, str]] = []

    # 1. Traffic check
    try:
        t_week = sm.metric_traffic("week")
        t_today = sm.metric_traffic("today")
        week_views = (t_week.get("counts") or {}).get("page_view", 0)
        today_views = (t_today.get("counts") or {}).get("page_view", 0)
        daily_avg = week_views / 7.0

        # If we have daily traffic history and today is unusually quiet after midday UTC
        current_hour = datetime.utcnow().hour
        if daily_avg >= 10 and current_hour >= 14 and today_views < (daily_avg * 0.25):
            anomalies.append({
                "level": "WARNING",
                "scope": "traffic",
                "message": (
                    f"Lưu lượng hôm nay sụt giảm bất thường: mới có {today_views} views (trung bình 7 ngày qua là {daily_avg:.1f} views/ngày)."
                    if is_vi else
                    f"Unusual traffic drop today: only {today_views} views so far (7-day average is {daily_avg:.1f} views/day)."
                ),
            })

        # Zero-result searches
        zero_pct = t_week.get("zero_result_rate") or 0.0
        total_searches = (t_week.get("counts") or {}).get("search_query", 0)
        if total_searches >= 5 and zero_pct >= 40.0:
            anomalies.append({
                "level": "WARNING",
                "scope": "search",
                "message": (
                    f"Tỷ lệ tìm kiếm không có kết quả cao ({zero_pct:.1f}% trên tổng {total_searches} lượt tìm kiếm tuần qua). Cần bổ sung phòng khám hoặc từ khóa đồng nghĩa."
                    if is_vi else
                    f"High zero-result search rate ({zero_pct:.1f}% across {total_searches} searches in the past 7 days). Consider adding clinics or search synonyms."
                ),
            })
    except Exception:
        pass

    # 2. SEO / Broken pages check
    try:
        seo_res = sm.metric_seo_internal(sample=15)
        if seo_res.get("ok"):
            bad_routes = seo_res.get("pages_broken") or []
            if bad_routes:
                detail = {d["path"]: d for d in (seo_res.get("pages_broken_detail") or [])}

                def _why(route: str) -> str:
                    info = detail.get(route) or {}
                    status = info.get("status")
                    return f"{route} ({status if status else 'no response: ' + (info.get('error') or 'timeout')[:40]})"

                samples = ", ".join([f"`{_why(r)}`" for r in bad_routes[:3]])
                anomalies.append({
                    "level": "CRITICAL",
                    "scope": "seo",
                    "message": (
                        f"Phát hiện {len(bad_routes)} trang bị lỗi HTTP: {samples}"
                        if is_vi else
                        f"Detected {len(bad_routes)} pages returning HTTP errors: {samples}"
                    ),
                })
            if not seo_res.get("sitemap_ok"):
                anomalies.append({
                    "level": "WARNING",
                    "scope": "seo",
                    "message": (
                        "Không tìm thấy file sitemap.xml tại URL chuẩn của website."
                        if is_vi else
                        "Could not reach sitemap.xml at the standard website URL."
                    ),
                })
    except Exception:
        pass

    # 3. Operations & Clinics
    try:
        c_res = sm.metric_clinics("week")
        pending_claims = c_res.get("pending_claims") or 0
        if pending_claims > 0:
            anomalies.append({
                "level": "INFO",
                "scope": "claims",
                "message": (
                    f"Có {pending_claims} yêu cầu claim phòng khám đang chờ duyệt (`/check_claims`)."
                    if is_vi else
                    f"{pending_claims} clinic claim request(s) pending review (`/check_claims`)."
                ),
            })

        missing_hours_pct = (c_res.get("missing_pct") or {}).get("hours") or 0
        total_clinics = c_res.get("total") or 0
        if total_clinics > 0 and missing_hours_pct > 60:
            anomalies.append({
                "level": "INFO",
                "scope": "clinics",
                "message": (
                    f"{missing_hours_pct}% phòng khám (trên tổng {total_clinics}) còn thiếu giờ làm việc. Cần enrich thêm từ Google Places."
                    if is_vi else
                    f"{missing_hours_pct}% of clinics (out of {total_clinics}) are missing opening hours. Consider enriching via Google Places."
                ),
            })
    except Exception:
        pass

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "has_anomalies": any(a["level"] in ("CRITICAL", "WARNING") for a in anomalies),
        "total_items": len(anomalies),
        "anomalies": anomalies,
    }


def format_anomalies_report(anomalies_data: Dict[str, Any], lang: str = "en") -> str:
    anomalies = anomalies_data.get("anomalies", [])
    is_vi = lang == "vi"
    if not anomalies:
        return (
            "✅ **All systems normal**: No anomalies detected in traffic, sitemaps, HTTP responses, or queues."
            if not is_vi else
            "✅ **Hệ thống hoạt động bình thường**: Không phát hiện bất thường nào về traffic, sitemap, HTTP status hay hàng đợi xử lý."
        )

    title = (
        f"🚨 **Detected {len(anomalies)} anomalies on the website:**"
        if not is_vi else
        f"🚨 **Phát hiện {len(anomalies)} cảnh báo bất thường trên website:**"
    )
    lines = [title, ""]
    for item in anomalies:
        lvl = item.get("level", "WARNING")
        icon = "🔴" if lvl == "CRITICAL" else ("🟡" if lvl == "WARNING" else "ℹ️")
        lines.append(f"{icon} [{lvl}] **{item.get('scope', '').upper()}**: {item.get('message')}")

    lines.append("")
    cta = (
        "💡 Type `/stats` for details or `/stats_report` for full report."
        if not is_vi else
        "💡 Gõ `/stats` để xem thống kê chi tiết hoặc `/stats_report` để xuất toàn bộ báo cáo."
    )
    lines.append(cta)
    return "\n".join(lines)



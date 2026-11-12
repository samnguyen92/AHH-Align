"""
stats_metrics.py — Read-only metric registry for the Website Stats Analyst Agent.

Every function returns plain, structured dicts (never prints) so that:
  * numbers are computed deterministically in Python (the LLM never invents figures),
  * the same data can feed a short Telegram answer, a detailed report, charts and alerts.

Sources: Supabase (`analytics_events`, `articles`, `clinics`, claims, newsletter) and the
running website itself (sitemap.xml / robots.txt / sampled page HTML for internal SEO audit).
Nothing here writes to any database.
"""

from __future__ import annotations

import os
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

from dotenv import load_dotenv

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(_OPENCLAW_DIR, "..", ".env.local"))

PERIOD_DAYS = {"today": 1, "week": 7, "month": 30, "quarter": 90}
PERIOD_LABELS = {
    "today": "Hôm nay (từ 00:00 UTC)",
    "week": "7 ngày qua",
    "month": "30 ngày qua",
    "quarter": "90 ngày qua",
}
SMALL_SAMPLE_VIEWS = 100
EXCLUDED_PATH_PREFIXES = ("/admin", "/api", "/dashboard")


# ----------------------------------------------------------------------------
# Infrastructure helpers
# ----------------------------------------------------------------------------

def _sb():
    try:
        from supabase import create_client
    except (ImportError, AttributeError):
        import sys
        if "supabase" in sys.modules and getattr(sys.modules["supabase"], "__file__", None) is None:
            del sys.modules["supabase"]
            orig_path = list(sys.path)
            sys.path = [p for p in sys.path if not os.path.isdir(os.path.join(p or ".", "supabase")) or os.path.isfile(os.path.join(p or ".", "supabase", "__init__.py"))]
            try:
                from supabase import create_client
            finally:
                sys.path = orig_path
        else:
            raise

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.")
    return create_client(url, key)


def _fetch_all(
    table: str,
    columns: str,
    apply: Optional[Callable[[Any], Any]] = None,
    page_size: int = 1000,
    cap: int = 50000,
) -> List[Dict[str, Any]]:
    """Paginate through a table so counts are not silently truncated at 1000 rows."""
    sb = _sb()
    rows: List[Dict[str, Any]] = []
    start = 0
    while start < cap:
        query = sb.table(table).select(columns)
        if apply:
            query = apply(query)
        data = query.range(start, start + page_size - 1).execute().data or []
        rows.extend(data)
        if len(data) < page_size:
            break
        start += page_size
    return rows


_TS_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?")


def parse_ts(value: Any) -> Optional[datetime]:
    """Parse Supabase timestamps (naive UTC). Works on Python 3.9 (no fromisoformat quirks)."""
    if not value or not isinstance(value, str):
        return None
    m = _TS_RE.match(value)
    if not m:
        return None
    try:
        return datetime.strptime(f"{m.group(1)} {m.group(2)}", "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def resolve_period(period: str = "week", now: Optional[datetime] = None) -> Dict[str, Any]:
    period = (period or "week").strip().lower()
    if period not in PERIOD_DAYS:
        period = "week"
    now = now or datetime.utcnow()
    if period == "today":
        start = datetime(now.year, now.month, now.day)
        prev_start = start - timedelta(days=1)
        prev_end = now - timedelta(days=1)
    else:
        span = timedelta(days=PERIOD_DAYS[period])
        start = now - span
        prev_start = start - span
        prev_end = start
    return {
        "period": period,
        "label": PERIOD_LABELS[period],
        "start": start,
        "end": now,
        "prev_start": prev_start,
        "prev_end": prev_end,
    }


def pct_change(current: float, previous: float) -> Optional[float]:
    if previous in (0, None):
        return None
    return round((current - previous) * 100.0 / previous, 1)


def fetch_events(start: datetime, end: datetime) -> List[Dict[str, Any]]:
    def apply(q):
        return (
            q.gte("created_at", start.isoformat())
            .lt("created_at", end.isoformat())
            .order("created_at", desc=False)
        )

    rows = _fetch_all("analytics_events", "event_name,path,metadata,created_at", apply)
    clean = []
    for r in rows:
        path = r.get("path") or ""
        if path.startswith(EXCLUDED_PATH_PREFIXES):
            continue
        meta = r.get("metadata") or {}
        if meta.get("is_bot"):
            continue
        clean.append(r)
    return clean


# ----------------------------------------------------------------------------
# Traffic
# ----------------------------------------------------------------------------

def _count_events(events: List[Dict[str, Any]]) -> Dict[str, int]:
    counts = Counter(e.get("event_name") for e in events)
    return {
        "page_view": counts.get("page_view", 0),
        "search_query": counts.get("search_query", 0),
        "clinic_click": counts.get("clinic_click", 0),
        "claim_start": counts.get("claim_start", 0),
    }


def _slug_after(path: str, prefix: str) -> Optional[str]:
    if path.startswith(prefix):
        slug = path[len(prefix):].split("/")[0].split("?")[0]
        return slug or None
    return None


def summarize_events(
    cur: List[Dict[str, Any]],
    prev: List[Dict[str, Any]],
) -> Dict[str, Any]:
    cur_counts = _count_events(cur)
    prev_counts = _count_events(prev)

    page_views = [e for e in cur if e.get("event_name") == "page_view"]
    sessions = set()
    with_sid = 0
    for e in page_views:
        sid = (e.get("metadata") or {}).get("session_id")
        if sid and sid != "no-storage":
            sessions.add(sid)
            with_sid += 1
    prev_sessions = set()
    for e in prev:
        if e.get("event_name") == "page_view":
            sid = (e.get("metadata") or {}).get("session_id")
            if sid and sid != "no-storage":
                prev_sessions.add(sid)

    top_pages = Counter(e.get("path") for e in page_views if e.get("path"))
    post_views = Counter()
    clinic_views = Counter()
    for e in page_views:
        p = e.get("path") or ""
        s = _slug_after(p, "/insights/")
        if s:
            post_views[s] += 1
        c = _slug_after(p, "/clinics/")
        if c:
            clinic_views[c] += 1

    daily = Counter()
    for e in page_views:
        ts = parse_ts(e.get("created_at"))
        if ts:
            daily[ts.strftime("%Y-%m-%d")] += 1

    searches = [e for e in cur if e.get("event_name") == "search_query"]
    query_counts = Counter()
    zero_queries = Counter()
    known = 0
    zero = 0
    for e in searches:
        meta = e.get("metadata") or {}
        q = str(meta.get("query") or "").strip().lower()
        if q:
            query_counts[q] += 1
        rc = meta.get("result_count")
        if isinstance(rc, int):
            known += 1
            if rc == 0:
                zero += 1
                if q:
                    zero_queries[q] += 1

    clicks = [e for e in cur if e.get("event_name") == "clinic_click"]
    click_actions = Counter((e.get("metadata") or {}).get("action") or "unknown" for e in clicks)
    clinic_clicks = Counter()
    for e in clicks:
        meta = e.get("metadata") or {}
        action = meta.get("action")
        if action == "card":
            continue
        name = meta.get("clinic_name") or meta.get("clinic_slug")
        if name:
            clinic_clicks[str(name)] += 1
    contact_clicks = sum(v for k, v in click_actions.items() if k != "card")

    referrers = Counter(
        (e.get("metadata") or {}).get("referrer") or "(direct)" for e in page_views
    )
    devices = Counter((e.get("metadata") or {}).get("device") for e in page_views if (e.get("metadata") or {}).get("device"))
    countries = Counter((e.get("metadata") or {}).get("geo_country") for e in page_views if (e.get("metadata") or {}).get("geo_country"))
    cities = Counter((e.get("metadata") or {}).get("geo_city") for e in page_views if (e.get("metadata") or {}).get("geo_city"))
    utm_sources = Counter((e.get("metadata") or {}).get("utm_source") for e in page_views if (e.get("metadata") or {}).get("utm_source"))

    search_page_views = sum(1 for e in page_views if (e.get("path") or "").startswith("/search"))
    clinic_page_views = sum(clinic_views.values())

    return {
        "counts": cur_counts,
        "prev_counts": prev_counts,
        "sessions": len(sessions) if sessions else None,
        "prev_sessions": len(prev_sessions) if prev_sessions else None,
        "session_coverage": round(with_sid * 100.0 / len(page_views), 1) if page_views else 0.0,
        "views_per_session": round(len(page_views) / len(sessions), 2) if sessions else None,
        "daily_views": dict(sorted(daily.items())),
        "top_pages": top_pages.most_common(8),
        "post_views": dict(post_views),
        "clinic_views": dict(clinic_views),
        "top_queries": query_counts.most_common(8),
        "searches_with_result_count": known,
        "zero_result_searches": zero,
        "zero_result_rate": round(zero * 100.0 / known, 1) if known else None,
        "zero_result_queries": zero_queries.most_common(8),
        "click_actions": dict(click_actions),
        "contact_clicks": contact_clicks,
        "top_clicked_clinics": clinic_clicks.most_common(8),
        "referrers": referrers.most_common(6),
        "devices": dict(devices),
        "countries": countries.most_common(5),
        "cities": cities.most_common(5),
        "utm_sources": utm_sources.most_common(5),
        "funnel": {
            "search_page_views": search_page_views,
            "searches": cur_counts["search_query"],
            "clinic_page_views": clinic_page_views,
            "contact_clicks": contact_clicks,
            "claim_start": cur_counts["claim_start"],
        },
        "small_sample": cur_counts["page_view"] < SMALL_SAMPLE_VIEWS,
    }


def metric_traffic(period: str = "week") -> Dict[str, Any]:
    w = resolve_period(period)
    cur = fetch_events(w["start"], w["end"])
    prev = fetch_events(w["prev_start"], w["prev_end"])
    out = summarize_events(cur, prev)
    out["window"] = {
        "period": w["period"],
        "label": w["label"],
        "start": w["start"].strftime("%Y-%m-%d %H:%M"),
        "end": w["end"].strftime("%Y-%m-%d %H:%M"),
    }
    return out


# ----------------------------------------------------------------------------
# Posts (articles)
# ----------------------------------------------------------------------------

def _word_count(text: Optional[str]) -> int:
    return len(re.findall(r"\w+", text or ""))


def metric_posts(traffic: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    rows = _fetch_all(
        "articles",
        "id,slug,title,status,category,excerpt,content,seo_meta,published_at,created_at,updated_at",
        lambda q: q.order("created_at", desc=True),
    )
    now = datetime.utcnow()
    by_status = Counter(r.get("status") or "unknown" for r in rows)
    published = [r for r in rows if r.get("status") == "published"]

    def when(r: Dict[str, Any]) -> Optional[datetime]:
        return parse_ts(r.get("published_at")) or parse_ts(r.get("created_at"))

    new_7 = sum(1 for r in published if (when(r) or datetime.min) >= now - timedelta(days=7))
    new_30 = sum(1 for r in published if (when(r) or datetime.min) >= now - timedelta(days=30))
    categories = Counter((r.get("category") or "Uncategorized") for r in published)
    modes = Counter(((r.get("seo_meta") or {}).get("content_mode") or "insight") for r in published)

    words = [_word_count(r.get("content")) for r in published]
    avg_words = int(sum(words) / len(words)) if words else 0

    missing_desc, missing_og, missing_kw, few_images = [], [], [], []
    for r in published:
        seo = r.get("seo_meta") or {}
        label = r.get("slug") or r.get("title")
        if not (seo.get("description") or r.get("excerpt")):
            missing_desc.append(label)
        if not seo.get("og_image"):
            missing_og.append(label)
        if not seo.get("primary_keyword"):
            missing_kw.append(label)
        if len(seo.get("images") or []) < 3:
            few_images.append(label)

    post_views = (traffic or {}).get("post_views") or {}
    title_by_slug = {r.get("slug"): r.get("title") for r in rows}
    ranked = sorted(post_views.items(), key=lambda kv: kv[1], reverse=True)
    top_posts = [
        {"slug": s, "title": title_by_slug.get(s) or s, "views": v} for s, v in ranked[:5]
    ]

    stale_no_views = []
    for r in published:
        age = (now - (when(r) or now)).days
        if age >= 14 and post_views.get(r.get("slug"), 0) == 0:
            stale_no_views.append({"slug": r.get("slug"), "title": r.get("title"), "age_days": age})

    return {
        "total": len(rows),
        "published": len(published),
        "by_status": dict(by_status),
        "new_7d": new_7,
        "new_30d": new_30,
        "categories": categories.most_common(6),
        "content_modes": dict(modes),
        "avg_words": avg_words,
        "missing_description": missing_desc,
        "missing_og_image": missing_og,
        "missing_primary_keyword": missing_kw,
        "fewer_than_3_images": few_images,
        "top_posts": top_posts,
        "published_without_views": stale_no_views[:10],
        "published_without_views_count": len(stale_no_views),
        "views_known": bool(post_views) or bool(traffic),
    }


# ----------------------------------------------------------------------------
# Clinics / directory
# ----------------------------------------------------------------------------

def _pct(part: int, whole: int) -> float:
    return round(part * 100.0 / whole, 1) if whole else 0.0


def metric_clinics(period: str = "week") -> Dict[str, Any]:
    rows = _fetch_all(
        "clinics",
        "id,slug,name,city,state,specialty,languages,is_claimed,is_telehealth_available,created_at,metadata",
        lambda q: q.order("created_at", desc=True),
    )
    now = datetime.utcnow()
    total = len(rows)
    new_7 = sum(1 for r in rows if (parse_ts(r.get("created_at")) or datetime.min) >= now - timedelta(days=7))
    new_30 = sum(1 for r in rows if (parse_ts(r.get("created_at")) or datetime.min) >= now - timedelta(days=30))

    specialties = Counter((r.get("specialty") or "Unknown") for r in rows)
    cities = Counter(
        f"{r.get('city')}, {r.get('state')}" for r in rows if r.get("city") and r.get("state")
    )
    languages = Counter()
    for r in rows:
        for lang in r.get("languages") or []:
            languages[str(lang)] += 1

    scores, low_quality = [], []
    no_images = no_insurance = no_hours = no_doctors = 0
    for r in rows:
        meta = r.get("metadata") or {}
        score = meta.get("quality_score")
        if isinstance(score, (int, float)):
            scores.append(score)
            if score < 70:
                low_quality.append({"name": r.get("name"), "slug": r.get("slug"), "score": score})
        if not (meta.get("images") or meta.get("gallery_images")):
            no_images += 1
        if not (meta.get("insurance_accepted") or (meta.get("insurance") or {}).get("accepted_networks")):
            no_insurance += 1
        if not meta.get("working_hours"):
            no_hours += 1
        if not meta.get("team_members"):
            no_doctors += 1
    low_quality.sort(key=lambda x: x["score"])

    pending_claims = pending_submissions = subscribers = new_subscribers = None
    try:
        sb = _sb()
        pending_claims = sb.table("claim_requests").select("id", count="exact").eq("status", "pending").limit(1).execute().count
    except Exception:
        pass
    try:
        sb = _sb()
        pending_submissions = sb.table("clinic_submissions").select("id", count="exact").eq("status", "pending").limit(1).execute().count
    except Exception:
        pass
    try:
        sb = _sb()
        subscribers = sb.table("newsletter_subscriptions").select("id", count="exact").limit(1).execute().count
        w = resolve_period(period)
        new_subscribers = (
            sb.table("newsletter_subscriptions")
            .select("id", count="exact")
            .gte("created_at", w["start"].isoformat())
            .limit(1)
            .execute()
            .count
        )
    except Exception:
        pass

    gaps: List[Dict[str, Any]] = []
    try:
        from audit_directory import discover_directory_gaps

        gaps = discover_directory_gaps(limit=3)
    except Exception:
        pass

    return {
        "total": total,
        "new_7d": new_7,
        "new_30d": new_30,
        "specialties": specialties.most_common(6),
        "cities": cities.most_common(6),
        "languages": languages.most_common(6),
        "claimed": sum(1 for r in rows if r.get("is_claimed")),
        "telehealth": sum(1 for r in rows if r.get("is_telehealth_available")),
        "avg_quality": round(sum(scores) / len(scores), 1) if scores else None,
        "below_70_count": len(low_quality),
        "lowest_quality": low_quality[:5],
        "missing_pct": {
            "images": _pct(no_images, total),
            "insurance": _pct(no_insurance, total),
            "hours": _pct(no_hours, total),
            "doctors": _pct(no_doctors, total),
        },
        "pending_claims": pending_claims,
        "pending_submissions": pending_submissions,
        "newsletter_subscribers": subscribers,
        "newsletter_new_in_period": new_subscribers,
        "supply_gaps": [
            {"city": g["city"], "state": g["state"], "language": g["language"], "specialty": g["specialty"], "count": g["current_count"]}
            for g in gaps
        ],
    }


# ----------------------------------------------------------------------------
# Internal SEO audit (crawls the running site; works with or without GSC)
# ----------------------------------------------------------------------------

def _base_candidates() -> List[str]:
    cands = [
        os.environ.get("OPENCLAW_PREVIEW_BASE_URL", "").rstrip("/"),
        "http://localhost:3000",
        "http://web:3000",
        os.environ.get("NEXT_PUBLIC_SITE_URL", "").rstrip("/"),
    ]
    seen, out = set(), []
    for c in cands:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def _http_get(url: str, timeout: int = 15):
    import requests

    return requests.get(url, timeout=timeout, headers={"User-Agent": "OpenClaw-SEO-Auditor/1.0 (internal)"}, allow_redirects=True)


def _find_base() -> Optional[str]:
    for base in _base_candidates():
        try:
            if _http_get(f"{base}/robots.txt", timeout=8).status_code < 500:
                return base
        except Exception:
            continue
    return None


def _audit_page(base: str, path: str) -> Dict[str, Any]:
    from bs4 import BeautifulSoup
    import time

    url = f"{base}{path}"
    started = time.time()
    try:
        resp = _http_get(url)
    except Exception as exc:
        return {"path": path, "status": 0, "error": str(exc)[:80], "issues": ["unreachable"]}
    ms = int((time.time() - started) * 1000)
    issues: List[str] = []
    if resp.status_code != 200:
        return {"path": path, "status": resp.status_code, "ms": ms, "issues": [f"http_{resp.status_code}"]}

    soup = BeautifulSoup(resp.text, "html.parser")
    title = (soup.title.string or "").strip() if soup.title and soup.title.string else ""
    d = soup.find("meta", attrs={"name": "description"})
    desc = (d.get("content") or "").strip() if d else ""
    canon = soup.find("link", attrs={"rel": "canonical"})
    robots_meta = soup.find("meta", attrs={"name": "robots"})
    noindex = bool(robots_meta and "noindex" in (robots_meta.get("content") or "").lower())
    h1s = soup.find_all("h1")
    imgs = soup.find_all("img")
    no_alt = sum(1 for i in imgs if not (i.get("alt") or "").strip())
    jsonld = len(soup.find_all("script", attrs={"type": "application/ld+json"}))

    if not title:
        issues.append("missing_title")
    elif not 20 <= len(title) <= 70:
        issues.append("title_length")
    if not desc:
        issues.append("missing_description")
    elif not 70 <= len(desc) <= 175:
        issues.append("description_length")
    if len(h1s) != 1:
        issues.append("h1_count")
    if not canon:
        issues.append("missing_canonical")
    if jsonld < 1:
        issues.append("missing_jsonld")
    if noindex:
        issues.append("noindex")
    if imgs and no_alt:
        issues.append("images_missing_alt")

    return {
        "path": path,
        "status": 200,
        "ms": ms,
        "title": title,
        "description": desc,
        "h1_count": len(h1s),
        "jsonld": jsonld,
        "images": len(imgs),
        "images_missing_alt": no_alt,
        "noindex": noindex,
        "issues": issues,
    }


def _sample_paths(paths: List[str], limit: int) -> List[str]:
    static = [p for p in paths if not (p.startswith("/clinics/") or p.startswith("/insights/") or p.startswith("/care/"))]
    clinics = [p for p in paths if p.startswith("/clinics/")]
    posts = [p for p in paths if p.startswith("/insights/")]
    pseo = [p for p in paths if p.startswith("/care/")]
    chosen = list(static)

    def take(group: List[str], n: int) -> List[str]:
        if len(group) <= n:
            return group
        step = len(group) / float(n)
        return [group[int(i * step)] for i in range(n)]

    remaining = max(limit - len(chosen), 0)
    chosen += take(posts, max(remaining // 3, 1))
    chosen += take(clinics, max(remaining // 3, 1))
    chosen += take(pseo, max(remaining // 3, 1))
    seen, out = set(), []
    for p in chosen:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out[:limit]


def metric_seo_internal(sample: int = 40) -> Dict[str, Any]:
    base = _find_base()
    if not base:
        return {"ok": False, "error": "Không kết nối được website (localhost:3000 / web:3000) để audit."}

    result: Dict[str, Any] = {"ok": True, "base_url": base}

    try:
        robots = _http_get(f"{base}/robots.txt", timeout=8)
        result["robots_ok"] = robots.status_code == 200
        result["robots_has_sitemap"] = "sitemap" in robots.text.lower()
    except Exception:
        result["robots_ok"] = False
        result["robots_has_sitemap"] = False

    paths: List[str] = []
    try:
        sm = _http_get(f"{base}/sitemap.xml", timeout=20)
        result["sitemap_ok"] = sm.status_code == 200
        if sm.status_code == 200:
            for loc in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", sm.text):
                m = re.match(r"https?://[^/]+(/.*)?$", loc)
                paths.append((m.group(1) if m and m.group(1) else "/"))
    except Exception:
        result["sitemap_ok"] = False
    result["sitemap_urls"] = len(paths)
    result["sitemap_by_type"] = {
        "clinics": sum(1 for p in paths if p.startswith("/clinics/")),
        "insights": sum(1 for p in paths if p.startswith("/insights/")),
        "local_pages": sum(1 for p in paths if p.startswith("/care/")),
        "other": sum(1 for p in paths if not p.startswith(("/clinics/", "/insights/", "/care/"))),
    }

    try:
        clinics_db = _sb().table("clinics").select("id", count="exact").limit(1).execute().count or 0
        posts_db = _sb().table("articles").select("id", count="exact").eq("status", "published").limit(1).execute().count or 0
        result["coverage"] = {
            "clinics_in_db": clinics_db,
            "clinics_in_sitemap": result["sitemap_by_type"]["clinics"],
            "published_posts_in_db": posts_db,
            "posts_in_sitemap": result["sitemap_by_type"]["insights"],
        }
    except Exception:
        result["coverage"] = None

    targets = _sample_paths(paths or ["/", "/search", "/insights", "/claim"], sample)
    with ThreadPoolExecutor(max_workers=8) as pool:
        pages = list(pool.map(lambda p: _audit_page(base, p), targets))

    issue_counts: Counter = Counter()
    for p in pages:
        for i in p["issues"]:
            issue_counts[i] += 1

    titles = Counter(p.get("title") for p in pages if p.get("title"))
    descs = Counter(p.get("description") for p in pages if p.get("description"))
    dup_titles = sum(1 for t, c in titles.items() if c > 1)
    dup_descs = sum(1 for t, c in descs.items() if c > 1)

    ok_pages = [p for p in pages if p["status"] == 200]
    clean = sum(1 for p in ok_pages if not p["issues"])
    worst = sorted(pages, key=lambda p: len(p["issues"]), reverse=True)
    worst = [p for p in worst if p["issues"]][:8]
    slowest = sorted(ok_pages, key=lambda p: p.get("ms", 0), reverse=True)[:3]

    result.update(
        {
            "pages_checked": len(pages),
            "pages_ok": len(ok_pages),
            "pages_broken": [p["path"] for p in pages if p["status"] != 200],
            "pages_clean": clean,
            "issue_counts": dict(issue_counts),
            "duplicate_titles": dup_titles,
            "duplicate_descriptions": dup_descs,
            "avg_ms": int(sum(p.get("ms", 0) for p in ok_pages) / len(ok_pages)) if ok_pages else None,
            "slowest": [{"path": p["path"], "ms": p.get("ms")} for p in slowest],
            "worst_pages": [{"path": p["path"], "issues": p["issues"]} for p in worst],
            "health_score": round(clean * 100.0 / len(pages)) if pages else 0,
        }
    )
    return result


# ----------------------------------------------------------------------------
# Convenience
# ----------------------------------------------------------------------------

def metric_overview(period: str = "week") -> Dict[str, Any]:
    traffic = metric_traffic(period)
    return {
        "traffic": traffic,
        "posts": metric_posts(traffic),
        "clinics": metric_clinics(period),
    }


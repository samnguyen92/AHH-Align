"""
gsc_client.py — Optional Google Search Console (GSC) and Google Analytics 4 (GA4) connector.

Design:
  * Fully optional. When not configured, the stats agent says so and offers `/connect_gsc` /
    `/connect_ga4`; internal audit data is still reported.
  * Auth uses a Google *service account* (read-only scopes). The JSON key is a secret, so it is
    NEVER accepted through chat: it must be placed on the server at
    `openclaw/secrets/google_service_account.json` (or referenced by GOOGLE_SERVICE_ACCOUNT_FILE).
  * Only NON-secret identifiers can be saved from chat (GSC_SITE_URL, GA4_PROPERTY_ID), via a strict
    whitelist writer for `openclaw/.env`.
  * Uses plain REST through google-auth's AuthorizedSession (no heavy client library).
"""

from __future__ import annotations

import json
import os
import re
import urllib.parse
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(_OPENCLAW_DIR, ".env")
load_dotenv(ENV_PATH)
load_dotenv(os.path.join(_OPENCLAW_DIR, "..", ".env.local"))

DEFAULT_KEY_PATH = os.path.join(_OPENCLAW_DIR, "secrets", "google_service_account.json")
GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"

PERIOD_DAYS = {"today": 1, "week": 7, "month": 28, "quarter": 90}


# ----------------------------------------------------------------------------
# Credentials / status
# ----------------------------------------------------------------------------

def _key_path() -> str:
    return os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE") or DEFAULT_KEY_PATH


def _load_key_info() -> Optional[Dict[str, Any]]:
    inline = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    try:
        if inline:
            return json.loads(inline)
        path = _key_path()
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
    except Exception:
        return None
    return None


def service_account_email() -> Optional[str]:
    info = _load_key_info()
    return info.get("client_email") if info else None


def _session(scope: str):
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import AuthorizedSession
    except Exception as exc:  # pragma: no cover - depends on host packages
        raise RuntimeError("Thiếu thư viện `google-auth` (pip install google-auth).") from exc

    info = _load_key_info()
    if not info:
        raise RuntimeError("Chưa có file service account (openclaw/secrets/google_service_account.json).")
    creds = service_account.Credentials.from_service_account_info(info, scopes=[scope])
    return AuthorizedSession(creds)


def gsc_configured() -> bool:
    return bool(os.environ.get("GSC_SITE_URL")) and _load_key_info() is not None


def ga4_configured() -> bool:
    return bool(os.environ.get("GA4_PROPERTY_ID")) and _load_key_info() is not None


def get_status(verify: bool = False) -> Dict[str, Any]:
    """Connection state. With verify=True, makes a tiny live API call for each configured service."""
    status: Dict[str, Any] = {
        "key_file_present": _load_key_info() is not None,
        "service_account_email": service_account_email(),
        "gsc": {"site_url": os.environ.get("GSC_SITE_URL") or None, "configured": gsc_configured(), "ok": None, "error": None},
        "ga4": {"property_id": os.environ.get("GA4_PROPERTY_ID") or None, "configured": ga4_configured(), "ok": None, "error": None},
    }
    if verify:
        if status["gsc"]["configured"]:
            try:
                fetch_gsc("week", row_limit=1)
                status["gsc"]["ok"] = True
            except Exception as exc:
                status["gsc"]["ok"] = False
                status["gsc"]["error"] = str(exc)[:200]
        if status["ga4"]["configured"]:
            try:
                fetch_ga4("week", row_limit=1)
                status["ga4"]["ok"] = True
            except Exception as exc:
                status["ga4"]["ok"] = False
                status["ga4"]["error"] = str(exc)[:200]
    return status


# ----------------------------------------------------------------------------
# Safe, whitelisted .env writer (non-secret identifiers only)
# ----------------------------------------------------------------------------

_GSC_URL_RE = re.compile(r"^(sc-domain:[A-Za-z0-9.-]+|https?://[A-Za-z0-9.-]+(:\d+)?/[^\s]*)$")


def _write_env_value(key: str, value: str) -> None:
    lines: List[str] = []
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    replaced = False
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = f"{key}={value}"
            replaced = True
            break
    if not replaced:
        lines.append(f"{key}={value}")
    with open(ENV_PATH, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    os.environ[key] = value


def save_gsc_site_url(raw: str) -> str:
    value = (raw or "").strip().strip("`")
    if not _GSC_URL_RE.match(value):
        raise ValueError(
            "GSC site không hợp lệ. Dùng `sc-domain:example.com` (Domain property) "
            "hoặc `https://www.example.com/` (URL-prefix, có dấu `/` ở cuối)."
        )
    _write_env_value("GSC_SITE_URL", value)
    return value


def save_ga4_property_id(raw: str) -> str:
    value = (raw or "").strip().lower().replace("properties/", "")
    if value.startswith("g-"):
        raise ValueError(
            "Đây là Measurement ID (G-…), dùng để gắn tracking trên web. "
            "Data API cần **Property ID** là dãy số (GA4 → Admin → Property details)."
        )
    if not value.isdigit():
        raise ValueError("GA4 Property ID phải là dãy số, ví dụ `123456789`.")
    _write_env_value("GA4_PROPERTY_ID", value)
    return value


# ----------------------------------------------------------------------------
# Data fetching
# ----------------------------------------------------------------------------

def _ranges(period: str):
    days = PERIOD_DAYS.get((period or "week").lower(), 7)
    # GSC data lags ~2 days; use the same lag for both so comparisons are consistent.
    end = datetime.utcnow().date() - timedelta(days=2)
    start = end - timedelta(days=days - 1)
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    return start, end, prev_start, prev_end


def _gsc_query(session, site: str, start, end, dimensions: List[str], row_limit: int) -> List[Dict[str, Any]]:
    url = f"https://www.googleapis.com/webmasters/v3/sites/{urllib.parse.quote(site, safe='')}/searchAnalytics/query"
    body: Dict[str, Any] = {
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "rowLimit": row_limit,
    }
    if dimensions:
        body["dimensions"] = dimensions
    resp = session.post(url, json=body, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"GSC API {resp.status_code}: {resp.text[:160]}")
    return resp.json().get("rows", [])


def _totals(rows: List[Dict[str, Any]]) -> Dict[str, float]:
    clicks = sum(r.get("clicks", 0) for r in rows)
    impressions = sum(r.get("impressions", 0) for r in rows)
    pos_weighted = sum(r.get("position", 0) * r.get("impressions", 0) for r in rows)
    return {
        "clicks": int(clicks),
        "impressions": int(impressions),
        "ctr": round(clicks * 100.0 / impressions, 2) if impressions else 0.0,
        "position": round(pos_weighted / impressions, 1) if impressions else 0.0,
    }


def fetch_gsc(period: str = "week", row_limit: int = 25) -> Dict[str, Any]:
    site = os.environ.get("GSC_SITE_URL")
    if not site:
        raise RuntimeError("Chưa cấu hình GSC_SITE_URL.")
    session = _session(GSC_SCOPE)
    start, end, p_start, p_end = _ranges(period)

    totals_cur = _totals(_gsc_query(session, site, start, end, [], 1))
    totals_prev = _totals(_gsc_query(session, site, p_start, p_end, [], 1))
    queries = _gsc_query(session, site, start, end, ["query"], 250)
    pages = _gsc_query(session, site, start, end, ["page"], 250)

    def fmt(rows, key_idx=0):
        return [
            {
                "key": r["keys"][key_idx],
                "clicks": int(r.get("clicks", 0)),
                "impressions": int(r.get("impressions", 0)),
                "ctr": round(r.get("ctr", 0) * 100, 2),
                "position": round(r.get("position", 0), 1),
            }
            for r in rows
        ]

    q_all, p_all = fmt(queries), fmt(pages)
    near_top10 = sorted(
        [q for q in q_all if 8 <= q["position"] <= 20 and q["impressions"] >= 10],
        key=lambda q: q["impressions"],
        reverse=True,
    )[:8]
    low_ctr_pages = sorted(
        [p for p in p_all if p["impressions"] >= 50 and p["ctr"] < 2.0],
        key=lambda p: p["impressions"],
        reverse=True,
    )[:8]

    return {
        "site": site,
        "range": f"{start} → {end} (GSC trễ ~2 ngày)",
        "totals": totals_cur,
        "prev_totals": totals_prev,
        "top_queries": sorted(q_all, key=lambda q: q["clicks"], reverse=True)[:row_limit],
        "top_pages": sorted(p_all, key=lambda p: p["clicks"], reverse=True)[:row_limit],
        "near_top10_queries": near_top10,
        "low_ctr_pages": low_ctr_pages,
    }


def fetch_ga4(period: str = "week", row_limit: int = 10) -> Dict[str, Any]:
    prop = os.environ.get("GA4_PROPERTY_ID")
    if not prop:
        raise RuntimeError("Chưa cấu hình GA4_PROPERTY_ID.")
    session = _session(GA4_SCOPE)
    start, end, p_start, p_end = _ranges(period)
    url = f"https://analyticsdata.googleapis.com/v1beta/properties/{prop}:runReport"

    def run(body: Dict[str, Any]) -> Dict[str, Any]:
        resp = session.post(url, json=body, timeout=30)
        if resp.status_code != 200:
            raise RuntimeError(f"GA4 API {resp.status_code}: {resp.text[:160]}")
        return resp.json()

    metrics = [{"name": n} for n in ("sessions", "activeUsers", "screenPageViews", "engagementRate")]
    summary = run(
        {
            "dateRanges": [
                {"startDate": start.isoformat(), "endDate": end.isoformat(), "name": "current"},
                {"startDate": p_start.isoformat(), "endDate": p_end.isoformat(), "name": "previous"},
            ],
            "metrics": metrics,
        }
    )

    def read_totals(report: Dict[str, Any]) -> Dict[str, Dict[str, float]]:
        out: Dict[str, Dict[str, float]] = {"current": {}, "previous": {}}
        for row in report.get("rows", []):
            name = row["dimensionValues"][0]["value"] if row.get("dimensionValues") else None
            bucket = "previous" if name in ("date_range_1", "previous") else "current"
            for m, v in zip(("sessions", "users", "views", "engagement_rate"), row["metricValues"]):
                out[bucket][m] = float(v["value"])
        return out

    # With 2 date ranges GA4 adds an implicit dateRange dimension; fall back gracefully if absent.
    totals = read_totals(summary)

    pages = run(
        {
            "dateRanges": [{"startDate": start.isoformat(), "endDate": end.isoformat()}],
            "dimensions": [{"name": "pagePath"}],
            "metrics": [{"name": "screenPageViews"}, {"name": "activeUsers"}],
            "orderBys": [{"metric": {"metricName": "screenPageViews"}, "desc": True}],
            "limit": row_limit,
        }
    )
    sources = run(
        {
            "dateRanges": [{"startDate": start.isoformat(), "endDate": end.isoformat()}],
            "dimensions": [{"name": "sessionDefaultChannelGroup"}],
            "metrics": [{"name": "sessions"}],
            "orderBys": [{"metric": {"metricName": "sessions"}, "desc": True}],
            "limit": 6,
        }
    )

    return {
        "property_id": prop,
        "range": f"{start} → {end}",
        "totals": totals.get("current", {}),
        "prev_totals": totals.get("previous", {}),
        "top_pages": [
            {"path": r["dimensionValues"][0]["value"], "views": int(float(r["metricValues"][0]["value"]))}
            for r in pages.get("rows", [])
        ],
        "channels": [
            {"channel": r["dimensionValues"][0]["value"], "sessions": int(float(r["metricValues"][0]["value"]))}
            for r in sources.get("rows", [])
        ],
    }


# ----------------------------------------------------------------------------
# Setup instructions shown in Telegram (no secrets are ever requested in chat)
# ----------------------------------------------------------------------------

def _key_step() -> str:
    email = service_account_email()
    if email:
        return f"✅ Đã thấy file service account trên server.\n   Email cần được cấp quyền: `{email}`"
    return (
        "1) Google Cloud Console → tạo project → bật **Search Console API** và **Google Analytics Data API**.\n"
        "2) IAM & Admin → Service Accounts → tạo account → Keys → tạo JSON key.\n"
        "3) Lưu file đó trên server tại `openclaw/secrets/google_service_account.json`\n"
        "   ⚠️ KHÔNG gửi file/key này qua Telegram."
    )


def gsc_instructions() -> str:
    status = get_status()
    lines = ["🔎 **Kết nối Google Search Console (GSC)**", ""]
    if status["gsc"]["configured"]:
        lines.append(f"Đã cấu hình: `{status['gsc']['site_url']}`. Gõ `/connect_gsc verify` để kiểm tra kết nối thật.")
        return "\n".join(lines)
    lines += [
        "**Bước 1 — Xác minh website trên GSC** (nếu chưa): https://search.google.com/search-console → Add property → chọn *Domain* (khuyến nghị) và xác minh qua DNS.",
        "",
        "**Bước 2 — Service account (chỉ đọc):**",
        _key_step(),
        "",
        "**Bước 3 — Cấp quyền:** GSC → Settings → Users and permissions → Add user → dán email service account với quyền *Restricted* (chỉ xem).",
        "",
        "**Bước 4 — Báo cho bot property của bạn** (không phải bí mật):",
        "• `/connect_gsc sc-domain:tenmiencuaban.com`",
        "• hoặc `/connect_gsc https://www.tenmiencuaban.com/`",
        "",
        "**Bước 5:** `/connect_gsc verify` để thử kết nối. Sau đó `/stats seo` sẽ gộp dữ liệu Google + audit nội bộ.",
    ]
    return "\n".join(lines)


def ga4_instructions() -> str:
    status = get_status()
    lines = ["📈 **Kết nối Google Analytics 4 (GA4)**", ""]
    if status["ga4"]["configured"]:
        lines.append(f"Đã cấu hình Property `{status['ga4']['property_id']}`. Gõ `/connect_ga4 verify` để kiểm tra.")
        return "\n".join(lines)
    lines += [
        "Website đã gắn tag GA4 (Measurement ID trong `NEXT_PUBLIC_GA_MEASUREMENT_ID`) — việc còn lại là cho bot **quyền đọc báo cáo**.",
        "",
        "**Bước 1 — Service account (chỉ đọc):**",
        _key_step(),
        "",
        "**Bước 2 — Cấp quyền:** GA4 → Admin → Property access management → thêm email service account với vai trò *Viewer*.",
        "",
        "**Bước 3 — Property ID:** GA4 → Admin → Property details → copy dãy số **Property ID** (không phải `G-…`).",
        "• `/connect_ga4 123456789`",
        "",
        "**Bước 4:** `/connect_ga4 verify` để thử kết nối.",
    ]
    return "\n".join(lines)

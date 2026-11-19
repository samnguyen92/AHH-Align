from __future__ import annotations

import contextlib
import io
import logging
import logging.handlers
import os
import sys
import traceback
from datetime import datetime
from typing import Callable, Optional

from dotenv import load_dotenv

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(_OPENCLAW_DIR, "..", ".env.local"))
load_dotenv(".env")
load_dotenv(".env.local")


LOG_PATH = os.path.join(os.path.dirname(__file__), "openclaw.log")

# Rotating log handler: max 5 MB per file, keep 3 backups
_log_handler = logging.handlers.RotatingFileHandler(
    LOG_PATH,
    maxBytes=5 * 1024 * 1024,
    backupCount=3,
    encoding="utf-8",
)
_log_handler.setFormatter(logging.Formatter("%(message)s"))
_openclaw_logger = logging.getLogger("openclaw")
_openclaw_logger.setLevel(logging.DEBUG)
if not _openclaw_logger.handlers:
    _openclaw_logger.addHandler(_log_handler)


class TeeWriter:
    """Write job output to both a buffer and the real console."""

    def __init__(self, *streams) -> None:
        self.streams = streams

    def write(self, text: str) -> int:
        for stream in self.streams:
            stream.write(text)
            stream.flush()
        return len(text)

    def flush(self) -> None:
        for stream in self.streams:
            stream.flush()


def _write_log(text: str) -> None:
    timestamp = datetime.now().isoformat(timespec="seconds")
    _openclaw_logger.info("\n[%s]\n%s", timestamp, text)


class JobFailed(Exception):
    """Raised when a job ended with an error, so callers can report a failure instead of "finished"."""

    def __init__(self, name: str, output: str, cause: Optional[BaseException] = None) -> None:
        self.name = name
        self.output = output
        self.cause = cause
        super().__init__(f"{name} failed: {cause!r}" if cause else f"{name} failed")

    def short(self, max_lines: int = 12, max_chars: int = 1500) -> str:
        """The part of the output a person needs: the last lines, which hold the error."""
        lines = [line for line in (self.output or "").splitlines() if line.strip()]
        text = "\n".join(lines[-max_lines:])
        return text[-max_chars:]


def _run_with_captured_output(name: str, fn: Callable[[], None]) -> str:
    """Run a job, capture its output and log it.

    Returns the captured output on success. Raises `JobFailed` when the job raised ANY error
    (including SystemExit, which `except Exception` would silently let kill a bot thread).
    """
    buffer = io.StringIO()
    started = datetime.now()
    stdout_tee = TeeWriter(buffer, sys.__stdout__)
    stderr_tee = TeeWriter(buffer, sys.__stderr__)
    failure: Optional[BaseException] = None

    with contextlib.redirect_stdout(stdout_tee), contextlib.redirect_stderr(stderr_tee):
        print(f"[*] Starting job: {name}")
        print(f"[*] Started at: {started.isoformat(timespec='seconds')}")
        try:
            fn()
            print(f"[*] Finished job: {name}")
        except (Exception, SystemExit) as exc:
            failure = exc
            print(f"[!] Job failed: {name}")
            print(traceback.format_exc())

    output = buffer.getvalue().strip()
    _write_log(output)
    if failure is not None:
        raise JobFailed(name, output, failure)
    return output


def run_batch_job() -> str:
    from run_batch import main

    return _run_with_captured_output("run_batch", main)


def scout_pipeline_job(
    query: str,
    limit: int = 1,
    required_languages=None,
    included_types=None,
    telegram_updater_callback=None,
) -> str:
    from run_scout import run_scout_pipeline

    return _run_with_captured_output(
        "find_clinics",
        lambda: print(run_scout_pipeline(
            query,
            limit=limit,
            required_languages=required_languages,
            included_types=included_types,
            telegram_updater_callback=telegram_updater_callback,
        )),
    )


def scrape_clinic_url_job(name: str, url: str, telegram_updater_callback=None) -> str:
    from run_single_clinic_url import run_single_clinic_url

    return _run_with_captured_output(
        "scrape_clinic_url",
        lambda: print(
            {
                "saved": run_single_clinic_url(
                    name,
                    url,
                    progress_callback=telegram_updater_callback,
                )
            }
        ),
    )


def repair_clinic_images_job() -> str:
    from repair_clinic_images import main

    return _run_with_captured_output("repair_clinic_images", main)


def enrich_clinics_google_job() -> str:
    from enrich_clinics_google import main

    return _run_with_captured_output("enrich_clinics_google", main)


def repair_article_images_job() -> str:
    from repair_article_images import main

    return _run_with_captured_output("repair_article_images", main)


def regenerate_article_images_job(identifier: str, image_count: int = 3) -> str:
    from repair_article_images import regenerate_article_images

    return _run_with_captured_output(
        "regenerate_article_images",
        lambda: regenerate_article_images(identifier, image_count=image_count),
    )


def repair_article_slugs_job() -> str:
    from admin_actions import repair_article_slugs

    return _run_with_captured_output("repair_article_slugs", repair_article_slugs)


def delete_article_job(identifier: str) -> str:
    from admin_actions import delete_article

    return _run_with_captured_output("delete_article", lambda: delete_article(identifier))


def delete_clinic_job(identifier: str) -> str:
    from admin_actions import delete_clinic

    return _run_with_captured_output("delete_clinic", lambda: delete_clinic(identifier))


def change_clinic_feature_image_job(identifier: str, image_url: Optional[str] = None) -> str:
    from admin_actions import change_clinic_feature_image

    return _run_with_captured_output(
        "change_clinic_feature_image",
        lambda: change_clinic_feature_image(identifier, image_url),
    )



def generate_insight_job(topic: Optional[str] = None) -> str:
    from generate_insights import create_article

    return _run_with_captured_output("generate_insight", lambda: create_article(topic))


def generate_pulse_job(topic: Optional[str] = None) -> str:
    from generate_pulse import create_pulse

    return _run_with_captured_output("generate_pulse", lambda: create_pulse(topic))


def generate_insight_from_url_job(source_url: str) -> str:
    from generate_insights import create_article_from_url

    return _run_with_captured_output("generate_insight_from_url", lambda: create_article_from_url(source_url))


def generate_guide_job(topic: Optional[str] = None) -> str:
    from generate_insights import create_guide

    return _run_with_captured_output("generate_guide", lambda: create_guide(topic))


def generate_guide_from_url_job(source_url: str) -> str:
    from generate_insights import create_guide_from_url

    return _run_with_captured_output("generate_guide_from_url", lambda: create_guide_from_url(source_url))


def generate_insight_from_context_job(reference_text: str, instruction: str, reference_label: str = "Telegram memory") -> str:
    from generate_insights import create_article_from_context

    return _run_with_captured_output(
        "generate_insight_from_context",
        lambda: create_article_from_context(reference_text, instruction, reference_label, mode="insight"),
    )


def generate_guide_from_context_job(reference_text: str, instruction: str, reference_label: str = "Telegram memory") -> str:
    from generate_insights import create_article_from_context

    return _run_with_captured_output(
        "generate_guide_from_context",
        lambda: create_article_from_context(reference_text, instruction, reference_label, mode="guide"),
    )


def rewrite_article_job(identifier: str, instruction: str) -> str:
    from generate_insights import rewrite_article

    return _run_with_captured_output(
        "rewrite_article",
        lambda: rewrite_article(identifier, instruction),
    )


def research_job(user_request: str) -> str:
    from research_agents import run_research

    return _run_with_captured_output("multi_agent_research", lambda: print(run_research(user_request)))


def check_status() -> str:
    missing = []
    if not os.environ.get("OPENROUTER_API_KEY"):
        missing.append("OPENROUTER_API_KEY")
    if not os.environ.get("TELEGRAM_BOT_TOKEN"):
        missing.append("TELEGRAM_BOT_TOKEN")

    lines = ["OpenClaw status"]
    lines.append(f"Environment: {'OK' if not missing else 'Missing ' + ', '.join(missing)}")

    try:
        from pg_client import create_client

        db = create_client()
        clinics = db.table("clinics").select("id", count="exact").limit(1).execute()
        articles = db.table("articles").select("id", count="exact").limit(1).execute()
        lines.append(f"Clinics: {clinics.count}")
        lines.append(f"Articles: {articles.count}")
        try:
            subscribers = db.table("newsletter_subscriptions").select("id", count="exact").limit(1).execute()
            lines.append(f"Subscribers: {subscribers.count}")
        except Exception:
            pass
    except Exception as exc:
        lines.append(f"Database check failed: {exc}")

    lines.append(f"Log file: {LOG_PATH}")
    return "\n".join(lines)


def tail_log(lines: int = 40) -> str:
    if not os.path.exists(LOG_PATH):
        return "No OpenClaw log yet."

    with open(LOG_PATH, "r", encoding="utf-8") as log_file:
        content = log_file.readlines()

    return "".join(content[-lines:]).strip() or "No OpenClaw log yet."


def list_newsletter_subscribers_job(limit: int = 50) -> str:
    from admin_actions import list_newsletter_subscribers

    return _run_with_captured_output(
        "list_newsletter_subscribers",
        lambda: list_newsletter_subscribers(limit),
    )


def add_newsletter_subscriber_job(email: str) -> str:
    from admin_actions import add_newsletter_subscriber

    return _run_with_captured_output(
        "add_newsletter_subscriber",
        lambda: add_newsletter_subscriber(email),
    )


def remove_newsletter_subscriber_job(email: str) -> str:
    from admin_actions import remove_newsletter_subscriber

    return _run_with_captured_output(
        "remove_newsletter_subscriber",
        lambda: remove_newsletter_subscriber(email),
    )


def check_claims_job() -> str:
    from admin_actions import check_claims

    return _run_with_captured_output(
        "check_claims",
        lambda: check_claims(),
    )


def approve_claim_job(identifier: str) -> str:
    from admin_actions import approve_claim

    return _run_with_captured_output(
        "approve_claim",
        lambda: approve_claim(identifier),
    )


def reject_claim_job(identifier: str) -> str:
    from admin_actions import reject_claim

    return _run_with_captured_output(
        "reject_claim",
        lambda: reject_claim(identifier),
    )


def check_analytics_job(timeframe: str = "week", filter_type: str = "all") -> str:
    from admin_actions import check_analytics

    return _run_with_captured_output(
        "check_analytics",
        lambda: check_analytics(timeframe, filter_type),
    )


def check_clinic_quality(threshold: int = 85, limit: int = 15) -> str:
    from pg_client import create_client
    from normalize import compute_quality

    try:
        db = create_client()
        rows = (
            db.table("clinics")
            .select("name,slug,city,state,specialty,phone,address,zip_code,languages,metadata")
            .limit(2000)
            .execute()
            .data
        )
    except Exception as exc:
        return f"Could not load clinics: {exc}"

    scored = []
    for row in rows:
        meta = row.get("metadata") or {}
        score = meta.get("quality_score")
        missing = meta.get("quality_missing")
        if score is None or missing is None:
            q = compute_quality(row)
            score, missing = q["score"], q["missing"]
        scored.append((int(score), row.get("name"), row.get("slug"), row.get("city"), row.get("state"), missing))

    scored.sort(key=lambda item: (item[0], item[1] or ""))
    avg = sum(item[0] for item in scored) / max(len(scored), 1)
    below = [item for item in scored if item[0] < threshold]

    lines = [
        f"📊 Clinic Quality Report ({len(scored)} clinics)",
        f"Average score: {avg:.1f}/100",
        f"Text model: {os.environ.get('OPENCLAW_TEXT_MODEL', 'openai/gpt-6-luna')}",
        f"Image model: {os.environ.get('OPENCLAW_IMAGE_MODEL', 'openai/gpt-image-2.5-sunburst')} (fallback: {os.environ.get('OPENCLAW_IMAGE_FALLBACK_MODEL', 'google/gemini-3.1-flash-image')})",
        f"Below {threshold}/100: {len(below)} clinic(s)",
        "",
    ]
    sample = below[:limit] if below else scored[: min(limit, 8)]
    header = f"Lowest scoring clinics (<{threshold}):" if below else "Lowest scoring clinics:"
    lines.append(header)
    for score, name, slug, city, state, missing in sample:
        loc = ", ".join(v for v in (city, state) if v)
        miss = ", ".join(missing or []) or "none"
        lines.append(f"• [{score}/100] {name} ({loc}) — slug: `{slug}` — missing: {miss}")
    lines.append("\nTip: use `/scrape_clinic_url <name> | <url>` to re-scrape or `/delete_clinic <slug>` to remove.")
    return "\n".join(lines)


def directory_audit_job() -> str:
    from audit_directory import audit_directory_coverage, format_directory_gaps_report

    cov = audit_directory_coverage()["summary_text"]
    gaps = format_directory_gaps_report(limit=8)
    return f"{cov}\n\n{gaps}"


def search_audit_job() -> str:
    from audit_directory import format_search_benchmark_report

    return format_search_benchmark_report()


def scout_gaps_job(limit_gaps: int = 3, per_gap_limit: int = 2, telegram_updater_callback=None) -> str:
    from audit_directory import discover_directory_gaps
    from run_scout import scout_and_ingest

    gaps = discover_directory_gaps(limit=max(1, min(limit_gaps, 6)))
    if not gaps:
        return "✅ Không còn khoảng trống nguồn cung (mọi ô City × Specialty × Language đều đã có >= 2 phòng khám)."

    def run_all():
        print(f"[*] Bắt đầu tự động trinh sát {len(gaps)} khoảng trống nguồn cung ưu tiên cao nhất...")
        for idx, g in enumerate(gaps, 1):
            q = g["scout_query"]
            print(f"\n--- [Gap {idx}/{len(gaps)}] {g['city']}, {g['state']} | {g['language']} · {g['specialty']} ---")
            if telegram_updater_callback:
                telegram_updater_callback(
                    f"🚀 [Gap {idx}/{len(gaps)}] Đang trinh sát: `{q}` (tối đa {per_gap_limit} phòng khám)..."
                )
            scout_and_ingest(
                q,
                limit=per_gap_limit,
                required_languages=[g["language"]],
                telegram_updater=telegram_updater_callback,
            )

    return _run_with_captured_output(f"scout_gaps({len(gaps)})", run_all)


def web_edit_job(instruction: str, image_path: str | None = None, progress_callback=None) -> str:
    from dev_agent import run_web_dev_agent

    res = run_web_dev_agent(
        instruction=instruction,
        image_path=image_path,
        progress_callback=progress_callback,
    )
    return res["summary"]


def seo_audit_job(target_route: str | None = None) -> str:
    from seo_agent import run_seo_audit

    return run_seo_audit(target_route=target_route)


def seo_setup_job(instruction: str, progress_callback=None) -> str:
    from seo_agent import run_seo_setup

    res = run_seo_setup(instruction=instruction, progress_callback=progress_callback)
    return res["summary"]


def site_analyze_job(target_route: str = "/", timeframe: str = "week") -> str:
    from site_analyzer import run_site_analysis

    return run_site_analysis(target_route=target_route, timeframe=timeframe)


def dev_diff_job() -> str:
    from git_publisher import get_git_diff_summary

    return get_git_diff_summary()


def rollback_code_job() -> str:
    from git_publisher import rollback_changes

    return rollback_changes()


def publish_code_job(commit_message: str | None = None, telegram_updater_callback=None) -> str:
    from git_publisher import publish_to_github_and_live

    return publish_to_github_and_live(
        commit_message=commit_message,
        telegram_updater=telegram_updater_callback,
    )


def stats_question_job(question: str, period: str | None = None, lang: str = "en") -> str:
    from stats_agent import answer_stats_question, plan_question

    plan = None
    if period:
        plan = plan_question(question)
        plan["period"] = period
    res = answer_stats_question(question, plan=plan, lang=lang)
    return res["text"]


def stats_report_job(arg_text: str = "", lang: str = "en") -> dict:
    from stats_agent import build_detailed_report, parse_stats_args

    scopes, period = parse_stats_args(arg_text)
    report = build_detailed_report(scopes=scopes, period=period, lang=lang)
    return report


def connect_gsc_job(arg: str = "") -> str:
    import gsc_client

    clean_arg = (arg or "").strip()
    if not clean_arg:
        return gsc_client.gsc_instructions()
    try:
        saved = gsc_client.save_gsc_site_url(clean_arg)
        status = gsc_client.get_status(verify=True)
        gsc_st = status.get("gsc", {})
        if gsc_st.get("ok"):
            return f"✅ Successfully connected GSC site: `{saved}`!\nGoogle Search Console metrics will now appear in `/stats` and `/stats_report`."
        elif gsc_st.get("ok") is False:
            err = gsc_st.get("error", "Authentication error")
            return f"⚠️ Saved GSC site: `{saved}`, but live API verification failed: {err}\n\nPlease make sure service account email `{status.get('service_account_email')}` is added as a Full/Restricted user in Google Search Console."
        else:
            return f"ℹ️ Saved GSC site: `{saved}` to config.\nNo service account key file found yet at `openclaw/secrets/google_service_account.json`."
    except Exception as exc:
        return f"❌ Error: {exc}"


def connect_ga4_job(arg: str = "") -> str:
    import gsc_client

    clean_arg = (arg or "").strip()
    if not clean_arg:
        return gsc_client.ga4_instructions()
    try:
        saved = gsc_client.save_ga4_property_id(clean_arg)
        status = gsc_client.get_status(verify=True)
        ga4_st = status.get("ga4", {})
        if ga4_st.get("ok"):
            return f"✅ Successfully connected GA4 Property ID: `{saved}`!\nGA4 metrics will now appear in `/stats` and `/stats_report`."
        elif ga4_st.get("ok") is False:
            err = ga4_st.get("error", "Authentication error")
            return f"⚠️ Saved GA4 Property ID: `{saved}`, but live API verification failed: {err}\n\nPlease make sure service account email `{status.get('service_account_email')}` is added as a Viewer in GA4 Property."
        else:
            return f"ℹ️ Saved GA4 Property ID: `{saved}` to config.\nNo service account key file found yet at `openclaw/secrets/google_service_account.json`."
    except Exception as exc:
        return f"❌ Error: {exc}"


def check_anomalies_job(lang: str = "en") -> str:
    from stats_agent import check_anomalies, format_anomalies_report

    data = check_anomalies(lang=lang)
    return format_anomalies_report(data, lang=lang)








def _find_clinic_rows(target: str) -> list[dict]:
    from rescan_all_clinics import db_query

    q = (target or "").strip()
    if not q:
        return []
    rows = db_query(
        """
        SELECT * FROM clinics
        WHERE slug = $1
           OR id::text = $1
           OR name ILIKE $2
           OR slug ILIKE $2
        ORDER BY CASE WHEN lower(slug) = lower($1) OR lower(name) = lower($1) THEN 0 ELSE 1 END,
                 (metadata->>'rating_count')::int DESC NULLS LAST
        LIMIT 5
        """,
        [q, f"%{q}%"],
    )
    return rows


def inspect_clinic_job(target: str, lang: str = "vi") -> str:
    rows = _find_clinic_rows(target)
    if not rows:
        if lang == "vi":
            return (
                f"❌ Không tìm thấy phòng khám nào khớp với **“{target}”** trong database của website.\n"
                "👉 Nếu đây là phòng khám mới chưa có trên trang web, bạn có thể nhắn: `tìm phòng khám <tên> trên Google Places` hoặc `/scrape_clinic_url <tên> | <website_url>`."
            )
        return (
            f"❌ No clinic matching **“{target}”** was found in the website database.\n"
            "👉 To import a new clinic from Google Places, say `find clinic <name> on Google Places` or `/scrape_clinic_url <name> | <url>`."
        )

    c = rows[0]
    m = c.get("metadata") or {}
    slug = c.get("slug") or ""
    imgs = m.get("images") or []
    img_src = m.get("images_source") or ("google/existing" if imgs else "none")
    langs = c.get("languages") or []
    lang_ev = m.get("languages_evidence") or []
    wtk = m.get("what_to_know") or []
    diff = m.get("differentiators") or []
    byb = m.get("before_you_book") or []
    svcs = m.get("services_offered") or m.get("services") or []
    pricing = m.get("pricing") or []
    ins = (m.get("insurance") or {}).get("accepted_networks") or m.get("insurance_accepted") or []
    team = m.get("team_members") or []
    revs = m.get("reviews") or []
    faqs = m.get("faqs") or []
    i18n_keys = list((m.get("i18n") or {}).keys()) if isinstance(m.get("i18n"), dict) else []
    lang_note = (m.get("language_note") or m.get("cultural_context") or "").strip()
    website = m.get("website") or m.get("google_website_url") or "Chưa có"

    lines = [
        f"🏥 **Kiểm tra Clinic trên Website: {c.get('name')}**",
        f"• **Slug / Link**: `https://asianhealthhub.com/clinics/{slug}`",
        f"• **Trạng thái**: `{c.get('status', 'published')}` | **Chuyên khoa**: `{c.get('specialty') or 'N/A'}`",
        f"• **Địa chỉ**: {c.get('address') or ''}, {c.get('city') or ''}, {c.get('state') or ''} {c.get('zip_code') or ''}",
        f"• **SĐT**: `{c.get('phone') or 'N/A'}` | **Website**: {website}",
        "",
        "🗣 **Ngôn ngữ & Xác thực**:",
        f"• **Languages**: `{', '.join(langs)}`",
        f"• **Đã xác thực trên web (`languages_verified`)**: {'✅ Có' if m.get('languages_verified') else '⚠️ Chưa có bằng chứng trực tiếp trên web'}",
    ]
    if lang_ev:
        lines.append(f"• **Bằng chứng (`languages_evidence`)**: {'; '.join(str(x) for x in lang_ev[:3])}")
    lines.extend(
        [
            "",
            "🖼 **Hình ảnh (Gallery)**:",
            f"• **Số lượng ảnh**: `{len(imgs)}` ảnh (Nguồn: `{img_src}`)",
            "",
            "📋 **Kiểm tra các mục trên trang Detail**:",
            f"• **About / Description**: {'✅ Có (' + str(len(c.get('description') or '')) + ' ký tự)' if c.get('description') else '❌ Thiếu'}",
            f"• **Hộp Language Support dưới About**: {'✅ Có — ' + lang_note[:140] + ('...' if len(lang_note) > 140 else '') if lang_note else '❌ Thiếu'}",
            f"• **What to know / Differentiators / Before you book**: `{len(wtk)}` / `{len(diff)}` / `{len(byb)}` mục",
            f"• **Services**: `{len(svcs)}` dịch vụ",
            f"• **Pricing**: `{len(pricing)}` mục giá {'(hiển thị)' if pricing else '(đang ẩn vì web không công khai giá)'}",
            f"• **Insurance**: `{len(ins)}` hãng bảo hiểm",
            f"• **Team (Bác sĩ/Nhân sự)**: `{len(team)}` người",
            f"• **Reviews**: `{m.get('rating') or 'N/A'}★` (`{m.get('rating_count') or 0}` tổng, `{len(revs)}` thẻ review)",
            f"• **FAQs**: `{len(faqs)}` câu hỏi",
            f"• **Bản dịch đa ngôn ngữ (`i18n`)**: `{', '.join(i18n_keys) if i18n_keys else 'Chưa có (sẽ tạo khi rescan)'}`",
        ]
    )
    if len(rows) > 1:
        others = ", ".join(f"`{r['slug']}`" for r in rows[1:])
        lines.append(f"\n🔎 *Các kết quả gần giống khác trong DB*: {others}")

    lines.append(
        f"\n💡 Để quét lại website, tải lại ảnh chuẩn và trích xuất toàn bộ các mục + bản dịch VI/KO/ZH bằng `gpt-6-luna` cho phòng khám này, hãy nhắn:\n"
        f"`quét lại clinic {slug}` hoặc gõ `/rescan_clinic {slug}`"
    )
    return "\n".join(lines)


def rescan_clinic_job(target: str) -> str:
    from rescan_all_clinics import rescan_one_clinic

    rows = _find_clinic_rows(target)
    if not rows:
        return f"❌ Không tìm thấy phòng khám nào khớp với “{target}” trong DB."
    c = rows[0]
    info = rescan_one_clinic(c)
    return (
        f"✅ **Đã quét & cập nhật toàn diện phòng khám bằng `gpt-6-luna`!**\n\n"
        f"• **Tên**: {info['name']} (`{info['slug']}`)\n"
        f"• **Link**: https://asianhealthhub.com/clinics/{info['slug']}\n"
        f"• **Trạng thái**: `{info['status']}` | **Chuyên khoa**: `{info['specialty']}`\n"
        f"• **Ngôn ngữ**: `{info['languages']}` (Xác thực web: `{info['languages_verified']}`)\n"
        f"• **Hình ảnh Gallery**: `{info['photos_count']}` ảnh (Nguồn: `{info['photos_source']}`)\n"
        f"• **Hộp Language Support**: `{'Đã cập nhật' if info['has_language_note'] else 'N/A'}`\n"
        f"• **Bản dịch đa ngôn ngữ (VI/KO/ZH)**: `{'Đã tạo đầy đủ' if info['has_i18n'] else 'N/A'}`\n\n"
        f"👉 Gõ `/inspect_clinic {info['slug']}` để xem chi tiết từng mục sau khi cập nhật."
    )


def rescan_all_clinics_job(limit: int = 0) -> str:
    import subprocess
    import sys

    cmd = [sys.executable, "rescan_all_clinics.py", "--draft-hospitals"]
    if limit and limit > 0:
        cmd.append(f"--sample={limit}")
    else:
        cmd.extend(["--all", "--resume"])
    proc = subprocess.run(cmd, capture_output=True, text=True)
    out = (proc.stdout or "") + "\n" + (proc.stderr or "")
    return out[-3500:].strip() or "✅ Đã hoàn tất quét lại danh sách phòng khám."

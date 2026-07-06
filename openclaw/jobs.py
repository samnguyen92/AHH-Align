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

load_dotenv(".env")
load_dotenv("../.env.local")


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


def _run_with_captured_output(name: str, fn: Callable[[], None]) -> str:
    buffer = io.StringIO()
    started = datetime.now()
    stdout_tee = TeeWriter(buffer, sys.__stdout__)
    stderr_tee = TeeWriter(buffer, sys.__stderr__)

    with contextlib.redirect_stdout(stdout_tee), contextlib.redirect_stderr(stderr_tee):
        print(f"[*] Starting job: {name}")
        print(f"[*] Started at: {started.isoformat(timespec='seconds')}")
        try:
            fn()
            print(f"[*] Finished job: {name}")
        except Exception:
            print(f"[!] Job failed: {name}")
            print(traceback.format_exc())

    output = buffer.getvalue().strip()
    _write_log(output)
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
    if not os.environ.get("NEXT_PUBLIC_SUPABASE_URL"):
        missing.append("NEXT_PUBLIC_SUPABASE_URL")
    if not (os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")):
        missing.append("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY")
    if not os.environ.get("OPENROUTER_API_KEY"):
        missing.append("OPENROUTER_API_KEY")
    if not os.environ.get("TELEGRAM_BOT_TOKEN"):
        missing.append("TELEGRAM_BOT_TOKEN")

    lines = ["OpenClaw status"]
    lines.append(f"Environment: {'OK' if not missing else 'Missing ' + ', '.join(missing)}")

    try:
        from supabase import create_client

        supabase = create_client(
            os.environ["NEXT_PUBLIC_SUPABASE_URL"],
            os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
        )
        clinics = supabase.table("clinics").select("id", count="exact").limit(1).execute()
        articles = supabase.table("articles").select("id", count="exact").limit(1).execute()
        lines.append(f"Clinics: {clinics.count}")
        lines.append(f"Articles: {articles.count}")
        try:
            subscribers = supabase.table("newsletter_subscriptions").select("id", count="exact").limit(1).execute()
            lines.append(f"Subscribers: {subscribers.count}")
        except Exception:
            pass
    except Exception as exc:
        lines.append(f"Supabase check failed: {exc}")

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




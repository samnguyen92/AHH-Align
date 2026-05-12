import contextlib
import io
import os
import traceback
from datetime import datetime
from typing import Callable, Optional

from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv("../.env.local")


LOG_PATH = os.path.join(os.path.dirname(__file__), "openclaw.log")


def _write_log(text: str) -> None:
    timestamp = datetime.now().isoformat(timespec="seconds")
    with open(LOG_PATH, "a", encoding="utf-8") as log_file:
        log_file.write(f"\n[{timestamp}]\n{text}\n")


def _run_with_captured_output(name: str, fn: Callable[[], None]) -> str:
    buffer = io.StringIO()
    started = datetime.now()

    with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
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


def repair_clinic_images_job() -> str:
    from repair_clinic_images import main

    return _run_with_captured_output("repair_clinic_images", main)


def enrich_clinics_google_job() -> str:
    from enrich_clinics_google import main

    return _run_with_captured_output("enrich_clinics_google", main)


def repair_article_images_job() -> str:
    from repair_article_images import main

    return _run_with_captured_output("repair_article_images", main)


def repair_article_slugs_job() -> str:
    from admin_actions import repair_article_slugs

    return _run_with_captured_output("repair_article_slugs", repair_article_slugs)


def delete_article_job(identifier: str) -> str:
    from admin_actions import delete_article

    return _run_with_captured_output("delete_article", lambda: delete_article(identifier))


def delete_clinic_job(identifier: str) -> str:
    from admin_actions import delete_clinic

    return _run_with_captured_output("delete_clinic", lambda: delete_clinic(identifier))


def generate_insight_job(topic: Optional[str] = None) -> str:
    from generate_insights import create_article

    return _run_with_captured_output("generate_insight", lambda: create_article(topic))


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

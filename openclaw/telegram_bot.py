import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request
from typing import Callable, Optional

from dotenv import load_dotenv

from ai_agent import ask_openclaw_agent
from agent_prompt import OPENCLAW_AGENT_SYSTEM_PROMPT
from intent_agent import run_intent_agent
from jobs import (
    JobFailed,
    approve_all_draft_clinics_job,
    approve_clinic_job,
    list_draft_clinics_job,
    reject_clinic_job,
    check_status,
    delete_article_job,
    delete_clinic_job,
    change_clinic_feature_image_job,
    generate_guide_from_url_job,
    generate_guide_from_context_job,
    generate_guide_job,
    generate_insight_from_context_job,
    generate_insight_from_url_job,
    generate_insight_job,
    generate_pulse_job,
    enrich_clinics_google_job,
    repair_article_images_job,
    repair_clinic_images_job,
    repair_article_slugs_job,
    regenerate_article_images_job,
    research_job,
    rewrite_article_job,
    run_batch_job,
    scout_pipeline_job,
    scrape_clinic_url_job,
    tail_log,
    list_newsletter_subscribers_job,
    add_newsletter_subscriber_job,
    remove_newsletter_subscriber_job,
    check_claims_job,
    approve_claim_job,
    reject_claim_job,
    check_analytics_job,
    check_clinic_quality,
    directory_audit_job,
    search_audit_job,
    scout_gaps_job,
    web_edit_job,
    seo_audit_job,
    seo_setup_job,
    site_analyze_job,
    dev_diff_job,
    rollback_code_job,
    publish_code_job,
    stats_question_job,
    stats_report_job,
    connect_gsc_job,
    connect_ga4_job,
    check_anomalies_job,
    inspect_clinic_job,
    rescan_clinic_job,
    rescan_all_clinics_job,
)
from dev_agent import capture_page_screenshot

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(_OPENCLAW_DIR, "..", ".env.local"))
load_dotenv(".env")
load_dotenv(".env.local")

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"
MAX_MESSAGE_LENGTH = 3900
MAX_JOB_OUTPUT_CHUNKS = int(os.environ.get("TELEGRAM_MAX_JOB_OUTPUT_CHUNKS", "12"))
MAX_MEMORY_CHARS = int(os.environ.get("OPENCLAW_MEMORY_MAX_CHARS", "60000"))
MEMORY_PATH = os.path.join(os.path.dirname(__file__), "telegram_memory.json")


class TelegramBot:
    def __init__(self) -> None:
        self.token = os.environ.get("TELEGRAM_BOT_TOKEN")
        if not self.token:
            raise RuntimeError("Missing TELEGRAM_BOT_TOKEN in openclaw/.env")

        allowed_ids = os.environ.get("TELEGRAM_ALLOWED_USER_IDS", "").strip()
        self.allowed_user_ids = {
            int(value.strip())
            for value in allowed_ids.split(",")
            if value.strip().isdigit()
        }
        if not self.allowed_user_ids:
            print(
                "[!] TELEGRAM_ALLOWED_USER_IDS is empty: the bot will REFUSE every user until at least one "
                "Telegram user id is configured in openclaw/.env (get yours from @userinfobot)."
            )
        self.offset = 0
        self.running_jobs: dict[str, threading.Thread] = {}
        self.pending_actions: dict[int, dict] = {}
        self.chat_memory: dict[int, dict] = self.load_memory()
        self.chat_lang: dict[int, str] = {}
        self._memory_lock = threading.RLock()  # RLock: reentrant, safe for nested acquire
        self._pending_lock = threading.Lock()
        self.start_anomaly_checker()

    def load_memory(self) -> dict[int, dict]:
        if not os.path.exists(MEMORY_PATH):
            return {}

        try:
            with open(MEMORY_PATH, "r", encoding="utf-8") as memory_file:
                data = json.load(memory_file)
            return {int(chat_id): value for chat_id, value in data.items() if str(chat_id).isdigit()}
        except Exception as exc:
            print(f"[!] Could not load Telegram memory: {exc}")
            return {}

    def save_memory(self) -> None:
        with self._memory_lock:
            try:
                with open(MEMORY_PATH, "w", encoding="utf-8") as memory_file:
                    json.dump({str(chat_id): value for chat_id, value in self.chat_memory.items()}, memory_file, ensure_ascii=False, indent=2)
            except Exception as exc:
                print(f"[!] Could not save Telegram memory: {exc}")

    def remember_job_output(self, chat_id: int, name: str, output: str, action_type: str = "job") -> None:
        if not output:
            return

        with self._memory_lock:
            self.chat_memory[chat_id] = {
                "type": action_type,
                "name": name,
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "text": output[-MAX_MEMORY_CHARS:],
            }
        self.save_memory()

    def request(self, method: str, payload: Optional[dict] = None) -> dict:
        url = TELEGRAM_API.format(token=self.token, method=method)
        data = None
        headers = {}

        if payload is not None:
            data = urllib.parse.urlencode(payload).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded"

        request = urllib.request.Request(url, data=data, headers=headers)
        last_error: Optional[Exception] = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=70) as response:
                    return json.loads(response.read().decode("utf-8"))
            except Exception as exc:
                last_error = exc
                if attempt < 2:
                    time.sleep(2 * (attempt + 1))

        raise RuntimeError(f"Telegram request failed after retries: {last_error}")

    def send_message(self, chat_id: int, text: str) -> None:
        chunks = [text[i:i + MAX_MESSAGE_LENGTH] for i in range(0, len(text), MAX_MESSAGE_LENGTH)] or [""]
        for chunk in chunks:
            self.request("sendMessage", {"chat_id": chat_id, "text": chunk})

    def send_photo(self, chat_id: int, photo_path: str, caption: str = "") -> None:
        if not photo_path or not os.path.exists(photo_path):
            return
        try:
            import requests

            url = TELEGRAM_API.format(token=self.token, method="sendPhoto")
            with open(photo_path, "rb") as fh:
                requests.post(
                    url,
                    data={"chat_id": str(chat_id), "caption": (caption or "")[:950]},
                    files={"photo": fh},
                    timeout=60,
                )
        except Exception as exc:
            print(f"[!] Could not send Telegram photo: {exc}")

    def send_document(self, chat_id: int, file_path: str, caption: str = "") -> None:
        if not file_path or not os.path.exists(file_path):
            return
        try:
            import requests

            url = TELEGRAM_API.format(token=self.token, method="sendDocument")
            with open(file_path, "rb") as fh:
                requests.post(
                    url,
                    data={"chat_id": str(chat_id), "caption": (caption or "")[:950]},
                    files={"document": fh},
                    timeout=60,
                )
        except Exception as exc:
            print(f"[!] Could not send Telegram document: {exc}")

    def start_anomaly_checker(self) -> None:
        def _loop():
            # Initial wait 30 seconds before first check, then check every 6 hours
            time.sleep(30)
            while True:
                try:
                    from stats_agent import check_anomalies, format_anomalies_report
                    data = check_anomalies()
                    if data.get("has_anomalies") and self.allowed_user_ids:
                        report = format_anomalies_report(data, lang="en")
                        for uid in self.allowed_user_ids:
                            self.send_message(uid, f"🔔 **WEBSITE ANOMALY ALERT**\n\n{report}")
                except Exception as exc:
                    print(f"[!] Anomaly checker error: {exc}")
                time.sleep(6 * 3600)

        threading.Thread(target=_loop, daemon=True, name="anomaly-checker").start()

    def download_telegram_photo(self, photos: list) -> Optional[str]:
        if not photos:
            return None
        try:
            best = photos[-1]
            file_id = best.get("file_id")
            if not file_id:
                return None
            file_info = self.request("getFile", {"file_id": file_id}).get("result") or {}
            file_path = file_info.get("file_path")
            if not file_path:
                return None
            dl_url = f"https://api.telegram.org/file/bot{self.token}/{file_path}"
            local_path = f"/tmp/tg_upload_{int(time.time())}.jpg"
            urllib.request.urlretrieve(dl_url, local_path)
            return local_path if os.path.exists(local_path) else None
        except Exception as exc:
            print(f"[!] Could not download Telegram photo: {exc}")
            return None

    def send_preview_screenshots(self, chat_id: int, route_path: str = "/") -> None:
        clean_route = "/" + (route_path or "/").lstrip("/")
        self.send_message(chat_id, f"📸 Đang chụp ảnh màn hình giao diện `{clean_route}` (Desktop & Mobile)...")
        desk_img = capture_page_screenshot(clean_route, viewport="desktop")
        mob_img = capture_page_screenshot(clean_route, viewport="mobile")
        if desk_img:
            self.send_photo(chat_id, desk_img, caption=f"🖥️ Desktop Preview: {clean_route}")
        if mob_img:
            self.send_photo(chat_id, mob_img, caption=f"📱 Mobile Preview: {clean_route}")
        if not desk_img and not mob_img:
            self.send_message(chat_id, f"⚠️ Không thể chụp ảnh màn hình cho `{clean_route}`.")

    def split_message(self, text: str) -> list[str]:
        if not text:
            return [""]

        chunks = []
        remaining = text
        while remaining:
            if len(remaining) <= MAX_MESSAGE_LENGTH:
                chunks.append(remaining)
                break

            split_at = remaining.rfind("\n\n", 0, MAX_MESSAGE_LENGTH)
            if split_at < MAX_MESSAGE_LENGTH // 2:
                split_at = remaining.rfind("\n", 0, MAX_MESSAGE_LENGTH)
            if split_at < MAX_MESSAGE_LENGTH // 2:
                split_at = MAX_MESSAGE_LENGTH

            chunks.append(remaining[:split_at].strip())
            remaining = remaining[split_at:].strip()

        return chunks

    def send_long_message(self, chat_id: int, text: str, max_chunks: Optional[int] = None) -> None:
        chunks = self.split_message(text)
        if max_chunks is not None and len(chunks) > max_chunks:
            kept = chunks[:max_chunks]
            kept.append(
                f"[Output truncated after {max_chunks} Telegram messages. Full output is available with /tail or in openclaw/openclaw.log.]"
            )
            chunks = kept

        total = len(chunks)
        for index, chunk in enumerate(chunks, start=1):
            prefix = f"[{index}/{total}]\n" if total > 1 else ""
            self.request("sendMessage", {"chat_id": chat_id, "text": prefix + chunk})

    def trim_message(self, text: str, limit: int = MAX_MESSAGE_LENGTH) -> str:
        if len(text) <= limit:
            return text

        trimmed = text[: limit - 120].rstrip()
        split_at = trimmed.rfind("\n\n")
        if split_at > limit // 2:
            trimmed = trimmed[:split_at].rstrip()

        return trimmed + "\n\n[Trimmed to fit one Telegram message. Use /tail for the full log.]"

    def format_research_status_message(self, output: str) -> str:
        captures = len(re.findall(r"^\[\*\] Capture \d+/\d+:", output, flags=re.MULTILINE))
        selected_match = re.search(r"extracting facts from (\d+) detail pages", output)
        selected_count = selected_match.group(1) if selected_match else str(captures or "?")
        errors = len(re.findall(r"^\[!\]", output, flags=re.MULTILINE))

        status = [
            "✅ Multi-agent research complete",
            "",
            "✅ Role 1 Search Planner: complete",
            "✅ Role 2 Batch Link Selector: complete",
            "✅ Role 3 Sub-link Extractor: complete",
            f"✅ Role 4.1 Fact Extractor: complete ({captures or selected_count}/{selected_count} pages)",
            "✅ Role 4.2 Final Editor: complete",
        ]
        if errors:
            status.append(f"⚠️ Notes: {errors} warnings/errors were logged. Use /tail for details.")
        else:
            status.append("📄 Full technical log available with /tail.")

        return "\n".join(status)

    def extract_research_report_message(self, output: str) -> str:
        marker = "[*] Role 4.2: Final Editor"
        if marker in output:
            report = output.rsplit(marker, 1)[-1].strip()
        else:
            report = output.strip()

        report = re.sub(r"^\[\*\] Finished job: multi_agent_research\s*", "", report, flags=re.MULTILINE).strip()
        report = report.replace("[*] Finished job: multi_agent_research", "").strip()
        if not report:
            report = "Role 4.2 did not return a final report. Use /tail for details."

        return self.trim_message(report)

    def send_research_result(self, chat_id: int, output: str) -> None:
        self.send_message(chat_id, self.format_research_status_message(output))
        self.send_message(chat_id, self.extract_research_report_message(output))

    def format_content_job_message(self, name: str, output: str) -> str:
        failed = "[!] Job failed:" in output or re.search(r"^\[!\] Error:", output, flags=re.MULTILINE)
        article_match = re.search(r"\[\+\] Article (?:published|rewritten) successfully: (\S+)", output)
        version_match = re.search(r"\[\*\] Version saved: (v\d+)", output)
        word_match = re.search(r"\[\*\] Word count: ([^\n]+)", output)
        evidence_match = re.search(r"\[\*\] Verified reference evidence ready: (\d+) sources", output)
        evidence_low_match = re.search(r"Verified reference evidence below requested minimum: (\d+/\d+)", output)
        image_match = re.search(r"\[\*\] (?:Article images ready|Generated rewrite images): (\d+)", output)
        warnings = len(
            re.findall(
                r"^\[!\] (?!networkidle timed out)(?!Reference source skipped because file type is not supported)(?!Reference source skipped because extracted text is too short)",
                output,
                flags=re.MULTILINE,
            )
        )

        if failed:
            tail = "\n".join(output.strip().splitlines()[-18:])
            return self.trim_message(f"{name} failed.\n\n{tail}")

        lines = [f"{name} finished."]
        if article_match:
            lines.append(f"Article: {article_match.group(1)}")
        if version_match:
            lines.append(f"Version: {version_match.group(1)}")
        if word_match:
            lines.append(f"Word count: {word_match.group(1)}")
        if evidence_match:
            lines.append(f"Verified references: {evidence_match.group(1)} sources")
        elif evidence_low_match:
            lines.append(f"Verified references: {evidence_low_match.group(1)} sources")
        if image_match:
            lines.append(f"Images: {image_match.group(1)}")
        if warnings:
            lines.append(f"Warnings: {warnings}. Use /tail for details.")
        else:
            lines.append("Technical log available with /tail.")

        return "\n".join(lines)

    def is_allowed(self, user_id: int) -> bool:
        # Deny by default: an empty allow-list must never mean "everyone".
        return bool(self.allowed_user_ids) and user_id in self.allowed_user_ids

    def get_updates(self) -> list[dict]:
        response = self.request(
            "getUpdates",
            {
                "timeout": 45,
                "offset": self.offset,
                "allowed_updates": json.dumps(["message"]),
            },
        )
        return response.get("result", [])

    def run_job(self, chat_id: int, name: str, fn: Callable[[], str], action_type: str = "job") -> None:
        if name in self.running_jobs and self.running_jobs[name].is_alive():
            self.send_message(chat_id, f"{name} is already running.")
            return

        def target() -> None:
            from progress import set_progress_callback, clear_progress_callback
            set_progress_callback(lambda msg: self.send_message(chat_id, msg))
            try:
                self.send_message(chat_id, f"Started {name}. I will report back when it finishes.")
                output = fn()
                summary = output if output else f"{name} finished with no output."
                self.remember_job_output(chat_id, name, summary, action_type=action_type)
                if action_type == "multi_agent_research":
                    self.send_research_result(chat_id, summary)
                elif action_type in {
                    "generate_insight",
                    "generate_insight_from_url",
                    "generate_insight_from_urls",
                    "generate_insight_from_memory",
                    "generate_guide",
                    "generate_guide_from_url",
                    "generate_guide_from_urls",
                    "generate_guide_from_memory",
                    "rewrite_article",
                }:
                    self.send_message(chat_id, self.format_content_job_message(name, summary))
                else:
                    self.send_long_message(chat_id, summary, max_chunks=MAX_JOB_OUTPUT_CHUNKS)
            except JobFailed as exc:
                print(f"[!] Telegram job failed: {name}")
                self.send_message(chat_id, f"❌ {name} failed.\n\n{exc.short()}\n\nUse /tail for the full log.")
            except Exception as exc:
                print(f"[!] Telegram job thread crashed for {name}: {exc!r}")
                self.send_message(chat_id, f"❌ {name} crashed: {exc}")
            finally:
                clear_progress_callback()
                self.running_jobs.pop(name, None)

        thread = threading.Thread(target=target, daemon=True)
        self.running_jobs[name] = thread
        thread.start()

    def help_text(self) -> str:
        return (
            "OpenClaw AI Agent\n"
            "You can chat naturally. The bot will analyze your request, summarize the planned action, and only run the job after you reply `approve`.\n\n"
            "Commands\n"
            "/status - check env, database counts, and log path\n"
            "/run_batch - search, scrape, extract, save configured clinic targets\n"
            "/find_clinics <query> | [limit] - scout Google Places, scrape websites, extract clinic data, and save new clinics\n"
            "/inspect_clinic <name|slug> - inspect an existing clinic on our website (languages, gallery, sections, i18n)\n"
            "/rescan_clinic <name|slug> - deep re-scan & re-extract all fields/photos/i18n of an existing clinic via gpt-6-luna\n"
            "/rescan_all_clinics [limit] - rescan & enrich all clinics in the directory\n"
            "/scrape_clinic_url <clinic name> | <url> - scrape one known clinic website and save/update it\n"
            "/drafts [limit] - list clinics waiting for review (new clinics start as drafts, hidden from the website)\n"
            "/approve_clinic <slug|id|name|all> - publish a draft clinic (or all drafts)\n"
            "/reject_clinic <slug|id|name> - archive a clinic so it is hidden from the website\n"
            "/clinic_quality [threshold] - show clinic data quality scores and lowest-scoring clinics\n"
            "/directory_audit - show Track C entity/field/insurance/price coverage & Track E supply gaps\n"
            "/search_audit - run the Track D 30-query search benchmark suite\n"
            "/scout_gaps [count] - auto-scout top underserved (City x Specialty x Language) gaps\n"
            "/web_edit <instruction> - ask the Autonomous Web-Dev Agent to edit UI/design/code in src/\n"
            "/seo_audit [route] - audit Next.js metadata, JSON-LD schema, headings, alt tags, and DB SEO\n"
            "/seo_setup <instruction> - ask the SEO Agent to code/update metadata, JSON-LD, or sitemaps\n"
            "/site_analyze [route] - run deep Playwright UX/speed probe + database conversion funnel analysis\n"
            "/preview [route] - capture live Desktop & Mobile screenshots of a page\n"
            "/dev_diff - view uncommitted code changes in src/ and public/\n"
            "/publish [commit msg] - typecheck, git commit & push to GitHub main, and rebuild live web container\n"
            "/rollback - discard uncommitted edits in src/ and public/\n"
            "/enrich_clinics_google - add Google Places photos, rating, reviews, and Maps links to existing clinics\n"
            "/repair_clinic_images - generate missing clinic directory images\n"
            "/repair_article_images - generate missing article images\n"
            "/repair_article_slugs - convert non-ASCII article slugs to URL-safe ASCII\n"
            "/delete_article <id|slug|title> - delete one article after confirmation\n"
            "/delete_clinic <id|slug|name> - delete one clinic after confirmation\n"
            "/change_clinic_feature_image <id|slug|name> [| image_url] - change or rotate the feature image of a clinic\n"
            "/newsletter_list [limit] - list newsletter subscribers\n"
            "/newsletter_add <email> - manually add a newsletter subscriber\n"
            "/newsletter_remove <email> - unsubscribe an email address\n"
            "/check_claims - list pending clinic claim requests and submissions\n"
            "/approve_claim <id> - approve a claim request or clinic submission\n"
            "/reject_claim <id> - reject a claim request or clinic submission\n"
            "/rewrite_article <id|slug|title> | <edit instruction> - rewrite an article and save it as the next version\n"
            "/generate_blog [topic] - alias for /generate_insight\n"
            "/generate_insight [topic] - generate one SEO insight article, 1200-1500 words, plus 3-5 AI images\n"
            "/generate_blog_from_url <url...> - alias for /generate_insight_from_url\n"
            "/generate_insight_from_url <url...> - analyze one or more reference URLs and publish original SEO insights, plus 3-5 AI images each\n"
            "/generate_guide [topic] - generate one pillar guide, about 3000 words, plus 3-5 AI images\n"
            "/generate_guide_from_url <url...> - analyze one or more reference URLs and publish original pillar guides\n"
            "/generate_pulse [topic] - generate one monthly AHH Pulse newsletter issue (spotlights clinics, drafts advice column, generates cover image)\n"
            "/research <topic> - run multi-agent research and return a sourced report\n"
            "/ask <message> - ask the OpenClaw AI agent\n"
            "/stats [scope] [period] - hỏi đáp thống kê website (traffic, posts, clinics, seo)\n"
            "/stats_report [scope] [period] - xuất báo cáo chi tiết kèm biểu đồ và file Markdown\n"
            "/connect_gsc [site_url] - kết nối Google Search Console để đọc dữ liệu search thực\n"
            "/connect_ga4 [property_id] - kết nối Google Analytics 4 Data API\n"
            "/anomalies - kiểm tra cảnh báo bất thường (drop view, broken links, sitemap lỗi)\n"
            "/analytics - show traffic stats, top searches, and clicked clinics\n"
            "/prompt - show the current agent system prompt\n"
            "/tail - show recent OpenClaw log\n"
            "/help - show this menu\n\n"
            "Security: set TELEGRAM_ALLOWED_USER_IDS in openclaw/.env to restrict access."
        )

    def startup_log_text(self) -> str:
        return (
            "[*] OpenClaw Telegram bot is running.\n"
            "[*] Blog generation commands:\n"
            "    /generate_blog [topic]              -> generate one SEO blog/insight\n"
            "    /generate_insight [topic]           -> same as /generate_blog\n"
            "    /generate_blog_from_url <url...>    -> generate blog(s) from reference URL(s)\n"
            "    /generate_guide [topic]             -> generate one SEO pillar guide\n"
            "    /rewrite_article <target> | <edit>  -> rewrite and save as next version\n"
            "[*] Utility commands: /status, /tail, /help\n"
            "[*] Press Ctrl+C to stop."
        )

    def extract_urls(self, text: str) -> list[str]:
        matches = re.findall(r"https?://[^\s\"'<>]+", text)
        urls = []

        for match in matches:
            url = match.rstrip(").,];")
            if url not in urls:
                urls.append(url)

        return urls

    def build_approve_all_drafts_action(self) -> dict:
        try:
            from admin_actions import count_draft_clinics

            count_text = str(count_draft_clinics())
        except Exception as exc:  # the confirmation must still work if the count fails
            print(f"[!] Could not count draft clinics: {exc!r}")
            count_text = "all"
        return {
            "type": "approve_all_draft_clinics",
            "name": "approve_all_draft_clinics",
            "summary": (
                f"You want to PUBLISH {count_text} draft clinic(s) so they become visible on the website.\n\n"
                "Some drafts may have UNVERIFIED languages. Review them first with /drafts if you are unsure.\n"
                "Reply `approve` to publish them, or `cancel`."
            ),
        }

    def build_delete_action(self, item_type: str, target: str) -> dict:
        action_type = "delete_article" if item_type == "article" else "delete_clinic"
        label = "article/blog/insight" if item_type == "article" else "clinic"
        return {
            "type": action_type,
            "name": f"{action_type}: {target[:48]}",
            "target": target,
            "summary": (
                f"You want to delete this {label} from the database, correct?\n\n"
                f"Target: {target}\n\n"
                "If you approve, OpenClaw will find exactly one record by id, slug, name, or title, then delete it.\n"
                "This is a real destructive data operation. Reply `approve` to continue, or `cancel` if you are unsure."
            ),
        }

    def build_change_clinic_feature_image_action(self, target: str, image_url: Optional[str] = None) -> dict:
        summary_details = f"Target clinic: {target}\n"
        if image_url:
            summary_details += f"New feature image URL: {image_url}\n"
        else:
            summary_details += "Action: Rotate to the next image in the clinic's list of images/gallery.\n"

        return {
            "type": "change_clinic_feature_image",
            "name": f"change_clinic_feature_image: {target[:48]}",
            "target": target,
            "image_url": image_url,
            "summary": (
                "You want OpenClaw to change the feature image for this clinic, correct?\n\n"
                f"{summary_details}\n"
                "If you approve, OpenClaw will find the clinic, and update its metadata to set/rotate the feature image.\n"
                "This will update database records. Reply `approve` to continue."
            ),
        }

    def build_newsletter_list_action(self, limit: int = 50) -> dict:
        return {
            "type": "newsletter_list",
            "name": f"newsletter_list: limit {limit}",
            "limit": limit,
            "summary": (
                "You want OpenClaw to retrieve the list of newsletter subscribers, correct?\n\n"
                f"Limit: {limit} subscribers\n\n"
                "If you approve, OpenClaw will query the database and print the list of email subscribers with timestamps.\n"
                "Reply `approve` to continue."
            ),
        }

    def build_newsletter_add_action(self, email: str) -> dict:
        return {
            "type": "newsletter_add",
            "name": f"newsletter_add: {email[:48]}",
            "email": email,
            "summary": (
                "You want to manually subscribe an email to the newsletter list, correct?\n\n"
                f"Email to subscribe: {email}\n\n"
                "If you approve, OpenClaw will add this subscriber to the database.\n"
                "Reply `approve` to continue."
            ),
        }

    def build_newsletter_remove_action(self, email: str) -> dict:
        return {
            "type": "newsletter_remove",
            "name": f"newsletter_remove: {email[:48]}",
            "email": email,
            "summary": (
                "You want to remove (unsubscribe) an email from the newsletter list, correct?\n\n"
                f"Email to unsubscribe: {email}\n\n"
                "If you approve, OpenClaw will delete this subscriber record from the database.\n"
                "Reply `approve` to continue."
            ),
        }

    def build_check_claims_action(self) -> dict:
        return {
            "type": "check_claims",
            "name": "check_claims",
            "summary": (
                "You want OpenClaw to check pending profile claims and submissions, correct?\n\n"
                "If you approve, OpenClaw will query the database and print all pending clinic claim requests and new profile submissions.\n"
                "Reply `approve` to continue."
            ),
        }

    def build_approve_claim_action(self, target: str) -> dict:
        return {
            "type": "approve_claim",
            "name": f"approve_claim: {target[:48]}",
            "target": target,
            "summary": (
                "You want to approve this clinic claim request or submission, correct?\n\n"
                f"Target Request/Submission ID: {target}\n\n"
                "If you approve, OpenClaw will mark the request as approved and link/create the clinic in the database.\n"
                "Reply `approve` to continue."
            ),
        }

    def build_reject_claim_action(self, target: str) -> dict:
        return {
            "type": "reject_claim",
            "name": f"reject_claim: {target[:48]}",
            "target": target,
            "summary": (
                "You want to reject this clinic claim request or submission, correct?\n\n"
                f"Target Request/Submission ID: {target}\n\n"
                "If you approve, OpenClaw will mark the request as rejected in the database.\n"
                "Reply `approve` to continue."
            ),
        }

    def build_rewrite_article_action(self, target: str, instruction: str) -> dict:
        return {
            "type": "rewrite_article",
            "name": f"rewrite_article: {target[:48]}",
            "target": target,
            "instruction": instruction,
            "summary": (
                "You want OpenClaw to rewrite/update an existing blog or insight article, correct?\n\n"
                f"Article to rewrite: {target}\n\n"
                f"Requested edits OpenClaw understood:\n{instruction}\n\n"
                "If you approve, OpenClaw will:\n"
                "1. Find the article by id, slug, or title.\n"
                "2. Use the current article content as context.\n"
                "3. Regenerate the article according to the requested edits above.\n"
                "4. Save the current article as a historical version in `seo_meta.versions`.\n"
                "5. Keep the current slug/URL and publish the rewrite as the next version, such as v2 or v3.\n"
                "6. Update content, excerpt, tags, and SEO metadata in the database.\n\n"
                "This may call OpenRouter and update database records.\n"
                "Reply `approve` to continue. Send a new request if you want to change the edit instructions."
            ),
        }

    def parse_limit_value(self, value, default: int = 1) -> int:
        try:
            limit = int(value)
        except (TypeError, ValueError):
            limit = default
        return max(1, min(limit, 10))

    def parse_find_clinics_payload(self, payload: str) -> tuple[str, int]:
        payload = (payload or "").strip()
        if not payload:
            return "", 1

        query = payload
        limit = 1
        if "|" in payload:
            query_part, limit_part = payload.rsplit("|", 1)
            query = query_part.strip()
            limit = self.parse_limit_value(limit_part.strip(), default=1)
        else:
            match = re.search(r"\s+(?:limit|top|count)\s*[:=]?\s*(\d+)\s*$", payload, flags=re.IGNORECASE)
            if match:
                limit = self.parse_limit_value(match.group(1), default=1)
                query = payload[: match.start()].strip()

        return query, limit

    def infer_clinic_name_from_url(self, url: str) -> str:
        domain = urllib.parse.urlparse(url).netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        domain = domain.split(":")[0]
        return f"Clinic from {domain}" if domain else "Clinic from URL"

    def parse_scrape_clinic_url_payload(self, payload: str) -> tuple[str, Optional[str]]:
        payload = (payload or "").strip()
        urls = self.extract_urls(payload)
        if not urls:
            return "", None

        url = urls[0]
        name = payload.replace(url, "").strip(" |:-\"'“”")
        if "|" in payload:
            name_part, url_part = [part.strip() for part in payload.split("|", 1)]
            parsed_urls = self.extract_urls(url_part)
            if parsed_urls:
                url = parsed_urls[0]
                name = name_part.strip(" \"'“”")

        name = re.sub(
            r"\b(please|pls|vui lòng|vui long|hãy|hay|giúp|giup|scrape|crawl|import|add|save|create|from|thêm|them|lưu|luu|cào|cao|clinic|phòng khám|phong kham|profile|directory|url|website)\b",
            " ",
            name,
            flags=re.IGNORECASE,
        )
        name = re.sub(r"\s+", " ", name).strip(" |:-\"'“”")

        if not name:
            name = self.infer_clinic_name_from_url(url)

        return name, url

    def run_url_batch(self, urls: list[str], fn: Callable[[str], str]) -> str:
        outputs = []
        total = len(urls)

        for index, url in enumerate(urls, start=1):
            outputs.append(f"===== URL {index}/{total}: {url} =====")
            try:
                outputs.append(fn(url))
            except JobFailed as exc:
                # One bad URL must not abort the rest of the batch.
                outputs.append(f"❌ FAILED: {exc.short()}")

        return "\n\n".join(outputs)

    def run_pending_action(self, chat_id: int, action: dict) -> None:
        action_type = action["type"]

        if action_type == "generate_insight_from_url":
            self.run_job(
                chat_id,
                action["name"],
                lambda: generate_insight_from_url_job(action["url"]),
                action_type=action_type,
            )
        elif action_type == "generate_insight_from_urls":
            self.run_job(
                chat_id,
                action["name"],
                lambda: self.run_url_batch(action["urls"], generate_insight_from_url_job),
                action_type=action_type,
            )
        elif action_type == "generate_guide_from_url":
            self.run_job(
                chat_id,
                action["name"],
                lambda: generate_guide_from_url_job(action["url"]),
                action_type=action_type,
            )
        elif action_type == "generate_guide_from_urls":
            self.run_job(
                chat_id,
                action["name"],
                lambda: self.run_url_batch(action["urls"], generate_guide_from_url_job),
                action_type=action_type,
            )
        elif action_type == "generate_insight_from_memory":
            self.run_job(
                chat_id,
                action["name"],
                lambda: generate_insight_from_context_job(
                    action["reference_text"],
                    action["instruction"],
                    action["reference_label"],
                ),
                action_type=action_type,
            )
        elif action_type == "generate_guide_from_memory":
            self.run_job(
                chat_id,
                action["name"],
                lambda: generate_guide_from_context_job(
                    action["reference_text"],
                    action["instruction"],
                    action["reference_label"],
                ),
                action_type=action_type,
            )
        elif action_type == "repair_clinic_images":
            self.run_job(chat_id, action["name"], repair_clinic_images_job, action_type=action_type)
        elif action_type == "enrich_clinics_google":
            self.run_job(chat_id, action["name"], enrich_clinics_google_job, action_type=action_type)
        elif action_type == "repair_article_images":
            self.run_job(chat_id, action["name"], repair_article_images_job, action_type=action_type)
        elif action_type == "regenerate_article_images":
            self.run_job(
                chat_id,
                action["name"],
                lambda: regenerate_article_images_job(action["target"], action.get("image_count", 3)),
                action_type=action_type,
            )
        elif action_type == "repair_article_slugs":
            self.run_job(chat_id, action["name"], repair_article_slugs_job, action_type=action_type)
        elif action_type == "delete_article":
            self.run_job(chat_id, action["name"], lambda: delete_article_job(action["target"]), action_type=action_type)
        elif action_type == "delete_clinic":
            self.run_job(chat_id, action["name"], lambda: delete_clinic_job(action["target"]), action_type=action_type)
        elif action_type == "approve_all_draft_clinics":
            self.run_job(chat_id, action["name"], approve_all_draft_clinics_job, action_type=action_type)
        elif action_type == "approve_clinic":
            self.run_job(chat_id, action["name"], lambda: approve_clinic_job(action["target"]), action_type=action_type)
        elif action_type == "reject_clinic":
            self.run_job(chat_id, action["name"], lambda: reject_clinic_job(action["target"]), action_type=action_type)
        elif action_type == "change_clinic_feature_image":
            self.run_job(
                chat_id,
                action["name"],
                lambda: change_clinic_feature_image_job(action["target"], action.get("image_url")),
                action_type=action_type,
            )
        elif action_type == "newsletter_list":
            self.run_job(
                chat_id,
                action["name"],
                lambda: list_newsletter_subscribers_job(action.get("limit", 50)),
                action_type=action_type,
            )
        elif action_type == "newsletter_add":
            self.run_job(
                chat_id,
                action["name"],
                lambda: add_newsletter_subscriber_job(action["email"]),
                action_type=action_type,
            )
        elif action_type == "newsletter_remove":
            self.run_job(
                chat_id,
                action["name"],
                lambda: remove_newsletter_subscriber_job(action["email"]),
                action_type=action_type,
            )
        elif action_type == "check_claims":
            self.run_job(
                chat_id,
                action["name"],
                check_claims_job,
                action_type=action_type,
            )
        elif action_type == "approve_claim":
            self.run_job(
                chat_id,
                action["name"],
                lambda: approve_claim_job(action["target"]),
                action_type=action_type,
            )
        elif action_type == "reject_claim":
            self.run_job(
                chat_id,
                action["name"],
                lambda: reject_claim_job(action["target"]),
                action_type=action_type,
            )
        elif action_type == "rewrite_article":
            self.run_job(
                chat_id,
                action["name"],
                lambda: rewrite_article_job(action["target"], action["instruction"]),
                action_type=action_type,
            )
        elif action_type == "run_batch":
            self.run_job(chat_id, action["name"], run_batch_job, action_type=action_type)
        elif action_type == "find_clinics":
            query = action["query"]
            limit = action.get("limit", 1)
            required_languages = action.get("required_languages") or []
            facility_types = action.get("facility_types") or []
            self.run_job(
                chat_id,
                action["name"],
                lambda: scout_pipeline_job(
                    query,
                    limit,
                    required_languages=required_languages or None,
                    included_types=facility_types or None,
                    telegram_updater_callback=lambda msg: self.send_message(chat_id, msg),
                ),
                action_type=action_type,
            )
        elif action_type == "scrape_clinic_url":
            clinic_name = action["clinic_name"]
            clinic_url = action["url"]
            self.run_job(
                chat_id,
                action["name"],
                lambda: scrape_clinic_url_job(
                    clinic_name,
                    clinic_url,
                    telegram_updater_callback=lambda msg: self.send_message(chat_id, msg),
                ),
                action_type=action_type,
            )
        elif action_type == "generate_insight":
            self.run_job(chat_id, action["name"], lambda: generate_insight_job(action.get("topic")), action_type=action_type)
        elif action_type == "generate_pulse":
            self.run_job(chat_id, action["name"], lambda: generate_pulse_job(action.get("topic")), action_type=action_type)
        elif action_type == "generate_guide":
            self.run_job(chat_id, action["name"], lambda: generate_guide_job(action.get("topic")), action_type=action_type)
        elif action_type == "multi_agent_research":
            self.run_job(chat_id, action["name"], lambda: research_job(action["request"]), action_type=action_type)
        elif action_type == "check_analytics":
            timeframe = action.get("timeframe", "week")
            filter_type = action.get("filter_type", "all")
            self.run_job(chat_id, action["name"], lambda: check_analytics_job(timeframe, filter_type), action_type=action_type)
        elif action_type == "web_edit":
            instruction = action["instruction"]
            img_path = action.get("image_path")
            self.run_job(
                chat_id,
                action["name"],
                lambda: web_edit_job(
                    instruction,
                    image_path=img_path,
                    progress_callback=lambda msg: self.send_message(chat_id, msg),
                ),
                action_type=action_type,
            )
        elif action_type == "seo_audit":
            self.run_job(chat_id, action["name"], lambda: seo_audit_job(action.get("route")), action_type=action_type)
        elif action_type == "seo_setup":
            instruction = action["instruction"]
            self.run_job(
                chat_id,
                action["name"],
                lambda: seo_setup_job(instruction, progress_callback=lambda msg: self.send_message(chat_id, msg)),
                action_type=action_type,
            )
        elif action_type == "site_analyze":
            route = action.get("route", "/")
            tf = action.get("timeframe", "week")
            self.run_job(chat_id, action["name"], lambda: site_analyze_job(route, tf), action_type=action_type)
        elif action_type == "publish_code":
            commit_msg = action.get("commit_message")
            self.run_job(
                chat_id,
                action["name"],
                lambda: publish_code_job(
                    commit_message=commit_msg,
                    telegram_updater_callback=lambda msg: self.send_message(chat_id, msg),
                ),
                action_type=action_type,
            )
        elif action_type == "rollback_code":
            self.send_message(chat_id, rollback_code_job())
        elif action_type == "stats_question":
            question = action.get("question") or action.get("name", "website analytics")
            period = action.get("period")
            lang = action.get("lang") or self.chat_lang.get(chat_id, "en")
            self.run_job(
                chat_id,
                action["name"],
                lambda: stats_question_job(question, period=period, lang=lang),
                action_type=action_type,
            )
        elif action_type == "inspect_clinic":
            target = action.get("target") or action.get("query") or ""
            lang = action.get("lang") or self.chat_lang.get(chat_id, "vi")
            self.send_message(chat_id, inspect_clinic_job(target, lang=lang))
        elif action_type == "rescan_clinic":
            target = action.get("target") or action.get("query") or ""
            self.run_job(
                chat_id,
                action["name"],
                lambda: rescan_clinic_job(target),
                action_type=action_type,
            )
        elif action_type == "rescan_all_clinics":
            limit = int(action.get("limit") or 0)
            self.run_job(
                chat_id,
                action["name"],
                lambda: rescan_all_clinics_job(limit=limit),
                action_type=action_type,
            )
        elif action_type == "stats_report":
            arg = action.get("arg", "")
            lang = action.get("lang") or self.chat_lang.get(chat_id, "en")
            def _run_report_pending():
                rep = stats_report_job(arg, lang=lang)
                md_path = rep.get("markdown_path")
                charts = rep.get("chart_paths") or []
                summary = rep.get("summary") or "Report generation complete."
                hdr = "✅ **Detailed Report Complete:**\n\n" if lang != "vi" else "✅ **Báo cáo chi tiết đã hoàn tất:**\n\n"
                self.send_message(chat_id, f"{hdr}{summary}")
                for chart in charts:
                    self.send_photo(chat_id, chart, caption="Website Analytics Chart")
                if md_path and os.path.exists(md_path):
                    self.send_document(chat_id, md_path, caption="Full Analytics Report (Markdown)")
                return "Detailed report delivered with charts and markdown file." if lang != "vi" else "Báo cáo chi tiết đã được gửi kèm biểu đồ và file tài liệu."
            self.run_job(chat_id, action["name"], _run_report_pending, action_type=action_type)
        else:
            self.send_message(chat_id, "I do not know how to run this action yet. Please send a clearer request.")

    def handle_command(self, chat_id: int, text: str) -> None:
        command = text.split()[0].split("@")[0].lower()

        if command in {"/start", "/help"}:
            self.send_message(chat_id, self.help_text())
        elif command == "/status":
            self.send_message(chat_id, check_status())
        elif command in {"/analytics", "/check_analytics"}:
            args = text.split()[1:]
            timeframe = "week"
            filter_type = "all"
            for arg in args:
                arg_lower = arg.lower().strip()
                if arg_lower in ("today", "ngay", "hom-nay", "hôm-nay"):
                    timeframe = "today"
                elif arg_lower in ("week", "tuan", "tuần"):
                    timeframe = "week"
                elif arg_lower in ("month", "thang", "tháng"):
                    timeframe = "month"
                
                if arg_lower in ("views", "view", "truy-cap", "truy-cập"):
                    filter_type = "views"
                elif arg_lower in ("searches", "search", "tim-kiem", "tìm-kiếm"):
                    filter_type = "searches"
                elif arg_lower in ("clicks", "click"):
                    filter_type = "clicks"
                elif arg_lower in ("claims", "claim"):
                    filter_type = "claims"
            
            self.run_job(
                chat_id,
                f"check_analytics ({timeframe}, {filter_type})",
                lambda: check_analytics_job(timeframe, filter_type),
                action_type="check_analytics"
            )
        elif command == "/stats":
            arg = re.sub(r"^/stats(?:@\w+)?", "", text, count=1).strip()
            lang = self.chat_lang.get(chat_id, "en")
            wait_msg = "🔍 Đang tra cứu thống kê website..." if lang == "vi" else "🔍 Fetching website analytics..."
            self.send_message(chat_id, wait_msg)
            self.run_job(
                chat_id,
                f"stats: {arg or 'overview'}",
                lambda: stats_question_job(arg or ("tổng quan tình hình website" if lang == "vi" else "overview of the website"), lang=lang),
                action_type="stats_question",
            )
        elif command == "/stats_report":
            arg = re.sub(r"^/stats_report(?:@\w+)?", "", text, count=1).strip()
            lang = self.chat_lang.get(chat_id, "en")
            wait_msg = "📊 Đang xuất báo cáo chi tiết và biểu đồ..." if lang == "vi" else "📊 Generating detailed analytics report & charts..."
            self.send_message(chat_id, wait_msg)
            def _run_report_cmd():
                rep = stats_report_job(arg, lang=lang)
                md_path = rep.get("markdown_path")
                charts = rep.get("chart_paths") or []
                summary = rep.get("summary") or ("Đã tạo xong báo cáo." if lang == "vi" else "Report generation complete.")
                hdr = "✅ **Báo cáo chi tiết đã hoàn tất:**\n\n" if lang == "vi" else "✅ **Detailed Report Complete:**\n\n"
                self.send_message(chat_id, f"{hdr}{summary}")
                for chart in charts:
                    caption = "Biểu đồ thống kê website" if lang == "vi" else "Website Analytics Chart"
                    self.send_photo(chat_id, chart, caption=caption)
                if md_path and os.path.exists(md_path):
                    doc_cap = "Báo cáo đầy đủ (Markdown)" if lang == "vi" else "Full Analytics Report (Markdown)"
                    self.send_document(chat_id, md_path, caption=doc_cap)
                return "Báo cáo chi tiết đã được gửi kèm biểu đồ và file tài liệu." if lang == "vi" else "Detailed report delivered with charts and markdown file."
            self.run_job(
                chat_id,
                f"stats_report: {arg or 'week'}",
                _run_report_cmd,
                action_type="stats_report",
            )
        elif command == "/connect_gsc":
            arg = re.sub(r"^/connect_gsc(?:@\w+)?", "", text, count=1).strip()
            self.send_message(chat_id, connect_gsc_job(arg))
        elif command == "/connect_ga4":
            arg = re.sub(r"^/connect_ga4(?:@\w+)?", "", text, count=1).strip()
            self.send_message(chat_id, connect_ga4_job(arg))
        elif command in {"/anomalies", "/check_anomalies"}:
            self.send_message(chat_id, check_anomalies_job(lang=self.chat_lang.get(chat_id, "en")))
        elif command == "/tail":
            self.send_message(chat_id, tail_log())
        elif command in {"/clinic_quality", "/quality"}:
            arg = re.sub(r"^/(?:clinic_quality|quality)(?:@\w+)?", "", text, count=1).strip()
            threshold = int(arg) if arg.isdigit() else 85
            self.send_message(chat_id, check_clinic_quality(threshold=threshold))
        elif command in {"/directory_audit", "/audit_directory"}:
            self.send_message(chat_id, directory_audit_job())
        elif command in {"/search_audit", "/benchmark_search"}:
            self.send_message(chat_id, search_audit_job())
        elif command == "/scout_gaps":
            arg = re.sub(r"^/scout_gaps(?:@\w+)?", "", text, count=1).strip()
            limit_gaps = int(arg) if arg.isdigit() else 3
            self.send_message(
                chat_id,
                f"Đã nhận lệnh `/scout_gaps`. Đang tự động tìm các ô (City × Specialty × Language) thiếu phòng khám nhất và chạy trinh sát cho {limit_gaps} ô đầu tiên...",
            )
            self.run_job(
                chat_id,
                f"scout_gaps ({limit_gaps} gaps)",
                lambda: scout_gaps_job(
                    limit_gaps=limit_gaps,
                    per_gap_limit=2,
                    telegram_updater_callback=lambda msg: self.send_message(chat_id, msg),
                ),
                action_type="find_clinics",
            )
        elif command in {"/web_edit", "/edit_web", "/code"}:
            instruction = re.sub(r"^/(?:web_edit|edit_web|code)(?:@\w+)?", "", text, count=1).strip()
            if not instruction:
                self.send_message(
                    chat_id,
                    "Cách dùng: `/web_edit <mô tả chỉnh sửa giao diện hoặc tính năng>`\nVí dụ: `/web_edit Đổi tiêu đề phụ ở trang /search và thêm badge Verified cho các thẻ phòng khám`",
                )
            else:
                self.run_job(
                    chat_id,
                    f"web_edit: {instruction[:42]}",
                    lambda: web_edit_job(
                        instruction,
                        progress_callback=lambda msg: self.send_message(chat_id, msg),
                    ),
                    action_type="web_edit",
                )
        elif command == "/seo_audit":
            route = re.sub(r"^/seo_audit(?:@\w+)?", "", text, count=1).strip() or None
            self.run_job(
                chat_id,
                f"seo_audit ({route or 'all'})",
                lambda: seo_audit_job(target_route=route),
                action_type="seo_audit",
            )
        elif command == "/seo_setup":
            instruction = re.sub(r"^/seo_setup(?:@\w+)?", "", text, count=1).strip()
            if not instruction:
                self.send_message(
                    chat_id,
                    "Cách dùng: `/seo_setup <yêu cầu tối ưu SEO>`\nVí dụ: `/seo_setup Kiểm tra và bổ sung JSON-LD Organization & WebSite vào src/app/layout.tsx`",
                )
            else:
                self.run_job(
                    chat_id,
                    f"seo_setup: {instruction[:42]}",
                    lambda: seo_setup_job(
                        instruction,
                        progress_callback=lambda msg: self.send_message(chat_id, msg),
                    ),
                    action_type="seo_setup",
                )
        elif command == "/site_analyze":
            arg = re.sub(r"^/site_analyze(?:@\w+)?", "", text, count=1).strip()
            route = arg if arg.startswith("/") else "/"
            self.run_job(
                chat_id,
                f"site_analyze ({route})",
                lambda: site_analyze_job(target_route=route, timeframe="week"),
                action_type="site_analyze",
            )
        elif command == "/preview":
            route = re.sub(r"^/preview(?:@\w+)?", "", text, count=1).strip() or "/"
            threading.Thread(
                target=lambda: self.send_preview_screenshots(chat_id, route),
                daemon=True,
            ).start()
        elif command in {"/dev_diff", "/git_status"}:
            self.send_message(chat_id, dev_diff_job())
        elif command == "/rollback":
            self.send_message(chat_id, rollback_code_job())
        elif command == "/publish":
            commit_msg = re.sub(r"^/publish(?:@\w+)?", "", text, count=1).strip() or None
            self.run_job(
                chat_id,
                "publish_to_github_and_live",
                lambda: publish_code_job(
                    commit_message=commit_msg,
                    telegram_updater_callback=lambda msg: self.send_message(chat_id, msg),
                ),
                action_type="publish_code",
            )
        elif command == "/prompt":
            self.send_message(chat_id, OPENCLAW_AGENT_SYSTEM_PROMPT)
        elif command == "/research":
            request = text.removeprefix("/research").strip()
            if not request:
                self.send_message(chat_id, "Use: /research Hanta virus symptoms and prevention latest")
            else:
                self.run_job(chat_id, f"multi_agent_research: {request[:48]}", lambda: research_job(request), action_type="multi_agent_research")
        elif command == "/ask":
            question = text.removeprefix("/ask").strip()
            if not question:
                self.send_message(chat_id, "Use: /ask What should I run to repair directory images?")
            else:
                self.send_message(chat_id, ask_openclaw_agent(question))
        elif command == "/run_batch":
            self.run_job(chat_id, "run_batch", run_batch_job, action_type="run_batch")
        elif command in {"/inspect_clinic", "/check_clinic"}:
            target = re.sub(r"^/(?:inspect_clinic|check_clinic)(?:@\w+)?", "", text, count=1).strip()
            if not target:
                self.send_message(chat_id, "Use: /inspect_clinic <name|slug>")
            else:
                self.send_message(chat_id, inspect_clinic_job(target, lang=self.chat_lang.get(chat_id, "vi")))
        elif command == "/rescan_clinic":
            target = re.sub(r"^/rescan_clinic(?:@\w+)?", "", text, count=1).strip()
            if not target:
                self.send_message(chat_id, "Use: /rescan_clinic <name|slug>")
            else:
                self.run_job(chat_id, f"rescan_clinic: {target[:40]}", lambda: rescan_clinic_job(target), action_type="rescan_clinic")
        elif command == "/rescan_all_clinics":
            arg = re.sub(r"^/rescan_all_clinics(?:@\w+)?", "", text, count=1).strip()
            limit = int(arg) if arg.isdigit() else 0
            self.run_job(chat_id, "rescan_all_clinics", lambda: rescan_all_clinics_job(limit=limit), action_type="rescan_all_clinics")
        elif command == "/find_clinics":
            payload = re.sub(r"^/find_clinics(?:@\w+)?", "", text, count=1).strip()
            query, limit = self.parse_find_clinics_payload(payload)
            if not query:
                self.send_message(chat_id, "Use: /find_clinics Vietnamese dentist in Houston | 3")
            else:
                self.send_message(chat_id, f"Đã nhận lệnh. Đang trinh sát Google Places cho từ khóa: '{query}'...")
                self.run_job(
                    chat_id,
                    f"find_clinics: {query[:48]}",
                    lambda: scout_pipeline_job(query, limit, telegram_updater_callback=lambda msg: self.send_message(chat_id, msg)),
                    action_type="find_clinics",
                )
        elif command == "/scrape_clinic_url":
            payload = re.sub(r"^/scrape_clinic_url(?:@\w+)?", "", text, count=1).strip()
            clinic_name, clinic_url = self.parse_scrape_clinic_url_payload(payload)
            if not clinic_url:
                self.send_message(chat_id, "Use: /scrape_clinic_url Dr. Van Tran Family Practice | https://www.drvantran.com/")
            else:
                self.send_message(chat_id, f"Đã nhận lệnh. Đang scrape clinic từ URL: {clinic_url}")
                self.run_job(
                    chat_id,
                    f"scrape_clinic_url: {clinic_name[:48]}",
                    lambda: scrape_clinic_url_job(
                        clinic_name,
                        clinic_url,
                        telegram_updater_callback=lambda msg: self.send_message(chat_id, msg),
                    ),
                    action_type="scrape_clinic_url",
                )
        elif command == "/repair_clinic_images":
            self.run_job(chat_id, "repair_clinic_images", repair_clinic_images_job, action_type="repair_clinic_images")
        elif command == "/enrich_clinics_google":
            self.run_job(chat_id, "enrich_clinics_google", enrich_clinics_google_job, action_type="enrich_clinics_google")
        elif command == "/repair_article_images":
            self.run_job(chat_id, "repair_article_images", repair_article_images_job, action_type="repair_article_images")
        elif command == "/repair_article_slugs":
            self.run_job(chat_id, "repair_article_slugs", repair_article_slugs_job, action_type="repair_article_slugs")
        elif command == "/delete_article":
            target = text.removeprefix("/delete_article").strip()
            if not target:
                self.send_message(chat_id, "Use: /delete_article <id|slug|title>")
            else:
                self.pending_actions[chat_id] = self.build_delete_action("article", target)
                self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
        elif command == "/drafts":
            raw_limit = text.removeprefix("/drafts").strip()
            limit = int(raw_limit) if raw_limit.isdigit() else 20
            self.run_job(chat_id, "drafts", lambda: list_draft_clinics_job(limit), action_type="drafts")
        elif command == "/approve_clinic":
            target = text.removeprefix("/approve_clinic").strip()
            if not target:
                self.send_message(chat_id, "Use: /approve_clinic <slug|id|name|all>")
            elif target.lower() == "all":
                self.pending_actions[chat_id] = self.build_approve_all_drafts_action()
                self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
            else:
                self.run_job(
                    chat_id, f"approve_clinic: {target[:40]}", lambda: approve_clinic_job(target), action_type="approve_clinic"
                )
        elif command == "/reject_clinic":
            target = text.removeprefix("/reject_clinic").strip()
            if not target:
                self.send_message(chat_id, "Use: /reject_clinic <slug|id|name>")
            else:
                self.run_job(
                    chat_id, f"reject_clinic: {target[:40]}", lambda: reject_clinic_job(target), action_type="reject_clinic"
                )
        elif command == "/delete_clinic":
            target = text.removeprefix("/delete_clinic").strip()
            if not target:
                self.send_message(chat_id, "Use: /delete_clinic <id|slug|name>")
            else:
                self.pending_actions[chat_id] = self.build_delete_action("clinic", target)
                self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
        elif command == "/change_clinic_feature_image":
            payload = text.removeprefix("/change_clinic_feature_image").strip()
            if not payload:
                self.send_message(chat_id, "Use: /change_clinic_feature_image <id|slug|name> [| image_url]")
            else:
                if "|" in payload:
                    target, image_url = [part.strip() for part in payload.split("|", 1)]
                else:
                    target = payload
                    image_url = None
                self.pending_actions[chat_id] = self.build_change_clinic_feature_image_action(target, image_url)
                self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
        elif command == "/newsletter_list":
            payload = text.removeprefix("/newsletter_list").strip()
            limit = self.parse_limit_value(payload, 50)
            self.pending_actions[chat_id] = self.build_newsletter_list_action(limit)
            self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
        elif command == "/newsletter_add":
            email = text.removeprefix("/newsletter_add").strip()
            if not email:
                self.send_message(chat_id, "Use: /newsletter_add <email>")
            else:
                self.pending_actions[chat_id] = self.build_newsletter_add_action(email)
                self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
        elif command == "/newsletter_remove":
            email = text.removeprefix("/newsletter_remove").strip()
            if not email:
                self.send_message(chat_id, "Use: /newsletter_remove <email>")
            else:
                self.pending_actions[chat_id] = self.build_newsletter_remove_action(email)
                self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
        elif command == "/check_claims":
            self.pending_actions[chat_id] = self.build_check_claims_action()
            self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
        elif command == "/approve_claim":
            target = text.removeprefix("/approve_claim").strip()
            if not target:
                self.send_message(chat_id, "Use: /approve_claim <id>")
            else:
                self.pending_actions[chat_id] = self.build_approve_claim_action(target)
                self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
        elif command == "/reject_claim":
            target = text.removeprefix("/reject_claim").strip()
            if not target:
                self.send_message(chat_id, "Use: /reject_claim <id>")
            else:
                self.pending_actions[chat_id] = self.build_reject_claim_action(target)
                self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
        elif command == "/rewrite_article":
            payload = text.removeprefix("/rewrite_article").strip()
            if not payload or "|" not in payload:
                self.send_message(chat_id, "Use: /rewrite_article <id|slug|title> | <edit instructions>")
            else:
                target, instruction = [part.strip() for part in payload.split("|", 1)]
                if not target or not instruction:
                    self.send_message(chat_id, "Use: /rewrite_article <id|slug|title> | <edit instructions>")
                else:
                    self.pending_actions[chat_id] = self.build_rewrite_article_action(target, instruction)
                    self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
        elif command in {"/generate_insight", "/generate_blog"}:
            topic = re.sub(r"^/(?:generate_insight|generate_blog)(?:@\w+)?", "", text, count=1).strip() or None
            job_name = "generate_blog" if not topic else f"generate_blog: {topic[:48]}"
            self.run_job(chat_id, job_name, lambda: generate_insight_job(topic), action_type="generate_insight")
        elif command in {"/generate_pulse", "/generate_newsletter"}:
            topic = re.sub(r"^/(?:generate_pulse|generate_newsletter)(?:@\w+)?", "", text, count=1).strip() or None
            job_name = "generate_pulse" if not topic else f"generate_pulse: {topic[:48]}"
            self.run_job(chat_id, job_name, lambda: generate_pulse_job(topic), action_type="generate_pulse")
        elif command in {"/generate_insight_from_url", "/generate_blog_from_url"}:
            payload = re.sub(r"^/(?:generate_insight_from_url|generate_blog_from_url)(?:@\w+)?", "", text, count=1).strip()
            source_urls = self.extract_urls(payload)
            if not source_urls:
                self.send_message(chat_id, "Use: /generate_blog_from_url https://example.com/article")
            elif len(source_urls) == 1:
                source_url = source_urls[0]
                self.run_job(
                    chat_id,
                    f"generate_blog_from_url: {source_url[:48]}",
                    lambda: generate_insight_from_url_job(source_url),
                    action_type="generate_insight_from_url",
                )
            else:
                self.run_job(
                    chat_id,
                    f"generate_blog_from_urls: {len(source_urls)} urls",
                    lambda: self.run_url_batch(source_urls, generate_insight_from_url_job),
                    action_type="generate_insight_from_urls",
                )
        elif command == "/generate_guide":
            topic = text.removeprefix("/generate_guide").strip() or None
            job_name = "generate_guide" if not topic else f"generate_guide: {topic[:48]}"
            self.run_job(chat_id, job_name, lambda: generate_guide_job(topic), action_type="generate_guide")
        elif command == "/generate_guide_from_url":
            source_urls = self.extract_urls(text.removeprefix("/generate_guide_from_url").strip())
            if not source_urls:
                self.send_message(chat_id, "Use: /generate_guide_from_url https://example.com/article")
            elif len(source_urls) == 1:
                source_url = source_urls[0]
                self.run_job(
                    chat_id,
                    f"generate_guide_from_url: {source_url[:48]}",
                    lambda: generate_guide_from_url_job(source_url),
                    action_type="generate_guide_from_url",
                )
            else:
                self.run_job(
                    chat_id,
                    f"generate_guide_from_urls: {len(source_urls)} urls",
                    lambda: self.run_url_batch(source_urls, generate_guide_from_url_job),
                    action_type="generate_guide_from_urls",
                )
        else:
            self.send_message(chat_id, "Unknown command.\n\n" + self.help_text())

    def handle_chat(self, chat_id: int, text: str) -> None:
        with self._pending_lock:
            current_pending = self.pending_actions.get(chat_id)
        with self._memory_lock:
            current_memory = self.chat_memory.get(chat_id)

        intent_res = run_intent_agent(
            text,
            memory=current_memory,
            pending_action=current_pending,
            preferred_lang=self.chat_lang.get(chat_id, "en"),
        )
        self.chat_lang[chat_id] = intent_res.lang

        # 1. Approval
        if intent_res.is_approval:
            with self._pending_lock:
                action = self.pending_actions.pop(chat_id, None)
            if not action:
                msg = "There is no pending action waiting for approval." if intent_res.lang != "vi" else "Không có thao tác nào đang chờ duyệt."
                self.send_message(chat_id, msg)
                return

            action_name = action.get("name") or action.get("type", "job")
            start_msg = f"Approval received. Starting: {action_name}" if intent_res.lang != "vi" else f"Đã xác nhận. Bắt đầu thực thi: {action_name}"
            self.send_message(chat_id, start_msg)
            self.run_pending_action(chat_id, action)
            return

        # 2. Rejection / Cancel
        if intent_res.is_rejection:
            with self._pending_lock:
                action = self.pending_actions.pop(chat_id, None)
            if action:
                action_name = action.get("name") or action.get("type", "job")
                cancel_msg = f"Pending action canceled: {action_name}" if intent_res.lang != "vi" else f"Đã hủy thao tác: {action_name}"
                self.send_message(chat_id, cancel_msg)
            else:
                msg = "There is no pending action to cancel." if intent_res.lang != "vi" else "Không có thao tác nào đang chờ để hủy."
                self.send_message(chat_id, msg)
            return

        # 2b. Immediate read-only action: inspect_clinic (does not require approval)
        if intent_res.action == "inspect_clinic":
            with self._pending_lock:
                self.pending_actions.pop(chat_id, None)
            target = (intent_res.parameters or {}).get("target") or (intent_res.parameters or {}).get("query") or text
            self.send_message(chat_id, inspect_clinic_job(str(target), lang=intent_res.lang))
            return

        # 2c. Immediate read-only action: list_drafts (does not require approval)
        if intent_res.action == "list_drafts":
            with self._pending_lock:
                self.pending_actions.pop(chat_id, None)
            raw_limit = (intent_res.parameters or {}).get("limit")
            limit = int(raw_limit) if str(raw_limit).isdigit() else 20
            self.run_job(chat_id, "drafts", lambda: list_draft_clinics_job(limit), action_type="drafts")
            return

        # 3. Requires Approval (New Action detected by IntentAgent)
        if intent_res.requires_approval and intent_res.confirmation_message:
            pending_dict = intent_res.to_pending_dict()
            with self._pending_lock:
                self.pending_actions[chat_id] = pending_dict
            self.send_message(chat_id, intent_res.confirmation_message)
            return

        # 4. Direct chat (IntentAgent answered directly)
        if intent_res.is_direct_chat and intent_res.direct_reply:
            with self._pending_lock:
                self.pending_actions.pop(chat_id, None)
            self.send_message(chat_id, intent_res.direct_reply)
            return

        # 5. Fallback to OpenClaw Agent
        with self._pending_lock:
            self.pending_actions.pop(chat_id, None)
        self.send_message(chat_id, ask_openclaw_agent(text))

    def run_forever(self) -> None:
        print(self.startup_log_text())

        while True:
            try:
                for update in self.get_updates():
                    self.offset = update["update_id"] + 1
                    message = update.get("message") or {}
                    text = message.get("text") or message.get("caption") or ""
                    photos = message.get("photo") or []
                    chat_id = message.get("chat", {}).get("id")
                    user_id = message.get("from", {}).get("id")

                    if not chat_id or not user_id or (not text and not photos):
                        continue

                    if not self.is_allowed(user_id):
                        self.send_message(chat_id, "You are not allowed to use this OpenClaw bot.")
                        continue

                    if photos and text:
                        local_img = self.download_telegram_photo(photos)
                        clean_instr = re.sub(r"^/(?:web_edit|edit_web|code)(?:@\w+)?", "", text, count=1).strip() or text
                        lang = self.chat_lang.get(chat_id, "en")
                        notice = (
                            f"📸 Đã nhận ảnh chụp màn hình kèm yêu cầu: “{clean_instr}”. Đang chuyển vào Web-Dev Agent..."
                            if lang == "vi" else
                            f"📸 Received screenshot with instruction: “{clean_instr}”. Forwarding to Web-Dev Agent..."
                        )
                        self.send_message(chat_id, notice)
                        self.run_job(
                            chat_id,
                            f"web_edit (vision): {clean_instr[:36]}",
                            lambda instr=clean_instr, img=local_img: web_edit_job(
                                instr,
                                image_path=img,
                                progress_callback=lambda msg: self.send_message(chat_id, msg),
                            ),
                            action_type="web_edit",
                        )
                        continue

                    if text.startswith("/"):
                        self.handle_command(chat_id, text)
                    else:
                        self.handle_chat(chat_id, text)
            except KeyboardInterrupt:
                print("[*] Stopping OpenClaw Telegram bot.")
                break
            except Exception as exc:
                print(f"[!] Telegram bot loop error: {exc}")
                time.sleep(5)


if __name__ == "__main__":
    TelegramBot().run_forever()

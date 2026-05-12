import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request
from typing import Callable, Optional, Union

from dotenv import load_dotenv
from openai import OpenAI

from ai_agent import ask_openclaw_agent
from agent_prompt import OPENCLAW_AGENT_SYSTEM_PROMPT
from jobs import (
    check_status,
    delete_article_job,
    delete_clinic_job,
    generate_guide_from_url_job,
    generate_guide_from_context_job,
    generate_guide_job,
    generate_insight_from_context_job,
    generate_insight_from_url_job,
    generate_insight_job,
    enrich_clinics_google_job,
    repair_article_images_job,
    repair_clinic_images_job,
    repair_article_slugs_job,
    research_job,
    rewrite_article_job,
    run_batch_job,
    tail_log,
)

load_dotenv(".env")
load_dotenv("../.env.local")

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"
MAX_MESSAGE_LENGTH = 3900
MAX_JOB_OUTPUT_CHUNKS = int(os.environ.get("TELEGRAM_MAX_JOB_OUTPUT_CHUNKS", "12"))
MAX_MEMORY_CHARS = int(os.environ.get("OPENCLAW_MEMORY_MAX_CHARS", "60000"))
MEMORY_PATH = os.path.join(os.path.dirname(__file__), "telegram_memory.json")
INTENT_MODEL = os.environ.get("OPENCLAW_INTENT_MODEL", "deepseek/deepseek-v4-flash")


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
        self.offset = 0
        self.running_jobs: dict[str, threading.Thread] = {}
        self.pending_actions: dict[int, dict] = {}
        self.chat_memory: dict[int, dict] = self.load_memory()

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
        try:
            with open(MEMORY_PATH, "w", encoding="utf-8") as memory_file:
                json.dump({str(chat_id): value for chat_id, value in self.chat_memory.items()}, memory_file, ensure_ascii=False, indent=2)
        except Exception as exc:
            print(f"[!] Could not save Telegram memory: {exc}")

    def remember_job_output(self, chat_id: int, name: str, output: str, action_type: str = "job") -> None:
        if not output:
            return

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
        with urllib.request.urlopen(request, timeout=70) as response:
            return json.loads(response.read().decode("utf-8"))

    def send_message(self, chat_id: int, text: str) -> None:
        chunks = [text[i:i + MAX_MESSAGE_LENGTH] for i in range(0, len(text), MAX_MESSAGE_LENGTH)] or [""]
        for chunk in chunks:
            self.request("sendMessage", {"chat_id": chat_id, "text": chunk})

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

        return trimmed + "\n\n[Đã rút gọn để vừa một tin nhắn Telegram. Xem full log bằng /tail.]"

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
            status.append(f"⚠️ Notes: {errors} warnings/errors were logged. Xem chi tiết bằng /tail.")
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
            report = "Role 4.2 không trả về báo cáo tổng hợp. Xem chi tiết bằng /tail."

        return self.trim_message(report)

    def send_research_result(self, chat_id: int, output: str) -> None:
        self.send_message(chat_id, self.format_research_status_message(output))
        self.send_message(chat_id, self.extract_research_report_message(output))

    def is_allowed(self, user_id: int) -> bool:
        return not self.allowed_user_ids or user_id in self.allowed_user_ids

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
            self.send_message(chat_id, f"Started {name}. I will report back when it finishes.")
            output = fn()
            summary = output if output else f"{name} finished with no output."
            self.remember_job_output(chat_id, name, summary, action_type=action_type)
            if action_type == "multi_agent_research":
                self.send_research_result(chat_id, summary)
            else:
                self.send_long_message(chat_id, summary, max_chunks=MAX_JOB_OUTPUT_CHUNKS)
            self.running_jobs.pop(name, None)

        thread = threading.Thread(target=target, daemon=True)
        self.running_jobs[name] = thread
        thread.start()

    def help_text(self) -> str:
        return (
            "OpenClaw AI Agent\n"
            "Bạn có thể chat tự nhiên. Bot sẽ phân tích yêu cầu, hỏi xác nhận, rồi chỉ chạy job sau khi bạn trả lời `approve`.\n\n"
            "Commands\n"
            "/status - check env, Supabase counts, and log path\n"
            "/run_batch - search, scrape, extract, save configured clinic targets\n"
            "/enrich_clinics_google - add Google Places photos, rating, reviews, and Maps links to existing clinics\n"
            "/repair_clinic_images - generate missing clinic directory images\n"
            "/repair_article_images - generate missing article images\n"
            "/repair_article_slugs - convert non-ASCII article slugs to URL-safe ASCII\n"
            "/delete_article <id|slug|title> - delete one article after confirmation\n"
            "/delete_clinic <id|slug|name> - delete one clinic after confirmation\n"
            "/rewrite_article <id|slug|title> | <edit instruction> - rewrite/update an existing article after confirmation\n"
            "/generate_insight [topic] - generate one SEO insight article, 1200-1500 words, plus 2 AI images\n"
            "/generate_insight_from_url <url...> - analyze one or more reference URLs and publish original SEO insights, plus 2 AI images each\n"
            "/generate_guide [topic] - generate one pillar guide, about 2000 words, plus 2 AI images\n"
            "/generate_guide_from_url <url...> - analyze one or more reference URLs and publish original pillar guides\n"
            "/research <topic> - run multi-agent research and return a sourced report\n"
            "/ask <message> - ask the OpenClaw AI agent\n"
            "/prompt - show the current agent system prompt\n"
            "/tail - show recent OpenClaw log\n"
            "/help - show this menu\n\n"
            "Security: set TELEGRAM_ALLOWED_USER_IDS in openclaw/.env to restrict access."
        )

    def is_approval(self, text: str) -> bool:
        normalized = text.strip().lower()
        return normalized in {
            "approve",
            "approved",
            "yes",
            "y",
            "ok",
            "okay",
            "confirm",
            "run",
            "go",
            "đúng",
            "dung",
            "duyệt",
            "duyet",
            "xác nhận",
            "xac nhan",
            "chạy",
            "chay",
        }

    def is_rejection(self, text: str) -> bool:
        normalized = text.strip().lower()
        return normalized in {
            "cancel",
            "no",
            "n",
            "stop",
            "không",
            "khong",
            "hủy",
            "huy",
            "thôi",
            "thoi",
        }

    def extract_url(self, text: str) -> Optional[str]:
        urls = self.extract_urls(text)
        return urls[0] if urls else None

    def extract_urls(self, text: str) -> list[str]:
        matches = re.findall(r"https?://[^\s\"'<>]+", text)
        urls = []

        for match in matches:
            url = match.rstrip(").,];")
            if url not in urls:
                urls.append(url)

        return urls

    def wants_guide_request(self, normalized: str) -> bool:
        return any(
            keyword in normalized
            for keyword in ["guide", "pillar", "chuyên sâu", "chuyen sau", "hướng dẫn", "huong dan", "2000"]
        )

    def wants_content_request(self, normalized: str) -> bool:
        return any(
            keyword in normalized
            for keyword in [
                "generate",
                "create",
                "write",
                "viết",
                "viet",
                "tạo",
                "tao",
                "insight",
                "blog",
                "article",
                "bài",
                "bai",
                "content",
                "guide",
                "pillar",
                "research",
                "nghiên cứu",
                "nguyên cứu",
                "nghien cuu",
                "nguyen cuu",
                "tìm hiểu",
                "tim hieu",
            ]
        )

    def wants_rewrite_request(self, normalized: str) -> bool:
        return any(
            keyword in normalized
            for keyword in [
                "rewrite",
                "revise",
                "edit article",
                "update article",
                "regenerate article",
                "regenerate blog",
                "viết lại",
                "viet lai",
                "chỉnh sửa",
                "chinh sua",
                "sửa bài",
                "sua bai",
                "cập nhật bài",
                "cap nhat bai",
                "rewrite bài",
                "rewrite bai",
            ]
        )

    def extract_rewrite_target(self, text: str) -> Optional[str]:
        stripped = text.strip()
        quoted = re.findall(r'"([^"]+)"|“([^”]+)”|' + r"'([^']+)'", stripped)
        for groups in quoted:
            value = next((item for item in groups if item), "").strip()
            if value:
                return value

        lowered = stripped.lower()
        markers = ["bài ", "bai ", "article ", "blog ", "insight "]
        start = -1
        for marker in markers:
            index = lowered.find(marker)
            if index >= 0:
                start = index + len(marker)
                break

        if start < 0:
            return None

        tail = stripped[start:].strip()
        for separator in [",", "，", " - ", " – ", " — ", " với ", " voi ", " theo yêu cầu", " theo yeu cau"]:
            sep_index = tail.lower().find(separator)
            if sep_index > 0:
                return tail[:sep_index].strip(" :.-")

        return tail.strip(" :.-") or None

    def wants_research_request(self, normalized: str) -> bool:
        return any(
            keyword in normalized
            for keyword in [
                "research",
                "nghiên cứu",
                "nguyên cứu",
                "nghien cuu",
                "nguyen cuu",
                "tìm hiểu sâu",
                "tim hieu sau",
                "báo cáo",
                "bao cao",
                "phân tích nguồn",
                "phan tich nguon",
                "đa tác nhân",
                "da tac nhan",
                "multi-agent",
                "multi agent",
                "tìm thông tin",
                "tim thong tin",
            ]
        )

    def clean_research_request(self, text: str) -> str:
        normalized = text.strip()
        lowered = normalized.lower()

        for marker in [" về ", " ve ", " about ", " topic "]:
            index = lowered.find(marker)
            if index >= 0:
                return normalized[index + len(marker):].strip(" :.-") or normalized

        prefixes = [
            "nghiên cứu",
            "nguyên cứu",
            "nghien cuu",
            "nguyen cuu",
            "research",
            "tìm hiểu sâu",
            "tim hieu sau",
            "làm báo cáo nghiên cứu",
            "lam bao cao nghien cuu",
        ]
        for prefix in prefixes:
            if lowered.startswith(prefix):
                cleaned = normalized[len(prefix):].strip(" :.-")
                return cleaned or normalized

        return normalized

    def wants_auto_topic_request(self, normalized: str) -> bool:
        return any(
            keyword in normalized
            for keyword in [
                "trend",
                "trending",
                "xu hướng",
                "xu huong",
                "hot topic",
                "tự động",
                "tu dong",
                "tự chọn",
                "tu chon",
                "mới nhất",
                "moi nhat",
            ]
        )

    def wants_memory_reference(self, normalized: str) -> bool:
        return any(
            keyword in normalized
            for keyword in [
                "dựa trên thông tin này",
                "dua tren thong tin nay",
                "dựa trên kết quả này",
                "dua tren ket qua nay",
                "dựa trên research",
                "dua tren research",
                "dựa trên báo cáo",
                "dua tren bao cao",
                "based on this",
                "from this",
                "từ thông tin này",
                "tu thong tin nay",
                "thông tin trên",
                "thong tin tren",
            ]
        )

    def extract_json_payload(self, content: str) -> dict:
        content = content.strip()
        if "```json" in content:
            content = content.split("```json", 1)[1].split("```", 1)[0].strip()
        elif content.startswith("```"):
            content = content.split("```", 1)[1].split("```", 1)[0].strip()

        return json.loads(content, strict=False)

    def clean_content_topic(self, text: str, mode: str) -> Optional[str]:
        normalized = text.strip()
        lowered = normalized.lower()

        if self.wants_auto_topic_request(lowered):
            return None

        for marker in [" về ", " ve ", " about ", " topic "]:
            index = lowered.find(marker)
            if index >= 0:
                return normalized[index + len(marker):].strip(" :.-") or None

        prefixes = [
            "tạo một bài insight",
            "tao mot bai insight",
            "viết một bài insight",
            "viet mot bai insight",
            "generate insight",
            "create insight",
            "write insight",
            "tạo một bài blog",
            "tao mot bai blog",
            "viết một bài blog",
            "viet mot bai blog",
            "generate blog",
            "create blog",
            "write blog",
            "tạo một bài guide",
            "tao mot bai guide",
            "viết một bài guide",
            "viet mot bai guide",
            "generate guide",
            "create guide",
            "write guide",
        ]
        for prefix in prefixes:
            if lowered.startswith(prefix):
                cleaned = normalized[len(prefix):].strip(" :.-")
                return cleaned or None

        if mode == "guide" and lowered in {"viết một bài guide cho tôi", "viet mot bai guide cho toi", "write a guide"}:
            return None

        return normalized

    def analyze_request_with_worker(
        self,
        text: str,
        pending_action: Optional[dict] = None,
        memory: Optional[dict] = None,
    ) -> Optional[dict]:
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            return None

        system_prompt = """
You are OpenClaw Intent Analyzer, a specialized worker.
Your only job is to convert one Telegram message into a structured backend intent.
Return ONLY valid JSON. Do not answer the user.

Allowed actions:
- chat
- generate_insight
- generate_guide
- generate_insight_from_urls
- generate_guide_from_urls
- generate_insight_from_memory
- generate_guide_from_memory
- repair_clinic_images
- enrich_clinics_google
- repair_article_images
- repair_article_slugs
- delete_article
- delete_clinic
- rewrite_article
- run_batch
- multi_agent_research

Rules:
- Decision priority:
  1. If the user asks to rewrite, revise, update, edit, improve, regenerate, or "viết lại" an existing article/blog/insight, choose rewrite_article.
  2. If memory is available and the user asks to write/create a blog, article, insight, or guide based on previous/current research/report/content, choose generate_insight_from_memory or generate_guide_from_memory.
  3. If the user asks to perform NEW research/investigation/source gathering, choose multi_agent_research.
  4. If the user asks for an insight/blog/article without referring to memory, choose generate_insight unless they ask for guide/pillar/deep guide.
  5. If the user asks for a guide/pillar/chuyên sâu without referring to memory, choose generate_guide.
- The word "nghiên cứu" does NOT automatically mean multi_agent_research. In "dựa trên nội dung nghiên cứu để viết bài blog", the user wants content from memory, not new research.
- If the user says research/nghiên cứu/nguyên cứu/tìm hiểu/báo cáo and asks to gather/analyze/find sources, action is multi_agent_research.
- If the user asks for a guide/pillar/chuyên sâu, action is generate_guide.
- If URLs are present, use *_from_urls action and include all URLs.
- If the user asks to delete/remove/xoá an article/blog/insight, action is delete_article and target is the clean id, slug, or title.
- If the user asks to delete/remove/xoá a clinic/directory profile, action is delete_clinic and target is the clean id, slug, or clinic name.
- If the user asks to rewrite, revise, update, edit, regenerate, improve, or "viết lại" an existing article/blog/insight, action is rewrite_article.
- For rewrite_article, target must be the article id, slug, or title. rewrite_instruction must include all requested edits.
- If the user asks to fix/repair slugs or URL 404 caused by Vietnamese/non-ASCII slugs, action is repair_article_slugs.
- If the user asks to add Google reviews, Google Maps location, Google rating, or Google photos to clinics, action is enrich_clinics_google.
- If the user says "based on this", "dựa trên thông tin này", "dựa trên research/báo cáo", or similar, and memory is available, use generate_insight_from_memory or generate_guide_from_memory.
- Examples:
  - "viết lại bài Navigating Seasonal Flu and COVID-19 Vaccines..., loại bỏ table content ở đầu bài blog, thêm 2 reference và thêm bản so sánh với American culture" => rewrite_article, target "Navigating Seasonal Flu and COVID-19 Vaccines...", rewrite_instruction includes removing opening table, adding 2 references, adding comparison with American culture.
  - "dựa trên nội dung nghiên cứu để viết bài blog" + memory available => generate_insight_from_memory, use_memory true.
  - "dựa trên báo cáo này viết guide chuyên sâu" + memory available => generate_guide_from_memory, use_memory true.
  - "nghiên cứu về Top 10 phòng khám nói tiếng Việt tại San Jose" => multi_agent_research.
  - "tạo một bài insight về Top 10 phòng khám nói tiếng Việt tại San Jose" => generate_insight.
- Extract the clean topic, not the whole command. Example: "tạo một bài insight về Top 10 phòng khám nói tiếng Việt tại San Jose" => topic "Top 10 phòng khám nói tiếng Việt tại San Jose".
- If the user says trend/trending/xu hướng/tự chọn/mới nhất without a specific topic, set topic to null.
- If the message is greeting/small talk/general question, action is chat.
- If uncertain, action is chat with confidence below 0.6.
- If there is a pending action and the new message expresses a different backend action, return the new action. The bot will replace the pending action.
""".strip()
        user_prompt = f"""
Pending action, if any:
{json.dumps(pending_action or {}, ensure_ascii=False)}

Latest chat memory, if any:
{json.dumps(self.memory_for_prompt(memory), ensure_ascii=False)}

Memory available:
{bool(memory and memory.get("text"))}

Telegram message:
{text}

Return JSON:
{{
  "action": "generate_insight",
  "confidence": 0.0,
  "topic": null,
  "target": null,
  "urls": [],
  "use_memory": false,
  "rewrite_instruction": null,
  "reason": "short internal reason"
}}
""".strip()

        try:
            client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=api_key,
                timeout=20,
            )
            response = client.chat.completions.create(
                model=INTENT_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0,
                max_tokens=500,
            )
            data = self.extract_json_payload(response.choices[0].message.content)
            return self.intent_data_to_action(data, text, memory)
        except Exception as exc:
            print(f"[!] Intent Analyzer worker failed, falling back to local parser: {exc}")
            return None

    def memory_for_prompt(self, memory: Optional[dict]) -> dict:
        if not memory:
            return {}

        text = memory.get("text") or ""
        return {
            "type": memory.get("type"),
            "name": memory.get("name"),
            "created_at": memory.get("created_at"),
            "text_excerpt": text[-8000:],
        }

    def build_memory_content_action(self, instruction: str, memory: dict, mode: str) -> Optional[dict]:
        if not memory or not memory.get("text"):
            return None

        is_guide = mode == "guide"
        action_type = "generate_guide_from_memory" if is_guide else "generate_insight_from_memory"
        action_name = "generate_guide_from_memory" if is_guide else "generate_insight_from_memory"
        content_label = "Pillar Guide chuyên sâu khoảng 2000 words" if is_guide else "Insight SEO khoảng 1200-1500 words"
        memory_name = memory.get("name") or "kết quả gần nhất"

        return {
            "type": action_type,
            "name": f"{action_name}: {memory_name[:48]}",
            "instruction": instruction,
            "reference_label": memory_name,
            "reference_text": memory["text"],
            "summary": (
                f"Bạn muốn OpenClaw tạo một bài {content_label} dựa trên memory/kết quả gần nhất phải không?\n\n"
                f"Nguồn memory: {memory_name}\n"
                f"Yêu cầu: {instruction}\n\n"
                "Nếu approve, OpenClaw sẽ:\n"
                "1. Dùng báo cáo/kết quả đã lưu trong chat memory làm nguồn chính.\n"
                "2. Viết lại thành bài gốc cho Asian Health Hub, không copy nguyên văn.\n"
                "3. Giữ lại các điểm chưa chắc chắn và nguồn quan trọng nếu phù hợp.\n"
                "4. Generate 2 ảnh minh họa bằng Gemini image-preview.\n"
                "5. Publish bài viết lên Supabase.\n\n"
                "Việc này có thể gọi OpenRouter/Gemini và cập nhật Supabase thật.\n"
                "Nếu đúng, vui lòng trả lời `approve`."
            ),
        }

    def intent_data_to_action(self, data: dict, original_text: str, memory: Optional[dict] = None) -> Optional[dict]:
        action = str(data.get("action") or "").strip()
        confidence = float(data.get("confidence") or 0)
        urls = data.get("urls") or []
        if isinstance(urls, str):
            urls = [urls]
        urls = [url for url in urls if isinstance(url, str) and url.startswith(("http://", "https://"))]

        if confidence < 0.6 or action in {"chat", "unknown", ""}:
            return None

        if action == "generate_insight_from_urls" and urls:
            return self.build_url_content_action(urls, mode="insight")
        if action == "generate_guide_from_urls" and urls:
            return self.build_url_content_action(urls, mode="guide")
        if action == "generate_insight_from_memory":
            return self.build_memory_content_action(original_text.strip(), memory or {}, mode="insight")
        if action == "generate_guide_from_memory":
            return self.build_memory_content_action(original_text.strip(), memory or {}, mode="guide")
        if action == "generate_insight":
            topic = data.get("topic")
            topic = str(topic).strip() if topic else None
            if data.get("use_memory"):
                memory_action = self.build_memory_content_action(original_text.strip(), memory or {}, mode="insight")
                if memory_action:
                    return memory_action
            return self.build_topic_content_action(topic, mode="insight")
        if action == "generate_guide":
            topic = data.get("topic")
            topic = str(topic).strip() if topic else None
            if data.get("use_memory"):
                memory_action = self.build_memory_content_action(original_text.strip(), memory or {}, mode="guide")
                if memory_action:
                    return memory_action
            return self.build_topic_content_action(topic, mode="guide")
        if action == "multi_agent_research":
            return self.build_research_action(self.clean_research_request(original_text))
        if action == "run_batch":
            return {
                "type": "run_batch",
                "name": "run_batch",
                "summary": (
                    "Bạn muốn chạy batch pipeline cho các target clinics cấu hình trong `run_batch.py` phải không?\n\n"
                    "Nếu approve, OpenClaw sẽ search URL, scrape website, extract dữ liệu, lưu clinics, và gắn ảnh nếu có.\n"
                    "Việc này có thể mất thời gian và cập nhật Supabase thật. Nếu đúng, trả lời `approve`."
                ),
            }
        if action == "repair_clinic_images":
            return {
                "type": "repair_clinic_images",
                "name": "repair_clinic_images",
                "summary": (
                    "Bạn muốn OpenClaw sửa/generate ảnh còn thiếu cho clinic directory phải không?\n\n"
                    "Nếu approve, OpenClaw sẽ quét bảng clinics, generate ảnh thiếu bằng Gemini image-preview, "
                    "và cập nhật `clinics.metadata.images` trên Supabase.\n\n"
                    "Việc này có thể tốn quota OpenRouter/Gemini. Nếu đúng, trả lời `approve`."
                ),
            }
        if action == "enrich_clinics_google":
            return {
                "type": "enrich_clinics_google",
                "name": "enrich_clinics_google",
                "summary": (
                    "Bạn muốn OpenClaw enrich clinic bằng Google Places phải không?\n\n"
                    "Nếu approve, OpenClaw sẽ quét bảng clinics, gọi Google Places API để lấy ảnh, rating, "
                    "review snippets, Google Maps URL, tọa độ và giờ mở cửa, upload ảnh lên Supabase Storage, "
                    "rồi cập nhật `clinics.metadata` trên Supabase.\n\n"
                    "Việc này cần `GOOGLE_PLACES_API_KEY` và có thể tốn Google Maps quota. Nếu đúng, trả lời `approve`."
                ),
            }
        if action == "repair_article_images":
            return {
                "type": "repair_article_images",
                "name": "repair_article_images",
                "summary": (
                    "Bạn muốn OpenClaw sửa/generate ảnh còn thiếu cho article/insight phải không?\n\n"
                    "Nếu approve, OpenClaw sẽ quét bảng articles, generate ảnh thiếu bằng Gemini image-preview, "
                    "và cập nhật `articles.seo_meta.og_image` trên Supabase.\n\n"
                    "Nếu đúng, trả lời `approve`."
                ),
            }
        if action == "repair_article_slugs":
            return self.build_repair_article_slugs_action()
        if action == "delete_article":
            target = str(data.get("target") or data.get("topic") or "").strip()
            if target:
                return self.build_delete_action("article", target)
        if action == "delete_clinic":
            target = str(data.get("target") or data.get("topic") or "").strip()
            if target:
                return self.build_delete_action("clinic", target)
        if action == "rewrite_article":
            target = str(data.get("target") or data.get("topic") or "").strip()
            rewrite_instruction = str(data.get("rewrite_instruction") or original_text).strip()
            if target:
                return self.build_rewrite_article_action(target, rewrite_instruction)

        return None

    def build_repair_article_slugs_action(self) -> dict:
        return {
            "type": "repair_article_slugs",
            "name": "repair_article_slugs",
            "summary": (
                "Bạn muốn OpenClaw sửa các article slug có ký tự tiếng Việt/ký tự đặc biệt sang ASCII URL-safe phải không?\n\n"
                "Nếu approve, OpenClaw sẽ:\n"
                "1. Quét bảng articles.\n"
                "2. Đổi slug không an toàn sang dạng ASCII như `suc-khoe-tam-than...`.\n"
                "3. Lưu slug cũ vào `seo_meta.legacy_slugs`.\n\n"
                "Việc này cập nhật Supabase thật. Nếu đúng, trả lời `approve`."
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
                f"Bạn muốn xoá {label} này khỏi Supabase phải không?\n\n"
                f"Target: {target}\n\n"
                "Nếu approve, OpenClaw sẽ tìm đúng một record theo id, slug, hoặc tên/title rồi xoá record đó.\n"
                "Đây là thao tác xoá dữ liệu thật. Nếu đúng, trả lời `approve`. Nếu không chắc, trả lời `cancel`."
            ),
        }

    def build_rewrite_article_action(self, target: str, instruction: str) -> dict:
        return {
            "type": "rewrite_article",
            "name": f"rewrite_article: {target[:48]}",
            "target": target,
            "instruction": instruction,
            "summary": (
                "Bạn muốn OpenClaw viết lại/cập nhật một bài blog/insight hiện có phải không?\n\n"
                f"Bài cần rewrite: {target}\n\n"
                f"Yêu cầu chỉnh sửa OpenClaw hiểu được:\n{instruction}\n\n"
                "Nếu approve, OpenClaw sẽ:\n"
                "1. Tìm bài theo id, slug, hoặc title.\n"
                "2. Dùng nội dung hiện tại làm context.\n"
                "3. Regenerate lại bài theo đúng yêu cầu chỉnh sửa ở trên.\n"
                "4. Giữ nguyên slug/URL hiện tại.\n"
                "5. Update content, excerpt, tags và SEO metadata trong Supabase.\n\n"
                "Việc này có thể gọi OpenRouter và cập nhật Supabase thật.\n"
                "Nếu đúng, vui lòng trả lời `approve`. Nếu muốn chỉnh yêu cầu, hãy nhắn lại yêu cầu mới."
            ),
        }

    def build_url_content_action(self, urls: Union[str, list[str]], mode: str) -> dict:
        if isinstance(urls, str):
            url_list = [urls]
        else:
            url_list = urls

        is_guide = mode == "guide"
        is_batch = len(url_list) > 1
        action_type = "generate_guide_from_urls" if is_guide and is_batch else "generate_guide_from_url" if is_guide else "generate_insight_from_urls" if is_batch else "generate_insight_from_url"
        action_name = action_type
        content_label = "Pillar Guide chuyên sâu khoảng 2000 words" if is_guide else "Insight SEO khoảng 1200-1500 words"
        url_lines = "\n".join(f"- {url}" for url in url_list)
        count_label = f"{len(url_list)} bài" if is_batch else "một bài"

        return {
            "type": action_type,
            "name": f"{action_name}: {len(url_list)} urls" if is_batch else f"{action_name}: {url_list[0][:48]}",
            "url": url_list[0],
            "urls": url_list,
            "summary": (
                f"Bạn muốn OpenClaw tạo {count_label} {content_label} từ URL tham khảo này phải không?\n\n"
                f"URLs:\n{url_lines}\n\n"
                "Nếu approve, OpenClaw sẽ:\n"
                "1. Chạy lần lượt từng URL để tránh quá tải/quota spike.\n"
                "2. Scrape nội dung từng trang web tham khảo.\n"
                "3. Dùng AI phân tích các ý y tế chính.\n"
                "4. Viết bài gốc cho Asian Health Hub, không sao chép wording/heading/cấu trúc nguồn.\n"
                "5. Generate 2 ảnh minh họa bằng Gemini image-preview.\n"
                "6. Publish bài viết lên Supabase.\n\n"
                "Việc này có thể gọi OpenRouter/Gemini và cập nhật Supabase thật.\n"
                "Nếu đúng, vui lòng trả lời `approve`. Nếu muốn đổi yêu cầu, cứ nhắn yêu cầu mới."
            ),
        }

    def build_topic_content_action(self, topic: Optional[str], mode: str) -> dict:
        is_guide = mode == "guide"
        action_type = "generate_guide" if is_guide else "generate_insight"
        action_name = "generate_guide" if is_guide else "generate_insight"
        content_label = "Pillar Guide chuyên sâu khoảng 2000 words" if is_guide else "Insight SEO khoảng 1200-1500 words"
        topic_label = topic or "OpenClaw tự chọn chủ đề phù hợp"

        return {
            "type": action_type,
            "name": action_name if not topic else f"{action_name}: {topic[:48]}",
            "topic": topic,
            "summary": (
                f"Bạn muốn OpenClaw tạo một bài {content_label} phải không?\n\n"
                f"Topic: {topic_label}\n\n"
                "Nếu approve, OpenClaw sẽ generate content, generate 2 ảnh, tạo slug unique, và publish lên Supabase.\n"
                "Nếu đúng, trả lời `approve`. Nếu muốn dùng URL tham khảo, hãy gửi URL trước khi approve."
            ),
        }

    def build_research_action(self, user_request: str) -> dict:
        return {
            "type": "multi_agent_research",
            "name": f"multi_agent_research: {user_request[:48]}",
            "request": user_request,
            "summary": (
                "Bạn muốn OpenClaw chạy nghiên cứu tự động đa tác nhân cho yêu cầu này phải không?\n\n"
                f"Yêu cầu: {user_request}\n\n"
                "Nếu approve, OpenClaw sẽ chạy pipeline 5 role:\n"
                "1. Search Planner: phân tích intent và tạo query tối ưu.\n"
                "2. Batch Link Selector: chọn 10-12 nguồn tốt nhất từ pool kết quả.\n"
                "3. Sub-link Extractor: đào link con từ các trang list/hub.\n"
                "4. Fact Extractor: scrape từng trang detail và trích facts cuốn chiếu.\n"
                "5. Final Editor: tổng hợp báo cáo cuối cùng có nguồn.\n\n"
                "Việc này có thể gọi OpenRouter nhiều lần, search web, scrape nhiều website và mất vài phút.\n"
                "Nếu đúng, vui lòng trả lời `approve`."
            ),
        }

    def analyze_request(
        self,
        text: str,
        pending_action: Optional[dict] = None,
        memory: Optional[dict] = None,
    ) -> Optional[dict]:
        normalized = text.strip().lower()
        urls = self.extract_urls(text)
        url = urls[0] if urls else None
        wants_guide = self.wants_guide_request(normalized)
        wants_content = self.wants_content_request(normalized)
        wants_research = self.wants_research_request(normalized)
        wants_auto_topic = self.wants_auto_topic_request(normalized)
        wants_rewrite = self.wants_rewrite_request(normalized)

        worker_action = self.analyze_request_with_worker(text, pending_action, memory)
        if worker_action:
            return worker_action

        if wants_rewrite:
            target = self.extract_rewrite_target(text)
            if target:
                return self.build_rewrite_article_action(target, text.strip())

        if self.wants_memory_reference(normalized) and memory:
            mode = "guide" if wants_guide else "insight"
            return self.build_memory_content_action(text.strip(), memory, mode=mode)

        if wants_research:
            return self.build_research_action(self.clean_research_request(text))

        if pending_action:
            pending_urls = pending_action.get("urls") or ([pending_action["url"]] if pending_action.get("url") else [])
            pending_type = pending_action.get("type")

            if wants_guide and pending_urls:
                return self.build_url_content_action(pending_urls, mode="guide")

            if urls and pending_type in {"generate_guide", "generate_guide_from_url", "generate_guide_from_urls"}:
                return self.build_url_content_action(urls, mode="guide")

            if urls and pending_type in {"generate_insight", "generate_insight_from_url", "generate_insight_from_urls"}:
                mode = "guide" if wants_guide else "insight"
                return self.build_url_content_action(urls, mode=mode)

        if url and (
            "insight" in normalized
            or "blog" in normalized
            or "article" in normalized
            or "bài" in normalized
            or "bai" in normalized
            or "content" in normalized
            or "url" in normalized
            or "dựa trên" in normalized
            or "dua tren" in normalized
            or "tham khảo" in normalized
            or "tham khao" in normalized
            or wants_guide
        ):
            return self.build_url_content_action(urls, mode="guide" if wants_guide else "insight")

        if "repair" in normalized and ("clinic" in normalized or "directory" in normalized) and "image" in normalized:
            return {
                "type": "repair_clinic_images",
                "name": "repair_clinic_images",
                "summary": (
                    "Bạn muốn OpenClaw sửa/generate ảnh còn thiếu cho clinic directory phải không?\n\n"
                    "Nếu approve, OpenClaw sẽ quét bảng clinics, generate ảnh thiếu bằng Gemini image-preview, "
                    "và cập nhật `clinics.metadata.images` trên Supabase.\n\n"
                    "Việc này có thể tốn quota OpenRouter/Gemini. Nếu đúng, trả lời `approve`."
                ),
            }

        if (
            ("google" in normalized or "maps" in normalized)
            and ("clinic" in normalized or "directory" in normalized or "phòng khám" in normalized or "phong kham" in normalized)
            and (
                "review" in normalized
                or "rating" in normalized
                or "image" in normalized
                or "hình" in normalized
                or "hinh" in normalized
                or "location" in normalized
                or "map" in normalized
                or "địa điểm" in normalized
                or "dia diem" in normalized
            )
        ):
            return {
                "type": "enrich_clinics_google",
                "name": "enrich_clinics_google",
                "summary": (
                    "Bạn muốn OpenClaw enrich clinic bằng Google Places phải không?\n\n"
                    "Nếu approve, OpenClaw sẽ quét bảng clinics, gọi Google Places API để lấy ảnh, rating, "
                    "review snippets, Google Maps URL, tọa độ và giờ mở cửa, upload ảnh lên Supabase Storage, "
                    "rồi cập nhật `clinics.metadata` trên Supabase.\n\n"
                    "Việc này cần `GOOGLE_PLACES_API_KEY` và có thể tốn Google Maps quota. Nếu đúng, trả lời `approve`."
                ),
            }

        if "repair" in normalized and ("article" in normalized or "insight" in normalized or "blog" in normalized) and "image" in normalized:
            return {
                "type": "repair_article_images",
                "name": "repair_article_images",
                "summary": (
                    "Bạn muốn OpenClaw sửa/generate ảnh còn thiếu cho article/insight phải không?\n\n"
                    "Nếu approve, OpenClaw sẽ quét bảng articles, generate ảnh thiếu bằng Gemini image-preview, "
                    "và cập nhật `articles.seo_meta.og_image` trên Supabase.\n\n"
                    "Nếu đúng, trả lời `approve`."
                ),
            }

        if "run batch" in normalized or "chạy batch" in normalized or "chay batch" in normalized:
            return {
                "type": "run_batch",
                "name": "run_batch",
                "summary": (
                    "Bạn muốn chạy batch pipeline cho các target clinics cấu hình trong `run_batch.py` phải không?\n\n"
                    "Nếu approve, OpenClaw sẽ search URL, scrape website, extract dữ liệu, lưu clinics, và gắn ảnh nếu có.\n"
                    "Việc này có thể mất thời gian và cập nhật Supabase thật. Nếu đúng, trả lời `approve`."
                ),
            }

        if wants_content and (
            "insight" in normalized
            or "article" in normalized
            or "blog" in normalized
            or wants_guide
        ):
            mode = "guide" if wants_guide else "insight"
            topic = None if wants_auto_topic else self.clean_content_topic(text, mode)

            return self.build_topic_content_action(topic, mode=mode)

        return None

    def run_url_batch(self, urls: list[str], fn: Callable[[str], str]) -> str:
        outputs = []
        total = len(urls)

        for index, url in enumerate(urls, start=1):
            outputs.append(f"===== URL {index}/{total}: {url} =====")
            outputs.append(fn(url))

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
        elif action_type == "repair_article_slugs":
            self.run_job(chat_id, action["name"], repair_article_slugs_job, action_type=action_type)
        elif action_type == "delete_article":
            self.run_job(chat_id, action["name"], lambda: delete_article_job(action["target"]), action_type=action_type)
        elif action_type == "delete_clinic":
            self.run_job(chat_id, action["name"], lambda: delete_clinic_job(action["target"]), action_type=action_type)
        elif action_type == "rewrite_article":
            self.run_job(
                chat_id,
                action["name"],
                lambda: rewrite_article_job(action["target"], action["instruction"]),
                action_type=action_type,
            )
        elif action_type == "run_batch":
            self.run_job(chat_id, action["name"], run_batch_job, action_type=action_type)
        elif action_type == "generate_insight":
            self.run_job(chat_id, action["name"], lambda: generate_insight_job(action.get("topic")), action_type=action_type)
        elif action_type == "generate_guide":
            self.run_job(chat_id, action["name"], lambda: generate_guide_job(action.get("topic")), action_type=action_type)
        elif action_type == "multi_agent_research":
            self.run_job(chat_id, action["name"], lambda: research_job(action["request"]), action_type=action_type)
        else:
            self.send_message(chat_id, "Mình chưa biết cách chạy action này. Hãy gửi lại yêu cầu rõ hơn nhé.")

    def handle_command(self, chat_id: int, text: str) -> None:
        command = text.split()[0].split("@")[0].lower()

        if command in {"/start", "/help"}:
            self.send_message(chat_id, self.help_text())
        elif command == "/status":
            self.send_message(chat_id, check_status())
        elif command == "/tail":
            self.send_message(chat_id, tail_log())
        elif command == "/prompt":
            self.send_message(chat_id, OPENCLAW_AGENT_SYSTEM_PROMPT)
        elif command == "/research":
            request = text.removeprefix("/research").strip()
            if not request:
                self.send_message(chat_id, "Gửi dạng: /research Hanta virus symptoms and prevention latest")
            else:
                self.run_job(chat_id, f"multi_agent_research: {request[:48]}", lambda: research_job(request), action_type="multi_agent_research")
        elif command == "/ask":
            question = text.removeprefix("/ask").strip()
            if not question:
                self.send_message(chat_id, "Gửi dạng: /ask Tôi nên chạy gì để sửa ảnh directory?")
            else:
                self.send_message(chat_id, ask_openclaw_agent(question))
        elif command == "/run_batch":
            self.run_job(chat_id, "run_batch", run_batch_job, action_type="run_batch")
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
                self.send_message(chat_id, "Gửi dạng: /delete_article <id|slug|title>")
            else:
                self.pending_actions[chat_id] = self.build_delete_action("article", target)
                self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
        elif command == "/delete_clinic":
            target = text.removeprefix("/delete_clinic").strip()
            if not target:
                self.send_message(chat_id, "Gửi dạng: /delete_clinic <id|slug|name>")
            else:
                self.pending_actions[chat_id] = self.build_delete_action("clinic", target)
                self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
        elif command == "/rewrite_article":
            payload = text.removeprefix("/rewrite_article").strip()
            if not payload or "|" not in payload:
                self.send_message(chat_id, "Gửi dạng: /rewrite_article <id|slug|title> | <yêu cầu chỉnh sửa>")
            else:
                target, instruction = [part.strip() for part in payload.split("|", 1)]
                if not target or not instruction:
                    self.send_message(chat_id, "Gửi dạng: /rewrite_article <id|slug|title> | <yêu cầu chỉnh sửa>")
                else:
                    self.pending_actions[chat_id] = self.build_rewrite_article_action(target, instruction)
                    self.send_message(chat_id, self.pending_actions[chat_id]["summary"])
        elif command == "/generate_insight":
            topic = text.removeprefix("/generate_insight").strip() or None
            job_name = "generate_insight" if not topic else f"generate_insight: {topic[:48]}"
            self.run_job(chat_id, job_name, lambda: generate_insight_job(topic), action_type="generate_insight")
        elif command == "/generate_insight_from_url":
            source_urls = self.extract_urls(text.removeprefix("/generate_insight_from_url").strip())
            if not source_urls:
                self.send_message(chat_id, "Gửi dạng: /generate_insight_from_url https://example.com/article")
            elif len(source_urls) == 1:
                source_url = source_urls[0]
                self.run_job(
                    chat_id,
                    f"generate_insight_from_url: {source_url[:48]}",
                    lambda: generate_insight_from_url_job(source_url),
                    action_type="generate_insight_from_url",
                )
            else:
                self.run_job(
                    chat_id,
                    f"generate_insight_from_urls: {len(source_urls)} urls",
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
                self.send_message(chat_id, "Gửi dạng: /generate_guide_from_url https://example.com/article")
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
        if self.is_approval(text):
            action = self.pending_actions.pop(chat_id, None)
            if not action:
                self.send_message(chat_id, "Hiện không có tác vụ nào đang chờ approve.")
                return

            self.send_message(chat_id, f"Đã nhận approve. Mình bắt đầu chạy: {action['name']}")
            self.run_pending_action(chat_id, action)
            return

        if self.is_rejection(text):
            action = self.pending_actions.pop(chat_id, None)
            if action:
                self.send_message(chat_id, f"Đã hủy tác vụ đang chờ: {action['name']}")
            else:
                self.send_message(chat_id, "Không có tác vụ nào đang chờ để hủy.")
            return

        action = self.analyze_request(text, self.pending_actions.get(chat_id), self.chat_memory.get(chat_id))
        if action:
            self.pending_actions[chat_id] = action
            self.send_message(chat_id, action["summary"])
            return

        self.pending_actions.pop(chat_id, None)
        self.send_message(chat_id, ask_openclaw_agent(text))

    def run_forever(self) -> None:
        print("[*] OpenClaw Telegram bot is running.")
        print("[*] Press Ctrl+C to stop.")

        while True:
            try:
                for update in self.get_updates():
                    self.offset = update["update_id"] + 1
                    message = update.get("message") or {}
                    text = message.get("text") or ""
                    chat_id = message.get("chat", {}).get("id")
                    user_id = message.get("from", {}).get("id")

                    if not chat_id or not user_id or not text:
                        continue

                    if not self.is_allowed(user_id):
                        self.send_message(chat_id, "You are not allowed to use this OpenClaw bot.")
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

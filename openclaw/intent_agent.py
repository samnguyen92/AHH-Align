"""
intent_agent.py — Dedicated Intent Agent for OpenClaw.

Replaces brittle Python regexes, manual prefix stripping, and hardcoded
Vietnamese string templates with an autonomous LLM-powered Intent Agent.

Key Responsibilities:
1. Natural language understanding and reasoning across chat history and pending actions.
2. Contextual language detection: English by default (`lang: "en"`), Vietnamese only when user writes in Vietnamese (`lang: "vi"`).
3. Parameter extraction (targets, query, limit, URLs, rewrite instruction, timeframe).
4. Direct generation of natural `confirmation_message` in the matching language.
5. Detection of approval / cancellation triggers (`approve`, `cancel`, etc.).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from openai import OpenAI

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(_OPENCLAW_DIR, "..", ".env.local"))

INTENT_MODEL = os.environ.get("OPENCLAW_TEXT_MODEL", os.environ.get("OPENCLAW_INTENT_MODEL", "openai/gpt-6-luna"))
FALLBACK_MODEL = os.environ.get("OPENCLAW_TEXT_FALLBACK_MODEL", "deepseek/deepseek-v4-flash")
INTENT_MAX_TOKENS = int(os.environ.get("OPENCLAW_INTENT_MAX_TOKENS", "2000"))

# Vietnamese detection regexes for quick fallback
VI_DIACRITICS_RE = re.compile(r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]", re.IGNORECASE)
VI_WORDS_RE = re.compile(
    r"\b(tôi|toi|bạn|ban|thống kê|thong ke|báo cáo|bao cao|bài viết|bai viet|phòng khám|phong kham|"
    r"xem|sửa|sua|xóa|xoa|duyệt|duyet|từ chối|tu choi|hôm nay|hom nay|tuần|tuan|tháng|thang|"
    r"thế nào|the nao|bao nhiêu|bao nhieu|giúp|giup|tìm|tim|cào|cao|cho tôi|cho toi|kiểm tra|kiem tra)\b",
    re.IGNORECASE,
)

APPROVAL_WORDS = {
    "approve", "approved", "ok", "yes", "y", "được", "duoc", "đồng ý", "dong y",
    "duyệt", "duyet", "chấp nhận", "chap nhan", "tiến hành", "tien hanh", "làm đi", "lam di"
}

REJECTION_WORDS = {
    "cancel", "cancelled", "reject", "rejected", "no", "n", "hủy", "huy",
    "bỏ", "bo", "thôi", "thoi", "không", "khong", "dừng", "dung"
}


@dataclass
class IntentResult:
    action: str
    lang: str = "en"
    confidence: float = 1.0
    parameters: Dict[str, Any] = field(default_factory=dict)
    requires_approval: bool = True
    confirmation_message: str = ""
    is_approval: bool = False
    is_rejection: bool = False
    is_direct_chat: bool = False
    direct_reply: Optional[str] = None
    reason: str = ""

    def to_pending_dict(self) -> Dict[str, Any]:
        """Convert to the pending_action dict stored in TelegramBot.pending_actions."""
        data = {
            "type": self.action,
            "name": self.parameters.get("name") or f"{self.action}: {self.parameters.get('target') or self.parameters.get('query') or self.action}",
            "summary": self.confirmation_message,
            "lang": self.lang,
            "confidence": self.confidence,
        }
        data.update(self.parameters)
        return data


def detect_quick_language(text: str) -> str:
    """Detect if text is Vietnamese or English (default)."""
    if not text:
        return "en"
    if VI_DIACRITICS_RE.search(text) or VI_WORDS_RE.search(text):
        return "vi"
    return "en"


def is_quick_approval(text: str) -> bool:
    clean = text.strip().lower().strip("!.,:;\"'`")
    return clean in APPROVAL_WORDS or clean.startswith("approve ")


def is_quick_rejection(text: str) -> bool:
    clean = text.strip().lower().strip("!.,:;\"'`")
    return clean in REJECTION_WORDS or clean.startswith("cancel ")


# ----------------------------------------------------------------------------
# System Prompt for the Intent Agent
# ----------------------------------------------------------------------------

INTENT_AGENT_SYSTEM_PROMPT = """
You are the Dedicated Intent Agent for OpenClaw, the AI operations bot for Asian Health Hub.
Your job is to analyze the user's incoming message, understand the intent, extract parameters, detect the language, and compose the exact confirmation message.

CRITICAL LANGUAGE RULES:
1. Reply in the language of the user's LATEST message. Vietnamese words or diacritics -> "lang": "vi". English -> "lang": "en".
2. If the latest message is too short to tell (e.g. "ok", "approve"), keep "previous_detected_lang".
3. Write "confirmation_message" and "direct_reply" entirely in that language, in natural, friendly, concise wording. Never mention internal action names such as "rescan_clinic".

CONVERSATION RULES:
- You receive "recent_conversation" (the last turns, oldest first) and "focus" (the clinic being discussed). Use them to resolve references such as "this clinic", "clinics này", "nó", "cái đó".
- If "active_pending_action" exists and the user's message changes or corrects it (e.g. "no need to rescan, just update the languages"), return the NEW action (it replaces the pending one). If the user clearly declines in any wording, set "is_rejection": true. If the user clearly agrees in any wording ("ừ làm đi", "go ahead"), set "is_approval": true.
- If something needed is missing or ambiguous, use action "chat" and ASK one short clarifying question in "direct_reply". Do not guess a clinic name.
- If the user asks for something this bot cannot do, use action "chat" and say honestly what you cannot do and which command or action is closest. Never answer with a generic greeting to a concrete request.
- For "chat", "direct_reply" must actually answer the user (never a generic "how can I help").

ALLOWED ACTIONS:
- stats_question: Check website stats, traffic, views, sessions, visits, post count, clinic count, data quality, zero-result searches, SEO metrics.
  English phrases: "tell me stats", "show analytics", "how many posts", "traffic this week", "view stats".
  Vietnamese phrases: "thống kê tuần này", "xem thống kê", "view hôm nay", "có bao nhiêu bài viết", "bao nhiêu phòng khám", "traffic thế nào".
  parameters: {"question": str, "scopes": ["overview"|"traffic"|"posts"|"clinics"|"seo"], "period": "today"|"week"|"month"|"quarter"}
- stats_report: Generate full detailed markdown report (+ charts if available).
  English phrases: "detailed stats report", "full analytics report", "export report".
  Vietnamese phrases: "báo cáo chi tiết", "xuất báo cáo thống kê", "báo cáo đầy đủ".
  parameters: {"arg": str, "scopes": list, "period": "today"|"week"|"month"|"quarter"}
- web_edit: Edit website UI, design, components, layout, hero, CSS in Next.js src/. The edit is opened as a GitHub Pull Request for review; nothing goes live until it is merged.
  English phrases: "edit homepage", "remove form in hero", "change button color", "fix navbar".
  Vietnamese phrases: "sửa trang chủ", "xóa form ở hero", "đổi màu nút", "chỉnh sửa giao diện".
  parameters: {"instruction": str}
- seo_audit: Audit SEO metadata, JSON-LD schema, headings, alt tags.
  parameters: {"route": str or "/"}
- seo_setup: Implement or fix SEO code, JSON-LD, sitemaps.
  parameters: {"instruction": str}
- site_analyze: Run deep UX/speed probe + conversion funnel.
  parameters: {"route": str, "timeframe": "week"|"month"}
- publish_code: REMOVED. Website changes are published by merging the Pull Request that /web_edit opened (/web_merge <number>). Choose this only so the bot can explain that.
  parameters: {"commit_message": str}
- rollback_code: REMOVED. To undo a merged change use /web_revert <number>; to discard a pending one use /web_close <number>. Choose this only so the bot can explain that.
  parameters: {}
- inspect_clinic: Check, inspect, view, or verify an EXISTING clinic already on our website / database (languages, photos count, sections, status, URL). Does NOT require approval (requires_approval: false).
  English phrases: "check clinic anchor dental", "inspect clinic X", "check clinic X on our website", "show clinic details for X".
  Vietnamese phrases: "kiểm tra clinics anchor dental", "kiểm tra phòng khám X", "kiểm tra phòng khám X trên trang web của mình", "xem thông tin phòng khám X".
  parameters: {"target": str (clean clinic name or slug, e.g. "anchor dental")}
- update_clinic: Change details of ONE existing clinic: spoken languages, phone, address, city, state, zip code, specialty, description, website, telehealth flag. The owner has usually already verified the fact, so do NOT rescan. Requires approval; the bot builds the exact before/after preview itself.
  English phrases: "add Vietnamese to clinic X", "remove Korean from X", "change the phone of X to 714-555-0100".
  Vietnamese phrases: "thêm tiếng Việt vào ngôn ngữ của clinic X", "đổi số điện thoại của X thành ...", "bỏ tiếng Hàn khỏi X".
  parameters: {"target": str (clinic name or slug; use focus if the user says "this clinic"),
               "changes": {"languages": {"add": [str], "remove": [str], "set": [str]}, "phone": str, "address": str, "city": str, "state": str, "zip_code": str, "specialty": str, "description": str, "website": str, "language_note": str, "is_telehealth_available": bool}}
  Include only the keys the user asked to change. Language names in English ("Vietnamese", "Korean", "Chinese").
  confirmation_message: leave empty (the bot writes it).
- undo_clinic_edit: Undo the last bot edit of a clinic (within 30 days).
  English: "undo the last change to X". Vietnamese: "hoàn tác thay đổi vừa rồi của X".
  parameters: {"target": str}
- rescan_clinic: Re-scan, re-scrape, refresh, or update all fields, photos, verified languages, and VI/KO/ZH translations for one existing clinic in our database using gpt-6-luna.
  English phrases: "rescan clinic anchor dental", "refresh clinic X", "update clinic data for X".
  Vietnamese phrases: "quét lại clinic anchor dental", "cập nhật lại phòng khám X", "làm mới dữ liệu clinic X".
  parameters: {"target": str (clean clinic name or slug)}
- rescan_all_clinics: Re-scan and enrich all clinics in the website database (or a sample batch).
  English phrases: "rescan all clinics", "rescan 10 clinics".
  Vietnamese phrases: "quét lại toàn bộ clinics", "quét lại 10 phòng khám".
  parameters: {"limit": int (0 for all, or N for sample)}
- find_clinics: Search Google Places to discover & import NEW clinics in the US (ONLY when the user explicitly wants to find/import new clinics from Google Places, NEVER when they say "kiểm tra" / "check" / "trên trang web của mình").
  parameters: {"query": str (in English), "limit": int (default 1), "required_languages": list, "facility_types": list}
- scrape_clinic_url: Scrape and import one specific clinic website URL.
  parameters: {"clinic_name": str, "url": str}
- enrich_clinics_google: Add Google Places photos, reviews, rating to existing clinics.
  parameters: {}
- repair_clinic_images: Repair missing clinic directory images.
  parameters: {}
- repair_article_images: Repair missing article images.
  parameters: {}
- regenerate_article_images: Regenerate images for a specific article.
  parameters: {"target": str}
- repair_article_slugs: Convert non-ASCII article slugs to ASCII safe slugs.
  parameters: {}
- delete_article: Delete one article from the database.
  parameters: {"target": str}
- delete_clinic: Delete one clinic from the database.
  parameters: {"target": str}
- change_clinic_feature_image: Change or rotate feature image of a clinic.
  parameters: {"target": str, "image_url": str or null}
- rewrite_article: Rewrite an existing article and save as next version.
  parameters: {"target": str, "instruction": str}
- generate_insight: Generate one SEO insight article (1200-1500 words).
  parameters: {"topic": str or null}
- generate_guide: Generate one Pillar Guide (around 2000-3000 words).
  parameters: {"topic": str or null}
- generate_pulse: Generate one monthly newsletter issue.
  parameters: {"topic": str or null}
- generate_insight_from_urls: Generate insight from reference URL(s).
  parameters: {"urls": list[str]}
- generate_guide_from_urls: Generate guide from reference URL(s).
  parameters: {"urls": list[str]}
- multi_agent_research: Run multi-agent research pipeline on a topic.
  parameters: {"request": str}
- list_drafts: List clinics waiting for review (status draft). New clinics found by the scout are saved as drafts and are NOT visible on the website until approved. Does NOT require approval.
  English phrases: "show drafts", "clinics waiting for review", "what is pending review".
  Vietnamese phrases: "xem các clinic nháp", "clinic nào đang chờ duyệt", "danh sách nháp".
  parameters: {"limit": int}
- approve_clinic: Publish one draft clinic so it becomes visible on the website.
  English phrases: "approve clinic X", "publish clinic X".
  Vietnamese phrases: "duyệt clinic X", "đăng clinic X lên web".
  parameters: {"target": str (slug, id or exact name; the word "all" publishes every draft)}
- reject_clinic: Archive one clinic (hide it from the website; can be restored).
  English phrases: "reject clinic X", "archive clinic X".
  Vietnamese phrases: "từ chối clinic X", "ẩn clinic X".
  parameters: {"target": str}
- check_claims: List pending clinic claims & submissions.
  parameters: {}
- approve_claim: Approve a clinic claim.
  parameters: {"target": str}
- reject_claim: Reject a clinic claim.
  parameters: {"target": str}
- newsletter_list: List newsletter subscribers.
  parameters: {"limit": int}
- newsletter_add: Add a subscriber.
  parameters: {"email": str}
- newsletter_remove: Unsubscribe an email.
  parameters: {"email": str}
- check_analytics: Simple traffic/searches summary.
  parameters: {"timeframe": "week", "filter_type": "all"}
- check_anomalies: Check for anomalies (traffic drops, broken links).
  parameters: {}
- User management is NEVER an action you can choose. If the user asks to add, invite, delete, disable, restore or change the role of a person/account, answer with action "chat" and tell them to use the slash commands /users, /user, /user_add, /user_role, /user_disable, /user_restore or /users_purge.
- chat: Conversation, a question, a clarifying question, or a request this bot cannot do. Always put the real answer in "direct_reply".
  parameters: {}

CONFIRMATION MESSAGE FORMAT:
When requires_approval is true, format confirmation_message cleanly:
If lang == "en":
  "You want to <action description for the user>, correct?\n\nReply `approve` to proceed."
If lang == "vi":
  "Bạn muốn <mô tả hành động>, đúng không?\n\nTrả lời `approve` để bắt đầu."

OUTPUT JSON SCHEMA:
Return ONLY valid JSON matching this schema:
{
  "action": "<action_name>",
  "lang": "en" | "vi",
  "confidence": 0.0 to 1.0,
  "parameters": {},
  "requires_approval": true | false,
  "confirmation_message": "<confirmation text in user's language>",
  "is_approval": false,
  "is_rejection": false,
  "is_direct_chat": false,
  "direct_reply": null or "<answer in user's language if action is chat>",
  "reason": "<short 1-line reason>"
}
""".strip()


def _clean_json_output(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def quick_inspect_intent(clean_text: str) -> Optional[IntentResult]:
    """'kiểm tra clinic X' / 'check clinic X': deterministic, needs no model."""
    inspect_match = re.match(
        r"^(?:không phải[,.\s]+)?(?:tôi muốn\s+|vui lòng\s+|hãy\s+)?(?:kiểm tra|kiem tra|check|inspect|xem thông tin|xem)\s+"
        r"(?:clinics?|phòng khám|phong kham)\s+(.+?)(?:\s+trên\s+(?:trang\s+)?web(?:site)?(?:\s+của\s+mình|\s+của\s+tôi)?)?$",
        clean_text.strip("?.! "),
        flags=re.IGNORECASE,
    )
    if not inspect_match:
        return None
    target_clinic = inspect_match.group(1).strip(" \"'“”")
    if not target_clinic or target_clinic.lower() in {"claims", "claim", "newsletter", "newsletter list", "all", "toàn bộ"}:
        return None
    return IntentResult(
        action="inspect_clinic",
        lang=detect_quick_language(clean_text),
        confidence=1.0,
        parameters={"target": target_clinic, "name": f"inspect_clinic: {target_clinic[:36]}"},
        requires_approval=False,
        reason="User asked to inspect/check a specific clinic on the website.",
    )


def run_intent_agent(
    message: str,
    memory: Optional[Dict[str, Any]] = None,
    pending_action: Optional[Dict[str, Any]] = None,
    preferred_lang: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
    focus: Optional[Dict[str, Any]] = None,
) -> IntentResult:
    """Analyze the user message with the Dedicated Intent Agent."""
    clean_text = message.strip()
    if not clean_text:
        return IntentResult(
            action="chat",
            lang=preferred_lang or "en",
            requires_approval=False,
            is_direct_chat=True,
            direct_reply="How can I assist you today? Type /help to see all available commands.",
        )

    # 1. Quick check for approval/rejection if there is a pending action
    if pending_action:
        if is_quick_approval(clean_text):
            return IntentResult(
                action=pending_action.get("type", "unknown"),
                lang=pending_action.get("lang") or preferred_lang or "en",
                is_approval=True,
                requires_approval=False,
                parameters=pending_action,
            )
        if is_quick_rejection(clean_text):
            return IntentResult(
                action=pending_action.get("type", "unknown"),
                lang=pending_action.get("lang") or preferred_lang or "en",
                is_rejection=True,
                requires_approval=False,
                parameters=pending_action,
            )

    # 1b. Deterministic fast-path for inspecting/checking an existing clinic on our website
    quick = quick_inspect_intent(clean_text)
    if quick:
        return quick

    # 2. Call the LLM Intent Agent
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return _fallback_intent_analysis(clean_text, memory, pending_action, preferred_lang)

    user_payload = {
        "user_message": clean_text,
        "recent_conversation": (history or [])[-10:],
        "focus": focus or None,
        "active_pending_action": _pending_for_prompt(pending_action),
        "latest_chat_memory": (
            {
                "type": memory.get("type"),
                "name": memory.get("name"),
                "text_excerpt": (memory.get("text") or "")[:1500],
            }
            if memory and memory.get("text")
            else None
        ),
        "previous_detected_lang": preferred_lang or "en",
    }

    parsed, failure = None, ""
    for model in dict.fromkeys([INTENT_MODEL, FALLBACK_MODEL]):  # the main model, then the backup (if different)
        try:
            parsed = _call_intent_llm(api_key, model, user_payload)
            break
        except Exception as exc:
            failure = f"{model}: {exc!r}"
            print(f"[!] IntentAgent call failed ({failure})")
    if parsed is None:
        lang = preferred_lang or detect_quick_language(clean_text)
        # Tell the truth instead of pretending to answer: the AI service is not responding.
        return IntentResult(
            action="chat",
            lang=lang,
            requires_approval=False,
            is_direct_chat=True,
            direct_reply=(
                "Mình đang không kết nối được với bộ não AI nên chưa hiểu được yêu cầu này. "
                "Bạn thử lại sau ít phút, hoặc dùng lệnh `/help`."
                if lang == "vi" else
                "I cannot reach my AI service right now, so I could not understand that. "
                "Please try again in a few minutes, or use `/help`."
            ),
            reason=f"llm_unavailable: {failure}"[:200],
        )

    action = str(parsed.get("action") or "chat").strip()
    lang = str(parsed.get("lang") or detect_quick_language(clean_text)).strip().lower()
    if lang not in ("en", "vi"):
        lang = "en"
    try:
        confidence = float(parsed.get("confidence") or 0.8)
    except (TypeError, ValueError):
        confidence = 0.8
    parameters = parsed.get("parameters") if isinstance(parsed.get("parameters"), dict) else {}
    requires_approval = bool(parsed.get("requires_approval", True))
    confirmation_msg = str(parsed.get("confirmation_message") or "").strip()
    is_direct = bool(parsed.get("is_direct_chat", False) or action == "chat")
    direct_reply = (str(parsed.get("direct_reply")).strip() if parsed.get("direct_reply") else None) or None

    # The model may recognise approval / refusal in ANY wording, but only when something is actually pending.
    wants_approval = bool(pending_action and parsed.get("is_approval"))
    wants_rejection = bool(pending_action and parsed.get("is_rejection") and not wants_approval)
    if wants_approval or wants_rejection:
        return IntentResult(
            action=pending_action.get("type", "unknown"),
            lang=lang,
            is_approval=wants_approval,
            is_rejection=wants_rejection,
            requires_approval=False,
            parameters=pending_action,
            reason=str(parsed.get("reason") or ""),
        )

    if "name" not in parameters:
        target_str = parameters.get("target") or parameters.get("query") or parameters.get("topic") or action
        parameters["name"] = f"{action}: {str(target_str)[:36]}"

    return IntentResult(
        action=action,
        lang=lang,
        confidence=confidence,
        parameters=parameters,
        requires_approval=requires_approval and not is_direct,
        confirmation_message=confirmation_msg,
        is_direct_chat=is_direct,
        direct_reply=direct_reply,  # None means: let the conversational agent answer (no canned greeting)
        reason=str(parsed.get("reason") or ""),
    )


def _pending_for_prompt(pending: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not pending:
        return None
    return {k: pending.get(k) for k in ("type", "name", "summary", "target", "instruction", "changes") if pending.get(k)}


def _extract_json(raw: str) -> Dict[str, Any]:
    """Parse the model's JSON even when it wraps it in prose or code fences."""
    text = _clean_json_output(raw or "")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        first, last = text.find("{"), text.rfind("}")
        if first == -1 or last <= first:
            raise
        return json.loads(text[first:last + 1])


def _call_intent_llm(api_key: str, model: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=40)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": INTENT_AGENT_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        temperature=0.0,
        max_tokens=INTENT_MAX_TOKENS,  # 600 used to cut the JSON in half ("Unterminated string"), see tests
    )
    choice = response.choices[0]
    if getattr(choice, "finish_reason", None) == "length":
        raise ValueError("the model's answer was cut off (finish_reason=length)")
    return _extract_json(choice.message.content or "")


def _fallback_intent_analysis(
    text: str,
    memory: Optional[Dict[str, Any]] = None,
    pending_action: Optional[Dict[str, Any]] = None,
    preferred_lang: Optional[str] = None,
) -> IntentResult:
    """Lightweight deterministic fallback if LLM endpoint is unreachable."""
    lang = detect_quick_language(text)
    lowered = text.lower()

    # Stats question / report
    if any(k in lowered for k in ("stat", "analytic", "view", "truy cap", "truy cập", "thong ke", "thống kê")):
        if any(k in lowered for k in ("report", "báo cáo", "detail", "chi tiết", "chart", "biểu đồ")):
            if lang == "vi":
                msg = f"Bạn muốn xuất báo cáo thống kê chi tiết website, đúng không?\n\nTrả lời `approve` để tiến hành."
            else:
                msg = f"You want to generate a detailed website analytics report, correct?\n\nReply `approve` to proceed."
            return IntentResult(
                action="stats_report",
                lang=lang,
                parameters={"arg": text, "period": "week", "name": "stats_report"},
                requires_approval=True,
                confirmation_message=msg,
            )
        else:
            if lang == "vi":
                msg = f"Bạn muốn tra cứu số liệu thống kê cho câu hỏi: “{text}”, đúng không?\n\nTrả lời `approve` để xem số liệu."
            else:
                msg = f"You want to look up website analytics for: \"{text}\", correct?\n\nReply `approve` to view stats."
            return IntentResult(
                action="stats_question",
                lang=lang,
                parameters={"question": text, "period": "week", "name": f"stats: {text[:32]}"},
                requires_approval=True,
                confirmation_message=msg,
            )

    # Web edit
    if any(k in lowered for k in ("edit", "sửa", "sua", "change ui", "xóa form", "redesign", "hero", "navbar")):
        if lang == "vi":
            msg = f"Bạn muốn Autonomous Web-Dev Agent chỉnh sửa website theo yêu cầu:\n“{text}”\n\nTrả lời `approve` để bắt đầu."
        else:
            msg = f"You want the Autonomous Web-Dev Agent to edit the website with instruction:\n\"{text}\"\n\nReply `approve` to proceed."
        return IntentResult(
            action="web_edit",
            lang=lang,
            parameters={"instruction": text, "name": f"web_edit: {text[:32]}"},
            requires_approval=True,
            confirmation_message=msg,
        )

    # Direct chat
    if lang == "vi":
        reply = "Tôi là OpenClaw Agent. Tôi có thể giúp bạn kiểm tra thống kê website, chỉnh sửa mã nguồn, cào phòng khám hoặc viết bài SEO. Gõ `/help` để xem chi tiết."
    else:
        reply = "I am OpenClaw Agent. I can help you check website stats, edit UI/code, scout clinics, or generate SEO insights. Type `/help` for available commands."

    return IntentResult(
        action="chat",
        lang=lang,
        requires_approval=False,
        is_direct_chat=True,
        direct_reply=reply,
    )

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

INTENT_MODEL = os.environ.get("OPENCLAW_INTENT_MODEL", "deepseek/deepseek-v4-flash")
FALLBACK_MODEL = os.environ.get("OPENCLAW_AGENT_MODEL", "deepseek/deepseek-v4-flash")

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
1. DEFAULT LANGUAGE IS ENGLISH ("lang": "en").
2. ONLY use Vietnamese ("lang": "vi") when the user explicitly writes in Vietnamese (has Vietnamese words or diacritics).
3. If the user asks in English (e.g. "Tell me stats of the site in English", "What's the analytics of the site", "Edit homepage"), you MUST set "lang": "en" and write the "confirmation_message" or "direct_reply" entirely in fluent English.
4. If the user asks in Vietnamese (e.g. "thống kê tuần này cho tôi", "sửa giao diện"), you MUST set "lang": "vi" and write the "confirmation_message" or "direct_reply" in natural Vietnamese.

ALLOWED ACTIONS:
- stats_question: Check website stats, traffic, views, sessions, visits, post count, clinic count, data quality, zero-result searches, SEO metrics.
  English phrases: "tell me stats", "show analytics", "how many posts", "traffic this week", "view stats".
  Vietnamese phrases: "thống kê tuần này", "xem thống kê", "view hôm nay", "có bao nhiêu bài viết", "bao nhiêu phòng khám", "traffic thế nào".
  parameters: {"question": str, "scopes": ["overview"|"traffic"|"posts"|"clinics"|"seo"], "period": "today"|"week"|"month"|"quarter"}
- stats_report: Generate full detailed markdown report (+ charts if available).
  English phrases: "detailed stats report", "full analytics report", "export report".
  Vietnamese phrases: "báo cáo chi tiết", "xuất báo cáo thống kê", "báo cáo đầy đủ".
  parameters: {"arg": str, "scopes": list, "period": "today"|"week"|"month"|"quarter"}
- web_edit: Edit website UI, design, components, layout, hero, CSS in Next.js src/.
  English phrases: "edit homepage", "remove form in hero", "change button color", "fix navbar".
  Vietnamese phrases: "sửa trang chủ", "xóa form ở hero", "đổi màu nút", "chỉnh sửa giao diện".
  parameters: {"instruction": str}
- seo_audit: Audit SEO metadata, JSON-LD schema, headings, alt tags.
  parameters: {"route": str or "/"}
- seo_setup: Implement or fix SEO code, JSON-LD, sitemaps.
  parameters: {"instruction": str}
- site_analyze: Run deep UX/speed probe + conversion funnel.
  parameters: {"route": str, "timeframe": "week"|"month"}
- publish_code: Typecheck, commit, push to GitHub main, and deploy to live Docker.
  parameters: {"commit_message": str}
- rollback_code: Discard uncommitted edits in src/ and public/.
  parameters: {}
- find_clinics: Search Google Places to discover & scrape clinics in the US.
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
- delete_article: Delete one article from Supabase.
  parameters: {"target": str}
- delete_clinic: Delete one clinic from Supabase.
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
- chat: Casual conversation, greeting, or general question about Asian Health Hub.
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


def run_intent_agent(
    message: str,
    memory: Optional[Dict[str, Any]] = None,
    pending_action: Optional[Dict[str, Any]] = None,
    preferred_lang: Optional[str] = None,
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

    # 2. Call the LLM Intent Agent
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return _fallback_intent_analysis(clean_text, memory, pending_action, preferred_lang)

    user_payload = {
        "user_message": clean_text,
        "active_pending_action": pending_action or None,
        "latest_chat_memory": (
            {
                "type": memory.get("type"),
                "name": memory.get("name"),
                "text_excerpt": (memory.get("text") or "")[:2000],
            }
            if memory and memory.get("text")
            else None
        ),
        "previous_detected_lang": preferred_lang or "en",
    }

    try:
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            timeout=30,
        )
        response = client.chat.completions.create(
            model=INTENT_MODEL,
            messages=[
                {"role": "system", "content": INTENT_AGENT_SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
            temperature=0.0,
            max_tokens=600,
        )
        raw_text = response.choices[0].message.content or "{}"
        parsed = json.loads(_clean_json_output(raw_text))

        action = str(parsed.get("action") or "chat").strip()
        lang = str(parsed.get("lang") or detect_quick_language(clean_text)).strip().lower()
        if lang not in ("en", "vi"):
            lang = "en"
        confidence = float(parsed.get("confidence") or 0.8)
        parameters = parsed.get("parameters") or {}
        requires_approval = bool(parsed.get("requires_approval", True))
        confirmation_msg = str(parsed.get("confirmation_message") or "").strip()
        is_direct = bool(parsed.get("is_direct_chat", False) or action == "chat")
        direct_reply = parsed.get("direct_reply")

        if is_direct and not direct_reply:
            if lang == "vi":
                direct_reply = "Xin chào! Tôi có thể giúp gì cho bạn? Gõ `/help` để xem danh sách lệnh."
            else:
                direct_reply = "Hi! How can I assist you with Asian Health Hub today? Type `/help` to see commands."

        # Ensure parameters has a name if not present
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
            direct_reply=direct_reply,
            reason=str(parsed.get("reason") or ""),
        )
    except Exception as exc:
        print(f"[!] IntentAgent LLM failed, using deterministic fallback: {exc}")
        return _fallback_intent_analysis(clean_text, memory, pending_action, preferred_lang)


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

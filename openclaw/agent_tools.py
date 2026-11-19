"""
agent_tools.py — the tools the OpenClaw chat agent can call (OpenAI-style function calling).

Each tool is one thing the bot can DO. The model picks a tool and fills its parameters; the BOT then
  * runs it at once when it only reads (`approval=False`), or
  * shows a confirmation card with Approve / Cancel buttons when it changes something (`approval=True`).
The confirmation card is written by the bot from the parameters (never by the model), so what the user
approves is exactly what will run.

Parameter names are the same as the pending-action keys that `telegram_bot.run_pending_action` already uses.
User management is deliberately NOT a tool: it only exists as explicit slash commands.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

S = {"type": "string"}
I = {"type": "integer"}
B = {"type": "boolean"}


def _obj(props: Optional[dict] = None, required: Optional[list] = None) -> dict:
    return {"type": "object", "properties": props or {}, "required": required or [], "additionalProperties": False}


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: dict
    approval: bool = True          # False = only reads, runs immediately
    card_vi: str = ""              # confirmation wording, {placeholders} come from the parameters
    card_en: str = ""

    def spec(self) -> dict:
        return {"type": "function", "function": {"name": self.name, "description": self.description, "parameters": self.parameters}}


_PERIOD = {"type": "string", "enum": ["today", "week", "month", "quarter"]}

ACTION_TOOLS: List[Tool] = [
    # ---- reading (runs immediately)
    Tool("inspect_clinic", "Show the full status report of ONE existing clinic on our website (languages, photos, sections, status).",
         _obj({"target": S}, ["target"]), approval=False),
    Tool("list_drafts", "List clinics waiting for review (status draft). New clinics from the scout start as drafts.",
         _obj({"limit": I}), approval=False),
    Tool("stats_question", "Answer a question about website numbers: traffic, views, posts, clinics, searches, SEO.",
         _obj({"question": S, "scopes": {"type": "array", "items": {"type": "string", "enum": ["overview", "traffic", "posts", "clinics", "seo"]}}, "period": _PERIOD}, ["question"]), approval=False),
    Tool("stats_report", "Produce the full detailed analytics report (with charts).",
         _obj({"arg": S, "scopes": {"type": "array", "items": S}, "period": _PERIOD}), approval=False),
    Tool("check_analytics", "Quick traffic and search summary.", _obj({"timeframe": S, "filter_type": S}), approval=False),
    Tool("check_anomalies", "Check for traffic drops or broken links.", _obj(), approval=False),
    Tool("check_claims", "List pending clinic claims and submissions.", _obj(), approval=False),
    Tool("newsletter_list", "List newsletter subscribers.", _obj({"limit": I}), approval=False),

    # ---- clinics
    Tool("update_clinic",
         "Change details of ONE existing clinic: spoken languages, phone, address, city, state, zip code, specialty, description, website, telehealth flag. "
         "Everything a visitor reads about ONE clinic is data you can change with this tool: the About text (about_highlight / description), the Language Support box (language_note), phone, address, languages... "
         "Use it (not rescan, not web_edit) when the user states the fact themselves, e.g. 'add Korean to clinic X' or when they send a screenshot of a clinic page and ask to correct its content. "
         "Languages are English names (Vietnamese, Korean, Chinese). When languages change, the sentence 'verified spoken languages are ...' in the clinic's texts is updated automatically.",
         _obj({"target": S, "changes": _obj({
             "languages": _obj({"add": {"type": "array", "items": S}, "remove": {"type": "array", "items": S}, "set": {"type": "array", "items": S}}),
             "phone": S, "address": S, "city": S, "state": S, "zip_code": S, "specialty": S, "description": S,
             "website": S, "language_note": S, "about_highlight": S, "short_description": S, "cultural_context": S,
             "is_telehealth_available": B})}, ["target", "changes"])),
    Tool("undo_clinic_edit", "Undo the latest bot edit of a clinic (within 30 days).", _obj({"target": S}, ["target"]),
         card_vi="hoàn tác thay đổi gần nhất của clinic {target}", card_en="undo the latest change to clinic {target}"),
    Tool("rescan_clinic", "Re-scrape the clinic's own website and re-extract ALL its data, photos and VI/KO/ZH translations. Slow; only when the user wants a refresh from the web.",
         _obj({"target": S}, ["target"]), card_vi="quét lại toàn bộ dữ liệu clinic {target} từ website của họ", card_en="rescan clinic {target} from its website"),
    Tool("rescan_all_clinics", "Rescan every clinic (limit 0 = all, or a sample of N).", _obj({"limit": I}),
         card_vi="quét lại {limit} clinic (0 = tất cả)", card_en="rescan {limit} clinics (0 = all)"),
    Tool("find_clinics", "Search Google Places to discover and import NEW clinics (they start as drafts). Never use for checking a clinic we already have.",
         _obj({"query": S, "limit": I, "required_languages": {"type": "array", "items": S}, "facility_types": {"type": "array", "items": S}}, ["query"]),
         card_vi="tìm clinic mới trên Google Places: “{query}” (tối đa {limit})", card_en="search Google Places for new clinics: “{query}” (up to {limit})"),
    Tool("scrape_clinic_url", "Scrape and import one clinic website URL (starts as a draft).", _obj({"clinic_name": S, "url": S}, ["url"]),
         card_vi="nhập clinic {clinic_name} từ {url}", card_en="import clinic {clinic_name} from {url}"),
    Tool("enrich_clinics_google", "Add Google Places photos, reviews and rating to existing clinics.", _obj(),
         card_vi="bổ sung ảnh, đánh giá từ Google cho các clinic", card_en="enrich clinics with Google photos and reviews"),
    Tool("repair_clinic_images", "Repair missing clinic images.", _obj(), card_vi="sửa ảnh clinic bị thiếu", card_en="repair missing clinic images"),
    Tool("change_clinic_feature_image", "Change or rotate a clinic's feature image.", _obj({"target": S, "image_url": S}, ["target"]),
         card_vi="đổi ảnh đại diện của clinic {target}", card_en="change the feature image of clinic {target}"),
    Tool("approve_clinic", "Publish one DRAFT clinic so it appears on the website ('all' publishes every draft).", _obj({"target": S}, ["target"]),
         card_vi="duyệt và đăng clinic {target} lên website", card_en="publish clinic {target} on the website"),
    Tool("reject_clinic", "Hide (archive) one clinic from the website; can be restored.", _obj({"target": S}, ["target"]),
         card_vi="ẩn clinic {target} khỏi website", card_en="hide clinic {target} from the website"),
    Tool("delete_clinic", "Permanently delete one clinic.", _obj({"target": S}, ["target"]),
         card_vi="XOÁ clinic {target}", card_en="DELETE clinic {target}"),
    Tool("approve_claim", "Approve a clinic ownership claim.", _obj({"target": S}, ["target"]), card_vi="duyệt yêu cầu nhận clinic {target}", card_en="approve the claim {target}"),
    Tool("reject_claim", "Reject a clinic ownership claim.", _obj({"target": S}, ["target"]), card_vi="từ chối yêu cầu nhận clinic {target}", card_en="reject the claim {target}"),

    # ---- website, SEO
    Tool("web_edit", "Change the website's DESIGN or CODE (look, layout, components, site-wide text). NOT for the content of one clinic (use update_clinic).  Opens a GitHub Pull Request with preview screenshots; nothing goes live until it is merged.",
         _obj({"instruction": S}, ["instruction"]), card_vi="sửa website (mở Pull Request để bạn duyệt): {instruction}", card_en="edit the website (opens a Pull Request for review): {instruction}"),
    Tool("seo_setup", "Implement or fix SEO code (metadata, JSON-LD, sitemap). Opens a Pull Request.", _obj({"instruction": S}),
         card_vi="cài đặt/sửa SEO (mở Pull Request): {instruction}", card_en="set up or fix SEO (opens a Pull Request): {instruction}"),
    Tool("seo_audit", "Audit SEO of a page (metadata, schema, headings, alt text).", _obj({"route": S}), card_vi="kiểm tra SEO trang {route}", card_en="audit the SEO of {route}"),
    Tool("site_analyze", "Run a UX, speed and conversion-funnel probe of the live site.", _obj({"route": S, "timeframe": S}),
         card_vi="phân tích UX và tốc độ trang {route}", card_en="analyze UX and speed of {route}"),

    # ---- content
    Tool("generate_insight", "Write one SEO insight article (1200-1500 words).", _obj({"topic": S}), card_vi="viết một bài insight: {topic}", card_en="write one insight article: {topic}"),
    Tool("generate_guide", "Write one pillar guide (2000-3000 words).", _obj({"topic": S}), card_vi="viết một guide: {topic}", card_en="write one guide: {topic}"),
    Tool("generate_pulse", "Write one monthly newsletter issue.", _obj({"topic": S}), card_vi="viết một số newsletter: {topic}", card_en="write one newsletter issue: {topic}"),
    Tool("generate_insight_from_urls", "Write an insight article from reference URLs.", _obj({"urls": {"type": "array", "items": S}}, ["urls"]),
         card_vi="viết bài insight từ {urls}", card_en="write an insight from {urls}"),
    Tool("generate_guide_from_urls", "Write a guide from reference URLs.", _obj({"urls": {"type": "array", "items": S}}, ["urls"]),
         card_vi="viết guide từ {urls}", card_en="write a guide from {urls}"),
    Tool("rewrite_article", "Rewrite an existing article and save it as the next version.", _obj({"target": S, "instruction": S}, ["target"]),
         card_vi="viết lại bài {target}: {instruction}", card_en="rewrite article {target}: {instruction}"),
    Tool("multi_agent_research", "Run the multi-agent research pipeline on a topic.", _obj({"request": S}, ["request"]),
         card_vi="nghiên cứu chuyên sâu: {request}", card_en="run deep research on: {request}"),
    Tool("repair_article_images", "Repair missing article images.", _obj(), card_vi="sửa ảnh bài viết bị thiếu", card_en="repair missing article images"),
    Tool("regenerate_article_images", "Regenerate the images of one article.", _obj({"target": S}, ["target"]),
         card_vi="tạo lại ảnh cho bài {target}", card_en="regenerate images for article {target}"),
    Tool("repair_article_slugs", "Convert non-ASCII article slugs to safe ASCII slugs.", _obj(), card_vi="chuẩn hoá slug bài viết", card_en="normalise article slugs"),
    Tool("delete_article", "Permanently delete one article.", _obj({"target": S}, ["target"]), card_vi="XOÁ bài {target}", card_en="DELETE article {target}"),
    Tool("newsletter_add", "Add a newsletter subscriber.", _obj({"email": S}, ["email"]), card_vi="thêm {email} vào newsletter", card_en="add {email} to the newsletter"),
    Tool("newsletter_remove", "Unsubscribe an email from the newsletter.", _obj({"email": S}, ["email"]), card_vi="huỷ đăng ký newsletter của {email}", card_en="unsubscribe {email} from the newsletter"),
]

# Tools the AGENT runs itself while thinking (read-only lookups whose result goes back to the model).
LOOKUP_TOOL = Tool(
    "find_clinic",
    "Look up clinics in our database by name, slug or city. Returns up to 5 matches with slug, status and languages. "
    "Use it to resolve an ambiguous or misspelled clinic name BEFORE calling an action tool.",
    _obj({"query": S}, ["query"]), approval=False,
)

# Only offered while a request is waiting for a yes/no.
APPROVE_TOOL = Tool("approve_pending", "The user clearly agrees to the request that is waiting for approval (in any wording).", _obj(), approval=False)
CANCEL_TOOL = Tool("cancel_pending", "The user clearly declines or abandons the request that is waiting for approval (in any wording).", _obj(), approval=False)

BY_NAME: Dict[str, Tool] = {t.name: t for t in ACTION_TOOLS}


def tool_specs(has_pending: bool) -> List[dict]:
    tools = [LOOKUP_TOOL, *ACTION_TOOLS] + ([APPROVE_TOOL, CANCEL_TOOL] if has_pending else [])
    return [t.spec() for t in tools]


class _Blank(dict):
    def __missing__(self, key):
        return "…"


def confirmation_card(name: str, params: Dict[str, Any], lang: str) -> str:
    """The sentence the user approves. Built from the parameters, so it always matches what will run."""
    tool = BY_NAME.get(name)
    template = (tool.card_vi if lang == "vi" else tool.card_en) if tool else ""
    if not template:
        template = name.replace("_", " ")
    shown = _Blank({k: (", ".join(map(str, v)) if isinstance(v, (list, tuple)) else v) for k, v in params.items() if v not in (None, "")})
    try:
        what = template.format_map(shown)
    except (ValueError, IndexError):
        what = template
    if lang == "vi":
        return f"Bạn muốn {what}, đúng không?\n\nBấm **Duyệt** (hoặc trả lời `approve`) để bắt đầu."
    return f"You want to {what}, correct?\n\nPress **Approve** (or reply `approve`) to proceed."


def clean_params(name: str, params: Any) -> Dict[str, Any]:
    """Keep only the parameters the tool declares, with sane sizes. Never trusts the model's keys."""
    tool = BY_NAME.get(name)
    if not tool or not isinstance(params, dict):
        return {}
    allowed = tool.parameters.get("properties", {})
    out: Dict[str, Any] = {}
    for key, value in params.items():
        if key not in allowed:
            continue
        if isinstance(value, str):
            value = value.strip()[:3000]
        elif isinstance(value, list):
            value = value[:30]
        out[key] = value
    if "limit" in out:
        try:
            out["limit"] = max(0, min(int(out["limit"]), 200))
        except (TypeError, ValueError):
            out.pop("limit")
    return out

"""
tool_agent.py — the OpenClaw chat brain, built on function calling.

The model sees the conversation and the list of tools (agent_tools.py) and either
  * answers / asks a short question (plain text),
  * calls ONE action tool (the bot then runs it or asks for approval), or
  * looks something up first (find_clinic), reads the result, and then decides.

`run_agent` returns the same IntentResult the Telegram bot already understands, so the bot's approval
buttons, previews and jobs are unchanged. If function calling is unavailable (no key, provider error,
unsupported model) it falls back to the older JSON intent agent, and that one tells the truth when it fails too.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Callable, Dict, List, Optional

from openai import OpenAI

import agent_tools
import intent_agent
from intent_agent import IntentResult, detect_quick_language

AGENT_MODEL = os.environ.get("OPENCLAW_AGENT_TOOL_MODEL", intent_agent.INTENT_MODEL)
FALLBACK_MODEL = intent_agent.FALLBACK_MODEL
MAX_STEPS = 4            # model calls per message (lookups included)
MAX_TOKENS = 1500


class AgentUnavailable(Exception):
    """Function calling could not produce an answer (the caller falls back to the JSON intent agent)."""


AGENT_SYSTEM = """You are OpenClaw, the operations assistant of Asian Health Hub, talking with the site team in Telegram.
Asian Health Hub helps Asian American patients find clinics that speak their language.

HOW TO WORK
- Understand what the person wants from the whole conversation, not just the last line. "this clinic", "clinics này", "nó" refer to the clinic in focus or the one just discussed.
- Everything the public reads about ONE clinic (About text, Language Support box, phone, address, languages) is DATA: change it with update_clinic. web_edit is only for site design/code. A screenshot of a clinic page with a request to correct it means that clinic's content, unless they talk about layout or colours; the clinic is the one in focus (ask which one if there is none).
- When they want something done, call exactly ONE tool. Pick the tool that matches the request literally: if they give a fact ("add Vietnamese to clinic X") use update_clinic, do not rescan.
- A clinic name may be misspelled or ambiguous: call find_clinic first, then use the exact slug.
- If something you need is missing or unclear, ask ONE short question instead of guessing. Never invent clinic names, slugs, emails or URLs.
- If the request is a question or small talk, just answer it, briefly and concretely.
- If you cannot do it, say so plainly and name the closest thing you can do.
- Tools that change anything show the person a confirmation card with Approve / Cancel; you never need to ask "are you sure?" yourself, and never claim something was done before the tool result says so.
- Managing user accounts (invite, role, disable, delete) is NOT a tool: point to /users, /user, /user_add, /user_role, /user_disable, /user_restore, /users_purge.
- To publish a website change that the bot opened as a Pull Request ("approve", "publish", "go live"), call merge_web_pr; to discard it close_web_pr; to undo a published one revert_web_pr. The bot checks the sender's rights and asks for confirmation.

STYLE
- Reply in the language of the person's latest message (Vietnamese or English). Natural, friendly, short. No self-introduction, no list of everything you can do unless asked.
- Never show internal tool names to the person.
"""


def resolve_lang(text: str, preferred: Optional[str]) -> str:
    """Vietnamese if the text clearly is; very short messages ("ok", "ừ") keep the chat's previous language."""
    if detect_quick_language(text) == "vi":
        return "vi"
    return preferred if preferred == "vi" and len(text.split()) <= 3 else "en"


def _system_prompt(focus: Optional[dict], pending: Optional[dict], preferred_lang: str) -> str:
    context = [f"Today is {time.strftime('%Y-%m-%d')}. The chat's previous language: {preferred_lang}."]
    if focus and focus.get("clinic"):
        context.append(f"Clinic in focus: {focus['clinic']}.")
    if pending:
        context.append(
            "A request is WAITING for the person's approval: "
            f"{pending.get('name') or pending.get('type')}. If their message agrees or declines (any wording), use approve_pending / cancel_pending; "
            "if it changes or corrects the request, call the right tool for the NEW request; if it is a question about it, answer."
        )
    return AGENT_SYSTEM + "\nCONTEXT\n- " + "\n- ".join(context)


def _history_messages(history: Optional[List[Dict[str, str]]]) -> List[dict]:
    out = []
    for item in (history or [])[-10:]:
        text = str(item.get("text") or "").strip()
        if text:
            out.append({"role": "assistant" if item.get("role") == "bot" else "user", "content": text[:600]})
    return out


def _default_lookup(arguments: dict) -> str:
    from jobs import _find_clinic_rows

    query = str(arguments.get("query") or "").strip()
    if not query:
        return "[]"
    rows = _find_clinic_rows(query)
    return json.dumps(
        [{"name": r.get("name"), "slug": r.get("slug"), "status": r.get("status"), "city": r.get("city"),
          "languages": r.get("languages")} for r in rows],
        ensure_ascii=False,
    )


def _assistant_call(message: Any, call: Any) -> dict:
    return {
        "role": "assistant",
        "content": getattr(message, "content", None) or None,
        "tool_calls": [{"id": call.id, "type": "function", "function": {"name": call.function.name, "arguments": call.function.arguments or "{}"}}],
    }


def _decide(model: str, messages: List[dict], specs: List[dict], lookup: Callable[[dict], str]) -> dict:
    """The tool loop. Returns {"reply": text} or {"tool": name, "args": dict}."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=40)
    messages = list(messages)
    for _ in range(MAX_STEPS):
        response = client.chat.completions.create(
            model=model, messages=messages, tools=specs, tool_choice="auto", temperature=0.2, max_tokens=MAX_TOKENS,
        )
        choice = response.choices[0]
        message = choice.message
        calls = getattr(message, "tool_calls", None) or []
        if not calls:
            if getattr(choice, "finish_reason", None) == "length":
                raise ValueError("the answer was cut off (finish_reason=length)")
            text = (message.content or "").strip()
            if not text:
                raise ValueError("the model returned nothing")
            return {"reply": text}

        call = calls[0]  # one tool per turn; any others are ignored
        name = call.function.name
        try:
            args = json.loads(call.function.arguments or "{}")
            if not isinstance(args, dict):
                raise ValueError("arguments must be an object")
        except ValueError as exc:
            messages += [_assistant_call(message, call), {"role": "tool", "tool_call_id": call.id, "content": f"Error: invalid arguments ({exc}). Call it again with valid JSON."}]
            continue

        if name == agent_tools.LOOKUP_TOOL.name:
            try:
                result = lookup(args)
            except Exception as exc:
                result = f"Error: lookup failed ({exc!r})"
            messages += [_assistant_call(message, call), {"role": "tool", "tool_call_id": call.id, "content": result[:3000]}]
            continue
        if name in (agent_tools.APPROVE_TOOL.name, agent_tools.CANCEL_TOOL.name) or name in agent_tools.BY_NAME:
            return {"tool": name, "args": args}
        messages += [_assistant_call(message, call), {"role": "tool", "tool_call_id": call.id, "content": f"Error: there is no tool called {name}."}]
    raise ValueError("too many tool steps")


def _to_result(decision: dict, text: str, lang: str, pending: Optional[dict]) -> IntentResult:
    if "reply" in decision:
        return IntentResult(action="chat", lang=lang, requires_approval=False, is_direct_chat=True, direct_reply=decision["reply"])

    name = decision["tool"]
    if name in (agent_tools.APPROVE_TOOL.name, agent_tools.CANCEL_TOOL.name):
        if not pending:
            note = "Hiện không có thao tác nào đang chờ duyệt." if lang == "vi" else "Nothing is waiting for approval right now."
            return IntentResult(action="chat", lang=lang, requires_approval=False, is_direct_chat=True, direct_reply=note)
        approving = name == agent_tools.APPROVE_TOOL.name
        return IntentResult(action=pending.get("type", "unknown"), lang=lang, is_approval=approving, is_rejection=not approving,
                            requires_approval=False, parameters=pending)

    tool = agent_tools.BY_NAME[name]
    params = agent_tools.clean_params(name, decision.get("args"))
    missing = [k for k in tool.parameters.get("required", []) if params.get(k) in (None, "", [])]
    if missing:
        ask = (f"Mình còn thiếu thông tin: {', '.join(missing)}. Bạn cho mình biết thêm nhé." if lang == "vi"
               else f"I still need: {', '.join(missing)}. Could you tell me?")
        return IntentResult(action="chat", lang=lang, requires_approval=False, is_direct_chat=True, direct_reply=ask)
    label = params.get("target") or params.get("query") or params.get("topic") or params.get("instruction") or ""
    params["name"] = f"{name}: {str(label)[:36]}".rstrip(": ")
    return IntentResult(
        action=name, lang=lang, parameters=params, requires_approval=tool.approval,
        confirmation_message=agent_tools.confirmation_card(name, params, lang) if tool.approval else "",
    )


def run_agent(
    message: str,
    memory: Optional[Dict[str, Any]] = None,
    pending_action: Optional[Dict[str, Any]] = None,
    preferred_lang: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
    focus: Optional[Dict[str, Any]] = None,
    lookup: Callable[[dict], str] = _default_lookup,
) -> IntentResult:
    text = (message or "").strip()
    legacy = lambda: intent_agent.run_intent_agent(  # noqa: E731
        message, memory=memory, pending_action=pending_action, preferred_lang=preferred_lang, history=history, focus=focus,
    )
    if not text or os.environ.get("OPENCLAW_AGENT_MODE", "tools").lower() == "json" or not os.environ.get("OPENROUTER_API_KEY"):
        return legacy()

    lang = resolve_lang(text, preferred_lang)
    # Deterministic shortcuts that need no model (and so cannot fail with it).
    if pending_action and intent_agent.is_quick_approval(text):
        return IntentResult(action=pending_action.get("type", "unknown"), lang=pending_action.get("lang") or lang, is_approval=True, requires_approval=False, parameters=pending_action)
    if pending_action and intent_agent.is_quick_rejection(text):
        return IntentResult(action=pending_action.get("type", "unknown"), lang=pending_action.get("lang") or lang, is_rejection=True, requires_approval=False, parameters=pending_action)
    quick = intent_agent.quick_inspect_intent(text)
    if quick:
        return quick

    messages = [{"role": "system", "content": _system_prompt(focus, pending_action, preferred_lang or lang)}, *_history_messages(history)]
    if memory and memory.get("text"):
        messages.append({"role": "system", "content": f"Output of the latest job ({memory.get('name')}):\n{str(memory['text'])[:1200]}"})
    messages.append({"role": "user", "content": text})
    specs = agent_tools.tool_specs(has_pending=bool(pending_action))

    for model in dict.fromkeys([AGENT_MODEL, FALLBACK_MODEL]):
        try:
            return _to_result(_decide(model, messages, specs, lookup), text, lang, pending_action)
        except Exception as exc:
            print(f"[!] Tool agent failed on {model}: {exc!r}")
    print("[!] Function calling unavailable; using the JSON intent agent")
    return legacy()

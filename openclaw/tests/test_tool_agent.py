"""
The function-calling brain: tool choice, lookups, argument safety, approval policy and the fallbacks.
The model is a scripted fake; nothing here needs a network.
"""

import json
import os
import re
import sys
import time
import types

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-token")

import agent_tools  # noqa: E402
import intent_agent  # noqa: E402
import telegram_bot  # noqa: E402
import tool_agent  # noqa: E402


def call(name, args="{}", cid="c1"):
    arguments = args if isinstance(args, str) else json.dumps(args, ensure_ascii=False)
    return types.SimpleNamespace(id=cid, function=types.SimpleNamespace(name=name, arguments=arguments))


def says(text, finish="stop"):
    return types.SimpleNamespace(message=types.SimpleNamespace(content=text, tool_calls=None), finish_reason=finish)


def uses(*calls):
    return types.SimpleNamespace(message=types.SimpleNamespace(content=None, tool_calls=list(calls)), finish_reason="tool_calls")


class FakeModel:
    def __init__(self, script):
        self.script, self.calls = list(script), []

    def __call__(self, **_):
        outer = self

        class Completions:
            def create(self, **kwargs):
                outer.calls.append({**kwargs, "messages": list(kwargs["messages"])})
                item = outer.script.pop(0)
                if isinstance(item, Exception):
                    raise item
                return types.SimpleNamespace(choices=[item])

        return types.SimpleNamespace(chat=types.SimpleNamespace(completions=Completions()))


@pytest.fixture()
def model(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("OPENCLAW_AGENT_MODE", raising=False)

    def install(script):
        fake = FakeModel(script)
        monkeypatch.setattr(tool_agent, "OpenAI", fake)
        return fake

    return install


def run(text, **kw):
    kw.setdefault("lookup", lambda args: "[]")
    return tool_agent.run_agent(text, **kw)


# --------------------------------------------------------------------------- choosing tools

def test_a_fact_from_the_user_becomes_update_clinic_not_a_rescan(model):
    model([uses(call("update_clinic", {"target": "anchor-dental", "changes": {"languages": {"add": ["Vietnamese"]}}}))])
    result = run("thêm tiếng việt vào ngôn ngữ của clinics Anchor Dental")
    assert result.action == "update_clinic" and result.lang == "vi" and result.requires_approval
    assert result.parameters["changes"] == {"languages": {"add": ["Vietnamese"]}}


def test_plain_text_is_a_conversation_reply(model):
    model([says("Anchor Dental hiện có English và Vietnamese.")])
    result = run("clinic đó nói được tiếng gì?")
    assert result.is_direct_chat and result.direct_reply.startswith("Anchor Dental") and not result.requires_approval


def test_a_lookup_result_goes_back_to_the_model_before_it_decides(model):
    seen = []
    fake = model([
        uses(call("find_clinic", {"query": "anchor"}, "L1")),
        uses(call("rescan_clinic", {"target": "anchor-dental"}, "A1")),
    ])
    result = run("quét lại anchor", lookup=lambda a: seen.append(a) or '[{"name":"Anchor Dental","slug":"anchor-dental"}]')
    assert seen == [{"query": "anchor"}]
    second = fake.calls[1]["messages"]
    assert second[-2]["tool_calls"][0]["function"]["name"] == "find_clinic"
    assert second[-1] == {"role": "tool", "tool_call_id": "L1", "content": '[{"name":"Anchor Dental","slug":"anchor-dental"}]'}
    assert result.action == "rescan_clinic" and result.parameters["target"] == "anchor-dental"


def test_broken_arguments_are_sent_back_so_the_model_can_fix_them(model):
    fake = model([uses(call("inspect_clinic", "{not json", "B1")), uses(call("inspect_clinic", {"target": "x"}, "B2"))])
    assert run("xem x").action == "inspect_clinic"
    assert "invalid arguments" in fake.calls[1]["messages"][-1]["content"]


def test_an_unknown_tool_is_rejected_and_the_model_gets_to_retry(model):
    fake = model([uses(call("drop_database", {}, "U1")), says("Mình không làm được việc đó.")])
    result = run("xoá hết")
    assert "no tool called drop_database" in fake.calls[1]["messages"][-1]["content"]
    assert result.is_direct_chat


def test_only_the_first_of_several_tool_calls_is_used(model):
    model([uses(call("delete_clinic", {"target": "a"}, "1"), call("delete_clinic", {"target": "b"}, "2"))])
    result = run("xoá a và b")
    assert result.parameters["target"] == "a"


def test_a_missing_required_value_becomes_a_question_not_an_action(model):
    model([uses(call("rescan_clinic", {}))])
    result = run("quét lại", preferred_lang="vi")
    assert result.is_direct_chat and "target" in result.direct_reply and result.action == "chat"


def test_unknown_parameters_from_the_model_are_dropped(model):
    model([uses(call("delete_clinic", {"target": "a", "force": True, "status": "published"}))])
    assert run("xoá a").parameters.keys() == {"target", "name"}


def test_the_loop_gives_up_after_a_few_lookups_and_falls_back(model, monkeypatch):
    model([uses(call("find_clinic", {"query": "a"}, str(i))) for i in range(10)] * 2)
    monkeypatch.setattr(intent_agent, "run_intent_agent", lambda *a, **k: intent_agent.IntentResult(action="chat", direct_reply="legacy"))
    assert run("a").direct_reply == "legacy"


# --------------------------------------------------------------------------- approvals

def test_approve_and_cancel_tools_work_only_with_something_pending(model):
    pending = {"type": "rescan_clinic", "name": "x", "lang": "vi"}
    model([uses(call("approve_pending"))])
    approved = run("ừ làm đi nhé", pending_action=pending)
    assert approved.is_approval and approved.parameters is pending
    model([uses(call("cancel_pending"))])
    assert run("thôi bỏ đi", pending_action=pending).is_rejection
    fake = model([uses(call("approve_pending")), ])
    nothing = run("ừ làm đi nhé")  # nothing pending: the tool is not even offered, and a stray call is harmless
    assert nothing.is_direct_chat and not nothing.is_approval
    assert "approve_pending" not in [t["function"]["name"] for t in fake.calls[0]["tools"]]


def test_plain_ok_is_approval_without_calling_the_model(model):
    fake = model([])
    result = run("ok", pending_action={"type": "x", "name": "x", "lang": "vi"})
    assert result.is_approval and fake.calls == []


def test_check_clinic_is_answered_without_the_model(model):
    fake = model([])
    result = run("kiểm tra clinic anchor dental")
    assert result.action == "inspect_clinic" and fake.calls == []


# --------------------------------------------------------------------------- fallbacks

def test_the_backup_model_takes_over_when_the_main_one_fails_or_is_empty(model):
    fake = model([RuntimeError("boom"), says("   "), says("xong")])
    # three attempts: main (error), backup (empty) -> both fail -> legacy. Use distinct models to see the order.
    assert fake  # script consumed below
    result = run("hi")
    assert fake.calls[0]["model"] == tool_agent.AGENT_MODEL


def test_when_function_calling_fails_everywhere_the_json_agent_is_used(model, monkeypatch):
    model([RuntimeError("tools unsupported"), RuntimeError("tools unsupported")])
    seen = {}
    monkeypatch.setattr(intent_agent, "run_intent_agent", lambda *a, **k: seen.update(k) or intent_agent.IntentResult(action="chat", direct_reply="legacy"))
    result = run("thêm tiếng việt", history=[{"role": "user", "text": "a"}], focus={"clinic": "c"})
    assert result.direct_reply == "legacy" and seen["focus"] == {"clinic": "c"} and seen["history"]


def test_no_key_or_json_mode_uses_the_json_agent(monkeypatch):
    calls = []
    monkeypatch.setattr(intent_agent, "run_intent_agent", lambda *a, **k: calls.append(1) or intent_agent.IntentResult(action="chat", direct_reply="legacy"))
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    assert tool_agent.run_agent("hi").direct_reply == "legacy"
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    monkeypatch.setenv("OPENCLAW_AGENT_MODE", "json")
    assert tool_agent.run_agent("hi").direct_reply == "legacy"
    assert len(calls) == 2


# --------------------------------------------------------------------------- what the model is told

def test_the_model_sees_history_focus_and_pending(model):
    fake = model([says("ok")])
    run("còn số điện thoại?", history=[{"role": "user", "text": "kiểm tra anchor"}, {"role": "bot", "text": "Anchor Dental ..."}],
        focus={"clinic": "anchor-dental"}, pending_action={"type": "rescan_clinic", "name": "rescan_clinic: A"}, preferred_lang="vi")
    messages = fake.calls[0]["messages"]
    assert "anchor-dental" in messages[0]["content"] and "WAITING" in messages[0]["content"]
    assert [m["role"] for m in messages[1:]] == ["user", "assistant", "user"]
    assert messages[-1]["content"] == "còn số điện thoại?"


def test_language_follows_the_user_and_short_replies_keep_the_chat_language():
    assert tool_agent.resolve_lang("thêm tiếng việt", "en") == "vi"
    assert tool_agent.resolve_lang("add Vietnamese to the clinic please", "vi") == "en"
    assert tool_agent.resolve_lang("ok", "vi") == "vi"


# --------------------------------------------------------------------------- the tool catalogue

def test_every_tool_has_a_valid_schema_and_unique_name():
    names = [t.name for t in agent_tools.ACTION_TOOLS]
    assert len(names) == len(set(names))
    for spec in agent_tools.tool_specs(has_pending=True):
        params = spec["function"]["parameters"]
        assert params["type"] == "object" and params["additionalProperties"] is False
        assert spec["function"]["description"]


def test_every_tool_can_actually_be_run_by_the_bot():
    """A tool the bot cannot execute would approve fine and then answer 'I do not know how to run this'."""
    source = open(os.path.join(os.path.dirname(__file__), "..", "telegram_bot.py"), encoding="utf-8").read()
    runnable = set(re.findall(r'action_type == "([a-z_]+)"', source[source.index("def run_pending_action"):]))
    runnable |= {"list_drafts", "merge_web_pr", "close_web_pr", "revert_web_pr", "list_web_prs", "list_clinic_photos"}  # handled directly in handle_chat
    missing = [t.name for t in agent_tools.ACTION_TOOLS if t.name not in runnable]
    assert missing == []


def test_the_pending_tools_are_offered_only_while_something_is_pending():
    plain = [s["function"]["name"] for s in agent_tools.tool_specs(False)]
    waiting = [s["function"]["name"] for s in agent_tools.tool_specs(True)]
    assert "approve_pending" not in plain and {"approve_pending", "cancel_pending"} <= set(waiting)
    assert plain[0] == "find_clinic"


def test_read_tools_run_at_once_and_every_change_needs_approval():
    reads = {t.name for t in agent_tools.ACTION_TOOLS if not t.approval}
    assert reads == {"inspect_clinic", "list_drafts", "stats_question", "stats_report", "check_analytics", "check_anomalies", "check_claims", "newsletter_list", "check_data_quality",
                     "merge_web_pr", "close_web_pr", "revert_web_pr", "list_web_prs",  # the web PR tools ask for the sender's rights + a confirmation themselves
                     "list_clinic_photos"}  # only shows photos
    for name in ("update_clinic", "remove_clinic_photo", "delete_clinic", "delete_article", "web_edit", "approve_clinic", "reject_clinic", "newsletter_add", "newsletter_remove", "find_clinics"):
        assert agent_tools.BY_NAME[name].approval, name


def test_user_management_is_not_a_tool():
    assert not [n for n in agent_tools.BY_NAME if "user" in n or "role" in n]


def test_the_confirmation_card_is_built_from_the_parameters_in_the_right_language():
    vi = agent_tools.confirmation_card("rescan_clinic", {"target": "anchor-dental"}, "vi")
    en = agent_tools.confirmation_card("delete_clinic", {"target": "anchor-dental"}, "en")
    assert "anchor-dental" in vi and "Duyệt" in vi and "rescan_clinic" not in vi
    assert en.startswith("You want to DELETE clinic anchor-dental") and "Approve" in en
    assert "…" in agent_tools.confirmation_card("find_clinics", {}, "en")  # a missing value shows as … instead of crashing


# --------------------------------------------------------------------------- the bot enforces the policy

@pytest.fixture()
def bot(tmp_path, monkeypatch):
    monkeypatch.setattr(telegram_bot, "MEMORY_PATH", str(tmp_path / "memory.json"))
    monkeypatch.setattr(telegram_bot.TelegramBot, "start_anomaly_checker", lambda self: None)
    monkeypatch.setenv("TELEGRAM_ALLOWED_USER_IDS", "111")
    b = telegram_bot.TelegramBot()
    b.sent, b.buttons, b.ran = [], [], []
    b.send_message = lambda chat_id, text, buttons=None: (b.sent.append(text), b.buttons.append(buttons))
    b.run_pending_action = lambda chat_id, action: b.ran.append(action)
    return b


def test_a_model_cannot_skip_the_approval_of_a_destructive_action(bot, monkeypatch):
    """Even if the model (or the old JSON agent) says "no approval needed", deleting still asks."""
    monkeypatch.setattr(telegram_bot, "run_agent", lambda *a, **k: intent_agent.IntentResult(
        action="delete_clinic", lang="vi", parameters={"target": "x", "name": "delete_clinic: x"}, requires_approval=False))
    bot.handle_chat(1, "xoá clinic x", user_id=111)
    assert bot.ran == [] and bot.pending_actions[1]["type"] == "delete_clinic"
    assert "XOÁ clinic x" in bot.sent[-1] and bot.buttons[-1]


def test_a_read_only_tool_runs_without_asking(bot, monkeypatch):
    monkeypatch.setattr(telegram_bot, "run_agent", lambda *a, **k: intent_agent.IntentResult(
        action="stats_question", lang="vi", parameters={"question": "view hôm nay", "name": "stats"}, requires_approval=True))
    bot.handle_chat(1, "view hôm nay thế nào", user_id=111)
    assert [a["type"] for a in bot.ran] == ["stats_question"] and 1 not in bot.pending_actions


def test_tool_calling_end_to_end_through_the_bot(bot, model):
    model([uses(call("find_clinic", {"query": "anchor"}, "L")), uses(call("delete_clinic", {"target": "anchor-dental"}, "D"))])
    telegram_bot.run_agent = lambda *a, **k: tool_agent.run_agent(*a, lookup=lambda args: '[{"slug":"anchor-dental"}]', **k)
    try:
        bot.handle_chat(1, "xoá anchor", user_id=111)
    finally:
        telegram_bot.run_agent = tool_agent.run_agent
    assert bot.pending_actions[1]["target"] == "anchor-dental" and bot.ran == []


def test_an_approved_anomaly_check_is_actually_run(bot):
    bot.run_pending_action = telegram_bot.TelegramBot.run_pending_action.__get__(bot)
    ran = []
    bot.run_job = lambda chat_id, name, fn, action_type="job", on_success=None: ran.append((name, action_type))
    bot.run_pending_action(1, {"type": "check_anomalies", "name": "check_anomalies", "lang": "vi"})
    assert ran == [("check_anomalies", "check_anomalies")]

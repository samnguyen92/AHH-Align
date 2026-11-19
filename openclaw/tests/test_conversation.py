"""
Conversation quality: the intent agent must survive truncated/garbled model output, remember the conversation,
and the bot must turn "add Vietnamese to this clinic" into a previewed, undoable edit (real PostgreSQL for the edit part).
"""

import json
import os
import sys
import time
import types

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-token")

import intent_agent  # noqa: E402
import telegram_bot  # noqa: E402
from tg_format import markdown_to_html  # noqa: E402

TEST_URL = os.environ.get("OPENCLAW_TEST_DATABASE_URL")
needs_db = pytest.mark.skipif(not TEST_URL, reason="OPENCLAW_TEST_DATABASE_URL not set")


# --------------------------------------------------------------------------- a scriptable fake OpenAI client

class FakeLLM:
    """Replaces intent_agent.OpenAI. `script` is a list of answers (str) or exceptions, consumed per call."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def __call__(self, **_):
        outer = self

        class Completions:
            def create(self, **kwargs):
                outer.calls.append(kwargs)
                item = outer.script.pop(0)
                if isinstance(item, Exception):
                    raise item
                text, finish = item if isinstance(item, tuple) else (item, "stop")
                choice = types.SimpleNamespace(message=types.SimpleNamespace(content=text), finish_reason=finish)
                return types.SimpleNamespace(choices=[choice])

        return types.SimpleNamespace(chat=types.SimpleNamespace(completions=Completions()))


@pytest.fixture()
def llm(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    holder = {}

    def install(script):
        holder["fake"] = FakeLLM(script)
        monkeypatch.setattr(intent_agent, "OpenAI", holder["fake"])
        return holder["fake"]

    return install


def _answer(**fields):
    return json.dumps({"lang": "vi", "requires_approval": False, **fields}, ensure_ascii=False)


# --------------------------------------------------------------------------- intent agent

def test_truncated_json_from_the_main_model_falls_back_to_the_backup_model(llm):
    """The real failure from production: 'Unterminated string starting at ... char 449'."""
    cut = '{"action": "rescan_clinic", "lang": "vi", "confirmation_message": "Bạn muốn quét lại phòng khám Anc'
    fake = llm([cut, _answer(action="update_clinic", parameters={"target": "anchor-dental", "changes": {"languages": {"add": ["Vietnamese"]}}})])
    result = intent_agent.run_intent_agent("thêm tiếng việt cho anchor dental")
    assert result.action == "update_clinic"
    assert len(fake.calls) == 2  # main model, then the backup


def test_answer_cut_by_the_token_limit_is_treated_as_a_failure_not_parsed(llm):
    fake = llm([('{"action": "chat"', "length"), _answer(action="chat", direct_reply="Xin chào")])
    assert intent_agent.run_intent_agent("hi").direct_reply == "Xin chào"
    assert len(fake.calls) == 2


def test_the_token_limit_is_large_enough_for_the_json(llm):
    fake = llm([_answer(action="chat", direct_reply="ok")])
    intent_agent.run_intent_agent("hi")
    assert fake.calls[0]["max_tokens"] >= 1500  # 600 truncated the answers


def test_json_wrapped_in_prose_is_still_read(llm):
    llm(['Sure! ```json\n' + _answer(action="chat", direct_reply="ok") + '\n```'])
    assert intent_agent.run_intent_agent("hi").direct_reply == "ok"


def test_when_every_model_fails_the_user_is_told_the_truth_not_a_canned_greeting(llm):
    llm([RuntimeError("timeout"), RuntimeError("timeout")])
    result = intent_agent.run_intent_agent("thêm tiếng việt cho clinic này", preferred_lang="vi")
    assert result.is_direct_chat and "AI" in result.direct_reply
    assert "OpenClaw Agent" not in result.direct_reply
    assert result.reason.startswith("llm_unavailable")
    assert result.requires_approval is False


def test_conversation_and_focus_are_sent_to_the_model(llm):
    fake = llm([_answer(action="chat", direct_reply="ok")])
    history = [{"role": "user", "text": "kiểm tra anchor dental"}, {"role": "bot", "text": "Anchor Dental ..."}]
    intent_agent.run_intent_agent("thêm tiếng việt cho clinic này", history=history, focus={"clinic": "anchor-dental"})
    payload = json.loads(fake.calls[0]["messages"][1]["content"])
    assert payload["recent_conversation"] == history
    assert payload["focus"] == {"clinic": "anchor-dental"}


def test_the_model_can_recognise_a_refusal_in_any_wording_when_something_is_pending(llm):
    llm([_answer(action="rescan_clinic", is_rejection=True)])
    pending = {"type": "rescan_clinic", "name": "rescan_clinic: Anchor Dental", "lang": "vi"}
    result = intent_agent.run_intent_agent("không cần quét lại", pending_action=pending)
    assert result.is_rejection and result.parameters is pending


def test_approval_or_refusal_flags_are_ignored_when_nothing_is_pending(llm):
    llm([_answer(action="chat", is_approval=True, direct_reply="Không có gì đang chờ.")])
    result = intent_agent.run_intent_agent("ừ làm đi")
    assert not result.is_approval and result.direct_reply


def test_prompt_no_longer_forces_english_and_knows_the_new_actions():
    prompt = intent_agent.INTENT_AGENT_SYSTEM_PROMPT
    assert "DEFAULT LANGUAGE IS ENGLISH" not in prompt
    assert "update_clinic" in prompt and "undo_clinic_edit" in prompt


# --------------------------------------------------------------------------- Telegram formatting

def test_markdown_becomes_telegram_html():
    assert markdown_to_html("**Tên**: `anchor-dental`") == "<b>Tên</b>: <code>anchor-dental</code>"


def test_html_in_data_cannot_inject_tags():
    out = markdown_to_html("**x** <script>alert(1)</script> & [a](https://e.com/?q=\"1\")")
    assert "<script>" not in out and "&lt;script&gt;" in out and "&amp;" in out
    assert '<a href="https://e.com/?q=&quot;1&quot;">a</a>' in out


def test_bold_markers_inside_code_are_left_alone():
    assert markdown_to_html("`a **b** c`") == "<code>a **b** c</code>"


# --------------------------------------------------------------------------- bot flow

@pytest.fixture()
def bot(tmp_path, monkeypatch):
    monkeypatch.setattr(telegram_bot, "MEMORY_PATH", str(tmp_path / "memory.json"))
    monkeypatch.setattr(telegram_bot.TelegramBot, "start_anomaly_checker", lambda self: None)
    monkeypatch.setenv("TELEGRAM_ALLOWED_USER_IDS", "111,222")
    b = telegram_bot.TelegramBot()
    b.sent, b.buttons, b.api = [], [], []
    b.send_message = lambda chat_id, text, buttons=None: (b.sent.append(text), b.buttons.append(buttons), b.remember_turn(chat_id, "bot", text))
    b.send_long_message = lambda chat_id, text, max_chunks=None: b.sent.append(text)
    b.request = lambda method, payload=None: (b.api.append((method, payload)), {"ok": True})[1]
    return b


def _intent(**kw):
    return lambda *a, **k: intent_agent.IntentResult(**kw)


def test_a_chat_without_a_model_reply_goes_to_the_chat_agent_with_the_history(bot, monkeypatch):
    seen = {}
    monkeypatch.setattr(telegram_bot, "run_intent_agent", _intent(action="chat", is_direct_chat=True, requires_approval=False, direct_reply=None))
    monkeypatch.setattr(telegram_bot, "ask_openclaw_agent", lambda text, history=None: seen.update(text=text, history=history) or "câu trả lời thật")
    bot.handle_chat(1, "kiểm tra anchor dental")
    bot.handle_chat(1, "nó có tiếng việt chưa?")
    assert bot.sent[-1] == "câu trả lời thật"
    assert any("anchor dental" in turn["text"] for turn in seen["history"])  # the earlier turn is remembered
    assert all(turn["text"] != "nó có tiếng việt chưa?" for turn in seen["history"])  # and not duplicated


def test_asking_a_question_keeps_the_pending_action(bot, monkeypatch):
    bot.pending_actions[1] = {"type": "rescan_clinic", "name": "x", "lang": "vi", "id": "abc", "expires_at": time.time() + 60}
    monkeypatch.setattr(telegram_bot, "run_intent_agent", _intent(action="chat", is_direct_chat=True, requires_approval=False, direct_reply="Quét lại mất ~2 phút."))
    bot.handle_chat(1, "quét lại mất bao lâu?")
    assert 1 in bot.pending_actions and bot.sent[-1].startswith("Quét lại")


def test_a_new_request_replaces_the_pending_one_and_shows_buttons(bot, monkeypatch):
    bot.pending_actions[1] = {"type": "rescan_clinic", "name": "old", "lang": "vi", "id": "old1"}
    monkeypatch.setattr(telegram_bot, "run_intent_agent", _intent(
        action="web_edit", lang="vi", parameters={"instruction": "đổi màu nút", "name": "web_edit: đổi màu nút"},
        requires_approval=True, confirmation_message="Bạn muốn đổi màu nút, đúng không?"))
    bot.handle_chat(1, "đổi màu nút")
    pending = bot.pending_actions[1]
    assert pending["type"] == "web_edit" and pending["id"] != "old1" and pending["expires_at"] > time.time()
    labels = [label for row in bot.buttons[-1] for label, _ in row]
    assert labels == ["✅ Duyệt", "❌ Huỷ"]


def test_approval_that_the_model_has_no_message_for_still_gets_a_confirmation(bot, monkeypatch):
    monkeypatch.setattr(telegram_bot, "run_intent_agent", _intent(
        action="web_edit", lang="vi", parameters={"instruction": "x", "name": "web_edit: x"}, requires_approval=True, confirmation_message=""))
    bot.handle_chat(1, "sửa gì đó")
    assert "đúng không" in bot.sent[-1] and bot.buttons[-1]


def test_buttons_only_work_for_the_current_request(bot, monkeypatch):
    bot.pending_actions[1] = {"type": "x", "name": "x", "lang": "vi", "id": "cur1", "expires_at": time.time() + 60}
    stale = {"id": "cb1", "from": {"id": 111}, "message": {"chat": {"id": 1}, "message_id": 5}, "data": "ok:old1"}
    bot.handle_callback(stale)
    assert 1 in bot.pending_actions  # nothing was approved
    assert any(m == "answerCallbackQuery" and "hết hạn" in (p.get("text") or "") for m, p in bot.api)


def test_buttons_are_refused_for_users_who_are_not_allowed(bot):
    bot.pending_actions[1] = {"type": "x", "name": "x", "lang": "en", "id": "cur1", "expires_at": time.time() + 60}
    bot.handle_callback({"id": "cb", "from": {"id": 999}, "message": {"chat": {"id": 1}, "message_id": 5}, "data": "ok:cur1"})
    assert 1 in bot.pending_actions


def test_pressing_approve_runs_the_pending_action_once(bot, monkeypatch):
    ran = []
    monkeypatch.setattr(bot, "run_pending_action", lambda chat_id, action: ran.append(action["type"]))
    bot.pending_actions[1] = {"type": "demo", "name": "demo: x", "lang": "vi", "id": "cur1", "expires_at": time.time() + 60}
    press = {"id": "cb", "from": {"id": 111}, "message": {"chat": {"id": 1}, "message_id": 5}, "data": "ok:cur1"}
    bot.handle_callback(press)
    bot.handle_callback(press)  # a second press finds nothing pending
    assert ran == ["demo"]
    assert any(m == "editMessageReplyMarkup" for m, _ in bot.api)


def test_status_messages_speak_vietnamese_in_a_vietnamese_chat(bot):
    assert bot.describe_action("rescan_clinic: Anchor Dental", "vi") == "quét lại clinic Anchor Dental"
    assert bot.describe_action("rescan_clinic: Anchor Dental", "en") == "rescan_clinic: Anchor Dental"
    assert bot.describe_action("mystery: x", "vi") == "mystery: x"


# --------------------------------------------------------------------------- editing a clinic (real PostgreSQL)

PREFIX = "PyTest Edit "


@pytest.fixture()
def clinic(monkeypatch):
    if not TEST_URL:
        pytest.skip("OPENCLAW_TEST_DATABASE_URL not set")
    monkeypatch.setenv("DATABASE_URL", TEST_URL)
    monkeypatch.delenv("REVALIDATE_SECRET", raising=False)
    import pg_client

    monkeypatch.setattr(pg_client, "_INSTANCE", None)
    db = pg_client.create_client()
    db.table("clinics").delete().ilike("name", PREFIX + "%").execute()
    row = db.table("clinics").insert({
        "name": PREFIX + "Dental", "slug": "pytest-edit-dental", "city": "Houston", "state": "TX", "zip_code": "77001",
        "address": "1 Main St", "phone": "7135550100", "specialty": "Dentist", "languages": ["English"], "status": "published",
    }).execute().data[0]
    yield row
    db.table("audit_log").delete().eq("target_id", str(row["id"])).execute()
    db.table("clinics").delete().ilike("name", PREFIX + "%").execute()
    db.close()


def _languages(slug="pytest-edit-dental"):
    import pg_client

    db = pg_client.create_client()
    return db.table("clinics").select("languages,metadata,phone").eq("slug", slug).single().execute().data


@needs_db
def test_language_aliases_are_normalised():
    import clinic_edit

    assert clinic_edit.normalize_language("tiếng Việt") == "Vietnamese"
    assert clinic_edit.normalize_language(" korean ") == "Korean"
    assert clinic_edit.normalize_language("Taiwanese") == "Taiwanese"


@needs_db
def test_plan_shows_the_diff_and_writes_nothing(clinic):
    import clinic_edit

    plan = clinic_edit.plan_clinic_edit("pytest-edit-dental", {"languages": {"add": ["tiếng việt"]}})
    assert plan.changes["languages"] == ["English", "Vietnamese"]
    assert plan.lines == ["Languages: English → English, Vietnamese"]
    assert _languages()["languages"] == ["English"]


@needs_db
def test_apply_edits_audits_and_marks_languages_verified(clinic):
    import clinic_edit

    plan = clinic_edit.plan_clinic_edit("pytest-edit-dental", {"languages": {"add": ["Vietnamese"]}, "phone": "7135550199"})
    message = clinic_edit.apply_clinic_edit(plan, "telegram:111")
    row = _languages()
    assert row["languages"] == ["English", "Vietnamese"] and row["phone"] == "7135550199"
    assert row["metadata"]["languages_verified"] is True
    assert "clinic_undo" in message
    import pg_client

    log = pg_client.create_client().table("audit_log").select("actor,action,details").eq("target_id", str(clinic["id"])).execute().data
    assert log[0]["actor"] == "telegram:111" and log[0]["action"] == "clinic.edit"
    assert log[0]["details"]["before"]["phone"] == "7135550100"


@needs_db
def test_undo_restores_the_old_values_once(clinic):
    import clinic_edit

    clinic_edit.apply_clinic_edit(clinic_edit.plan_clinic_edit("pytest-edit-dental", {"languages": {"add": ["Korean"]}}), "telegram:111")
    clinic_edit.undo_clinic_edit("pytest-edit-dental", "telegram:111")
    assert _languages()["languages"] == ["English"]
    with pytest.raises(clinic_edit.ClinicEditError, match="No edit"):
        clinic_edit.undo_clinic_edit("pytest-edit-dental", "telegram:111")


@needs_db
def test_undo_refuses_to_overwrite_a_later_change(clinic):
    import clinic_edit

    clinic_edit.apply_clinic_edit(clinic_edit.plan_clinic_edit("pytest-edit-dental", {"phone": "1111111111"}), "telegram:111")
    import pg_client

    pg_client.create_client().table("clinics").update({"phone": "2222222222"}).eq("slug", "pytest-edit-dental").execute()
    with pytest.raises(clinic_edit.ClinicEditError, match="edited again"):
        clinic_edit.undo_clinic_edit("pytest-edit-dental", "telegram:111")
    assert _languages()["phone"] == "2222222222"


@needs_db
def test_apply_refuses_when_the_clinic_changed_after_the_preview(clinic):
    import clinic_edit
    import pg_client

    plan = clinic_edit.plan_clinic_edit("pytest-edit-dental", {"phone": "3333333333"})
    pg_client.create_client().table("clinics").update({"phone": "4444444444"}).eq("slug", "pytest-edit-dental").execute()
    with pytest.raises(clinic_edit.ClinicEditError, match="changed by someone else"):
        clinic_edit.apply_clinic_edit(plan, "telegram:111")
    assert _languages()["phone"] == "4444444444"


@needs_db
def test_only_whitelisted_fields_can_be_edited(clinic):
    import clinic_edit

    for field in ("status", "slug", "id", "claimed_by", "org_id", "name"):
        with pytest.raises(clinic_edit.ClinicEditError, match="not editable"):
            clinic_edit.plan_clinic_edit("pytest-edit-dental", {field: "x"})
    with pytest.raises(clinic_edit.ClinicEditError, match="not editable"):
        clinic_edit.apply_clinic_edit(clinic_edit.EditPlan(str(clinic["id"]), "s", "n", {"status": "draft"}, {}), "x")
    assert _languages()  # still there, status untouched


@needs_db
def test_sql_text_in_a_value_is_stored_as_text(clinic):
    import clinic_edit

    evil = "x'; DROP TABLE clinics; --"
    clinic_edit.apply_clinic_edit(clinic_edit.plan_clinic_edit("pytest-edit-dental", {"specialty": evil}), "telegram:111")
    import pg_client

    assert pg_client.create_client().table("clinics").select("specialty").eq("slug", "pytest-edit-dental").single().execute().data["specialty"] == evil


@needs_db
def test_no_change_ambiguous_missing_and_empty_languages_are_explained(clinic):
    import clinic_edit

    with pytest.raises(clinic_edit.ClinicEditError, match="Nothing to change"):
        clinic_edit.plan_clinic_edit("pytest-edit-dental", {"languages": {"add": ["english"]}})
    with pytest.raises(clinic_edit.ClinicEditError, match="No clinic matches"):
        clinic_edit.plan_clinic_edit("zzz-no-such-clinic-zzz", {"phone": "1"})
    with pytest.raises(clinic_edit.ClinicEditError, match="at least one language"):
        clinic_edit.plan_clinic_edit("pytest-edit-dental", {"languages": {"remove": ["English"]}})
    with pytest.raises(clinic_edit.ClinicEditError, match="too long"):
        clinic_edit.plan_clinic_edit("pytest-edit-dental", {"phone": "9" * 100})


@needs_db
def test_end_to_end_in_the_bot_exactly_the_conversation_from_the_screenshot(bot, clinic, monkeypatch):
    """'thêm ngôn ngữ support tiếng việt vào clinics này' -> preview with buttons -> approve -> saved on the site data."""
    monkeypatch.setattr(telegram_bot, "run_intent_agent", _intent(
        action="update_clinic", lang="vi", requires_approval=True,
        parameters={"target": "pytest-edit-dental", "changes": {"languages": {"add": ["Vietnamese"]}}}))
    bot.handle_chat(1, "thêm ngôn ngữ support tiếng việt vào clinics này", user_id=111)
    preview = bot.sent[-1]
    assert "English → English, Vietnamese" in preview and "hoàn tác" in preview
    assert bot.buttons[-1] and _languages()["languages"] == ["English"]  # nothing written before approval
    monkeypatch.setattr(telegram_bot, "run_intent_agent", intent_agent.run_intent_agent)  # the real quick-approval path

    bot.handle_callback({"id": "c", "from": {"id": 111}, "message": {"chat": {"id": 1}, "message_id": 9},
                         "data": f"ok:{bot.pending_actions[1]['id']}"})
    deadline = time.time() + 5
    while time.time() < deadline and _languages()["languages"] == ["English"]:
        time.sleep(0.05)
    assert _languages()["languages"] == ["English", "Vietnamese"]
    assert any("Updated" in m for m in bot.sent)
    assert bot.chat_focus[1] == {"clinic": "pytest-edit-dental"}  # "clinics này" resolves next time


@needs_db
def test_clinic_undo_command_asks_first_then_restores(bot, clinic):
    import clinic_edit

    clinic_edit.apply_clinic_edit(clinic_edit.plan_clinic_edit("pytest-edit-dental", {"phone": "5555555555"}), "telegram:111")
    bot.handle_command(1, "/clinic_undo pytest-edit-dental", user_id=111)
    assert bot.pending_actions[1]["type"] == "undo_clinic_edit" and _languages()["phone"] == "5555555555"
    bot.handle_chat(1, "approve", user_id=111)
    deadline = time.time() + 5
    while time.time() < deadline and _languages()["phone"] != "7135550100":
        time.sleep(0.05)
    assert _languages()["phone"] == "7135550100"

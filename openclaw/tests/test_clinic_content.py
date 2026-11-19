"""
Editing what visitors READ on a clinic page (the case from production: "the clinic's verified spoken languages are
English and Spanish" stayed on the page although the languages array already had Korean), and screenshots that must
not be forced into the code agent.
"""

import os
import sys
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-token")

import clinic_edit  # noqa: E402
import intent_agent  # noqa: E402
import telegram_bot  # noqa: E402

TEST_URL = os.environ.get("OPENCLAW_TEST_DATABASE_URL")
SENTENCE = "The clinic’s verified spoken languages are English and Spanish."


# --------------------------------------------------------------------------- the sentence helper (no database)

def test_the_languages_sentence_is_rewritten_with_the_site_wording():
    text = f"Dr. Kim treats patients. {SENTENCE} Contact the office."
    assert clinic_edit.sync_language_sentence(text, ["English", "Korean", "Spanish"]) == (
        "Dr. Kim treats patients. The clinic’s verified spoken languages are English, Korean and Spanish. Contact the office.")
    assert clinic_edit.sync_language_sentence("spoken languages include X.", ["English"]) == "spoken languages include English."


def test_text_without_that_sentence_is_left_alone():
    assert clinic_edit.sync_language_sentence("We speak many languages.", ["English", "Korean"]) == "We speak many languages."
    assert clinic_edit.sync_language_sentence("", ["English"]) == ""


@pytest.mark.parametrize("langs,expected", [(["A"], "A"), (["A", "B"], "A and B"), (["A", "B", "C"], "A, B and C")])
def test_join_languages(langs, expected):
    assert clinic_edit.join_languages(langs) == expected


def test_errors_have_a_vietnamese_text():
    error = clinic_edit.ClinicEditError("Nothing to change", "Không có gì để đổi")
    assert str(error) == "Nothing to change" and error.text("vi") == "Không có gì để đổi" and error.text("en") == "Nothing to change"


# --------------------------------------------------------------------------- against PostgreSQL

pytestmark_db = pytest.mark.skipif(not TEST_URL, reason="OPENCLAW_TEST_DATABASE_URL not set")
PREFIX = "PyTest Content "


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
        "name": PREFIX + "Dental", "slug": "pytest-content-dental", "city": "Frisco", "state": "TX", "zip_code": "75035",
        "address": "1 Main St", "phone": "9725254900", "specialty": "Dentist", "status": "published",
        # the languages array ALREADY has Korean, but the text people read does not say so
        "languages": ["English", "Spanish", "Korean"],
        "description": f"Dr. Kim earned her degree in 2009. {SENTENCE} Contact the office.",
        "metadata": {"about_highlight": f"Dr. Nuri Kim treats patients. {SENTENCE}", "language_note": f"{SENTENCE} Bilingual team members can help.",
                     "i18n": {"vi": {"language_note": "Các ngôn ngữ ..."}}},
    }).execute().data[0]
    yield row
    db.table("audit_log").delete().eq("target_id", str(row["id"])).execute()
    db.table("clinics").delete().ilike("name", PREFIX + "%").execute()
    db.close()


def _row():
    import pg_client

    return pg_client.create_client().table("clinics").select("*").eq("slug", "pytest-content-dental").single().execute().data


def test_the_production_case_updates_the_text_even_though_the_array_already_has_korean(clinic):
    plan = clinic_edit.plan_clinic_edit("pytest-content-dental", {"languages": {"add": ["tiếng hàn"]}}, "vi")
    assert set(plan.changes) == {"description", "about_highlight", "language_note"}  # not "nothing to change"
    assert "languages" not in plan.changes
    assert any("about_highlight" in line and "English, Spanish and Korean" in line or "Spanish and Korean" in line for line in plan.lines)
    assert any("bản dịch" in line.lower() for line in plan.lines)  # the VI/KO/ZH texts are NOT regenerated, and we say so

    message = clinic_edit.apply_clinic_edit(plan, "telegram:111", "vi")
    row = _row()
    for text in (row["description"], row["metadata"]["about_highlight"], row["metadata"]["language_note"]):
        assert "verified spoken languages are English, Spanish and Korean." in text
    assert "Contact the office." in row["description"] and "Bilingual team members" in row["metadata"]["language_note"]
    assert "Đã cập nhật" in message


def test_undo_brings_the_old_text_back(clinic):
    plan = clinic_edit.plan_clinic_edit("pytest-content-dental", {"languages": {"add": ["Korean"]}})
    clinic_edit.apply_clinic_edit(plan, "telegram:111")
    clinic_edit.undo_clinic_edit("pytest-content-dental", "telegram:111")
    row = _row()
    assert SENTENCE in row["description"] and SENTENCE in row["metadata"]["about_highlight"]


def test_when_everything_already_matches_the_user_is_told_in_vietnamese(clinic):
    clinic_edit.apply_clinic_edit(clinic_edit.plan_clinic_edit("pytest-content-dental", {"languages": {"add": ["Korean"]}}), "telegram:111")
    with pytest.raises(clinic_edit.ClinicEditError) as info:
        clinic_edit.plan_clinic_edit("pytest-content-dental", {"languages": {"add": ["Korean"]}}, "vi")
    assert "Không có gì để đổi" in info.value.text("vi") and "Nothing to change" in str(info.value)


def test_text_the_user_rewrites_is_not_overwritten_by_the_sync(clinic):
    plan = clinic_edit.plan_clinic_edit(
        "pytest-content-dental", {"languages": {"add": ["Korean"]}, "language_note": "Hàn, Anh và Tây Ban Nha đều được hỗ trợ."})
    assert plan.changes["language_note"] == "Hàn, Anh và Tây Ban Nha đều được hỗ trợ."
    assert "about_highlight" in plan.changes and "description" in plan.changes


def test_about_text_can_be_edited_directly(clinic):
    plan = clinic_edit.plan_clinic_edit("pytest-content-dental", {"about_highlight": "Phòng khám nha khoa có bác sĩ nói tiếng Hàn."})
    clinic_edit.apply_clinic_edit(plan, "telegram:111")
    assert _row()["metadata"]["about_highlight"] == "Phòng khám nha khoa có bác sĩ nói tiếng Hàn."


def test_changing_a_phone_does_not_touch_the_language_texts(clinic):
    plan = clinic_edit.plan_clinic_edit("pytest-content-dental", {"phone": "9725550000"})
    assert set(plan.changes) == {"phone"}


def test_the_bot_answers_a_no_op_in_vietnamese_and_keeps_the_clinic_in_focus(clinic, tmp_path, monkeypatch):
    clinic_edit.apply_clinic_edit(clinic_edit.plan_clinic_edit("pytest-content-dental", {"languages": {"add": ["Korean"]}}), "telegram:111")
    bot = _bot(tmp_path, monkeypatch)
    monkeypatch.setattr(telegram_bot, "run_agent", lambda *a, **k: intent_agent.IntentResult(
        action="update_clinic", lang="vi", requires_approval=True,
        parameters={"target": "pytest-content-dental", "changes": {"languages": {"add": ["Korean"]}}}))
    bot.handle_chat(1, "chỉnh lại language support của clinics này", user_id=111)
    assert "Không có gì để đổi" in bot.sent[-1] and "Nothing to change" not in bot.sent[-1]
    assert bot.chat_focus[1] == {"clinic": "pytest-content-dental"}


# --------------------------------------------------------------------------- screenshots and chat tidiness

def _bot(tmp_path, monkeypatch):
    monkeypatch.setattr(telegram_bot, "MEMORY_PATH", str(tmp_path / "memory.json"))
    monkeypatch.setattr(telegram_bot.TelegramBot, "start_anomaly_checker", lambda self: None)
    monkeypatch.setenv("TELEGRAM_ALLOWED_USER_IDS", "111")
    b = telegram_bot.TelegramBot()
    b.sent, b.buttons, b.web_jobs = [], [], []
    b.send_message = lambda chat_id, text, buttons=None: (b.sent.append(text), b.buttons.append(buttons))
    b.send_typing = lambda chat_id: None
    b.download_telegram_photo = lambda photos: "/tmp/shot.png"
    b.start_web_pr_job = lambda chat_id, instruction, kind="web_edit", image_path=None: b.web_jobs.append((instruction, image_path))
    return b


def test_a_screenshot_with_a_normal_caption_goes_to_the_ai_not_to_the_code_agent(tmp_path, monkeypatch):
    bot = _bot(tmp_path, monkeypatch)
    seen = {}
    monkeypatch.setattr(telegram_bot, "run_agent", lambda text, **k: seen.update(text=text) or intent_agent.IntentResult(
        action="chat", is_direct_chat=True, requires_approval=False, direct_reply="Clinic nào vậy?"))
    bot.handle_photo_message(1, 111, "chỉnh lại language support ở đây - phải có tiếng hàn", [{"file_id": "x"}])
    assert bot.web_jobs == []  # the code agent was NOT started
    assert "chỉnh lại language support" in seen["text"] and "screenshot" in seen["text"]
    assert bot.sent[-1] == "Clinic nào vậy?"


def test_an_explicit_web_edit_caption_still_goes_to_the_code_agent_with_the_image(tmp_path, monkeypatch):
    bot = _bot(tmp_path, monkeypatch)
    bot.handle_photo_message(1, 111, "/web_edit đổi màu nút này", [{"file_id": "x"}])
    assert bot.web_jobs == [("đổi màu nút này", "/tmp/shot.png")]


def test_a_design_request_with_a_screenshot_keeps_the_image_for_the_pull_request(tmp_path, monkeypatch):
    bot = _bot(tmp_path, monkeypatch)
    monkeypatch.setattr(telegram_bot, "run_agent", lambda text, **k: intent_agent.IntentResult(
        action="web_edit", lang="vi", parameters={"instruction": "đổi màu nút", "name": "web_edit: đổi màu nút"}, requires_approval=True))
    bot.handle_photo_message(1, 111, "đổi màu nút này sang xanh", [{"file_id": "x"}])
    assert bot.pending_actions[1]["image_path"] == "/tmp/shot.png"


def test_an_old_screenshot_is_not_attached_to_a_later_request(tmp_path, monkeypatch):
    bot = _bot(tmp_path, monkeypatch)
    bot.chat_images[1] = ("/tmp/old.png", time.time() - 3600)
    monkeypatch.setattr(telegram_bot, "run_agent", lambda text, **k: intent_agent.IntentResult(
        action="web_edit", lang="vi", parameters={"instruction": "x", "name": "web_edit: x"}, requires_approval=True))
    bot.handle_chat(1, "đổi màu nút", user_id=111)
    assert "image_path" not in bot.pending_actions[1]


def test_a_screenshot_without_a_caption_asks_what_to_change(tmp_path, monkeypatch):
    bot = _bot(tmp_path, monkeypatch)
    bot.chat_lang[1] = "vi"
    bot.handle_photo_message(1, 111, "", [{"file_id": "x"}])
    assert "lời nhắn" in bot.sent[-1] and bot.web_jobs == []


def test_job_bookkeeping_lines_are_hidden_from_the_chat():
    raw = "[*] Starting job: web_edit\n[*] Started at: 2026-11-19T21:12:13\nThe agent made no file changes.\n[*] Finished job: web_edit"
    assert telegram_bot.TelegramBot.tidy_job_output(raw) == "The agent made no file changes."
    assert telegram_bot.TelegramBot.tidy_job_output("[*] Starting job: x") == "[*] Starting job: x"  # never returns nothing


def test_the_agent_is_told_that_clinic_content_is_data_not_code():
    import agent_tools
    import tool_agent

    assert "update_clinic" in tool_agent.AGENT_SYSTEM and "DATA" in tool_agent.AGENT_SYSTEM
    assert "NOT for the content of one clinic" in agent_tools.BY_NAME["web_edit"].description
    changes = agent_tools.BY_NAME["update_clinic"].parameters["properties"]["changes"]["properties"]
    assert {"about_highlight", "language_note", "description", "languages"} <= set(changes)

"""
Behaviour tests for job error reporting and the Telegram bot's job runner / access control.
No network, no database, no Telegram: the bot's `request`/`send_message` are replaced by fakes.
"""

import os
import sys
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-token")

import jobs  # noqa: E402
import telegram_bot  # noqa: E402


# --------------------------------------------------------------------------- jobs

def test_successful_job_returns_its_output():
    out = jobs._run_with_captured_output("ok_job", lambda: print("hello from job"))
    assert "hello from job" in out
    assert "Finished job: ok_job" in out


def test_job_error_raises_JobFailed_with_the_traceback():
    def boom():
        raise ValueError("database exploded")

    with pytest.raises(jobs.JobFailed) as info:
        jobs._run_with_captured_output("bad_job", boom)
    assert "database exploded" in info.value.output
    assert "database exploded" in info.value.short()
    assert isinstance(info.value.cause, ValueError)


def test_sys_exit_inside_a_job_is_reported_not_swallowed():
    """A bare sys.exit() used to kill the bot's job thread without any message."""
    def quits():
        raise SystemExit(1)

    with pytest.raises(jobs.JobFailed):
        jobs._run_with_captured_output("exit_job", quits)


def test_short_keeps_only_the_tail_of_a_long_output():
    err = jobs.JobFailed("x", "\n".join(f"line {i}" for i in range(500)))
    short = err.short(max_lines=3)
    assert short.splitlines() == ["line 497", "line 498", "line 499"]


# --------------------------------------------------------------------------- bot

@pytest.fixture()
def bot(tmp_path, monkeypatch):
    monkeypatch.setattr(telegram_bot, "MEMORY_PATH", str(tmp_path / "memory.json"))
    monkeypatch.setattr(telegram_bot.TelegramBot, "start_anomaly_checker", lambda self: None)
    monkeypatch.setenv("TELEGRAM_ALLOWED_USER_IDS", "111,222")
    b = telegram_bot.TelegramBot()
    b.sent = []
    b.send_message = lambda chat_id, text: b.sent.append(text)
    b.send_long_message = lambda chat_id, text, max_chunks=None: b.sent.append(text)
    return b


def _wait_for(bot, predicate, timeout=3.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate(bot.sent):
            return True
        time.sleep(0.02)
    return False


def test_empty_allow_list_denies_everyone(tmp_path, monkeypatch):
    monkeypatch.setattr(telegram_bot, "MEMORY_PATH", str(tmp_path / "m.json"))
    monkeypatch.setattr(telegram_bot.TelegramBot, "start_anomaly_checker", lambda self: None)
    monkeypatch.setenv("TELEGRAM_ALLOWED_USER_IDS", "")
    b = telegram_bot.TelegramBot()
    assert b.is_allowed(111) is False
    assert b.is_allowed(0) is False


def test_allow_list_only_lets_listed_users_in(bot):
    assert bot.is_allowed(111) is True
    assert bot.is_allowed(222) is True
    assert bot.is_allowed(333) is False


def test_failed_job_tells_the_user(bot):
    def failing():
        def inner():
            raise RuntimeError("scraper timed out")

        return jobs._run_with_captured_output("scrape", inner)

    bot.run_job(1, "scrape_clinic", failing)
    assert _wait_for(bot, lambda s: any("❌" in m and "scrape_clinic" in m for m in s))
    failure = next(m for m in bot.sent if "❌" in m)
    assert "scraper timed out" in failure


def test_crashing_job_also_tells_the_user(bot):
    def crash():
        raise KeyError("missing")

    bot.run_job(1, "weird_job", crash)
    assert _wait_for(bot, lambda s: any("crashed" in m for m in s))


def test_successful_job_reports_output_not_failure(bot):
    bot.run_job(1, "good_job", lambda: "all done")
    assert _wait_for(bot, lambda s: any("all done" in m for m in s))
    assert not any("❌" in m for m in bot.sent)


def test_running_job_is_removed_when_it_finishes_or_fails(bot):
    bot.run_job(1, "j1", lambda: "x")
    assert _wait_for(bot, lambda s: any("x" == m for m in s))
    time.sleep(0.1)
    assert "j1" not in bot.running_jobs


def test_url_batch_continues_after_one_url_fails(bot):
    def fn(url):
        if "bad" in url:
            raise jobs.JobFailed("one", "Traceback\nValueError: nope")
        return f"ok {url}"

    out = bot.run_url_batch(["https://a", "https://bad", "https://c"], fn)
    assert "ok https://a" in out and "ok https://c" in out
    assert "FAILED" in out and "nope" in out


def test_help_command_still_works(bot):
    bot.handle_command(1, "/help")
    assert bot.sent and "OpenClaw" in bot.sent[0]


def test_no_supabase_wording_in_user_facing_help(bot):
    assert "supabase" not in bot.help_text().lower()


# --------------------------------------------------------------------------- google_places

def test_google_places_request_failure_is_graceful_and_does_not_log_the_api_key(monkeypatch, capsys):
    """Regression: the error handler referenced an undefined name (NameError) and could print the key."""
    import google_places

    def failing_urlopen(*args, **kwargs):
        raise OSError("network down")

    monkeypatch.setattr(google_places, "urlopen", failing_urlopen)
    result = google_places.request_json("https://places.googleapis.com/v1/x/media?key=SECRET123&maxWidthPx=1", "SECRET123")
    assert result == {}
    printed = capsys.readouterr().out
    assert "network down" in printed
    assert "SECRET123" not in printed


# --------------------------------------------------------------------------- review commands

def test_drafts_command_lists_clinics_waiting_for_review(bot, monkeypatch):
    monkeypatch.setattr(telegram_bot, "list_draft_clinics_job", lambda limit=20: f"3 drafts (limit {limit})")
    bot.handle_command(1, "/drafts 5")
    assert _wait_for(bot, lambda s: any("3 drafts (limit 5)" in m for m in s))


def test_approve_clinic_runs_the_approve_job_for_that_target(bot, monkeypatch):
    seen = []
    monkeypatch.setattr(telegram_bot, "approve_clinic_job", lambda target: seen.append(target) or "published it")
    bot.handle_command(1, "/approve_clinic anchor-dental")
    assert _wait_for(bot, lambda s: any("published it" in m for m in s))
    assert seen == ["anchor-dental"]


def test_reject_clinic_runs_the_reject_job(bot, monkeypatch):
    seen = []
    monkeypatch.setattr(telegram_bot, "reject_clinic_job", lambda target: seen.append(target) or "archived it")
    bot.handle_command(1, "/reject_clinic bad-clinic")
    assert _wait_for(bot, lambda s: any("archived it" in m for m in s))
    assert seen == ["bad-clinic"]


def test_approve_clinic_without_a_target_shows_usage(bot):
    bot.handle_command(1, "/approve_clinic")
    assert any("Use: /approve_clinic" in m for m in bot.sent)


def test_approve_all_asks_for_confirmation_and_does_not_publish_yet(bot, monkeypatch):
    called = []
    monkeypatch.setattr(telegram_bot, "approve_all_draft_clinics_job", lambda: called.append(1) or "done")
    monkeypatch.setattr("admin_actions.count_draft_clinics", lambda: 7)

    bot.handle_command(1, "/approve_clinic all")

    assert bot.pending_actions[1]["type"] == "approve_all_draft_clinics"
    assert "7 draft clinic" in bot.sent[-1] and "approve" in bot.sent[-1].lower()
    assert called == []  # nothing published before the user confirms

    bot.run_pending_action(1, bot.pending_actions.pop(1))
    assert _wait_for(bot, lambda s: any("done" == m for m in s))
    assert called == [1]


def test_approve_all_confirmation_survives_a_failing_count(bot, monkeypatch):
    def broken():
        raise RuntimeError("db down")

    monkeypatch.setattr("admin_actions.count_draft_clinics", broken)
    bot.handle_command(1, "/approve_clinic all")
    assert bot.pending_actions[1]["type"] == "approve_all_draft_clinics"


def test_natural_language_list_drafts_runs_immediately(bot, monkeypatch):
    import intent_agent

    monkeypatch.setattr(telegram_bot, "list_draft_clinics_job", lambda limit=20: "drafts from chat")
    monkeypatch.setattr(
        telegram_bot,
        "run_intent_agent",
        lambda *a, **k: intent_agent.IntentResult(action="list_drafts", requires_approval=False, parameters={"limit": 3}),
    )
    bot.handle_chat(1, "clinic nào đang chờ duyệt?")
    assert _wait_for(bot, lambda s: any("drafts from chat" in m for m in s))
    assert 1 not in bot.pending_actions


def test_help_lists_the_review_commands(bot):
    text = bot.help_text()
    for cmd in ("/drafts", "/approve_clinic", "/reject_clinic"):
        assert cmd in text

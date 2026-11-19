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
    b.buttons = []
    b.send_message = lambda chat_id, text, buttons=None: (b.sent.append(text), b.buttons.append(buttons))
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
        "run_agent",
        lambda *a, **k: intent_agent.IntentResult(action="list_drafts", requires_approval=False, parameters={"limit": 3}),
    )
    bot.handle_chat(1, "clinic nào đang chờ duyệt?")
    assert _wait_for(bot, lambda s: any("drafts from chat" in m for m in s))
    assert 1 not in bot.pending_actions


def test_help_lists_the_review_commands(bot):
    text = bot.help_text()
    for cmd in ("/drafts", "/approve_clinic", "/reject_clinic"):
        assert cmd in text


# --------------------------------------------------------------------------- user management commands

@pytest.fixture()
def admin_bot(bot, monkeypatch):
    """A bot whose Telegram id 111 may manage users (222 is only allowed to use the bot)."""
    bot.user_admin_ids = {111}
    calls = []
    for name in ("list_users_job", "show_user_job", "restore_user_job", "create_user_invite_job",
                 "set_user_role_job", "disable_user_job", "purge_disabled_users_job"):
        monkeypatch.setattr(telegram_bot, name, (lambda n: lambda *a, **k: calls.append((n, a)) or f"{n} done")(name))
    import user_admin

    monkeypatch.setattr(user_admin, "user_brief", lambda email: {"role": "provider", "email": email} if "ghost" not in email else None)
    monkeypatch.setattr(user_admin, "purgeable_count", lambda: 3)
    bot.calls = calls
    return bot


def test_user_management_is_off_until_superadmin_ids_are_configured(bot):
    assert bot.user_admin_ids == set()
    bot.handle_command(111, "/users", user_id=111)
    assert "TELEGRAM_SUPERADMIN_IDS" in bot.sent[-1]


def test_only_listed_superadmins_may_manage_users(admin_bot):
    admin_bot.handle_command(222, "/user_add a@example.com", user_id=222)
    assert "not allowed to manage users" in admin_bot.sent[-1]
    assert 222 not in admin_bot.pending_actions and admin_bot.calls == []


def test_user_management_requires_a_private_chat(admin_bot):
    admin_bot.handle_command(-1001, "/users", user_id=111)  # a group chat
    assert "private chat" in admin_bot.sent[-1] and admin_bot.calls == []


def test_users_and_user_are_read_only_and_run_immediately(admin_bot):
    admin_bot.handle_command(111, "/users ann", user_id=111)
    admin_bot.handle_command(111, "/user Ann@Example.com", user_id=111)
    assert _wait_for(admin_bot, lambda s: len(s) >= 4)
    assert admin_bot.calls == [("list_users_job", ("ann", 20)), ("show_user_job", ("ann@example.com",))]
    assert 111 not in admin_bot.pending_actions


def test_user_add_needs_approval_then_runs_with_the_actor(admin_bot):
    admin_bot.handle_command(111, "/user_add New@Example.com", user_id=111)
    pending = admin_bot.pending_actions[111]
    assert pending["type"] == "user_add" and pending["email"] == "new@example.com" and pending["role"] == "provider"
    assert "INVITE new@example.com as 'provider'" in admin_bot.sent[-1] and "approve" in admin_bot.sent[-1]
    assert admin_bot.calls == []  # nothing happens before approval

    admin_bot.run_pending_action(111, admin_bot.pending_actions.pop(111))
    assert _wait_for(admin_bot, lambda s: any("create_user_invite_job done" in m for m in s))
    assert admin_bot.calls == [("create_user_invite_job", ("new@example.com", "provider", "telegram:111"))]


def test_user_add_validates_email_and_role_before_asking(admin_bot):
    admin_bot.handle_command(111, "/user_add not-an-email", user_id=111)
    assert "not a valid e-mail" in admin_bot.sent[-1]
    admin_bot.handle_command(111, "/user_add a@example.com owner", user_id=111)
    assert "Invalid role" in admin_bot.sent[-1]
    admin_bot.handle_command(111, "/user_add", user_id=111)
    assert admin_bot.sent[-1].startswith("Use: /user_add")
    assert 111 not in admin_bot.pending_actions


def test_granting_superadmin_shows_a_warning(admin_bot):
    admin_bot.handle_command(111, "/user_add a@example.com superadmin", user_id=111)
    assert "⚠️" in admin_bot.sent[-1]


def test_user_role_shows_current_and_new_role_and_waits_for_approval(admin_bot):
    admin_bot.handle_command(111, "/user_role a@example.com admin", user_id=111)
    assert "provider -> admin" in admin_bot.sent[-1] and admin_bot.calls == []
    admin_bot.run_pending_action(111, admin_bot.pending_actions.pop(111))
    assert _wait_for(admin_bot, lambda s: any("set_user_role_job done" in m for m in s))
    assert admin_bot.calls == [("set_user_role_job", ("a@example.com", "admin", "telegram:111"))]


def test_user_role_unknown_user_or_bad_role_creates_nothing(admin_bot):
    admin_bot.handle_command(111, "/user_role ghost@example.com admin", user_id=111)
    assert "No user with e-mail ghost@example.com" in admin_bot.sent[-1]
    admin_bot.handle_command(111, "/user_role a@example.com root", user_id=111)
    assert admin_bot.sent[-1].startswith("Use: /user_role")
    assert 111 not in admin_bot.pending_actions


def test_user_disable_waits_for_approval_and_mentions_the_30_day_restore(admin_bot):
    admin_bot.handle_command(111, "/user_disable a@example.com", user_id=111)
    assert "30 days" in admin_bot.sent[-1] and admin_bot.calls == []
    admin_bot.run_pending_action(111, admin_bot.pending_actions.pop(111))
    assert _wait_for(admin_bot, lambda s: any("disable_user_job done" in m for m in s))
    assert admin_bot.calls == [("disable_user_job", ("a@example.com", "telegram:111"))]


def test_user_restore_is_immediate(admin_bot):
    admin_bot.handle_command(111, "/user_restore a@example.com", user_id=111)
    assert _wait_for(admin_bot, lambda s: any("restore_user_job done" in m for m in s))
    assert admin_bot.calls == [("restore_user_job", ("a@example.com", "telegram:111"))]


def test_users_purge_shows_the_count_and_waits_for_approval(admin_bot):
    admin_bot.handle_command(111, "/users_purge", user_id=111)
    assert "PERMANENTLY DELETE 3 user(s)" in admin_bot.sent[-1] and admin_bot.calls == []
    admin_bot.run_pending_action(111, admin_bot.pending_actions.pop(111))
    assert _wait_for(admin_bot, lambda s: any("purge_disabled_users_job done" in m for m in s))


def test_users_purge_with_nothing_to_purge_asks_nothing(admin_bot, monkeypatch):
    import user_admin

    monkeypatch.setattr(user_admin, "purgeable_count", lambda: 0)
    admin_bot.handle_command(111, "/users_purge", user_id=111)
    assert "Nothing to purge" in admin_bot.sent[-1] and 111 not in admin_bot.pending_actions


def test_an_expired_user_request_is_not_executed(admin_bot, monkeypatch):
    import intent_agent

    admin_bot.handle_command(111, "/user_disable a@example.com", user_id=111)
    admin_bot.pending_actions[111]["expires_at"] = time.time() - 1
    monkeypatch.setattr(
        telegram_bot, "run_agent",
        lambda *a, **k: intent_agent.IntentResult(action="user_disable", is_approval=True, requires_approval=False),
    )
    admin_bot.handle_chat(111, "approve")
    assert "expired" in admin_bot.sent[-1] and admin_bot.calls == []
    assert 111 not in admin_bot.pending_actions  # a stale request cannot be approved later either


def test_permission_is_rechecked_when_the_approval_arrives(admin_bot):
    admin_bot.handle_command(111, "/user_disable a@example.com", user_id=111)
    action = admin_bot.pending_actions.pop(111)
    admin_bot.user_admin_ids = set()  # access removed in the meantime
    admin_bot.run_pending_action(111, action)
    assert "not allowed to manage users" in admin_bot.sent[-1] and admin_bot.calls == []


def test_an_action_created_by_someone_else_is_refused(admin_bot):
    admin_bot.user_admin_ids = {111, 222}
    admin_bot.handle_command(111, "/user_disable a@example.com", user_id=111)
    action = admin_bot.pending_actions.pop(111)
    admin_bot.run_pending_action(222, action)  # a different person approves
    assert "not allowed" in admin_bot.sent[-1] and admin_bot.calls == []


def test_invite_tokens_are_redacted_from_chat_memory_and_logs(bot):
    link = "https://hub.example.org/auth/accept-invite?token=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-"
    bot.remember_job_output(1, "user_add", f"[+] Invite created\n{link}")
    assert "AbCdEf" not in bot.chat_memory[1]["text"] and "token=<redacted>" in bot.chat_memory[1]["text"]
    assert "AbCdEf" not in jobs.redact_secrets(link)


def test_help_lists_the_user_commands(bot):
    text = bot.help_text()
    for cmd in ("/users", "/user_add", "/user_role", "/user_disable", "/user_restore", "/users_purge"):
        assert cmd in text


# --------------------------------------------------------------------------- website edits as Pull Requests

@pytest.fixture()
def web_bot(admin_bot, monkeypatch, tmp_path):
    """Bot where 111 may merge; the PR-related jobs are scripted so nothing touches git or GitHub."""
    shot = tmp_path / "preview.png"
    shot.write_bytes(b"png")
    admin_bot.photos = []
    admin_bot.send_photo = lambda chat_id, path, caption="": admin_bot.photos.append((path, caption))
    admin_bot.merged = []

    def web_edit_job(instruction, image_path=None, progress_callback=None, result_sink=None):
        admin_bot.edit_args = (instruction, image_path)
        if result_sink is not None and not getattr(admin_bot, "edit_fails", False):
            result_sink.update({"ok": True, "pr_number": 7, "pr_url": "https://github.test/pull/7",
                                "title": "Web edit: bigger hero", "screenshots": [str(shot)]})
        return "edit summary"

    monkeypatch.setattr(telegram_bot, "web_edit_job", web_edit_job)
    def seo_setup_job(instruction, progress_callback=None, result_sink=None):
        admin_bot.seo_args = instruction
        if result_sink is not None:
            result_sink.update({"pr_number": 8, "pr_url": "https://github.test/pull/8", "title": "SEO", "screenshots": []})
        return "seo summary"

    monkeypatch.setattr(telegram_bot, "seo_setup_job", seo_setup_job)
    monkeypatch.setattr(telegram_bot, "web_merge_job", lambda number: admin_bot.merged.append(number) or "merged it")
    monkeypatch.setattr(telegram_bot, "web_close_job", lambda number: f"closed {number}")
    monkeypatch.setattr(telegram_bot, "web_prs_job", lambda: "2 open PRs")
    return admin_bot


def test_web_edit_sends_previews_and_asks_before_merging(web_bot):
    web_bot.handle_command(111, "/web_edit Make the hero bigger", user_id=111)
    assert _wait_for(web_bot, lambda s: any("Merge Pull Request #7" in m for m in s))
    assert web_bot.edit_args == ("Make the hero bigger", None)
    assert [c for _, c in web_bot.photos] == ["Preview of Pull Request #7"]
    pending = web_bot.pending_actions[111]
    assert pending["type"] == "web_pr_merge" and pending["pr_number"] == 7 and pending["actor_id"] == 111
    assert 1500 < pending["expires_at"] - time.time() <= 1800
    summary = web_bot.sent[-1]
    assert "https://github.test/pull/7" in summary and "approve" in summary and "mode is 'manual'" in summary
    assert web_bot.merged == []  # nothing merged before the approval


def test_approving_merges_the_pull_request(web_bot, monkeypatch):
    import intent_agent

    web_bot.handle_command(111, "/web_edit bigger hero", user_id=111)
    assert _wait_for(web_bot, lambda s: any("Merge Pull Request" in m for m in s))
    monkeypatch.setattr(telegram_bot, "run_agent",
                        lambda *a, **k: intent_agent.IntentResult(action="web_pr_merge", is_approval=True, requires_approval=False))
    web_bot.handle_chat(111, "approve")
    assert _wait_for(web_bot, lambda s: any("merged it" in m for m in s))
    assert web_bot.merged == [7]


def test_someone_who_cannot_merge_gets_the_github_link_instead(web_bot):
    web_bot.handle_command(222, "/web_edit bigger hero", user_id=222)   # allowed to use the bot, not a superadmin
    assert _wait_for(web_bot, lambda s: any("merge it on GitHub" in m for m in s))
    assert 222 not in web_bot.pending_actions and any("TELEGRAM_SUPERADMIN_IDS" in m for m in web_bot.sent)


def test_a_failed_edit_offers_no_merge(web_bot):
    web_bot.edit_fails = True
    web_bot.handle_command(111, "/web_edit bigger hero", user_id=111)
    assert _wait_for(web_bot, lambda s: any("edit summary" in m for m in s))
    time.sleep(0.1)
    assert 111 not in web_bot.pending_actions and web_bot.photos == []


def test_a_screenshot_with_instructions_goes_through_the_same_flow(web_bot):
    web_bot.start_web_pr_job(111, "match this design", kind="web_edit", image_path="/tmp/shot.jpg")
    assert _wait_for(web_bot, lambda s: any("Merge Pull Request #7" in m for m in s))
    assert web_bot.edit_args == ("match this design", "/tmp/shot.jpg")


def test_seo_setup_also_opens_a_pull_request(web_bot):
    web_bot.handle_command(111, "/seo_setup add JSON-LD", user_id=111)
    assert _wait_for(web_bot, lambda s: any("Merge Pull Request #8" in m for m in s))
    assert web_bot.pending_actions[111]["pr_number"] == 8 and web_bot.seo_args == "add JSON-LD"


def test_web_prs_is_read_only_and_open_to_every_allowed_user(web_bot):
    web_bot.handle_command(222, "/web_prs", user_id=222)
    assert _wait_for(web_bot, lambda s: any("2 open PRs" in m for m in s))


def test_web_merge_command_shows_the_diff_size_and_waits(web_bot, monkeypatch):
    import web_pr

    monkeypatch.setattr(web_pr, "get_web_pr", lambda n: {"number": n, "title": "Web edit: logo", "state": "open", "merged": False,
                                                         "html_url": "https://github.test/pull/9", "changed_files": 3, "additions": 40, "deletions": 5})
    web_bot.handle_command(111, "/web_merge 9", user_id=111)
    assert "Merge Pull Request #9" in web_bot.sent[-1] and "3 file(s), +40 -5" in web_bot.sent[-1]
    assert web_bot.merged == []
    web_bot.run_pending_action(111, web_bot.pending_actions.pop(111))
    assert _wait_for(web_bot, lambda s: any("merged it" in m for m in s))
    assert web_bot.merged == [9]


def test_web_merge_validates_the_number_and_the_state(web_bot, monkeypatch):
    import github_api
    import web_pr

    web_bot.handle_command(111, "/web_merge", user_id=111)
    assert web_bot.sent[-1].startswith("Use: /web_merge")
    web_bot.handle_command(111, "/web_merge abc", user_id=111)
    assert web_bot.sent[-1].startswith("Use: /web_merge")
    monkeypatch.setattr(web_pr, "get_web_pr", lambda n: {"number": n, "state": "closed", "merged": True})
    web_bot.handle_command(111, "/web_merge 3", user_id=111)
    assert "not open" in web_bot.sent[-1]

    def refuse(n):
        raise web_pr.WebPrError("Pull Request #4 was not created by the website-edit flow")

    monkeypatch.setattr(web_pr, "get_web_pr", refuse)
    web_bot.handle_command(111, "/web_merge 4", user_id=111)
    assert "not created by the website-edit flow" in web_bot.sent[-1]
    assert 111 not in web_bot.pending_actions and web_bot.merged == []


def test_merging_closing_and_reverting_need_a_superadmin_in_a_private_chat(web_bot):
    for command in ("/web_merge 7", "/web_close 7", "/web_revert 7"):
        web_bot.handle_command(222, command, user_id=222)
        assert "not allowed" in web_bot.sent[-1], command
        web_bot.handle_command(-1001, command, user_id=111)
        assert "private chat" in web_bot.sent[-1], command
    web_bot.user_admin_ids = set()
    web_bot.handle_command(111, "/web_merge 7", user_id=111)
    assert "TELEGRAM_SUPERADMIN_IDS" in web_bot.sent[-1]
    assert web_bot.merged == [] and not web_bot.pending_actions


def test_an_expired_or_foreign_merge_approval_is_not_executed(web_bot, monkeypatch):
    import intent_agent

    web_bot.handle_command(111, "/web_edit bigger hero", user_id=111)
    assert _wait_for(web_bot, lambda s: any("Merge Pull Request" in m for m in s))
    web_bot.pending_actions[111]["expires_at"] = time.time() - 1
    monkeypatch.setattr(telegram_bot, "run_agent",
                        lambda *a, **k: intent_agent.IntentResult(action="web_pr_merge", is_approval=True, requires_approval=False))
    web_bot.handle_chat(111, "approve")
    assert "expired" in web_bot.sent[-1] and web_bot.merged == []

    action = web_bot._web_merge_action(111, 7, "t", "u")
    web_bot.user_admin_ids = {111, 222}
    web_bot.run_pending_action(222, action)           # created by 111, approved by 222
    assert "not allowed" in web_bot.sent[-1] and web_bot.merged == []


def test_web_close_is_immediate_and_web_revert_opens_a_pr_to_approve(web_bot, monkeypatch):
    web_bot.handle_command(111, "/web_close 7", user_id=111)
    assert _wait_for(web_bot, lambda s: any("closed 7" in m for m in s))

    def revert_job(number, progress_callback=None, result_sink=None):
        result_sink.update({"pr_number": 11, "pr_url": "https://github.test/pull/11", "title": f"Revert: PR {number}", "screenshots": []})
        return "revert summary"

    monkeypatch.setattr(telegram_bot, "web_revert_job", revert_job)
    web_bot.handle_command(111, "/web_revert 7", user_id=111)
    assert _wait_for(web_bot, lambda s: any("Merge Pull Request #11" in m for m in s))
    assert web_bot.pending_actions[111]["pr_number"] == 11


def test_the_old_direct_publish_commands_only_explain_the_new_flow(web_bot, monkeypatch):
    assert not hasattr(telegram_bot, "publish_code_job") and not hasattr(telegram_bot, "rollback_code_job")
    for command in ("/publish fix", "/rollback", "/dev_diff", "/git_status"):
        web_bot.handle_command(111, command, user_id=111)
        assert "removed on purpose" in web_bot.sent[-1] and "/web_edit" in web_bot.sent[-1]
    for action_type in ("publish_code", "rollback_code"):   # the same via natural language
        web_bot.run_pending_action(111, {"type": action_type, "name": action_type})
        assert "removed on purpose" in web_bot.sent[-1]
    assert web_bot.merged == []


def test_help_lists_the_pull_request_commands_and_no_direct_publish(bot):
    text = bot.help_text()
    for cmd in ("/web_edit", "/web_prs", "/web_merge", "/web_close", "/web_revert"):
        assert cmd in text
    assert "/publish" not in text and "/rollback" not in text


# --------------------------------------------------------------------------- the job wrappers

def test_web_jobs_print_clear_messages_instead_of_tracebacks(monkeypatch):
    import deploy
    import github_api
    import web_pr

    monkeypatch.setattr(web_pr, "list_web_prs", lambda: [{"number": 3, "title": "Web edit: a", "html_url": "u", "changed_files": 2, "additions": 4, "deletions": 1}])
    out = jobs.web_prs_job()
    assert "#3 Web edit: a" in out and "/web_merge <number>" in out

    monkeypatch.setattr(web_pr, "list_web_prs", lambda: [])
    assert "No website Pull Requests" in jobs.web_prs_job()

    monkeypatch.setattr(web_pr, "merge_web_pr", lambda n: {"merged": True, "title": "Web edit: a", "sha": "abc", "url": "u"})
    monkeypatch.setattr(deploy, "deploy_after_merge", lambda: "DEPLOY-STATUS")
    out = jobs.web_merge_job(3)
    assert "Merged Pull Request #3" in out and "DEPLOY-STATUS" in out and "/web_revert 3" in out

    def refuse(n):
        raise web_pr.WebPrError("Pull Request #3 has conflicts with main.")

    monkeypatch.setattr(web_pr, "merge_web_pr", refuse)
    out = jobs.web_merge_job(3)           # a refusal is a message, not a failed job
    assert "❌ Pull Request #3 has conflicts" in out and "Traceback" not in out

    monkeypatch.setattr(web_pr, "close_web_pr", lambda n: (_ for _ in ()).throw(github_api.GitHubError(404, "GitHub says no")))
    assert "❌ GitHub says no" in jobs.web_close_job(3)

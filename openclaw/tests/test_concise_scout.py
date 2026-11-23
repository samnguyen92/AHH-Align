"""
Ranked scout results, one live progress message, a card per clinic with Approve/Reject, and one language from start to end.

Regression (screenshots): the answer to "scrape 5 Vietnamese/Chinese/Korean clinics in Virginia" was dozens of messages
mixing Vietnamese progress lines, English status lines, internal job names cut in the middle of a word and the raw scraper
log; nothing said which clinics were recommended or which to approve.
"""

import json
import os
import sys
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-token")

import agent_tools  # noqa: E402
import messages  # noqa: E402
import run_scout  # noqa: E402
import scout_report  # noqa: E402
import telegram_bot  # noqa: E402
from live_status import LiveStatus  # noqa: E402


# --------------------------------------------------------------------------- readable names

def test_names_are_cut_at_a_word_never_in_the_middle():
    long = "clinics in Virginia (VA) providing patient services in Vietnamese, Korean, and Chinese"
    cut = messages.shorten(long, 48)
    assert cut == "clinics in Virginia (VA) providing patient…" and len(cut) <= 49
    assert messages.shorten("short", 48) == "short"


def test_a_sentence_becomes_a_search_phrase():
    q = "clinics in Virginia (VA) providing patient services in Vietnamese, Korean, and Chinese; prioritize the highest Google quality ratings"
    short = messages.shorten_query(q)
    assert "prioritize" not in short and "ratings" not in short and len(short) <= 81


def test_the_find_clinics_tool_cleans_the_query_and_clamps_the_numbers():
    params = agent_tools.clean_params("find_clinics", {"query": "Vietnamese doctor Virginia; prioritize the best ratings", "limit": 500, "min_rating": 9, "min_reviews": "20", "extra": 1})
    assert params == {"query": "Vietnamese doctor Virginia", "limit": 200, "min_rating": 5.0, "min_reviews": 20}
    assert agent_tools.clean_params("find_clinics", {"query": "x", "min_rating": "abc"}) == {"query": "x"}


def test_the_confirmation_card_shows_the_wishes_and_no_placeholders():
    card = agent_tools.confirmation_card("find_clinics", {"query": "Vietnamese doctor Virginia", "limit": 5, "min_rating": 4.5, "min_reviews": 20}, "en")
    assert "up to 5, rating from 4.5⭐, from 20 reviews" in card and "…" not in card
    plain = agent_tools.confirmation_card("find_clinics", {"query": "Vietnamese doctor Virginia"}, "vi")
    assert "tối đa 1)" in plain and "…" not in plain and "find_clinics" not in plain


def test_action_names_are_readable_in_both_languages():
    assert messages.describe_action("find_clinics: Vietnamese doctor Virginia", "en") == "search for new clinics: Vietnamese doctor Virginia"
    assert messages.describe_action("find_clinics: Vietnamese doctor Virginia", "vi") == "tìm clinic mới: Vietnamese doctor Virginia"
    assert messages.describe_action("mystery: x", "en") == "mystery: x"


def test_every_catalogue_message_exists_in_both_languages_with_the_same_placeholders():
    import re

    for key, (vi, en) in messages.CATALOG.items():
        assert vi and en, key
        assert set(re.findall(r"\{(\w+)\}", vi)) == set(re.findall(r"\{(\w+)\}", en)), key
    assert messages.tr("scout.found", "en", n=5, new=3) == "Found 5 valid places, 3 new."
    assert messages.tr("scout.found", "vi", n=5, new=3).startswith("Tìm thấy 5")


# --------------------------------------------------------------------------- one live message

class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def live(**kw):
    sent, edits, clock = [], [], Clock()
    status = LiveStatus(lambda text: sent.append(text) or 77, lambda mid, text: edits.append((mid, text)), "⏳ Working", "✅ Done", clock=clock, **kw)
    return status, sent, edits, clock


def test_progress_is_one_message_that_edits_itself():
    status, sent, edits, clock = live()
    status.start()
    for i in range(1, 6):
        clock.now += 2
        status.update(f"step {i}")
    assert len(sent) == 1 and sent[0] == "⏳ Working"  # a single message was ever sent
    assert edits[-1] == (77, "⏳ Working\n• step 2\n• step 3\n• step 4\n• step 5")  # only the last four lines are kept


def test_fast_updates_are_coalesced_so_telegram_is_never_flooded():
    status, sent, edits, clock = live()
    status.start()
    for i in range(10):
        status.update(f"burst {i}")  # no time passes
    assert edits == []  # nothing edited yet: they are held back
    clock.now += 2
    status.update("later")
    assert len(edits) == 1 and edits[0][1].endswith("• later")


def test_finish_collapses_to_one_line_and_a_failing_edit_never_breaks_the_job():
    status, sent, edits, clock = live()
    status.start()
    clock.now += 2
    status.update("working")
    status.finish()
    assert edits[-1] == (77, "✅ Done")

    def boom(mid, text):
        raise RuntimeError("telegram down")

    broken = LiveStatus(lambda t: 1, boom, "h", clock=Clock())
    broken.start()
    broken.update("x")
    broken.finish()  # must not raise


# --------------------------------------------------------------------------- the scout: ranking, wishes, structured result

def place(name, rating, count, site=None):
    return {"id": name, "displayName": {"text": name}, "websiteUri": site or f"https://{name.lower().replace(' ', '')}.example", "types": ["doctor"],
            "rating": rating, "userRatingCount": count}


@pytest.fixture()
def scout(monkeypatch):
    seen = {"scraped": [], "saved": [], "pool": None, "messages": []}
    monkeypatch.delenv("OPENCLAW_SCOUT_WEB_FALLBACK", raising=False)
    monkeypatch.setattr(run_scout, "get_google_places_key", lambda: "k")
    monkeypatch.setattr(run_scout, "_load_existing_clinic_keys", lambda: ({"already here"}, set()))
    monkeypatch.setattr(run_scout, "scrape_content_from_url", lambda url: seen["scraped"].append(url) or {"markdown_content": "Welcome. We speak Vietnamese. Call (713) 555-0100.", "images": [], "page_title": "x"})
    monkeypatch.setattr(run_scout, "extract_clinic_data", lambda name, content: {"name": name, "languages": ["English", "Vietnamese"], "specialty": "Doctor", "city": "Fairfax", "state": "VA"})
    monkeypatch.setattr(run_scout, "merge_deterministic_contacts", lambda d, c: d)
    monkeypatch.setattr(run_scout, "enrich_clinic_with_google_places", lambda d, place_id=None, upload_photos=True: d)
    monkeypatch.setattr(run_scout, "enrich_missing_with_brave", lambda d: d)
    monkeypatch.setattr(run_scout, "enrich_clinic_with_third_party_profiles", lambda d: d)
    monkeypatch.setattr(run_scout, "attach_real_photos", lambda d, **k: d)

    def insert(data):
        data["_saved"] = {"id": "1", "slug": data["name"].lower().replace(" ", "-"), "created": True, "status": "draft"}
        seen["saved"].append(data["name"])
        return True

    monkeypatch.setattr(run_scout, "insert_clinic", insert)

    def search(query, key, limit=5, included_types=None):
        seen["pool"] = limit
        return seen["places"]

    monkeypatch.setattr(run_scout, "search_places_by_text", search)
    seen["places"] = []
    return seen


def go(seen, **kw):
    return run_scout.run_scout_pipeline("Vietnamese doctor Virginia", telegram_updater_callback=seen["messages"].append, **kw)


def test_the_best_rated_clinics_are_taken_not_the_first_ones_google_returned(scout):
    scout["places"] = [place("Low Reviews", 5.0, 2), place("Great Clinic", 4.9, 300), place("Okay Clinic", 4.2, 150), place("Good Clinic", 4.7, 120)]
    summary = go(scout, limit=2, lang="en")
    assert scout["saved"] == ["Great Clinic", "Good Clinic"]  # a 5.0 from 2 people does not beat 4.9 from 300
    assert scout["pool"] >= 8  # a pool bigger than the 2 wanted, so a ranking is possible


def test_minimum_rating_and_reviews_filter_and_say_why(scout):
    scout["places"] = [place("Great Clinic", 4.9, 300), place("Meh Clinic", 3.5, 400), place("Few Clinic", 4.8, 3), place("Already Here", 4.9, 500)]
    summary = go(scout, limit=5, lang="en", min_rating=4.5, min_reviews=20)
    assert scout["saved"] == ["Great Clinic"]
    reasons = {(i["name"], i["reason"]) for i in summary["skipped_items"]}
    assert {("Meh Clinic", "low_rating"), ("Few Clinic", "few_reviews"), ("Already Here", "exists")} <= reasons


def test_the_result_is_structured_one_card_per_saved_clinic(scout):
    scout["places"] = [place("Great Clinic", 4.9, 300)]
    summary = go(scout, limit=1, lang="en")
    card = summary["clinics"][0]
    assert card["name"] == "Great Clinic" and card["slug"] == "great-clinic" and card["created"] is True
    assert card["languages"] == ["English", "Vietnamese"] and card["quality"] is not None


def test_progress_lines_are_in_the_users_language_and_short(scout):
    scout["places"] = [place("Great Clinic", 4.9, 300)]
    go(scout, limit=1, lang="en")
    text = "\n".join(scout["messages"])
    assert "Searching Google Places" in text and "Reading the website: Great Clinic" in text
    assert not any(ord(ch) > 0x24F and ch.isalpha() for ch in text)  # no Vietnamese letters in an English run
    scout["messages"].clear()
    go(scout, limit=1, lang="vi")
    assert "Đang tìm trên Google Places" in "\n".join(scout["messages"])


def test_the_users_long_sentence_is_shortened_before_it_reaches_google(scout):
    seen = {}
    scout["places"] = []
    run_scout.search_places_by_text = lambda query, *a, **k: seen.update(query=query) or []
    go(scout, limit=1, lang="en")
    summary = run_scout.run_scout_pipeline("clinics in Virginia (VA) providing patient services in Vietnamese; prioritize the highest ratings", limit=1, lang="en")
    assert "prioritize" not in seen["query"]


# --------------------------------------------------------------------------- the final text and the cards

def test_the_summary_is_short_and_says_what_was_skipped():
    summary = {"clinics": [{"created": True}, {"created": True}], "min_rating": 4.5, "min_reviews": 20,
               "skipped_items": [{"name": "a", "reason": "exists"}, {"name": "b", "reason": "directory"}, {"name": "c", "reason": "directory"}, {"name": "d", "reason": "own_site"}]}
    text = scout_report.summary_text(summary, "en")
    assert text.splitlines()[0] == "✅ Done: saved 2 DRAFT clinic(s) waiting for you (ranked by rating). (≥4.5⭐, ≥20 reviews)"
    assert "Skipped 4: 2 a directory or ranking page · 1 already in the directory · 1 no website of its own" in text
    assert len(text.splitlines()) == 3 and "cards below" in text
    assert "Bỏ qua 4:" in scout_report.summary_text(summary, "vi")
    assert scout_report.summary_text({"error_text": "⛔ Google error", "clinics": []}, "en") == "⛔ Google error"
    assert scout_report.summary_text({"clinics": [], "skipped_items": []}, "en") == "No new clinic matched."


def test_a_card_has_what_you_need_to_decide():
    card = {"name": "Anchor Dental", "city": "Fairfax", "state": "VA", "languages": ["English", "Vietnamese", "Korean"], "languages_verified": True,
            "language_flag": False, "rating": 4.8, "rating_count": 120, "photos": 6, "quality": 82, "missing": ["working_hours"], "created": True}
    text = scout_report.card_text(card, "en")
    assert text.splitlines()[0] == "**Anchor Dental** — Fairfax, VA"
    assert "⭐ 4.8 (120) · EN, VI, KO ✅ · 6 photo(s) · score 82/100" in text and "Missing: working_hours" in text and "Draft" in text
    flagged = scout_report.card_text({**card, "language_flag": True, "languages_verified": False}, "vi")
    assert "⚠️ Website không nhắc đến ngôn ngữ bạn yêu cầu" in flagged and "✅" not in flagged.splitlines()[1]


# --------------------------------------------------------------------------- the bot

@pytest.fixture()
def bot(tmp_path, monkeypatch):
    monkeypatch.setattr(telegram_bot, "MEMORY_PATH", str(tmp_path / "m.json"))
    monkeypatch.setattr(telegram_bot.TelegramBot, "start_anomaly_checker", lambda self: None)
    monkeypatch.setenv("TELEGRAM_ALLOWED_USER_IDS", "111")
    b = telegram_bot.TelegramBot()
    b.sent, b.buttons, b.api, b.next_id = [], [], [], [100]

    def send_message(chat_id, text, buttons=None):
        b.sent.append(text)
        b.buttons.append(buttons)

    def request(method, payload=None):
        b.api.append((method, payload))
        if method == "sendMessage":
            b.next_id[0] += 1
            return {"ok": True, "result": {"message_id": b.next_id[0]}}
        return {"ok": True}

    b.send_message, b.send_long_message, b.request = send_message, (lambda chat_id, text, max_chunks=None: b.sent.append(text)), request
    return b


def wait(predicate, timeout=3.0):
    end = time.time() + timeout
    while time.time() < end:
        if predicate():
            return True
        time.sleep(0.02)
    return False


def test_a_long_job_shows_one_message_and_then_a_short_result(bot, monkeypatch):
    bot.chat_lang[1] = "en"
    sink = {}

    def job():
        for step in ("one", "two", "three"):
            bot.live_update(1, f"step {step}")
        return "RESULT"

    bot.run_job(1, "find_clinics: Vietnamese doctor Virginia", job, action_type="find_clinics", live=True)
    assert wait(lambda: "RESULT" in bot.sent)
    sends = [p for m, p in bot.api if m == "sendMessage"]
    assert len(sends) == 1 and "Working on: search for new clinics: Vietnamese doctor Virginia" in sends[0]["text"]  # ONE live message
    edits = [p for m, p in bot.api if m == "editMessageText"]
    assert edits and "Done: search for new clinics" in edits[-1]["text"]  # collapsed at the end
    assert bot.sent == ["RESULT"]  # and nothing else was sent to the chat


def test_a_failing_live_job_does_not_claim_success(bot):
    bot.chat_lang[1] = "en"

    def boom():
        raise KeyError("x")

    bot.run_job(1, "scrape_clinic_url: x", boom, action_type="x", live=True)
    assert wait(lambda: any("Error during" in m for m in bot.sent))
    last_edit = [p for m, p in bot.api if m == "editMessageText"][-1]["text"]
    assert "Stopped" in last_edit and "Done" not in last_edit


def test_a_job_that_reports_a_failure_collapses_its_live_message_as_stopped(bot):
    import jobs

    bot.chat_lang[1] = "en"

    def failed():
        raise jobs.JobFailed("find_clinics", "boom\nline 2", RuntimeError("x"))

    bot.run_job(1, "find_clinics: Vietnamese doctor Virginia", failed, action_type="find_clinics", live=True)
    assert wait(lambda: any("Failed: search for new clinics" in m for m in bot.sent))
    assert "Stopped: search for new clinics" in [p for m, p in bot.api if m == "editMessageText"][-1]["text"]


def test_cards_are_sent_with_approve_and_reject_for_drafts_only(bot):
    cards = [{"name": "A Clinic", "slug": "a-clinic", "created": True, "languages": ["English"], "quality": 80, "missing": [], "photos": 0},
             {"name": "B Clinic", "slug": "b-clinic", "created": False, "status": "published", "languages": ["English"], "quality": 80, "missing": [], "photos": 0}]
    bot.send_clinic_cards(1, cards, "en")
    assert [label for row in bot.buttons[0] for label, _ in row] == ["✅ Approve", "❌ Reject"] and bot.buttons[1] is None
    assert all(len(data.encode()) <= 64 for row in bot.buttons[0] for _, data in row)  # Telegram's limit


def press(bot, data, user=111):
    bot.handle_callback({"id": "c", "from": {"id": user}, "message": {"chat": {"id": 1}, "message_id": 5}, "data": data})


def test_approving_a_card_publishes_that_clinic_and_updates_the_card(bot, monkeypatch):
    import admin_actions

    calls = []
    monkeypatch.setattr(admin_actions, "decide_draft", lambda slug, approve: calls.append((slug, approve)) or {"ok": True, "status": "published", "name": "A Clinic"})
    bot.send_clinic_cards(1, [{"name": "A Clinic", "slug": "a-clinic", "created": True, "languages": ["English"], "quality": 80, "missing": [], "photos": 0}], "en")
    token = bot.buttons[0][0][0][1].split(":")[2]
    press(bot, f"dr:ok:{token}")
    assert calls == [("a-clinic", True)]
    edited = [p for m, p in bot.api if m == "editMessageText"][-1]
    assert "Approved: the clinic is now on the website" in edited["text"] and json.loads(edited["reply_markup"]) == {"inline_keyboard": []}
    press(bot, f"dr:ok:{token}")  # a second press finds the card gone
    assert calls == [("a-clinic", True)] and any("expired" in (p.get("text") or "") for m, p in bot.api if m == "answerCallbackQuery")


def test_rejecting_a_card_hides_the_clinic(bot, monkeypatch):
    import admin_actions

    calls = []
    monkeypatch.setattr(admin_actions, "decide_draft", lambda slug, approve: calls.append((slug, approve)) or {"ok": True, "status": "archived"})
    bot.send_clinic_cards(1, [{"name": "A", "slug": "a-clinic", "created": True, "languages": ["English"], "quality": 1, "missing": [], "photos": 0}], "vi")
    press(bot, "dr:no:" + bot.buttons[0][0][1][1].split(":")[2])
    assert calls == [("a-clinic", False)]
    assert "Đã từ chối" in [p for m, p in bot.api if m == "editMessageText"][-1]["text"]


def test_a_clinic_that_is_no_longer_a_draft_is_not_changed_by_an_old_card(bot, monkeypatch):
    import admin_actions

    monkeypatch.setattr(admin_actions, "decide_draft", lambda slug, approve: {"ok": False, "status": "published"})
    bot.send_clinic_cards(1, [{"name": "A", "slug": "a-clinic", "created": True, "languages": ["English"], "quality": 1, "missing": [], "photos": 0}], "en")
    press(bot, "dr:ok:" + bot.buttons[0][0][0][1].split(":")[2])
    assert "no longer a draft (status: published)" in [p for m, p in bot.api if m == "editMessageText"][-1]["text"]


def test_card_buttons_are_refused_for_users_who_may_not_use_the_bot(bot, monkeypatch):
    import admin_actions

    monkeypatch.setattr(admin_actions, "decide_draft", lambda *a: pytest.fail("a stranger must not approve clinics"))
    bot.send_clinic_cards(1, [{"name": "A", "slug": "a-clinic", "created": True, "languages": ["English"], "quality": 1, "missing": [], "photos": 0}], "en")
    press(bot, "dr:ok:" + bot.buttons[0][0][0][1].split(":")[2], user=999)


def test_the_whole_find_clinics_flow_in_english(bot, monkeypatch):
    """Approve the search -> one live message -> a short summary -> a card per clinic."""
    import jobs

    bot.chat_lang[1] = "en"
    summary = {"clinics": [{"name": "Great Clinic", "slug": "great-clinic", "created": True, "languages": ["English", "Vietnamese"], "languages_verified": True,
                            "rating": 4.9, "rating_count": 300, "photos": 5, "quality": 85, "missing": []}],
               "skipped_items": [{"name": "x", "reason": "directory"}], "min_rating": 4.5, "min_reviews": 20}
    seen = {}

    def fake_scout(query, limit=1, **kw):
        seen.update(query=query, limit=limit, **{k: kw[k] for k in ("lang", "min_rating", "min_reviews")})
        kw["telegram_updater_callback"]("Searching Google Places")
        kw["result_sink"].update(summary)
        return scout_report.summary_text(summary, kw["lang"])

    monkeypatch.setattr(telegram_bot, "scout_pipeline_job", fake_scout)
    bot.run_pending_action(1, {"type": "find_clinics", "name": "find_clinics: Vietnamese doctor Virginia", "query": "Vietnamese doctor Virginia", "limit": 5,
                               "min_rating": 4.5, "min_reviews": 20, "lang": "en"})
    assert wait(lambda: any("Great Clinic" in m for m in bot.sent))
    assert seen == {"query": "Vietnamese doctor Virginia", "limit": 5, "lang": "en", "min_rating": 4.5, "min_reviews": 20}
    assert bot.sent[0].startswith("✅ Done: saved 1 DRAFT clinic(s)") and "**Great Clinic**" in bot.sent[1] and bot.buttons[-1]  # the card (the summary goes through send_long_message, which has no buttons)
    assert len(bot.sent) == 2  # a summary and a card: nothing else
    assert not any(ord(ch) > 0x24F and ch.isalpha() for ch in " ".join(bot.sent))  # English from start to end


def test_scrape_clinic_url_sends_the_card_with_buttons(bot, monkeypatch):
    bot.chat_lang[1] = "en"
    card = {"name": "Dr. Van Tran Family Practice", "slug": "dr-van-tran-family-practice", "created": True, "languages": ["English", "Vietnamese"], "languages_verified": True,
            "quality": 70, "missing": ["working_hours"], "photos": 3, "rating": 4.8, "rating_count": 40}

    def fake_job(name, url, telegram_updater_callback=None, lang="vi", result_sink=None, cards_only=False):
        telegram_updater_callback("(1/5) Reading the website...")
        result_sink["card"] = card
        return ""

    monkeypatch.setattr(telegram_bot, "scrape_clinic_url_job", fake_job)
    bot.handle_command(1, "/scrape_clinic_url Dr. Van Tran Family Practice | https://www.drvantran.com/", user_id=111)
    assert wait(lambda: any("Dr. Van Tran" in m and "Draft" in m for m in bot.sent))
    assert bot.buttons[-1] and len(bot.sent) == 1  # the live message is edited, only the card is a new message


def test_the_scrape_job_forwards_only_the_five_step_headings():
    import run_single_clinic_url as single

    got = []
    forward = single._StepForwarder(got.append, "en")
    for line in ["=====", "[*] Source URL: x", "[1/5] Scraping source website...", "[1/5] Scrape summary: 5000 chars", "{ json }", "[2/5] Extracting...", "[2/5] Extraction summary:",
                 "[3/5] Attaching", "[4/5] Enriching", "[5/5] Saving", "[+] Saved clinic: x"]:
        forward(line)
    assert got == ["(1/5) Reading the website...", "(2/5) Extracting the clinic's details...", "(3/5) Attaching the source and website photos...",
                   "(4/5) Adding reviews, hours and real photos...", "(5/5) Saving..."]
    got_vi = []
    single._StepForwarder(got_vi.append, "vi")("[1/5] Scraping")
    assert got_vi == ["(1/5) Đang đọc website..."]


# --------------------------------------------------------------------------- deciding a draft (real PostgreSQL)

TEST_URL = os.environ.get("OPENCLAW_TEST_DATABASE_URL")


@pytest.fixture()
def drafts(monkeypatch):
    if not TEST_URL:
        pytest.skip("OPENCLAW_TEST_DATABASE_URL not set")
    monkeypatch.setenv("DATABASE_URL", TEST_URL)
    monkeypatch.delenv("REVALIDATE_SECRET", raising=False)
    import pg_client

    monkeypatch.setattr(pg_client, "_INSTANCE", None)
    db = pg_client.create_client()
    db.table("clinics").delete().ilike("name", "PyTest Card %").execute()
    rows = {}
    for slug, status in (("draft-a", "draft"), ("draft-b", "draft"), ("live-c", "published")):
        rows[slug] = db.table("clinics").insert({"name": f"PyTest Card {slug}", "slug": f"pytest-card-{slug}", "status": status, "languages": ["English"],
                                                 "city": "X", "state": "VA", "metadata": {}}).execute().data[0]
    yield db
    db.table("clinics").delete().ilike("name", "PyTest Card %").execute()
    db.close()


def _status(db, slug):
    return db.table("clinics").select("status").eq("slug", f"pytest-card-{slug}").single().execute().data["status"]


def test_approve_publishes_only_a_draft_and_reject_archives_it(drafts):
    from admin_actions import decide_draft

    assert decide_draft("pytest-card-draft-a", True)["ok"] and _status(drafts, "draft-a") == "published"
    assert decide_draft("pytest-card-draft-b", False)["status"] == "archived" and _status(drafts, "draft-b") == "archived"


def test_a_card_for_a_clinic_that_is_no_longer_a_draft_changes_nothing(drafts):
    from admin_actions import decide_draft

    result = decide_draft("pytest-card-live-c", False)  # an old "Reject" card must not hide a live clinic
    assert result == {"ok": False, "status": "published", "name": "PyTest Card live-c"} and _status(drafts, "live-c") == "published"
    assert decide_draft("pytest-card-does-not-exist", True)["ok"] is False

"""
Rankings, directories and social pages must never become clinics, Google errors must be reported (not hidden behind a
web search), and "approve and publish" must lead to the merge confirmation.

Regression (production): Google Places answered 403, the scout fell back to a web search and saved "About Us",
"TOP 10 BEST Doctor Speaking Chinese in Fairfax", a Healthgrades list page and "Best Hospitals in Virginia".
"""

import io
import json
import os
import sys
import urllib.error

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-token")

import google_places  # noqa: E402
import intent_agent  # noqa: E402
import quality_report  # noqa: E402
import run_scout  # noqa: E402
import source_guard as guard  # noqa: E402
import telegram_bot  # noqa: E402
import third_party_profiles as tpp  # noqa: E402

TEST_URL = os.environ.get("OPENCLAW_TEST_DATABASE_URL")


# --------------------------------------------------------------------------- the rules

@pytest.mark.parametrize("name", [
    "Best Hospitals in Virginia", "TOP 10 BEST Vietnamese Family Doctor in Fairfax, VA", "20 Best Primary Care Doctors In Virginia",
    "Top 10 Dentists", "Best Dentists in Houston", "Find a Doctor", "Doctors Directory", "About Us", "Contact", "Just a moment...",
])
def test_the_rubbish_from_production_is_recognised(name):
    assert not guard.check_name(name).ok


@pytest.mark.parametrize("name", [
    "Top Acupuncture Clinic", "Best Care Dental", "Great Care Dental", "Top Smile Dental", "TCM Acupuncture & Herbs",
    "Anchor Dental", "Dr. Van Tran Family Practice", "Vietnamese American Service Center (VASC)", "Best Choice Pediatrics",
])
def test_real_clinics_with_best_or_top_in_the_name_are_not_blocked(name):
    assert guard.check_name(name).ok


@pytest.mark.parametrize("url", [
    "https://health.usnews.com/best-hospitals/area/va", "https://www.healthgrades.com/family-practice-directory/va-virginia",
    "https://www.facebook.com/someclinic", "https://m.yelp.com/biz/x", "https://doctor.webmd.com/providers/specialty/primary-care/virginia",
    "https://www.zocdoc.com/primary-care-doctors/fairfax-206604pm", "https://example.com/best-dentists-in-texas/", "https://example.com/directory/",
])
def test_addresses_of_rankings_directories_and_social_pages_are_blocked(url):
    assert not guard.check_url(url).ok


@pytest.mark.parametrize("url", ["https://www.drvantran.com/", "https://anchordental.com/our-team", "https://clinic.example.org/services/dental"])
def test_a_clinics_own_website_passes(url):
    assert guard.check_url(url).ok


def test_a_page_full_of_different_phones_or_doctors_is_a_directory():
    phones = " ".join(f"Call ({200 + i}) 555-01{i:02d}" for i in range(12))
    assert guard.check_text(phones).kind == "directory_text"
    doctors = " ".join(f"Dr. Name{chr(97 + i)} Surname{chr(97 + i)} treats patients." for i in range(20))
    assert guard.check_text(doctors.title()).kind == "directory_text"
    assert guard.check_text("Welcome to Anchor Dental. Call (713) 555-0100 or (713) 555-0101. Dr. Linh Tran leads our team.").ok


def test_the_first_problem_found_is_reported_in_both_languages():
    verdict = guard.check_source(url="https://www.yelp.com/biz/x", name="Anchor Dental")
    assert verdict.kind == "aggregator" and "yelp.com" in verdict.reason
    assert "tổng hợp" in guard.explain(verdict, "vi") and guard.explain(verdict, "en") == verdict.reason
    assert guard.check_source(url="https://anchordental.com", name="Anchor Dental", title="Anchor Dental | Houston", text="Hello").ok


# --------------------------------------------------------------------------- Google errors are reported

def _http_error(code, message):
    body = io.BytesIO(json.dumps({"error": {"message": message}}).encode())
    return urllib.error.HTTPError("https://places.googleapis.com", code, "x", {}, body)


def test_a_google_403_becomes_an_error_that_says_what_to_check(monkeypatch):
    def boom(*a, **k):
        raise _http_error(403, "Places API (New) has not been used in project 123 or it is disabled.")

    monkeypatch.setattr(google_places, "urlopen", boom)
    with pytest.raises(google_places.GooglePlacesError) as info:
        google_places.search_places_by_text("Vietnamese doctor Fairfax VA", "key")
    assert info.value.status == 403 and "disabled" in info.value.message
    assert "IP" in info.value.hint("en") and "thanh toán" in info.value.hint("vi")


def test_an_unreachable_google_is_status_zero(monkeypatch):
    monkeypatch.setattr(google_places, "urlopen", lambda *a, **k: (_ for _ in ()).throw(urllib.error.URLError("no route")))
    with pytest.raises(google_places.GooglePlacesError) as info:
        google_places.search_places_by_text("x", "key")
    assert info.value.status == 0 and "network" in info.value.hint("en")


# --------------------------------------------------------------------------- the scout

@pytest.fixture()
def scout(monkeypatch):
    """The scout with every outside call replaced; `calls` records what it tried."""
    monkeypatch.delenv("OPENCLAW_SCOUT_WEB_FALLBACK", raising=False)
    calls = {"brave": 0, "scraped": [], "saved": [], "messages": []}
    monkeypatch.setattr(run_scout, "get_google_places_key", lambda: "k")
    monkeypatch.setattr(run_scout, "_load_existing_clinic_keys", lambda: (set(), set()))
    monkeypatch.setattr(run_scout, "_brave_web_search", lambda *a, **k: calls.__setitem__("brave", calls["brave"] + 1) or calls.get("brave_results", []))
    monkeypatch.setattr(run_scout, "scrape_content_from_url", lambda url: calls["scraped"].append(url) or calls.get("page", {
        "markdown_content": "Welcome to Anchor Dental. Call (713) 555-0100. We speak Vietnamese.", "images": [], "page_title": "Anchor Dental"}))
    monkeypatch.setattr(run_scout, "extract_clinic_data", lambda name, content: {"name": name, "languages": ["English", "Vietnamese"], "specialty": "Dentist", "city": "Houston", "state": "TX"})
    monkeypatch.setattr(run_scout, "merge_deterministic_contacts", lambda d, c: d)
    monkeypatch.setattr(run_scout, "enrich_clinic_with_google_places", lambda d, place_id=None, upload_photos=True: d)
    monkeypatch.setattr(run_scout, "enrich_missing_with_brave", lambda d: d)
    monkeypatch.setattr(run_scout, "enrich_clinic_with_third_party_profiles", lambda d: d)
    monkeypatch.setattr(run_scout, "attach_real_photos", lambda d, **k: d)
    monkeypatch.setattr(run_scout, "insert_clinic", lambda d: calls["saved"].append(d.get("name")) or True)
    return calls


def run(calls, **kw):
    return run_scout.run_scout_pipeline("Vietnamese doctor Virginia", limit=2, telegram_updater_callback=calls["messages"].append, **kw)


def test_google_403_stops_the_scout_with_the_reason_and_no_web_search(scout, monkeypatch):
    monkeypatch.setattr(run_scout, "search_places_by_text", lambda *a, **k: (_ for _ in ()).throw(google_places.GooglePlacesError(403, "billing disabled")))
    scout["brave_results"] = [{"url": "https://health.usnews.com/best-hospitals/area/va", "title": "Best Hospitals in Virginia"}]
    summary = run(scout, lang="en")
    assert summary["error"] == "google_places_403" and summary["saved"] == 0
    assert scout["brave"] == 0 and scout["scraped"] == [] and scout["saved"] == []  # nothing was searched, scraped or saved
    text = "\n".join(scout["messages"])
    assert "403" in text and "billing disabled" in text and "IP" in text and "stopped" in text


def test_the_reason_comes_in_the_users_language(scout, monkeypatch):
    monkeypatch.setattr(run_scout, "search_places_by_text", lambda *a, **k: (_ for _ in ()).throw(google_places.GooglePlacesError(403, "x")))
    run(scout, lang="vi")
    assert "Mình dừng lại" in "\n".join(scout["messages"])


def test_no_results_is_reported_without_falling_back_to_the_web(scout, monkeypatch):
    monkeypatch.setattr(run_scout, "search_places_by_text", lambda *a, **k: [])
    assert run(scout, lang="en")["error"] == "no_results" and scout["brave"] == 0


def test_the_web_fallback_only_runs_when_switched_on_and_filters_every_result(scout, monkeypatch):
    monkeypatch.setenv("OPENCLAW_SCOUT_WEB_FALLBACK", "on")
    monkeypatch.setattr(run_scout, "search_places_by_text", lambda *a, **k: (_ for _ in ()).throw(google_places.GooglePlacesError(403, "x")))
    scout["brave_results"] = [
        {"url": "https://health.usnews.com/best-hospitals/area/va", "title": "Best Hospitals in Virginia | US News"},
        {"url": "https://www.healthgrades.com/family-practice-directory/va-virginia", "title": "20 Best Primary Care Doctors In Virginia"},
        {"url": "https://www.example-dr.com/about", "title": "About Us"},
        {"url": "https://www.drvantran.com/", "title": "Dr. Van Tran Family Practice"},
    ]
    run(scout, lang="en")
    assert scout["scraped"] == ["https://www.drvantran.com/"] and scout["saved"] == ["Dr. Van Tran Family Practice"]
    assert any("Filtered out 3" in m for m in scout["messages"])


def test_a_place_whose_only_website_is_a_social_page_is_skipped(scout, monkeypatch):
    monkeypatch.setattr(run_scout, "search_places_by_text", lambda *a, **k: [
        {"id": "1", "displayName": {"text": "Facebook Only Clinic"}, "websiteUri": "https://www.facebook.com/onlyclinic", "types": ["doctor"]},
        {"id": "2", "displayName": {"text": "Anchor Dental"}, "websiteUri": "https://anchordental.com", "types": ["dentist"]}])
    run(scout, lang="en")
    assert scout["scraped"] == ["https://anchordental.com"] and scout["saved"] == ["Anchor Dental"]
    assert any("Facebook/Yelp" in m for m in scout["messages"])


def test_a_page_that_turns_out_to_be_a_directory_is_not_saved(scout, monkeypatch):
    monkeypatch.setattr(run_scout, "search_places_by_text", lambda *a, **k: [
        {"id": "1", "displayName": {"text": "Houston Health Listings"}, "websiteUri": "https://houstonlistings.example", "types": ["doctor"]}])
    scout["page"] = {"markdown_content": " ".join(f"Dr. Alpha{chr(97 + i)} Beta{chr(97 + i)} call ({300 + i}) 555-01{i:02d}" for i in range(15)), "images": [], "page_title": "Directory"}
    summary = run(scout, lang="en")
    assert scout["saved"] == [] and summary["skipped"] == 1 and any("Skipped" in m for m in scout["messages"])


# --------------------------------------------------------------------------- last line of defence + other entry points

def test_insert_clinic_refuses_listings_and_social_pages_whatever_the_caller(monkeypatch):
    import db

    monkeypatch.setattr(db, "create_client", lambda: pytest.fail("a listing must be refused before the database is touched"))
    assert db.insert_clinic({"name": "Best Hospitals in Virginia", "address": "x"}) is False
    assert db.insert_clinic({"name": "Real Clinic", "website": "https://health.usnews.com/best-hospitals/area/va"}) is False
    assert db.insert_clinic({"name": "Real Clinic", "source_url": "https://www.healthgrades.com/family-practice-directory/va-virginia"}) is False


def test_scrape_clinic_url_refuses_a_ranking_url_before_fetching_anything(monkeypatch):
    import jobs
    import run_single_clinic_url as single

    monkeypatch.setattr(single, "scrape_content_from_url", lambda url: pytest.fail("must not fetch a ranking page"))
    out = jobs.scrape_clinic_url_job("Best Hospitals", "https://health.usnews.com/best-hospitals/area/va", lang="en")
    assert "Not saved" in out and "usnews.com" in out and "own website" in out
    assert "Không lưu" in jobs.scrape_clinic_url_job("x", "https://www.yelp.com/biz/x", lang="vi")


def test_scrape_clinic_url_refuses_a_page_that_is_a_list_of_many_clinics(monkeypatch):
    import jobs
    import run_single_clinic_url as single

    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "k")
    text = " ".join(f"Call ({200 + i}) 555-01{i:02d}" for i in range(12))
    monkeypatch.setattr(single, "scrape_content_from_url", lambda url: {"markdown_content": text, "page_title": "Doctors", "dead_reason": None})
    monkeypatch.setattr(single, "extract_clinic_data", lambda *a, **k: pytest.fail("nothing may be extracted from a directory"))
    assert "Not saved" in jobs.scrape_clinic_url_job("x", "https://doctors-list.example/page", lang="en")


# --------------------------------------------------------------------------- third-party profiles

@pytest.mark.parametrize("provider,url,expected", [
    ("healthgrades", "https://www.healthgrades.com/family-practice-directory/va-virginia", False),
    ("healthgrades", "https://www.healthgrades.com/physician/dr-john-smith-abc12", True),
    ("healthgrades", "https://www.healthgrades.com/group-directory/va-virginia/fairfax/anchor-dental-xyz1", True),
    ("zocdoc", "https://www.zocdoc.com/primary-care-doctors/fairfax-206604pm", False),
    ("zocdoc", "https://www.zocdoc.com/practice/anchor-dental-12345", True),
    ("webmd", "https://doctor.webmd.com/providers/specialty/primary-care/virginia", False),
    ("webmd", "https://doctor.webmd.com/doctor/john-smith-1234", True),
    ("unknownsite", "https://unknown.example/whatever", False),
])
def test_only_pages_about_one_provider_count_as_a_profile(provider, url, expected):
    assert tpp.is_profile_url(provider, url) is expected


def test_a_list_page_is_skipped_even_when_it_is_the_first_search_result(monkeypatch):
    results = [{"url": "https://www.healthgrades.com/family-practice-directory/va-virginia"}, {"url": "https://www.healthgrades.com/physician/dr-john-smith-abc12"}]
    monkeypatch.setattr(tpp, "_search_brave", lambda *a, **k: results)
    assert tpp.find_provider_profile({"name": "Anchor Dental", "city": "Fairfax", "state": "VA"}, "healthgrades")["url"].endswith("dr-john-smith-abc12")
    monkeypatch.setattr(tpp, "_search_brave", lambda *a, **k: results[:1])
    assert tpp.find_provider_profile({"name": "Anchor Dental"}, "healthgrades") is None


# --------------------------------------------------------------------------- the scorecard

def test_existing_clinics_that_look_like_rankings_are_listed_first():
    rows = [
        {"slug": "best-hospitals-in-virginia", "name": "Best Hospitals in Virginia", "status": "published", "description": "x" * 200, "metadata": {"source_url": "https://health.usnews.com/best-hospitals/area/va"}},
        {"slug": "top-acupuncture-clinic", "name": "Top Acupuncture Clinic", "status": "published", "description": "x" * 200, "metadata": {"website": "https://topacu.example"}},
        {"slug": "fb", "name": "Facebook Clinic", "status": "published", "description": "x" * 200, "metadata": {"website": "https://www.facebook.com/x"}},
    ]
    report = quality_report.build_report(rows, file_exists=lambda u: True)
    assert report["problems"]["not_a_clinic"] == 2
    assert [w["slug"] for w in report["worst"][:2]] == ["best-hospitals-in-virginia", "fb"]
    assert "top-acupuncture-clinic" not in " ".join(w["slug"] for w in report["worst"] if "not_a_clinic" in w["problems"])
    assert "/reject_clinic" in quality_report.format_report(report, "en")


# --------------------------------------------------------------------------- "approve and publish" + /whoami

@pytest.fixture()
def bot(tmp_path, monkeypatch):
    monkeypatch.setattr(telegram_bot, "MEMORY_PATH", str(tmp_path / "m.json"))
    monkeypatch.setattr(telegram_bot.TelegramBot, "start_anomaly_checker", lambda self: None)
    monkeypatch.setenv("TELEGRAM_ALLOWED_USER_IDS", "111,222")
    monkeypatch.setenv("TELEGRAM_SUPERADMIN_IDS", "111")
    b = telegram_bot.TelegramBot()
    b.sent, b.buttons, b.merged = [], [], []
    b.send_message = lambda chat_id, text, buttons=None: (b.sent.append(text), b.buttons.append(buttons))
    import web_pr

    monkeypatch.setattr(web_pr, "get_web_pr", lambda n: {"number": n, "title": "Web edit: hero", "state": "open", "merged": False,
                                                          "html_url": f"https://github.test/pull/{n}", "changed_files": 1, "additions": 2, "deletions": 1})
    monkeypatch.setattr(telegram_bot, "web_merge_job", lambda n: b.merged.append(n) or "merged")
    return b


def agent(action, **params):
    return lambda *a, **k: intent_agent.IntentResult(action=action, lang="en", parameters=params, requires_approval=False)


def test_whoami_shows_the_id_and_what_it_may_do(bot):
    bot.handle_command(111, "/whoami", user_id=111)
    assert "`111`" in bot.sent[-1] and "Admin (merge website, manage users): yes" in bot.sent[-1]
    bot.handle_command(222, "/whoami", user_id=222)
    assert "`222`" in bot.sent[-1] and "NO, add the id to TELEGRAM_SUPERADMIN_IDS" in bot.sent[-1]


def test_approve_and_publish_in_plain_words_merges_the_pr_that_was_just_opened(bot, monkeypatch):
    """The exact scenario from the screenshots."""
    bot.after_web_pr(111, {"pr_number": 15, "pr_url": "https://github.test/pull/15", "title": "Web edit: hero", "screenshots": []})
    assert bot.pending_actions[111]["pr_number"] == 15 and bot.buttons[-1]  # the card already has buttons
    bot.pending_actions.pop(111)  # (the user ignored it and typed instead)
    monkeypatch.setattr(telegram_bot, "run_agent", agent("merge_web_pr"))
    bot.handle_chat(111, "approve and publish on live site", user_id=111)
    assert "Merge Pull Request #15" in bot.sent[-1] and bot.buttons[-1] and bot.merged == []  # asks first
    monkeypatch.setattr(telegram_bot, "run_agent", intent_agent.run_intent_agent)
    bot.handle_chat(111, "approve", user_id=111)
    deadline = __import__("time").time() + 3
    while not bot.merged and __import__("time").time() < deadline:
        __import__("time").sleep(0.02)
    assert bot.merged == [15]


def test_someone_who_may_not_merge_is_told_their_id_and_what_to_set(bot, monkeypatch):
    bot.last_web_pr[222] = 15
    monkeypatch.setattr(telegram_bot, "run_agent", agent("merge_web_pr"))
    bot.handle_chat(222, "publish it", user_id=222)
    assert "222" in bot.sent[-1] and "TELEGRAM_SUPERADMIN_IDS" in bot.sent[-1]
    assert 222 not in bot.pending_actions and bot.merged == []


def test_without_a_number_or_a_recent_pr_it_asks_which_one(bot, monkeypatch):
    monkeypatch.setattr(telegram_bot, "run_agent", agent("merge_web_pr"))
    bot.handle_chat(111, "publish it", user_id=111)
    assert "Which Pull Request number" in bot.sent[-1] and 111 not in bot.pending_actions
    monkeypatch.setattr(telegram_bot, "run_agent", agent("merge_web_pr", number=9))
    bot.handle_chat(111, "merge PR 9", user_id=111)
    assert bot.pending_actions[111]["pr_number"] == 9


def test_closing_and_listing_go_through_the_same_checks(bot, monkeypatch):
    seen = []
    bot.handle_web_pr_command = lambda chat_id, command, text, user_id: seen.append((command, text))
    monkeypatch.setattr(telegram_bot, "run_agent", agent("close_web_pr", number=15))
    bot.handle_chat(111, "discard PR 15", user_id=111)
    monkeypatch.setattr(telegram_bot, "run_agent", agent("list_web_prs"))
    bot.handle_chat(111, "which PRs are waiting", user_id=111)
    assert seen == [("/web_close", "/web_close 15"), ("/web_prs", "/web_prs")]

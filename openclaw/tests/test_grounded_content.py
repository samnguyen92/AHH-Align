"""
Content that is only built from what the clinic's website says.

Regression: the old rescan prompt told the model to write, for EVERY clinic, that bilingual staff help with scheduling,
forms and billing and that older adults need no family interpreter, plus invented FAQs, "differentiators" and services,
and swapped an unverified language for another one. Nothing was checked against the website.
"""

import json
import os
import sys
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-token")

import clinic_edit  # noqa: E402
import content_cleanup  # noqa: E402
import grounded_content as gc  # noqa: E402
import quality_report  # noqa: E402
import telegram_bot  # noqa: E402

TEST_URL = os.environ.get("OPENCLAW_TEST_DATABASE_URL")

SOURCE = (
    "Welcome to Anchor Dental in Houston, Texas. Dr. Linh Tran has treated patients since 2009. "
    "We offer cleanings, root canal therapy, implants and teeth whitening. Walk-ins are welcome on Saturdays. "
    "Our staff speak English and Vietnamese. Interpreter services are available at no charge. "
    "We accept Delta Dental, Aetna and Medi-Cal. A new patient exam costs $99. Free parking is behind the building. "
    "Call us at (713) 555-0100 to book your visit today. " * 2
)
PAGES = [{"url": "https://anchor.test", "content": SOURCE}]


def facts_answer():
    return {
        "services": [{"name": "Root canal therapy", "category": "Endodontics", "description": "", "quote": "root canal therapy, implants and teeth whitening"},
                     {"name": "Invisalign", "category": "Orthodontics", "description": "", "quote": "we offer Invisalign clear aligners for teens"}],
        "conditions": [],
        "what_to_know": [{"title": "Walk-ins", "detail": "Saturday walk-ins", "quote": "Walk-ins are welcome on Saturdays"}],
        "differentiators": [{"title": "Award winning", "detail": "Best dentist in Houston", "quote": "voted best dentist in Houston three years in a row"}],
        "before_you_book": [],
        "faqs": [{"question": "Do you take new patients?", "answer": "Yes, always.", "quote": "we are always accepting new patients of every age"}],
        "pricing": [{"name": "New patient exam", "price": "$99", "notes": "", "quote": "A new patient exam costs $99"},
                    {"name": "Whitening", "price": "$300", "notes": "", "quote": "Whitening is $300"}],
        "insurance_networks": [{"name": "Delta Dental", "quote": "We accept Delta Dental, Aetna and Medi-Cal"}, {"name": "Cigna", "quote": "We accept Cigna too"}],
        "team_members": [{"name": "Dr. Linh Tran", "role": "Dentist", "credentials": "DDS", "languages_spoken": ["Vietnamese", "Korean"], "quote": "Dr. Linh Tran has treated patients since 2009"},
                         {"name": "Dr. Invented Person", "role": "Dentist", "credentials": "", "languages_spoken": [], "quote": "Dr. Invented Person joined last year"}],
        "location_notes": {"parking": {"text": "Free parking behind the building", "quote": "Free parking is behind the building"}, "transit": {"text": "Bus 42 stops outside", "quote": "bus 42 stops right outside"}},
        "interpreter": {"stated": True, "quote": "Interpreter services are available at no charge"},
        "about_points": [{"text": "Treating patients since 2009", "quote": "has treated patients since 2009"}],
    }


class FakeLLM:
    """Answers per kind of request (facts / prose / translation) and counts the calls."""

    def __init__(self, prose=None, facts=None, fail_translation_for=()):
        self.calls = []
        self.prose = prose if prose is not None else {
            "short_description": "Anchor Dental is a dental practice in Houston, Texas.",
            "description": "Dr. Linh Tran has treated patients since 2009. The practice offers root canal therapy and implants.",
            "about_highlight": "Anchor Dental offers cleanings and teeth whitening in Houston."}
        self.facts = facts if facts is not None else facts_answer()
        self.fail_for = set(fail_translation_for)

    def __call__(self, system, prompt, max_tokens=3500):
        self.calls.append(system[:20])
        if system == gc.FACTS_SYSTEM:
            return self.facts
        if system == gc.PROSE_SYSTEM:
            return self.prose
        code = next(c for c, n in gc.TARGET_LANGUAGES.items() if f"Translate into {n}" in prompt)
        if code in self.fail_for:
            return {"oops": 1}
        payload = json.loads(prompt.split("exactly these keys:\n", 1)[1])
        return {k: (f"[{code}] {v}" if isinstance(v, str) else [{f: f"[{code}] {x}" if not any(ch.isdigit() for ch in x) else x for f, x in i.items()} for i in v]) for k, v in payload.items()}


# --------------------------------------------------------------------------- quotes

def test_a_verbatim_quote_is_found_and_a_paraphrase_is_not():
    source = gc.normalize_for_match(SOURCE)
    assert gc.quote_in_source("Walk-ins are welcome on Saturdays", source)
    assert gc.quote_in_source("WALK-INS are welcome, on saturdays!", source)  # case and punctuation do not matter
    assert gc.quote_in_source("Welcome to Anchor Dental … cleanings, root canal therapy", source)  # each part around an ellipsis is checked
    assert not gc.quote_in_source("Welcome to Anchor Dental … fully certified in Invisalign", source)
    assert not gc.quote_in_source("We welcome walk-in patients on weekends", source)  # paraphrase: not verbatim
    assert not gc.quote_in_source("Walk-ins", source)  # too short to prove anything
    assert not gc.quote_in_source("", source)


# --------------------------------------------------------------------------- facts

def verified():
    return gc.verify_facts(facts_answer(), SOURCE, ["English", "Vietnamese"])


def test_only_facts_with_a_quote_that_is_really_in_the_source_survive():
    facts, dropped = verified()
    assert [s["name"] for s in facts["services"]] == ["Root canal therapy"]  # "Invisalign" was invented
    assert facts["differentiators"] == [] and facts["faqs"] == []  # invented "best dentist" / "always accepting"
    assert [i["title"] for i in facts["what_to_know"]] == ["Walk-ins"]
    assert dropped["services"] == 1 and dropped["differentiators"] == 1 and dropped["faqs"] == 1


def test_prices_insurance_and_people_are_checked_again_on_their_own():
    facts, _ = verified()
    assert [p["price"] for p in facts["pricing"]] == ["$99"]  # $300 has no support
    assert [i["name"] for i in facts["insurance_networks"]] == ["Delta Dental"]  # Cigna was invented
    assert [m["name"] for m in facts["team_members"]] == ["Dr. Linh Tran"]  # the invented doctor is gone
    assert facts["team_members"][0]["languages_spoken"] == ["Vietnamese"]  # Korean has no evidence for this clinic
    assert facts["interpreter"] is True and facts["location_notes"] == {"parking": "Free parking behind the building"}  # transit quote not found


def test_a_real_quote_cannot_carry_a_wrong_price_name_or_insurer():
    """The quote is in the source, but the claim built on it is not."""
    raw = {
        "pricing": [{"name": "Exam", "price": "$150", "quote": "A new patient exam costs $99"}],
        "insurance_networks": [{"name": "Cigna", "quote": "We accept Delta Dental, Aetna and Medi-Cal"}],
        "team_members": [{"name": "Dr. Someone Else", "role": "Dentist", "languages_spoken": [], "quote": "Dr. Linh Tran has treated patients since 2009"}],
    }
    facts, dropped = gc.verify_facts(raw, SOURCE, ["English"])
    assert facts["pricing"] == [] and facts["insurance_networks"] == [] and facts["team_members"] == []
    assert dropped == {"pricing": 1, "insurance_networks": 1, "team_members": 1}


def test_a_claim_without_a_quote_never_counts():
    raw = {**facts_answer(), "interpreter": {"stated": True, "quote": ""}, "pricing": [{"name": "x", "price": "$99", "quote": "something else entirely about money"}]}
    facts, _ = gc.verify_facts(raw, SOURCE, ["English"])
    assert facts["interpreter"] is False and facts["pricing"] == []


# --------------------------------------------------------------------------- the Language support box

def test_no_non_english_evidence_means_no_language_box():
    assert gc.language_note_from_evidence(["English"], {}) == ""
    assert gc.language_note_from_evidence([], {}) == ""


def test_the_box_states_only_what_the_website_says():
    note = gc.language_note_from_evidence(["English", "Vietnamese"], {"Vietnamese": "Our staff speak English and Vietnamese"},
                                          [{"name": "Dr. Linh Tran", "languages_spoken": ["Vietnamese"]}], "Interpreter services are available")
    assert note.startswith("The clinic’s verified spoken languages are English and Vietnamese.")
    assert "Our staff speak English and Vietnamese" in note and "Dr. Linh Tran (Vietnamese)" in note and "interpreter services are available" in note
    assert not gc.has_boilerplate(note)
    plain = gc.language_note_from_evidence(["English", "Vietnamese"], {"Vietnamese": "We speak Vietnamese"})
    assert "interpreter" not in plain and "Listed on the website" not in plain  # no evidence, no sentence


def test_the_sentence_keeps_the_shape_the_language_sync_looks_for():
    note = gc.language_note_from_evidence(["English", "Vietnamese"], {"Vietnamese": "We speak Vietnamese"})
    assert clinic_edit._LANG_SENTENCE.search(note)  # so adding a language later still updates it


# --------------------------------------------------------------------------- prose

LEGACY = ("Bilingual team members can help with scheduling, intake forms, consultations, and questions about insurance or billing. "
          "Older adults and immigrant families may be able to communicate directly with the clinic without relying on a family member to interpret.")


def test_the_generic_template_sentences_are_recognised():
    assert gc.has_boilerplate(LEGACY)
    assert gc.strip_boilerplate(f"Dr. Kim treats patients. {LEGACY}") == "Dr. Kim treats patients."
    assert not gc.has_boilerplate("Dr. Kim speaks Korean. Interpreter services are available.")


def test_sentences_are_not_cut_after_dr():
    assert gc.split_sentences("Dr. Kim treats patients. Mrs. Lee is the manager at St. Mary Clinic.") == ["Dr. Kim treats patients.", "Mrs. Lee is the manager at St. Mary Clinic."]


def test_prose_loses_every_sentence_the_source_does_not_support():
    text = ("Dr. Linh Tran has treated patients since 2009. Our staff speak Korean. A visit costs $450. Dr. Invented Person leads the team. "
            f"{LEGACY} The office offers teeth whitening.")
    assert gc.lint_prose(text, SOURCE, ["English", "Vietnamese"]) == "Dr. Linh Tran has treated patients since 2009. The office offers teeth whitening."


def test_a_language_family_is_allowed_but_a_stranger_is_not():
    assert gc.lint_prose("Staff speak Mandarin.", "x", ["English", "Chinese"]) == "Staff speak Mandarin."
    assert gc.lint_prose("Staff speak Tagalog.", "x", ["English", "Chinese"]) == ""


def test_composed_prose_never_keeps_the_template_and_falls_back_to_plain_facts():
    clinic = {"name": "Anchor Dental", "specialty": "Dentist", "city": "Houston", "state": "TX"}
    facts, _ = verified()
    full = gc.compose_prose(clinic, facts, SOURCE, ["English", "Vietnamese"], FakeLLM(prose={"short_description": "x", "description": LEGACY, "about_highlight": LEGACY}))
    assert not gc.has_boilerplate(full["description"]) and full["description"].startswith("Anchor Dental is a dentist practice in Houston, TX.")
    assert "root canal therapy" in full["description"].lower() and full["about_highlight"] and full["short_description"]

    def broken(system, prompt, max_tokens=0):
        raise RuntimeError("model down")

    assert gc.compose_prose(clinic, facts, SOURCE, ["English"], broken)["description"].startswith("Anchor Dental is")


# --------------------------------------------------------------------------- translations

def test_a_translation_must_keep_structure_and_numbers():
    payload = {"description": "Call (713) 555-0100. Exam $99.", "faqs": [{"question": "Parking?", "answer": "Free."}]}
    good = {"description": "Gọi (713) 555-0100. Khám $99.", "faqs": [{"question": "Đậu xe?", "answer": "Miễn phí."}]}
    assert gc.verify_translation(payload, good)
    assert not gc.verify_translation(payload, {**good, "description": "Gọi số này. Khám miễn phí."})  # phone and price lost
    assert not gc.verify_translation(payload, {**good, "faqs": []})  # an item disappeared
    assert not gc.verify_translation(payload, {**good, "description": ""})
    assert not gc.verify_translation(payload, "nonsense")


def test_translate_retries_once_then_gives_up_instead_of_storing_rubbish():
    answers = [{"oops": 1}, {"description": "[vi] Hello"}]
    calls = []

    def llm(system, prompt, max_tokens=0):
        calls.append(1)
        return answers.pop(0)

    assert gc.translate({"description": "Hello"}, "vi", llm) == {"description": "[vi] Hello"} and len(calls) == 2
    assert gc.translate({"description": "Hello"}, "ko", lambda *a, **k: {"oops": 1}) is None


def test_only_the_changed_texts_are_translated_and_cleared_ones_are_removed():
    english = {"description": "New text.", "language_note": "", "about_highlight": "Same."}
    existing = {"vi": {"description": "cũ", "language_note": "cũ", "about_highlight": "giữ"}, "ko": {"description": "old"}}
    seen = []

    def llm(system, prompt, max_tokens=0):
        seen.append(prompt)
        return {"description": "[x] New text."}

    i18n, status = gc.refresh_translations(english, existing, {"description", "language_note"}, llm)
    assert all("about_highlight" not in p for p in seen)  # nothing was paid for the unchanged text
    assert i18n["vi"]["description"] == "[x] New text." and "language_note" not in i18n["vi"] and i18n["vi"]["about_highlight"] == "giữ"
    assert status == {"vi": "ok", "ko": "ok", "zh": "ok"}


def test_a_failed_language_keeps_what_it_had():
    i18n, status = gc.refresh_translations({"description": "New."}, {"ko": {"description": "old"}}, {"description"}, FakeLLM(fail_translation_for={"ko"}))
    assert status["ko"] == "failed" and i18n["ko"]["description"] == "old" and status["vi"] == "ok"


# --------------------------------------------------------------------------- the whole profile

CLINIC = {"name": "Anchor Dental", "specialty": "Dentist", "city": "Houston", "state": "TX", "metadata": {"reviews": []}}


def test_the_profile_contains_only_verified_content_and_all_three_translations():
    llm = FakeLLM()
    profile = gc.build_grounded_profile(CLINIC, ["English", "Vietnamese"], {"Vietnamese": "Our staff speak English and Vietnamese"}, PAGES, llm=llm)
    assert [s["name"] for s in profile["services_offered"]] == ["Root canal therapy"]
    assert profile["faqs"] == [] and profile["differentiators"] == []  # nothing invented to fill the sections
    assert [p["price"] for p in profile["pricing"]] == ["$99"] and profile["insurance"]["accepted_networks"] == ["Delta Dental"]
    assert [m["name"] for m in profile["team_members"]] == ["Dr. Linh Tran"]
    assert profile["language_note"].startswith("The clinic’s verified spoken languages are English and Vietnamese.")
    assert profile["cultural_context"] == "" and not gc.has_boilerplate(profile["description"])
    assert set(profile["i18n"]) == {"vi", "ko", "zh"} and profile["i18n"]["vi"]["language_note"].startswith("[vi]")
    assert profile["_grounding"]["dropped_unsupported"]["services"] == 1 and profile["_grounding"]["translation"] == {"vi": "ok", "ko": "ok", "zh": "ok"}
    assert len(llm.calls) == 5  # facts + prose + 3 translations: the bill is predictable


def test_without_website_text_nothing_is_generated():
    llm = FakeLLM()
    assert gc.build_grounded_profile(CLINIC, ["English"], {}, [{"url": "x", "content": "short"}], llm=llm) is None
    assert llm.calls == []


def test_no_evidence_for_another_language_means_no_language_box():
    profile = gc.build_grounded_profile(CLINIC, ["English"], {}, PAGES, llm=FakeLLM(), translate_too=False)
    assert profile["language_note"] == "" and "i18n" not in profile


def test_rescan_removes_a_stray_language_instead_of_swapping_it():
    import rescan_all_clinics as rescan

    assert rescan.sanitize_language_mentions("We speak Korean and Vietnamese. Cleanings are offered.", ["English", "Vietnamese"]) == "Cleanings are offered."
    assert rescan.sanitize_language_mentions("Our staff speak Vietnamese.", ["English", "Vietnamese"]) == "Our staff speak Vietnamese."


# --------------------------------------------------------------------------- cleaning the clinics that already have the template

def legacy_row(**over):
    row = {"id": "1", "name": "Old Clinic", "slug": "old-clinic", "languages": ["English", "Vietnamese"], "description": f"Offers dental care. {LEGACY}",
           "metadata": {"language_note": f"The clinic’s verified spoken languages are English and Vietnamese. {LEGACY}", "languages_verified": True,
                        "languages_evidence": ["Vietnamese: We speak Vietnamese"], "about_highlight": "Fine text."}}
    row.update(over)
    return row


def test_cleanup_cuts_the_template_and_rebuilds_the_box_from_evidence():
    changes = content_cleanup.plan_cleanup(legacy_row())
    assert changes["description"] == "Offers dental care." and set(changes) == {"description", "language_note"}
    assert changes["language_note"] == "The clinic’s verified spoken languages are English and Vietnamese. Its website says: “We speak Vietnamese”."


def test_without_verified_languages_the_box_disappears_and_clean_clinics_are_left_alone():
    row = legacy_row()
    row["metadata"]["languages_verified"] = False
    assert content_cleanup.plan_cleanup(row)["language_note"] == ""
    assert content_cleanup.plan_cleanup(legacy_row(description="Plain.", metadata={"language_note": "Staff speak Vietnamese (website)."})) is None


def test_the_scorecard_counts_generic_content_in_every_text_field():
    rows = [legacy_row(), {"slug": "ok", "status": "published", "description": "x" * 200, "metadata": {"language_note": "Fine."}},
            {"slug": "about", "status": "published", "description": "x" * 200, "metadata": {"about_highlight": LEGACY}}]
    flagged = [r["slug"] for r in rows if "generic_content" in quality_report.analyze_clinic(r, file_exists=lambda u: True)]
    assert flagged == ["old-clinic", "about"]


PREFIX = "PyTest Content2 "


@pytest.fixture()
def db(monkeypatch):
    if not TEST_URL:
        pytest.skip("OPENCLAW_TEST_DATABASE_URL not set")
    monkeypatch.setenv("DATABASE_URL", TEST_URL)
    monkeypatch.delenv("REVALIDATE_SECRET", raising=False)
    import pg_client

    monkeypatch.setattr(pg_client, "_INSTANCE", None)
    client = pg_client.create_client()
    client.table("clinics").delete().ilike("name", PREFIX + "%").execute()
    yield client
    for row in client.table("clinics").select("id").ilike("name", PREFIX + "%").execute().data or []:
        client.table("audit_log").delete().eq("target_id", str(row["id"])).execute()
    client.table("clinics").delete().ilike("name", PREFIX + "%").execute()
    client.close()


def insert_legacy(db, slug="one"):
    meta = {"language_note": f"The clinic’s verified spoken languages are English and Vietnamese. {LEGACY}", "languages_verified": True,
            "languages_evidence": ["Vietnamese: We speak Vietnamese"], "about_highlight": "Fine text.",
            "i18n": {"vi": {"language_note": "câu mẫu cũ", "about_highlight": "văn bản ổn"}, "ko": {"language_note": "old"}, "zh": {"language_note": "old"}}}
    return db.table("clinics").insert({"name": PREFIX + slug, "slug": "pytest-c2-" + slug, "status": "published", "city": "Houston", "state": "TX", "zip_code": "77001",
                                       "address": "1 Main", "phone": "7135550100", "specialty": "Dentist", "languages": ["English", "Vietnamese"],
                                       "description": f"Offers dental care. {LEGACY}", "metadata": meta}).execute().data[0]


def fetch(db, slug="one"):
    return db.table("clinics").select("*").eq("slug", "pytest-c2-" + slug).single().execute().data


def test_cleanup_edits_audits_retranslates_only_what_changed_and_can_be_undone(db, monkeypatch):
    insert_legacy(db)
    llm = FakeLLM()
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    monkeypatch.setattr(gc, "_default_llm", llm)
    summary = content_cleanup.clean_clinics(db, target="pytest-c2-one", actor="telegram:111", log=lambda m: None)
    row = fetch(db)
    assert summary["cleaned"] == 1 and row["description"] == "Offers dental care."
    assert not gc.has_boilerplate(row["metadata"]["language_note"]) and "We speak Vietnamese" in row["metadata"]["language_note"]
    assert row["metadata"]["i18n"]["vi"]["language_note"].startswith("[vi]")  # the old translated template is gone
    assert row["metadata"]["i18n"]["vi"]["about_highlight"] == "văn bản ổn"  # an untouched text was not re-translated
    assert content_cleanup.plan_cleanup(row) is None  # idempotent

    clinic_edit.undo_clinic_edit("pytest-c2-one", "telegram:111", "vi")
    assert gc.has_boilerplate(fetch(db)["description"])  # undo brings the old text back


def test_cleanup_respects_the_limit_and_says_what_is_left(db, monkeypatch):
    for n in ("a", "b", "c"):
        insert_legacy(db, n)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    summary = content_cleanup.clean_clinics(db, target="all", limit=2, log=lambda m: None)
    mine = [fetch(db, n) for n in ("a", "b", "c")]
    assert summary["cleaned"] >= 2 and sum(1 for r in mine if gc.has_boilerplate(r["description"])) <= 1
    assert "Còn" in content_cleanup.format_summary({**summary, "left": 1}, "vi")


def test_editing_a_clinic_updates_its_translations_and_says_so(db, monkeypatch):
    insert_legacy(db)
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    monkeypatch.setattr(gc, "_default_llm", FakeLLM())
    plan = clinic_edit.plan_clinic_edit("pytest-c2-one", {"about_highlight": "Phòng khám nha khoa."}, "vi")
    assert any("sẽ được cập nhật tự động" in line for line in plan.lines)
    message = clinic_edit.apply_clinic_edit(plan, "telegram:111", "vi")
    assert "🌐" in message and fetch(db)["metadata"]["i18n"]["ko"]["about_highlight"].startswith("[ko]")


def test_when_translation_is_impossible_the_user_is_told(db, monkeypatch):
    insert_legacy(db)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    message = clinic_edit.apply_clinic_edit(clinic_edit.plan_clinic_edit("pytest-c2-one", {"about_highlight": "Text mới."}, "vi"), "telegram:111", "vi")
    assert "chưa được cập nhật" in message and fetch(db)["metadata"]["i18n"]["ko"].get("about_highlight") is None
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    monkeypatch.setattr(gc, "_default_llm", FakeLLM(fail_translation_for={"ko"}))
    message = clinic_edit.apply_clinic_edit(clinic_edit.plan_clinic_edit("pytest-c2-one", {"about_highlight": "Text khác."}, "vi"), "telegram:111", "vi")
    assert "Không dịch được sang: ko" in message


# --------------------------------------------------------------------------- the bot command

def test_clean_content_asks_before_it_edits_anything(tmp_path, monkeypatch):
    monkeypatch.setattr(telegram_bot, "MEMORY_PATH", str(tmp_path / "m.json"))
    monkeypatch.setattr(telegram_bot.TelegramBot, "start_anomaly_checker", lambda self: None)
    monkeypatch.setenv("TELEGRAM_ALLOWED_USER_IDS", "111")
    bot = telegram_bot.TelegramBot()
    bot.sent, bot.buttons = [], []
    bot.send_message = lambda chat_id, text, buttons=None: (bot.sent.append(text), bot.buttons.append(buttons))
    bot.chat_lang[1] = "vi"
    bot.handle_command(1, "/clean_content all 5", user_id=111)
    pending = bot.pending_actions[1]
    assert pending["type"] == "clean_clinic_content" and pending["limit"] == 5 and bot.buttons[-1]
    ran = []
    bot.run_job = lambda chat_id, name, fn, action_type="job", on_success=None: ran.append((name, action_type))
    bot.handle_chat(1, "approve", user_id=111)
    assert ran == [("clean_clinic_content: all", "clean_clinic_content")]
    bot.handle_command(1, "/clean_content", user_id=111)
    assert "Dùng:" in bot.sent[-1]


# --------------------------------------------------------------------------- the real rescan flow

def _rescan(db, monkeypatch, pages, llm):
    import rescan_all_clinics as rescan

    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    monkeypatch.setattr(gc, "_default_llm", llm)
    monkeypatch.setattr(rescan, "gather_website_data", lambda site: {"pages": pages})
    monkeypatch.setattr(rescan, "build_gallery", lambda *a, **k: {"images": [], "sources": {}, "images_source": "none", "primary_image_source": "none", "review": None})
    row = fetch(db)
    row["metadata"]["website"] = "https://anchor.test"
    return rescan.rescan_one_clinic(row)


def test_rescan_replaces_the_old_invented_content_with_what_the_website_supports(db, monkeypatch):
    row = insert_legacy(db)
    meta = {**row["metadata"], "faqs": [{"question": "Invented?", "answer": "Yes."}], "differentiators": [{"title": "Invented", "detail": "x"}],
            "cultural_context": LEGACY, "services_offered": [{"name": "Invented service"}]}
    db.table("clinics").update({"metadata": meta}).eq("id", row["id"]).execute()
    pages = [{"url": "https://anchor.test", "type": "home", "title": "Anchor", "content": SOURCE, "full_text": SOURCE}]
    _rescan(db, monkeypatch, pages, FakeLLM())
    saved = fetch(db)
    m = saved["metadata"]
    assert m["faqs"] == [] and m["differentiators"] == []  # sections the website does not support are emptied, not filled
    assert [s["name"] for s in m["services_offered"]] == ["Root canal therapy"]
    assert not gc.has_boilerplate(saved["description"]) and not gc.has_boilerplate(m["language_note"]) and "cultural_context" not in m
    assert m["language_note"].startswith("The clinic’s verified spoken languages are English and Vietnamese.")
    assert m["i18n"]["vi"]["language_note"].startswith("[vi]") and m["content_grounding"]["dropped_unsupported"]["services"] == 1


def test_rescan_with_no_website_text_keeps_what_the_clinic_has(db, monkeypatch):
    row = insert_legacy(db)
    llm = FakeLLM()
    _rescan(db, monkeypatch, [], llm)
    saved = fetch(db)
    assert llm.calls == [] and saved["description"] == row["description"]  # nothing to ground on: nothing was wiped or invented

"""
The draft/review workflow, against a REAL PostgreSQL (skipped when OPENCLAW_TEST_DATABASE_URL is unset).

Rules under test:
  * a NEW clinic created by the bot is a draft (hidden from the public site);
  * re-scraping an EXISTING clinic never changes its status (no hiding, no republishing);
  * a person can approve one / approve all / reject (archive) from the bot, and it is reversible.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

TEST_URL = os.environ.get("OPENCLAW_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_URL, reason="OPENCLAW_TEST_DATABASE_URL not set")

PREFIX = "PyTest Draft "


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", TEST_URL)
    import pg_client

    monkeypatch.setattr(pg_client, "_INSTANCE", None)
    client = pg_client.create_client()
    client.table("clinics").delete().ilike("name", PREFIX + "%").execute()
    yield client
    client.table("clinics").delete().ilike("name", PREFIX + "%").execute()
    client.close()


def _clinic(n, **extra):
    data = {
        "name": f"{PREFIX}{n}",
        "address": "1 Main St, Houston, TX 77001",
        "city": "Houston",
        "state": "TX",
        "zip_code": "77001",
        "phone": "7135550100",
        "specialty": "Dentist",
        "languages": ["English", "Vietnamese"],
    }
    data.update(extra)
    return data


def _status(client, n):
    row = client.table("clinics").select("status").eq("name", f"{PREFIX}{n}").single().execute().data
    return row["status"]


def test_new_clinic_is_saved_as_draft(env):
    import db

    clinic = _clinic(1)
    assert db.insert_clinic(clinic) is True
    assert _status(env, 1) == "draft"
    assert clinic["_saved"]["created"] is True and clinic["_saved"]["status"] == "draft"


@pytest.mark.parametrize("existing_status", ["published", "draft", "archived"])
def test_rescraping_an_existing_clinic_never_changes_its_status(env, existing_status):
    import db

    db.insert_clinic(_clinic(2))
    env.table("clinics").update({"status": existing_status}).eq("name", f"{PREFIX}2").execute()

    again = _clinic(2, phone="7135550199")
    assert db.insert_clinic(again) is True

    assert _status(env, 2) == existing_status  # unchanged
    assert again["_saved"]["created"] is False
    # and the scrape DID update the other fields
    row = env.table("clinics").select("phone").eq("name", f"{PREFIX}2").single().execute().data
    assert "199" in (row["phone"] or "")


def test_list_drafts_shows_only_drafts_and_flags_unverified_languages(env, capsys):
    import admin_actions
    import db

    db.insert_clinic(_clinic(3))
    db.insert_clinic(_clinic(4))
    env.table("clinics").update({"status": "published"}).eq("name", f"{PREFIX}4").execute()

    capsys.readouterr()  # drop the output of the inserts above
    admin_actions.list_draft_clinics(50)
    out = capsys.readouterr().out
    assert f"{PREFIX}3" in out
    assert f"{PREFIX}4" not in out
    assert "UNVERIFIED" in out
    assert "/approve_clinic" in out


def test_approve_and_reject_one_clinic(env, capsys):
    import admin_actions
    import db

    db.insert_clinic(_clinic(5))
    slug = env.table("clinics").select("slug").eq("name", f"{PREFIX}5").single().execute().data["slug"]

    admin_actions.set_clinic_status(slug, "published")
    assert _status(env, 5) == "published"
    assert f"/clinics/{slug}" in capsys.readouterr().out

    admin_actions.set_clinic_status(f"{PREFIX}5", "archived")  # reject by exact name
    assert _status(env, 5) == "archived"

    admin_actions.set_clinic_status(slug, "published")  # reversible
    assert _status(env, 5) == "published"


def test_setting_the_same_status_is_a_noop_message(env, capsys):
    import admin_actions
    import db

    db.insert_clinic(_clinic(6))
    admin_actions.set_clinic_status(f"{PREFIX}6", "draft")
    assert "already draft" in capsys.readouterr().out


def test_invalid_status_is_rejected_and_nothing_changes(env):
    import admin_actions
    import db

    db.insert_clinic(_clinic(7))
    with pytest.raises(ValueError):
        admin_actions.set_clinic_status(f"{PREFIX}7", "deleted")
    assert _status(env, 7) == "draft"


def test_unknown_clinic_is_reported_not_crashed(env, capsys):
    import admin_actions

    admin_actions.set_clinic_status("no-such-clinic-zzz", "published")
    assert "not found" in capsys.readouterr().out.lower()


def test_approve_all_publishes_only_drafts(env):
    import admin_actions
    import db

    for n in (8, 9, 10):
        db.insert_clinic(_clinic(n))
    env.table("clinics").update({"status": "archived"}).eq("name", f"{PREFIX}10").execute()

    admin_actions.approve_all_draft_clinics()

    assert _status(env, 8) == "published"
    assert _status(env, 9) == "published"
    assert _status(env, 10) == "archived"  # archived stays archived


def test_count_draft_clinics(env):
    import admin_actions
    import db

    before = admin_actions.count_draft_clinics()
    db.insert_clinic(_clinic(11))
    db.insert_clinic(_clinic(12))
    assert admin_actions.count_draft_clinics() == before + 2

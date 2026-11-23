"""
Removing one photo of a clinic: by address or position, with a preview, the file kept 30 days, undo with /clinic_undo.

Regression (screenshot): "remove this image /uploads/.../great-care-dental-web-1.webp on great-care-dental" was answered with
"I can't remove a specific image from the clinic's photo gallery with the available controls".
"""

import json
import os
import sys
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-token")

import clinic_edit  # noqa: E402
import clinic_photos  # noqa: E402
import intent_agent  # noqa: E402
import photo_admin  # noqa: E402
import telegram_bot  # noqa: E402

TEST_URL = os.environ.get("OPENCLAW_TEST_DATABASE_URL")
PREFIX = "PyTest Photos "
PHOTOS = [f"/uploads/generated-clinics/website/great-care-dental-web-{i}.webp" for i in range(1, 5)]


@pytest.fixture()
def env(tmp_path, monkeypatch):
    if not TEST_URL:
        pytest.skip("OPENCLAW_TEST_DATABASE_URL not set")
    monkeypatch.setenv("DATABASE_URL", TEST_URL)
    monkeypatch.delenv("REVALIDATE_SECRET", raising=False)
    monkeypatch.setattr(clinic_photos, "project_root", lambda: tmp_path)
    monkeypatch.setattr(photo_admin, "project_root", lambda: tmp_path)
    import pg_client

    monkeypatch.setattr(pg_client, "_INSTANCE", None)
    db = pg_client.create_client()
    db.table("clinics").delete().ilike("name", PREFIX + "%").execute()
    folder = tmp_path / "public" / "uploads" / "generated-clinics" / "website"
    folder.mkdir(parents=True)
    for url in PHOTOS:
        (tmp_path / "public" / url.lstrip("/")).write_bytes(b"IMG:" + url.encode())
    row = db.table("clinics").insert({
        "name": PREFIX + "Great Care Dental", "slug": "pytest-great-care-dental", "status": "published", "languages": ["English"], "city": "X", "state": "TX",
        "metadata": {"images": PHOTOS + ["https://hotlinked.test/x.jpg"], "image_sources": {PHOTOS[0]: "website", PHOTOS[1]: "website", PHOTOS[2]: "google", PHOTOS[3]: "google"},
                     "images_source": "mixed"}}).execute().data[0]
    yield db, tmp_path, row
    db.table("audit_log").delete().eq("target_id", str(row["id"])).execute()
    db.table("clinics").delete().ilike("name", PREFIX + "%").execute()
    db.close()


def meta(db, row):
    return db.table("clinics").select("metadata").eq("id", row["id"]).single().execute().data["metadata"]


def exists(root, url):
    return (root / "public" / url.lstrip("/")).is_file()


# --------------------------------------------------------------------------- choosing photos

def test_the_address_the_user_pasted_selects_the_photo_even_with_the_site_domain(env):
    plan = photo_admin.plan_removal("pytest-great-care-dental", urls=["https://asianhealthhub.com" + PHOTOS[0]])
    assert [(s["position"], s["url"]) for s in plan.selected] == [(1, PHOTOS[0])] and plan.total == 5
    assert photo_admin.plan_removal("pytest-great-care-dental", urls=['"' + PHOTOS[2] + '"']).selected[0]["position"] == 3


def test_the_domain_is_ignored_even_when_two_photos_share_a_file_name(env):
    db, root, row = env
    twin_a, twin_b = "/uploads/generated-clinics/website/twin.webp", "/uploads/generated-clinics/google-places/twin.webp"
    db.table("clinics").update({"metadata": {**meta(db, row), "images": [twin_a, twin_b]}}).eq("id", row["id"]).execute()
    plan = photo_admin.plan_removal("pytest-great-care-dental", urls=["https://asianhealthhub.com" + twin_b])
    assert plan.selected[0]["url"] == twin_b and plan.selected[0]["position"] == 2  # exact, not "ambiguous file name"
    with pytest.raises(clinic_edit.ClinicEditError, match="not in the gallery"):
        photo_admin.plan_removal("pytest-great-care-dental", urls=["twin.webp"])  # a bare name that matches two photos is refused


def test_positions_are_the_ones_shown_on_the_page_and_several_can_be_given(env):
    plan = photo_admin.plan_removal("pytest-great-care-dental", positions=[4, 2])
    assert [s["position"] for s in plan.selected] == [2, 4] and plan.selected[0]["source"] == "website"


def test_a_filename_alone_is_enough_when_it_is_unique(env):
    assert photo_admin.plan_removal("pytest-great-care-dental", urls=["great-care-dental-web-2.webp"]).selected[0]["url"] == PHOTOS[1]


@pytest.mark.parametrize("kwargs,fragment", [
    ({"urls": ["/uploads/generated-clinics/website/nope.webp"]}, "not in the gallery"),
    ({"positions": [9]}, "no photo 9"), ({"positions": [0]}, "no photo 0"), ({"positions": ["x"]}, "no photo x"), ({}, "Tell me which photo"),
])
def test_a_photo_that_does_not_exist_is_explained(env, kwargs, fragment):
    with pytest.raises(clinic_edit.ClinicEditError) as info:
        photo_admin.plan_removal("pytest-great-care-dental", **kwargs)
    assert fragment in str(info.value)
    assert any(w in info.value.text("vi").lower() for w in ("ảnh", "bạn"))


def test_an_unknown_clinic_is_explained():
    with pytest.raises(clinic_edit.ClinicEditError, match="No clinic matches"):
        photo_admin.plan_removal("zzz-no-such-clinic", positions=[1])


# --------------------------------------------------------------------------- removing

def test_removal_updates_the_gallery_keeps_the_file_in_the_trash_and_audits(env):
    db, root, row = env
    plan = photo_admin.plan_removal("pytest-great-care-dental", urls=[PHOTOS[0]])
    message = photo_admin.apply_removal(plan, "telegram:111", "en", root=root)
    m = meta(db, row)
    assert m["images"] == PHOTOS[1:] + ["https://hotlinked.test/x.jpg"] and PHOTOS[0] not in m["image_sources"]
    assert m["images_source"] == "mixed" and m["primary_image_source"] == "website"
    assert not exists(root, PHOTOS[0])  # gone from the public folder ...
    trashed = list((root / "public" / "uploads" / "_removed" / str(row["id"])).glob("*"))
    assert len(trashed) == 1 and trashed[0].read_bytes() == b"IMG:" + PHOTOS[0].encode()  # ... but not deleted
    assert "Removed 1 photo(s)" in message and "4 left" in message and "/clinic_undo pytest-great-care-dental" in message
    log = db.table("audit_log").select("actor,action,details").eq("target_id", str(row["id"])).execute().data
    assert log[0]["actor"] == "telegram:111" and log[0]["action"] == "clinic.photo.remove" and log[0]["details"]["removed"][0]["position"] == 1


def test_removing_the_cover_makes_the_next_photo_the_cover_and_the_label_follows(env):
    db, root, row = env
    photo_admin.apply_removal(photo_admin.plan_removal("pytest-great-care-dental", positions=[1, 2]), "t", "en", root=root)
    m = meta(db, row)
    assert m["images"][0] == PHOTOS[2] and m["primary_image_source"] == "google"
    photo_admin.apply_removal(photo_admin.plan_removal("pytest-great-care-dental", positions=[1, 2, 3]), "t", "en", root=root)
    m = meta(db, row)
    assert m["images"] == [] and m["images_source"] == "none"  # no photo at all: the site shows its neutral placeholder


def test_a_hotlinked_photo_is_removed_from_the_list_only(env):
    db, root, row = env
    photo_admin.apply_removal(photo_admin.plan_removal("pytest-great-care-dental", urls=["https://hotlinked.test/x.jpg"]), "t", "en", root=root)
    assert "https://hotlinked.test/x.jpg" not in meta(db, row)["images"] and all(exists(root, u) for u in PHOTOS)


def test_a_gallery_that_changed_after_the_preview_is_not_touched(env):
    db, root, row = env
    plan = photo_admin.plan_removal("pytest-great-care-dental", urls=[PHOTOS[0]])
    photo_admin.apply_removal(photo_admin.plan_removal("pytest-great-care-dental", urls=[PHOTOS[0]]), "t", "en", root=root)  # someone else got there first
    with pytest.raises(clinic_edit.ClinicEditError, match="changed after the preview"):
        photo_admin.apply_removal(plan, "t", "en", root=root)


def test_an_address_that_points_outside_the_uploads_folder_never_moves_anything(env):
    db, root, row = env
    secret = root / "secret.txt"
    secret.write_text("do not move")
    evil = "/uploads/../../secret.txt"
    db.table("clinics").update({"metadata": {**meta(db, row), "images": PHOTOS + [evil]}}).eq("id", row["id"]).execute()
    photo_admin.apply_removal(photo_admin.plan_removal("pytest-great-care-dental", urls=[evil]), "t", "en", root=root)
    assert secret.read_text() == "do not move"


def test_a_database_failure_puts_the_files_back(env, monkeypatch):
    db, root, row = env
    plan = photo_admin.plan_removal("pytest-great-care-dental", urls=[PHOTOS[0]])
    real = photo_admin._metadata_patch
    monkeypatch.setattr(photo_admin, "_metadata_patch", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    with pytest.raises(RuntimeError):
        photo_admin.apply_removal(plan, "t", "en", root=root)
    assert exists(root, PHOTOS[0]) and PHOTOS[0] in meta(db, row)["images"]
    monkeypatch.setattr(photo_admin, "_metadata_patch", real)


# --------------------------------------------------------------------------- undo

def test_clinic_undo_puts_the_photo_back_in_the_same_place(env):
    db, root, row = env
    photo_admin.apply_removal(photo_admin.plan_removal("pytest-great-care-dental", positions=[2, 3]), "telegram:111", "en", root=root)
    monkey_root = root
    clinic_edit_root = photo_admin.project_root  # the fixture already points it at tmp_path
    assert clinic_edit_root() == monkey_root
    message = clinic_edit.undo_clinic_edit("pytest-great-care-dental", "telegram:111", "en")
    m = meta(db, row)
    assert m["images"] == PHOTOS + ["https://hotlinked.test/x.jpg"] and "Restored 2 photo(s)" in message
    assert all(exists(root, u) for u in PHOTOS) and m["image_sources"][PHOTOS[2]] == "google"
    with pytest.raises(clinic_edit.ClinicEditError, match="No edit"):
        clinic_edit.undo_clinic_edit("pytest-great-care-dental", "telegram:111", "en")  # not twice


def test_undo_never_brings_back_a_photo_whose_file_is_gone_for_good(env):
    db, root, row = env
    photo_admin.apply_removal(photo_admin.plan_removal("pytest-great-care-dental", urls=[PHOTOS[0]]), "t", "en", root=root)
    for trashed in (root / "public" / "uploads" / "_removed").rglob("*"):
        if trashed.is_file():
            trashed.unlink()
    with pytest.raises(clinic_edit.ClinicEditError, match="no longer available"):
        clinic_edit.undo_clinic_edit("pytest-great-care-dental", "t", "en")
    assert PHOTOS[0] not in meta(db, row)["images"]


def test_an_older_text_edit_is_undone_after_the_photo_removal_is_undone(env):
    db, root, row = env
    clinic_edit.apply_clinic_edit(clinic_edit.plan_clinic_edit("pytest-great-care-dental", {"phone": "7135550100"}), "t", "en")
    photo_admin.apply_removal(photo_admin.plan_removal("pytest-great-care-dental", positions=[1]), "t", "en", root=root)
    clinic_edit.undo_clinic_edit("pytest-great-care-dental", "t", "en")  # the newest change first: the photo
    assert PHOTOS[0] in meta(db, row)["images"]
    clinic_edit.undo_clinic_edit("pytest-great-care-dental", "t", "en")  # then the phone number
    assert db.table("clinics").select("phone").eq("id", row["id"]).single().execute().data["phone"] in (None, "")


def test_trash_older_than_thirty_days_is_purged_and_recent_trash_is_kept(env):
    db, root, row = env
    photo_admin.apply_removal(photo_admin.plan_removal("pytest-great-care-dental", positions=[1, 2]), "t", "en", root=root)
    files = sorted((root / "public" / "uploads" / "_removed").rglob("*web-*"))
    old = time.time() - 31 * 86400
    os.utime(files[0], (old, old))
    assert photo_admin.purge_trash(root) == 1 and not files[0].exists() and files[1].exists()


# --------------------------------------------------------------------------- the bot

@pytest.fixture()
def bot(env, monkeypatch):
    db, root, row = env
    monkeypatch.setattr(telegram_bot, "MEMORY_PATH", str(root / "m.json"))
    monkeypatch.setattr(telegram_bot.TelegramBot, "start_anomaly_checker", lambda self: None)
    monkeypatch.setenv("TELEGRAM_ALLOWED_USER_IDS", "111")
    b = telegram_bot.TelegramBot()
    b.sent, b.buttons, b.albums, b.api = [], [], [], []
    b.send_message = lambda chat_id, text, buttons=None: (b.sent.append(text), b.buttons.append(buttons))
    b.send_photo_album = lambda chat_id, items: b.albums.append(items)
    b.send_long_message = lambda chat_id, text, max_chunks=None: b.sent.append(text)
    b.request = lambda method, payload=None: b.api.append((method, payload)) or {"ok": True}
    b.chat_lang[1] = "en"
    return b


def wait(predicate, timeout=4.0):
    end = time.time() + timeout
    while time.time() < end:
        if predicate():
            return True
        time.sleep(0.02)
    return False


def test_photos_command_shows_a_numbered_album_with_one_remove_button_per_photo(bot):
    bot.handle_command(1, "/photos pytest-great-care-dental", user_id=111)
    assert [c for _, c in bot.albums[0]] == ["1", "2", "3", "4", "5"] and bot.albums[0][0][0] == PHOTOS[0]
    rows = bot.buttons[-1]
    assert [label for row in rows for label, _ in row] == ["🗑 1", "🗑 2", "🗑 3", "🗑 4", "🗑 5"]
    assert all(len(data.encode()) <= 64 for row in rows for _, data in row)
    bot.handle_command(1, "/photos", user_id=111)  # the clinic in focus is remembered
    assert len(bot.albums) == 2


def press(bot, data, user=111):
    bot.handle_callback({"id": "c", "from": {"id": user}, "message": {"chat": {"id": 1}, "message_id": 5}, "data": data})


def test_tapping_the_bin_shows_that_photo_and_asks_before_removing_it(bot, env):
    db, root, row = env
    bot.handle_command(1, "/photos pytest-great-care-dental", user_id=111)
    press(bot, bot.buttons[-1][0][1][1])  # 🗑 2
    assert bot.albums[-1] == [(PHOTOS[1], "🗑 2")]  # the picture about to go is shown
    pending = bot.pending_actions[1]
    assert pending["type"] == "remove_clinic_photo" and pending["plan"]["selected"][0]["url"] == PHOTOS[1]
    assert "Remove 1 photo(s)" in bot.sent[-1] and "4 left" in bot.sent[-1] and bot.buttons[-1]
    assert PHOTOS[1] in meta(db, row)["images"]  # nothing happens before the approval
    bot.handle_chat(1, "approve", user_id=111)  # (the quick "approve" needs no model)
    assert wait(lambda: PHOTOS[1] not in meta(db, row)["images"]) and any("Removed 1 photo(s)" in m for m in bot.sent)


def test_a_stale_button_removes_the_photo_it_was_made_for_not_whatever_moved_into_its_place(bot, env):
    db, root, row = env
    bot.handle_command(1, "/photos pytest-great-care-dental", user_id=111)
    bin_for_photo_3 = bot.buttons[-1][0][2][1]
    photo_admin.apply_removal(photo_admin.plan_removal("pytest-great-care-dental", positions=[1]), "t", "en", root=root)  # positions shift
    press(bot, bin_for_photo_3)
    assert bot.pending_actions[1]["plan"]["selected"][0]["url"] == PHOTOS[2]


def test_a_stranger_cannot_use_the_bin_buttons(bot):
    bot.handle_command(1, "/photos pytest-great-care-dental", user_id=111)
    press(bot, bot.buttons[-1][0][0][1], user=999)
    assert 1 not in bot.pending_actions


def test_the_exact_request_from_the_screenshot_is_understood(bot, env, monkeypatch):
    db, root, row = env
    monkeypatch.setattr(telegram_bot, "run_agent", lambda *a, **k: intent_agent.IntentResult(
        action="remove_clinic_photo", lang="en", requires_approval=True,
        parameters={"target": "pytest-great-care-dental", "image_url": PHOTOS[0]}))
    bot.handle_chat(1, f'remove this image "{PHOTOS[0]}" on "pytest-great-care-dental" clinic', user_id=111)
    assert bot.albums[-1] == [(PHOTOS[0], "🗑 1")] and bot.pending_actions[1]["type"] == "remove_clinic_photo"
    monkeypatch.setattr(telegram_bot, "run_agent", intent_agent.run_intent_agent)  # the real quick-approval path
    bot.handle_chat(1, "approve", user_id=111)
    assert wait(lambda: PHOTOS[0] not in meta(db, row)["images"])


def test_a_wrong_photo_or_clinic_is_explained_without_a_confirmation(bot, monkeypatch):
    monkeypatch.setattr(telegram_bot, "run_agent", lambda *a, **k: intent_agent.IntentResult(
        action="remove_clinic_photo", lang="en", requires_approval=True, parameters={"target": "pytest-great-care-dental", "positions": [99]}))
    bot.handle_chat(1, "remove photo 99", user_id=111)
    assert "no photo 99" in bot.sent[-1] and 1 not in bot.pending_actions and bot.albums == []


def test_no_clinic_named_means_the_bot_asks(bot, monkeypatch):
    monkeypatch.setattr(telegram_bot, "run_agent", lambda *a, **k: intent_agent.IntentResult(
        action="remove_clinic_photo", lang="en", requires_approval=True, parameters={"target": "", "positions": [1]}))
    bot.chat_focus.pop(1, None)
    bot.handle_chat(1, "remove the first photo", user_id=111)
    assert "Which clinic" in bot.sent[-1] and 1 not in bot.pending_actions


# --------------------------------------------------------------------------- the real album upload (Telegram is faked)

@pytest.fixture()
def real_bot(env, monkeypatch):
    db, root, row = env
    monkeypatch.setattr(telegram_bot, "MEMORY_PATH", str(root / "m2.json"))
    monkeypatch.setattr(telegram_bot.TelegramBot, "start_anomaly_checker", lambda self: None)
    monkeypatch.setenv("TELEGRAM_ALLOWED_USER_IDS", "111")
    b = telegram_bot.TelegramBot()
    b.requests_seen, b.single = [], []

    class Response:
        def raise_for_status(self):
            if getattr(b, "post_fails", False):
                raise RuntimeError("telegram said no")

    import requests

    monkeypatch.setattr(requests, "post", lambda url, data=None, files=None, timeout=0: b.requests_seen.append((url, data, sorted((files or {}).keys()))) or Response())
    b.send_photo = lambda chat_id, path, caption="": b.single.append((path, caption))
    b.request = lambda method, payload=None: b.single.append((method, payload)) or {"ok": True}
    return b, root


def test_an_album_is_uploaded_as_one_media_group_with_local_files_attached_and_remote_ones_by_address(real_bot):
    bot, root = real_bot
    bot.send_photo_album(1, [(PHOTOS[0], "1"), (PHOTOS[1], "2"), ("https://hotlinked.test/x.jpg", "3")])
    (url, data, files), = bot.requests_seen
    assert url.endswith("/sendMediaGroup") and files == ["photo0", "photo1"] and data["chat_id"] == "1"
    media = json.loads(data["media"])
    assert [m["caption"] for m in media] == ["1", "2", "3"]
    assert media[0]["media"] == "attach://photo0" and media[2]["media"] == "https://hotlinked.test/x.jpg"


def test_more_than_ten_photos_are_split_into_albums_of_ten_and_a_lone_photo_is_sent_alone(real_bot):
    bot, root = real_bot
    bot.send_photo_album(1, [(PHOTOS[i % 4], str(i + 1)) for i in range(11)])
    assert [len(json.loads(d["media"])) for _, d, _ in bot.requests_seen] == [10]  # the 11th goes alone
    assert [c for _, c in bot.single] == ["11"]


def test_when_telegram_rejects_the_album_the_photos_are_sent_one_by_one(real_bot):
    bot, root = real_bot
    bot.post_fails = True
    bot.send_photo_album(1, [(PHOTOS[0], "1"), (PHOTOS[1], "2")])
    assert [c for _, c in bot.single] == ["1", "2"]

"""
Scout data quality: photos that really exist, no fake images, no invented languages, the right Google place.

Regressions covered (from production):
  * 5 photos in the database, 5 "404 Not Found" on the site (storage reported success for files it never wrote;
    rescan kept the dead addresses and reported the source as "None");
  * the scout added the required language to clinics whose website never mentions it;
  * the first Google search hit was used even when it was a different business;
  * an AI-generated "clinic interior" was saved as the clinic's photo.
"""

import io
import json
import os
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-token")

import clinic_photos  # noqa: E402
import google_places  # noqa: E402
import normalize  # noqa: E402
import quality_report  # noqa: E402
import storage  # noqa: E402

TEST_URL = os.environ.get("OPENCLAW_TEST_DATABASE_URL")


def photo(seed: int, size=(900, 650)) -> bytes:
    """A real-looking (noisy, distinct) JPEG that passes the quality gates."""
    from PIL import Image

    rng = random.Random(seed)
    img = Image.frombytes("RGB", size, bytes(rng.randrange(256) for _ in range(size[0] * size[1] * 3)))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=90)
    return out.getvalue()


@pytest.fixture()
def root(tmp_path, monkeypatch):
    (tmp_path / "public" / "uploads").mkdir(parents=True)
    monkeypatch.setattr(clinic_photos, "project_root", lambda: tmp_path)
    monkeypatch.setattr(storage, "get_uploads_dir", lambda: str(tmp_path / "public" / "uploads"))
    return tmp_path


# --------------------------------------------------------------------------- storage never lies

def test_a_failed_write_returns_nothing_instead_of_a_url_to_a_missing_file(tmp_path, monkeypatch):
    blocker = tmp_path / "not-a-folder"
    blocker.write_text("x")  # a file where a directory is needed: the write must fail
    monkeypatch.setattr(storage, "get_uploads_dir", lambda: str(blocker))
    assert storage.upload_image_bytes(b"abc", "generated-clinics/x.webp", "image/webp") is None


def test_a_successful_write_returns_the_url_of_a_file_that_exists(root):
    url = storage.upload_image_bytes(b"abc", "generated-clinics/x.webp", "image/webp")
    assert url == "/uploads/generated-clinics/x.webp" and clinic_photos.local_file_exists(url, root)


# --------------------------------------------------------------------------- finding dead photos

def test_files_that_do_not_exist_are_reported_as_broken(root):
    (root / "public" / "uploads" / "ok.jpg").write_bytes(b"data")
    (root / "public" / "uploads" / "empty.jpg").write_bytes(b"")
    usable, broken = clinic_photos.split_images(["/uploads/ok.jpg", "/uploads/gone.jpg", "/uploads/empty.jpg", "https://x.test/a.jpg"], root)
    assert usable == ["/uploads/ok.jpg", "https://x.test/a.jpg"] and broken == ["/uploads/gone.jpg", "/uploads/empty.jpg"]


def test_repair_drops_dead_photos_and_never_keeps_them_just_in_case(root):
    meta = {"images": [f"/uploads/generated-clinics/google-places/vasc-google-{i}.webp" for i in range(1, 6)]}
    fix = clinic_photos.repair_gallery("vasc", meta, root, fetcher=None)
    assert fix["images"] == [] and fix["images_source"] == "none" and len(fix["removed"]) == 5


def test_repair_refills_from_the_known_google_place_with_quality_gates(root, monkeypatch):
    pics = {f"https://g.test/{i}": photo(i) for i in range(3)}
    pics["https://g.test/logo"] = photo(99, size=(120, 120))  # too small: a logo/icon, rejected
    monkeypatch.setattr(clinic_photos, "download", lambda url, referer=None, timeout=7: pics.get(url))
    meta = {"images": ["/uploads/generated-clinics/google-places/vasc-google-1.webp"]}
    fix = clinic_photos.repair_gallery("vasc", meta, root, fetcher=lambda: list(pics))
    assert len(fix["images"]) == 3 and fix["images_source"] == "google"
    assert all(clinic_photos.local_file_exists(u, root) for u in fix["images"])  # and they really exist this time


def test_a_healthy_clinic_is_left_alone(root):
    (root / "public" / "uploads" / "a.jpg").write_bytes(b"data")
    assert clinic_photos.repair_gallery("x", {"images": ["/uploads/a.jpg"]}, root, fetcher=lambda: ["boom"]) is None


def test_prune_dead_images_updates_the_source_label(root):
    (root / "public" / "uploads" / "a.jpg").write_bytes(b"data")
    meta = {"images": ["/uploads/a.jpg", "/uploads/gone.jpg"], "image_sources": {"/uploads/a.jpg": "website", "/uploads/gone.jpg": "google"}}
    assert clinic_photos.prune_dead_images(meta, root) == ["/uploads/gone.jpg"]
    assert meta["images"] == ["/uploads/a.jpg"] and meta["images_source"] == "website"
    meta = {"images": ["/uploads/gone.jpg"]}
    clinic_photos.prune_dead_images(meta, root)
    assert meta["images"] == [] and meta["images_source"] == "none"  # not None, not the stale list


# --------------------------------------------------------------------------- photos for a new clinic

def test_website_photos_come_first_google_fills_the_gaps_and_logos_are_dropped(root, monkeypatch):
    pics = {"https://site.test/hero.jpg": photo(1), "https://site.test/logo.png": photo(2, size=(150, 60)),
            "https://g.test/1": photo(3), "https://g.test/2": photo(4)}
    monkeypatch.setattr(clinic_photos, "download", lambda url, referer=None, timeout=7: pics.get(url))
    data = {"name": "VASC Clinic", "website": "https://site.test", "_google_photo_names": ["places/x/photos/1"]}
    monkeypatch.setattr("google_places.get_google_places_key", lambda: "k")
    monkeypatch.setattr("google_places.photo_uris", lambda names, key, limit=8: ["https://g.test/1", "https://g.test/2"])
    clinic_photos.attach_real_photos(data, website_images=["https://site.test/logo.png", "https://site.test/hero.jpg"], log=lambda m: None)
    sources = [data["image_sources"][u] for u in data["images"]]
    assert sources == ["website", "google", "google"] and data["images_source"] == "mixed"
    assert data["primary_image_source"] == "website" and "_google_photo_names" not in data
    assert all(u.startswith("/uploads/") and clinic_photos.local_file_exists(u, root) for u in data["images"])


def test_no_real_photo_means_none_never_a_generated_one(root, monkeypatch):
    monkeypatch.setattr(clinic_photos, "download", lambda *a, **k: None)
    data = {"name": "No Photos Clinic"}
    clinic_photos.attach_real_photos(data, website_images=["https://site.test/a.jpg"], log=lambda m: None)
    assert data["images"] == [] and data["images_source"] == "none"
    import image_generator

    assert not hasattr(image_generator, "generate_clinic_image")  # fake clinic photos no longer exist at all


# --------------------------------------------------------------------------- the right Google place

CLINIC = {"name": "Vietnamese American Service Center (VASC)", "website": "https://www.vascsj.org/", "phone": "(408) 518-6200", "zip_code": "95122"}


def place(name, site="", phone="", address=""):
    return {"displayName": {"text": name}, "websiteUri": site, "nationalPhoneNumber": phone, "formattedAddress": address}


def test_a_place_with_the_same_website_is_accepted():
    assert google_places.place_matches(CLINIC, place("Vietnamese American Service Center", site="https://vascsj.org/contact"))[0]


def test_a_place_with_the_same_phone_or_zip_is_accepted():
    assert google_places.place_matches(CLINIC, place("VASC Vietnamese American Service Center", phone="(408) 518-6200"))[0]
    assert google_places.place_matches(CLINIC, place("Vietnamese American Service Center", address="2072 Lucretia Ave, San Jose, CA 95122"))[0]


def test_a_different_business_is_rejected_even_if_it_is_the_first_hit():
    assert not google_places.place_matches(CLINIC, place("Starbucks", site="https://starbucks.com"))[0]


def test_a_different_name_is_rejected_even_when_the_phone_matches():
    """A shared number (a hospital switchboard, a building) must not attach someone else's photos and reviews."""
    ok, reason = google_places.place_matches(CLINIC, place("Regional Medical Pavilion Pharmacy", phone="(408) 518-6200"))
    assert not ok and "different name" in reason


def test_a_similar_name_with_nothing_else_in_common_is_rejected():
    ok, reason = google_places.place_matches(CLINIC, place("Vietnamese American Service Center", site="https://other.org", phone="(213) 000-0000", address="1 Main St, LA 90001"))
    assert not ok and "do not agree" in reason


def test_text_search_skips_wrong_hits_and_returns_the_real_clinic(monkeypatch):
    payload = {"places": [place("Vietnamese American Service Center", site="https://wrong.org", phone="(111) 111-1111"),
                          {**place("Vietnamese American Service Center", site="https://vascsj.org"), "id": "REAL"}]}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return json.dumps(payload).encode()

    monkeypatch.setattr(google_places, "urlopen", lambda *a, **k: Response())
    assert google_places.text_search_place(CLINIC, "k")["id"] == "REAL"
    payload["places"] = payload["places"][:1]
    assert google_places.text_search_place(CLINIC, "k") is None


def test_enrichment_uses_the_given_place_id_and_does_not_search_by_name(monkeypatch):
    monkeypatch.setattr(google_places, "get_google_places_key", lambda: "k")
    monkeypatch.setattr(google_places, "text_search_place", lambda *a, **k: pytest.fail("must not search by name"))
    monkeypatch.setattr(google_places, "get_place_details", lambda pid, key: {"id": pid, "rating": 4.3, "photos": [{"name": "places/x/photos/1"}, {"name": "places/x/photos/2"}]})
    monkeypatch.setattr(google_places, "summarize_reviews_with_ai", lambda *a, **k: None)
    monkeypatch.setattr(google_places, "upload_place_photos", lambda *a, **k: pytest.fail("photos must not be uploaded unfiltered"))
    data = google_places.enrich_clinic_with_google_places({"name": "VASC"}, place_id="PID", upload_photos=False)
    assert data["google_metadata"]["google_place_id"] == "PID" and data["_google_photo_names"] == ["places/x/photos/1", "places/x/photos/2"]


def test_a_rejected_match_is_recorded_not_silently_used(monkeypatch):
    monkeypatch.setattr(google_places, "get_google_places_key", lambda: "k")
    monkeypatch.setattr(google_places, "text_search_place", lambda *a, **k: None)
    data = google_places.enrich_clinic_with_google_places({"name": "VASC"})
    assert data["google_metadata"]["google_match"] == "rejected" and "images" not in data


# --------------------------------------------------------------------------- scoring and the scorecard

def test_quality_counts_only_real_photos_and_verified_languages():
    base = {"name": "A", "specialty": "Dental", "address": "x", "city": "c", "state": "TX", "phone": "p"}
    fake = normalize.compute_quality({**base, "images": ["/uploads/generated-clinics/a-vasc.webp"], "languages": ["English", "Vietnamese"]})
    real = normalize.compute_quality({**base, "images": ["/uploads/generated-clinics/website/a-web-1.jpg"], "images_source": "website",
                                      "languages": ["English", "Vietnamese"], "languages_verified": True})
    assert "real photos" in fake["missing"] and "real photos" not in real["missing"]
    assert real["score"] > fake["score"]
    unverified = normalize.compute_quality({**base, "languages": ["English", "Vietnamese"], "languages_verified": False})
    assert "verified languages" in unverified["missing"]


def test_the_scorecard_finds_the_problems_of_each_clinic():
    exists = lambda url: url == "/uploads/ok.jpg"  # noqa: E731
    rows = [
        {"slug": "dead", "status": "published", "description": "x" * 200, "metadata": {"images": ["/uploads/gone.jpg"], "languages_verified": True,
         "working_hours": {"mon": "9"}, "services": ["a"], "i18n": {"vi": {}, "ko": {}, "zh": {}}}},
        {"slug": "flagged", "status": "draft", "description": "short", "metadata": {"images": ["/uploads/ok.jpg", "https://x.test/a.jpg"],
         "images_source": "website", "language_verified_on_website": False,
         "language_note": "Older adults may be able to communicate directly with the clinic without relying on a family member."}},
    ]
    problems = {r["slug"]: quality_report.analyze_clinic(r, file_exists=exists) for r in rows}
    assert {"broken_photo_file", "no_real_photo"} <= set(problems["dead"]) and "languages_unverified" not in problems["dead"]
    assert {"hotlinked_photo", "scout_language_flag", "generic_content", "short_description", "no_hours", "missing_translation"} <= set(problems["flagged"])
    report = quality_report.build_report(rows, file_exists=exists)
    assert report["total"] == 2 and report["by_status"] == {"published": 1, "draft": 1}
    assert report["worst"][0]["slug"] == "dead"  # a visitor-facing error comes first
    text = quality_report.format_report(report, "vi")
    assert "file không tồn tại" in text and "/repair_clinic_images" in text and "`dead`" in text


# --------------------------------------------------------------------------- the whole scout run (real PostgreSQL)

PREFIX = "PyTest Scout "


@pytest.fixture()
def scout(monkeypatch, root):
    if not TEST_URL:
        pytest.skip("OPENCLAW_TEST_DATABASE_URL not set")
    monkeypatch.setenv("DATABASE_URL", TEST_URL)
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    import pg_client
    import run_scout

    monkeypatch.setattr(pg_client, "_INSTANCE", None)
    db = pg_client.create_client()
    db.table("clinics").delete().ilike("name", PREFIX + "%").execute()

    state = {"text": "We are a friendly dental office in Houston. English spoken.", "ai_calls": 0}
    monkeypatch.setattr(run_scout, "get_google_places_key", lambda: "k")
    monkeypatch.setattr(run_scout, "search_places_by_text", lambda *a, **k: [{
        "id": "PLACE1", "displayName": {"text": PREFIX + "Dental"}, "websiteUri": "https://site.test", "types": ["dentist"]}])
    monkeypatch.setattr(run_scout, "_load_existing_clinic_keys", lambda: (set(), set()))
    monkeypatch.setattr(run_scout, "scrape_content_from_url", lambda url: {"markdown_content": state["text"], "images": ["https://site.test/hero.jpg"]})
    monkeypatch.setattr(run_scout, "extract_clinic_data", lambda name, content: {
        "name": name, "specialty": "Dentist", "city": "Houston", "state": "TX", "zip_code": "77001", "address": "1 Main St",
        "phone": "7135550100", "languages": list(state.get("langs", ["English"])), "description": "A dental office. " * 15})
    monkeypatch.setattr(run_scout, "merge_deterministic_contacts", lambda data, content: data)
    seen = {}
    monkeypatch.setattr(run_scout, "enrich_clinic_with_google_places",
                        lambda data, place_id=None, upload_photos=True: seen.update(place_id=place_id, upload=upload_photos) or {**data, "_google_photo_names": []})
    monkeypatch.setattr(run_scout, "enrich_missing_with_brave", lambda data: data)
    monkeypatch.setattr(run_scout, "enrich_clinic_with_third_party_profiles", lambda data: data)
    monkeypatch.setattr(clinic_photos, "download", lambda url, referer=None, timeout=7: photo(7) if url.endswith("hero.jpg") else None)
    state["seen"] = seen
    yield run_scout, db, state
    db.table("clinics").delete().ilike("name", PREFIX + "%").execute()
    db.close()


def _saved(db):
    return db.table("clinics").select("*").ilike("name", PREFIX + "%").single().execute().data


def test_a_required_language_the_website_never_mentions_is_not_added(scout):
    run_scout, db, state = scout
    run_scout.run_scout_pipeline("Vietnamese dentist Houston", limit=1, required_languages=["Vietnamese"])
    row = _saved(db)
    assert row["status"] == "draft"
    assert "Vietnamese" not in row["languages"]  # the old code injected it
    assert row["metadata"]["languages_verified"] is False and row["metadata"]["language_verified_on_website"] is False
    assert row["metadata"]["scout_required_languages"] == ["Vietnamese"]


def test_a_language_the_website_does_mention_is_kept_and_verified(scout):
    run_scout, db, state = scout
    state["text"] = "We are a dental office in Houston. Vietnamese is spoken by our staff. Se habla español."
    state["langs"] = ["English", "Vietnamese"]
    run_scout.run_scout_pipeline("Vietnamese dentist Houston", limit=1, required_languages=["Vietnamese"])
    row = _saved(db)
    assert "Vietnamese" in row["languages"] and row["metadata"]["languages_verified"] is True
    assert any("Vietnamese" in e for e in row["metadata"]["languages_evidence"])


def test_the_scout_uses_the_exact_place_and_stores_real_filtered_photos(scout, root):
    run_scout, db, state = scout
    run_scout.run_scout_pipeline("dentist Houston", limit=1)
    assert state["seen"] == {"place_id": "PLACE1", "upload": False}
    row = _saved(db)
    images = row["metadata"]["images"]
    assert images and all(u.startswith("/uploads/") and clinic_photos.local_file_exists(u, root) for u in images)
    assert row["metadata"]["images_source"] == "website" and row["metadata"]["primary_image_source"] == "website"


def test_a_clinic_without_any_real_photo_is_saved_without_photos(scout, monkeypatch):
    run_scout, db, state = scout
    monkeypatch.setattr(clinic_photos, "download", lambda *a, **k: None)
    run_scout.run_scout_pipeline("dentist Houston", limit=1)
    row = _saved(db)
    assert not row["metadata"].get("images") and row["metadata"]["images_source"] == "none"


def test_repair_all_drops_dead_photos_in_the_database(scout, monkeypatch, root):
    import pg_client
    import repair_clinic_images

    run_scout, db, state = scout
    row = db.table("clinics").insert({"name": PREFIX + "Dead", "slug": "pytest-scout-dead", "status": "published", "languages": ["English"], "city": "X", "state": "TX",
                                      "metadata": {"images": ["/uploads/generated-clinics/google-places/gone-google-1.webp"]}}).execute().data[0]
    monkeypatch.setattr(pg_client, "_INSTANCE", None)
    summary = repair_clinic_images.repair_all(fetch_google=False, log=lambda m: None)
    fixed = db.table("clinics").select("metadata").eq("id", row["id"]).single().execute().data["metadata"]
    assert fixed["images"] == [] and fixed["images_source"] == "none" and summary["photos_dropped"] >= 1

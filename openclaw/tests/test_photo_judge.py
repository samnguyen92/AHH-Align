"""
The vision review of clinic photos: what it keeps and rejects, and, as important, that it stays cheap and bounded
(one call per clinic, shrunk photos, cache, daily limit, honest token counts, never breaks the pipeline).
"""

import base64
import io
import json
import os
import random
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import clinic_photos  # noqa: E402
import photo_judge  # noqa: E402
import photo_review  # noqa: E402
import quality_report  # noqa: E402

TEST_URL = os.environ.get("OPENCLAW_TEST_DATABASE_URL")


def photo(seed: int, size=(900, 650)) -> bytes:
    from PIL import Image

    rng = random.Random(seed)
    img = Image.frombytes("RGB", size, bytes(rng.randrange(256) for _ in range(size[0] * size[1] * 3)))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=90)
    return out.getvalue()


def answer(*items, tokens=(1200, 150), finish="stop"):
    """A scripted model answer: items are (category, quality) per image, in order."""
    body = {"images": [{"index": i, "category": c, "quality": q, "reason": f"r{i}"} for i, (c, q) in enumerate(items, start=1)]}
    return types.SimpleNamespace(
        choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps(body)), finish_reason=finish)],
        usage=types.SimpleNamespace(prompt_tokens=tokens[0], completion_tokens=tokens[1]),
    )


class FakeVision:
    def __init__(self, *script):
        self.script, self.calls = list(script), []
        outer = self

        class Completions:
            def create(self, **kwargs):
                outer.calls.append(kwargs)
                item = outer.script.pop(0)
                if isinstance(item, Exception):
                    raise item
                return item

        self.chat = types.SimpleNamespace(completions=Completions())


@pytest.fixture(autouse=True)
def vision_on(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("OPENCLAW_VISION", raising=False)
    monkeypatch.setattr(photo_judge, "CACHE_DIR", tmp_path / "cache")  # never touch the real cache
    monkeypatch.setattr(photo_judge, "DAILY_IMAGE_LIMIT", 400)


CLINIC = {"name": "Anchor Dental", "specialty": "Dentist", "city": "Houston", "state": "TX"}


# --------------------------------------------------------------------------- decisions

def test_only_photos_of_the_place_with_decent_quality_are_kept():
    keep = ["exterior", "interior_reception", "interior_treatment", "equipment", "staff_professional"]
    reject = ["logo_or_icon", "text_graphic", "map_or_screenshot", "food_or_product", "people_candid", "other_business", "other", "nonsense"]
    assert all(photo_judge._decide({"category": c, "quality": 4})["keep"] for c in keep)
    assert not any(photo_judge._decide({"category": c, "quality": 5})["keep"] for c in reject)
    assert not photo_judge._decide({"category": "exterior", "quality": 2})["keep"]  # blurry / dark
    assert not photo_judge._decide({"category": "exterior", "quality": "x"})["keep"]  # garbage never counts as good


def test_the_best_photo_of_the_place_goes_first_and_rejects_are_listed():
    verdicts = {k: photo_judge._decide(v) for k, v in {
        "a": {"category": "equipment", "quality": 5}, "b": {"category": "exterior", "quality": 3}, "c": {"category": "exterior", "quality": 5},
        "d": {"category": "food_or_product", "quality": 5}}.items()}
    kept, rejected = photo_judge.order_and_filter(["a", "b", "c", "d", "unknown"], verdicts)
    assert kept == ["c", "b", "a", "unknown"]  # sharper exterior first; a photo the model skipped is not thrown away
    assert [r["key"] for r in rejected] == ["d"] and rejected[0]["category"] == "food_or_product"


# --------------------------------------------------------------------------- cost: one call, small photos

def test_one_request_per_clinic_with_shrunk_low_detail_photos():
    fake = FakeVision(answer(("exterior", 4), ("interior_reception", 4), ("logo_or_icon", 5)))
    result = photo_judge.judge_photos(CLINIC, [("a", photo(1, (2400, 1600))), ("b", photo(2)), ("c", photo(3))], client=fake, log=lambda m: None)
    assert len(fake.calls) == 1  # NOT one per photo
    parts = [p for p in fake.calls[0]["messages"][1]["content"] if p["type"] == "image_url"]
    assert len(parts) == 3 and all(p["image_url"]["detail"] == "low" for p in parts)
    from PIL import Image

    side = max(Image.open(io.BytesIO(base64.b64decode(parts[0]["image_url"]["url"].split(",", 1)[1]))).size)
    assert side <= 512  # a 2400 px photo is never uploaded at full size (literal on purpose: not the constant under test)
    assert result["judged"] == 3 and result["tokens_in"] == 1200 and result["tokens_out"] == 150
    assert [result["verdicts"][k]["keep"] for k in "abc"] == [True, True, False]


def test_at_most_ten_photos_are_sent_per_clinic():
    fake = FakeVision(answer(*[("exterior", 4)] * photo_judge.MAX_IMAGES_PER_CALL))
    photo_judge.judge_photos(CLINIC, [(str(i), photo(i)) for i in range(15)], client=fake, log=lambda m: None)
    assert sum(1 for p in fake.calls[0]["messages"][1]["content"] if p["type"] == "image_url") == photo_judge.MAX_IMAGES_PER_CALL


def test_a_photo_judged_before_is_never_paid_for_again():
    first = FakeVision(answer(("exterior", 4), ("logo_or_icon", 5)))
    photos = [("a", photo(1)), ("b", photo(2))]
    photo_judge.judge_photos(CLINIC, photos, client=first, log=lambda m: None)
    second = FakeVision()  # an empty script: any call would fail
    result = photo_judge.judge_photos(CLINIC, photos, client=second, log=lambda m: None)
    assert second.calls == [] and result["cached"] == 2 and result["tokens_in"] == 0
    assert result["verdicts"]["a"]["keep"] and not result["verdicts"]["b"]["keep"]


def test_only_the_new_photos_are_sent_when_some_are_cached():
    photo_judge.judge_photos(CLINIC, [("a", photo(1))], client=FakeVision(answer(("exterior", 4))), log=lambda m: None)
    fake = FakeVision(answer(("equipment", 4)))
    result = photo_judge.judge_photos(CLINIC, [("a", photo(1)), ("b", photo(2))], client=fake, log=lambda m: None)
    assert sum(1 for p in fake.calls[0]["messages"][1]["content"] if p["type"] == "image_url") == 1
    assert result["cached"] == 1 and result["judged"] == 1 and set(result["verdicts"]) == {"a", "b"}


def test_the_clinic_name_is_part_of_the_cache_key():
    """"Is this another business's sign?" depends on which clinic we are looking at."""
    photo_judge.judge_photos(CLINIC, [("a", photo(1))], client=FakeVision(answer(("exterior", 4))), log=lambda m: None)
    fake = FakeVision(answer(("other_business", 4)))
    result = photo_judge.judge_photos({**CLINIC, "name": "Other Clinic"}, [("a", photo(1))], client=fake, log=lambda m: None)
    assert len(fake.calls) == 1 and not result["verdicts"]["a"]["keep"]


def test_the_daily_limit_stops_the_spending(monkeypatch):
    monkeypatch.setattr(photo_judge, "DAILY_IMAGE_LIMIT", 4)
    assert photo_judge.judge_photos(CLINIC, [(str(i), photo(i)) for i in range(3)], client=FakeVision(answer(*[("exterior", 4)] * 3)), log=lambda m: None)
    assert photo_judge.images_left_today() == 1
    fake = FakeVision()
    assert photo_judge.judge_photos(CLINIC, [(str(i), photo(i + 50)) for i in range(3)], client=fake, log=lambda m: None) is None
    assert fake.calls == []  # over the limit: not even a request


# --------------------------------------------------------------------------- it never breaks the pipeline

@pytest.mark.parametrize("script", [
    [RuntimeError("model does not accept images")],
    [answer(("exterior", 4), finish="length")],
    [types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content="sorry, I cannot"), finish_reason="stop")], usage=None)],
])
def test_any_model_failure_means_nothing_is_filtered(script):
    assert photo_judge.judge_photos(CLINIC, [("a", photo(1))], client=FakeVision(*script), log=lambda m: None) is None


def test_a_photo_the_model_skipped_has_no_verdict_so_the_other_gates_decide():
    result = photo_judge.judge_photos(CLINIC, [("a", photo(1)), ("b", photo(2))], client=FakeVision(answer(("exterior", 4))), log=lambda m: None)
    assert "a" in result["verdicts"] and "b" not in result["verdicts"]


def test_it_can_be_switched_off_or_has_no_key(monkeypatch):
    fake = FakeVision(answer(("exterior", 4)))
    monkeypatch.setenv("OPENCLAW_VISION", "off")
    assert photo_judge.judge_photos(CLINIC, [("a", photo(1))], client=fake) is None
    monkeypatch.setenv("OPENCLAW_VISION", "on")
    monkeypatch.delenv("OPENROUTER_API_KEY")
    assert photo_judge.judge_photos(CLINIC, [("a", photo(1))], client=fake) is None
    assert fake.calls == []


# --------------------------------------------------------------------------- in the gallery

@pytest.fixture()
def root(tmp_path, monkeypatch):
    (tmp_path / "public" / "uploads").mkdir(parents=True)
    monkeypatch.setattr(clinic_photos, "project_root", lambda: tmp_path)
    return tmp_path


def fake_judge(categories):
    """A judge that returns the given category per file name (without calling any model)."""
    def judge(clinic, photos, log=print):
        verdicts = {url: photo_judge._decide({"category": categories[Path(url).name.split("-")[-1].split(".")[0]], "quality": 4, "reason": "x"}) for url, _ in photos}
        return {"verdicts": verdicts, "model": "m", "tokens_in": 900, "tokens_out": 80, "judged": len(photos), "cached": 0}
    return judge


def test_rejected_photos_are_removed_with_their_files_and_the_best_one_leads(root, monkeypatch):
    pics = {"https://site.test/1.jpg": photo(1), "https://site.test/2.jpg": photo(2), "https://site.test/3.jpg": photo(3)}
    monkeypatch.setattr(clinic_photos, "download", lambda url, referer=None, timeout=7: pics.get(url))
    pages = [{"url": "https://site.test", "images": [{"url": u, "where": "body"} for u in pics]}]
    gallery = clinic_photos.build_gallery("anchor", pages, root, log=lambda m: None, clinic=CLINIC,
                                          judge=fake_judge({"1": "equipment", "2": "food_or_product", "3": "exterior"}))
    assert [Path(u).name for u in gallery["images"]] == ["anchor-web-3.jpg", "anchor-web-1.jpg"]  # exterior first, food gone
    assert not (root / "public" / "uploads" / "generated-clinics" / "website" / "anchor-web-2.jpg").exists()  # no orphan file
    assert gallery["review"]["rejected"][0]["category"] == "food_or_product" and gallery["review"]["tokens_in"] == 900
    assert "anchor-web-2.jpg" not in " ".join(gallery["sources"])


def test_a_crashing_review_keeps_every_photo_the_gates_accepted(root, monkeypatch):
    monkeypatch.setattr(clinic_photos, "download", lambda url, referer=None, timeout=7: photo(1) if url.endswith("1.jpg") else None)
    pages = [{"url": "https://site.test", "images": [{"url": "https://site.test/1.jpg", "where": "body"}]}]

    def boom(clinic, photos, log=print):
        raise RuntimeError("vision exploded")

    gallery = clinic_photos.build_gallery("anchor", pages, root, log=lambda m: None, judge=boom)
    assert len(gallery["images"]) == 1 and gallery["review"] is None


def test_all_photos_rejected_means_no_photo_not_a_bad_photo(root, monkeypatch):
    monkeypatch.setattr(clinic_photos, "download", lambda url, referer=None, timeout=7: photo(1) if url.endswith("1.jpg") else None)
    pages = [{"url": "https://site.test", "images": [{"url": "https://site.test/1.jpg", "where": "body"}]}]
    gallery = clinic_photos.build_gallery("anchor", pages, root, log=lambda m: None, judge=fake_judge({"1": "logo_or_icon"}))
    assert gallery["images"] == [] and gallery["images_source"] == "none"


def test_a_new_clinic_records_the_review_and_what_it_cost(root, monkeypatch):
    monkeypatch.setattr(clinic_photos, "download", lambda url, referer=None, timeout=7: photo(1) if url.endswith("1.jpg") else None)
    data = {"name": "Anchor Dental", "website": "https://site.test", "specialty": "Dentist", "city": "Houston"}
    clinic_photos.attach_real_photos(data, website_images=["https://site.test/1.jpg"], log=lambda m: None, judge=fake_judge({"1": "interior_reception"}))
    assert data["photo_review"]["judged"] == 1 and data["photo_review"]["tokens_out"] == 80 and data["images_source"] == "website"


def test_google_photos_the_gates_refuse_do_not_pile_up_on_disk(root, monkeypatch):
    blank = io.BytesIO()
    from PIL import Image

    Image.new("RGB", (900, 650), (240, 240, 240)).save(blank, "JPEG")  # a flat block: rejected by the gates
    monkeypatch.setattr(clinic_photos, "download", lambda url, referer=None, timeout=7: blank.getvalue())
    clinic_photos.build_gallery("anchor", [], root, google_fetcher=lambda: ["https://g.test/1"], log=lambda m: None)
    assert list((root / "public" / "uploads" / "generated-clinics" / "google-places").glob("*")) == []


# --------------------------------------------------------------------------- the scorecard shows the real usage

def test_the_scorecard_lists_unreviewed_photos_and_sums_the_tokens():
    rows = [
        {"slug": "a", "status": "published", "description": "x" * 200, "metadata": {"images": ["https://x.test/1.jpg"], "images_source": "website",
         "photo_review": {"judged": 5, "rejected": [{"url": "u"}], "tokens_in": 1000, "tokens_out": 100}}},
        {"slug": "b", "status": "published", "description": "x" * 200, "metadata": {"images": ["https://x.test/2.jpg"], "images_source": "website",
         "photo_review": {"judged": 3, "rejected": [], "tokens_in": 500, "tokens_out": 50}}},
        {"slug": "c", "status": "draft", "description": "x" * 200, "metadata": {"images": ["https://x.test/3.jpg"], "images_source": "website"}},
    ]
    report = quality_report.build_report(rows, file_exists=lambda u: True)
    assert report["problems"]["photos_not_reviewed"] == 1
    assert report["photo_review"] == {"clinics": 2, "judged": 8, "rejected": 1, "tokens_in": 1500, "tokens_out": 150}
    assert "1500 vào / 150 ra" in quality_report.format_report(report, "vi")


# --------------------------------------------------------------------------- /review_photos on existing clinics

PREFIX = "PyTest Review "


@pytest.fixture()
def db(monkeypatch, root):
    if not TEST_URL:
        pytest.skip("OPENCLAW_TEST_DATABASE_URL not set")
    monkeypatch.setenv("DATABASE_URL", TEST_URL)
    import pg_client

    monkeypatch.setattr(pg_client, "_INSTANCE", None)
    client = pg_client.create_client()
    client.table("clinics").delete().ilike("name", PREFIX + "%").execute()
    yield client
    client.table("clinics").delete().ilike("name", PREFIX + "%").execute()
    client.close()


def _clinic(db, root, slug, files):
    folder = root / "public" / "uploads" / "generated-clinics" / "website"
    folder.mkdir(parents=True, exist_ok=True)
    urls = []
    for name, seed in files:
        (folder / name).write_bytes(photo(seed))
        urls.append(f"/uploads/generated-clinics/website/{name}")
    row = db.table("clinics").insert({
        "name": PREFIX + slug, "slug": "pytest-review-" + slug, "status": "published", "languages": ["English"], "city": "Houston", "state": "TX",
        "metadata": {"images": urls + ["https://hotlinked.test/x.jpg"], "image_sources": {u: "website" for u in urls}}}).execute().data[0]
    return row, urls


def test_review_photos_updates_the_clinic_deletes_rejects_and_leaves_hotlinks_alone(db, root):
    row, urls = _clinic(db, root, "one", [("one-1.jpg", 1), ("one-2.jpg", 2)])
    judge = lambda clinic, photos, log=print: {  # noqa: E731
        "verdicts": {urls[0]: photo_judge._decide({"category": "text_graphic", "quality": 5}), urls[1]: photo_judge._decide({"category": "exterior", "quality": 4})},
        "model": "m", "tokens_in": 700, "tokens_out": 60, "judged": 2, "cached": 0}
    summary = photo_review.review_clinics(db, target="pytest-review-one", root=root, judge=judge, log=lambda m: None)
    meta = db.table("clinics").select("metadata").eq("id", row["id"]).single().execute().data["metadata"]
    assert meta["images"] == [urls[1], "https://hotlinked.test/x.jpg"]
    assert not (root / "public" / urls[0].lstrip("/")).exists() and (root / "public" / urls[1].lstrip("/")).exists()
    assert meta["photo_review"]["tokens_in"] == 700 and meta["photo_review"]["rejected"][0]["category"] == "text_graphic"
    assert summary["clinics"] == 1 and summary["rejected"] == 1 and summary["kept"] == 1


def test_all_means_only_clinics_never_reviewed_and_respects_the_limit(db, root):
    _clinic(db, root, "a", [("a-1.jpg", 11)])
    done, _ = _clinic(db, root, "b", [("b-1.jpg", 12)])
    meta = db.table("clinics").select("metadata").eq("id", done["id"]).single().execute().data["metadata"]
    db.table("clinics").update({"metadata": {**meta, "photo_review": {"judged": 1}}}).eq("id", done["id"]).execute()
    _clinic(db, root, "c", [("c-1.jpg", 13)])
    seen = []

    def judge(clinic, photos, log=print):
        seen.append(clinic["name"])
        return {"verdicts": {u: photo_judge._decide({"category": "exterior", "quality": 4}) for u, _ in photos}, "model": "m", "tokens_in": 1, "tokens_out": 1, "judged": len(photos), "cached": 0}

    photo_review.review_clinics(db, target="all", limit=100, root=root, judge=judge, log=lambda m: None)
    ours = {n for n in seen if n.startswith(PREFIX)}
    assert ours == {PREFIX + "a", PREFIX + "c"}  # the already reviewed clinic is not paid for again
    seen.clear()
    photo_review.review_clinics(db, target="all", limit=1, root=root, judge=judge, log=lambda m: None)
    assert len(seen) <= 1  # and the limit is respected


def test_review_photos_does_nothing_and_says_so_when_the_review_is_off(db, root, monkeypatch):
    _clinic(db, root, "off", [("off-1.jpg", 21)])
    monkeypatch.setenv("OPENCLAW_VISION", "off")
    summary = photo_review.review_clinics(db, target="all", root=root, log=lambda m: None)
    assert summary["clinics"] == 0 and "Chưa chấm" in photo_review.format_summary(summary, "vi")

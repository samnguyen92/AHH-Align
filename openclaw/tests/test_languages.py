"""Run: python -m pytest openclaw/tests/test_languages.py  (or python openclaw/tests/test_languages.py)"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from languages import (  # noqa: E402
    detect_languages,
    language_family,
    normalize_language,
    normalize_language_list,
    verify_languages,
    visible_text,
)

GREAT_CARE_HTML = """
<style>/* vietnamese */ @font-face { src: url('vietnamese.woff2'); } /* latin */</style>
<script>var x = "vietnamese";</script>
<p class="dcs-desc">Clear, compassionate dental care in English, Mandarin, and Cantonese.</p>
<p class="dmc-title">Bilingual Care</p><p>English &amp; Mandarin 中文</p>
"""


def test_css_comment_is_not_a_language_claim():
    assert "Vietnamese" not in detect_languages(GREAT_CARE_HTML)
    kept, _, dropped = verify_languages(["English", "Mandarin", "Vietnamese"], GREAT_CARE_HTML)
    assert "Vietnamese" in dropped and "Mandarin" in kept


def test_great_care_dental_languages():
    found = detect_languages(GREAT_CARE_HTML)
    assert {"Mandarin", "Cantonese"} <= set(found)
    assert "Vietnamese" not in found


def test_generic_chinese_does_not_verify_variants():
    html = "<p>Our staff speak Chinese and English.</p>"
    found = detect_languages(html)
    assert "Chinese" in found and "Mandarin" not in found and "Cantonese" not in found


def test_chinese_medicine_is_not_a_language():
    html = "<p>We offer Chinese herbal medicine and acupuncture for our patients.</p>"
    assert "Chinese" not in detect_languages(html)


def test_normalisation_and_family():
    assert normalize_language("Chinese (Mandarin)") == "Mandarin"
    assert normalize_language("tiếng việt") == "Vietnamese"
    assert normalize_language_list(["Mandarin/Cantonese", "english", "Klingon"]) == ["Mandarin", "Cantonese", "English"]
    assert language_family("Cantonese") == "Chinese" and language_family("Korean") == "Korean"


def test_visible_text_strips_noise():
    assert "vietnamese" not in visible_text(GREAT_CARE_HTML).lower()


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)

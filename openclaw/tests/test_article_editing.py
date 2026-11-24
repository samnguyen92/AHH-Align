import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from admin_actions import normalize_article_identifier
from article_editor import _prepend_to_markdown, _append_to_markdown, _replace_in_text
from repair_article_images import article_matches, find_article


class TestArticleIdentifierAndExactEdits(unittest.TestCase):
    def test_normalize_article_identifier_urls_and_paths(self):
        self.assertEqual(
            normalize_article_identifier('"/insights/how-to-find-a-clinic-that-speaks-vietnamese-in-the-us"'),
            "how-to-find-a-clinic-that-speaks-vietnamese-in-the-us",
        )
        self.assertEqual(
            normalize_article_identifier("https://asianhealthhub.com/insights/how-to-find-a-clinic-that-speaks-vietnamese-in-the-us"),
            "how-to-find-a-clinic-that-speaks-vietnamese-in-the-us",
        )
        self.assertEqual(
            normalize_article_identifier('"https://asianhealthhub.com/pulse/ahh-pulse-15-a-healthy-week-check-in-for-asian-families-new-virginia-listings"'),
            "ahh-pulse-15-a-healthy-week-check-in-for-asian-families-new-virginia-listings",
        )
        self.assertEqual(
            normalize_article_identifier("https://asianhealthhub.com/pulse/ahh-pulse-15-test/?utm_source=tg#top"),
            "ahh-pulse-15-test",
        )
        self.assertEqual(
            normalize_article_identifier("how-to-find-a-clinic-that-speaks-vietnamese-in-the-us"),
            "how-to-find-a-clinic-that-speaks-vietnamese-in-the-us",
        )
        self.assertEqual(
            normalize_article_identifier("How to Find a Vietnamese Doctor"),
            "How to Find a Vietnamese Doctor",
        )

    def test_repair_article_images_matches_full_urls(self):
        articles = [
            {
                "id": "1",
                "slug": "how-to-find-a-clinic-that-speaks-vietnamese-in-the-us",
                "title": "How to Find a Clinic That Speaks Vietnamese in the US",
                "category": "insight",
                "seo_meta": {},
            },
            {
                "id": "2",
                "slug": "ahh-pulse-15-a-healthy-week-check-in-for-asian-families-new-virginia-listings",
                "title": "AHH Pulse #15: A Healthy Week Check-In",
                "category": "pulse",
                "seo_meta": {},
            },
        ]
        found_insight = find_article(
            articles,
            "https://asianhealthhub.com/insights/how-to-find-a-clinic-that-speaks-vietnamese-in-the-us",
        )
        self.assertEqual(found_insight["id"], "1")

        found_pulse = find_article(
            articles,
            '"https://asianhealthhub.com/pulse/ahh-pulse-15-a-healthy-week-check-in-for-asian-families-new-virginia-listings"',
        )
        self.assertEqual(found_pulse["id"], "2")
        self.assertTrue(article_matches(articles[1], "/pulse/ahh-pulse-15-a-healthy-week-check-in-for-asian-families-new-virginia-listings"))

    def test_prepend_to_markdown_preserves_h1_and_exact_text(self):
        intro = "If you or a family member feels more comfortable speaking Vietnamese, this guide helps."
        md_with_h1 = "# Main Title\n\n## Section 1\nBody text."
        result = _prepend_to_markdown(md_with_h1, intro)
        self.assertEqual(result, f"# Main Title\n\n{intro}\n\n## Section 1\nBody text.")
        # Idempotent if called again
        self.assertEqual(_prepend_to_markdown(result, intro), result)

        md_no_h1 = "## Section 1\nBody text."
        self.assertEqual(_prepend_to_markdown(md_no_h1, intro), f"{intro}\n\n## Section 1\nBody text.")

    def test_append_and_replace_in_text(self):
        self.assertEqual(_append_to_markdown("Hello", "World"), "Hello\n\nWorld")
        self.assertEqual(
            _replace_in_text("Make time this week for small steps.", "small steps", "healthy habits"),
            "Make time this week for healthy habits.",
        )


if __name__ == "__main__":
    unittest.main()

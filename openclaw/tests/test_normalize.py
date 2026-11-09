import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from normalize import (  # noqa: E402
    clean_value,
    compute_quality,
    detect_dead_page,
    fill_location_fields,
    normalize_phone,
    normalize_specialty,
    parse_us_address,
)


class AddressTests(unittest.TestCase):
    def test_usa_suffix(self):
        self.assertEqual(
            parse_us_address("9430 Katy Fwy, Houston, TX 77055, USA"),
            {"city": "Houston", "state": "TX", "zip_code": "77055"},
        )

    def test_no_suffix(self):
        self.assertEqual(
            parse_us_address("550 1st Ave, New York, NY 10016"),
            {"city": "New York", "state": "NY", "zip_code": "10016"},
        )

    def test_suite_and_zip4(self):
        self.assertEqual(
            parse_us_address("4105 Spring Creek Pkwy Ste 608, Plano, Texas 75024-1234, United States"),
            {"city": "Plano", "state": "TX", "zip_code": "75024"},
        )

    def test_no_zip(self):
        self.assertEqual(
            parse_us_address("3316 NE 125th St, Seattle, WA"),
            {"city": "Seattle", "state": "WA"},
        )

    def test_unparseable(self):
        self.assertEqual(parse_us_address("Somewhere nice"), {})

    def test_fill_location_scrubs_null(self):
        data = fill_location_fields(
            {"address": "268 Canal St, New York, NY 10013", "city": "null", "state": None, "zip_code": ""}
        )
        self.assertEqual((data["city"], data["state"], data["zip_code"]), ("New York", "NY", "10013"))


class MiscTests(unittest.TestCase):
    def test_clean_value(self):
        self.assertIsNone(clean_value("None"))
        self.assertIsNone(clean_value(" null "))
        self.assertEqual(clean_value("Houston"), "Houston")

    def test_specialty(self):
        for raw in ["Dentistry", "Dentist", "General Dentistry", "牙科 (全科/口腔外科)", "Family and Cosmetic Dentistry"]:
            self.assertEqual(normalize_specialty(raw), "Dental", raw)
        for raw in ["Acupuncture & Traditional Chinese Medicine", "한의학 (Traditional Chinese Medicine)", "Chinese Medicine"]:
            self.assertEqual(normalize_specialty(raw), "Acupuncture & TCM", raw)
        self.assertEqual(normalize_specialty("Federally Qualified Health Center (FQHC)"), "Community Health Center")
        self.assertEqual(normalize_specialty("Hospital (Level IV Trauma Center)"), "Hospital")
        self.assertIsNone(normalize_specialty("null"))

    def test_phone(self):
        self.assertEqual(normalize_phone("tel:+1-408-555-0199"), "(408) 555-0199")
        self.assertEqual(normalize_phone("678.474.7000"), "(678) 474-7000")
        self.assertIsNone(normalize_phone("12345"))

    def test_parked_domain(self):
        self.assertIsNotNone(detect_dead_page("greatcaredental.com is parked free, courtesy of GoDaddy.com. Get This Domain"))
        self.assertIsNone(detect_dead_page("Our dental clinic offers cleanings. " * 30))

    def test_quality(self):
        full = compute_quality({"name": "A", "specialty": "Dental", "address": "x", "city": "c", "state": "TX", "phone": "p"})
        self.assertGreater(full["score"], 0)
        self.assertIn("images", full["missing"])


if __name__ == "__main__":
    unittest.main()


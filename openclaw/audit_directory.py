"""
audit_directory.py — Track C (Our Own Data Audit & Bucket Backfill) + Track E (Demand & Gap Discovery).

Provides:
  1. audit_directory_coverage(): Full entity/field/tag coverage report, business type breakdown,
     price tier distribution, and top insurance networks across all clinics in Supabase.
  2. discover_directory_gaps(limit=10): Identifies underserved (City x Specialty x Language)
     combinations weighted by metro priority and real pageview demand, returning ready-to-run
     Google Places scout queries.
  3. backfill_directory_buckets(apply=False): Backfills normalized insurance buckets, price_tier,
     open_weekend flags, and multilingual search_keywords/search_text across all clinics.
"""

import argparse
import os
from collections import Counter
from typing import Any, Dict, List

from dotenv import load_dotenv
from supabase import create_client

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(_OPENCLAW_DIR, "..", ".env.local"))
load_dotenv(".env")
load_dotenv(".env.local")

from normalize import compute_quality, enrich_directory_buckets  # noqa: E402

TARGET_METROS = [
    ("Los Angeles", "CA"),
    ("San Jose", "CA"),
    ("Houston", "TX"),
    ("San Francisco", "CA"),
    ("Seattle", "WA"),
    ("Dallas", "TX"),
    ("San Diego", "CA"),
    ("Atlanta", "GA"),
    ("Sacramento", "CA"),
]

CORE_SPECIALTIES = [
    "Primary Care",
    "Dental",
    "OB/GYN",
    "Pediatrics",
    "Mental Health",
    "Ophthalmology",
    "Dermatology",
    "Acupuncture & TCM",
]

CORE_LANGUAGES = ["Vietnamese", "Korean", "Mandarin"]


def _get_supabase():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def _has_lang(langs: List[str], target: str) -> bool:
    t = target.lower()
    for l in (langs or []):
        low = str(l).lower()
        if t in low:
            return True
        if t in ("mandarin", "chinese") and any(x in low for x in ("chinese", "mandarin", "cantonese")):
            return True
    return False


def audit_directory_coverage() -> Dict[str, Any]:
    """Run Track C audit across all clinics in Supabase."""
    sb = _get_supabase()
    rows = (
        sb.table("clinics")
        .select("id, slug, name, org_id, address, city, state, zip_code, phone, specialty, languages, is_telehealth_available, metadata")
        .execute()
        .data
        or []
    )
    total = len(rows)
    if total == 0:
        return {"total": 0, "summary_text": "No clinics found in database."}

    counts = Counter()
    specialties = Counter()
    price_tiers = Counter()
    insurances = Counter()
    languages_counter = Counter()
    cities_counter = Counter()
    total_specialists = 0
    total_services = 0

    for row in rows:
        meta = row.get("metadata") or {}
        if row.get("address"):
            counts["address"] += 1
        if row.get("city") and row.get("state"):
            counts["city_state"] += 1
            cities_counter[f"{row['city']}, {row['state']}"] += 1
        if row.get("zip_code"):
            counts["zip_code"] += 1
        if row.get("phone"):
            counts["phone"] += 1
        if row.get("specialty"):
            counts["specialty"] += 1
            specialties[row["specialty"]] += 1

        langs = row.get("languages") or []
        non_en = [l for l in langs if str(l).lower() != "english"]
        if non_en:
            counts["bilingual_languages"] += 1
        for l in langs:
            languages_counter[str(l)] += 1

        if row.get("is_telehealth_available") or (meta.get("care_model") or {}).get("telehealth"):
            counts["telehealth"] += 1

        svcs = meta.get("services_offered") or meta.get("services") or []
        if svcs:
            counts["services"] += 1
            total_services += len(svcs)

        team = meta.get("team_members") or []
        if team:
            counts["team_members"] += 1
            total_specialists += len(team)

        ins_list = meta.get("insurance_accepted") or (meta.get("insurance") or {}).get("accepted_networks") or []
        if ins_list:
            counts["insurance_accepted"] += 1
            for net in ins_list:
                insurances[str(net)] += 1

        ins_obj = meta.get("insurance") if isinstance(meta.get("insurance"), dict) else {}
        if ins_obj.get("accepts_medicare") or "Medicare" in ins_list:
            counts["medicare"] += 1
        if ins_obj.get("accepts_medicaid") or "Medicaid" in ins_list:
            counts["medicaid"] += 1

        tier = meta.get("price_tier")
        if tier:
            counts["price_tier"] += 1
            price_tiers[str(tier)] += 1

        hours = meta.get("working_hours")
        if hours and isinstance(hours, dict) and len(hours) > 0:
            counts["working_hours"] += 1
        if meta.get("open_weekend"):
            counts["open_weekend"] += 1

        if meta.get("rating") or (meta.get("review_profile") or {}).get("rating"):
            counts["rating"] += 1
        if meta.get("reviews") or (meta.get("review_profile") or {}).get("featured_reviews"):
            counts["reviews"] += 1
        if meta.get("search_keywords"):
            counts["search_keywords"] += 1

    def pct(k: str) -> str:
        return f"{counts[k]}/{total} ({counts[k] * 100.0 / total:.1f}%)"

    lines = [
        f"📊 DIRECTORY DATA AUDIT (Track C) — {total} Clinics",
        f"• Address & City/State: {pct('city_state')} | Zip: {pct('zip_code')} | Phone: {pct('phone')}",
        f"• Specialty: {pct('specialty')} | Bilingual Languages: {pct('bilingual_languages')}",
        f"• Services & Treatments: {pct('services')} ({total_services} total service items)",
        f"• Specialists / Doctors: {pct('team_members')} ({total_specialists} total doctors listed)",
        f"• Insurance Networks: {pct('insurance_accepted')} | Medicare: {pct('medicare')} | Medicaid: {pct('medicaid')}",
        f"• Price Tier ($-$$$): {pct('price_tier')} -> " + ", ".join(f"{k}: {v}" for k, v in sorted(price_tiers.items())),
        f"• Working Hours: {pct('working_hours')} | Open Weekends: {pct('open_weekend')} | Telehealth: {pct('telehealth')}",
        f"• Ratings: {pct('rating')} | Patient Reviews: {pct('reviews')} | Search Keywords Indexed: {pct('search_keywords')}",
        "",
        "🏥 Business / Specialty Breakdown:",
        "  " + ", ".join(f"{k} ({v})" for k, v in specialties.most_common(10)),
        "",
        "🛡️ Top Insurance Buckets:",
        "  " + ", ".join(f"{k} ({v})" for k, v in insurances.most_common(8)),
    ]

    return {
        "total": total,
        "counts": dict(counts),
        "specialties": dict(specialties),
        "price_tiers": dict(price_tiers),
        "insurances": dict(insurances),
        "summary_text": "\n".join(lines),
    }


def discover_directory_gaps(limit: int = 10) -> List[Dict[str, Any]]:
    """
    Track E: Identify underserved (City, State, Specialty, Language) combinations
    weighted by metro priority and real pageview demand.
    """
    sb = _get_supabase()
    rows = (
        sb.table("clinics")
        .select("city, state, specialty, languages")
        .execute()
        .data
        or []
    )

    # Optional: weight cities by page_views demand if table exists
    city_demand = Counter()
    try:
        views = sb.table("page_views").select("path").limit(1000).execute().data or []
        for v in views:
            path = str(v.get("path") or "").lower()
            for city, _st in TARGET_METROS:
                if city.lower().replace(" ", "-") in path or city.lower() in path:
                    city_demand[city] += 1
    except Exception:
        pass

    supply = Counter()
    city_totals = Counter()
    for r in rows:
        c = str(r.get("city") or "").strip()
        s = str(r.get("specialty") or "").strip()
        langs = r.get("languages") or []
        if c:
            city_totals[c.lower()] += 1
        for lang in CORE_LANGUAGES:
            if _has_lang(langs, lang):
                supply[(c.lower(), s.lower(), lang.lower())] += 1

    candidates: List[Dict[str, Any]] = []
    for metro_idx, (city, state) in enumerate(TARGET_METROS):
        for spec_idx, spec in enumerate(CORE_SPECIALTIES):
            for lang in CORE_LANGUAGES:
                count = supply[(city.lower(), spec.lower(), lang.lower())]
                if count < 2:
                    # Priority score: lower current count, higher metro rank, higher core specialty rank, plus real demand
                    priority = (2 - count) * 30 + (len(TARGET_METROS) - metro_idx) * 4 + (len(CORE_SPECIALTIES) - spec_idx) * 2 + city_demand[city]
                    spec_query = "acupuncture clinic" if "acupuncture" in spec.lower() else f"{spec.lower()} clinic"
                    candidates.append({
                        "city": city,
                        "state": state,
                        "specialty": spec,
                        "language": lang,
                        "current_count": count,
                        "priority": priority,
                        "scout_query": f"{lang} speaking {spec_query} in {city}, {state}",
                    })

    candidates.sort(key=lambda x: (-x["priority"], x["current_count"]))
    return candidates[:limit]


def format_directory_gaps_report(limit: int = 10) -> str:
    gaps = discover_directory_gaps(limit=limit)
    if not gaps:
        return "✅ All core (City × Specialty × Language) cells have >= 2 clinics!"
    lines = [f"🎯 TOP {len(gaps)} DIRECTORY SUPPLY GAPS (Track E Demand Planner):"]
    for idx, g in enumerate(gaps, 1):
        lines.append(
            f"{idx}. [{g['city']}, {g['state']}] {g['language']} · {g['specialty']} (hiện có: {g['current_count']})\n"
            f"   👉 Gợi ý lệnh: /scout {g['scout_query']}"
        )
    return "\n".join(lines)


def backfill_directory_buckets(apply: bool = False) -> Dict[str, int]:
    """Backfill normalized insurance buckets, price_tier, open_weekend, and search_keywords on all clinics."""
    sb = _get_supabase()
    rows = sb.table("clinics").select("*").execute().data or []
    updated = 0
    for row in rows:
        payload = dict(row)
        enrich_directory_buckets(payload)
        quality = compute_quality(payload)
        meta = dict(payload.get("metadata") or {})
        meta["quality_score"] = quality["score"]
        meta["quality_missing"] = quality["missing"]
        if apply:
            sb.table("clinics").update({"metadata": meta}).eq("id", row["id"]).execute()
        updated += 1
    print(f"[*] Backfill directory buckets ({'APPLIED' if apply else 'DRY-RUN'}): {updated} clinics processed.")
    return {"total": len(rows), "updated": updated}


BENCHMARK_30_QUERIES = [
    # 1. Treatments & Procedures (10)
    ("dental implant", ["Dental"], ["implant", "dental"]),
    ("root canal", ["Dental"], ["root canal", "endodontic", "dental"]),
    ("invisalign", ["Dental"], ["invisalign", "orthodont", "dental"]),
    ("teeth whitening", ["Dental"], ["whitening", "cosmetic", "dental"]),
    ("annual physical", ["Primary Care"], ["physical", "checkup", "primary care"]),
    ("prenatal care", ["OB/GYN"], ["prenatal", "pregnancy", "ob/gyn"]),
    ("cataract surgery", ["Ophthalmology"], ["cataract", "eye", "ophthalmology"]),
    ("colonoscopy", ["Gastroenterology", "Primary Care"], ["colonoscopy", "endoscopy", "digestive", "hospital"]),
    ("botox", ["Dermatology", "Med Spa & Aesthetic"], ["botox", "cosmetic", "dermatology"]),
    ("acupuncture pain relief", ["Acupuncture & TCM"], ["acupuncture", "pain", "tcm"]),
    # 2. Multilingual Patient Queries (10: VI, KO, ZH)
    ("nha khoa", ["Dental"], ["nha khoa", "dental"]),
    ("bác sĩ gia đình", ["Primary Care"], ["bác sĩ gia đình", "primary care"]),
    ("châm cứu", ["Acupuncture & TCM"], ["châm cứu", "acupuncture"]),
    ("sản phụ khoa", ["OB/GYN"], ["sản phụ khoa", "ob/gyn"]),
    ("nhi khoa", ["Pediatrics"], ["nhi khoa", "pediatrics"]),
    ("치과", ["Dental"], ["치과", "dental"]),
    ("한의원", ["Acupuncture & TCM"], ["한의원", "acupuncture"]),
    ("내과", ["Primary Care"], ["내과", "primary care"]),
    ("中医", ["Acupuncture & TCM"], ["中医", "acupuncture"]),
    ("牙医", ["Dental"], ["牙医", "dental"]),
    # 3. Symptoms & Conditions (6)
    ("back pain", ["Acupuncture & TCM", "Physical Therapy", "Orthopedics", "Chiropractic"], ["back pain", "spine", "pain", "acupuncture", "orthopedics"]),
    ("anxiety therapy", ["Mental Health"], ["anxiety", "therapy", "mental health", "counseling"]),
    ("acne treatment", ["Dermatology"], ["acne", "skin", "dermatology"]),
    ("diabetes checkup", ["Primary Care"], ["diabetes", "blood test", "primary care"]),
    ("high blood pressure", ["Primary Care", "Cardiology"], ["hypertension", "blood pressure", "primary care", "cardiology"]),
    ("child vaccine", ["Pediatrics"], ["vaccine", "immunization", "pediatrics"]),
    # 4. Insurance & Coverage Queries (4)
    ("Delta Dental", ["Dental"], ["delta dental"]),
    ("Medicare", [], ["medicare"]),
    ("Medicaid", [], ["medicaid"]),
    ("Blue Cross Blue Shield", [], ["blue cross blue shield"]),
]


def benchmark_search_queries() -> Dict[str, Any]:
    """
    Track D: Run 30 real patient queries against the Supabase clinics index
    comparing Legacy Search (name/address only) vs Deep Search (intent + metadata.search_text).
    """
    sb = _get_supabase()
    rows = sb.table("clinics").select("name,specialty,description,address,city,languages,metadata").execute().data or []

    results = []
    legacy_hits = 0
    deep_hits = 0
    misses = []

    for query_str, mapped_specs, terms in BENCHMARK_30_QUERIES:
        q_low = query_str.lower()
        leg_count = 0
        deep_count = 0

        for r in rows:
            name_low = str(r.get("name") or "").lower()
            addr_low = str(r.get("address") or "").lower()
            spec_low = str(r.get("specialty") or "").lower()
            desc_low = str(r.get("description") or "").lower()
            meta = r.get("metadata") or {}
            search_text = str(meta.get("search_text") or "").lower()

            if q_low in name_low or q_low in addr_low:
                leg_count += 1

            matched_deep = (
                q_low in name_low
                or q_low in addr_low
                or q_low in spec_low
                or q_low in desc_low
                or q_low in search_text
                or any(s.lower() in spec_low for s in mapped_specs)
                or any(t.lower() in search_text or t.lower() in desc_low for t in terms)
            )
            if matched_deep:
                deep_count += 1

        if leg_count > 0:
            legacy_hits += 1
        if deep_count > 0:
            deep_hits += 1
        else:
            misses.append(query_str)

        results.append({
            "query": query_str,
            "legacy_matches": leg_count,
            "deep_matches": deep_count,
        })

    return {
        "total_queries": len(BENCHMARK_30_QUERIES),
        "legacy_hit_queries": legacy_hits,
        "deep_hit_queries": deep_hits,
        "misses": misses,
        "results": results,
    }


def format_search_benchmark_report() -> str:
    report = benchmark_search_queries()
    lines = [
        f"🔍 SEARCH BENCHMARK (Track D — {report['total_queries']} Real Patient Queries):",
        f"• Legacy Search (name/address only): {report['legacy_hit_queries']}/{report['total_queries']} queries hit ({round(report['legacy_hit_queries'] * 100 / report['total_queries'], 1)}%)",
        f"• Deep Search (Intent + Search Index): {report['deep_hit_queries']}/{report['total_queries']} queries hit ({round(report['deep_hit_queries'] * 100 / report['total_queries'], 1)}%)",
        "",
        "📋 Chi tiết 30 truy vấn (Legacy -> Deep):",
    ]
    for r in report["results"]:
        icon = "✅" if r["deep_matches"] > 0 else "❌"
        lines.append(f"  {icon} \"{r['query']}\": {r['legacy_matches']} -> {r['deep_matches']} clinics")
    if report["misses"]:
        lines.append(f"\n⚠️ Queries with 0 matches: {', '.join(report['misses'])}")
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audit directory coverage, discover gaps, or backfill buckets.")
    parser.add_argument("--backfill-buckets", action="store_true", help="Backfill insurance/price/weekend/search buckets")
    parser.add_argument("--apply", action="store_true", help="Write backfill updates to Supabase")
    parser.add_argument("--gaps", action="store_true", help="Print top underserved (City x Specialty x Language) gaps")
    parser.add_argument("--benchmark-search", action="store_true", help="Run the 30-query search benchmark")
    args = parser.parse_args()

    if args.backfill_buckets:
        backfill_directory_buckets(apply=args.apply)
    if args.gaps:
        print(format_directory_gaps_report(limit=12))
    if args.benchmark_search:
        print(format_search_benchmark_report())
    print(audit_directory_coverage()["summary_text"])

#!/usr/bin/env python3
"""
Backfill / clean existing clinics (deterministic, no LLM, no scraping).

  - fills city / state / zip_code from the stored address
  - scrubs literal "null"/"None" strings
  - normalizes specialty into the shared taxonomy
  - recomputes metadata.quality_score / quality_missing

Default is a DRY RUN. Pass --apply to write changes.

    python3 scripts/backfill_clinics.py            # preview
    python3 scripts/backfill_clinics.py --apply    # write
"""

import argparse
import collections
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "openclaw"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(ROOT, "openclaw", ".env"))
load_dotenv(os.path.join(ROOT, ".env.local"))

from normalize import clean_value, compute_quality, fill_location_fields, normalize_specialty  # noqa: E402
from storage import create_supabase_client  # noqa: E402

FIELDS = ("address", "city", "state", "zip_code", "phone", "specialty")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    parser.add_argument("--show", type=int, default=15, help="how many sample diffs to print")
    args = parser.parse_args()

    supabase = create_supabase_client()
    if not supabase:
        print("Missing Supabase credentials")
        return 1

    rows = (
        supabase.table("clinics")
        .select("id,name,address,city,state,zip_code,phone,specialty,languages,metadata")
        .limit(5000)
        .execute()
        .data
    )
    print(f"Loaded {len(rows)} clinics ({'APPLY' if args.apply else 'DRY RUN'})")

    changed = 0
    field_counts = collections.Counter()
    scores = []
    samples = []

    for row in rows:
        before = {f: row.get(f) for f in FIELDS}
        work = dict(row)
        fill_location_fields(work)
        meta_obj = row.get("metadata") or {}
        fallback_spec = f"{meta_obj.get('google_primary_type') or ''} {row.get('name') or ''}"
        work["specialty"] = normalize_specialty(work.get("specialty"), fallback_spec)

        update = {}
        for field in FIELDS:
            new_value = clean_value(work.get(field))
            old_value = before[field]
            # never blank out an existing real value; only fill or normalise
            if new_value is not None and new_value != old_value:
                update[field] = new_value
            elif new_value is None and isinstance(old_value, str) and clean_value(old_value) is None:
                update[field] = None  # scrub literal "null"

        metadata = dict(row.get("metadata") or {})
        quality = compute_quality({**work, "metadata": metadata, "languages": row.get("languages")})
        scores.append(quality["score"])
        if metadata.get("quality_score") != quality["score"] or metadata.get("quality_missing") != quality["missing"]:
            metadata["quality_score"] = quality["score"]
            metadata["quality_missing"] = quality["missing"]
            update["metadata"] = metadata

        if not update:
            continue
        changed += 1
        for field in update:
            field_counts[field] += 1
        if len(samples) < args.show:
            diff = {k: (before.get(k), v) for k, v in update.items() if k != "metadata"}
            samples.append((row["name"], diff, quality["score"]))
        if args.apply:
            supabase.table("clinics").update(update).eq("id", row["id"]).execute()

    print(f"\nClinics that would change: {changed}/{len(rows)}")
    print("Field changes:", dict(field_counts))
    print(f"Quality score: avg {sum(scores)/max(len(scores),1):.0f}, "
          f"<70: {sum(1 for s in scores if s < 70)}, >=70: {sum(1 for s in scores if s >= 70)}")
    print("\nSample diffs:")
    for name, diff, score in samples:
        print(f"- {name} (score {score}): {diff}")
    if not args.apply:
        print("\nDry run only. Re-run with --apply to write.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


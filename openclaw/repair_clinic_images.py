"""repair_clinic_images.py — fix clinics whose photos are gone.

For every clinic: photo addresses whose file no longer exists are dropped, and when no usable photo is left the
photos of its known Google place are fetched again (quality gates, kept on our server). It never generates fake
images: a clinic without a real photo shows the site's neutral placeholder.
"""

from dotenv import load_dotenv

from clinic_photos import project_root, repair_gallery
from pg_client import create_client

load_dotenv(".env")
load_dotenv("../.env.local")


def repair_all(limit: int = 0, log=print, fetch_google: bool = True) -> dict:
    db = create_client()
    clinics = db.table("clinics").select("id, name, slug, metadata").execute().data or []
    root = project_root()
    summary = {"checked": 0, "repaired": 0, "photos_dropped": 0, "refilled": 0, "still_without_photo": 0}

    for clinic in clinics:
        if limit and summary["checked"] >= limit:
            break
        summary["checked"] += 1
        meta = dict(clinic.get("metadata") or {})
        fetcher = None
        if fetch_google and meta.get("google_place_id"):
            from google_places import photo_fetcher_for_place

            fetcher = photo_fetcher_for_place(meta["google_place_id"])
        try:
            fix = repair_gallery(clinic.get("slug") or "clinic", meta, root, fetcher, log=log)
        except Exception as exc:
            log(f"[!] {clinic.get('name')}: could not repair photos ({exc})")
            continue
        if not fix:
            continue
        log(f"[*] {clinic.get('name')}: {len(fix['removed'])} dead photo(s) dropped, {len(fix['images'])} usable now ({fix['images_source']})")
        meta.update({k: fix[k] for k in ("images", "image_sources", "images_source", "primary_image_source")})
        db.table("clinics").update({"metadata": meta}).eq("id", clinic["id"]).execute()
        summary["repaired"] += 1
        summary["photos_dropped"] += len(fix["removed"])
        summary["refilled"] += 1 if fix["images"] else 0
        summary["still_without_photo"] += 0 if fix["images"] else 1

    log(
        f"[*] Done. Checked {summary['checked']}, repaired {summary['repaired']} "
        f"(dead photos dropped: {summary['photos_dropped']}, refilled from Google: {summary['refilled']}, "
        f"still without a photo: {summary['still_without_photo']})."
    )
    return summary


def main():
    repair_all()


if __name__ == "__main__":
    main()

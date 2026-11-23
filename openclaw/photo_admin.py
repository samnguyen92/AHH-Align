"""
photo_admin.py — remove (and put back) single photos of a clinic from the bot.

Selecting: by the photo's address ("/uploads/generated-clinics/website/x-web-1.webp", also with the site's domain in
front) or by position as shown on the clinic page (1 = the cover). The file is NOT deleted: it is moved to
public/uploads/_removed/ for 30 days so /clinic_undo can put it back. Every removal is audited.
"""

from __future__ import annotations

import json
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from clinic_edit import ClinicEditError, _db, _find_rows
from clinic_photos import _source_label, project_root

TRASH_DIR = "_removed"
TRASH_DAYS = 30
LOCAL_PREFIX = "/uploads/"


@dataclass
class PhotoPlan:
    clinic_id: str
    slug: str
    name: str
    selected: List[Dict[str, Any]]      # [{"position", "url", "source"}]
    total: int
    candidates: List[str] = field(default_factory=list)


def normalize_url(raw: str) -> str:
    """"https://site/uploads/a.webp" and "/uploads/a.webp" are the same photo."""
    value = (raw or "").strip().strip("\"'")
    return value[value.index(LOCAL_PREFIX):] if LOCAL_PREFIX in value else value


def resolve_one(target: str, lang: str = "en") -> dict:
    rows = _find_rows(target)
    exact = [r for r in rows if str(target).strip().lower() in {str(r.get("slug", "")).lower(), str(r.get("name", "")).lower()}]
    if not rows:
        raise ClinicEditError(f"No clinic matches “{target}”.", f"Không tìm thấy clinic nào khớp “{target}”.")
    if len(rows) > 1 and len(exact) != 1:
        names = ", ".join(f"{r['name']} (`{r['slug']}`)" for r in rows)
        raise ClinicEditError(f"“{target}” matches several clinics: {names}. Use the slug.", f"“{target}” khớp nhiều clinic: {names}. Bạn dùng slug nhé.")
    return exact[0] if exact else rows[0]


def photos_of(row: dict) -> List[str]:
    return [u for u in ((row.get("metadata") or {}).get("images") or []) if isinstance(u, str) and u]


def plan_removal(target: str, urls: Optional[List[str]] = None, positions: Optional[List[int]] = None, lang: str = "en") -> PhotoPlan:
    row = resolve_one(target, lang)
    images = photos_of(row)
    sources = (row.get("metadata") or {}).get("image_sources") or {}
    chosen: Dict[int, str] = {}

    for raw in urls or []:
        wanted = normalize_url(str(raw))
        if wanted in images:
            chosen[images.index(wanted) + 1] = wanted
            continue
        same_name = [u for u in images if wanted and u.rsplit("/", 1)[-1] == wanted.rsplit("/", 1)[-1]]
        if len(same_name) == 1:
            chosen[images.index(same_name[0]) + 1] = same_name[0]
            continue
        raise ClinicEditError(
            f"That photo is not in the gallery of {row['name']}: {raw}",
            f"Ảnh này không có trong thư viện của {row['name']}: {raw}",
        )
    for position in positions or []:
        try:
            number = int(position)
        except (TypeError, ValueError):
            number = 0
        if not 1 <= number <= len(images):
            raise ClinicEditError(
                f"{row['name']} has {len(images)} photo(s); there is no photo {position}.",
                f"{row['name']} có {len(images)} ảnh; không có ảnh số {position}.",
            )
        chosen[number] = images[number - 1]
    if not chosen:
        raise ClinicEditError("Tell me which photo to remove (its number or its address).", "Bạn cho mình biết xoá ảnh nào (số thứ tự hoặc đường dẫn) nhé.")
    return PhotoPlan(
        clinic_id=str(row["id"]), slug=row.get("slug") or "", name=row.get("name") or "",
        selected=[{"position": n, "url": u, "source": sources.get(u)} for n, u in sorted(chosen.items())], total=len(images),
    )


# --------------------------------------------------------------------------- files: moved, never deleted

def _uploads(root: Path) -> Path:
    return (root / "public" / "uploads").resolve()


def purge_trash(root: Optional[Path] = None, days: int = TRASH_DAYS) -> int:
    base = _uploads(root or project_root()) / TRASH_DIR
    if not base.is_dir():
        return 0
    cutoff, purged = time.time() - days * 86400, 0
    for path in list(base.rglob("*")):
        if path.is_file() and path.stat().st_mtime < cutoff:
            path.unlink(missing_ok=True)
            purged += 1
    for folder in sorted((p for p in base.rglob("*") if p.is_dir()), reverse=True):
        try:
            folder.rmdir()
        except OSError:
            pass
    return purged


def _move_to_trash(url: str, clinic_id: str, root: Path) -> Optional[str]:
    """Move the photo's file into the trash. None for remote addresses or files that are not there."""
    if not url.startswith(LOCAL_PREFIX):
        return None
    uploads = _uploads(root)
    source = (root / "public" / url.lstrip("/")).resolve()
    try:
        source.relative_to(uploads)
        if TRASH_DIR in source.relative_to(uploads).parts:
            return None
    except ValueError:
        return None  # an address that points outside the uploads folder is never touched
    if not source.is_file():
        return None
    target = uploads / TRASH_DIR / clinic_id / source.name
    if target.exists():
        target = target.with_name(f"{int(time.time())}-{source.name}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(target))
    return str(target.relative_to(uploads))


def _restore_file(url: str, trash: Optional[str], root: Path) -> bool:
    """Put a trashed file back where it was. True when the photo can be served again."""
    if not url.startswith(LOCAL_PREFIX):
        return True  # a remote address needs no file
    uploads = _uploads(root)
    destination = (root / "public" / url.lstrip("/")).resolve()
    try:
        destination.relative_to(uploads)
    except ValueError:
        return False
    if destination.is_file():
        return True
    if not trash:
        return False
    source = (uploads / trash).resolve()
    try:
        source.relative_to(uploads / TRASH_DIR)
    except ValueError:
        return False
    if not source.is_file():
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(destination))
    return True


# --------------------------------------------------------------------------- apply / undo

def _metadata_patch(images: List[str], sources: dict, gallery: Optional[list]) -> dict:
    label, primary = _source_label(sources, images)
    patch = {"images": images, "image_sources": sources, "images_source": label, "primary_image_source": primary}
    if gallery is not None:
        patch["gallery_images"] = gallery
    return patch


def apply_removal(plan: PhotoPlan, actor: str, lang: str = "en", root: Optional[Path] = None) -> str:
    from psycopg2.extras import Json
    from revalidate import revalidate_clinic

    root = root or project_root()
    vi = lang == "vi"
    purge_trash(root)
    moved: List[tuple] = []
    db = _db()
    try:
        with db.transaction() as tx:
            locked = tx.query("SELECT * FROM public.clinics WHERE id = %s FOR UPDATE", (plan.clinic_id,))
            if not locked:
                raise ClinicEditError("That clinic no longer exists.", "Clinic này không còn tồn tại.")
            meta = locked[0].get("metadata") or {}
            images = [u for u in (meta.get("images") or []) if isinstance(u, str)]
            urls = [s["url"] for s in plan.selected]
            if any(u not in images for u in urls):
                raise ClinicEditError(
                    f"The photos of {plan.name} changed after the preview. Nothing was removed; ask again.",
                    f"Thư viện ảnh của {plan.name} vừa thay đổi sau khi xem trước. Chưa xoá gì cả, bạn yêu cầu lại giúp mình.",
                )
            old_sources = meta.get("image_sources") or {}
            removed = []
            for item in plan.selected:
                trash = _move_to_trash(item["url"], plan.clinic_id, root)
                if trash:
                    moved.append((item["url"], trash))
                removed.append({"url": item["url"], "position": images.index(item["url"]) + 1, "source": old_sources.get(item["url"]), "trash": trash})
            keep = [u for u in images if u not in urls]
            patch = _metadata_patch(keep, {u: v for u, v in old_sources.items() if u in keep}, [u for u in (meta.get("gallery_images") or []) if u not in urls])
            tx.query("UPDATE public.clinics SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb WHERE id = %s", (Json(patch), plan.clinic_id))
            tx.query(
                "INSERT INTO public.audit_log (actor, action, target_type, target_id, target_label, details) VALUES (%s, 'clinic.photo.remove', 'clinic', %s, %s, %s)",
                (actor, plan.clinic_id, plan.slug, Json({"removed": removed})),
            )
    except BaseException:
        for url, trash in moved:  # the database did not change: put the files back
            _restore_file(url, trash, root)
        raise
    live = revalidate_clinic(plan.slug)
    left = plan.total - len(plan.selected)
    head = (f"✅ Đã xoá {len(plan.selected)} ảnh của {plan.name} (còn {left} ảnh)." if vi else f"✅ Removed {len(plan.selected)} photo(s) of {plan.name} ({left} left).")
    undo = (f"↩️ Hoàn tác trong {TRASH_DAYS} ngày: /clinic_undo {plan.slug}" if vi else f"↩️ Undo within {TRASH_DAYS} days: /clinic_undo {plan.slug}")
    return "\n".join([head, live, undo])


def undo_removal(tx, clinic: dict, log: dict, details: dict, root: Optional[Path] = None) -> int:
    """Called by clinic_edit.undo_clinic_edit inside its transaction. Returns how many photos were put back."""
    from psycopg2.extras import Json

    root = root or project_root()
    meta = clinic.get("metadata") or {}
    images = [u for u in (meta.get("images") or []) if isinstance(u, str)]
    sources = dict(meta.get("image_sources") or {})
    restored = 0
    for item in sorted(details.get("removed") or [], key=lambda i: i.get("position") or 0):
        url = item["url"]
        if url in images or not _restore_file(url, item.get("trash"), root):
            continue  # already back, or the file is gone for good (never bring back a dead link)
        images.insert(min(max((item.get("position") or 1) - 1, 0), len(images)), url)
        if item.get("source"):
            sources[url] = item["source"]
        restored += 1
    if not restored:
        raise ClinicEditError("The removed photo files are no longer available, so nothing could be restored.", "File ảnh đã xoá không còn nữa nên không khôi phục được.")
    tx.query("UPDATE public.clinics SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb WHERE id = %s", (Json(_metadata_patch(images, sources, None)), str(clinic["id"])))
    return restored

"""content_cleanup.py — remove the generic template sentences the old rescan prompt put on EVERY clinic.

Deterministic (no model): sentences that claim unverified services are cut out; a Language Support box with such a
sentence is rebuilt from the clinic's own language evidence (and disappears when there is none). Each clinic is changed
through clinic_edit, so every change is audited, can be undone with /clinic_undo (30 days), refreshes the live page and
re-translates only the texts that changed.
"""

from __future__ import annotations

from typing import Dict, Optional

from clinic_edit import ClinicEditError, apply_clinic_edit, plan_clinic_edit
from grounded_content import has_boilerplate, language_note_from_evidence, strip_boilerplate

TEXT_FIELDS = ("description", "about_highlight", "short_description", "cultural_context")


def _evidence(meta: dict) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for item in meta.get("languages_evidence") or []:
        name, _, quote = str(item).partition(":")
        if name.strip() and quote.strip():
            out[name.strip()] = quote.strip()
    return out


def plan_cleanup(row: dict) -> Optional[Dict[str, str]]:
    """The field changes that remove the generic sentences from this clinic, or None when it is clean."""
    meta = row.get("metadata") or {}
    changes: Dict[str, str] = {}
    for field in TEXT_FIELDS:
        current = row.get("description") if field == "description" else meta.get(field)
        if has_boilerplate(current):
            changes[field] = strip_boilerplate(current)
    if has_boilerplate(meta.get("language_note")):
        verified = [str(l) for l in (row.get("languages") or [])] if meta.get("languages_verified") is True else ["English"]
        team = [m for m in (meta.get("team_members") or []) if isinstance(m, dict)]
        changes["language_note"] = language_note_from_evidence(verified, _evidence(meta), team)
    return changes or None


def clean_clinics(db, target: str = "all", limit: int = 20, actor: str = "telegram:unknown", lang: str = "vi", log=print) -> dict:
    rows = db.table("clinics").select("id,name,slug,languages,description,metadata").execute().data or []
    if target and target.lower() != "all":
        needle = target.strip().lower()
        rows = [r for r in rows if needle in {str(r.get("slug", "")).lower(), str(r.get("name", "")).lower()}]
    todo = [(r, plan_cleanup(r)) for r in rows]
    todo = [(r, c) for r, c in todo if c][: max(1, limit)]

    summary = {"checked": len(rows), "cleaned": 0, "failed": 0, "left": 0, "names": []}
    for row, changes in todo:
        try:
            plan = plan_clinic_edit(row["slug"], changes, lang)
            apply_clinic_edit(plan, actor, lang)
            summary["cleaned"] += 1
            summary["names"].append(row.get("name"))
            log(f"[+] {row.get('name')}: cleaned {', '.join(sorted(changes))}")
        except ClinicEditError as exc:
            summary["failed"] += 1
            log(f"[!] {row.get('name')}: {exc.text(lang)}")
        except Exception as exc:
            summary["failed"] += 1
            log(f"[!] {row.get('name')}: {exc!r}")
    remaining = sum(1 for r in rows if plan_cleanup(r)) - summary["cleaned"]
    summary["left"] = max(0, remaining)
    return summary


def format_summary(summary: dict, lang: str = "vi") -> str:
    if lang == "vi":
        text = f"✅ Đã dọn câu mẫu ở {summary['cleaned']} clinic (đã kiểm tra {summary['checked']})."
        if summary["failed"]:
            text += f" Không dọn được {summary['failed']} clinic."
        if summary["left"]:
            text += f" Còn {summary['left']} clinic chưa dọn, chạy lại lệnh để dọn tiếp."
        return text + " Hoàn tác từng clinic bằng /clinic_undo <slug>."
    text = f"✅ Removed template sentences from {summary['cleaned']} clinic(s) ({summary['checked']} checked)."
    if summary["failed"]:
        text += f" {summary['failed']} could not be cleaned."
    if summary["left"]:
        text += f" {summary['left']} left; run it again to continue."
    return text + " Undo one with /clinic_undo <slug>."

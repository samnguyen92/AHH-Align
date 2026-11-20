"""
clinic_edit.py — edit one clinic's public details from the bot, safely.

  plan_clinic_edit(target, changes)  read-only: finds exactly ONE clinic, validates, returns the before/after diff
  apply_clinic_edit(plan, actor)     one transaction: re-checks nothing changed since the preview, writes, audit-logs
  undo_clinic_edit(target, actor)    restores the last edit (30 days), only if the clinic still matches that edit

Only whitelisted fields can change (never status, slug, owner, ids, ...). Every edit stores the old values in
audit_log, which is what makes undo possible.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List

UNDO_WINDOW_DAYS = 30

TEXT_COLUMNS = {
    "phone": 40, "address": 200, "city": 100, "state": 40, "zip_code": 20,
    "specialty": 120, "description": 4000,
}
BOOL_COLUMNS = {"is_telehealth_available"}
METADATA_TEXT_KEYS = {"website": 300, "language_note": 1200, "about_highlight": 4000, "short_description": 800, "cultural_context": 1200}
ALLOWED_FIELDS = set(TEXT_COLUMNS) | BOOL_COLUMNS | METADATA_TEXT_KEYS.keys() | {"languages"}

# Spoken-language names are stored in English (that is what the site filters on).
LANGUAGE_ALIASES = {
    "vietnamese": "Vietnamese", "tiếng việt": "Vietnamese", "tieng viet": "Vietnamese", "việt": "Vietnamese",
    "viet": "Vietnamese", "vi": "Vietnamese", "vn": "Vietnamese",
    "korean": "Korean", "tiếng hàn": "Korean", "tieng han": "Korean", "hàn": "Korean", "ko": "Korean",
    "chinese": "Chinese", "tiếng trung": "Chinese", "tieng trung": "Chinese", "trung": "Chinese", "zh": "Chinese",
    "mandarin": "Mandarin", "cantonese": "Cantonese", "english": "English", "tiếng anh": "English",
    "tieng anh": "English", "anh": "English", "en": "English", "spanish": "Spanish", "tiếng tây ban nha": "Spanish",
    "japanese": "Japanese", "tiếng nhật": "Japanese", "tieng nhat": "Japanese", "tagalog": "Tagalog",
    "filipino": "Tagalog", "hindi": "Hindi", "thai": "Thai", "tiếng thái": "Thai", "khmer": "Khmer",
}


class ClinicEditError(Exception):
    """A request the bot should explain to the user (not a crash). str() is English; .text(lang) can be Vietnamese."""

    def __init__(self, en: str, vi: str = "") -> None:
        super().__init__(en)
        self.en, self.vi = en, vi or en

    def text(self, lang: str = "en") -> str:
        return self.vi if lang == "vi" else self.en


@dataclass
class EditPlan:
    clinic_id: str
    slug: str
    name: str
    changes: Dict[str, Any]                      # field -> new value (languages: the final list)
    before: Dict[str, Any]
    lines: List[str] = field(default_factory=list)   # human-readable diff, one line per field
    candidates: List[str] = field(default_factory=list)


def normalize_language(value: str) -> str:
    clean = " ".join(str(value or "").strip().strip("\"'“”.,").split())
    if not clean:
        raise ClinicEditError("Empty language name.")
    return LANGUAGE_ALIASES.get(clean.lower(), clean[:1].upper() + clean[1:])


def _normalize_language_list(values: Any) -> List[str]:
    if isinstance(values, str):
        values = [v for v in values.replace(";", ",").split(",")]
    out: List[str] = []
    for value in values or []:
        name = normalize_language(value)
        if name not in out:
            out.append(name)
    return out


def _find_rows(target: str) -> List[dict]:
    from jobs import _find_clinic_rows

    return _find_clinic_rows(target)


def _current_value(row: dict, name: str) -> Any:
    if name in METADATA_TEXT_KEYS:
        return (row.get("metadata") or {}).get(name)
    return row.get(name)


# The pages say "The clinic's verified spoken languages are English and Spanish." in several text fields, and the
# page shows the FIRST non-empty one (metadata.about_highlight before the description column). Changing only the
# `languages` array would leave that text, which is what visitors read, unchanged.
_LANG_SENTENCE = re.compile(r"(spoken languages (?:are|include)\s+)([^.\n]+?)(\.)", re.IGNORECASE)
SYNCED_TEXT_FIELDS = ("description", "about_highlight", "short_description", "language_note", "cultural_context")


def join_languages(languages: List[str]) -> str:
    if len(languages) <= 1:
        return "".join(languages)
    return ", ".join(languages[:-1]) + " and " + languages[-1]


def sync_language_sentence(text: str, languages: List[str]) -> str:
    return _LANG_SENTENCE.sub(lambda m: f"{m.group(1)}{join_languages(languages)}{m.group(3)}", text or "")


def _show(text: str, limit: int = 70) -> str:
    text = " ".join(str(text or "—").split())
    return text if len(text) <= limit else text[:limit] + "…"


def plan_clinic_edit(target: str, changes: Dict[str, Any], lang: str = "en") -> EditPlan:
    vi = lang == "vi"
    if not isinstance(changes, dict) or not changes:
        raise ClinicEditError("No change was given.", "Chưa có thay đổi nào được nêu rõ.")
    unknown = [key for key in changes if key not in ALLOWED_FIELDS]
    if unknown:
        raise ClinicEditError(
            f"Field(s) not editable from the bot: {', '.join(sorted(unknown))}. Editable: {', '.join(sorted(ALLOWED_FIELDS))}.",
            f"Trường không sửa được từ bot: {', '.join(sorted(unknown))}. Sửa được: {', '.join(sorted(ALLOWED_FIELDS))}.",
        )

    rows = _find_rows(target)
    if not rows:
        raise ClinicEditError(f"No clinic matches “{target}”.", f"Không tìm thấy clinic nào khớp “{target}”.")
    exact = [r for r in rows if str(target).strip().lower() in {str(r.get("slug", "")).lower(), str(r.get("name", "")).lower()}]
    if len(rows) > 1 and len(exact) != 1:
        names = ", ".join(f"{r['name']} (`{r['slug']}`)" for r in rows)
        raise ClinicEditError(
            f"“{target}” matches several clinics: {names}. Say which one (use the slug).",
            f"“{target}” khớp nhiều clinic: {names}. Bạn chọn giúp mình một clinic (dùng slug) nhé.",
        )
    row = exact[0] if exact else rows[0]
    metadata = row.get("metadata") or {}

    new_values: Dict[str, Any] = {}
    before: Dict[str, Any] = {}
    lines: List[str] = []
    final_languages: List[str] = [str(x) for x in (row.get("languages") or [])]
    for key, raw in changes.items():
        if key == "languages":
            current = list(final_languages)
            if isinstance(raw, dict):
                final = list(current)
                if raw.get("set") is not None:
                    final = _normalize_language_list(raw["set"])
                for language in _normalize_language_list(raw.get("add")):
                    if language not in final:
                        final.append(language)
                for language in _normalize_language_list(raw.get("remove")):
                    final = [x for x in final if x.lower() != language.lower()]
            else:
                final = _normalize_language_list(raw)
            if not final:
                raise ClinicEditError("A clinic must keep at least one language.", "Một clinic phải còn ít nhất một ngôn ngữ.")
            final_languages = final
            if final != current:
                before[key], new_values[key] = current, final
                lines.append(f"{'Ngôn ngữ' if vi else 'Languages'}: {', '.join(current) or '—'} → {', '.join(final)}")
        elif key in BOOL_COLUMNS:
            value = raw if isinstance(raw, bool) else str(raw).strip().lower() in {"true", "yes", "1", "có", "co"}
            if value != bool(row.get(key)):
                before[key], new_values[key] = bool(row.get(key)), value
                lines.append(f"{key}: {'yes' if row.get(key) else 'no'} → {'yes' if value else 'no'}")
        else:
            limit = TEXT_COLUMNS.get(key) or METADATA_TEXT_KEYS[key]
            value = str(raw if raw is not None else "").strip()
            if len(value) > limit:
                raise ClinicEditError(f"{key} is too long (max {limit} characters).", f"{key} quá dài (tối đa {limit} ký tự).")
            current = _current_value(row, key)
            if value != (current or ""):
                before[key], new_values[key] = current, value
                lines.append(f"{key}: {_show(current, 80)} → {_show(value, 80)}")

    # Keep the text visitors actually read in step with the languages (unless the user rewrote that text themselves).
    if "languages" in changes:
        for field in SYNCED_TEXT_FIELDS:
            if field in changes:
                continue
            current = _current_value(row, field) if field != "description" else row.get("description")
            if not current:
                continue
            synced = sync_language_sentence(str(current), final_languages)
            if synced != current:
                before[field], new_values[field] = current, synced
                old_sentence = _LANG_SENTENCE.search(str(current))
                lines.append(
                    f"{'Văn bản trên trang' if vi else 'Text on the page'} ({field}): "
                    f"“…{old_sentence.group(0) if old_sentence else ''}” → “…{_LANG_SENTENCE.search(synced).group(0)}”"
                )

    if not new_values:
        raise ClinicEditError(
            f"Nothing to change: {row['name']} already has these values.",
            f"Không có gì để đổi: {row['name']} đã đúng như vậy rồi (cả ngôn ngữ lẫn đoạn văn bản trên trang).",
        )
    from grounded_content import CONTENT_FIELDS, available as ai_available

    i18n_note = bool(metadata.get("i18n")) and any(k in new_values for k in SYNCED_TEXT_FIELDS + ("languages",))
    auto_translate = ai_available() and bool(set(new_values) & CONTENT_FIELDS)
    return EditPlan(
        clinic_id=str(row["id"]), slug=row.get("slug") or "", name=row.get("name") or "",
        changes=new_values, before=before, lines=lines + ([
            ("Bản dịch VI/KO/ZH của các đoạn này sẽ được cập nhật tự động." if vi else "The VI/KO/ZH translations of these texts will be updated automatically.")
            if auto_translate else
            ("Bản dịch VI/KO/ZH của các đoạn này chưa được cập nhật (chạy /rescan_clinic để tạo lại)." if vi
             else "The VI/KO/ZH translations of these texts are NOT updated (run /rescan_clinic to regenerate them).")
        ] if i18n_note else []),
        candidates=[r.get("slug", "") for r in rows if r is not row],
    )


def plan_to_dict(plan: EditPlan) -> dict:
    return {"clinic_id": plan.clinic_id, "slug": plan.slug, "name": plan.name, "changes": plan.changes,
            "before": plan.before, "lines": plan.lines}


def plan_from_dict(data: dict) -> EditPlan:
    return EditPlan(data["clinic_id"], data["slug"], data["name"], data["changes"], data["before"], data.get("lines", []))


def _db():
    from pg_client import create_client

    return create_client()


def _write_values(plan_changes: Dict[str, Any], owner_confirmed: bool) -> tuple:
    """Build the UPDATE for the new values. Returns (set_sql, params)."""
    from psycopg2.extras import Json

    sets, params = [], []
    meta_patch: Dict[str, Any] = {}
    for key, value in plan_changes.items():
        if key in METADATA_TEXT_KEYS:
            meta_patch[key] = value
        elif key == "languages":
            sets.append("languages = %s::text[]")
            params.append(list(value))
            if owner_confirmed:
                meta_patch["languages_verified"] = True
        else:
            sets.append(f"{key} = %s")  # key is whitelisted above: never user text
            params.append(value)
    if meta_patch:
        sets.append("metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb")
        params.append(Json(meta_patch))
    return ", ".join(sets), params


def refresh_clinic_translations(clinic_id: str, changed_fields: set, lang: str = "en") -> str:
    """After an edit: translate ONLY the changed texts into VI/KO/ZH (faithfully, verified). Returns a short note."""
    import grounded_content as gc

    changed = set(changed_fields) & gc.CONTENT_FIELDS
    if not changed:
        return ""
    vi = lang == "vi"
    if not gc.available():
        return ("ℹ️ Bản dịch VI/KO/ZH chưa được cập nhật (chưa có OPENROUTER_API_KEY). Chạy /rescan_clinic để tạo lại." if vi
                else "ℹ️ VI/KO/ZH translations were not updated (no OPENROUTER_API_KEY). Run /rescan_clinic to regenerate them.")
    try:
        from psycopg2.extras import Json

        db = _db()
        rows = db.query("SELECT description, metadata FROM public.clinics WHERE id = %s", (clinic_id,))
        if not rows:
            return ""
        meta = rows[0].get("metadata") or {}
        english = {"description": rows[0].get("description"), **{k: meta.get(k) for k in gc.CONTENT_FIELDS if k != "description"}}
        i18n, status = gc.refresh_translations(english, meta.get("i18n"), changed, gc._default_llm)
        db.query("UPDATE public.clinics SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb WHERE id = %s", (Json({"i18n": i18n}), clinic_id))
        failed = [code for code, state in status.items() if state == "failed"]
        if failed:
            return (f"⚠️ Không dịch được sang: {', '.join(failed)} (chạy /rescan_clinic để thử lại)." if vi
                    else f"⚠️ Could not translate into: {', '.join(failed)} (run /rescan_clinic to retry).")
        return "🌐 Bản dịch VI/KO/ZH đã được cập nhật." if vi else "🌐 VI/KO/ZH translations were updated."
    except Exception as exc:
        print(f"[!] Translation refresh failed: {exc!r}")
        return "⚠️ Không cập nhật được bản dịch." if vi else "⚠️ Could not update the translations."


def apply_clinic_edit(plan: EditPlan, actor: str, lang: str = "en") -> str:
    from psycopg2.extras import Json

    vi = lang == "vi"

    for key in plan.changes:
        if key not in ALLOWED_FIELDS:
            raise ClinicEditError(f"Field not editable: {key}")
    db = _db()
    with db.transaction() as tx:
        rows = tx.query("SELECT * FROM public.clinics WHERE id = %s FOR UPDATE", (plan.clinic_id,))
        if not rows:
            raise ClinicEditError("That clinic no longer exists.", "Clinic này không còn tồn tại.")
        row = rows[0]
        for key, old in plan.before.items():
            now = _current_value(row, key)
            if key == "languages":
                now = [str(x) for x in (now or [])]
            if now != old and not (now in (None, "") and old in (None, "")):
                raise ClinicEditError(
                    f"{plan.name} was changed by someone else after the preview ({key}). Nothing was applied; ask again.",
                    f"{plan.name} vừa được ai đó sửa sau khi xem trước ({key}). Chưa áp dụng gì cả, bạn yêu cầu lại giúp mình.",
                )
        set_sql, params = _write_values(plan.changes, owner_confirmed=True)
        tx.query(f"UPDATE public.clinics SET {set_sql} WHERE id = %s", (*params, plan.clinic_id))
        tx.query(
            "INSERT INTO public.audit_log (actor, action, target_type, target_id, target_label, details) "
            "VALUES (%s, 'clinic.edit', 'clinic', %s, %s, %s)",
            (actor, plan.clinic_id, plan.slug, Json({"before": plan.before, "after": plan.changes})),
        )
    from revalidate import revalidate_clinic

    live = revalidate_clinic(plan.slug)
    translated = refresh_clinic_translations(plan.clinic_id, set(plan.changes), lang)
    return "\n".join([
        f"✅ {'Đã cập nhật' if vi else 'Updated'} {plan.name}", *[f"• {line}" for line in plan.lines], live,
        *([translated] if translated else []),
        f"↩️ {'Hoàn tác trong' if vi else 'Undo within'} {UNDO_WINDOW_DAYS} {'ngày' if vi else 'days'}: /clinic_undo {plan.slug}",
    ])


def undo_clinic_edit(target: str, actor: str, lang: str = "en") -> str:
    from psycopg2.extras import Json

    vi = lang == "vi"

    rows = _find_rows(target)
    exact = [r for r in rows if str(target).strip().lower() in {str(r.get("slug", "")).lower(), str(r.get("name", "")).lower()}]
    if not rows or (len(rows) > 1 and len(exact) != 1):
        raise ClinicEditError(
            f"I need exactly one clinic to undo (got {len(rows)} for “{target}”). Use the slug.",
            f"Mình cần đúng một clinic để hoàn tác (tìm thấy {len(rows)} cho “{target}”). Bạn dùng slug nhé.",
        )
    clinic = exact[0] if exact else rows[0]
    db = _db()
    with db.transaction() as tx:
        locked = tx.query("SELECT * FROM public.clinics WHERE id = %s FOR UPDATE", (str(clinic["id"]),))[0]
        logs = tx.query(
            "SELECT id, details FROM public.audit_log WHERE action = 'clinic.edit' AND target_type = 'clinic' "
            "AND target_id = %s AND created_at > now() - make_interval(days => %s) ORDER BY id DESC LIMIT 1",
            (str(clinic["id"]), UNDO_WINDOW_DAYS),
        )
        if not logs:
            raise ClinicEditError(
                f"No edit of {clinic['name']} to undo in the last {UNDO_WINDOW_DAYS} days.",
                f"Không có thay đổi nào của {clinic['name']} để hoàn tác trong {UNDO_WINDOW_DAYS} ngày qua.",
            )
        details = logs[0]["details"]
        details = json.loads(details) if isinstance(details, str) else details
        for key, new in details["after"].items():
            now = _current_value(locked, key)
            if key == "languages":
                now = [str(x) for x in (now or [])]
            if now != new:
                raise ClinicEditError(
                    f"{clinic['name']} was edited again after that change ({key}), so I will not overwrite it. "
                    "Change it directly instead.",
                    f"{clinic['name']} đã được sửa tiếp sau thay đổi đó ({key}), nên mình không ghi đè. Bạn sửa trực tiếp giúp mình nhé.",
                )
        restore = {k: (v if v is not None else "") for k, v in details["before"].items()}
        set_sql, params = _write_values(restore, owner_confirmed=False)
        tx.query(f"UPDATE public.clinics SET {set_sql} WHERE id = %s", (*params, str(clinic["id"])))
        # the undone entry must not be undone twice
        tx.query("UPDATE public.audit_log SET action = 'clinic.edit.undone' WHERE id = %s", (logs[0]["id"],))
        tx.query(
            "INSERT INTO public.audit_log (actor, action, target_type, target_id, target_label, details) "
            "VALUES (%s, 'clinic.undo', 'clinic', %s, %s, %s)",
            (actor, str(clinic["id"]), clinic.get("slug"), Json({"restored": details["before"]})),
        )
    from revalidate import revalidate_clinic

    restored = f"Đã khôi phục {clinic['name']} về trước lần sửa gần nhất." if vi else f"Restored {clinic['name']} to before the last edit."
    translated = refresh_clinic_translations(str(clinic["id"]), set(details["before"]), lang)
    return "\n".join(filter(None, [f"↩️ {restored}", revalidate_clinic(clinic.get('slug') or ''), translated]))

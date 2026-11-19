"""
user_admin.py — user management for the OpenClaw bot.

What it does (all through PostgreSQL, one audit-log row per change):
  * list / show users (by e-mail);
  * invite a new user: a one-time link, the invited person sets their OWN password;
  * change a user's role;
  * disable a user (kept for 30 days and restorable), restore, and purge users disabled > 30 days ago.

Design rules
  * Targets are resolved by EXACT e-mail only, never by fuzzy matching or by an LLM guess.
  * The last active superadmin can never be demoted or disabled.
  * Passwords never pass through Telegram. Invite tokens are stored only as a SHA-256 hash and the link
    is delivered once, out of band (not in the job output that is logged and kept in chat memory).
  * Expected refusals print a "[!] ..." line and return False; unexpected problems raise.
"""

from __future__ import annotations

import hashlib
import os
import re
import secrets
from datetime import timezone
from typing import Optional

from pg_client import create_client
from progress import send_private

VALID_ROLES = ("user", "provider", "admin", "superadmin")
DISABLE_RETENTION_DAYS = 30
INVITE_TTL_HOURS = 72
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")

# Same objects as postgres/migrations/20261120_user_management.sql (kept in code so the bot can upgrade
# an existing database on its own; every statement is idempotent).
_SCHEMA_STATEMENTS = (
    "ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ",
    "ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ",
    """CREATE TABLE IF NOT EXISTS public.user_invites (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         email TEXT NOT NULL,
         role TEXT NOT NULL CHECK (role IN ('user', 'provider', 'admin', 'superadmin')),
         token_hash TEXT NOT NULL UNIQUE,
         created_by TEXT NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         expires_at TIMESTAMPTZ NOT NULL,
         used_at TIMESTAMPTZ)""",
    "CREATE INDEX IF NOT EXISTS idx_user_invites_email ON public.user_invites (lower(email))",
    """CREATE TABLE IF NOT EXISTS public.audit_log (
         id BIGSERIAL PRIMARY KEY,
         actor TEXT NOT NULL,
         action TEXT NOT NULL,
         target_type TEXT,
         target_id TEXT,
         target_label TEXT,
         details JSONB NOT NULL DEFAULT '{}'::JSONB,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",
    "CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_audit_log_target ON public.audit_log (target_type, target_id)",
)

_schema_ready = False


def ensure_schema() -> None:
    """Create the user-management objects if they are missing (once per process)."""
    global _schema_ready
    if _schema_ready:
        return
    db = create_client()
    with db.transaction() as tx:
        for statement in _SCHEMA_STATEMENTS:
            tx.query(statement)
    _schema_ready = True


# --------------------------------------------------------------------------- helpers

def normalize_email(email: str) -> Optional[str]:
    value = (email or "").strip().lower()
    if len(value) > 254 or not EMAIL_RE.match(value):
        return None
    return value


def mask_email(email: str) -> str:
    local, _, domain = (email or "").partition("@")
    return f"{local[:1]}***@{domain}" if domain else "***"


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _site_url() -> str:
    for name in ("OPENCLAW_SITE_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_BASE_URL"):
        value = (os.environ.get(name) or "").strip().rstrip("/")
        if value and "localhost" not in value:
            return value
    return ""


def _fmt(ts) -> str:
    if not ts:
        return "never"
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _audit(
    tx, actor: str, action: str, target_id: str, target_label: str,
    details: Optional[dict] = None, target_type: str = "user",
) -> None:
    from psycopg2.extras import Json

    tx.query(
        "INSERT INTO public.audit_log (actor, action, target_type, target_id, target_label, details) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (actor, action, target_type, target_id, target_label, Json(details or {})),
    )


_USER_SQL = (
    "SELECT u.id::text AS id, u.email, u.disabled_at, u.created_at, u.last_sign_in_at, "
    "       COALESCE(r.role, 'provider') AS role, "
    "       (u.disabled_at IS NOT NULL AND u.disabled_at > now() - make_interval(days => %s)) AS restorable "
    "FROM auth.users u LEFT JOIN public.user_roles r ON r.user_id = u.id "
    "WHERE lower(u.email) = %s"
)


def _get_user(tx, email: str, lock: bool = False) -> Optional[dict]:
    rows = tx.query(_USER_SQL + (" FOR UPDATE OF u" if lock else ""), (DISABLE_RETENTION_DAYS, email))
    return rows[0] if rows else None


def _take_superadmin_guard(tx) -> None:
    """Serialise every change that could remove a superadmin.

    Without one global lock taken FIRST, two concurrent demotions each lock their own row and then wait
    for the other's (deadlock), or both see "another superadmin exists" and remove the last two.
    """
    tx.query("SELECT pg_advisory_xact_lock(hashtext('ahh_superadmin_guard'))")


def _lock_and_count_active_superadmins(tx) -> int:
    rows = tx.query(
        "SELECT u.id FROM auth.users u JOIN public.user_roles r ON r.user_id = u.id "
        "WHERE r.role = 'superadmin' AND u.disabled_at IS NULL FOR UPDATE OF u"
    )
    return len(rows)


def _refuse(message: str) -> bool:
    print(f"[!] {message}")
    return False


def _bad_email(email: str) -> bool:
    return _refuse(f"'{(email or '')[:80]}' is not a valid e-mail address.")


# --------------------------------------------------------------------------- read-only

def user_brief(email: str) -> Optional[dict]:
    """Small dict for confirmation messages, or None when there is no such user."""
    ensure_schema()
    value = normalize_email(email)
    if not value:
        return None
    db = create_client()
    with db.transaction() as tx:
        return _get_user(tx, value)


def purgeable_count() -> int:
    ensure_schema()
    rows = create_client().query(
        "SELECT count(*) AS n FROM auth.users WHERE disabled_at IS NOT NULL "
        "AND disabled_at <= now() - make_interval(days => %s)",
        (DISABLE_RETENTION_DAYS,),
    )
    return int(rows[0]["n"])


def list_users(query: str = "", limit: int = 20) -> None:
    ensure_schema()
    limit = max(1, min(int(limit or 20), 50))
    needle = (query or "").strip()
    sql = (
        "SELECT u.email, u.disabled_at, u.created_at, u.last_sign_in_at, COALESCE(r.role, 'provider') AS role, "
        "       (u.disabled_at IS NOT NULL AND u.disabled_at > now() - make_interval(days => %s)) AS restorable "
        "FROM auth.users u LEFT JOIN public.user_roles r ON r.user_id = u.id "
    )
    params: list = [DISABLE_RETENTION_DAYS]
    if needle:
        sql += "WHERE u.email ILIKE %s "
        params.append("%" + needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
    sql += "ORDER BY u.created_at DESC LIMIT %s"
    params.append(limit)
    rows = create_client().query(sql, params)

    if not rows:
        print("[*] No users found." if needle else "[*] There are no users yet.")
        return
    print(f"[*] {len(rows)} user(s){' matching ' + repr(needle) if needle else ''}:\n")
    for index, row in enumerate(rows, 1):
        if row["disabled_at"]:
            until = ""
            if row["restorable"]:
                until = f", restorable until {_fmt(row['disabled_at'] + _days(DISABLE_RETENTION_DAYS))}"
            else:
                until = ", PAST the 30-day window (eligible for /users_purge)"
            status = f"DISABLED{until}"
        else:
            status = "active"
        print(
            f"[{index}] {row['email']} — {row['role']} — {status}\n"
            f"    created {_fmt(row['created_at'])} | last sign-in {_fmt(row['last_sign_in_at'])}"
        )
    waiting = purgeable_count()
    if waiting:
        print(f"\n{waiting} disabled user(s) are past the 30-day window: /users_purge")


def _days(n: int):
    from datetime import timedelta

    return timedelta(days=n)


def show_user(email: str) -> None:
    ensure_schema()
    value = normalize_email(email)
    if not value:
        _bad_email(email)
        return
    db = create_client()
    with db.transaction() as tx:
        user = _get_user(tx, value)
        if not user:
            _refuse(f"No user with e-mail {value}.")
            return
        clinics = tx.query("SELECT name, slug FROM public.clinics WHERE claimed_by = %s::uuid ORDER BY name", (user["id"],))
        history = tx.query(
            "SELECT created_at, actor, action FROM public.audit_log "
            "WHERE target_type = 'user' AND target_id = %s ORDER BY created_at DESC LIMIT 5",
            (user["id"],),
        )
    status = "active"
    if user["disabled_at"]:
        status = "DISABLED " + _fmt(user["disabled_at"]) + (
            " (restorable)" if user["restorable"] else " (past the 30-day window)"
        )
    print(f"[*] {user['email']}\n    role: {user['role']}\n    status: {status}")
    print(f"    created: {_fmt(user['created_at'])}\n    last sign-in: {_fmt(user['last_sign_in_at'])}")
    print("    claimed clinics: " + (", ".join(f"{c['name']} ({c['slug']})" for c in clinics) if clinics else "none"))
    if history:
        print("    recent changes:")
        for h in history:
            print(f"      {_fmt(h['created_at'])}  {h['action']}  by {h['actor']}")


# --------------------------------------------------------------------------- changes

def create_invite(email: str, role: str, actor: str) -> bool:
    """Create a one-time invite link (valid INVITE_TTL_HOURS). The link is delivered out of band."""
    ensure_schema()
    value = normalize_email(email)
    if not value:
        return _bad_email(email)
    if role not in VALID_ROLES:
        return _refuse(f"Invalid role '{role}'. Use one of: {', '.join(VALID_ROLES)}.")

    token = secrets.token_urlsafe(32)
    db = create_client()
    with db.transaction() as tx:
        existing = _get_user(tx, value)
        if existing:
            where = "is DISABLED (use /user_restore)" if existing["disabled_at"] else f"already has an account ({existing['role']})"
            return _refuse(f"{value} {where}. Use /user_role to change a role.")
        # Only the newest invite for an e-mail address works.
        tx.query(
            "UPDATE public.user_invites SET expires_at = now() "
            "WHERE lower(email) = %s AND used_at IS NULL AND expires_at > now()",
            (value,),
        )
        rows = tx.query(
            "INSERT INTO public.user_invites (email, role, token_hash, created_by, expires_at) "
            "VALUES (%s, %s, %s, %s, now() + make_interval(hours => %s)) RETURNING id::text AS id, expires_at",
            (value, role, hash_token(token), actor, INVITE_TTL_HOURS),
        )
        expires = rows[0]["expires_at"]
        _audit(
            tx, actor, "user.invite_created", rows[0]["id"], value,
            {"role": role, "expires_at": expires.isoformat()}, target_type="invite",
        )

    path = f"/auth/accept-invite?token={token}"
    base = _site_url()
    link = f"{base}{path}" if base else path
    print(f"[+] Invite created for {value} as '{role}', valid {INVITE_TTL_HOURS}h, single use.")
    message = (
        f"🔗 Invite link for {value} ({role}, expires {_fmt(expires)}):\n{link}\n\n"
        + ("" if base else "Add your website address in front of the link (set OPENCLAW_SITE_URL to do it automatically).\n")
        + "Send it only to that person: whoever opens it can create the account. It works once."
    )
    if send_private(message):
        print("    The link was sent to you in a separate message (it is never written to the log).")
    else:  # running from a terminal, not from the bot
        print("    " + message.replace("\n", "\n    "))
    return True


def set_role(email: str, role: str, actor: str) -> bool:
    ensure_schema()
    value = normalize_email(email)
    if not value:
        return _bad_email(email)
    if role not in VALID_ROLES:
        return _refuse(f"Invalid role '{role}'. Use one of: {', '.join(VALID_ROLES)}.")

    db = create_client()
    with db.transaction() as tx:
        _take_superadmin_guard(tx)
        user = _get_user(tx, value, lock=True)
        if not user:
            return _refuse(f"No user with e-mail {value}.")
        if user["disabled_at"]:
            return _refuse(f"{value} is disabled. Restore the account first (/user_restore).")
        if user["role"] == role:
            return _refuse(f"{value} already has the role '{role}'.")
        if user["role"] == "superadmin" and role != "superadmin" and _lock_and_count_active_superadmins(tx) <= 1:
            return _refuse("This is the last active superadmin: it cannot be demoted. Promote another user first.")
        tx.query(
            "INSERT INTO public.user_roles (user_id, role) VALUES (%s::uuid, %s) "
            "ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role",
            (user["id"], role),
        )
        _audit(tx, actor, "user.role_changed", user["id"], value, {"from": user["role"], "to": role})
    print(f"[+] {value}: {user['role']} -> {role}")
    return True


def disable_user(email: str, actor: str) -> bool:
    ensure_schema()
    value = normalize_email(email)
    if not value:
        return _bad_email(email)
    db = create_client()
    with db.transaction() as tx:
        _take_superadmin_guard(tx)
        user = _get_user(tx, value, lock=True)
        if not user:
            return _refuse(f"No user with e-mail {value}.")
        if user["disabled_at"]:
            return _refuse(f"{value} is already disabled.")
        if user["role"] == "superadmin" and _lock_and_count_active_superadmins(tx) <= 1:
            return _refuse("This is the last active superadmin: it cannot be disabled. Promote another user first.")
        tx.query("UPDATE auth.users SET disabled_at = now(), updated_at = now() WHERE id = %s::uuid", (user["id"],))
        _audit(tx, actor, "user.disabled", user["id"], value, {"role": user["role"]})
    print(
        f"[+] {value} is disabled: they can no longer sign in and their sessions stopped working.\n"
        f"    You can restore them for {DISABLE_RETENTION_DAYS} days: /user_restore {value}"
    )
    return True


def restore_user(email: str, actor: str) -> bool:
    ensure_schema()
    value = normalize_email(email)
    if not value:
        return _bad_email(email)
    db = create_client()
    with db.transaction() as tx:
        user = _get_user(tx, value, lock=True)
        if not user:
            return _refuse(f"No user with e-mail {value}.")
        if not user["disabled_at"]:
            return _refuse(f"{value} is not disabled.")
        if not user["restorable"]:
            return _refuse(
                f"{value} was disabled more than {DISABLE_RETENTION_DAYS} days ago and can no longer be restored. "
                "Invite them again with /user_add."
            )
        tx.query("UPDATE auth.users SET disabled_at = NULL, updated_at = now() WHERE id = %s::uuid", (user["id"],))
        _audit(tx, actor, "user.restored", user["id"], value, {"role": user["role"]})
    print(f"[+] {value} is active again (role: {user['role']}).")
    return True


def purge_disabled_users(actor: str) -> bool:
    """Permanently delete users disabled more than DISABLE_RETENTION_DAYS ago. Their clinics are released."""
    ensure_schema()
    db = create_client()
    purged = []
    with db.transaction() as tx:
        rows = tx.query(
            "SELECT id::text AS id, email FROM auth.users WHERE disabled_at IS NOT NULL "
            "AND disabled_at <= now() - make_interval(days => %s) FOR UPDATE",
            (DISABLE_RETENTION_DAYS,),
        )
        for row in rows:
            released = tx.query(
                "UPDATE public.clinics SET claimed_by = NULL, is_claimed = false "
                "WHERE claimed_by = %s::uuid RETURNING id",
                (row["id"],),
            )
            tx.query("DELETE FROM auth.users WHERE id = %s::uuid", (row["id"],))  # roles/claims cascade
            _audit(
                tx, actor, "user.purged", row["id"], mask_email(row["email"]),
                {"clinics_released": len(released)},
            )
            purged.append((row["email"], len(released)))
    if not purged:
        print("[*] Nothing to purge: no user has been disabled for more than 30 days.")
        return True
    print(f"[+] Permanently deleted {len(purged)} user(s):")
    for email, released in purged:  # masked: this output is logged
        print(f"    - {mask_email(email)}" + (f" ({released} clinic(s) released)" if released else ""))
    return True

"""
User management against a REAL PostgreSQL. Each test module run gets its own throw-away database
(created from postgres/init/01_schema.sql) so that "last superadmin" rules are deterministic.

Skipped when OPENCLAW_TEST_DATABASE_URL is unset or `psql` is not installed.
"""

import os
import re
import shutil
import subprocess
import sys
import threading
from urllib.parse import urlparse, urlunparse

import psycopg2
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

BASE_URL = os.environ.get("OPENCLAW_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not BASE_URL or not shutil.which("psql"), reason="needs OPENCLAW_TEST_DATABASE_URL and psql"
)

DB_NAME = "ahh_test_users"
ACTOR = "telegram:42"
SCHEMA_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "postgres", "init", "01_schema.sql")


def _url_for(dbname):
    parts = urlparse(BASE_URL)
    return urlunparse(parts._replace(path="/" + dbname))


@pytest.fixture(scope="module")
def db_url():
    admin = psycopg2.connect(BASE_URL)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute(f"DROP DATABASE IF EXISTS {DB_NAME}")
        cur.execute(f"CREATE DATABASE {DB_NAME}")
    admin.close()
    # the schema file also tries to create the pgvector extension, which may not exist: ignore those errors
    subprocess.run(["psql", "-q", "-d", _url_for(DB_NAME), "-f", SCHEMA_FILE], capture_output=True)
    yield _url_for(DB_NAME)
    admin = psycopg2.connect(BASE_URL)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute(f"DROP DATABASE IF EXISTS {DB_NAME}")
    admin.close()


@pytest.fixture()
def ua(db_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.delenv("OPENCLAW_SITE_URL", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_SITE_URL", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_BASE_URL", raising=False)
    import pg_client
    import progress
    import user_admin

    monkeypatch.setattr(pg_client, "_INSTANCE", None)
    monkeypatch.setattr(user_admin, "_schema_ready", False)
    progress.clear_progress_callback()
    db = pg_client.create_client()
    for table in ("audit_log", "user_invites"):
        try:
            db.query(f"DELETE FROM public.{table}")
        except Exception:
            pass
    user_admin.ensure_schema()
    db.query("DELETE FROM public.clinics")
    db.query("DELETE FROM auth.users")
    yield user_admin
    progress.clear_progress_callback()
    db.close()


def _add_user(email, role="provider", disabled_days_ago=None):
    import pg_client

    db = pg_client.create_client()
    row = db.query(
        "INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data) VALUES (%s, 'x', '{}'::jsonb) RETURNING id::text AS id",
        (email,),
    )[0]
    db.query("INSERT INTO public.user_roles (user_id, role) VALUES (%s::uuid, %s)", (row["id"], role))
    if disabled_days_ago is not None:
        db.query(
            "UPDATE auth.users SET disabled_at = now() - make_interval(days => %s) WHERE id = %s::uuid",
            (disabled_days_ago, row["id"]),
        )
    return row["id"]


def _q(sql, params=None):
    import pg_client

    return pg_client.create_client().query(sql, params)


def _role(email):
    rows = _q("SELECT r.role FROM auth.users u JOIN public.user_roles r ON r.user_id=u.id WHERE u.email=%s", (email,))
    return rows[0]["role"] if rows else None


def _audit_actions():
    return [r["action"] for r in _q("SELECT action FROM public.audit_log ORDER BY id")]


# ------------------------------------------------------------------ helpers & schema

def test_schema_is_created_and_idempotent(ua):
    ua._schema_ready = False
    ua.ensure_schema()
    ua.ensure_schema()
    cols = {r["column_name"] for r in _q(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='auth' AND table_name='users'")}
    assert {"disabled_at", "last_sign_in_at"} <= cols
    tables = {r["table_name"] for r in _q(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'")}
    assert {"user_invites", "audit_log"} <= tables


def test_email_helpers(ua):
    assert ua.normalize_email("  Ann@Example.COM ") == "ann@example.com"
    for bad in ("", "no-at", "a@b", "x' OR '1'='1@a.co", "a b@c.co", "a@" + "b" * 260 + ".com", None):
        assert ua.normalize_email(bad) is None
    assert ua.mask_email("ann@example.com") == "a***@example.com"
    assert len(ua.hash_token("t")) == 64


# ------------------------------------------------------------------ invites

def test_invite_stores_only_a_hash_and_delivers_the_link_out_of_band(ua, capsys):
    import progress

    sent = []
    progress.set_progress_callback(sent.append)
    assert ua.create_invite("New.Person@Example.com", "provider", ACTOR) is True

    out = capsys.readouterr().out
    assert "Invite created for new.person@example.com" in out
    assert "token=" not in out, "the one-time link must never be printed into the (logged) job output"
    assert len(sent) == 1 and "token=" in sent[0]

    token = re.search(r"token=([A-Za-z0-9_\-]+)", sent[0]).group(1)
    row = _q("SELECT * FROM public.user_invites")[0]
    assert row["email"] == "new.person@example.com" and row["role"] == "provider"
    assert row["token_hash"] == ua.hash_token(token) and token not in str(row)
    assert row["used_at"] is None and row["created_by"] == ACTOR
    assert "user.invite_created" in _audit_actions()
    assert token not in str(_q("SELECT details FROM public.audit_log"))


def test_invite_link_uses_the_configured_site_url(ua, monkeypatch):
    import progress

    monkeypatch.setenv("OPENCLAW_SITE_URL", "https://hub.example.org/")
    sent = []
    progress.set_progress_callback(sent.append)
    ua.create_invite("a@example.com", "user", ACTOR)
    assert "https://hub.example.org/auth/accept-invite?token=" in sent[0]


def test_without_a_callback_the_link_is_printed_for_terminal_use(ua, capsys):
    ua.create_invite("t@example.com", "user", ACTOR)
    assert "token=" in capsys.readouterr().out


def test_invite_refusals(ua, capsys):
    _add_user("exists@example.com", "admin")
    _add_user("gone@example.com", "user", disabled_days_ago=1)
    assert ua.create_invite("not-an-email", "user", ACTOR) is False
    assert ua.create_invite("x@example.com", "owner", ACTOR) is False
    assert ua.create_invite("exists@example.com", "user", ACTOR) is False
    assert ua.create_invite("gone@example.com", "user", ACTOR) is False
    out = capsys.readouterr().out
    assert "not a valid e-mail" in out and "Invalid role" in out
    assert "already has an account (admin)" in out and "/user_restore" in out
    assert _q("SELECT count(*) AS n FROM public.user_invites")[0]["n"] == 0


def test_a_newer_invite_cancels_the_older_one(ua):
    ua.create_invite("dup@example.com", "user", ACTOR)
    ua.create_invite("dup@example.com", "provider", ACTOR)
    rows = _q("SELECT role, expires_at > now() AS live FROM public.user_invites ORDER BY created_at")
    assert [(r["role"], r["live"]) for r in rows] == [("user", False), ("provider", True)]


# ------------------------------------------------------------------ roles

def test_set_role_changes_role_and_audits_it(ua, capsys):
    _add_user("a@example.com", "provider")
    assert ua.set_role("A@Example.com", "admin", ACTOR) is True
    assert _role("a@example.com") == "admin"
    row = _q("SELECT * FROM public.audit_log WHERE action='user.role_changed'")[0]
    assert row["actor"] == ACTOR and row["details"] == {"from": "provider", "to": "admin"}
    assert "provider -> admin" in capsys.readouterr().out


def test_set_role_refusals_change_nothing(ua, capsys):
    _add_user("a@example.com", "provider")
    _add_user("off@example.com", "user", disabled_days_ago=2)
    assert ua.set_role("a@example.com", "provider", ACTOR) is False       # same role
    assert ua.set_role("a@example.com", "root", ACTOR) is False           # invalid role
    assert ua.set_role("nobody@example.com", "user", ACTOR) is False      # unknown
    assert ua.set_role("off@example.com", "admin", ACTOR) is False        # disabled
    assert ua.set_role("bad", "admin", ACTOR) is False                    # invalid e-mail
    assert _role("a@example.com") == "provider" and _role("off@example.com") == "user"
    assert _audit_actions() == []


def test_targets_are_matched_by_exact_email_only(ua):
    _add_user("ann@example.com", "user")
    _add_user("ann@example.com.au", "user")
    _add_user("joann@example.com", "user")
    assert ua.set_role("ann@example.com", "admin", ACTOR) is True
    assert _role("ann@example.com.au") == "user" and _role("joann@example.com") == "user"


def test_last_superadmin_cannot_be_demoted_or_disabled(ua, capsys):
    _add_user("boss@example.com", "superadmin")
    assert ua.set_role("boss@example.com", "admin", ACTOR) is False
    assert ua.disable_user("boss@example.com", ACTOR) is False
    assert "last active superadmin" in capsys.readouterr().out
    assert _role("boss@example.com") == "superadmin"
    assert _q("SELECT disabled_at FROM auth.users WHERE email='boss@example.com'")[0]["disabled_at"] is None


def test_with_two_superadmins_one_can_be_demoted_but_not_the_second(ua):
    _add_user("s1@example.com", "superadmin")
    _add_user("s2@example.com", "superadmin")
    assert ua.set_role("s1@example.com", "admin", ACTOR) is True
    assert ua.set_role("s2@example.com", "admin", ACTOR) is False
    assert _role("s2@example.com") == "superadmin"


def test_a_disabled_superadmin_does_not_count_as_active(ua):
    _add_user("s1@example.com", "superadmin")
    _add_user("s2@example.com", "superadmin", disabled_days_ago=1)
    assert ua.set_role("s1@example.com", "admin", ACTOR) is False  # s2 is disabled -> s1 is the last active


def test_concurrent_demotions_never_remove_the_last_superadmin(ua):
    _add_user("s1@example.com", "superadmin")
    _add_user("s2@example.com", "superadmin")
    barrier = threading.Barrier(2)
    results = {}

    def demote(email):
        barrier.wait()
        results[email] = ua.set_role(email, "admin", ACTOR)

    threads = [threading.Thread(target=demote, args=(e,)) for e in ("s1@example.com", "s2@example.com")]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(results.values()) == [False, True]
    assert _q("SELECT count(*) AS n FROM public.user_roles WHERE role='superadmin'")[0]["n"] == 1


# ------------------------------------------------------------------ disable / restore / purge

def test_disable_then_restore(ua, capsys):
    _add_user("a@example.com", "provider")
    assert ua.disable_user("a@example.com", ACTOR) is True
    assert _q("SELECT disabled_at FROM auth.users WHERE email='a@example.com'")[0]["disabled_at"] is not None
    assert "/user_restore a@example.com" in capsys.readouterr().out
    assert ua.disable_user("a@example.com", ACTOR) is False  # already disabled

    assert ua.restore_user("a@example.com", ACTOR) is True
    assert _q("SELECT disabled_at FROM auth.users WHERE email='a@example.com'")[0]["disabled_at"] is None
    assert _role("a@example.com") == "provider"  # role untouched
    assert ua.restore_user("a@example.com", ACTOR) is False  # not disabled
    assert _audit_actions() == ["user.disabled", "user.restored"]


def test_restore_is_refused_after_30_days(ua, capsys):
    _add_user("old@example.com", "user", disabled_days_ago=31)
    assert ua.restore_user("old@example.com", ACTOR) is False
    assert "can no longer be restored" in capsys.readouterr().out


def test_purge_deletes_only_users_disabled_for_more_than_30_days(ua):
    old = _add_user("old@example.com", "provider", disabled_days_ago=31)
    _add_user("recent@example.com", "provider", disabled_days_ago=5)
    _add_user("active@example.com", "provider")
    assert ua.purgeable_count() == 1

    assert ua.purge_disabled_users(ACTOR) is True

    emails = {r["email"] for r in _q("SELECT email FROM auth.users")}
    assert emails == {"recent@example.com", "active@example.com"}
    assert _q("SELECT count(*) AS n FROM public.user_roles WHERE user_id=%s::uuid", (old,))[0]["n"] == 0
    audit = _q("SELECT * FROM public.audit_log WHERE action='user.purged'")[0]
    assert audit["target_label"] == "o***@example.com"  # the audit trail keeps no full address
    assert ua.purgeable_count() == 0
    assert ua.purge_disabled_users(ACTOR) is True  # nothing left: harmless


def test_purge_releases_the_clinics_the_user_owned(ua):
    uid = _add_user("owner@example.com", "provider", disabled_days_ago=40)
    _q("INSERT INTO public.clinics (name, slug, claimed_by, is_claimed) VALUES ('Owned', 'owned', %s::uuid, true)", (uid,))
    ua.purge_disabled_users(ACTOR)
    row = _q("SELECT claimed_by, is_claimed FROM public.clinics WHERE slug='owned'")[0]
    assert row["claimed_by"] is None and row["is_claimed"] is False


# ------------------------------------------------------------------ reading

def test_list_users_shows_status_and_supports_search(ua, capsys):
    _add_user("alice@example.com", "admin")
    _add_user("bob@example.com", "provider", disabled_days_ago=3)
    _add_user("carol@example.com", "user", disabled_days_ago=40)

    ua.list_users("", 20)
    out = capsys.readouterr().out
    assert "alice@example.com — admin — active" in out
    assert "bob@example.com — provider — DISABLED, restorable until" in out
    assert "PAST the 30-day window" in out and "/users_purge" in out

    ua.list_users("alic", 20)
    out = capsys.readouterr().out
    assert "alice@example.com" in out and "bob@example.com" not in out


def test_search_treats_wildcards_literally(ua, capsys):
    _add_user("a_b@example.com", "user")
    _add_user("axb@example.com", "user")
    ua.list_users("a_b", 20)
    out = capsys.readouterr().out
    assert "a_b@example.com" in out and "axb@example.com" not in out
    ua.list_users("%", 20)
    assert "No users found" in capsys.readouterr().out


def test_show_user_lists_claimed_clinics_and_recent_changes(ua, capsys):
    uid = _add_user("owner@example.com", "provider")
    _q("INSERT INTO public.clinics (name, slug, claimed_by, is_claimed) VALUES ('My Clinic', 'my-clinic', %s::uuid, true)", (uid,))
    ua.set_role("owner@example.com", "admin", ACTOR)
    capsys.readouterr()
    ua.show_user("owner@example.com")
    out = capsys.readouterr().out
    assert "role: admin" in out and "My Clinic (my-clinic)" in out and "user.role_changed" in out and ACTOR in out
    ua.show_user("ghost@example.com")
    assert "No user with e-mail" in capsys.readouterr().out

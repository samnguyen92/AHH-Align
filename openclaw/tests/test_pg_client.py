"""
Tests for pg_client against a REAL PostgreSQL (they are skipped when none is configured).

Run (example):
    OPENCLAW_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/ahh_test \
        python -m pytest openclaw/tests/test_pg_client.py -q

The database needs the project schema (postgres/init/01_schema.sql); only the
`newsletter_subscriptions` table (unique `email`) is used here.
"""

import os
import sys
import threading
import unittest

import psycopg2
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

TEST_URL = os.environ.get("OPENCLAW_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_URL, reason="OPENCLAW_TEST_DATABASE_URL not set")

import pg_client  # noqa: E402

TABLE = "newsletter_subscriptions"


@pytest.fixture()
def client():
    c = pg_client.PGClient(TEST_URL)
    c.table(TABLE).delete().ilike("email", "pgtest-%").execute()
    yield c
    c.table(TABLE).delete().ilike("email", "pgtest-%").execute()
    c.close()


def test_crud_roundtrip(client):
    inserted = client.table(TABLE).insert({"email": "pgtest-1@example.com"}).execute()
    assert inserted.count == 1
    got = client.table(TABLE).select("id, email").eq("email", "pgtest-1@example.com").single().execute()
    assert got.data["email"] == "pgtest-1@example.com"
    client.table(TABLE).update({"email": "pgtest-2@example.com"}).eq("email", "pgtest-1@example.com").execute()
    assert client.table(TABLE).select("id", count="exact").eq("email", "pgtest-2@example.com").execute().count == 1
    deleted = client.table(TABLE).delete().eq("email", "pgtest-2@example.com").execute()
    assert deleted.count == 1


def test_failed_statement_does_not_poison_the_connection(client):
    """Regression: one SQL error used to make every later query fail ("transaction is aborted")."""
    client.table(TABLE).insert({"email": "pgtest-dup@example.com"}).execute()
    with pytest.raises(psycopg2.errors.UniqueViolation):
        client.table(TABLE).insert({"email": "pgtest-dup@example.com"}).execute()
    # the very next query on the same thread must work
    rows = client.table(TABLE).select("email").eq("email", "pgtest-dup@example.com").execute().data
    assert len(rows) == 1


def test_error_in_one_thread_does_not_break_other_threads(client):
    client.table(TABLE).insert({"email": "pgtest-t@example.com"}).execute()
    results = {}

    def bad():
        try:
            client.table(TABLE).insert({"email": "pgtest-t@example.com"}).execute()
        except Exception as exc:  # expected unique violation
            results["bad"] = type(exc).__name__

    def good():
        results["good"] = len(client.table(TABLE).select("id").execute().data)

    for fn in (bad, good):
        t = threading.Thread(target=fn)
        t.start()
        t.join()
    assert results["bad"] == "UniqueViolation"
    assert results["good"] >= 1


def test_each_thread_gets_its_own_connection(client):
    pids = {}

    def grab(name):
        client.table(TABLE).select("id").limit(1).execute()
        pids[name] = client._get_conn().get_backend_pid()

    threads = [threading.Thread(target=grab, args=(n,)) for n in ("a", "b")]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert pids["a"] != pids["b"]


def test_read_does_not_leave_transaction_open(client):
    client.table(TABLE).select("id").limit(1).execute()
    status = client._get_conn().get_transaction_status()
    assert status == psycopg2.extensions.TRANSACTION_STATUS_IDLE


def test_reconnects_after_connection_is_killed(client):
    client.table(TABLE).select("id").limit(1).execute()
    pid = client._get_conn().get_backend_pid()
    admin = psycopg2.connect(TEST_URL)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute("SELECT pg_terminate_backend(%s)", (pid,))
    admin.close()
    # first query after the kill may fail once; the client must recover for the next one
    try:
        client.table(TABLE).select("id").limit(1).execute()
    except psycopg2.Error:
        pass
    assert client.table(TABLE).select("id").limit(1).execute().data is not None


def test_statement_timeout_cancels_and_connection_recovers(client, monkeypatch):
    monkeypatch.setattr(pg_client, "STATEMENT_TIMEOUT_MS", 300)
    client.close()  # next connection picks up the patched timeout
    with pytest.raises(psycopg2.errors.QueryCanceled):
        client.rpc("pg_sleep", {"s": 3})
    assert client.table(TABLE).select("id").limit(1).execute().data is not None


@pytest.mark.parametrize(
    "bad",
    ['id"; DROP TABLE clinics;--', "name DESC, (select 1)", "metadata->>x", "", "a b"],
)
def test_invalid_identifiers_are_rejected(client, bad):
    with pytest.raises(ValueError):
        client.table(TABLE).eq(bad, 1)
    with pytest.raises(ValueError):
        client.table(TABLE).order(bad)
    with pytest.raises(ValueError):
        pg_client.TableQueryBuilder(client, bad)


def test_insert_and_update_reject_unsafe_column_names(client):
    with pytest.raises(ValueError):
        client.table(TABLE).insert({'email"; DROP': 1}).execute()
    with pytest.raises(ValueError):
        client.table(TABLE).update({'a" = 1, "b': 1}).eq("id", 1).execute()
    # nothing was sent; connection is still healthy
    assert client.table(TABLE).select("id").limit(1).execute().data is not None


def test_update_and_delete_require_a_where_condition(client):
    with pytest.raises(ValueError):
        client.table(TABLE).update({"email": "x"}).execute()
    with pytest.raises(ValueError):
        client.table(TABLE).delete().execute()


def test_select_column_list_is_validated(client):
    client.table(TABLE).select("id, email")
    client.table(TABLE).select("*")
    with pytest.raises(ValueError):
        client.table(TABLE).select("id, (select 1)")


def test_rpc_rejects_bad_function_names(client):
    with pytest.raises(ValueError):
        client.rpc("now(); DROP TABLE x", {})


def test_values_are_always_bound_parameters(client):
    evil = "x'; DROP TABLE newsletter_subscriptions; --"
    client.table(TABLE).insert({"email": "pgtest-" + evil}).execute()
    got = client.table(TABLE).select("email").eq("email", "pgtest-" + evil).execute().data
    assert len(got) == 1  # stored literally, table still exists


if __name__ == "__main__":
    unittest.main()


def test_lists_go_to_array_columns_as_arrays_and_to_jsonb_columns_as_json(client):
    """Regression: every list used to be sent as JSON, so TEXT[] columns (clinics.languages,
    articles.tags) rejected the write with 'malformed array literal'."""
    row = {
        "id": "00000000-0000-0000-0000-00000000bb01",
        "name": "PgClient Array Test",
        "slug": "pgclient-array-test",
        "languages": ["English", "Vietnamese"],      # TEXT[]
        "metadata": {"tags": ["a", "b"], "n": 1},    # jsonb (object containing a list)
    }
    try:
        client.table("clinics").delete().eq("slug", "pgclient-array-test").execute()
        client.table("clinics").insert(row).execute()
        got = client.table("clinics").select("languages, metadata").eq("slug", "pgclient-array-test").single().execute().data
        assert got["languages"] == ["English", "Vietnamese"]
        assert got["metadata"] == {"tags": ["a", "b"], "n": 1}

        # update path, and a top-level list stored in a jsonb column
        client.table("clinics").update({"languages": ["Korean"], "metadata": [1, 2, 3]}).eq("slug", "pgclient-array-test").execute()
        got = client.table("clinics").select("languages, metadata").eq("slug", "pgclient-array-test").single().execute().data
        assert got["languages"] == ["Korean"]
        assert got["metadata"] == [1, 2, 3]

        # upsert (what insert_clinic uses)
        client.table("clinics").upsert({**row, "languages": ["Chinese"], "metadata": {"x": 1}}).execute()
        got = client.table("clinics").select("languages").eq("slug", "pgclient-array-test").single().execute().data
        assert got["languages"] == ["Chinese"]
    finally:
        client.table("clinics").delete().eq("slug", "pgclient-array-test").execute()


def test_select_after_a_write_does_not_turn_it_into_a_select(client):
    """Regression: .update(...).select() must still write."""
    client.table(TABLE).insert({"email": "pgtest-sel@example.com"}).execute()
    client.table(TABLE).update({"email": "pgtest-sel2@example.com"}).eq("email", "pgtest-sel@example.com").select("id").execute()
    assert client.table(TABLE).select("id").eq("email", "pgtest-sel2@example.com").execute().data
    assert not client.table(TABLE).select("id").eq("email", "pgtest-sel@example.com").execute().data

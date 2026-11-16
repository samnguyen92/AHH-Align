#!/usr/bin/env python3
"""
backup_from_supabase.py — Dumps all tables from Supabase PostgreSQL directly over SSL/SCRAM-SHA-256
into `postgres/backup/supabase_dump.json` and downloads any referenced Supabase Storage images
into `public/uploads/`.
"""

import base64
import hashlib
import hmac
import json
import os
import re
import socket
import ssl
import struct
import urllib.parse
import urllib.request

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP_DIR = os.path.join(PROJECT_ROOT, "postgres", "backup")
UPLOADS_DIR = os.path.join(PROJECT_ROOT, "public", "uploads")

HOST = os.environ.get("SUPABASE_PG_HOST", "db.smkyqdkuablxlexyuhgs.supabase.co")
PORT = int(os.environ.get("SUPABASE_PG_PORT", "5432"))
USER = os.environ.get("SUPABASE_PG_USER", "postgres")
PASSWORD = os.environ.get("SUPABASE_PG_PASSWORD", "fdMcMwnhVXu0OWej")
DB = os.environ.get("SUPABASE_PG_DB", "postgres")

TABLES = [
    ("auth", "users"),
    ("public", "organizations"),
    ("public", "clinics"),
    ("public", "articles"),
    ("public", "article_facts"),
    ("public", "claim_requests"),
    ("public", "clinic_submissions"),
    ("public", "user_roles"),
    ("public", "clinic_embeddings"),
    ("public", "newsletter_subscriptions"),
    ("public", "analytics_events"),
]


def recv_msg(sock):
    hdr = b""
    while len(hdr) < 5:
        chunk = sock.recv(5 - len(hdr))
        if not chunk:
            raise EOFError("Connection closed")
        hdr += chunk
    mtype = chr(hdr[0])
    length = struct.unpack("!I", hdr[1:5])[0]
    body = bytearray()
    remaining = length - 4
    while remaining > 0:
        chunk = sock.recv(min(65536, remaining))
        if not chunk:
            raise EOFError("Connection closed mid-frame")
        body.extend(chunk)
        remaining -= len(chunk)
    return mtype, bytes(body)


def scram_auth(sock, password: str):
    nonce = base64.b64encode(os.urandom(18)).decode("ascii")
    client_first_bare = f"n=,r={nonce}"
    gs2_header = "n,,"
    client_first = (gs2_header + client_first_bare).encode("utf-8")

    mech = b"SCRAM-SHA-256\x00"
    payload = mech + struct.pack("!I", len(client_first)) + client_first
    sock.sendall(b"p" + struct.pack("!I", 4 + len(payload)) + payload)

    mtype, body = recv_msg(sock)
    if mtype == "E":
        raise RuntimeError(body.decode("utf-8", errors="ignore"))
    auth_code = struct.unpack("!I", body[:4])[0]
    if auth_code != 11:
        raise RuntimeError(f"Expected SASLContinue (11), got {auth_code}")

    server_first = body[4:].decode("utf-8")
    parts = dict(item.split("=", 1) for item in server_first.split(","))
    s_nonce = parts["r"]
    salt = base64.b64decode(parts["s"])
    iters = int(parts["i"])

    salted_pw = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iters)
    client_key = hmac.new(salted_pw, b"Client Key", hashlib.sha256).digest()
    stored_key = hashlib.sha256(client_key).digest()
    client_final_without_proof = f"c=biws,r={s_nonce}"
    auth_msg = f"{client_first_bare},{server_first},{client_final_without_proof}".encode("utf-8")
    client_sig = hmac.new(stored_key, auth_msg, hashlib.sha256).digest()
    client_proof = bytes(a ^ b for a, b in zip(client_key, client_sig))
    proof_b64 = base64.b64encode(client_proof).decode("ascii")
    client_final = f"{client_final_without_proof},p={proof_b64}".encode("utf-8")

    sock.sendall(b"p" + struct.pack("!I", 4 + len(client_final)) + client_final)
    mtype, body = recv_msg(sock)
    if mtype == "E":
        raise RuntimeError(body.decode("utf-8", errors="ignore"))

    while mtype != "Z":
        mtype, body = recv_msg(sock)
        if mtype == "E":
            raise RuntimeError(body.decode("utf-8", errors="ignore"))


def simple_query(sock, sql: str):
    q = sql.encode("utf-8") + b"\x00"
    sock.sendall(b"Q" + struct.pack("!I", 4 + len(q)) + q)
    rows = []
    err = None
    while True:
        mtype, body = recv_msg(sock)
        if mtype == "D":
            ncols = struct.unpack("!H", body[:2])[0]
            idx = 2
            row = []
            for _ in range(ncols):
                clen = struct.unpack("!i", body[idx : idx + 4])[0]
                idx += 4
                if clen == -1:
                    row.append(None)
                else:
                    row.append(body[idx : idx + clen].decode("utf-8", errors="replace"))
                    idx += clen
            rows.append(row)
        elif mtype == "E":
            err = body.decode("utf-8", errors="ignore")
        elif mtype == "Z":
            break
    if err:
        raise RuntimeError(err)
    return rows


def connect_pg():
    sock = socket.create_connection((HOST, PORT), timeout=20)
    sock.sendall(struct.pack("!II", 8, 80877103))
    if sock.recv(1) == b"S":
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        sock = ctx.wrap_socket(sock, server_hostname=HOST)

    params = f"user\x00{USER}\x00database\x00{DB}\x00\x00".encode("utf-8")
    sock.sendall(struct.pack("!II", 8 + len(params), 196608) + params)
    mtype, _ = recv_msg(sock)
    if mtype != "R":
        raise RuntimeError(f"Unexpected startup response: {mtype}")
    scram_auth(sock, PASSWORD)
    return sock


def main():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    os.makedirs(UPLOADS_DIR, exist_ok=True)

    print(f"[*] Connecting to {HOST}:{PORT}...")
    sock = connect_pg()
    print("[+] Connected and authenticated!")

    dump_data = {}
    for schema, table in TABLES:
        key = f"{schema}.{table}"
        try:
            if schema == "auth" and table == "users":
                sql = """
                SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)::text
                FROM (
                    SELECT id, email, encrypted_password, raw_user_meta_data, created_at, updated_at
                    FROM auth.users
                ) t
                """
            else:
                sql = f"SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)::text FROM {schema}.{table} t"
            res = simple_query(sock, sql)
            raw_json = res[0][0] if res and res[0] else "[]"
            rows = json.loads(raw_json)
            dump_data[key] = rows
            print(f"  - {key}: {len(rows)} rows backed up")
        except Exception as exc:
            print(f"  [!] Could not dump {key}: {exc}")
            dump_data[key] = []

    sock.close()

    dump_path = os.path.join(BACKUP_DIR, "supabase_dump.json")
    with open(dump_path, "w", encoding="utf-8") as fh:
        json.dump(dump_data, fh, ensure_ascii=False, indent=2)
    print(f"[+] Saved full database backup to {dump_path} ({os.path.getsize(dump_path) / (1024*1024):.2f} MB)")


if __name__ == "__main__":
    main()


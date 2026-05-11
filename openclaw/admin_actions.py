import os
import re
import unicodedata
from typing import Optional

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv(".env")
load_dotenv("../.env.local")


def create_admin_client() -> Client:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing NEXT_PUBLIC_SUPABASE_URL or service role key.")

    return create_client(url, key)


def generate_slug(text: str, fallback: str) -> str:
    text = (text or "").replace("Đ", "D").replace("đ", "d")
    value = unicodedata.normalize("NFKD", text or "")
    value = value.encode("ascii", "ignore").decode("ascii")
    value = value.lower()
    value = re.sub(r"[^a-z0-9\s-]", "", value)
    value = re.sub(r"[\s_-]+", "-", value).strip("-")
    return value[:180] or fallback


def needs_ascii_slug_repair(slug: str) -> bool:
    if not slug:
        return True

    return not bool(re.fullmatch(r"[a-z0-9-]+", slug))


def make_unique_slug(supabase: Client, table: str, base_slug: str, row_id: str) -> str:
    slug = base_slug
    suffix = 2

    while True:
        existing = supabase.table(table).select("id").eq("slug", slug).limit(1).execute()
        if not existing.data or existing.data[0]["id"] == row_id:
            return slug

        slug = f"{base_slug[:170]}-{suffix}"
        suffix += 1


def repair_article_slugs() -> None:
    supabase = create_admin_client()
    rows = supabase.table("articles").select("id,title,slug,seo_meta").execute().data or []
    repaired = 0

    for row in rows:
        old_slug = row.get("slug") or ""
        base_slug = generate_slug(row.get("title") or old_slug, "article")
        if not needs_ascii_slug_repair(old_slug) and old_slug == base_slug:
            continue

        new_slug = make_unique_slug(supabase, "articles", base_slug, row["id"])
        seo_meta = row.get("seo_meta") or {}
        legacy_slugs = seo_meta.get("legacy_slugs") or []
        if old_slug and old_slug not in legacy_slugs:
            legacy_slugs.append(old_slug)
        seo_meta["legacy_slugs"] = legacy_slugs

        supabase.table("articles").update({"slug": new_slug, "seo_meta": seo_meta}).eq("id", row["id"]).execute()
        repaired += 1
        print(f"[*] Repaired article slug: {old_slug} -> {new_slug}")

    print(f"[+] Repaired {repaired} article slugs.")


def find_one_by_identifier(supabase: Client, table: str, identifier: str) -> Optional[dict]:
    identifier = identifier.strip()
    if not identifier:
        return None

    for column in ["id", "slug", "title" if table == "articles" else "name"]:
        try:
            result = supabase.table(table).select("*").eq(column, identifier).limit(2).execute()
            if result.data:
                if len(result.data) > 1:
                    raise RuntimeError(f"Multiple {table} rows matched {column}={identifier}. Use id or slug.")
                return result.data[0]
        except Exception:
            if column == "id":
                continue
            raise

    name_column = "title" if table == "articles" else "name"
    result = supabase.table(table).select("*").ilike(name_column, f"%{identifier}%").limit(3).execute()
    if not result.data:
        return None
    if len(result.data) > 1:
        matches = ", ".join(f"{row.get(name_column)} ({row.get('slug')})" for row in result.data)
        raise RuntimeError(f"Multiple {table} rows matched '{identifier}': {matches}. Use id or slug.")

    return result.data[0]


def delete_article(identifier: str) -> None:
    supabase = create_admin_client()
    row = find_one_by_identifier(supabase, "articles", identifier)
    if not row:
        print(f"[!] Article not found: {identifier}")
        return

    try:
        supabase.table("article_facts").delete().eq("article_id", row["id"]).execute()
    except Exception as exc:
        print(f"[!] Could not delete article_facts for article {row['id']}: {exc}")

    supabase.table("articles").delete().eq("id", row["id"]).execute()
    print(f"[+] Deleted article: {row.get('title')} ({row.get('slug')})")


def delete_clinic(identifier: str) -> None:
    supabase = create_admin_client()
    row = find_one_by_identifier(supabase, "clinics", identifier)
    if not row:
        print(f"[!] Clinic not found: {identifier}")
        return

    supabase.table("clinics").delete().eq("id", row["id"]).execute()
    print(f"[+] Deleted clinic: {row.get('name')} ({row.get('slug')})")

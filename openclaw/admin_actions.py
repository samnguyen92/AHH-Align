import os
import re
import unicodedata
from datetime import datetime, timedelta
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


def change_clinic_feature_image(identifier: str, image_url: Optional[str] = None) -> None:
    supabase = create_admin_client()
    row = find_one_by_identifier(supabase, "clinics", identifier)
    if not row:
        print(f"[!] Clinic not found: {identifier}")
        return

    metadata = row.get("metadata") or {}
    images = metadata.get("images") or []
    gallery_images = metadata.get("gallery_images") or []

    # Ensure they are lists of strings
    if not isinstance(images, list):
        images = [images] if images else []
    if not isinstance(gallery_images, list):
        gallery_images = [gallery_images] if gallery_images else []

    # Clean none/empty/non-string values
    images = [img for img in images if isinstance(img, str) and img.strip()]
    gallery_images = [img for img in gallery_images if isinstance(img, str) and img.strip()]

    # Combine all unique images
    all_images = []
    for img in images + gallery_images:
        if img not in all_images:
            all_images.append(img)

    if not all_images:
        print(f"[!] Clinic '{row.get('name')}' has no images to set or rotate.")
        return

    if image_url:
        image_url = image_url.strip()
        # Find if it is already in the list and remove to prepend
        if image_url in all_images:
            all_images.remove(image_url)
        all_images.insert(0, image_url)
        print(f"[*] Promoting/setting new feature image: {image_url}")
    else:
        # Rotate: move first image to end
        if len(all_images) <= 1:
            print(f"[!] Clinic '{row.get('name')}' only has {len(all_images)} unique image(s). Cannot change/rotate to a different one.")
            return
        
        first_img = all_images[0]
        all_images = all_images[1:] + [first_img]
        print(f"[*] Rotating feature image: {first_img} -> {all_images[0]}")

    # Deduplicate gallery_images from the new first image to keep it clean
    if gallery_images and all_images[0] in gallery_images:
        gallery_images.remove(all_images[0])

    metadata["images"] = all_images
    metadata["gallery_images"] = gallery_images

    try:
        supabase.table("clinics").update({"metadata": metadata}).eq("id", row["id"]).execute()
        print(f"[+] Successfully changed feature image for clinic '{row.get('name')}' ({row.get('slug')})")
    except Exception as e:
        print(f"[!] Error updating clinic metadata: {e}")


def list_newsletter_subscribers(limit: int = 50) -> None:
    supabase = create_admin_client()
    try:
        res = (
            supabase.table("newsletter_subscriptions")
            .select("email, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        data = res.data or []
        print(f"[*] Found {len(data)} subscribers (Limit: {limit}):")
        for i, item in enumerate(data, 1):
            email = item.get("email")
            created_at = item.get("created_at") or ""
            print(f"{i}. {email} (subscribed on {created_at})")
    except Exception as e:
        print(f"[!] Error listing subscribers: {e}")


def add_newsletter_subscriber(email: str) -> None:
    email = (email or "").strip().lower()
    if not email or "@" not in email:
        print(f"[!] Invalid email address: {email}")
        return

    supabase = create_admin_client()
    try:
        supabase.table("newsletter_subscriptions").insert({"email": email}).execute()
        print(f"[+] Successfully subscribed email: {email}")
    except Exception as e:
        if hasattr(e, "code") and e.code == "23505":
            print(f"[*] Email {email} is already subscribed.")
        elif "23505" in str(e):
            print(f"[*] Email {email} is already subscribed.")
        else:
            print(f"[!] Error subscribing email {email}: {e}")


def remove_newsletter_subscriber(email: str) -> None:
    email = (email or "").strip().lower()
    if not email:
        print("[!] Email is required to unsubscribe.")
        return

    supabase = create_admin_client()
    try:
        existing = supabase.table("newsletter_subscriptions").select("id").eq("email", email).execute()
        if not existing.data:
            print(f"[!] Email '{email}' not found in subscribers list.")
            return

        supabase.table("newsletter_subscriptions").delete().eq("email", email).execute()
        print(f"[+] Successfully unsubscribed email: {email}")
    except Exception as e:
        print(f"[!] Error unsubscribing email {email}: {e}")


def check_claims() -> None:
    supabase = create_admin_client()
    try:
        # Get claim requests (claim of existing profile)
        try:
            claims_res = (
                supabase.table("claim_requests")
                .select("id, status, proof_type, notes, created_at, user_id, clinic_id, clinics(name)")
                .eq("status", "pending")
                .order("created_at", desc=True)
                .execute()
            )
            claims = claims_res.data or []
        except Exception:
            claims_res = (
                supabase.table("claim_requests")
                .select("id, status, proof_type, notes, created_at, user_id, clinic_id")
                .eq("status", "pending")
                .order("created_at", desc=True)
                .execute()
            )
            claims = claims_res.data or []
            # Fetch clinic names manually as fallback
            for c in claims:
                if c.get("clinic_id"):
                    clinic_res = supabase.table("clinics").select("name").eq("id", c["clinic_id"]).limit(1).execute()
                    if clinic_res.data:
                        c["clinics"] = {"name": clinic_res.data[0].get("name")}

        # Get clinic submissions (new profile suggestion)
        subs_res = (
            supabase.table("clinic_submissions")
            .select("id, status, clinic_name, full_name, role, email, phone, website, updates, created_at")
            .eq("status", "pending")
            .order("created_at", desc=True)
            .execute()
        )
        subs = subs_res.data or []

        print(f"[*] Found {len(claims)} pending claim requests and {len(subs)} pending clinic submissions:")

        if claims:
            print("\n🔑 PENDING CLAIM REQUESTS (Existing Clinics):")
            for i, claim in enumerate(claims, 1):
                clinic = claim.get("clinics") or {}
                clinic_name = clinic.get("name") or "Unknown Clinic"
                created_at = claim.get("created_at") or ""
                print(
                    f"[{i}] ID: {claim['id']}\n"
                    f"    Clinic Name: {clinic_name} (ID: {claim.get('clinic_id')})\n"
                    f"    User: {claim.get('user_id')}\n"
                    f"    Method: {claim.get('proof_type')} | Notes: {claim.get('notes') or 'N/A'}\n"
                    f"    Submitted: {created_at}"
                )

        if subs:
            print("\n🏥 PENDING CLINIC SUBMISSIONS (New Suggested Profiles):")
            for i, sub in enumerate(subs, 1):
                created_at = sub.get("created_at") or ""
                print(
                    f"[{i}] ID: {sub['id']}\n"
                    f"    Clinic Name: {sub.get('clinic_name')}\n"
                    f"    Submitted By: {sub.get('full_name')} ({sub.get('role')})\n"
                    f"    Contact: {sub.get('email')} | {sub.get('phone')}\n"
                    f"    Website: {sub.get('website') or 'N/A'}\n"
                    f"    Notes: {sub.get('updates') or 'N/A'}\n"
                    f"    Submitted: {created_at}"
                )
    except Exception as e:
        print(f"[!] Error checking claims: {e}")


def approve_claim(identifier: str) -> None:
    identifier = (identifier or "").strip()
    if not identifier:
        print("[!] Claim ID is required.")
        return

    supabase = create_admin_client()
    # 1. Check if it's a claim_request
    try:
        claim_res = supabase.table("claim_requests").select("*").eq("id", identifier).limit(1).execute()
        claim = claim_res.data[0] if claim_res.data else None
        if claim:
            if claim.get("status") != "pending":
                print(f"[!] Claim request '{identifier}' is already '{claim.get('status')}'.")
                return

            supabase.table("claim_requests").update({"status": "approved"}).eq("id", identifier).execute()
            supabase.table("clinics").update({
                "is_claimed": True,
                "claimed_by": claim["user_id"]
            }).eq("id", claim["clinic_id"]).execute()

            print(f"[+] Successfully approved claim request '{identifier}'.")
            print(f"    Clinic ID {claim['clinic_id']} is now claimed by User {claim['user_id']}.")
            return
    except Exception as e:
        print(f"[!] Error processing claim request search: {e}")

    # 2. Check if it's a clinic_submission
    try:
        sub_res = supabase.table("clinic_submissions").select("*").eq("id", identifier).limit(1).execute()
        sub = sub_res.data[0] if sub_res.data else None
        if sub:
            if sub.get("status") != "pending":
                print(f"[!] Clinic submission '{identifier}' is already '{sub.get('status')}'.")
                return

            new_clinic = {
                "name": sub["clinic_name"],
                "phone": sub["phone"],
                "metadata": {
                    "email": sub["email"],
                    "website": sub.get("website"),
                    "updates_note": sub.get("updates"),
                    "submitted_by_name": sub["full_name"],
                    "submitted_by_role": sub["role"]
                }
            }
            inserted = supabase.table("clinics").insert(new_clinic).execute()
            new_clinic_data = inserted.data[0] if inserted.data else {}

            supabase.table("clinic_submissions").update({"status": "approved"}).eq("id", identifier).execute()

            print(f"[+] Successfully approved clinic submission '{identifier}'.")
            print(f"    Created new clinic: '{sub['clinic_name']}' with slug '{new_clinic_data.get('slug')}' (ID: {new_clinic_data.get('id')})")
            return
    except Exception as e:
        print(f"[!] Error processing clinic submission search/insert: {e}")

    print(f"[!] No pending claim request or clinic submission found with ID '{identifier}'.")


def reject_claim(identifier: str) -> None:
    identifier = (identifier or "").strip()
    if not identifier:
        print("[!] Claim ID is required.")
        return

    supabase = create_admin_client()
    # 1. Check if it's a claim_request
    try:
        claim_res = supabase.table("claim_requests").select("*").eq("id", identifier).limit(1).execute()
        claim = claim_res.data[0] if claim_res.data else None
        if claim:
            if claim.get("status") != "pending":
                print(f"[!] Claim request '{identifier}' is already '{claim.get('status')}'.")
                return

            supabase.table("claim_requests").update({"status": "rejected"}).eq("id", identifier).execute()
            print(f"[+] Successfully rejected claim request '{identifier}'.")
            return
    except Exception as e:
        print(f"[!] Error processing claim request reject: {e}")

    # 2. Check if it's a clinic_submission
    try:
        sub_res = supabase.table("clinic_submissions").select("*").eq("id", identifier).limit(1).execute()
        sub = sub_res.data[0] if sub_res.data else None
        if sub:
            if sub.get("status") != "pending":
                print(f"[!] Clinic submission '{identifier}' is already '{sub.get('status')}'.")
                return

            supabase.table("clinic_submissions").update({"status": "rejected"}).eq("id", identifier).execute()
            print(f"[+] Successfully rejected clinic submission '{identifier}'.")
            return
    except Exception as e:
        print(f"[!] Error processing clinic submission reject: {e}")

    print(f"[!] No pending claim request or clinic submission found with ID '{identifier}'.")


def check_analytics(timeframe: str = "week", filter_type: str = "all") -> None:
    timeframe = (timeframe or "week").strip().lower()
    filter_type = (filter_type or "all").strip().lower()

    now = datetime.utcnow()
    if timeframe == "today":
        cutoff = datetime(now.year, now.month, now.day)
        label = "Today"
    elif timeframe == "week":
        cutoff = now - timedelta(days=7)
        label = "Last 7 Days (Week)"
    elif timeframe == "month":
        cutoff = now - timedelta(days=30)
        label = "Last 30 Days (Month)"
    else:
        cutoff = now - timedelta(days=7)
        label = "Last 7 Days (Week)"

    try:
        supabase = create_admin_client()
        res = supabase.table("analytics_events")\
            .select("*")\
            .gte("created_at", cutoff.isoformat())\
            .order("created_at", desc=True)\
            .limit(1000)\
            .execute()
        events = res.data or []

        type_map = {
            "views": "page_view",
            "searches": "search_query",
            "clicks": "clinic_click",
            "claims": "claim_start"
        }

        target_name = type_map.get(filter_type)
        if target_name:
            events = [e for e in events if e.get("event_name") == target_name]

        print("=== Asian Health Hub Analytics ===")
        print(f"Timeframe: {label}")
        print(f"Filter type: {filter_type.upper()}")
        print(f"Total matched events: {len(events)}")

        if not events:
            print("No events logged for this query filter.")
            return

        counts = {"page_view": 0, "search_query": 0, "clinic_click": 0, "claim_start": 0}
        for e in events:
            evt = e.get("event_name")
            if evt in counts:
                counts[evt] += 1

        if filter_type == "all":
            print("\nEvent Counts:")
            for name, c in counts.items():
                print(f" - {name}: {c}")

        if filter_type in ("all", "searches"):
            searches = {}
            for e in events:
                if e.get("event_name") == "search_query" and e.get("metadata"):
                    q = e["metadata"].get("query")
                    if q:
                        q = q.strip().lower()
                        searches[q] = searches.get(q, 0) + 1
            sorted_searches = sorted(searches.items(), key=lambda x: x[1], reverse=True)[:5]
            print("\nTop Search Queries:")
            if sorted_searches:
                for query, count in sorted_searches:
                    print(f" - \"{query}\": {count} searches")
            else:
                print(" - None")

        if filter_type in ("all", "clicks"):
            clicks = {}
            for e in events:
                if e.get("event_name") == "clinic_click" and e.get("metadata"):
                    name = e["metadata"].get("clinic_name", "Unknown Clinic")
                    clicks[name] = clicks.get(name, 0) + 1
            sorted_clicks = sorted(clicks.items(), key=lambda x: x[1], reverse=True)[:5]
            print("\nTop Clicked Clinics:")
            if sorted_clicks:
                for name, count in sorted_clicks:
                    print(f" - {name}: {count} clicks")
            else:
                print(" - None")

        if filter_type == "views":
            paths = {}
            for e in events:
                if e.get("event_name") == "page_view" and e.get("path"):
                    p = e.get("path")
                    paths[p] = paths.get(p, 0) + 1
            sorted_paths = sorted(paths.items(), key=lambda x: x[1], reverse=True)[:5]
            print("\nTop Visited Paths:")
            if sorted_paths:
                for path, count in sorted_paths:
                    print(f" - {path}: {count} views")
            else:
                print(" - None")

    except Exception as e:
        print(f"[!] Analytics check failed: {e}")


def get_analytics_summary() -> str:
    try:
        supabase = create_admin_client()
        now = datetime.utcnow()
        cutoff_month = now - timedelta(days=30)
        res = supabase.table("analytics_events")\
            .select("event_name, created_at, metadata")\
            .gte("created_at", cutoff_month.isoformat())\
            .order("created_at", desc=True)\
            .limit(3000)\
            .execute()
        events = res.data or []

        cutoff_today = datetime(now.year, now.month, now.day)
        cutoff_week = now - timedelta(days=7)

        counts_today = {"page_view": 0, "search_query": 0, "clinic_click": 0, "claim_start": 0}
        counts_week = {"page_view": 0, "search_query": 0, "clinic_click": 0, "claim_start": 0}
        counts_month = {"page_view": 0, "search_query": 0, "clinic_click": 0, "claim_start": 0}

        for e in events:
            evt = e.get("event_name")
            if evt not in counts_month:
                continue
            
            created_at_str = e.get("created_at")
            if not created_at_str:
                continue
            
            try:
                clean_time = created_at_str.replace("Z", "").split("+")[0]
                evt_time = datetime.fromisoformat(clean_time)
            except Exception:
                continue

            counts_month[evt] += 1
            if evt_time >= cutoff_week:
                counts_week[evt] += 1
            if evt_time >= cutoff_today:
                counts_today[evt] += 1

        searches = {}
        for e in events:
            if e.get("event_name") == "search_query" and e.get("metadata"):
                q = e["metadata"].get("query")
                if q:
                    q = q.strip().lower()
                    searches[q] = searches.get(q, 0) + 1
        sorted_searches = sorted(searches.items(), key=lambda x: x[1], reverse=True)[:5]
        searches_str = ", ".join([f'"{q}" ({c})' for q, c in sorted_searches])

        clicks = {}
        for e in events:
            if e.get("event_name") == "clinic_click" and e.get("metadata"):
                name = e["metadata"].get("clinic_name", "Unknown Clinic")
                clicks[name] = clicks.get(name, 0) + 1
        sorted_clicks = sorted(clicks.items(), key=lambda x: x[1], reverse=True)[:5]
        clicks_str = ", ".join([f"{name} ({c})" for name, c in sorted_clicks])

        return (
            "Analytics Summary:\n"
            f" - TODAY: Views={counts_today['page_view']}, Searches={counts_today['search_query']}, Clicks={counts_today['clinic_click']}\n"
            f" - WEEK (7 Days): Views={counts_week['page_view']}, Searches={counts_week['search_query']}, Clicks={counts_week['clinic_click']}, Claims={counts_week['claim_start']}\n"
            f" - MONTH (30 Days): Views={counts_month['page_view']}, Searches={counts_month['search_query']}, Clicks={counts_month['clinic_click']}, Claims={counts_month['claim_start']}\n"
            f"Top searches (30d): {searches_str or 'None'}\n"
            f"Top clinics (30d): {clicks_str or 'None'}"
        )
    except Exception as exc:
        return f"Analytics summary unavailable: {exc}"





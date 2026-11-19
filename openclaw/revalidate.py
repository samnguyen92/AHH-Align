"""revalidate.py — ask the website to refresh its cached pages right after the bot changes data.

Clinic pages are cached for up to an hour. Without this call a bot edit would show up late.
Needs REVALIDATE_SECRET in both the web and the bot environment (and the web address in
OPENCLAW_PREVIEW_BASE_URL / SITE_INTERNAL_URL). Best effort: a failure only means "visible within the hour".
"""

from __future__ import annotations

import json
import os
import urllib.request
from typing import List


def revalidate_paths(paths: List[str]) -> str:
    secret = (os.environ.get("REVALIDATE_SECRET") or "").strip()
    base = (os.environ.get("SITE_INTERNAL_URL") or os.environ.get("OPENCLAW_PREVIEW_BASE_URL") or "http://web:3000").rstrip("/")
    if not secret:
        return "ℹ️ The live page refreshes on its own within about an hour (set REVALIDATE_SECRET to refresh it instantly)."
    try:
        request = urllib.request.Request(
            f"{base}/api/internal/revalidate", method="POST",
            data=json.dumps({"paths": paths}).encode(),
            headers={"Content-Type": "application/json", "x-revalidate-secret": secret},
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status == 200:
                return "🌐 The live page was refreshed."
    except Exception as exc:
        print(f"[!] Revalidate failed: {exc!r}")
    return "ℹ️ Could not refresh the live page right now; it updates on its own within about an hour."


def revalidate_clinic(slug: str) -> str:
    paths = ["/", "/search", "/sitemap.xml"] + ([f"/clinics/{slug}"] if slug else [])
    return revalidate_paths(paths)

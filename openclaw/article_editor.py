"""
article_editor.py — Surgical / Exact (verbatim) content editor for Insights, Guides, and Pulse issues.

Unlike `generate_insights.rewrite_article()` (which re-researches sources, rewrites the entire article via LLM,
and regenerates 3-5 images), this module performs deterministic, verbatim edits on a single field
(`content`, `excerpt`, or `title`) while preserving 100% of the rest of the article, its category (`pulse` / `insight`),
slug, and existing images.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from pg_client import create_client
from admin_actions import find_one_by_identifier

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(_OPENCLAW_DIR, "..", ".env.local"))

ARTICLE_VERSIONS_KEY = "versions"
MAX_STORED_VERSIONS = 10


def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _count_words(text: str) -> int:
    return len(re.findall(r"\S+", text or ""))


def _article_url_path(article: dict) -> str:
    slug = article.get("slug") or ""
    category = (article.get("category") or "").strip().lower()
    prefix = "/pulse" if category == "pulse" else "/insights"
    return f"{prefix}/{slug}"


def _snapshot_version_meta(article: dict, instruction_summary: str, updated_at: str) -> dict:
    """Save current article state into seo_meta.versions before applying an exact edit."""
    seo_meta = dict(article.get("seo_meta") or {})
    try:
        current_version = int(seo_meta.get("current_version") or 1)
    except (TypeError, ValueError):
        current_version = 1

    versions = list(seo_meta.get(ARTICLE_VERSIONS_KEY) or [])
    snapshot = {
        "version": current_version,
        "label": f"v{current_version}",
        "saved_at": updated_at,
        "title": article.get("title") or "",
        "excerpt": article.get("excerpt") or "",
        "content": article.get("content") or "",
        "category": article.get("category") or "insight",
        "tags": list(article.get("tags") or []),
        "seo_meta": {
            k: v for k, v in seo_meta.items() if k != ARTICLE_VERSIONS_KEY
        },
    }
    versions.append(snapshot)
    next_version = current_version + 1

    seo_meta[ARTICLE_VERSIONS_KEY] = versions[-MAX_STORED_VERSIONS:]
    seo_meta["current_version"] = next_version
    seo_meta["version_label"] = f"v{next_version}"
    seo_meta["last_rewrite_instruction"] = instruction_summary[:500]
    seo_meta["last_rewritten_at"] = updated_at
    return seo_meta


def _prepend_to_markdown(existing_content: str, intro_text: str) -> str:
    """
    Insert exact intro_text at the top of markdown content.
    If existing_content starts with a single H1 title line (`# ...`), insert right after that H1 line
    because the frontend strips a leading H1 that duplicates the page header.
    """
    clean_intro = (intro_text or "").strip()
    existing = (existing_content or "").lstrip("\n")
    if not existing:
        return clean_intro

    # Avoid duplicating if the exact intro is already at the top
    if existing.startswith(clean_intro):
        return existing

    lines = existing.splitlines()
    if lines and re.match(r"^#\s+\S+", lines[0]):
        h1_line = lines[0]
        rest = "\n".join(lines[1:]).lstrip("\n")
        if rest.startswith(clean_intro):
            return existing
        return f"{h1_line}\n\n{clean_intro}\n\n{rest}" if rest else f"{h1_line}\n\n{clean_intro}"

    return f"{clean_intro}\n\n{existing}"


def _append_to_markdown(existing_content: str, extra_text: str) -> str:
    clean_extra = (extra_text or "").strip()
    existing = (existing_content or "").rstrip()
    if not existing:
        return clean_extra
    return f"{existing}\n\n{clean_extra}"


def _replace_in_text(existing: str, find_text: str, replace_with: str) -> Optional[str]:
    """Try exact replacement first, then whitespace-normalized replacement."""
    if not find_text:
        return None
    if find_text in existing:
        return existing.replace(find_text, replace_with, 1)

    # Whitespace-flexible regex match
    tokens = [re.escape(tok) for tok in find_text.split()]
    if tokens:
        pattern = r"\s+".join(tokens)
        match = re.search(pattern, existing, flags=re.IGNORECASE)
        if match:
            return existing[:match.start()] + replace_with + existing[match.end():]
    return None


def edit_article_exact(
    identifier: str,
    operation: str,
    text: str,
    target_field: Optional[str] = None,
    find_text: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Apply an exact, verbatim edit to an existing Insight, Guide, or Pulse article in PostgreSQL.

    Supported operations:
    - prepend_content: Insert exact `text` at the top of `content` (or `excerpt` if target_field='excerpt')
    - append_content: Append exact `text` at the bottom of `content`
    - set_excerpt: Replace `excerpt` verbatim with `text`
    - set_title: Replace `title` verbatim with `text` (slug preserved)
    - replace_text: Replace `find_text` with `text` in `target_field` (auto-detects excerpt vs content)
    """
    identifier = (identifier or "").strip()
    op = (operation or "").strip().lower()
    new_text = (text or "").strip()
    field = (target_field or "").strip().lower() or None

    if not identifier:
        raise ValueError("Missing article URL, slug, id, or title.")
    if not new_text:
        raise ValueError("Missing exact text content to insert or replace.")

    db = create_client()
    article = find_one_by_identifier(db, "articles", identifier)
    if not article:
        raise ValueError(f"Article not found for target: {identifier}")

    is_pulse = (article.get("category") or "").strip().lower() == "pulse"
    url_path = _article_url_path(article)

    old_title = article.get("title") or ""
    old_excerpt = article.get("excerpt") or ""
    old_content = article.get("content") or ""
    old_words = _count_words(old_content)

    # Normalize operation aliases
    if op in {"prepend", "add_top", "add_intro", "insert_top", "prepend_content"}:
        op = "prepend_content"
    elif op in {"append", "add_bottom", "append_content"}:
        op = "append_content"
    elif op in {"set_excerpt", "replace_excerpt", "update_excerpt", "edit_excerpt"}:
        op = "set_excerpt"
    elif op in {"set_title", "replace_title", "update_title", "edit_title"}:
        op = "set_title"
    elif op in {"replace", "replace_text", "replace_section"}:
        op = "replace_text"
    else:
        # Default fallback based on field
        if field == "excerpt":
            op = "set_excerpt"
        elif field == "title":
            op = "set_title"
        else:
            op = "prepend_content"

    updates: Dict[str, Any] = {}
    changed_field = ""

    if op == "set_excerpt" or (op == "prepend_content" and field == "excerpt"):
        updates["excerpt"] = new_text
        changed_field = "excerpt"
    elif op == "set_title":
        updates["title"] = new_text
        changed_field = "title"
    elif op == "prepend_content":
        updates["content"] = _prepend_to_markdown(old_content, new_text)
        changed_field = "content (top)"
    elif op == "append_content":
        updates["content"] = _append_to_markdown(old_content, new_text)
        changed_field = "content (bottom)"
    elif op == "replace_text":
        # If targeting excerpt explicitly, or if it's a Pulse without find_text (changing intro text)
        if field == "excerpt" or (is_pulse and not find_text and field != "content"):
            updates["excerpt"] = new_text
            changed_field = "excerpt"
        elif find_text:
            replaced_excerpt = _replace_in_text(old_excerpt, find_text, new_text) if field in (None, "excerpt") else None
            replaced_content = _replace_in_text(old_content, find_text, new_text) if field in (None, "content") else None
            if replaced_excerpt is not None and field != "content":
                updates["excerpt"] = replaced_excerpt
                changed_field = "excerpt"
            elif replaced_content is not None:
                updates["content"] = replaced_content
                changed_field = "content"
            else:
                raise ValueError(
                    f"Could not find the specified text to replace in {url_path}. "
                    "Please check the exact wording or specify whether to update excerpt or prepend to content."
                )
        else:
            # No find_text on non-pulse -> prepend to content if intro, else replace excerpt if field == excerpt
            updates["content"] = _prepend_to_markdown(old_content, new_text)
            changed_field = "content (top)"

    updated_at = _iso_now()
    instruction_summary = f"exact_edit ({op}, field={changed_field})"
    updated_seo_meta = _snapshot_version_meta(article, instruction_summary, updated_at)

    payload = {
        **updates,
        "seo_meta": updated_seo_meta,
        "updated_at": updated_at,
    }
    db.table("articles").update(payload).eq("id", article["id"]).execute()

    new_content = updates.get("content", old_content)
    new_words = _count_words(new_content)
    version = updated_seo_meta.get("current_version", 2)

    print(f"[+] Exact edit applied to: {url_path}")
    print(f"[*] Title: {updates.get('title', old_title)}")
    print(f"[*] Field updated: {changed_field}")
    print(f"[*] Version saved: v{version} (previous version backed up in seo_meta.versions)")
    print(f"[*] Images & category preserved: category={article.get('category')}, images untouched")
    if "content" in updates:
        print(f"[*] Word count: {old_words} -> {new_words}")
    elif "excerpt" in updates:
        print(f"[*] Excerpt updated ({len(old_excerpt)} -> {len(new_text)} chars)")

    return {
        "id": article["id"],
        "slug": article.get("slug"),
        "url_path": url_path,
        "field": changed_field,
        "version": version,
        "old_words": old_words,
        "new_words": new_words,
    }

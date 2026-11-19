"""tg_format.py — turn the light Markdown the bot writes (**bold**, `code`, [text](url)) into Telegram HTML.

Everything is HTML-escaped FIRST, so text coming from clinics, users or the web can never inject tags.
"""

from __future__ import annotations

import html
import re

_CODE = re.compile(r"`([^`\n]+)`")
_BOLD = re.compile(r"\*\*(.+?)\*\*", re.DOTALL)
_LINK = re.compile(r"\[([^\]\n]+)\]\((https?://[^\s)]+)\)")


def markdown_to_html(text: str) -> str:
    escaped = html.escape(text or "", quote=False)
    codes: list[str] = []

    def stash(match: re.Match) -> str:  # keep code spans untouched by the bold/link rules
        codes.append(f"<code>{match.group(1)}</code>")
        return f"\x00{len(codes) - 1}\x00"

    out = _CODE.sub(stash, escaped)
    out = _LINK.sub(lambda m: f'<a href="{html.escape(m.group(2), quote=True)}">{m.group(1)}</a>', out)
    out = _BOLD.sub(lambda m: f"<b>{m.group(1)}</b>", out)
    return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], out)

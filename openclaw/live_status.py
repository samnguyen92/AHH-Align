"""live_status.py — ONE progress message that edits itself, instead of a new Telegram message per step.

A scout used to produce dozens of messages (and the raw scraper log); now the person sees a single line block that updates
(at most once a second, so Telegram never rate-limits it), and at the end it collapses to one line.
"""

from __future__ import annotations

import time
from typing import Callable, List, Optional


class LiveStatus:
    def __init__(
        self,
        send: Callable[[str], Optional[int]],
        edit: Callable[[int, str], None],
        header: str,
        done_header: str = "",
        max_lines: int = 4,
        min_interval: float = 1.2,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._send, self._edit = send, edit
        self.header, self.done_header = header, done_header or header
        self.max_lines, self.min_interval, self._clock = max_lines, min_interval, clock
        self.lines: List[str] = []
        self.message_id: Optional[int] = None
        self._last_edit = float("-inf")
        self._dirty = False
        self._shown = ""

    def _render(self) -> str:
        shown = self.lines[-self.max_lines:]
        return self.header + ("\n" + "\n".join(f"• {line}" for line in shown) if shown else "")

    def _flush(self, force: bool = False) -> None:
        text = self._render()
        if text == self._shown:
            self._dirty = False
            return
        now = self._clock()
        if self.message_id is not None and not force and now - self._last_edit < self.min_interval:
            self._dirty = True  # shown with the next update or at the end
            return
        try:
            if self.message_id is None:
                self.message_id = self._send(text)
            else:
                self._edit(self.message_id, text)
            self._shown, self._last_edit, self._dirty = text, now, False
        except Exception as exc:  # progress is a courtesy: it must never break the job
            print(f"[!] Could not update the progress message: {exc!r}")

    def start(self) -> None:
        self._flush(force=True)

    def update(self, line: str) -> None:
        line = " ".join(str(line or "").split())[:140]
        if line and (not self.lines or self.lines[-1] != line):
            self.lines.append(line)
            self._flush()

    def finish(self) -> None:
        """Collapse to the one-line result (the details are in /tail)."""
        self.lines = []
        self.header = self.done_header
        self._flush(force=True)

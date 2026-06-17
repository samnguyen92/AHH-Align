"""
Thread-local progress reporting for OpenClaw jobs.

Usage (in job code):
    from progress import report_progress
    report_progress("⏳ Đang viết section 4/12...")

Usage (in bot, before starting a job thread):
    from progress import set_progress_callback, clear_progress_callback
    set_progress_callback(lambda msg: bot.send_message(chat_id, msg))
    # ... start thread ...
    # callback is automatically isolated per thread via threading.local()
"""

import threading
from typing import Callable, Optional

_local = threading.local()


def set_progress_callback(fn: Callable[[str], None]) -> None:
    """Register a progress callback for the current thread."""
    _local.progress_fn = fn


def clear_progress_callback() -> None:
    """Remove the progress callback for the current thread."""
    _local.progress_fn = None


def report_progress(message: str) -> None:
    """Call the registered progress callback if one exists for this thread."""
    fn: Optional[Callable[[str], None]] = getattr(_local, "progress_fn", None)
    if fn is not None:
        try:
            fn(message)
        except Exception:
            pass  # Never let progress reporting crash the job

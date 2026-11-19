"""
github_api.py — the few GitHub REST calls the web-edit flow needs (no third-party dependency).

  create_pull / get_pull / list_pulls / merge_pull / close_pull / delete_branch

The token comes from GITHUB_TOKEN (or GH_TOKEN): a fine-grained personal access token limited to ONE
repository with "Contents: read & write" and "Pull requests: read & write". It is sent only in the
Authorization header and is scrubbed from every error message.

`GITHUB_API_URL` overrides the API address (GitHub Enterprise, or a local fake server in tests).
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, List, Optional

DEFAULT_API_URL = "https://api.github.com"
DEFAULT_REPOSITORY = "samnguyen92/AHH-Align"
REQUEST_TIMEOUT_SECONDS = 30


class GitHubError(Exception):
    """A failed GitHub call. `status` is the HTTP status (0 when GitHub could not be reached)."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def get_token() -> Optional[str]:
    return (os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or "").strip() or None


def get_repository() -> str:
    return (os.environ.get("GITHUB_REPOSITORY") or DEFAULT_REPOSITORY).strip()


def scrub(text: str, token: Optional[str]) -> str:
    """Remove the token (and its base64 form used in git headers) from text that may be shown or logged."""
    out = text or ""
    if token:
        import base64

        out = out.replace(token, "<token>")
        out = out.replace(base64.b64encode(f"x-access-token:{token}".encode()).decode(), "<token>")
    return out


class GitHubClient:
    def __init__(self, token: Optional[str] = None, repo: Optional[str] = None, api_url: Optional[str] = None) -> None:
        self.token = token if token is not None else get_token()
        self.repo = repo or get_repository()
        self.api_url = (api_url or os.environ.get("GITHUB_API_URL") or DEFAULT_API_URL).rstrip("/")

    # ---- plumbing ---------------------------------------------------------------------------

    def _request(self, method: str, path: str, body: Optional[dict] = None) -> Any:
        if not self.token:
            raise GitHubError(0, "GITHUB_TOKEN is not set.")
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(
            f"{self.api_url}{path}",
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "OpenClaw-WebEdit",
                **({"Content-Type": "application/json"} if data is not None else {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                payload = json.loads(exc.read().decode("utf-8"))
                detail = payload.get("message") or ""
                errors = payload.get("errors")
                if errors:
                    detail += " " + json.dumps(errors)[:300]
            except Exception:
                pass
            raise GitHubError(exc.code, scrub(f"GitHub {method} {path} failed ({exc.code}): {detail}".strip(), self.token))
        except urllib.error.URLError as exc:
            raise GitHubError(0, scrub(f"Could not reach GitHub: {exc.reason}", self.token))

    def _repo_path(self, suffix: str = "") -> str:
        return f"/repos/{self.repo}{suffix}"

    # ---- pull requests ----------------------------------------------------------------------

    def default_branch(self) -> str:
        return self._request("GET", self._repo_path())["default_branch"]

    def create_pull(self, title: str, head: str, base: str, body: str, draft: bool = False) -> dict:
        return self._request(
            "POST", self._repo_path("/pulls"),
            {"title": title[:250], "head": head, "base": base, "body": body, "draft": draft},
        )

    def get_pull(self, number: int) -> dict:
        return self._request("GET", self._repo_path(f"/pulls/{int(number)}"))

    def list_pulls(self, state: str = "open", per_page: int = 50) -> List[dict]:
        return self._request("GET", self._repo_path(f"/pulls?state={state}&per_page={int(per_page)}")) or []

    def merge_pull(self, number: int, title: str, method: str = "squash") -> dict:
        return self._request(
            "PUT", self._repo_path(f"/pulls/{int(number)}/merge"),
            {"merge_method": method, "commit_title": title[:250]},
        )

    def close_pull(self, number: int) -> dict:
        return self._request("PATCH", self._repo_path(f"/pulls/{int(number)}"), {"state": "closed"})

    def delete_branch(self, branch: str) -> None:
        try:
            self._request("DELETE", self._repo_path(f"/git/refs/heads/{branch}"))
        except GitHubError as exc:
            if exc.status not in (404, 422):  # already gone is fine
                raise

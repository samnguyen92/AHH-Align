"""
web_pr.py — website edits as Pull Requests (replaces "edit the live checkout and /publish to main").

Flow for one edit (`run_web_edit_pr`):
  1. clone the repository into a throw-away directory and create a branch  web-edit/<date>-<slug>
  2. the Web-Dev agent edits ONLY that clone (dev_agent.work_in) — the server's own files are never touched
  3. commit just the allowed paths (src/, public/), push the branch, open a Pull Request
  4. start a preview server on the clone and take desktop + mobile screenshots (best effort)
  5. a person reads the PR and approves the merge from Telegram (or on GitHub); nothing reaches `main`
     or the live site before that.

Also here: merge / close / list / revert of PRs that THIS flow created (a branch prefix and a marker in the
PR body identify them, so the bot can never merge or close someone else's PR by number).

The GitHub token lives in GITHUB_TOKEN. It is never put in a URL, never written to .git/config and is
scrubbed from every message (see github_api.scrub).
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import os
import re
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterator, List, Optional

from github_api import GitHubClient, GitHubError, scrub

BRANCH_PREFIX = "web-edit/"
PR_MARKER = "<!-- openclaw:web-edit -->"
GIT_NAME = os.environ.get("OPENCLAW_GIT_NAME", "OpenClaw Bot")
GIT_EMAIL = os.environ.get("OPENCLAW_GIT_EMAIL", "openclaw@users.noreply.github.com")

# Files the toolchain creates that are never part of a change.
_ARTIFACTS = ("next-env.d.ts", "tsconfig.tsbuildinfo")
_ARTIFACT_PREFIXES = ("node_modules", ".next/")

_EDIT_LOCK = threading.Lock()

ProgressCallback = Optional[Callable[[str], None]]


class WebPrError(Exception):
    """A problem the person should read (never contains the token)."""


class WebEditBusy(WebPrError):
    pass


class UnsafeChange(WebPrError):
    pass


# --------------------------------------------------------------------------- configuration

def work_root() -> str:
    return os.environ.get("OPENCLAW_WORK_DIR") or os.path.join(tempfile.gettempdir(), "openclaw-work")


def repo_url(client: GitHubClient) -> str:
    return os.environ.get("OPENCLAW_REPO_URL") or f"https://github.com/{client.repo}.git"


def base_branch(client: GitHubClient) -> str:
    configured = (os.environ.get("OPENCLAW_BASE_BRANCH") or "").strip()
    if configured:
        return configured
    try:
        return client.default_branch()
    except GitHubError:
        return "main"


def require_client() -> GitHubClient:
    client = GitHubClient()
    if not client.token:
        raise WebPrError(
            "GITHUB_TOKEN is not set, so I cannot open a Pull Request.\n"
            "Create a fine-grained personal access token limited to the repository "
            f"{client.repo} with 'Contents: read & write' and 'Pull requests: read & write', "
            "put it in openclaw/.env as GITHUB_TOKEN=..., and restart the bot."
        )
    return client


def slugify(text: str, limit: int = 40) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:limit].strip("-")
    return value or "change"


# --------------------------------------------------------------------------- git

def _auth_args(url: str, token: Optional[str]) -> List[str]:
    # Only for https remotes. The header is passed with -c for one command: it is not stored anywhere.
    if token and url.startswith("https://"):
        basic = base64.b64encode(f"x-access-token:{token}".encode()).decode()
        return ["-c", f"http.extraHeader=Authorization: Basic {basic}"]
    return []


def _git(args: List[str], cwd: Optional[str] = None, token: Optional[str] = None, url: str = "", timeout: int = 180) -> str:
    command = ["git", *_auth_args(url, token), *args]
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": "true", "LC_ALL": "C"}
    try:
        proc = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        raise WebPrError(f"git {args[0]} timed out after {timeout}s.")
    except FileNotFoundError:
        raise WebPrError("git is not installed in this environment.")
    if proc.returncode != 0:
        detail = scrub((proc.stderr or proc.stdout or "").strip(), token)[-600:]
        raise WebPrError(f"git {args[0]} failed: {detail}")
    return proc.stdout


@dataclass
class WorkArea:
    root: str
    branch: str
    base: str
    url: str
    token: Optional[str]


@contextlib.contextmanager
def work_area(branch_slug: str, client: GitHubClient, branch: Optional[str] = None, depth: int = 1) -> Iterator[WorkArea]:
    """A fresh clone on a new branch; removed when the block ends. Only one edit runs at a time."""
    if not _EDIT_LOCK.acquire(blocking=False):
        raise WebEditBusy("Another website edit is running. Wait for it to finish, then try again.")
    path = None
    try:
        os.makedirs(work_root(), exist_ok=True)
        path = tempfile.mkdtemp(prefix="web-edit-", dir=work_root())
        url = repo_url(client)
        base = base_branch(client)
        _git(["clone", "--depth", str(depth), "--branch", base, "--single-branch", url, path], token=client.token, url=url)
        _git(["config", "user.name", GIT_NAME], cwd=path)
        _git(["config", "user.email", GIT_EMAIL], cwd=path)
        name = branch or f"{BRANCH_PREFIX}{time.strftime('%Y%m%d-%H%M%S')}-{slugify(branch_slug)}"
        _git(["checkout", "-b", name], cwd=path)
        yield WorkArea(root=path, branch=name, base=base, url=url, token=client.token)
    finally:
        if path and not os.environ.get("OPENCLAW_KEEP_WORKDIR"):
            shutil.rmtree(path, ignore_errors=True)
        _EDIT_LOCK.release()


def _parse_status(porcelain_z: str) -> List[str]:
    """Paths reported by `git status --porcelain -z` (new path for renames)."""
    parts = [p for p in porcelain_z.split("\0") if p]
    paths: List[str] = []
    skip_next = False
    for entry in parts:
        if skip_next:  # the OLD name of a rename; the NEW name was already recorded
            skip_next = False
            continue
        status, path = entry[:2], entry[3:]
        paths.append(path)
        if "R" in status or "C" in status:
            skip_next = True
    return paths


def _is_artifact(path: str) -> bool:
    return path in _ARTIFACTS or any(path == a.rstrip("/") or path.startswith(a) for a in _ARTIFACT_PREFIXES)


def changed_paths(root: str) -> List[str]:
    out = _git(["status", "--porcelain", "-z", "--untracked-files=all"], cwd=root)
    return [p for p in _parse_status(out) if not _is_artifact(p)]


def commit_changes(root: str, message: str) -> List[str]:
    """Commit the changes, but ONLY if every changed path is one the agent is allowed to write."""
    from dev_agent import ALLOWED_WRITE_PREFIXES, FORBIDDEN_WRITE_FILES, FORBIDDEN_WRITE_PREFIXES

    paths = changed_paths(root)
    if not paths:
        return []
    bad = [
        p for p in paths
        if not p.startswith(ALLOWED_WRITE_PREFIXES) or p in FORBIDDEN_WRITE_FILES or p.startswith(FORBIDDEN_WRITE_PREFIXES)
    ]
    if bad:
        raise UnsafeChange(
            "The edit touched files it is not allowed to change, so nothing was committed: "
            + ", ".join(bad[:8]) + (" ..." if len(bad) > 8 else "")
        )
    _git(["add", "-A", "--", *paths], cwd=root)
    _git(["commit", "-m", message[:200]], cwd=root)
    return paths


def push_branch(area: WorkArea) -> None:
    _git(["push", "origin", f"HEAD:refs/heads/{area.branch}"], cwd=area.root, token=area.token, url=area.url, timeout=300)


# --------------------------------------------------------------------------- dependencies and preview

def ensure_dependencies(root: str) -> bool:
    """Make node_modules available in the clone (needed for the TypeScript check and the preview).

    One `npm ci` per distinct package-lock.json is cached under the work directory and hard-linked into each clone.
    Set OPENCLAW_WEB_INSTALL=off to skip (tests).
    """
    if os.environ.get("OPENCLAW_WEB_INSTALL", "on").lower() in {"off", "0", "false", "no"}:
        return False
    lock = os.path.join(root, "package-lock.json")
    if not os.path.isfile(lock):
        return False
    with open(lock, "rb") as fh:
        digest = hashlib.sha256(fh.read()).hexdigest()[:16]
    cache = os.path.join(work_root(), ".node-cache", digest)
    modules = os.path.join(cache, "node_modules")
    if not os.path.isdir(modules):
        os.makedirs(cache, exist_ok=True)
        for name in ("package.json", "package-lock.json"):
            shutil.copy(os.path.join(root, name), os.path.join(cache, name))
        proc = subprocess.run(
            ["npm", "ci", "--no-audit", "--no-fund"], cwd=cache, capture_output=True, text=True, timeout=900
        )
        if proc.returncode != 0:
            shutil.rmtree(modules, ignore_errors=True)
            raise WebPrError("npm ci failed: " + (proc.stderr or proc.stdout)[-400:])
    target = os.path.join(root, "node_modules")
    if not os.path.lexists(target):
        # NOT a symlink: Turbopack refuses a node_modules that points outside the project root.
        # Hard links make the copy near-instant and cost no extra disk; fall back to a real copy
        # when the cache and the clone are on different filesystems.
        linked = subprocess.run(["cp", "-al", modules, target], capture_output=True)
        if linked.returncode != 0:
            shutil.rmtree(target, ignore_errors=True)
            shutil.copytree(modules, target, symlinks=True)
    return True


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@contextlib.contextmanager
def preview_server(root: str, startup_seconds: int = 90) -> Iterator[Optional[str]]:
    """`next dev` on the clone. Yields its base URL, or None when it could not start (preview is best effort)."""
    if os.environ.get("OPENCLAW_WEB_PREVIEW", "on").lower() in {"off", "0", "false", "no"} or not os.path.isdir(
        os.path.join(root, "node_modules")
    ):
        yield None
        return
    port = _free_port()
    log = open(os.path.join(root, ".preview.log"), "w")
    env = {**os.environ, "NEXT_TELEMETRY_DISABLED": "1", "NODE_ENV": "development", "PORT": str(port)}
    env.pop("AUTH_SECRET", None)  # the preview never needs (or sees) the production signing secret
    proc = subprocess.Popen(
        ["npx", "--no-install", "next", "dev", "-p", str(port), "-H", "127.0.0.1"],
        cwd=root, stdout=log, stderr=subprocess.STDOUT, env=env, start_new_session=True,
    )
    base = f"http://127.0.0.1:{port}"
    ready = False
    try:
        deadline = time.time() + startup_seconds
        while time.time() < deadline and proc.poll() is None:
            try:
                with urllib.request.urlopen(base + "/", timeout=5) as resp:
                    ready = resp.status < 500
                    if ready:
                        break
            except Exception:
                time.sleep(1.5)
        if not ready:
            log.flush()
            with contextlib.suppress(Exception):
                tail = open(os.path.join(root, ".preview.log"), errors="replace").read()[-600:]
                print(f"[!] Preview server did not start (exit={proc.poll()}): {tail}")
        yield base if ready else None
    finally:
        with contextlib.suppress(Exception):
            os.killpg(os.getpgid(proc.pid), 15)
        with contextlib.suppress(Exception):
            proc.wait(timeout=10)
        log.close()


# --------------------------------------------------------------------------- pull request text

def build_pr_body(instruction: str, summary: str, files: List[str], typecheck: str, kind: str = "web edit") -> str:
    shown = "\n".join(f"- `{f}`" for f in files[:40]) + (f"\n- … and {len(files) - 40} more" if len(files) > 40 else "")
    return (
        f"{PR_MARKER}\n"
        f"**Requested through the OpenClaw bot ({kind}):**\n\n> {instruction.strip()[:800]}\n\n"
        f"## What changed\n{summary.strip()[:3500]}\n\n"
        f"## Files ({len(files)})\n{shown}\n\n"
        f"## Checks\n- TypeScript: {typecheck}\n"
        "- Only `src/` and `public/` may be edited by the agent; API routes, authentication and the database layer are blocked.\n\n"
        "**Nothing is live until this Pull Request is merged.** Review the diff (and the preview screenshots sent to "
        "Telegram), then approve the merge from the bot or on GitHub. Close it to discard the change.\n"
    )


def _typecheck_label(res: Dict[str, Any]) -> str:
    if res.get("typecheck_skipped"):
        return "not run (dependencies were not installed)"
    return "passed" if res.get("typecheck_ok") else "reported problems, see the diff"


# --------------------------------------------------------------------------- the edit flow

def run_web_edit_pr(
    instruction: str,
    image_path: Optional[str] = None,
    extra_system_prompt: Optional[str] = None,
    progress_callback: ProgressCallback = None,
    kind: str = "web edit",
) -> Dict[str, Any]:
    """Run the agent on a clone and open a Pull Request. Always returns a dict with `ok` and `summary`."""
    import dev_agent

    def say(message: str) -> None:
        print(message)
        if progress_callback:
            try:
                progress_callback(message)
            except Exception:
                pass

    try:
        client = require_client()
        say("🌿 Preparing a clean copy of the repository…")
        with work_area(instruction, client) as area:
            deps = ensure_dependencies(area.root)
            say("🤖 The agent is editing the copy (the live site is not touched)…")
            with dev_agent.work_in(area.root):
                result = dev_agent.run_web_dev_agent(
                    instruction=instruction,
                    image_path=image_path,
                    extra_system_prompt=extra_system_prompt,
                    progress_callback=progress_callback,
                )

            title = f"Web edit: {instruction.strip().splitlines()[0][:70]}"
            files = commit_changes(area.root, f"web: {instruction.strip().splitlines()[0][:90]}")
            if not files:
                return {"ok": True, "pr_number": None, "files": [], "screenshots": [],
                        "summary": result["summary"] + "\n\nℹ️ The agent made no file changes, so no Pull Request was opened."}

            say(f"📤 Pushing branch {area.branch} and opening a Pull Request…")
            push_branch(area)
            body = build_pr_body(instruction, result["summary"], files, _typecheck_label(result), kind)
            pr = client.create_pull(title=title, head=area.branch, base=area.base, body=body)

            screenshots: List[str] = []
            say("📸 Taking preview screenshots…")
            try:
                with preview_server(area.root) as base_url:
                    if base_url:
                        route = result.get("preview_route") or "/"
                        for viewport in ("desktop", "mobile"):
                            shot = dev_agent.capture_page_screenshot(route, viewport=viewport, base_url=base_url)
                            if shot:
                                screenshots.append(shot)
            except Exception as exc:  # the preview is a bonus; the PR already exists
                print(f"[!] Preview failed: {scrub(str(exc), client.token)}")

        summary = (
            f"{result['summary']}\n\n"
            f"🔀 Pull Request #{pr['number']}: {pr['html_url']}\n"
            f"Nothing is live yet. Review it, then approve the merge here or on GitHub."
        )
        return {
            "ok": True, "pr_number": pr["number"], "pr_url": pr["html_url"], "branch": area.branch,
            "files": files, "screenshots": screenshots, "summary": summary, "title": title,
            "typecheck_ok": result.get("typecheck_ok"), "dependencies": deps,
        }
    except WebPrError as exc:
        return {"ok": False, "pr_number": None, "files": [], "screenshots": [], "summary": f"❌ {exc}"}
    except GitHubError as exc:
        return {"ok": False, "pr_number": None, "files": [], "screenshots": [], "summary": f"❌ {exc.message}"}


# --------------------------------------------------------------------------- reviewing: list / merge / close / revert

def _check_ours(pr: dict, client: GitHubClient) -> None:
    head = pr.get("head") or {}
    repo = (head.get("repo") or {}).get("full_name")
    if (
        not str(head.get("ref", "")).startswith(BRANCH_PREFIX)
        or PR_MARKER not in (pr.get("body") or "")
        or (repo and repo.lower() != client.repo.lower())
    ):
        raise WebPrError(
            f"Pull Request #{pr.get('number')} was not created by the website-edit flow, so the bot will not touch it. "
            "Handle it on GitHub."
        )


def list_web_prs(client: Optional[GitHubClient] = None) -> List[dict]:
    client = client or require_client()
    ours = []
    for pr in client.list_pulls("open"):
        try:
            _check_ours(pr, client)
        except WebPrError:
            continue
        ours.append(pr)
    return ours


def get_web_pr(number: int, client: Optional[GitHubClient] = None) -> dict:
    client = client or require_client()
    pr = client.get_pull(number)
    _check_ours(pr, client)
    return pr


def merge_web_pr(number: int, client: Optional[GitHubClient] = None) -> Dict[str, Any]:
    """Squash-merge a PR created by this flow. Refuses anything else, drafts and PRs with conflicts."""
    client = client or require_client()
    pr = get_web_pr(number, client)
    if pr.get("merged"):
        raise WebPrError(f"Pull Request #{number} is already merged.")
    if pr.get("state") != "open":
        raise WebPrError(f"Pull Request #{number} is {pr.get('state')} and cannot be merged.")
    if pr.get("draft"):
        raise WebPrError(f"Pull Request #{number} is a draft.")
    if pr.get("mergeable") is False:
        raise WebPrError(f"Pull Request #{number} has conflicts with {pr['base']['ref']}. Ask for the edit again.")
    result = client.merge_pull(number, title=f"{pr['title']} (#{number})")
    client.delete_branch(pr["head"]["ref"])
    return {"merged": bool(result.get("merged", True)), "sha": result.get("sha"), "title": pr["title"], "url": pr["html_url"]}


def close_web_pr(number: int, client: Optional[GitHubClient] = None) -> Dict[str, Any]:
    client = client or require_client()
    pr = get_web_pr(number, client)
    if pr.get("merged") or pr.get("state") != "open":
        raise WebPrError(f"Pull Request #{number} is not open.")
    client.close_pull(number)
    client.delete_branch(pr["head"]["ref"])
    return {"closed": True, "title": pr["title"], "url": pr["html_url"]}


def revert_web_pr(number: int, progress_callback: ProgressCallback = None) -> Dict[str, Any]:
    """Open a new PR that undoes a MERGED PR of this flow."""
    client = require_client()
    pr = get_web_pr(number, client)
    if not pr.get("merged") or not pr.get("merge_commit_sha"):
        raise WebPrError(f"Pull Request #{number} is not merged, so there is nothing to revert. Use /web_close instead.")
    sha = pr["merge_commit_sha"]
    branch = f"{BRANCH_PREFIX}revert-{number}-{time.strftime('%Y%m%d-%H%M%S')}"

    with work_area(f"revert-{number}", client, branch=branch, depth=200) as area:
        try:
            _git(["cat-file", "-e", f"{sha}^{{commit}}"], cwd=area.root)
        except WebPrError:
            _git(["fetch", "--depth", "500", "origin", sha], cwd=area.root, token=area.token, url=area.url)
        parents = _git(["rev-list", "--parents", "-n", "1", sha], cwd=area.root).split()[1:]
        revert = ["revert", "--no-edit"] + (["-m", "1"] if len(parents) > 1 else []) + [sha]
        try:
            _git(revert, cwd=area.root)
        except WebPrError as exc:
            with contextlib.suppress(WebPrError):
                _git(["revert", "--abort"], cwd=area.root)
            raise WebPrError(
                f"Could not revert Pull Request #{number} cleanly (later changes touch the same lines): {exc}"
            )
        push_branch(area)
        files = _git(["diff", "--name-only", "HEAD~1", "HEAD"], cwd=area.root).split()
        title = f"Revert: {pr['title']}"[:250]
        body = build_pr_body(
            f"Undo Pull Request #{number}", f"Reverts the merge commit {sha[:10]} of “{pr['title']}”.", files,
            "not run (plain revert)", kind="revert",
        )
        new_pr = client.create_pull(title=title, head=area.branch, base=area.base, body=body)
    return {
        "ok": True, "pr_number": new_pr["number"], "pr_url": new_pr["html_url"], "branch": branch,
        "files": files, "screenshots": [], "title": title,
        "summary": f"↩️ Revert opened as Pull Request #{new_pr['number']}: {new_pr['html_url']}\nNothing changes until you merge it.",
    }

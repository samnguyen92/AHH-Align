"""
deploy.py — what happens on the server AFTER a website Pull Request has been merged.

OPENCLAW_DEPLOY_MODE decides (default `manual`, the safe one):

  manual   Nothing runs. The bot says the change is merged and how to update the live site
           (run deploy_hostinger_vps.sh on the server). No special rights are needed.
  webhook  POST to DEPLOY_WEBHOOK_URL (your own deploy hook, a CI job, ...).
  docker   `git pull` + `docker compose up -d --build web` on the host. Needs the Docker socket and the
           repository checkout mounted into the bot container, i.e. root-equivalent rights on the server:
           opt in explicitly with docker-compose.deploy.yml.
"""

from __future__ import annotations

import os
import subprocess
import urllib.request
from typing import Optional

from dev_agent import PROJECT_ROOT

MODES = ("manual", "webhook", "docker")


def deploy_mode() -> str:
    mode = (os.environ.get("OPENCLAW_DEPLOY_MODE") or "manual").strip().lower()
    return mode if mode in MODES else "manual"


def deploy_after_merge() -> str:
    """Update the live site if the deploy mode allows it. Returns a short, human-readable status."""
    mode = deploy_mode()

    if mode == "manual":
        return (
            "ℹ️ Merged into main. The live site is NOT updated automatically.\n"
            "Update it on the server with ./deploy_hostinger_vps.sh "
            "(or set OPENCLAW_DEPLOY_MODE=webhook or docker, see openclaw/.env.example)."
        )

    if mode == "webhook":
        url = (os.environ.get("DEPLOY_WEBHOOK_URL") or "").strip()
        if not url.startswith(("http://", "https://")):
            return "⚠️ OPENCLAW_DEPLOY_MODE=webhook but DEPLOY_WEBHOOK_URL is not a valid URL. Deploy manually."
        try:
            request = urllib.request.Request(url, method="POST", data=b"")
            with urllib.request.urlopen(request, timeout=20) as response:
                return f"✅ Deploy webhook triggered (HTTP {response.status})."
        except Exception as exc:
            return f"⚠️ The deploy webhook failed: {exc}. Deploy manually."

    # docker
    if not os.path.exists("/var/run/docker.sock"):
        return (
            "⚠️ OPENCLAW_DEPLOY_MODE=docker but the Docker socket is not available in the bot container "
            "(start it with docker-compose.deploy.yml). Deploy manually."
        )
    try:
        pull = _run(["git", "pull", "--ff-only"], PROJECT_ROOT, 120)
        if pull.returncode != 0:
            return f"⚠️ git pull failed, live site NOT updated: {(pull.stderr or pull.stdout)[-300:]}"
        build = _run(
            ["docker", "compose", "--env-file", ".env.local", "up", "-d", "--build", "web"], PROJECT_ROOT, 600
        )
        if build.returncode != 0:
            return f"⚠️ docker compose returned {build.returncode}: {(build.stderr or '')[-300:]}"
        return "✅ Pulled main and rebuilt the web container."
    except FileNotFoundError as exc:
        return f"⚠️ Required tool is missing in the bot container ({exc}). Deploy manually."
    except subprocess.TimeoutExpired:
        return "⚠️ The deploy timed out. Check the server."


def _run(command: list, cwd: Optional[str], timeout: int) -> subprocess.CompletedProcess:
    return subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=timeout)

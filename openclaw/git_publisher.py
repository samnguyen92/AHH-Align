"""
git_publisher.py — Safe GitOps & Live Deployment Pipeline for OpenClaw.

Handles:
  1. `get_git_diff_summary()`: Shows current modified/untracked files in `src/`, `public/`, `openclaw/`.
  2. `rollback_changes()`: Discards uncommitted changes in `src/` and `public/` so the user
     can revert any unwanted UI/code edit with 1 command (`/rollback`).
  3. `publish_to_github_and_live(commit_message, telegram_updater=None)`:
     - Verifies TypeScript build integrity (`npx tsc --noEmit`)
     - Stages safe code paths (`src/`, `public/`, `openclaw/`, `scripts/`, `docker-compose.yml`)
     - Commits & pushes directly to `origin main` (`samnguyen92/AHH-Align`)
     - Rebuilds & restarts the live Docker container (`asian-health-hub-web`) and/or triggers `DEPLOY_WEBHOOK_URL`.
"""

from __future__ import annotations

import os
import subprocess
import urllib.request
from typing import Callable, Optional

from dotenv import load_dotenv

from dev_agent import PROJECT_ROOT, run_typecheck

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(PROJECT_ROOT, ".env.local"))

SAFE_STAGE_PATHS = [
    "src",
    "public",
    "openclaw",
    "scripts",
    "docker-compose.yml",
    "Dockerfile",
    "package.json",
    ".gitignore",
]


def _run_git(args: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def get_git_diff_summary() -> str:
    status_proc = _run_git(["status", "-sb", "--", "src", "public", "openclaw", "scripts"])
    diff_stat_proc = _run_git(["diff", "--stat", "--", "src", "public"])

    status_out = (status_proc.stdout or "").strip() or "Working tree clean."
    diff_out = (diff_stat_proc.stdout or "").strip() or "Không có thay đổi chưa stage trong src/ hoặc public/."

    return (
        "📦 **TRẠNG THÁI GIT HIỆN TẠI (`samnguyen92/AHH-Align`)**\n\n"
        f"**Git Status:**\n```\n{status_out[:1500]}\n```\n\n"
        f"**Thống kê Diff (`src/`, `public/`):**\n```\n{diff_out[:1500]}\n```\n\n"
        "👉 Gõ `/publish <ghi chú commit>` để đẩy lên GitHub `main` & cập nhật Live, hoặc `/rollback` để hoàn tác các sửa đổi trong `src/`."
    )


def rollback_changes() -> str:
    diff_proc = _run_git(["status", "--porcelain", "--", "src", "public"])
    changed = (diff_proc.stdout or "").strip()
    if not changed:
        return "ℹ️ Không có thay đổi nào chưa commit trong `src/` hoặc `public/` để hoàn tác."

    checkout_proc = _run_git(["checkout", "--", "src", "public"])
    if checkout_proc.returncode != 0:
        return f"❌ Không thể rollback: {checkout_proc.stderr}"

    return (
        "⏪ **Đã hoàn tác (Rollback) thành công!**\n"
        "Toàn bộ các thay đổi chưa commit trong `src/` và `public/` đã được khôi phục về trạng thái commit gần nhất."
    )


def publish_to_github_and_live(
    commit_message: Optional[str] = None,
    telegram_updater: Optional[Callable[[str], None]] = None,
) -> str:
    def notify(msg: str) -> None:
        print(msg)
        if telegram_updater:
            try:
                telegram_updater(msg)
            except Exception:
                pass

    notify("🧪 Bước 1/4: Đang kiểm tra TypeScript (`npx tsc --noEmit`)...")
    tc = run_typecheck()
    if not tc["ok"]:
        return (
            "❌ **Huỷ Publish vì phát hiện lỗi TypeScript!**\n"
            f"```\n{tc['output'][:1500]}\n```\n"
            "Hãy nhắn `/web_edit Sửa lỗi TypeScript hiện tại` hoặc `/rollback`."
        )

    notify("📦 Bước 2/4: Đang stage file và tạo Git commit trên nhánh `main`...")
    existing_paths = [p for p in SAFE_STAGE_PATHS if os.path.exists(os.path.join(PROJECT_ROOT, p))]
    _run_git(["add", "--", *existing_paths])
    # Ensure no .env files or .DS_Store are ever staged
    _run_git(["reset", "HEAD", "--", ".env", ".env.local", "openclaw/.env", "*.DS_Store"])

    status_check = _run_git(["diff", "--cached", "--name-only"])
    staged_files = [line.strip() for line in (status_check.stdout or "").splitlines() if line.strip()]

    commit_sha = "no-new-commit"
    if staged_files:
        msg = (commit_message or "").strip() or "feat(openclaw): update website UI/SEO via OpenClaw Agent"
        commit_proc = _run_git(["commit", "-m", msg])
        if commit_proc.returncode != 0:
            return f"❌ Git commit thất bại:\n```\n{commit_proc.stderr or commit_proc.stdout}\n```"
        sha_proc = _run_git(["rev-parse", "--short", "HEAD"])
        commit_sha = (sha_proc.stdout or "").strip() or "HEAD"

        notify(f"🐙 Bước 3/4: Đang push commit `{commit_sha}` lên GitHub (`origin main`)...")
        github_token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
        if github_token:
            remote_proc = _run_git(["remote", "get-url", "origin"])
            remote_url = (remote_proc.stdout or "").strip()
            if remote_url.startswith("https://github.com/"):
                authed_url = remote_url.replace("https://github.com/", f"https://x-access-token:{github_token}@github.com/")
                push_proc = _run_git(["push", authed_url, "HEAD:main"], timeout=90)
            else:
                push_proc = _run_git(["push", "origin", "HEAD:main"], timeout=90)
        else:
            push_proc = _run_git(["push", "origin", "HEAD:main"], timeout=90)

        if push_proc.returncode != 0:
            return (
                f"⚠️ Đã tạo commit `{commit_sha}` cục bộ nhưng `git push origin main` gặp lỗi:\n"
                f"```\n{(push_proc.stderr or push_proc.stdout)[:1000]}\n```\n"
                "💡 Nếu chạy trên VPS Hostinger, bạn chỉ cần thêm `GITHUB_TOKEN=<personal_access_token>` vào `openclaw/.env`."
            )
    else:
        notify("ℹ️ Không có file code mới cần commit; tiến hành cập nhật/kiểm tra bản Live...")

    notify("🌐 Bước 4/4: Đang cập nhật bản Live (Docker `web` / Deploy Webhook)...")
    live_status = []

    webhook_url = os.environ.get("DEPLOY_WEBHOOK_URL", "").strip()
    if webhook_url:
        try:
            req = urllib.request.Request(webhook_url, method="POST")
            with urllib.request.urlopen(req, timeout=15) as resp:
                live_status.append(f"✅ Đã kích hoạt Deploy Webhook (HTTP {resp.status})")
        except Exception as exc:
            live_status.append(f"⚠️ Deploy Webhook lỗi: {exc}")

    # Rebuild local/VPS web container if docker compose is accessible on host
    if not os.path.exists("/.dockerenv") or os.path.exists("/var/run/docker.sock"):
        try:
            dc_proc = subprocess.run(
                ["docker", "compose", "--env-file", ".env.local", "up", "-d", "--build", "web"],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                timeout=300,
            )
            if dc_proc.returncode == 0:
                live_status.append("✅ Đã rebuild & khởi động lại container `asian-health-hub-web` thành công.")
            else:
                live_status.append(f"⚠️ Lệnh rebuild Docker trả về mã {dc_proc.returncode}: {(dc_proc.stderr or '')[-300:]}")
        except FileNotFoundError:
            live_status.append("ℹ️ Docker CLI không chạy trong môi trường hiện tại; đã push code lên GitHub `main`.")
        except Exception as exc:
            live_status.append(f"⚠️ Lỗi khi gọi Docker Compose: {exc}")
    else:
        live_status.append("ℹ️ Đang chạy trong container cô lập (không mount docker.sock); đã push lên GitHub `main`.")

    files_summary = "\n".join(f"• `{f}`" for f in staged_files[:15]) if staged_files else "• *(Không có file mới)*"
    live_summary = "\n".join(live_status)

    return (
        "🎉 **PUBLISH & LIVE DEPLOY HOÀN TẤT!**\n\n"
        f"• **Commit**: `{commit_sha}` trên nhánh `main` (`samnguyen92/AHH-Align`)\n"
        f"• **Số file đã đẩy lên GitHub ({len(staged_files)})**:\n{files_summary}\n\n"
        f"**Trạng thái Live:**\n{live_summary}"
    )

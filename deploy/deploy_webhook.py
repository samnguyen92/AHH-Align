#!/usr/bin/env python3
"""
deploy_webhook.py — tiny deploy hook for the VPS HOST (not inside Docker). Python 3 standard library only.

The OpenClaw bot calls it after a website Pull Request is merged (OPENCLAW_DEPLOY_MODE=webhook):

    POST http://<bind>:<port>/deploy/<DEPLOY_HOOK_TOKEN>

It answers 202 at once and then runs, in the background and one at a time:
    git pull --ff-only  &&  ./deploy_hostinger_vps.sh
(the script restarts the containers, so the answer must not wait for it).

Environment:
  DEPLOY_HOOK_TOKEN  required, long random string (the URL path secret)
  DEPLOY_HOOK_BIND   default 172.17.0.1 (Docker bridge: reachable from containers, not from the internet)
  DEPLOY_HOOK_PORT   default 9000
  DEPLOY_REPO_DIR    default: the parent of this file's folder
  DEPLOY_COMMAND     default ./deploy_hostinger_vps.sh
"""

import hmac
import os
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REPO_DIR = os.environ.get("DEPLOY_REPO_DIR") or os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
COMMAND = os.environ.get("DEPLOY_COMMAND", "./deploy_hostinger_vps.sh")
TOKEN = os.environ.get("DEPLOY_HOOK_TOKEN", "")
_LOCK = threading.Lock()


def log(message: str) -> None:
    print(time.strftime("%Y-%m-%d %H:%M:%S"), message, flush=True)


def run_deploy() -> None:
    try:
        for command in (["git", "pull", "--ff-only"], ["bash", "-c", COMMAND]):
            log(f"running: {' '.join(command)}")
            result = subprocess.run(command, cwd=REPO_DIR, capture_output=True, text=True, timeout=1800)
            tail = (result.stdout + result.stderr)[-1500:]
            log(f"exit {result.returncode}\n{tail}")
            if result.returncode != 0:
                log("deploy stopped: a step failed")
                return
        log("deploy finished")
    except Exception as exc:  # never let the background thread die silently
        log(f"deploy crashed: {exc}")
    finally:
        _LOCK.release()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _reply(self, status: int, text: str) -> None:
        data = text.encode()
        self.send_response(status)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        expected = f"/deploy/{TOKEN}"
        if not TOKEN or not hmac.compare_digest(self.path.encode(), expected.encode()):
            return self._reply(404, "not found")
        if not _LOCK.acquire(blocking=False):
            return self._reply(409, "a deploy is already running")
        threading.Thread(target=run_deploy, daemon=True).start()
        log("deploy accepted")
        self._reply(202, "deploy started")


def main() -> None:
    if len(TOKEN) < 24:
        raise SystemExit("DEPLOY_HOOK_TOKEN must be set to a random string of at least 24 characters")
    bind = os.environ.get("DEPLOY_HOOK_BIND", "172.17.0.1")
    port = int(os.environ.get("DEPLOY_HOOK_PORT", "9000"))
    log(f"listening on {bind}:{port}, repo {REPO_DIR}")
    ThreadingHTTPServer((bind, port), Handler).serve_forever()


if __name__ == "__main__":
    main()

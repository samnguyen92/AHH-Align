"""A tiny in-memory GitHub REST API for tests (pull requests only), served on 127.0.0.1.

It checks the Authorization header on every request and records everything it receives, so tests can
assert both what the bot asked GitHub to do and that the token never ended up anywhere it should not.
"""

import json
import re
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

OWNER_REPO = "owner/repo"


class FakeGitHub:
    def __init__(self, token="ghp_test_token_0123456789"):
        self.token = token
        self.pulls = {}            # number -> dict
        self.requests = []         # (method, path, body)
        self.deleted_branches = []
        self.next_number = 5
        self.default_branch = "main"
        self.fail_next = None      # (status, message) for the next request
        self._server = None

    # ---- lifecycle
    def start(self):
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):  # silence
                pass

            def _send(self, status, payload=None):
                if status == 204:
                    self.send_response(204)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                data = json.dumps(payload if payload is not None else {}).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _handle(self, method):
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(length)) if length else None
                fake.requests.append((method, self.path, body, dict(self.headers)))
                if self.headers.get("Authorization") != f"Bearer {fake.token}":
                    return self._send(401, {"message": "Bad credentials"})
                if fake.fail_next:
                    status, message = fake.fail_next
                    fake.fail_next = None
                    return self._send(status, {"message": message})
                result = fake.route(method, self.path, body)
                return self._send(*result)

            def do_GET(self):
                self._handle("GET")

            def do_POST(self):
                self._handle("POST")

            def do_PUT(self):
                self._handle("PUT")

            def do_PATCH(self):
                self._handle("PATCH")

            def do_DELETE(self):
                self._handle("DELETE")

        self._server = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
        return f"http://127.0.0.1:{self._server.server_port}"

    def stop(self):
        if self._server:
            self._server.shutdown()
            self._server.server_close()

    # ---- routes
    def route(self, method, path, body):
        base = f"/repos/{OWNER_REPO}"
        if method == "GET" and path == base:
            return 200, {"default_branch": self.default_branch}
        if method == "POST" and path == f"{base}/pulls":
            number = self.next_number
            self.next_number += 1
            self.pulls[number] = {
                "number": number, "title": body["title"], "body": body["body"], "state": "open", "merged": False,
                "draft": bool(body.get("draft")), "mergeable": True, "changed_files": 2, "additions": 10, "deletions": 3,
                "head": {"ref": body["head"], "repo": {"full_name": OWNER_REPO}},
                "base": {"ref": body["base"]}, "html_url": f"https://github.test/{OWNER_REPO}/pull/{number}",
                "merge_commit_sha": None,
            }
            return 201, self.pulls[number]
        m = re.fullmatch(rf"{re.escape(base)}/pulls/(\d+)", path)
        if m and method == "GET":
            pr = self.pulls.get(int(m.group(1)))
            return (200, pr) if pr else (404, {"message": "Not Found"})
        if m and method == "PATCH":
            pr = self.pulls.get(int(m.group(1)))
            if not pr:
                return 404, {"message": "Not Found"}
            pr.update(body)
            return 200, pr
        m = re.fullmatch(rf"{re.escape(base)}/pulls/(\d+)/merge", path)
        if m and method == "PUT":
            pr = self.pulls.get(int(m.group(1)))
            if not pr:
                return 404, {"message": "Not Found"}
            if pr["state"] != "open":
                return 405, {"message": "Pull Request is not mergeable"}
            pr["merged"] = True
            pr["state"] = "closed"
            pr["merge_commit_sha"] = pr.get("merge_commit_sha") or "0" * 40
            return 200, {"merged": True, "sha": pr["merge_commit_sha"], "message": "Pull Request successfully merged"}
        if method == "GET" and path.startswith(f"{base}/pulls?"):
            return 200, [p for p in self.pulls.values() if p["state"] == "open"]
        m = re.fullmatch(rf"{re.escape(base)}/git/refs/heads/(.+)", path)
        if m and method == "DELETE":
            self.deleted_branches.append(m.group(1))
            return 204, None
        return 404, {"message": f"no route {method} {path}"}

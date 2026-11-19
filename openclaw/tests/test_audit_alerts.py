"""
The website audit behind "WEBSITE ANOMALY ALERT": a page is retried before it is called broken, and the alert
says WHY (404, 500, no response) instead of only listing paths.
"""

import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import stats_agent  # noqa: E402
import stats_metrics  # noqa: E402

GOOD = b"<html><head><title>Ok page title that is long enough</title></head><body><h1>Hi</h1></body></html>"


@pytest.fixture()
def site(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)  # the retry pause is not under test
    hits = {}
    plan = {}  # path -> list of statuses to answer with, last one repeats

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            hits[self.path] = hits.get(self.path, 0) + 1
            answers = plan.get(self.path, [200])
            status = answers[min(hits[self.path], len(answers)) - 1]
            body = GOOD if status == 200 else b"nope"
            self.send_response(status)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}", hits, plan
    server.shutdown()
    server.server_close()


def test_a_real_404_is_reported_at_once_without_a_second_look(site):
    base, hits, plan = site
    plan["/gone"] = [404]
    page = stats_metrics._audit_page(base, "/gone")
    assert page["status"] == 404 and hits["/gone"] == 1


def test_a_page_that_fails_once_while_it_renders_is_not_called_broken(site):
    base, hits, plan = site
    plan["/slow"] = [500, 200]
    page = stats_metrics._audit_page(base, "/slow")
    assert page["status"] == 200 and hits["/slow"] == 2


def test_a_page_that_keeps_failing_is_reported_with_its_status(site):
    base, hits, plan = site
    plan["/down"] = [503]
    page = stats_metrics._audit_page(base, "/down")
    assert page["status"] == 503 and hits["/down"] == 2


def test_a_page_that_never_answers_is_reported_as_no_response():
    page = stats_metrics._audit_page("http://127.0.0.1:1", "/x")  # nothing listens on port 1
    assert page["status"] == 0 and page["error"] and page["issues"] == ["unreachable"]


def test_the_alert_says_why_each_page_failed(monkeypatch):
    monkeypatch.setattr(stats_agent.sm, "metric_seo_internal", lambda sample=15: {
        "ok": True, "sitemap_ok": True,
        "pages_broken": ["/a", "/b", "/c"],
        "pages_broken_detail": [{"path": "/a", "status": 404, "error": ""}, {"path": "/b", "status": 0, "error": "Read timed out"},
                                {"path": "/c", "status": 500, "error": ""}],
    })
    message = [a["message"] for a in stats_agent.check_anomalies("en")["anomalies"] if a["scope"] == "seo"][0]
    assert "/a (404)" in message and "/b (no response: Read timed out)" in message and "/c (500)" in message

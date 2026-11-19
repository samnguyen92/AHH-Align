"""
Website edits as Pull Requests: the agent's file safety, the real git flow against a local bare repository,
the GitHub calls against an in-memory fake API, merge/close/revert rules, and the deploy modes.

No network and no LLM: `run_web_dev_agent` is replaced by a scripted agent that edits files through the REAL
tools, so the safety rules are exercised exactly as in production.
"""

import os
import subprocess
import sys
import threading

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))

import dev_agent  # noqa: E402
import deploy  # noqa: E402
import github_api  # noqa: E402
import web_pr  # noqa: E402
from fake_github import OWNER_REPO, FakeGitHub  # noqa: E402

TOKEN = "ghp_test_token_0123456789"


def git(*args, cwd=None):
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True, env=env).stdout.strip()


# =========================================================================== agent file safety

@pytest.fixture()
def tree(tmp_path):
    root = tmp_path / "site"
    for rel, content in {
        "src/components/hero.tsx": "export const Hero = () => 'hello';\n",
        "src/app/api/auth/login/route.ts": "// login\n",
        "src/lib/auth/token.ts": "// token\n",
        "src/lib/db/postgres.ts": "// db\n",
        "src/proxy.ts": "// proxy\n",
        "src/services/auth-service.ts": "// auth\n",
        "public/robots.txt": "x\n",
        "package.json": "{}\n",
    }.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    return root


def test_agent_can_edit_ui_files(tree):
    with dev_agent.work_in(str(tree)):
        out = dev_agent.tool_apply_code_patch("src/components/hero.tsx", "hello", "welcome")
        assert out.startswith("Successfully")
        assert dev_agent.tool_write_source_file("src/components/new.tsx", "export {}\n").startswith("Successfully")
        assert dev_agent.tool_write_source_file("public/brand/a.txt", "x").startswith("Successfully")
    assert "welcome" in (tree / "src/components/hero.tsx").read_text()


@pytest.mark.parametrize("path", [
    "src/app/api/auth/login/route.ts", "src/app/api/new/route.ts", "src/lib/auth/token.ts", "src/lib/db/postgres.ts",
    "src/proxy.ts", "src/services/auth-service.ts",
])
def test_agent_cannot_edit_security_critical_code(tree, path):
    with dev_agent.work_in(str(tree)):
        out = dev_agent.tool_write_source_file(path, "// pwned\n")
        assert out.startswith("Error") and "security-critical" in out
        assert dev_agent.tool_apply_code_patch(path, "//", "// pwned") .startswith("Error")
    assert "pwned" not in (tree / path).read_text() if (tree / path).exists() else True


@pytest.mark.parametrize("path", [
    "package.json", ".env", "src/../package.json", "../outside.txt", "/etc/passwd", "src/../../outside.txt",
    "openclaw/telegram_bot.py", ".git/config", "node_modules/x/index.js",
])
def test_agent_cannot_write_outside_src_and_public(tree, path):
    with dev_agent.work_in(str(tree)):
        assert dev_agent.tool_write_source_file(path, "x").startswith("Error")
    assert (tree / "package.json").read_text() == "{}\n"


def test_symlinks_cannot_be_used_to_escape(tree, tmp_path):
    outside = tmp_path / "site-evil"            # shares the "site" prefix: a naive startswith() check passes it
    outside.mkdir()
    (outside / "secret.txt").write_text("secret")
    os.symlink(outside, tree / "src" / "components" / "link")
    os.symlink(outside / "secret.txt", tree / "src" / "components" / "leak.tsx")
    with dev_agent.work_in(str(tree)):
        assert dev_agent.tool_read_source_file("src/components/leak.tsx").startswith("Error")
        assert dev_agent.tool_write_source_file("src/components/link/pwn.txt", "x").startswith("Error")
        assert dev_agent.tool_read_source_file("src/components/link/secret.txt").startswith("Error")
    assert not (outside / "pwn.txt").exists()


def test_reading_is_allowed_for_source_but_not_secrets(tree):
    with dev_agent.work_in(str(tree)):
        assert "login" in dev_agent.tool_read_source_file("src/app/api/auth/login/route.ts")  # may read, not write
        assert dev_agent.tool_read_source_file(".env").startswith("Error")


def test_the_working_root_is_isolated_per_thread(tree, tmp_path):
    other = tmp_path / "other"
    (other / "src").mkdir(parents=True)
    (other / "src" / "x.tsx").write_text("other")
    seen = {}

    def worker():
        with dev_agent.work_in(str(other)):
            seen["inner"] = dev_agent.current_root()

    with dev_agent.work_in(str(tree)):
        t = threading.Thread(target=worker)
        t.start()
        t.join()
        seen["outer"] = dev_agent.current_root()
    assert seen["inner"] == os.path.realpath(other) and seen["outer"] == os.path.realpath(tree)
    assert dev_agent.current_root() == os.path.realpath(dev_agent.PROJECT_ROOT)  # restored afterwards


def test_typecheck_is_reported_as_skipped_not_passed_without_dependencies(tree):
    with dev_agent.work_in(str(tree)):
        res = dev_agent.run_typecheck()
    assert res["skipped"] is True and res["ok"] is False


# =========================================================================== helpers

def test_status_parsing_handles_renames_and_spaces():
    out = " M src/a.tsx\0?? src/new file.tsx\0R  src/new.tsx\0src/old.tsx\0 D src/gone.tsx\0"
    assert web_pr._parse_status(out) == ["src/a.tsx", "src/new file.tsx", "src/new.tsx", "src/gone.tsx"]


def test_toolchain_artifacts_are_not_treated_as_changes():
    for artifact in ("next-env.d.ts", "tsconfig.tsbuildinfo", "node_modules", ".next/cache/x"):
        assert web_pr._is_artifact(artifact)
    assert not web_pr._is_artifact("src/a.tsx")


def test_token_is_scrubbed_from_text():
    import base64

    basic = base64.b64encode(f"x-access-token:{TOKEN}".encode()).decode()
    text = f"fatal: {TOKEN} and header {basic}"
    cleaned = github_api.scrub(text, TOKEN)
    assert TOKEN not in cleaned and basic not in cleaned


def test_git_auth_header_is_only_sent_to_https_remotes():
    assert web_pr._auth_args("https://github.com/o/r.git", TOKEN)[0] == "-c"
    assert web_pr._auth_args("/local/path.git", TOKEN) == []
    assert web_pr._auth_args("https://github.com/o/r.git", None) == []


# =========================================================================== real git flow + fake GitHub

@pytest.fixture()
def world(tmp_path, monkeypatch):
    """A bare 'origin' with a main branch, a fake GitHub API, and the env the flow reads."""
    seed = tmp_path / "seed"
    (seed / "src/components").mkdir(parents=True)
    (seed / "src/app/api").mkdir(parents=True)
    (seed / "src/components/hero.tsx").write_text("export const Hero = () => 'hello';\nline2\nline3\n")
    (seed / "src/app/api/x.ts").write_text("// api\n")
    (seed / "package.json").write_text("{}\n")
    git("init", "-q", "-b", "main", cwd=seed)
    git("add", "-A", cwd=seed)
    git("commit", "-q", "-m", "init", cwd=seed)
    origin = tmp_path / "origin.git"
    git("clone", "-q", "--bare", str(seed), str(origin))

    gh = FakeGitHub(TOKEN)
    api_url = gh.start()
    monkeypatch.setenv("OPENCLAW_REPO_URL", str(origin))
    monkeypatch.setenv("OPENCLAW_BASE_BRANCH", "main")
    monkeypatch.setenv("OPENCLAW_WORK_DIR", str(tmp_path / "work"))
    monkeypatch.setenv("GITHUB_TOKEN", TOKEN)
    monkeypatch.setenv("GITHUB_REPOSITORY", OWNER_REPO)
    monkeypatch.setenv("GITHUB_API_URL", api_url)
    monkeypatch.setenv("OPENCLAW_WEB_INSTALL", "off")
    monkeypatch.setenv("OPENCLAW_WEB_PREVIEW", "off")
    yield type("World", (), {"origin": str(origin), "gh": gh, "tmp": tmp_path})
    gh.stop()


def scripted_agent(monkeypatch, edit):
    """Replace the LLM agent with `edit()`, which runs inside the work directory using the real tools."""
    def fake(instruction, image_path=None, extra_system_prompt=None, progress_callback=None, **kw):
        edit()
        return {"summary": "Changed the hero text.", "modified_files": ["src/components/hero.tsx"],
                "typecheck_ok": False, "typecheck_skipped": True, "preview_route": "/"}
    monkeypatch.setattr(dev_agent, "run_web_dev_agent", fake)


def origin_branches(world):
    return git("branch", "--list", cwd=world.origin).replace("*", "").split()


def test_edit_opens_a_pull_request_and_never_touches_main(world, monkeypatch):
    scripted_agent(monkeypatch, lambda: dev_agent.tool_apply_code_patch("src/components/hero.tsx", "hello", "welcome"))
    main_before = git("rev-parse", "main", cwd=world.origin)

    res = web_pr.run_web_edit_pr("Change the hero greeting to welcome", kind="web edit")

    assert res["ok"] and res["pr_number"] == 5 and res["files"] == ["src/components/hero.tsx"]
    assert git("rev-parse", "main", cwd=world.origin) == main_before                 # main untouched
    branch = res["branch"]
    assert branch.startswith("web-edit/") and branch in origin_branches(world)
    assert "welcome" in git("show", f"{branch}:src/components/hero.tsx", cwd=world.origin)
    pr = world.gh.pulls[5]
    assert pr["head"]["ref"] == branch and pr["base"]["ref"] == "main" and web_pr.PR_MARKER in pr["body"]
    assert "not run" in pr["body"] and "Change the hero greeting" in pr["body"]
    assert "Pull Request #5" in res["summary"] and "Nothing is live yet" in res["summary"]
    assert all(r[3].get("Authorization") == f"Bearer {TOKEN}" for r in world.gh.requests)
    assert TOKEN not in str(res) and TOKEN not in pr["body"]
    assert os.listdir(world.tmp / "work") == []            # the throw-away clone was removed


def test_the_commit_is_authored_by_the_bot(world, monkeypatch):
    scripted_agent(monkeypatch, lambda: dev_agent.tool_apply_code_patch("src/components/hero.tsx", "hello", "hi"))
    res = web_pr.run_web_edit_pr("x")
    assert git("log", "-1", "--format=%an <%ae>", res["branch"], cwd=world.origin) == "OpenClaw Bot <openclaw@users.noreply.github.com>"


def test_an_edit_that_touches_forbidden_files_is_refused_and_nothing_is_pushed(world, monkeypatch):
    def sneaky():
        # bypass the tools and write straight to disk: the commit gate must still stop it
        root = dev_agent.current_root()
        with open(os.path.join(root, "src/app/api/x.ts"), "w") as fh:
            fh.write("// backdoor\n")
        dev_agent.tool_apply_code_patch("src/components/hero.tsx", "hello", "welcome")

    scripted_agent(monkeypatch, sneaky)
    res = web_pr.run_web_edit_pr("x")
    assert res["ok"] is False and "not allowed to change" in res["summary"] and "src/app/api/x.ts" in res["summary"]
    assert origin_branches(world) == ["main"] and world.gh.pulls == {}


def test_a_change_outside_src_and_public_is_refused(world, monkeypatch):
    def sneaky():
        with open(os.path.join(dev_agent.current_root(), "package.json"), "w") as fh:
            fh.write('{"scripts":{"postinstall":"curl evil"}}\n')

    scripted_agent(monkeypatch, sneaky)
    res = web_pr.run_web_edit_pr("x")
    assert res["ok"] is False and "package.json" in res["summary"] and origin_branches(world) == ["main"]


def test_no_changes_means_no_pull_request(world, monkeypatch):
    scripted_agent(monkeypatch, lambda: None)
    res = web_pr.run_web_edit_pr("x")
    assert res["ok"] and res["pr_number"] is None and "no Pull Request was opened" in res["summary"]
    assert world.gh.pulls == {} and origin_branches(world) == ["main"]


def test_without_a_token_it_explains_how_to_create_one(world, monkeypatch):
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("GH_TOKEN", raising=False)
    res = web_pr.run_web_edit_pr("x")
    assert res["ok"] is False and "GITHUB_TOKEN" in res["summary"] and "Pull requests: read & write" in res["summary"]


def test_only_one_edit_runs_at_a_time(world, monkeypatch):
    scripted_agent(monkeypatch, lambda: None)
    assert web_pr._EDIT_LOCK.acquire(blocking=False)
    try:
        res = web_pr.run_web_edit_pr("x")
    finally:
        web_pr._EDIT_LOCK.release()
    assert res["ok"] is False and "Another website edit is running" in res["summary"]


def test_github_errors_become_readable_messages_without_the_token(world, monkeypatch):
    scripted_agent(monkeypatch, lambda: dev_agent.tool_apply_code_patch("src/components/hero.tsx", "hello", "hi"))
    world.gh.fail_next = None
    # first request is default_branch (skipped: base branch is configured) -> the PR creation fails
    world.gh.fail_next = (422, "Validation Failed")
    res = web_pr.run_web_edit_pr("x")
    assert res["ok"] is False and "422" in res["summary"] and TOKEN not in res["summary"]


# ---- merge / close / list / revert ----------------------------------------------------------------------

def make_pr(world, monkeypatch, text="x"):
    scripted_agent(monkeypatch, lambda: dev_agent.tool_apply_code_patch("src/components/hero.tsx", "hello", "welcome"))
    return web_pr.run_web_edit_pr(text)


def test_merge_squashes_and_deletes_the_branch(world, monkeypatch):
    res = make_pr(world, monkeypatch)
    out = web_pr.merge_web_pr(res["pr_number"])
    assert out["merged"] is True
    put = [r for r in world.gh.requests if r[0] == "PUT"][0]
    assert put[2]["merge_method"] == "squash" and "(#5)" in put[2]["commit_title"]
    assert world.gh.deleted_branches == [res["branch"]]


def test_the_bot_refuses_to_touch_pull_requests_it_did_not_create(world):
    gh = world.gh
    base = {"state": "open", "merged": False, "draft": False, "mergeable": True, "base": {"ref": "main"}, "title": "t",
            "html_url": "u", "head": {"repo": {"full_name": OWNER_REPO}}}
    gh.pulls[50] = {**base, "number": 50, "body": "hand-written", "head": {"ref": "web-edit/x", "repo": {"full_name": OWNER_REPO}}}
    gh.pulls[51] = {**base, "number": 51, "body": web_pr.PR_MARKER, "head": {"ref": "feature/x", "repo": {"full_name": OWNER_REPO}}}
    gh.pulls[52] = {**base, "number": 52, "body": web_pr.PR_MARKER, "head": {"ref": "web-edit/y", "repo": {"full_name": "attacker/fork"}}}
    for number in (50, 51, 52):
        for action in (web_pr.merge_web_pr, web_pr.close_web_pr, web_pr.get_web_pr):
            with pytest.raises(web_pr.WebPrError, match="not created by the website-edit flow"):
                action(number)
    assert [r for r in gh.requests if r[0] in ("PUT", "PATCH", "DELETE")] == []
    assert web_pr.list_web_prs() == []


@pytest.mark.parametrize("changes,message", [
    ({"merged": True}, "already merged"), ({"state": "closed"}, "closed"), ({"draft": True}, "draft"),
    ({"mergeable": False}, "conflicts"),
])
def test_merge_refuses_unmergeable_pull_requests(world, monkeypatch, changes, message):
    res = make_pr(world, monkeypatch)
    world.gh.pulls[res["pr_number"]].update(changes)
    with pytest.raises(web_pr.WebPrError, match=message):
        web_pr.merge_web_pr(res["pr_number"])
    assert [r for r in world.gh.requests if r[0] == "PUT"] == []


def test_list_shows_only_our_open_pull_requests(world, monkeypatch):
    res = make_pr(world, monkeypatch)
    world.gh.pulls[99] = {**world.gh.pulls[res["pr_number"]], "number": 99, "body": "someone else", "head": {"ref": "dev/x", "repo": {"full_name": OWNER_REPO}}}
    assert [p["number"] for p in web_pr.list_web_prs()] == [res["pr_number"]]


def test_close_discards_the_pull_request_and_its_branch(world, monkeypatch):
    res = make_pr(world, monkeypatch)
    web_pr.close_web_pr(res["pr_number"])
    assert world.gh.pulls[res["pr_number"]]["state"] == "closed" and world.gh.deleted_branches == [res["branch"]]
    with pytest.raises(web_pr.WebPrError, match="not open"):
        web_pr.close_web_pr(res["pr_number"])


def simulate_squash_merge(world, branch, message="squash"):
    """Apply the PR branch to main in the bare repo as ONE new commit, like GitHub's squash merge."""
    wc = world.tmp / "merger"
    git("clone", "-q", world.origin, str(wc))
    git("merge", "--squash", f"origin/{branch}", cwd=wc)
    git("commit", "-q", "-m", message, cwd=wc)
    git("push", "-q", "origin", "main", cwd=wc)
    return git("rev-parse", "HEAD", cwd=wc)


def test_revert_opens_a_new_pull_request_that_undoes_a_merged_one(world, monkeypatch):
    res = make_pr(world, monkeypatch)
    sha = simulate_squash_merge(world, res["branch"])
    pr = world.gh.pulls[res["pr_number"]]
    pr.update(merged=True, state="closed", merge_commit_sha=sha)

    out = web_pr.revert_web_pr(res["pr_number"])

    assert out["ok"] and out["pr_number"] == 6 and out["branch"].startswith("web-edit/revert-5-")
    assert "hello" in git("show", f"{out['branch']}:src/components/hero.tsx", cwd=world.origin)   # original text is back
    assert "welcome" in git("show", "main:src/components/hero.tsx", cwd=world.origin)           # main itself unchanged
    new = world.gh.pulls[6]
    assert new["title"].startswith("Revert:") and web_pr.PR_MARKER in new["body"] and new["base"]["ref"] == "main"


def test_revert_of_an_unmerged_pull_request_is_refused(world, monkeypatch):
    res = make_pr(world, monkeypatch)
    with pytest.raises(web_pr.WebPrError, match="not merged"):
        web_pr.revert_web_pr(res["pr_number"])


def test_revert_reports_conflicts_and_pushes_nothing(world, monkeypatch):
    res = make_pr(world, monkeypatch)
    sha = simulate_squash_merge(world, res["branch"])
    world.gh.pulls[res["pr_number"]].update(merged=True, state="closed", merge_commit_sha=sha)
    # a later change on main rewrites the same line
    wc = world.tmp / "later"
    git("clone", "-q", world.origin, str(wc))
    (wc / "src/components/hero.tsx").write_text("export const Hero = () => 'completely different';\nline2\nline3\n")
    git("commit", "-qam", "later", cwd=wc)
    git("push", "-q", "origin", "main", cwd=wc)
    branches_before = origin_branches(world)

    with pytest.raises(web_pr.WebPrError, match="Could not revert"):
        web_pr.revert_web_pr(res["pr_number"])
    assert origin_branches(world) == branches_before and 6 not in world.gh.pulls


# =========================================================================== GitHub client

def test_github_client_maps_errors_and_hides_the_token(world):
    client = github_api.GitHubClient()
    with pytest.raises(github_api.GitHubError) as info:
        client.get_pull(12345)
    assert info.value.status == 404 and TOKEN not in info.value.message
    bad = github_api.GitHubClient(token="wrong-token")
    with pytest.raises(github_api.GitHubError) as info:
        bad.get_pull(1)
    assert info.value.status == 401 and "wrong-token" not in info.value.message


def test_github_client_reports_an_unreachable_server_without_crashing():
    client = github_api.GitHubClient(token=TOKEN, repo="o/r", api_url="http://127.0.0.1:1")
    with pytest.raises(github_api.GitHubError) as info:
        client.get_pull(1)
    assert info.value.status == 0 and "Could not reach GitHub" in info.value.message


def test_deleting_a_missing_branch_is_not_an_error(world):
    github_api.GitHubClient().delete_branch("web-edit/never-existed")  # fake returns 204; real GitHub 422 is tolerated too
    world.gh.fail_next = (422, "Reference does not exist")
    github_api.GitHubClient().delete_branch("web-edit/gone")


# =========================================================================== deploy modes

def test_manual_deploy_is_the_default_and_runs_nothing(monkeypatch):
    monkeypatch.delenv("OPENCLAW_DEPLOY_MODE", raising=False)
    monkeypatch.setattr(deploy, "_run", lambda *a, **k: pytest.fail("manual mode must not run commands"))
    assert deploy.deploy_mode() == "manual"
    assert "NOT updated automatically" in deploy.deploy_after_merge()


def test_unknown_deploy_mode_falls_back_to_manual(monkeypatch):
    monkeypatch.setenv("OPENCLAW_DEPLOY_MODE", "yolo")
    assert deploy.deploy_mode() == "manual"


def test_webhook_deploy_posts_to_the_hook(monkeypatch):
    gh = FakeGitHub()
    url = gh.start()
    try:
        monkeypatch.setenv("OPENCLAW_DEPLOY_MODE", "webhook")
        monkeypatch.setenv("DEPLOY_WEBHOOK_URL", url + "/hook")
        # the fake answers 401/404 -> reported, not raised
        assert "webhook" in deploy.deploy_after_merge().lower()
        assert gh.requests and gh.requests[0][0] == "POST"
    finally:
        gh.stop()


def test_webhook_mode_with_an_invalid_url_is_reported(monkeypatch):
    monkeypatch.setenv("OPENCLAW_DEPLOY_MODE", "webhook")
    monkeypatch.setenv("DEPLOY_WEBHOOK_URL", "not a url")
    assert "not a valid URL" in deploy.deploy_after_merge()


def test_docker_mode_needs_the_socket(monkeypatch):
    monkeypatch.setenv("OPENCLAW_DEPLOY_MODE", "docker")
    monkeypatch.setattr(deploy.os.path, "exists", lambda p: False)
    assert "Docker socket is not available" in deploy.deploy_after_merge()


def test_docker_mode_pulls_then_rebuilds_and_stops_on_failure(monkeypatch):
    monkeypatch.setenv("OPENCLAW_DEPLOY_MODE", "docker")
    monkeypatch.setattr(deploy.os.path, "exists", lambda p: True)
    calls = []

    def fake_run(cmd, cwd, timeout):
        calls.append(cmd[:2])
        return subprocess.CompletedProcess(cmd, 0, "", "")

    monkeypatch.setattr(deploy, "_run", fake_run)
    assert "rebuilt" in deploy.deploy_after_merge() and calls == [["git", "pull"], ["docker", "compose"]]

    calls.clear()
    monkeypatch.setattr(deploy, "_run", lambda cmd, cwd, timeout: (calls.append(cmd[:2]) or subprocess.CompletedProcess(cmd, 1, "", "boom")))
    out = deploy.deploy_after_merge()
    assert "git pull failed" in out and calls == [["git", "pull"]]    # no rebuild after a failed pull


def test_node_modules_is_a_real_directory_not_a_symlink(tmp_path, monkeypatch):
    """Turbopack refuses a node_modules symlink that points outside the project root (found in a real run)."""
    monkeypatch.setenv("OPENCLAW_WORK_DIR", str(tmp_path / "work"))
    monkeypatch.setenv("OPENCLAW_WEB_INSTALL", "on")
    root = tmp_path / "clone"
    root.mkdir()
    (root / "package.json").write_text("{}")
    (root / "package-lock.json").write_text('{"lockfileVersion": 3}')
    import hashlib

    digest = hashlib.sha256((root / "package-lock.json").read_bytes()).hexdigest()[:16]
    cached = tmp_path / "work" / ".node-cache" / digest / "node_modules" / "pkg"
    cached.mkdir(parents=True)
    (cached / "index.js").write_text("module.exports = 1")  # pretend `npm ci` already ran: no network needed

    assert web_pr.ensure_dependencies(str(root)) is True
    target = root / "node_modules"
    assert target.is_dir() and not target.is_symlink()
    assert (target / "pkg" / "index.js").read_text() == "module.exports = 1"

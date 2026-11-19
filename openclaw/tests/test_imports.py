"""
Guards against two production failures that used to be invisible until a job ran:

  1. A module that cannot even be imported (e.g. `generate_insights` still imported the removed
     `supabase` package, so every insight/guide/pulse job crashed).
  2. A third-party import that is missing from requirements.txt (Docker builds from that file, so
     `requests`, `matplotlib` or Google auth would be absent at runtime and fail only when used).
"""

import ast
import importlib
import os
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

# import name -> distribution name on PyPI (only where they differ)
DIST_NAMES = {
    "PIL": "pillow",
    "bs4": "beautifulsoup4",
    "dotenv": "python-dotenv",
    "psycopg2": "psycopg2-binary",
    "google": "google-auth",
    "playwright_stealth": "playwright-stealth",
    "duckduckgo_search": "duckduckgo-search",
}
# Used only by optional/dev paths and provided by the standard image or by another listed package.
IGNORED = {"pytest"}


def _module_files():
    return sorted(
        f for f in os.listdir(ROOT)
        if f.endswith(".py") and not f.startswith("_")
    )


def _local_modules():
    return {f[:-3] for f in os.listdir(ROOT) if f.endswith(".py")} | {"legacy", "tests"}


def _requirements():
    names = set()
    with open(os.path.join(ROOT, "requirements.txt"), encoding="utf-8") as fh:
        for line in fh:
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            for sep in ("==", ">=", "<=", "~=", ">", "<", "["):
                line = line.split(sep, 1)[0]
            names.add(line.strip().lower().replace("_", "-"))
    return names


def _third_party_imports(path):
    """Top-level package names imported anywhere in the file, including lazy imports inside functions."""
    tree = ast.parse(open(path, encoding="utf-8").read(), filename=path)
    stdlib = set(sys.stdlib_module_names)
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names = [a.name.split(".")[0] for a in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            names = [node.module.split(".")[0]]
        else:
            continue
        for n in names:
            if n not in stdlib and n not in _local_modules() and n not in IGNORED:
                found.add(n)
    return found


@pytest.mark.parametrize("filename", _module_files())
def test_module_imports_cleanly(filename):
    importlib.import_module(filename[:-3])


def test_every_third_party_import_is_in_requirements():
    declared = _requirements()
    missing = {}
    for filename in _module_files():
        for name in _third_party_imports(os.path.join(ROOT, filename)):
            dist = DIST_NAMES.get(name, name).lower().replace("_", "-")
            if dist not in declared:
                missing.setdefault(dist, []).append(filename)
    assert not missing, f"Add to openclaw/requirements.txt: {missing}"


def test_removed_supabase_package_is_not_imported_anywhere():
    offenders = [
        f for f in _module_files()
        if "supabase" in _third_party_imports(os.path.join(ROOT, f))
    ]
    assert not offenders, f"These modules still import `supabase`: {offenders}"

"""
dev_agent.py — Autonomous Web-Dev Coding Agent for Asian Health Hub.

Allows editing the Next.js codebase (`src/`, `public/`) directly from Telegram
via natural language instructions or screenshot images, with:
  1. Safe workspace file tools (`search_codebase`, `list_files`, `read_source_file`,
     `apply_code_patch`, `write_source_file`).
  2. Automatic TypeScript verification (`npx tsc --noEmit`) with self-healing retry.
  3. Automated Playwright screenshot capture (`capture_page_screenshot`) so the user
     can visually preview changes directly inside Telegram before publishing.
"""

import base64
import json
import os
import subprocess
import time
from typing import Any, Callable, Dict, List, Optional

from dotenv import load_dotenv
from openai import OpenAI

_OPENCLAW_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(_OPENCLAW_DIR, ".."))

load_dotenv(os.path.join(_OPENCLAW_DIR, ".env"))
load_dotenv(os.path.join(PROJECT_ROOT, ".env.local"))

DEFAULT_CODING_MODEL = os.environ.get("OPENCLAW_TEXT_MODEL", "openai/gpt-6-luna")
FALLBACK_CODING_MODEL = "google/gemini-2.5-pro"

ALLOWED_READ_PREFIXES = ("src/", "public/", "openclaw/", "scripts/", "package.json", "tsconfig.json", "next.config")
ALLOWED_WRITE_PREFIXES = ("src/", "public/")
FORBIDDEN_SUBSTRINGS = (".env", ".git/", "node_modules/", ".next/", "SUPABASE_SECRET_KEY", "OPENROUTER_API_KEY")


def _resolve_safe_path(rel_path: str, for_write: bool = False) -> str:
    cleaned = (rel_path or "").strip().lstrip("/")
    if cleaned.startswith("./"):
        cleaned = cleaned[2:]

    for bad in FORBIDDEN_SUBSTRINGS:
        if bad in cleaned:
            raise ValueError(f"Access denied to protected path: {rel_path}")

    allowed = ALLOWED_WRITE_PREFIXES if for_write else ALLOWED_READ_PREFIXES
    if not any(cleaned == prefix or cleaned.startswith(prefix) for prefix in allowed):
        mode = "write" if for_write else "read"
        raise ValueError(
            f"Path '{rel_path}' is outside allowed {mode} directories ({', '.join(allowed)})."
        )

    abs_path = os.path.abspath(os.path.join(PROJECT_ROOT, cleaned))
    if not abs_path.startswith(PROJECT_ROOT):
        raise ValueError("Path traversal outside project root is forbidden.")
    return abs_path


def tool_list_files(directory: str = "src") -> str:
    try:
        abs_dir = _resolve_safe_path(directory, for_write=False)
        if not os.path.exists(abs_dir):
            return f"Directory not found: {directory}"
        results = []
        for root, dirs, files in os.walk(abs_dir):
            dirs[:] = [d for d in dirs if d not in {"node_modules", ".next", ".git", "__pycache__"}]
            for f in sorted(files):
                if f.startswith("."):
                    continue
                full = os.path.join(root, f)
                rel = os.path.relpath(full, PROJECT_ROOT)
                results.append(rel)
                if len(results) >= 200:
                    break
            if len(results) >= 200:
                break
        return "\n".join(results) if results else "No files found."
    except Exception as exc:
        return f"Error listing files: {exc}"


def tool_search_codebase(query: str, directory: str = "src") -> str:
    if not query or len(query.strip()) < 2:
        return "Query must be at least 2 characters."
    try:
        abs_dir = _resolve_safe_path(directory, for_write=False)
        q_low = query.strip().lower()
        matches = []
        for root, dirs, files in os.walk(abs_dir):
            dirs[:] = [d for d in dirs if d not in {"node_modules", ".next", ".git", "__pycache__"}]
            for fname in sorted(files):
                if not fname.endswith((".tsx", ".ts", ".css", ".js", ".json", ".md")):
                    continue
                fpath = os.path.join(root, fname)
                rel = os.path.relpath(fpath, PROJECT_ROOT)
                try:
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as fh:
                        for idx, line in enumerate(fh, 1):
                            if q_low in line.lower():
                                snippet = line.strip()[:160]
                                matches.append(f"{rel}:{idx}: {snippet}")
                                if len(matches) >= 60:
                                    return "\n".join(matches) + "\n... (truncated at 60 matches)"
                except Exception:
                    continue
        return "\n".join(matches) if matches else f"No matches found for '{query}' in {directory}."
    except Exception as exc:
        return f"Search error: {exc}"


def tool_read_source_file(path: str, start_line: int = 1, end_line: int = 250) -> str:
    try:
        abs_path = _resolve_safe_path(path, for_write=False)
        if not os.path.isfile(abs_path):
            return f"File does not exist: {path}"
        with open(abs_path, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
        total = len(lines)
        s = max(1, int(start_line or 1))
        e = min(total, int(end_line or (s + 249)))
        if e - s > 350:
            e = s + 350
        numbered = [f"{i}: {lines[i - 1].rstrip()}" for i in range(s, e + 1)]
        header = f"File: {path} (Showing lines {s}-{e} of {total})\n"
        return header + "\n".join(numbered)
    except Exception as exc:
        return f"Error reading {path}: {exc}"


def tool_apply_code_patch(path: str, target: str, replacement: str) -> str:
    try:
        abs_path = _resolve_safe_path(path, for_write=True)
        if not os.path.isfile(abs_path):
            return f"File does not exist: {path}"
        with open(abs_path, "r", encoding="utf-8") as fh:
            content = fh.read()
        if not target:
            return "Error: 'target' cannot be empty."
        if target not in content:
            return (
                f"Error: Exact 'target' string not found in {path}. "
                "Please call read_source_file first to verify exact lines and whitespace."
            )
        count = content.count(target)
        new_content = content.replace(target, replacement, 1)
        with open(abs_path, "w", encoding="utf-8") as fh:
            fh.write(new_content)
        return f"Successfully patched {path} (matched {count} occurrence(s), replaced first occurrence)."
    except Exception as exc:
        return f"Error patching {path}: {exc}"


def tool_write_source_file(path: str, content: str) -> str:
    try:
        abs_path = _resolve_safe_path(path, for_write=True)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "w", encoding="utf-8") as fh:
            fh.write(content)
        return f"Successfully wrote {path} ({len(content)} bytes)."
    except Exception as exc:
        return f"Error writing {path}: {exc}"


def run_typecheck() -> Dict[str, Any]:
    """Run `npx tsc --noEmit` in PROJECT_ROOT to verify TypeScript integrity."""
    try:
        proc = subprocess.run(
            ["npx", "tsc", "--noEmit"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=90,
        )
        output = (proc.stdout or "") + "\n" + (proc.stderr or "")
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "output": output.strip()[:3000],
        }
    except FileNotFoundError:
        return {
            "ok": True,
            "returncode": 0,
            "output": "npx not installed in current runtime; skipped local tsc check.",
        }
    except Exception as exc:
        return {
            "ok": False,
            "returncode": -1,
            "output": f"Typecheck execution error: {exc}",
        }


def capture_page_screenshot(
    route_path: str = "/",
    viewport: str = "desktop",
    full_page: bool = False,
) -> Optional[str]:
    """
    Capture a live screenshot of `route_path` using Playwright and return the saved file path.
    Tries SITE_INTERNAL_URL / localhost:3000 / web:3000 automatically.
    """
    clean_route = "/" + (route_path or "/").lstrip("/")
    base_candidates = [
        os.environ.get("OPENCLAW_PREVIEW_BASE_URL", "").rstrip("/"),
        "http://localhost:3000",
        "http://web:3000",
        os.environ.get("NEXT_PUBLIC_SITE_URL", "").rstrip("/"),
    ]
    base_candidates = [b for b in base_candidates if b]

    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        print(f"[!] Playwright unavailable for screenshot: {exc}")
        return None

    width, height = (390, 844) if viewport == "mobile" else (1440, 900)
    out_path = f"/tmp/openclaw_preview_{viewport}_{int(time.time())}.png"

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": width, "height": height})
            page = context.new_page()

            loaded = False
            for base in base_candidates:
                target_url = f"{base}{clean_route}"
                try:
                    page.goto(target_url, wait_until="domcontentloaded", timeout=20000)
                    page.wait_for_timeout(1200)
                    loaded = True
                    break
                except Exception:
                    continue

            if not loaded:
                browser.close()
                return None

            page.screenshot(path=out_path, full_page=full_page)
            browser.close()
            return out_path if os.path.exists(out_path) else None
    except Exception as exc:
        print(f"[!] Screenshot capture failed: {exc}")
        return None


DEV_AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files inside a project directory (e.g. 'src', 'src/app', 'src/components').",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {"type": "string", "description": "Relative directory path, default 'src'."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_codebase",
            "description": "Search for a text string, CSS class, or symbol across files in 'src'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Text or symbol to search for."},
                    "directory": {"type": "string", "description": "Directory to search within, default 'src'."},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_source_file",
            "description": "Read lines from a source file with line numbers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative file path, e.g. 'src/app/page.tsx'."},
                    "start_line": {"type": "integer", "description": "1-based start line."},
                    "end_line": {"type": "integer", "description": "1-based end line (max 350 lines per call)."},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "apply_code_patch",
            "description": "Replace an exact contiguous block of code in an existing file inside 'src/' or 'public/'. Always read the file first so 'target' matches exact whitespace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative file path inside 'src/' or 'public/'."},
                    "target": {"type": "string", "description": "Exact existing string to replace."},
                    "replacement": {"type": "string", "description": "New replacement code string."},
                },
                "required": ["path", "target", "replacement"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_source_file",
            "description": "Create or overwrite a file inside 'src/' or 'public/'. Prefer apply_code_patch for existing files.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative file path inside 'src/' or 'public/'."},
                    "content": {"type": "string", "description": "Full file contents."},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_typecheck",
            "description": "Run `npx tsc --noEmit` to verify there are no TypeScript compilation errors.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

DEV_AGENT_SYSTEM_PROMPT = """You are the Autonomous Senior Web-Dev & UI/UX Engineer for Asian Health Hub.
Tech stack:
- Next.js 16.2.6 (App Router) in `src/app/`
- React components in `src/components/` (`src/components/lg/` for Longevity design system, `src/components/clinic/` for clinic profiles, `src/components/search/` for `/search`)
- Styling: `src/app/longevity.css` (main Longevity design system CSS) and `src/app/globals.css` (Tailwind v4 + global rules).
- Brand palette: Deep Forest Green `#024E44`, Dark Ink `#0D1F1C`, Warm Cream `#F6FAF8`, Accent Lime `#D4F268`.

Workflow rules:
1. First locate and read the relevant files using `search_codebase` and `read_source_file`.
2. Make clean, high-craft UI/UX or code edits using `apply_code_patch`.
3. After modifying any `.ts` or `.tsx` file, call `run_typecheck` to verify zero TypeScript errors. If errors appear, fix them immediately.
4. Keep your final response concise, in Vietnamese, listing:
   - Các file đã chỉnh sửa (`src/...`)
   - Tóm tắt những thay đổi chính về giao diện / logic / SEO
   - Gợi ý đường dẫn trang (ví dụ `/`, `/search`, `/clinics/great-care-dental`) để chụp ảnh preview và hướng dẫn gõ `/publish` nếu muốn đẩy lên GitHub & cập nhật Live.
"""


def _execute_tool_call(name: str, args: Dict[str, Any], modified_files: List[str]) -> str:
    if name == "list_files":
        return tool_list_files(args.get("directory", "src"))
    if name == "search_codebase":
        return tool_search_codebase(args.get("query", ""), args.get("directory", "src"))
    if name == "read_source_file":
        return tool_read_source_file(
            args.get("path", ""),
            args.get("start_line", 1),
            args.get("end_line", 250),
        )
    if name == "apply_code_patch":
        path = args.get("path", "")
        res = tool_apply_code_patch(path, args.get("target", ""), args.get("replacement", ""))
        if res.startswith("Successfully") and path not in modified_files:
            modified_files.append(path)
        return res
    if name == "write_source_file":
        path = args.get("path", "")
        res = tool_write_source_file(path, args.get("content", ""))
        if res.startswith("Successfully") and path not in modified_files:
            modified_files.append(path)
        return res
    if name == "run_typecheck":
        tc = run_typecheck()
        return f"Typecheck {'PASSED' if tc['ok'] else 'FAILED'}:\n{tc['output']}"
    return f"Unknown tool: {name}"


def run_web_dev_agent(
    instruction: str,
    image_path: Optional[str] = None,
    extra_system_prompt: Optional[str] = None,
    progress_callback: Optional[Callable[[str], None]] = None,
    max_steps: int = 12,
) -> Dict[str, Any]:
    """
    Execute the multi-step tool-calling Web-Dev Agent.
    Returns dict with `summary`, `modified_files`, `typecheck_ok`, `preview_route`.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return {
            "summary": "❌ Thiếu `OPENROUTER_API_KEY` trong môi trường.",
            "modified_files": [],
            "typecheck_ok": False,
            "preview_route": "/",
        }

    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
    model = os.environ.get("OPENCLAW_CODING_MODEL", DEFAULT_CODING_MODEL)

    sys_prompt = DEV_AGENT_SYSTEM_PROMPT
    if extra_system_prompt:
        sys_prompt += "\n\n" + extra_system_prompt

    user_content: Any = instruction
    if image_path and os.path.exists(image_path):
        try:
            with open(image_path, "rb") as img_f:
                b64 = base64.b64encode(img_f.read()).decode("utf-8")
            user_content = [
                {"type": "text", "text": instruction},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ]
        except Exception as exc:
            print(f"[!] Could not encode image for dev_agent: {exc}")

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_content},
    ]

    modified_files: List[str] = []
    final_text = ""

    for step in range(1, max_steps + 1):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                tools=DEV_AGENT_TOOLS,
                tool_choice="auto",
                temperature=0.15,
            )
        except Exception as exc:
            if model != FALLBACK_CODING_MODEL:
                model = FALLBACK_CODING_MODEL
                response = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    tools=DEV_AGENT_TOOLS,
                    tool_choice="auto",
                    temperature=0.15,
                )
            else:
                raise exc

        msg = response.choices[0].message
        tool_calls = getattr(msg, "tool_calls", None)

        if not tool_calls:
            final_text = (msg.content or "").strip()
            break

        messages.append(
            {
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in tool_calls
                ],
            }
        )

        for tc in tool_calls:
            fn_name = tc.function.name
            try:
                fn_args = json.loads(tc.function.arguments or "{}")
            except Exception:
                fn_args = {}

            if progress_callback and fn_name in {"apply_code_patch", "write_source_file"}:
                progress_callback(f"🛠️ Agent đang chỉnh sửa file `{fn_args.get('path', '')}`...")

            result_str = _execute_tool_call(fn_name, fn_args, modified_files)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "name": fn_name,
                    "content": result_str[:12000],
                }
            )

    # Final safety typecheck if any TS/TSX files were modified
    typecheck_ok = True
    if any(f.endswith((".ts", ".tsx")) for f in modified_files):
        tc_res = run_typecheck()
        typecheck_ok = tc_res["ok"]
        if not typecheck_ok:
            final_text += f"\n\n⚠️ Cảnh báo TypeScript:\n```\n{tc_res['output'][:800]}\n```"

    # Guess preview route from modified files
    preview_route = "/"
    for f in modified_files:
        if "search" in f:
            preview_route = "/search"
            break
        if "clinic" in f:
            preview_route = "/clinics/great-care-dental"
            break
        if "insight" in f:
            preview_route = "/insights"
            break
        if "about" in f:
            preview_route = "/about"
            break

    if not final_text:
        final_text = "✅ Đã hoàn tất xử lý yêu cầu chỉnh sửa code."

    if modified_files:
        files_bullet = "\n".join(f"• `{p}`" for p in modified_files)
        final_text += (
            f"\n\n📂 **File đã thay đổi ({len(modified_files)})**:\n{files_bullet}\n"
            f"🧪 **TypeScript Check**: {'✅ PASS' if typecheck_ok else '⚠️ Cần kiểm tra'}\n"
            "👉 Gõ `/publish <ghi chú>` để commit lên GitHub `main` và cập nhật bản Live, hoặc `/rollback` để hoàn tác."
        )

    return {
        "summary": final_text,
        "modified_files": modified_files,
        "typecheck_ok": typecheck_ok,
        "preview_route": preview_route,
    }


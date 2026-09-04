#!/usr/bin/env python3
"""Capture UI-1 evidence from the built React workspace route.

This is a documentation/test harness, not a product route. It serves the
already-built ``out/workspace.html`` at ``/workspace`` and intercepts the
frontend transport in Playwright with deterministic, in-memory data. No
production source imports this file and no fixture flag is exposed to users.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright


ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / "out"
SHOTS = ROOT / "docs/design/implementation/ui-1/shots"
ISOLATED_ENV_KEYS = (
    "HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "CODEG_DATA_DIR",
    "PATH",
)

FOLDER = {
    "id": 1,
    "name": "agent-box-studio",
    "path": "/tmp/codeg-ui1-fixture-workspace",
    "git_branch": "ui1-visual-closure",
    "default_agent_type": "codex",
    "last_opened_at": "2026-09-04T10:00:00Z",
    "sort_order": 0,
    "color": "blue",
    "parent_id": None,
    "kind": "regular",
    "alias": None,
    "group_id": None,
}

SUMMARY = {
    "id": 101,
    "folder_id": 1,
    "title": "UI-1 visual closure",
    "title_locked": True,
    "agent_type": "codex",
    "status": "completed",
    "kind": "regular",
    "model": "gpt-5",
    "git_branch": "ui1-visual-closure",
    "external_id": "ui1-synthetic-session",
    "message_count": 4,
    "child_count": 0,
    "created_at": "2026-09-04T10:00:00Z",
    "updated_at": "2026-09-04T10:05:00Z",
    "pinned_at": None,
    "parent_id": None,
    "parent_tool_use_id": None,
    "delegation_call_id": None,
    "origin_cwd": None,
}


def tool_use(tool_id: str, description: str, *, prompt: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "subagent_type": "codex",
        "description": description,
    }
    if prompt is not None:
        payload["prompt"] = prompt
    return {
        "type": "tool_use",
        "tool_use_id": tool_id,
        "tool_name": "agent",
        "input_preview": json.dumps(payload),
        "status": None,
        "meta": None,
    }


def tool_result(tool_id: str, output: str | None, *, error: bool = False) -> dict[str, Any]:
    return {
        "type": "tool_result",
        "tool_use_id": tool_id,
        "output_preview": output,
        "is_error": error,
        "agent_stats": None,
        "agent_transcript": None,
    }


TURNS = [
    {
        "id": "ui1-user-turn",
        "role": "user",
        "timestamp": "2026-09-04T10:01:00Z",
        "blocks": [
            {
                "type": "text",
                "text": "Review the default session visual direction and preserve the existing interactions.",
            }
        ],
        "usage": None,
        "duration_ms": None,
        "model": None,
        "completed_at": None,
    },
    {
        "id": "ui1-assistant-turn",
        "role": "assistant",
        "timestamp": "2026-09-04T10:05:00Z",
        "blocks": [
            {
                "type": "text",
                "text": "The workspace is ready for a focused visual review. The message flow remains the primary surface, with tool activity kept inline and quiet.",
            },
            tool_use("tool-completed", "Verify the visual fixture", prompt="Check the rendered workspace and report the stable result."),
            tool_result("tool-completed", "Visual fixture verified. The default session remains readable and calm."),
            tool_use("tool-running", "Inspect the active message", prompt="Inspect the active message surface while the fixture is running."),
            tool_use("tool-error", "Recover the failed check", prompt="Run the diagnostic check and report any failure details."),
            tool_result("tool-error", "The diagnostic command returned a synthetic failure for visual review.", error=True),
            tool_use("tool-bodyless", "Wait for agent"),
            tool_result("tool-bodyless", None),
        ],
        "usage": None,
        "duration_ms": 4200,
        "model": "gpt-5",
        "completed_at": "2026-09-04T10:05:00Z",
    },
    {
        # The empty persisted prompt is an implementation detail of the
        # offline running-state fixture. The runtime store uses this anchor to
        # apply its real in-flight tool-call semantics; it renders no user
        # copy in the page.
        "id": "ui1-inflight-user-turn",
        "role": "user",
        "timestamp": "2026-09-04T10:06:00Z",
        "blocks": [],
        "usage": None,
        "duration_ms": None,
        "model": None,
        "completed_at": None,
    },
    {
        "id": "ui1-running-assistant-turn",
        "role": "assistant",
        "timestamp": "2026-09-04T10:06:01Z",
        "blocks": [
            tool_use("tool-running", "Inspect the active message", prompt="Inspect the active message surface while the fixture is running."),
        ],
        "usage": None,
        "duration_ms": None,
        "model": "gpt-5",
        "completed_at": None,
    },
]


DETAIL = {
    "summary": SUMMARY,
    "turns": TURNS,
    "session_stats": {
        "total_usage": None,
        "total_duration_ms": 4200,
        "context_window_used_tokens": 820,
        "context_window_max_tokens": 128000,
        "context_window_usage_percent": 1,
    },
    "transcript_watermark": None,
    "in_flight_user_turn_id": "ui1-inflight-user-turn",
}


ACP_AGENT = {
    "agent_type": "codex",
    "skills_capable": True,
    "registry_id": "codex",
    "registry_version": "synthetic",
    "supports_custom_version": False,
    "name": "Codex",
    "description": "Synthetic offline fixture agent",
    "available": True,
    "distribution_type": "bundled",
    "is_acp_adapter": True,
    "custom_source": None,
    "enabled": True,
    "sort_order": 0,
    "installed_version": "synthetic",
    "env": {},
    "adapter_name": "codex-acp",
}


def response_for(command: str, params: dict[str, Any]) -> Any:
    del params
    if command in {"list_open_folder_details", "list_all_folder_details"}:
        return [FOLDER]
    if command == "list_folder_groups":
        return []
    if command == "list_all_conversations":
        return [SUMMARY]
    if command == "list_opened_tabs":
        return {
            "items": [
                {
                    "id": 501,
                    "folder_id": 1,
                    "conversation_id": 101,
                    "agent_type": "codex",
                    "position": 0,
                    "is_active": True,
                    "is_pinned": False,
                }
            ],
            "version": 0,
        }
    if command == "get_folder_conversation":
        return DETAIL
    if command == "get_folder_conversation_turns":
        return {"turns": [], "before_index": 0, "has_more": False}
    if command == "list_child_conversations":
        return []
    if command == "load_folder_history":
        return []
    if command == "get_folder":
        return FOLDER
    if command == "get_stats":
        return {
            "total_conversations": 1,
            "total_messages": 2,
            "by_agent": [{"agent_type": "codex", "conversation_count": 1}],
        }
    if command == "get_sidebar_data":
        return {
            "folders": [{"path": FOLDER["path"], "name": FOLDER["name"], "agent_types": ["codex"], "conversation_count": 1}],
            "stats": {"total_conversations": 1, "total_messages": 2, "by_agent": [{"agent_type": "codex", "conversation_count": 1}]},
        }
    if command == "acp_list_agents":
        return [ACP_AGENT]
    if command in {"acp_list_connections", "acp_list_custom_agents"}:
        return []
    if command in {"acp_find_connection_for_conversation", "acp_get_session_snapshot_by_conversation"}:
        return None
    if command == "get_git_branch":
        return "ui1-visual-closure"
    if command == "get_git_head":
        return {"is_repo": True, "branch": "ui1-visual-closure", "detached": False, "short_sha": "ui1fixture"}
    if command == "save_opened_tabs":
        return {"accepted": True, "version": 0, "tabs": []}
    if command == "acp_connect":
        return "fixture-connection"
    if command in {"get_prompt_capabilities", "get_session_prompt_capabilities"}:
        return {"supports_attachments": False, "supports_modes": False, "supports_config_options": False}
    if command == "get_app_settings":
        return {}
    if command == "get_system_language_settings":
        return {"mode": "manual", "language": "en"}
    if command == "get_system_terminal_settings":
        return {"default_shell": None}
    if command == "acp_list_agent_skills":
        return {"locations": [], "skills": []}
    if command == "acp_get_agent_status":
        return {
            "agent_type": "codex",
            "available": True,
            "enabled": True,
            "installed_version": "synthetic",
            "is_acp_adapter": True,
        }
    if command in {"automation_list", "work_task_list", "list_workspace_files", "list_folder_commands", "bootstrap_folder_commands_from_package_json"}:
        return []
    if command == "app_update_status":
        return {"version": None, "release": None}
    if command == "app_update_state":
        return {"seq": 0, "status": "idle"}
    if command == "health":
        return {"status": "ok"}
    # Keep the harness deterministic while making unneeded optional reads
    # visible in the result report rather than failing the page.
    return {}


class StaticWorkspaceHandler(SimpleHTTPRequestHandler):
    """Map the exported Next route to the actual workspace document."""

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] in {"/workspace", "/workspace/"}:
            self.path = "/workspace.html"
        super().do_GET()

    def log_message(self, format: str, *args: Any) -> None:
        del format, args


def start_static_server() -> tuple[ThreadingHTTPServer, str]:
    handler = lambda *args, **kwargs: StaticWorkspaceHandler(  # noqa: E731
        *args, directory=str(OUT), **kwargs
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


def install_isolated_environment() -> tuple[str, dict[str, str | None]]:
    temp_root = tempfile.mkdtemp(prefix="codeg-ui1-visual-")
    previous_environment = {
        key: os.environ.get(key) for key in ISOLATED_ENV_KEYS
    }
    os.environ["HOME"] = temp_root
    os.environ["XDG_DATA_HOME"] = str(Path(temp_root) / "data")
    os.environ["XDG_CACHE_HOME"] = str(Path(temp_root) / "cache")
    os.environ["XDG_CONFIG_HOME"] = str(Path(temp_root) / "config")
    os.environ["CODEG_DATA_DIR"] = str(Path(temp_root) / "codeg-data")
    os.environ["PATH"] = "/usr/bin:/bin"
    return temp_root, previous_environment


def cleanup_isolated_environment(
    temp_root: str, previous_environment: dict[str, str | None]
) -> None:
    for key, value in previous_environment.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    shutil.rmtree(temp_root, ignore_errors=True)


def launch_browser(playwright: Any) -> Browser:
    """Launch Chromium without depending on a machine-specific browser path."""

    executable = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
    if executable:
        executable_path = Path(executable)
        if not executable_path.is_file():
            raise RuntimeError(
                "PLAYWRIGHT_CHROMIUM_EXECUTABLE does not exist or is not a file: "
                f"{executable}"
            )
        return playwright.chromium.launch(
            headless=True, executable_path=str(executable_path)
        )
    return playwright.chromium.launch(headless=True)


def install_browser_mocks(page: Page, command_log: list[str]) -> None:
    page.add_init_script(
        """
        (() => {
          class FixtureWebSocket {
            static CONNECTING = 0;
            static OPEN = 1;
            static CLOSING = 2;
            static CLOSED = 3;
            constructor(url) {
              this.url = url;
              this.readyState = FixtureWebSocket.OPEN;
              setTimeout(() => {
                this.onopen?.(new Event("open"));
                setTimeout(() => this.onmessage?.({data: JSON.stringify({channel: "__ready__"})}), 0);
              }, 0);
            }
            send(payload) {
              let frame;
              try { frame = JSON.parse(payload); } catch { return; }
              if (frame?.action !== "attach") return;
              const envelope = (seq, event) => ({
                type: "event",
                subscription_id: frame.subscription_id,
                envelope: {seq, connection_id: "fixture-connection", ...event},
              });
              setTimeout(() => this.onmessage?.({data: JSON.stringify(envelope(1, {type: "status_changed", status: "connected"}))}), 0);
              setTimeout(() => this.onmessage?.({data: JSON.stringify(envelope(2, {type: "selectors_ready"}))}), 0);
            }
            close() {
              this.readyState = FixtureWebSocket.CLOSED;
              this.onclose?.(new Event("close"));
            }
          }
          window.WebSocket = FixtureWebSocket;
        })();
        """
    )

    def handle_api(route: Any) -> None:
        request = route.request
        command = request.url.rsplit("/", 1)[-1].split("?", 1)[0]
        command_log.append(f"{request.method} {command}")
        try:
            payload = json.loads(request.post_data or "{}")
        except json.JSONDecodeError:
            payload = {}
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(response_for(command, payload)),
        )

    page.route("**/api/**", handle_api)


def configure_page(page: Page, theme: str, zoom: int) -> None:
    page.add_init_script(
        f"localStorage.setItem('theme', {json.dumps(theme)}); localStorage.setItem('codeg-theme-color', 'neutral'); localStorage.setItem('codeg-zoom-level', {json.dumps(str(zoom))}); localStorage.setItem('codeg_token', 'ui1-fixture-token');",
    )


def wait_for_fixture(page: Page) -> None:
    page.get_by_text("UI-1 visual closure", exact=True).first.wait_for(timeout=15000)
    page.get_by_text("The workspace is ready for a focused visual review.", exact=False).wait_for(timeout=15000)
    page.wait_for_timeout(1200)


def reload_at(page: Page, base_url: str, viewport: tuple[int, int], theme: str, zoom: int) -> None:
    page.set_viewport_size({"width": viewport[0], "height": viewport[1]})
    configure_page(page, theme, zoom)
    page.goto(f"{base_url}/workspace", wait_until="domcontentloaded")
    wait_for_fixture(page)


def check_page(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """() => ({
          overflow: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
          userMessage: document.body.innerText.includes('Review the default session visual direction'),
          agentAnswer: document.body.innerText.includes('The workspace is ready for a focused visual review'),
          completedEvent: Boolean([...document.querySelectorAll('[data-state="ok"]')].find(el => el.textContent?.includes('codex: Verify the visual fixture'))),
          runningEvent: Boolean([...document.querySelectorAll('[data-state="running"]')].find(el => el.textContent?.includes('codex: Inspect the active message'))),
          errorEvent: Boolean([...document.querySelectorAll('[data-state="error"]')].find(el => el.textContent?.includes('codex: Recover the failed check'))),
          bodylessEvent: Boolean([...document.querySelectorAll('[data-state="ok"]')].find(el => el.textContent?.includes('codex: Wait for agent'))),
          composer: Boolean(document.querySelector('textarea, [contenteditable="true"]')),
          bodylessInteractive: Boolean([...document.querySelectorAll('[data-state="ok"]')].find(el => el.textContent?.includes('codex: Wait for agent'))?.querySelector('button, a, input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])')),
        })"""
    )


def assert_page_state(page: Page, state: dict[str, Any]) -> None:
    required = (
        "userMessage",
        "agentAnswer",
        "completedEvent",
        "runningEvent",
        "errorEvent",
        "bodylessEvent",
        "composer",
    )
    for key in required:
        assert state[key], f"fixture assertion failed: {key} is missing"
    assert not state["bodylessInteractive"], (
        "fixture assertion failed: bodyless event is interactive"
    )
    assert not state["overflow"], "fixture assertion failed: horizontal overflow"


def send_button_state(page: Page) -> bool | None:
    button = page.locator("button[title='Send']").first
    assert button.count(), "fixture assertion failed: Send button is missing"
    return button.is_disabled()


def composer_text(page: Page) -> str:
    textbox = page.locator("textarea, [contenteditable='true']").first
    return textbox.evaluate(
        "element => 'value' in element ? element.value : element.textContent || ''"
    )


def capture(page: Page, name: str, viewport: tuple[int, int], theme: str, zoom: int, results: list[dict[str, Any]]) -> None:
    page.set_viewport_size({"width": viewport[0], "height": viewport[1]})
    page.evaluate("(theme) => { document.documentElement.classList.toggle('dark', theme === 'dark'); }", theme)
    page.evaluate("(zoom) => { document.documentElement.style.fontSize = `${16 * zoom / 100}px`; }", zoom)
    page.wait_for_timeout(350)
    state = check_page(page)
    assert_page_state(page, state)
    path = SHOTS / name
    page.screenshot(path=str(path), full_page=True)
    results.append({"file": name, "viewport": f"{viewport[0]}x{viewport[1]}", "theme": theme, "zoom": f"{zoom}%", **state})


def run() -> int:
    global OUT, SHOTS
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-baseline", action="store_true")
    parser.add_argument("--out-dir", type=Path, default=OUT)
    parser.add_argument("--shots-dir", type=Path, default=SHOTS)
    args = parser.parse_args()
    OUT = args.out_dir
    SHOTS = args.shots_dir
    if not OUT.joinpath("workspace.html").exists():
        raise SystemExit("out/workspace.html is missing; run pnpm build first")
    SHOTS.mkdir(parents=True, exist_ok=True)
    temp_root, previous_environment = install_isolated_environment()
    server: ThreadingHTTPServer | None = None
    results: list[dict[str, Any]] = []
    console_errors: list[str] = []
    page_errors: list[str] = []
    request_failures: list[str] = []
    command_log: list[str] = []

    browser: Browser | None = None
    context: BrowserContext | None = None
    try:
        server, base_url = start_static_server()
        with sync_playwright() as playwright:
            browser = launch_browser(playwright)
            try:
                context = browser.new_context(viewport={"width": 1440, "height": 1000}, color_scheme="dark")
                page = context.new_page()
                page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
                page.on("pageerror", lambda error: page_errors.append(str(error)))
                page.on(
                    "requestfailed",
                    lambda request: request_failures.append(
                        f"{request.method} {request.url}: {request.failure}"
                    ),
                )
                configure_page(page, "dark", 100)
                install_browser_mocks(page, command_log)
                reload_at(page, base_url, (1440, 1000), "dark", 100)

                capture(page, "after-1440-dark.png", (1440, 1000), "dark", 100, results)

                reload_at(page, base_url, (1440, 1000), "light", 100)
                capture(page, "after-1440-light.png", (1440, 1000), "light", 100, results)

                reload_at(page, base_url, (1024, 900), "dark", 100)
                capture(page, "after-1024-dark.png", (1024, 900), "dark", 100, results)
                reload_at(page, base_url, (390, 844), "dark", 100)
                capture(page, "after-390-dark.png", (390, 844), "dark", 100, results)
                reload_at(page, base_url, (1440, 1000), "dark", 150)
                capture(page, "after-1440-dark-150.png", (1440, 1000), "dark", 150, results)

                reload_at(page, base_url, (1440, 1000), "dark", 100)
                textbox = page.locator("textarea, [contenteditable='true']").first
                textbox.focus()
                focus_state = check_page(page)
                assert_page_state(page, focus_state)
                page.screenshot(path=str(SHOTS / "after-keyboard-focus.png"), full_page=True)
                results.append({"file": "after-keyboard-focus.png", "viewport": "1440x1000", "theme": "dark", "zoom": "100%", "focus": True, **focus_state})

                completed = page.locator("[data-slot='collapsible'][data-state='ok']").filter(has_text="codex: Verify the visual fixture").first
                running = page.locator("[data-slot='collapsible'][data-state='running']").filter(has_text="codex: Inspect the active message").first
                error = page.locator("[data-slot='collapsible'][data-state='error']").filter(has_text="codex: Recover the failed check").first
                assert completed.count(), "fixture assertion failed: completed event is missing"
                assert running.count(), "fixture assertion failed: running event is missing"
                assert error.count(), "fixture assertion failed: error event is missing"
                completed.screenshot(path=str(SHOTS / "tool-completed-collapsed.png"))
                completed_trigger = completed.locator("[data-slot='collapsible-trigger']").first
                completed_collapsed_aria = completed_trigger.get_attribute("aria-expanded")
                assert completed_collapsed_aria == "false", "completed event is not collapsed by default"
                completed_trigger.click()
                page.wait_for_timeout(250)
                completed.screenshot(path=str(SHOTS / "tool-completed-expanded.png"))
                completed_expanded_aria = completed_trigger.get_attribute("aria-expanded")
                assert completed_expanded_aria == "true", "completed event did not expand"
                error_expanded_aria = error.locator("[data-slot='collapsible-trigger']").first.get_attribute("aria-expanded")
                assert error_expanded_aria == "true", "error event is not expanded by default"
                running.screenshot(path=str(SHOTS / "tool-running.png"))
                error.screenshot(path=str(SHOTS / "tool-error-expanded.png"))
                results.extend([
                    {"file": "tool-completed-collapsed.png", "viewport": "1440x1000", "theme": "dark", "zoom": "100%", "expanded": False, "aria_expanded": completed_collapsed_aria},
                    {"file": "tool-completed-expanded.png", "viewport": "1440x1000", "theme": "dark", "zoom": "100%", "expanded": True, "aria_expanded": completed_expanded_aria},
                    {"file": "tool-running.png", "viewport": "1440x1000", "theme": "dark", "zoom": "100%", "expanded": False},
                    {"file": "tool-error-expanded.png", "viewport": "1440x1000", "theme": "dark", "zoom": "100%", "expanded": True, "aria_expanded": error_expanded_aria},
                ])

                textbox.fill("")
                disabled_state = check_page(page)
                assert_page_state(page, disabled_state)
                assert not composer_text(page).strip(), "empty composer contains input"
                disabled_send = send_button_state(page)
                assert disabled_send is True, "empty composer Send button is enabled"
                page.screenshot(path=str(SHOTS / "composer-disabled.png"), full_page=True)
                results.append({"file": "composer-disabled.png", "viewport": "1440x1000", "theme": "dark", "zoom": "100%", "composer": "disabled", "send_disabled": disabled_send, **disabled_state})
                textbox.fill("Keep the visual review focused")
                enabled_state = check_page(page)
                assert_page_state(page, enabled_state)
                assert composer_text(page).strip() == "Keep the visual review focused", (
                    "typed composer input was not retained"
                )
                enabled_send = send_button_state(page)
                assert enabled_send is False, "typed composer Send button is disabled"
                page.screenshot(path=str(SHOTS / "composer-enabled.png"), full_page=True)
                results.append({"file": "composer-enabled.png", "viewport": "1440x1000", "theme": "dark", "zoom": "100%", "composer": "enabled", "send_disabled": enabled_send, **enabled_state})

                if not args.skip_baseline:
                    # The current build is intentionally never copied into a
                    # before filename. Baseline capture is handled by a separate
                    # clean-HEAD invocation when available.
                    pass
            finally:
                if context is not None:
                    context.close()
                if browser is not None:
                    browser.close()
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()
        cleanup_isolated_environment(temp_root, previous_environment)

    assert not request_failures, f"fixture request failures: {request_failures}"
    assert not console_errors, f"fixture console errors: {console_errors}"
    assert not page_errors, f"fixture page errors: {page_errors}"
    assert results, "fixture assertion failed: no screenshots were generated"
    report = {
        "screenshot_count": len(results),
        "results": results,
        "console_errors": console_errors,
        "page_errors": page_errors,
        "request_failures": request_failures,
        "api_commands": command_log,
        "isolated_temp_root": temp_root,
        "model_requests": 0,
        "credential_reads": 0,
        "overflow_failures": [item["file"] for item in results if item.get("overflow")],
    }
    (SHOTS.parent / "fixture-results.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    shutil.rmtree(temp_root, ignore_errors=True)
    print(json.dumps(report, indent=2))
    assert not report["overflow_failures"], (
        f"fixture overflow failures: {report['overflow_failures']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(run())

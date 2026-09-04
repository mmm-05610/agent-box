#!/usr/bin/env python3
"""Capture the real product's empty-workspace state with the UI-1 harness."""

import json
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import Browser, BrowserContext, sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
import ui1_visual_fixture as fixture  # noqa: E402


def main() -> int:
    temp_root, previous_environment = fixture.install_isolated_environment()
    original_response = fixture.response_for

    def empty_response(command, params):
        if command == "list_all_conversations":
            return []
        if command == "list_opened_tabs":
            return {"items": [], "version": 0}
        return original_response(command, params)

    fixture.response_for = empty_response
    fixture.SHOTS.mkdir(parents=True, exist_ok=True)
    server: ThreadingHTTPServer | None = None
    browser: Browser | None = None
    context: BrowserContext | None = None
    console_errors = []
    page_errors = []
    state = None
    try:
        server, base_url = fixture.start_static_server()
        with sync_playwright() as playwright:
            browser = fixture.launch_browser(playwright)
            try:
                context = browser.new_context(
                    viewport={"width": 1440, "height": 1000}, color_scheme="dark"
                )
                page = context.new_page()
                page.on(
                    "console",
                    lambda msg: console_errors.append(msg.text)
                    if msg.type == "error"
                    else None,
                )
                page.on("pageerror", lambda error: page_errors.append(str(error)))
                fixture.configure_page(page, "dark", 100)
                fixture.install_browser_mocks(page, [])
                page.goto(f"{base_url}/workspace", wait_until="domcontentloaded")
                page.get_by_text("What would you like to do today?", exact=True).wait_for(timeout=15000)
                page.wait_for_timeout(1200)
                state = page.evaluate(
                    """() => ({
                      overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
                      hasComposer: Boolean(document.querySelector('[contenteditable="true"]')),
                      hasConversationCopy: [
                        'UI-1 visual closure',
                        'Review the default session visual direction',
                        'The workspace is ready for a focused visual review',
                        'codex: Verify the visual fixture',
                        'codex: Inspect the active message',
                        'codex: Recover the failed check',
                        'codex: Wait for agent',
                      ].some(copy => document.body.innerText.includes(copy)),
                    })"""
                )
                assert state["hasComposer"], "empty fixture assertion failed: composer is missing"
                assert not state["hasConversationCopy"], "empty fixture contains conversation fixture copy"
                assert not state["overflow"], "empty fixture assertion failed: horizontal overflow"
                assert not console_errors, f"empty fixture console errors: {console_errors}"
                assert not page_errors, f"empty fixture page errors: {page_errors}"
                output = fixture.SHOTS / "empty-session-1440-dark.png"
                page.screenshot(path=str(output), full_page=True)
            finally:
                if context is not None:
                    context.close()
                if browser is not None:
                    browser.close()
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()
        fixture.cleanup_isolated_environment(temp_root, previous_environment)

    result = {
        "file": output.name,
        "viewport": "1440x1000",
        "theme": "dark",
        "zoom": "100%",
        **state,
        "console_errors": console_errors,
        "page_errors": page_errors,
    }
    (fixture.SHOTS.parent / "empty-fixture-results.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

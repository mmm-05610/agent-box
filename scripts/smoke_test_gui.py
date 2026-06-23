"""Smoke test for the gui/ package — no Tk, just logic.

Run:  .venv/bin/python scripts/smoke_test_gui.py
"""
from __future__ import annotations

from agent_box import sessions
from gui.theme import Theme, C
from gui.tokens import (
    FONT_BODY, FONT_BOLD, FONT_CAPTION, FONT_DISPLAY,
    SPACE_LG, SPACE_MD, RADIUS_LG, BUTTON_HEIGHT, SIDEBAR_WIDTH,
)
from gui.wsl import (
    fetch_profiles, launch_profile, build_launch_argv, to_wsl_path,
    AGENT_ORDER, MODE_RESUME, MODE_NEW, LAUNCH_MODES, RESUME_ARGS,
    fetch_sessions,
)


def main() -> int:
    # Theme toggle
    Theme.set_mode("dark")
    assert C("bg") == "#0F1115", f"dark bg wrong: {C('bg')}"
    Theme.set_mode("light")
    assert C("bg") == "#FAFAFB", f"light bg wrong: {C('bg')}"
    Theme.set_mode("system")
    print("Theme toggle: PASS")

    # Tokens
    assert FONT_BODY == ("Segoe UI Variable", 13, "normal")
    assert SPACE_LG == 16
    assert RADIUS_LG == 8
    assert BUTTON_HEIGHT == 32
    assert SIDEBAR_WIDTH == 220
    print("Tokens: PASS")

    # Path conversion
    assert to_wsl_path("C:\\Users\\test") == "/mnt/c/Users/test"
    assert to_wsl_path("\\\\wsl$\\Ubuntu\\home\\maoqh") == "/home/maoqh"
    assert to_wsl_path("//wsl.localhost/Ubuntu/home/x") == "/home/x"
    print("to_wsl_path: PASS")

    # sessions module: insert + read
    sid = sessions.record_launch("smoke", "cc", "/tmp", "新会话", 99999)
    rows = fetch_sessions(active_only=True)
    assert any(r["id"] == sid for r in rows), f"row {sid} not in active set"
    print(f"sessions: PASS (sid={sid}, active={len(rows)})")

    # Resume args
    for at in AGENT_ORDER:
        assert at in RESUME_ARGS, f"{at} missing from RESUME_ARGS"
    print(f"RESUME_ARGS: PASS ({len(RESUME_ARGS)} agents)")

    # build_launch_argv
    argv = build_launch_argv("dw", "cc", MODE_RESUME, "/tmp/test")
    assert argv[0] == "wsl.exe"
    assert "/tmp/test" in argv[-1], "cwd not in script"
    print("build_launch_argv: PASS")

    # Latest cwd (empty before any launches for an unknown profile)
    assert sessions.latest_cwd_for("nonexistent-profile-xyz") is None
    print("latest_cwd_for: PASS")

    # Cleanup the test row
    sessions.record_exit(sid, 0)

    print()
    print("=== Smoke test PASSED ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

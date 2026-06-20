"""agent-box GUI - web-based profile launcher. Usage: agent-box gui"""
from __future__ import annotations
import subprocess, sys
from collections import defaultdict

try:
    from nicegui import ui
except ImportError:
    sys.exit("nicegui not installed. Run: pip install nicegui")

from . import profile as _profile


def _launch(name: str):
    for term in ["gnome-terminal", "xterm", "konsole", "wt.exe"]:
        p = subprocess.which(term)
        if p:
            subprocess.Popen([p, "--", "bash", "-c", f"agent-box launch {name}; exec bash"])
            return
    subprocess.Popen(["agent-box", "launch", name])


@ui.page("/")
def index():
    ui.label("Agent Box").classes("text-2xl font-bold mb-4")

    profiles = _profile.list_profiles()
    grouped = defaultdict(list)
    for p in profiles:
        grouped[p["agent_type"]].append(p)

    for atype, items in sorted(grouped.items()):
        ui.label(atype.upper()).classes("text-lg font-semibold mt-4 mb-2")
        for item in items:
            with ui.row().classes("items-center gap-2 ml-4"):
                ui.label(item["name"]).classes("w-32")
                ui.button("Launch", on_click=lambda n=item["name"]: _launch(n)).props("size=sm")

    if not profiles:
        ui.label("(no profiles - create one with: agent-box create <name> --type cc)")


def main():
    ui.run(host="127.0.0.1", port=8080, title="Agent Box", reload=False)


if __name__ in ("__main__", "__mp_main__"):
    main()

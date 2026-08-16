"""agent-box TUI — k9s-style management dashboard over the shared library.

``agent-box`` (no args) lands on an overview; navigate into profiles, sessions,
or drill into a profile.  Every action is a thin wrapper over the same library
functions the one-shot CLI commands call — the TUI adds navigation and
rendering, never business logic.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List

from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.screen import Screen
from textual.widgets import DataTable, Footer, Header, Static

from .. import launch
from ..resources import hooks, mcp, profile, providers, sessions


def _cell(row: Dict[str, Any], key: str) -> str:
    v = row.get(key)
    return "" if v is None else str(v)


def _ago(ts: Any) -> str:
    """Relative time for a SQLite datetime('now') timestamp."""
    if not ts:
        return ""
    try:
        # launched_at is stored in UTC (SQLite datetime('now')); compare against
        # UTC now, not local time, or a UTC+8 box reports everything as "8h ago".
        dt = datetime.strptime(str(ts), "%Y-%m-%d %H:%M:%S")
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        s = int((now - dt).total_seconds())
    except (ValueError, TypeError):
        return str(ts)
    if s < 60:
        return f"{s}s"
    if s < 3600:
        return f"{s // 60}m"
    if s < 86400:
        return f"{s // 3600}h"
    return f"{s // 86400}d"


class OverviewScreen(Screen):
    """Home — aggregate status + latest activity per profile."""

    BINDINGS = [
        Binding("p", "profiles", "Profiles"),
        Binding("r", "refresh_overview", "Refresh"),
        Binding("q", "request_quit", "Quit"),
        Binding("ctrl+c", "request_quit", "Quit", show=False),
    ]

    CSS = """
    OverviewScreen { padding: 0 1; }
    #stats { height: 1; margin-bottom: 1; }
    #running-panel { border: round; padding: 1 2; height: auto; margin-bottom: 1; }
    #activity-panel { border: round; padding: 1 2; height: 1fr; }
    #running-title, #activity-title { height: 1; margin-bottom: 1; text-style: bold; }
    """

    def action_request_quit(self) -> None:
        """Two-press quit: first q/ctrl+c arms it, second within 2s exits."""
        now = time.monotonic()
        last = getattr(self, "_last_quit", 0.0)
        if now - last < 2.0:
            self.app.exit()
        else:
            self._last_quit = now
            self.notify("再按一次 q 或 ctrl+c 退出", timeout=2.0)

    def compose(self) -> ComposeResult:
        yield Header()
        yield Static("", id="stats")
        with Vertical(id="running-panel"):
            yield Static("running", id="running-title")
            yield DataTable(id="running", cursor_type="row", zebra_stripes=True)
        with Vertical(id="activity-panel"):
            yield Static("latest activity", id="activity-title")
            yield DataTable(id="recent", cursor_type="row", zebra_stripes=True)
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#running", DataTable).add_columns("Profile", "Agent", "Directory", "Started")
        self.query_one("#recent", DataTable).add_columns("Profile", "Agent", "Status", "Last")
        self.refresh_overview()

    def action_refresh_overview(self) -> None:
        self.refresh_overview()

    def refresh_overview(self) -> None:
        profs = profile.list_profiles()
        sess = sessions.fetch_sessions()
        running = [s for s in sess if s.get("exited_at") is None]

        # running block — active sessions with their working directory
        self._running_by_id = {str(s["id"]): s for s in running}
        running_table = self.query_one("#running", DataTable)
        running_table.clear()
        for s in running:
            running_table.add_row(
                s["profile"],
                s["agent_type"],
                s.get("cwd") or "",
                _ago(s.get("launched_at")),
                key=str(s["id"]),
            )
        self.query_one("#running-title", Static).update(f"running ({len(running)})")

        # latest activity — latest session per profile (newest-first)
        latest: Dict[str, dict] = {}
        for s in sess:
            latest.setdefault(s["profile"], s)
        table = self.query_one("#recent", DataTable)
        table.clear()
        for name, s in latest.items():
            exited = s.get("exited_at") is not None
            if not exited:
                status = Text("● running", style="green")
            elif s.get("exit_code") == 0:
                status = Text("○ ok", style="dim")
            else:
                status = Text(f"○ exit={s.get('exit_code')}", style="red")
            table.add_row(
                name,
                s["agent_type"],
                status,
                _ago(s.get("launched_at")),
                key=name,
            )
        self.query_one("#activity-title", Static).update(f"latest activity ({len(latest)})")

        self.query_one("#stats", Static).update(
            f"[bold]{len(profs)}[/] profiles  ·  "
            f"[bold green]{len(running)}[/] running  ·  "
            f"[dim]{len(latest) - len(running)} idle[/]"
        )

    def on_data_table_row_selected(self, event) -> None:
        if event.table.id == "running":
            s = getattr(self, "_running_by_id", {}).get(str(event.row_key.value))
            name = s["profile"] if s else None
        else:
            name = event.row_key.value
        if name:
            self.app.push_screen(ProfileDetailScreen(name))

    def action_profiles(self) -> None:
        self.app.push_screen(ProfilesScreen())


class ProfilesScreen(Screen):
    """Profiles list — k9s-style navigation."""

    BINDINGS = [
        Binding("escape", "back", "Back"),
        Binding("l", "launch", "Launch"),
        Binding("d", "delete", "Delete"),
        Binding("r", "refresh_profiles", "Refresh"),
        Binding("q", "quit", "Quit"),
    ]

    def compose(self) -> ComposeResult:
        yield Header()
        yield Static("", id="status")
        yield DataTable(id="profiles", cursor_type="row", zebra_stripes=True)
        yield Footer()

    def on_mount(self) -> None:
        table = self.query_one(DataTable)
        table.add_columns("Profile", "Agent", "Provider", "Sessions", "Status")
        self.refresh_profiles()

    def action_back(self) -> None:
        self.app.pop_screen()

    def action_quit(self) -> None:
        # Sync quit: Textual's built-in action_quit is async and didn't fire
        # from a key binding here, so exit directly.
        self.app.exit()

    def action_refresh_profiles(self) -> None:
        self.refresh_profiles()

    def refresh_profiles(self) -> None:
        rows = profile.list_profiles()
        sess = sessions.fetch_sessions()
        table = self.query_one(DataTable)
        table.clear()
        for r in rows:
            name = r["name"]
            prof_sessions = [s for s in sess if s["profile"] == name]
            running = [s for s in prof_sessions if s.get("exited_at") is None]
            table.add_row(
                name,
                _cell(r, "agent_type"),
                _cell(r, "provider_ref"),
                str(len(prof_sessions)),
                f"● {len(running)}" if running else "idle",
                key=name,
            )
        self.query_one("#status", Static).update(
            f"{len(rows)} profiles   "
            "[dim]enter 打开 · l launch · d 删除 · r 刷新 · esc 返回 · q 退出[/]"
        )

    def _selected(self) -> str | None:
        table = self.query_one(DataTable)
        idx = table.cursor_row
        if idx is None:
            return None
        return table.get_row_at(idx).value

    def on_data_table_row_selected(self, event) -> None:
        name = event.row_key.value
        self.app.push_screen(ProfileDetailScreen(name))

    def action_launch(self) -> None:
        name = self._selected()
        if not name:
            return
        self.notify(f"launching {name} …")

        def _run() -> None:
            try:
                launch.launch(name)
            except SystemExit:
                pass  # agent exited; exit code already recorded
            except Exception as exc:
                self.app.call_from_thread(
                    lambda: self.notify(f"{name}: {exc}", severity="error")
                )

        threading.Thread(target=_run, daemon=True).start()

    def action_delete(self) -> None:
        name = self._selected()
        if not name:
            return
        self.app.push_screen(ConfirmScreen(f"delete profile {name!r}?", name, self))


class ProfileDetailScreen(Screen):
    """Drill-down view for one profile."""

    BINDINGS = [
        Binding("escape", "back", "Back"),
        Binding("b", "back", "Back"),
        Binding("q", "quit", "Quit"),
    ]

    def __init__(self, name: str) -> None:
        super().__init__()
        self.profile_name = name

    def compose(self) -> ComposeResult:
        yield Header()
        yield Static("", id="detail")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#detail", Static).update(self._build_detail())

    def action_back(self) -> None:
        self.app.pop_screen()

    def action_quit(self) -> None:
        self.app.exit()

    def _build_detail(self) -> str:
        name = self.profile_name
        try:
            info = profile.show(name)
        except Exception as exc:
            return f"[red]{exc}[/]"
        meta = info.get("meta", {})
        agent_type = meta.get("agent_type", "")
        lines: List[str] = [
            f"[bold]{name}[/]  ({agent_type})",
            "",
        ]
        if meta.get("display_name"):
            lines.append(f"display: {meta['display_name']}")
        if meta.get("description"):
            lines.append(f"desc:    {meta['description']}")
        if meta.get("provider"):
            lines.append(f"provider: {meta['provider']}")
        if meta.get("prompt"):
            lines.append(f"prompt:   {meta['prompt']}")
        lines.append(f"config:  {info.get('config_dir', '')}")
        lines.append("")

        try:
            provs = providers.list_profile_providers(name, agent_type)
        except Exception:
            provs = []
        lines.append(f"[bold]providers[/] ({len(provs)})")
        for p in provs:
            lines.append(f"  {p['id']}  {p.get('name', '')}")
        lines.append("")

        try:
            servers = mcp.list_profile_mcp_servers(name)
        except Exception:
            servers = []
        lines.append(f"[bold]mcp[/] ({len(servers)})")
        for s in servers:
            lines.append(f"  {s.get('id', '?')}  {s.get('name', '')}")
        lines.append("")

        try:
            h = hooks.get_hooks(name)
        except Exception:
            h = None
        lines.append(f"[bold]hooks[/]: {len(h)} event(s)" if h else "[bold]hooks[/]: (none)")
        lines.append("")

        sess = [s for s in sessions.fetch_sessions() if s["profile"] == name]
        running = [s for s in sess if s.get("exited_at") is None]
        lines.append(f"[bold]sessions[/]: {len(running)} running / {len(sess)} total")
        return "\n".join(lines)


class ConfirmScreen(Screen):
    """Minimal y/N confirm before a destructive action."""

    BINDINGS = [
        Binding("y", "confirm", "Yes"),
        Binding("n", "cancel", "No"),
    ]

    def __init__(self, prompt: str, name: str, parent: Screen) -> None:
        super().__init__()
        self.prompt = prompt
        self.profile_name = name
        self.parent = parent

    def compose(self) -> ComposeResult:
        yield Header()
        yield Static(f"{self.prompt}\n\n[bold]y[/] / n", id="confirm")
        yield Footer()

    def action_confirm(self) -> None:
        try:
            profile.delete(self.profile_name, force=True)
            self.app.pop_screen()
            if hasattr(self.parent, "refresh_profiles"):
                self.parent.refresh_profiles()
        except Exception as exc:
            self.app.pop_screen()
            self.parent.notify(f"{self.profile_name}: {exc}", severity="error")

    def action_cancel(self) -> None:
        self.app.pop_screen()


class AgentBoxTui(App):
    """The agent-box terminal dashboard."""

    TITLE = "agent-box"

    def on_mount(self) -> None:
        self.push_screen(OverviewScreen())

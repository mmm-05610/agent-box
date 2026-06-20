"""agent-box Windows Desktop GUI (Tkinter).

Run on Windows with: ``python gui-windows.py``

Lists agent-box profiles inside WSL (one ``wsl.exe agent-box list --json``
call) and lets the user launch a selected profile in a new Windows
Terminal tab. The actual agent runs inside WSL via
``agent-box launch <name> [extra ...]`` so the bwrap isolation stays in
effect. Resume / continue arguments per agent type are passed through
verbatim to the agent binary (see ``RESUME_ARGS``).
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tkinter as tk
from tkinter import ttk, messagebox
from typing import Any, Dict, List, Optional, Tuple


# --- agent type ordering & resume args (per docs/specs/windows-gui.md) ---

AGENT_ORDER: Tuple[str, ...] = ("cc", "codex", "hermes", "opencode")

# None == "新会话" (no resume args passed to the agent)
RESUME_ARGS: Dict[str, Optional[Tuple[str, ...]]] = {
    "cc":       ("--continue",),
    "codex":    ("resume", "--last"),
    "hermes":   ("-c",),
    "opencode": None,
}

MODE_NEW     = "新会话"
MODE_RESUME  = "继续上次"
LAUNCH_MODES = (MODE_NEW, MODE_RESUME)


# --- WSL / Windows Terminal integration -----------------------------------

def fetch_profiles() -> List[Dict[str, str]]:
    """Return profiles from ``wsl.exe agent-box list --json``.

    Raises RuntimeError on any failure so the caller can surface a status.
    """
    wsl = shutil.which("wsl.exe")
    if wsl is None:
        raise RuntimeError("wsl.exe not found in PATH (install WSL).")
    try:
        proc = subprocess.run(
            [wsl, "bash", "-lc", "agent-box list --json"],
            capture_output=True,
            text=True,
            timeout=15,
            cwd="C:\\",
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("wsl.exe agent-box list --json timed out") from exc
    except OSError as exc:
        raise RuntimeError(f"failed to invoke wsl.exe: {exc}") from exc

    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        raise RuntimeError(
            f"agent-box list failed (exit {proc.returncode}): {stderr or '<no stderr>'}"
        )
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid JSON from agent-box list: {exc}") from exc
    if not isinstance(data, list):
        raise RuntimeError("agent-box list --json did not return a JSON array")
    return data


def build_launch_argv(name: str, agent_type: str, mode: str) -> List[str]:
    """Build the argv passed to ``subprocess.Popen`` to launch a profile.

    Example::

        ["wt.exe", "wsl.exe", "bash", "-lc",
         "agent-box launch dw --continue"]
    """
    argv: List[str] = ["agent-box", "launch", name]
    if mode == MODE_RESUME and agent_type in RESUME_ARGS:
        extra = RESUME_ARGS[agent_type]
        if extra:
            argv.extend(extra)
    cmdline = " ".join(_shell_quote(a) for a in argv)
    # Ensure ~/.local/bin and ~/.npm-global/bin are on PATH (login shell
    # may not source .bashrc for non-interactive sessions).
    setup = "export PATH=\"$HOME/.npm-global/bin:$HOME/.local/bin:$PATH\""
    script = f"{setup} && {cmdline} || {{ ec=$?; echo; echo agent-box failed code $ec; read -p Enter...; }}"
    return ["wsl.exe", "bash", "-lc", script]


def _shell_quote(token: str) -> str:
    """Quote a single argv element for use inside a ``bash -lc \"...\"`` string."""
    if token == "" or any(ch in token for ch in (" ", "\t", '"', "'", "\\", "$", "`", "\n")):
        return "'" + token.replace("'", "'\"'\"'") + "'"
    return token


def launch_profile(name: str, agent_type: str, mode: str) -> None:
    """Spawn a new console window with the agent command. Non-blocking."""
    argv = build_launch_argv(name, agent_type, mode)
    kwargs = dict(close_fds=True, cwd="C:\\")
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE
    subprocess.Popen(argv, **kwargs)


# --- Tkinter UI -----------------------------------------------------------

class AgentBoxApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Agent Box")
        self.root.minsize(520, 320)

        self.status_var = tk.StringVar(value="Ready.")
        self.rows: List[Dict[str, Any]] = []  # widget refs per profile row

        self._build_layout()
        self.root.after(50, self.refresh)

    # --- layout -----------------------------------------------------------
    def _build_layout(self) -> None:
        outer = ttk.Frame(self.root, padding=10)
        outer.pack(fill="both", expand=True)

        ttk.Label(
            outer, text="Agent Box", font=("Segoe UI", 12, "bold")
        ).pack(anchor="w", pady=(0, 6))

        # Scrollable body
        body_outer = ttk.Frame(outer)
        body_outer.pack(fill="both", expand=True)

        self.canvas = tk.Canvas(body_outer, highlightthickness=0)
        scrollbar = ttk.Scrollbar(body_outer, orient="vertical", command=self.canvas.yview)
        self.body = ttk.Frame(self.canvas)

        self.body.bind(
            "<Configure>",
            lambda _e: self.canvas.configure(scrollregion=self.canvas.bbox("all")),
        )
        self.canvas.create_window((0, 0), window=self.body, anchor="nw")
        self.canvas.configure(yscrollcommand=scrollbar.set)

        self.canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # Footer: refresh + status
        footer = ttk.Frame(outer)
        footer.pack(fill="x", pady=(8, 0))
        ttk.Button(footer, text="\u21bb Refresh", command=self.refresh).pack(side="left")
        ttk.Label(footer, textvariable=self.status_var, anchor="w").pack(
            side="left", fill="x", expand=True, padx=(10, 0)
        )

    # --- refresh ----------------------------------------------------------
    def refresh(self) -> None:
        self.status_var.set("Refreshing\u2026")
        self.root.update_idletasks()
        try:
            profiles = fetch_profiles()
        except RuntimeError as exc:
            profiles = []
            self.status_var.set(f"Error: {exc}")
        else:
            self.status_var.set(f"Loaded {len(profiles)} profile(s).")
        self._rebuild_rows(profiles)

    def _rebuild_rows(self, profiles: List[Dict[str, str]]) -> None:
        for w in self.body.winfo_children():
            w.destroy()
        self.rows.clear()

        if not profiles:
            ttk.Label(
                self.body,
                text="(no profiles \u2014 run: agent-box create <name>)",
                foreground="#666",
            ).pack(anchor="w", padx=4, pady=12)
            return

        groups: Dict[str, List[Dict[str, str]]] = {at: [] for at in AGENT_ORDER}
        for p in profiles:
            at = p.get("agent_type", "")
            groups.setdefault(at, []).append(p)

        for at in AGENT_ORDER:
            items = groups.get(at, [])
            if not items:
                continue
            self._render_group(at, items)

        # any unknown agent types appended at the end
        for at, items in groups.items():
            if at in AGENT_ORDER or not items:
                continue
            self._render_group(at, items)

    def _render_group(self, agent_type: str, items: List[Dict[str, str]]) -> None:
        header = ttk.Label(
            self.body,
            text=f"\u2500\u2500 {agent_type} " + "\u2500" * 40,
            font=("Segoe UI", 10, "bold"),
        )
        header.pack(anchor="w", padx=4, pady=(8, 2))

        for p in items:
            name = p.get("name", "?")
            row = ttk.Frame(self.body)
            row.pack(fill="x", padx=8, pady=2)

            ttk.Label(row, text=name, width=20, anchor="w").pack(side="left")
            launch_btn = ttk.Button(
                row,
                text="\u25b6 Launch",
                width=10,
                command=lambda n=name, t=agent_type: self._on_launch(n, t),
            )
            launch_btn.pack(side="left", padx=(6, 4))
            mode_var = tk.StringVar(value=MODE_NEW)
            combo = ttk.Combobox(
                row,
                textvariable=mode_var,
                values=LAUNCH_MODES,
                state="readonly",
                width=12,
            )
            combo.pack(side="left")
            self.rows.append({
                "name": name,
                "agent_type": agent_type,
                "mode_var": mode_var,
                "button": launch_btn,
            })

    # --- launch handler ---------------------------------------------------
    def _on_launch(self, name: str, agent_type: str) -> None:
        # find the row's selected mode (combo is per-row, look it up)
        mode = MODE_NEW
        for r in self.rows:
            if r["name"] == name and r["agent_type"] == agent_type:
                mode = r["mode_var"].get()
                break
        try:
            launch_profile(name, agent_type, mode)
        except RuntimeError as exc:
            messagebox.showerror("Launch failed", str(exc))
            self.status_var.set(f"Launch failed: {exc}")
            return
        self.status_var.set(f"Launched {agent_type}/{name} ({mode}).")


def main() -> int:
    root = tk.Tk()
    try:
        # nicer theme on Win10/11; falls back silently elsewhere
        ttk.Style().theme_use("vista")
    except tk.TclError:
        pass
    AgentBoxApp(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())

# agent-box — Project Notes for Claude

This file is read by Claude Code when working in this repo. It points to
the canonical docs and flags known landmines.

## Documentation index

### Architecture & design

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — design principles + data
  flow (bwrap launcher, library.db, providers, profile settings).
- [docs/ROADMAP.md](docs/ROADMAP.md) — feature roadmap and status.

### Specs (planning + design intent)

- [docs/specs/gui-redesign-p1.md](docs/specs/gui-redesign-p1.md) — GUI
  feature spec.
- [docs/specs/gui-redesign-p2.md](docs/specs/gui-redesign-p2.md) — GUI
  visual spec.
- [docs/specs/cc-switch-style-guide.md](docs/specs/cc-switch-style-guide.md)
  — design system reference.
- [docs/specs/frontend-overhaul.md](docs/specs/frontend-overhaul.md) —
  Phase 1–4 modular refactor plan.

### Troubleshooting (READ THESE BEFORE DEBUGGING)

- [docs/troubleshooting/desktop-launch.md](docs/troubleshooting/desktop-launch.md)
  — Windows + WSL desktop GUI launcher quirks. Covers the UNC + importlib
  bug, WSL 9P cold start, bat encoding, Tk font weights, `start` + pushd
  interactions, and the diagnostic workflow. **Read this first** when the
  user reports "GUI won't launch".

## Agent workspace convention

**All AI-generated work products MUST go in `workspace/`** (gitignored).
Never create new top-level directories or files for agent output — use
`workspace/<descriptive-slug>/` instead. Examples:

- `workspace/planning/` — DW / Codex planning artifacts
- `workspace/frontend-overhaul/` — DW workflow run records

## Entry points

- **GUI (Windows desktop)**: `gui-redesign.py` shim → `gui/app.py`.
- **CLI (WSL)**: `src/agent_box/cli.py`.
- **Desktop launcher**: `C:\Users\maoqh\Desktop\AgentBox.bat`

## Known landmines

- **Tk font weights**: only `"normal"` and `"bold"` work. CSS-style
  `"medium"` / `"semibold"` raise `_tkinter.TclError`. See
  `gui/tokens.py`.
- **Bat file encoding**: keep ASCII only. Em-dash (—) corrupts to `€?`
  on Chinese Windows GBK. See troubleshooting doc §5.
- **shim + UNC**: `from gui.app import main` fails silently on UNC paths.
  Use `importlib.util` as `gui-redesign.py` does. See troubleshooting §1.

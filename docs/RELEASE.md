# Release Process

agent-box ships three artifacts from one codebase:

| Artifact                                      | What                        | Where it runs                                                  |
| --------------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `agent-box-cli` (PyPI wheel)                  | the CLI + agent_box library | WSL / Linux (pip install) + Windows Python (GUI bridge helper) |
| `agent-box-setup-<v>.exe` (Windows installer) | the desktop GUI             | Windows host, shells into WSL                                  |
| `agent-box-gui` (Linux binary)                | the desktop GUI             | Linux / WSLg                                                   |

GUI and CLI are **independent tools**. The GUI never depends on the
`agent-box` CLI being installed in WSL — it calls the agent_box _library_
through `rpc_server.py` (a stdin/stdout JSON dispatcher over
`wsl.exe python3`), and the library is bundled into the exe at
`_MEIPASS/runtime`. See `docs/ARCHITECTURE.md` for the data flow.

## 0. Preflight

- Bump version: `pyproject.toml` (`version`), `setup.iss`
  (`MyAppVersion` / `OutputBaseFilename`), README badge (en + zh-CN).
- Add a `CHANGELOG.md` entry.
- `git tag v<version>` and push when the release is committed.
- Tests: `python3 -m pytest -q` and `cd gui-web && npx vitest run`.

## 1. CLI wheel → PyPI

```bash
python3 -m build                        # dist/agent_box_cli-<v>.whl + .tar.gz
# verify the wheel carries package data (agent_types.json, provider_endpoints,
# migrations/*.sql, templates/, presets/) — pyproject package-data must list them
twine upload dist/agent_box_cli-<v>-py3-none-any.whl dist/agent_box_cli-<v>.tar.gz
```

The wheel is `py3-none-any` — one artifact installs on WSL, Linux, and the
Windows Python that runs the GUI bridge.

## 2. GUI runtime (self-contained agent_box library)

The Windows GUI runs agent_box inside WSL via `rpc_server.py`; the library
must ship **inside the exe**, not be pip-installed into WSL.

```bash
bash scripts/build-gui-runtime.sh   # → build/runtime/ (from dist/*.whl + rpc_server.py + data_linux.py)
```

The spec bundles `build/runtime` → `_MEIPASS/runtime`. WSL python reads it
over `/mnt/<drive>/...` — no pip, venv, or CLI install on the WSL side.

## 3. cc-switch (ACS) binary

The GUI's Config button launches the cc-switch (ACS) app. `config.acs_binary()`
resolves it (env override → bundled `_MEIPASS/acs/...` → repo `acs/`). The
spec conditionally bundles it when it has been compiled.

```bash
# per platform — the binary name carries the extension (cc-switch.exe / cc-switch)
cd acs/src-tauri
cargo build --release        # requires Rust ≥ 1.85 + Tauri system deps
# Linux deps: libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev
#   libjavascriptcoregtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev
```

Build it once per platform; the spec picks it up automatically.

## 4. Windows GUI installer

Runs on Windows (PyInstaller does not cross-compile). From a Windows-native
checkout (not a `\\wsl$\...` UNC path — PyInstaller breaks on UNC):

```powershell
pip install agent-box-cli==<v>   # IMPORTANT: the exe bundles whichever
                                 # agent_box the Windows Python imports;
                                 # a stale install ships a stale library.
cd gui-web; npm install; npm run build; cd ..   # Vite build BEFORE PyInstaller
bash scripts/build-gui-runtime.sh               # (Git Bash / WSL bash)
pyinstaller agent-box-gui.spec                  # → dist\agent-box-gui.exe
iscc setup.iss                                  # → dist\agent-box-setup-<v>.exe
```

Upload the installer to GitHub Releases under the version tag.

## 5. Linux GUI binary

Runs in WSL (this is the Linux build environment — no cross-compile needed).

```bash
cd gui-web; npm run build; cd ..
bash scripts/build-gui-runtime.sh
pyinstaller agent-box-gui.spec      # → dist/agent-box-gui (ELF)
```

## Landmines

- **PyInstaller does not auto-collect package data** — the spec calls
  `collect_data_files('agent_box')`; without it the GUI crashes reading
  `agent_types.json`. The pip wheel has the same risk (pyproject
  `package-data`).
- **`sys.frozen` detection** — bridge.py must find the frontend at
  `sys._MEIPASS/gui-web/dist/`.
- **Vite build order** — `npm run build` before every PyInstaller run.
- **Stale agent_box on the Windows Python** — reinstall the wheel or the exe
  ships the old library.
- **UNC paths** — build from a Windows-native path, not `\\wsl$\...`.
- **`setup.iss` paths are relative to CWD** when running `iscc`.
- **acs `.exe` suffix** — `config.acs_binary()` appends it on Windows; the
  spec checks the platform-correct name.

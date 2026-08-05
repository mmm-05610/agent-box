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

The GUI's **Config** button launches the cc-switch (ACS) app. It always runs
**inside WSL** — the Windows GUI routes `launch_acs` through the RPC, so the
**Windows package does not need a Windows cc-switch.exe**. The WSL/Linux
cc-switch is what gets launched (and the Linux GUI bundles it via the spec).

**Frontend embedding** — plain `cargo build` does NOT embed the Tauri
frontend (needs the `tauri build` CLI to enable `custom-protocol`). Build
with the tauri CLI, with `cargo` on PATH:

```bash
export PATH="$HOME/.cargo/bin:$PATH"     # tauri CLI shells out to cargo
cd acs
pnpm install && pnpm run build:renderer  # → acs/dist
pnpm tauri build --no-bundle             # → acs/src-tauri/target/release/cc-switch
# requires Rust ≥ 1.85 + Tauri system deps:
#   libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev
#   libjavascriptcoregtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev
```

Build it in WSL once; the Linux GUI spec bundles it (checks
`acs/src-tauri/target/release/cc-switch`).

## 4. Windows GUI installer

Runs on Windows (PyInstaller does not cross-compile). The package is
**self-contained** — zero dependency on `agent-box` on the Windows Python
(everything goes through the WSL RPC + bundled runtime). No `pip install
agent-box-cli` needed.

**UNC caveat** — building from a `\\wsl.localhost\...` UNC path breaks both
`npm` (spawns cmd, which can't use UNC as CWD) and PyInstaller. Map the
share to a drive letter with `pushd`:

```powershell
pushd \\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box
cd gui-web; npm run build; cd ..    # Vite build BEFORE PyInstaller
# build/runtime is prepared in WSL (bash scripts/build-gui-runtime.sh) —
# on a shared repo it is already there.  Re-run it right before pyinstaller:
# the Windows-side walk of the 9P-mounted build/ dir can see a STALE view
# and silently drop runtime files (see Landmines below).
pyinstaller agent-box-gui.spec      # → dist\agent-box-gui.exe
python scripts/verify-exe-runtime.py dist\agent-box-gui.exe
#   ^ MUST print PASS before shipping — aborts on a broken exe
iscc setup.iss                      # → dist\agent-box-setup-<v>.exe
popd
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
- **Stale `build/runtime` over 9P** — the Windows pyinstaller walk of the
  shared `build/` dir can see a stale directory snapshot and silently drop
  runtime files (2026-08: only ~6% of the runtime was bundled, breaking every
  RPC call with "can't open file .../runtime/rpc_server.py"). Re-run
  `bash scripts/build-gui-runtime.sh` right before pyinstaller, and always
  run `scripts/verify-exe-runtime.py` on the exe before shipping.
- **UNC paths** — build from a Windows-native path, not `\\wsl$\...`.
- **`setup.iss` paths are relative to CWD** when running `iscc`.
- **acs `.exe` suffix** — `config.acs_binary()` appends it on Windows; the
  spec checks the platform-correct name.

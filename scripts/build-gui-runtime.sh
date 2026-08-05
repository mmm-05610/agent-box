#!/usr/bin/env bash
# Prepare the self-contained agent_box runtime for the GUI package.
#
# The Windows GUI must not depend on the `agent-box` CLI being installed in
# WSL, so rpc_server.py + the agent_box *library* (plus its pure-Python deps
# json5 / tomli-w / cmd2) are bundled into the exe at `_MEIPASS/runtime`.
# WSL python reads them over /mnt/<drive>/... — no pip, venv, or CLI install.
#
# Usage:  scripts/build-gui-runtime.sh   (run before pyinstaller)
# Output: build/runtime/  (bundled by agent-box-gui.spec → 'runtime')
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. Wheel (sdist build already produced it for PyPI; rebuild if missing).
if ! ls dist/agent_box_cli-*.whl >/dev/null 2>&1; then
  echo "no wheel in dist/ — building…"
  python3 -m build
fi

# 2. Extract the package + deps into a flat importable runtime dir.
rm -rf build/runtime
WHEEL=$(ls dist/agent_box_cli-*.whl | sort -V | tail -1)
# tomli is the <3.11 fallback for core/io.py's `import tomllib`.  The build
# env is usually 3.12+ where stdlib tomllib wins, so a `; python_version
# < '3.11'` marker would NOT install it here — pin it explicitly so the
# runtime stays self-contained on ANY WSL python (no host pip setup).
python3 -m pip install --quiet --target build/runtime "$WHEEL" tomli

# 3. Drop the RPC shim + LinuxDataAccess next to it (same dir as the GUI
#    dev layout, so `from data_linux import LinuxDataAccess` resolves).
cp gui-web/rpc_server.py gui-web/data_linux.py build/runtime/

echo "GUI runtime ready at build/runtime/ ($(du -sh build/runtime | cut -f1))"

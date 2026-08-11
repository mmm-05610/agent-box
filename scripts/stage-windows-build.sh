#!/usr/bin/env bash
# Stage fresh Windows-build inputs to C:\agentbox-build (NTFS), so pyinstaller
# on Windows reads native files instead of the 9P stale-view of the WSL repo.
#
# WHY: running `pyinstaller` from `pushd \\wsl.localhost\Ubuntu\...` reads the
# source tree over 9P/drvfs, whose server cache can serve STALE content — the
# exe silently bundles an old build/runtime or gui-web/dist.  The old workaround
# was `wsl --shutdown` to flush the cache (kills the WSL VM, disruptive).
# Staging writes fresh files from the WSL side to a Windows NTFS dir; Windows
# then reads its own filesystem — no 9P, no shutdown.
#
# Usage:  bash scripts/stage-windows-build.sh
# Then on Windows:  cd C:\agentbox-build && pyinstaller agent-box-gui.spec
#                   & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" setup.iss
set -euo pipefail
cd "$(dirname "$0")/.."

DEST=/mnt/c/agentbox-build
rm -rf "$DEST"
mkdir -p "$DEST/gui-web" "$DEST/build" "$DEST/assets"

# Spec + installer script (paths are relative to the build dir).
cp agent-box-gui.spec setup.iss "$DEST/"

# Frontend bundle + Windows entry/RPC shims.
cp -r gui-web/dist "$DEST/gui-web/dist"
cp gui-web/bridge.py gui-web/rpc_server.py gui-web/data_linux.py "$DEST/gui-web/"

# WSL self-contained runtime (built by scripts/build-gui-runtime.sh).
cp -r build/runtime "$DEST/build/runtime"

# Icons.
cp assets/logo.png assets/logo.ico "$DEST/assets/"

echo "staged: C:\\agentbox-build  ($(du -sh "$DEST" | cut -f1))"

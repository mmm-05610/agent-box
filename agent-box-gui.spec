# -*- mode: python ; coding: utf-8 -*-
import os
import sys
from PyInstaller.utils.hooks import collect_all, collect_data_files

datas = [
    ('assets/logo.png', '.'),
    ('assets/logo.ico', '.'),
    ('gui-web/dist', 'gui-web/dist'),
]
binaries = []
hiddenimports = []

# Bundle the LINUX cc-switch (ACS) binary into the runtime.  The Windows GUI
# always launches cc-switch inside WSL (never a native .exe), so the Linux
# ELF is what ships; _resolve_acs() copies it to ~/.agent-box/bin on first
# use (drvfs cannot exec ELF directly, so it must land on the WSL fs).
_linux_acs = 'acs/src-tauri/target/release/cc-switch'
if os.path.isfile(_linux_acs):
    datas.append((_linux_acs, 'runtime/bin'))

# agent_box package data (agent_types.json, provider_endpoints.json,
# templates/, presets/, migrations/).  PyInstaller does NOT auto-collect
# setuptools package-data — without this the packaged GUI crashes reading
# the agent registry.  Same fix applies to the pip wheel (pyproject).
datas += collect_data_files('agent_box')

# Self-contained agent_box runtime for WSL (rpc_server.py + the library +
# its pure-Python deps), prepared by scripts/build-gui-runtime.sh.  The
# Windows GUI runs it via `wsl.exe python3 _MEIPASS/runtime/rpc_server.py`
# over /mnt/<drive>/... — the GUI never needs the `agent-box` CLI in WSL.
if os.path.isdir('build/runtime'):
    datas.append(('build/runtime', 'runtime'))

# The RPC shim + LinuxDataAccess are copied into build/runtime by
# scripts/build-gui-runtime.sh, but the Windows-side pyinstaller walk of the
# 9P-mounted build/ dir can see a stale view and silently miss them (the
# whole runtime is the pip-installed library; only these two live at the
# top level).  Add them as explicit datas from gui-web/ so they are ALWAYS
# bundled regardless of the directory walk.
for _f in ('rpc_server.py', 'data_linux.py'):
    _src = os.path.join('gui-web', _f)
    if os.path.isfile(_src):
        datas.append((_src, 'runtime'))

# PyWebView
tmp_ret = collect_all('webview')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

# PyWebView uses bottle/gevent for the internal server
tmp_ret = collect_all('bottle')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('gevent')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    ['gui-web/bridge.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='agent-box-gui',
    icon='assets/logo.ico',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

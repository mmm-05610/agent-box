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

# Bundle the ACS (cc-switch) submodule release binary when it has been built
# (cargo build --release in acs/) — config.acs_binary() resolves it under
# _MEIPASS at runtime.  Binary name carries the platform extension
# (cc-switch.exe on Windows, cc-switch on Linux/WSL).
_acs_name = 'cc-switch.exe' if sys.platform == 'win32' else 'cc-switch'
_acs_bin = f'acs/src-tauri/target/release/{_acs_name}'
if os.path.isfile(_acs_bin):
    datas.append((_acs_bin, 'acs/src-tauri/target/release'))

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

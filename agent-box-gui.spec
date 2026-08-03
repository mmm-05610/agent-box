# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_all

datas = [
    ('assets/logo.png', '.'),
    ('assets/logo.ico', '.'),
    ('gui-web/dist', 'gui-web/dist'),
]
binaries = []
hiddenimports = []

# Bundle the ACS (cc-switch) submodule release binary when it has been built
# (cargo build --release in acs/) — config.acs_binary() resolves it under
# _MEIPASS at runtime.
_acs_bin = 'acs/src-tauri/target/release/cc-switch'
if os.path.isfile(_acs_bin):
    datas.append((_acs_bin, 'acs/src-tauri/target/release'))

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

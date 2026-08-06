#!/usr/bin/env python3
"""Verify a packaged agent-box-gui.exe actually bundles the WSL RPC runtime.

The Windows GUI runs ``wsl.exe python3 _MEIPASS/runtime/rpc_server.py``; if
the runtime is missing from the exe the app opens but every data call fails
("python3: can't open file .../runtime/rpc_server.py").  The pyinstaller
walk of the 9P-mounted build/runtime dir can silently miss the two top-level
files that scripts/build-gui-runtime.sh copies in (rpc_server.py,
data_linux.py), so this check MUST run before shipping a build.

Also checks the content of the bundled agent_types.json (must carry the
``install`` / ``latest`` fields the Environment page needs) and that the
LINUX cc-switch binary is bundled under runtime/bin/.

Usage:  python3 scripts/verify-exe-runtime.py dist/agent-box-gui.exe
Exit 0 if the runtime is present and complete, 1 otherwise.
"""
import struct
import sys
import zlib

_MAGIC = b'MEI\x0c\x0b\x0a\x0b\x0e'
_COOKIE = struct.Struct('!8sIIII64s')
_COOKIE_LEN = _COOKIE.size
_TOC_HEADER = struct.Struct('!IIIIBc').size

REQUIRED = (
    'runtime/rpc_server.py',
    'runtime/data_linux.py',
    'runtime/agent_box/__init__.py',
    'runtime/agent_box/core/agent_types.json',
    'runtime/bin/cc-switch',  # LINUX ACS binary staged by build-gui-runtime.sh
    'runtime/tomli/__init__.py',  # <3.11 fallback for core/io.py
)
AGENT_TYPES = 'runtime/agent_box/core/agent_types.json'


def _entries(exe_path: str) -> list[dict]:
    data = open(exe_path, 'rb').read()
    i = data.rfind(_MAGIC)
    if i < 0:
        raise SystemExit('not a PyInstaller archive (no COOKIE magic)')
    _m, pkg_len, toc_off, toc_len, _pv, _pl = _COOKIE.unpack(data[i:i + _COOKIE_LEN])
    arch_start = len(data) - pkg_len
    toc = data[arch_start + toc_off:arch_start + toc_off + toc_len]
    try:
        toc = zlib.decompress(toc)
    except Exception:
        pass  # stored uncompressed
    entries: list[dict] = []
    off = 0
    while off + _TOC_HEADER <= len(toc):
        entry_len, data_pos, data_len, uncompressed_len, typecode, _c = struct.unpack_from('!IIIIBc', toc, off)
        if entry_len <= _TOC_HEADER or off + entry_len > len(toc):
            break
        name = toc[off + _TOC_HEADER:off + entry_len].split(b'\x00')[0].decode('utf-8', 'replace')
        entries.append({
            'name': name.replace('\\', '/'),
            'data_pos': data_pos,
            'data_len': data_len,
            'uncompressed_len': uncompressed_len,
            'typecode': typecode,
        })
        off += entry_len
    return entries


def _extract(entries: list[dict], exe_path: str, target: str) -> bytes | None:
    for e in entries:
        if e['name'] != target:
            continue
        data = open(exe_path, 'rb').read()
        start = len(data) - _COOKIE.unpack(data[data.rfind(_MAGIC):data.rfind(_MAGIC) + _COOKIE_LEN])[1]
        raw = data[start + e['data_pos']:start + e['data_pos'] + e['data_len']]
        if e['typecode'] == ord('z'):
            try:
                return zlib.decompress(raw)
            except Exception:
                return None
        return raw
    return None


def main() -> int:
    if len(sys.argv) != 2:
        print(f'usage: {sys.argv[0]} <agent-box-gui.exe>')
        return 2
    exe = sys.argv[1]
    entries = _entries(exe)
    names = [e['name'] for e in entries]
    missing = [r for r in REQUIRED if r not in names]
    runtime_count = sum(1 for n in names if n.startswith('runtime/'))
    print(f'{exe}: {len(names)} entries, {runtime_count} runtime/')
    for r in REQUIRED:
        print(f'  {"OK " if r in names else "MISSING"} {r}')

    # Content check: agent_types.json must carry the install/latest fields.
    at = _extract(entries, exe, AGENT_TYPES)
    if at is None:
        missing.append(f'{AGENT_TYPES} (could not extract)')
    else:
        text = at.decode('utf-8', 'replace')
        ok = '"install"' in text and '"latest"' in text
        print(f'  {"OK " if ok else "STALE"} {AGENT_TYPES} has install/latest fields')
        if not ok:
            missing.append(f'{AGENT_TYPES} lacks install/latest — stale runtime (9P view)')

    if missing:
        print(f'FAIL: runtime incomplete — missing {len(missing)} required item(s)')
        return 1
    print('PASS: WSL runtime fully bundled')
    return 0


if __name__ == '__main__':
    sys.exit(main())

"""C-0067: bounded, private classification of an existing Pi settings warning.

Output is restricted to a scope enum and unique boolean. No input text or paths
are printed. This script never opens settings files.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
import sys


ROOT = Path('/tmp/hd002-bc-pi-rpc.FUlOUH')
EVIDENCE = ROOT / 'cli.stderr'
PROJECT = ROOT / 'empty-project'
EXPECTED_SHA = 'f0098b6801a5b1cc93126fc06e11e41339f3d361cc7e2d4a401be2b84e4d74f4'
EXPECTED_PROBE_SHA = '10e7a127437276a67474dcc4009ab51683d768f4541d7a46e0f91e628d7fda3d'
PREFIX = b'Warning: Invalid settings file '


def private_bytes(path: Path, size: int, digest: str) -> bytes | None:
    fd = None
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        info = os.fstat(fd)
        if not (stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
                and stat.S_IMODE(info.st_mode) == 0o600 and info.st_size == size):
            return None
        data = os.read(fd, size + 1)
        if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
            return None
        return data
    except OSError:
        return None
    finally:
        if fd is not None:
            os.close(fd)


def has_symlink_component(path: Path) -> bool:
    for component in (path, *path.parents):
        try:
            if stat.S_ISLNK(os.lstat(component).st_mode):
                return True
        except FileNotFoundError:
            continue
        except OSError:
            return True
    return False


def classify(data: bytes, global_path: Path | None, project_path: Path | None,
             *, ambiguous: bool = False) -> dict[str, object]:
    unknown = {'scope': 'UNKNOWN', 'unique': False}
    if not data or b'\x1b' in data or b'\r' in data:
        return unknown
    lines = data.removesuffix(b'\n').split(b'\n')
    if len(lines) != 1 or not lines[0].startswith(PREFIX):
        return unknown
    # The outer template is unique even if its path cannot safely be assigned.
    unique = True
    if global_path is None or project_path is None or ambiguous or global_path == project_path:
        return {'scope': 'UNKNOWN', 'unique': unique}
    candidates = []
    for scope, path in (('GLOBAL', global_path), ('PROJECT', project_path)):
        marker = PREFIX + os.fsencode(path) + b': '
        if lines[0].startswith(marker) and len(lines[0]) > len(marker):
            candidates.append(scope)
    return {'scope': candidates[0] if len(candidates) == 1 else 'UNKNOWN',
            'unique': unique}


def self_test() -> None:
    global_path = Path('/synthetic/home/agent/settings.json')
    project_path = Path('/synthetic/project/.pi/settings.json')
    warning = lambda path: PREFIX + os.fsencode(path) + b': fake error FAKE_SECRET\n'
    assert classify(warning(global_path), global_path, project_path) == {'scope': 'GLOBAL', 'unique': True}
    assert classify(warning(project_path), global_path, project_path) == {'scope': 'PROJECT', 'unique': True}
    assert classify(warning(Path('/synthetic/alias/settings.json')), global_path, project_path) == {'scope': 'UNKNOWN', 'unique': True}
    assert classify(warning(global_path), global_path, project_path, ambiguous=True) == {'scope': 'UNKNOWN', 'unique': True}
    assert classify(warning(global_path), None, project_path) == {'scope': 'UNKNOWN', 'unique': True}
    assert classify(warning(global_path) + warning(project_path), global_path, project_path) == {'scope': 'UNKNOWN', 'unique': False}
    assert classify(PREFIX + os.fsencode(global_path) + b':alias: fake error\n', global_path, project_path) == {'scope': 'UNKNOWN', 'unique': True}
    assert classify(warning(global_path) + b'other line\n', global_path, project_path) == {'scope': 'UNKNOWN', 'unique': False}
    print('SELF_TEST_PASS')


def main() -> None:
    self_test()
    # The original C-0036 probe's fixed cwd is authenticated by its prior hash.
    try:
        probe_hash = hashlib.sha256((ROOT / 'rpc_probe.py').read_bytes()).hexdigest()
    except OSError:
        probe_hash = None
    data = private_bytes(EVIDENCE, 147, EXPECTED_SHA)
    global_path = Path.home() / '.pi' / 'agent' / 'settings.json'
    project_path = PROJECT / '.pi' / 'settings.json'
    if data is None or probe_hash != EXPECTED_PROBE_SHA:
        result = {'scope': 'UNKNOWN', 'unique': False}
    else:
        result = classify(data, global_path, project_path,
                          ambiguous=has_symlink_component(global_path)
                          or has_symlink_component(project_path))
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()

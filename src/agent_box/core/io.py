"""Filesystem and data utilities shared across modules.

Pure stdlib (json / os / pathlib) — no third-party deps.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict


def atomic_write_text(path: Path, text: str) -> None:
    """Write *text* to *path* atomically.

    Writes to ``<path>.tmp.<pid>`` in the same directory, fsyncs the
    fd, then ``os.rename`` over the destination. Same-directory rename
    on the same filesystem is atomic on POSIX, so readers never see a
    partial file. Parent dirs are created.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp.{os.getpid()}")
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.rename(tmp, path)
    except Exception:
        # Best-effort cleanup of the tmp file on any failure
        try:
            tmp.unlink()
        except OSError:
            pass
        raise


def atomic_write_json(path: Path, data: Any) -> None:
    """Atomic JSON dump with sorted keys for deterministic output."""
    text = json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    atomic_write_text(path, text)


def deep_merge(base: Dict[str, Any], overlay: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge *overlay* onto *base*.

    Nested dicts merge recursively; lists and scalars from *overlay*
    replace the base's. Standard overlay semantics — overlay wins
    on conflicts, but sibling keys at the same level are preserved.
    Returns a new dict; inputs are not mutated.
    """
    out: Dict[str, Any] = dict(base)
    for k, v in overlay.items():
        if (
            k in out
            and isinstance(out[k], dict)
            and isinstance(v, dict)
        ):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out

"""Open profile files in the user's preferred editor."""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


_EDITOR_CANDIDATES = ["vim", "nvim", "nano", "vi", "emacs"]


def _find_editor() -> str:
    editor = os.environ.get("EDITOR", "")
    if editor and shutil.which(editor):
        return editor
    for cand in _EDITOR_CANDIDATES:
        if shutil.which(cand):
            return cand
    return ""


def open_editor(file_path: Path) -> None:
    editor = _find_editor()
    if not editor:
        print(
            "agent-box: no editor found. Set $EDITOR or install vim/nano.",
            file=sys.stderr,
        )
        sys.exit(2)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    os.execvpe(editor, [editor, str(file_path)], os.environ)

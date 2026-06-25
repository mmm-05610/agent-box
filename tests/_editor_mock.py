"""Test-only helper: replace ``edit.open_editor`` with a no-op.

Used by tests for the add/edit flows of providers and claude_mds that
normally open ``$EDITOR``. We can't drive a real editor in CI, so the
patched function just returns without touching the file.

Two forms are available:

  * ``patch_editor()`` — leaves the tmp file untouched (caller relies
    on whatever the producer wrote as the default).
  * ``patch_editor_with(json_obj)`` / ``patch_editor_with_text(text)`` —
    rewrite the tmp file with the supplied content before "opening",
    so the test controls what the user "saved" in the editor.
"""
from __future__ import annotations

import json
from contextlib import contextmanager
from unittest.mock import patch

from agent_box import edit as edit_mod


@contextmanager
def patch_editor():
    """Make ``open_editor`` a no-op (return without launching the editor)."""
    with patch.object(edit_mod, "open_editor", lambda path: None):
        yield


@contextmanager
def patch_editor_with(data):
    """Rewrite the tmp file as JSON before "opening" the editor."""
    text = json.dumps(data, indent=2, ensure_ascii=False)

    def _stage_and_skip(path):
        path.write_text(text, encoding="utf-8")

    with patch.object(edit_mod, "open_editor", _stage_and_skip):
        yield


@contextmanager
def patch_editor_with_text(text):
    """Rewrite the tmp file with raw text before "opening" the editor."""
    def _stage_and_skip(path):
        path.write_text(text, encoding="utf-8")

    with patch.object(edit_mod, "open_editor", _stage_and_skip):
        yield

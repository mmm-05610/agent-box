"""Markdown editor with toolbar, debounced auto-save, and status indicator.

Used by the Profile detail (CLAUDE.md tab). The editor:

- Loads ``file_path`` on construction (file may not exist yet — that's fine).
- Renders a toolbar with Bold / Italic / Code / Link buttons that wrap or
  insert markdown around the current selection.
- On every text change, schedules a debounced save (1s default). Multiple
  edits within the window collapse into one write.
- Shows a status label that flips through
  ``Idle`` → ``Editing…`` → ``Saving…`` → ``Saved ✓`` / ``Error: <msg>``.

The class is intentionally framework-light so it can be re-used in the
settings page or the creation wizard.
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional, Union

import customtkinter as ctk

from ..theme import C
from ..tokens import (
    FONT_BODY,
    FONT_CAPTION,
    FONT_MICRO,
    FONT_MONO,
    RADIUS_MD,
    SPACE_LG,
    SPACE_MD,
    SPACE_SM,
)
from .button import ghost_button


# Debounce interval in milliseconds — the spec asks for 1s.
SAVE_DEBOUNCE_MS = 1000


class MarkdownEditor(ctk.CTkFrame):
    """Single-file markdown editor with debounced auto-save."""

    def __init__(
        self,
        master,
        file_path: Union[str, Path],
        *,
        on_saved: Optional[Callable[[int], None]] = None,
        on_error: Optional[Callable[[Exception], None]] = None,
        debounce_ms: int = SAVE_DEBOUNCE_MS,
    ):
        super().__init__(master, fg_color=C("bg"))
        self._path = Path(file_path)
        self._on_saved = on_saved
        self._on_error = on_error
        self._debounce_ms = debounce_ms
        self._save_job: Optional[str] = None
        self._suspend_modified = False

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        self._build_toolbar()
        self._build_editor()
        self._build_statusbar()
        self._load()

    # --- layout --------------------------------------------------------

    def _build_toolbar(self) -> None:
        toolbar = ctk.CTkFrame(self, fg_color=C("bg_elevated"), height=40)
        toolbar.grid(row=0, column=0, sticky="ew",
                     padx=0, pady=(0, 1))
        toolbar.grid_columnconfigure(99, weight=1)

        ghost_button(toolbar, "B", self._wrap_bold, width=36, height=28
                     ).grid(row=0, column=0, padx=2, pady=6)
        ghost_button(toolbar, "I", self._wrap_italic, width=36, height=28
                     ).grid(row=0, column=1, padx=2, pady=6)
        ghost_button(toolbar, "</>", self._wrap_code, width=44, height=28
                     ).grid(row=0, column=2, padx=2, pady=6)
        ghost_button(toolbar, "Link", self._insert_link, width=56, height=28
                     ).grid(row=0, column=3, padx=2, pady=6)

        # Path label (right side)
        path_lbl = ctk.CTkLabel(
            toolbar, text=str(self._path), text_color=C("fg_subtle"),
            font=FONT_MICRO, anchor="e",
        )
        path_lbl.grid(row=0, column=99, sticky="e", padx=SPACE_MD)

    def _build_editor(self) -> None:
        self._editor = ctk.CTkTextbox(
            self, font=FONT_MONO, fg_color=C("bg"),
            text_color=C("fg"), corner_radius=0,
            border_width=0, wrap="word",
        )
        self._editor.grid(row=1, column=0, sticky="nsew")
        # CTkTextbox exposes the underlying tk Text via ._text
        self._text = self._editor._text  # type: ignore[attr-defined]
        self._text.bind("<<Modified>>", self._on_modified)
        # Track our own modification flag (CTk's internal one resets
        # after every read, so we layer our own on top).
        self._dirty = False

    def _build_statusbar(self) -> None:
        self._status = ctk.CTkLabel(
            self, text="Idle", text_color=C("fg_subtle"),
            font=FONT_MICRO, anchor="w",
        )
        self._status.grid(row=2, column=0, sticky="ew",
                          padx=SPACE_MD, pady=(2, 0))

    # --- I/O ------------------------------------------------------------

    def _load(self) -> None:
        if self._path.exists() and self._path.is_file():
            try:
                text = self._path.read_text(encoding="utf-8")
            except OSError as exc:
                self._set_status(f"Load error: {exc}", kind="error")
                text = ""
        else:
            text = ""
        self._suspend_modified = True
        self._editor.delete("1.0", "end")
        self._editor.insert("1.0", text)
        self._suspend_modified = False
        self._dirty = False
        self._set_status("Idle", kind="idle")

    def _save_now(self) -> None:
        if not self._dirty:
            return
        self._set_status("Saving…", kind="working")
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(
                self._editor.get("1.0", "end-1c"),
                encoding="utf-8",
            )
        except OSError as exc:
            self._set_status(f"Error: {exc}", kind="error")
            if self._on_error:
                self._on_error(exc)
            return
        self._dirty = False
        self._set_status("Saved ✓", kind="success")
        if self._on_saved:
            self._on_saved(len(self._editor.get("1.0", "end-1c")))

    def _schedule_save(self) -> None:
        if self._save_job is not None:
            try:
                self.after_cancel(self._save_job)
            except Exception:
                pass
        self._save_job = self.after(self._debounce_ms, self._save_now)

    def _flush(self) -> None:
        """Cancel any pending debounce and save immediately."""
        if self._save_job is not None:
            try:
                self.after_cancel(self._save_job)
            except Exception:
                pass
            self._save_job = None
        self._save_now()

    # --- events --------------------------------------------------------

    def _on_modified(self, _event) -> None:
        if self._suspend_modified:
            # Reset Tk's modified flag without acting on it
            self._text.edit_modified(False)
            return
        if not self._dirty:
            self._dirty = True
            self._set_status("Editing…", kind="working")
        # Reset Tk's modified flag so the next change fires again
        self._text.edit_modified(False)
        self._schedule_save()

    def destroy(self) -> None:  # type: ignore[override]
        # Flush any pending edits before teardown so the user doesn't
        # lose work by switching tabs / closing the window.
        try:
            self._flush()
        except Exception:
            pass
        super().destroy()

    # --- toolbar actions ----------------------------------------------

    def _wrap_selection(self, marker: str) -> None:
        """Wrap the current selection (or insert a marker) with ``marker``.

        If selection is empty, inserts ``marker marker`` and places the
        caret between the two halves.
        """
        try:
            sel_start = self._text.index("sel.first")
            sel_end = self._text.index("sel.last")
            has_sel = True
        except Exception:
            sel_start = self._text.index("insert")
            sel_end = sel_start
            has_sel = False
        if has_sel:
            original = self._text.get(sel_start, sel_end)
            self._text.delete(sel_start, sel_end)
            self._text.insert(sel_start, f"{marker}{original}{marker}")
        else:
            self._text.insert("insert", f"{marker}{marker}")
            # Move caret to the middle
            line, col = sel_start.split(".")
            new_col = int(col) + len(marker)
            self._text.mark_set("insert", f"{line}.{new_col}")

    def _wrap_bold(self) -> None:
        self._wrap_selection("**")

    def _wrap_italic(self) -> None:
        self._wrap_selection("*")

    def _wrap_code(self) -> None:
        # Single line → inline `code`; multi-line → fenced block
        try:
            sel_start = self._text.index("sel.first")
            sel_end = self._text.index("sel.last")
        except Exception:
            sel_start = sel_end = self._text.index("insert")
        if sel_start == sel_end:
            self._wrap_selection("`")
            return
        text = self._text.get(sel_start, sel_end)
        if "\n" in text:
            self._text.delete(sel_start, sel_end)
            self._text.insert(sel_start, f"```\n{text}\n```")
        else:
            self._text.delete(sel_start, sel_end)
            self._text.insert(sel_start, f"`{text}`")

    def _insert_link(self) -> None:
        try:
            sel_start = self._text.index("sel.first")
            sel_end = self._text.index("sel.last")
            label = self._text.get(sel_start, sel_end) or "text"
            has_sel = True
        except Exception:
            label = "text"
            sel_start = sel_end = self._text.index("insert")
            has_sel = False
        insert = f"[{label}](url)"
        if has_sel:
            self._text.delete(sel_start, sel_end)
        self._text.insert(sel_start, insert)
        # Select "url" so the user can type to replace it
        url_start = f"{sel_start}+{len(label) + 3}c"
        url_end = f"{sel_start}+{len(label) + 6}c"
        self._text.tag_add("sel", url_start, url_end)

    # --- status helpers -----------------------------------------------

    def _set_status(self, text: str, *, kind: str = "idle") -> None:
        color_key = {
            "idle":    "fg_subtle",
            "working": "warning",
            "success": "success",
            "error":   "error",
        }.get(kind, "fg_subtle")
        self._status.configure(text=text, text_color=C(color_key))


__all__ = ["MarkdownEditor", "SAVE_DEBOUNCE_MS"]
"""Bottom-right transient notification stack."""
from __future__ import annotations

from typing import List, Optional, Tuple

import customtkinter as ctk

from ..theme import C
from ..tokens import FONT_BODY, FONT_CAPTION, RADIUS_LG


class ToastManager:
    """Manages stacked toasts in the bottom-right corner."""

    def __init__(self, root: ctk.CTk):
        self.root = root
        self._toasts: List[Tuple[ctk.CTkToplevel, Optional[str]]] = []

    def show(self, message: str, kind: str = "info",
             duration_ms: Optional[int] = None) -> None:
        if duration_ms is None:
            duration_ms = {
                "info": 3000, "success": 4000, "error": 6000, "warning": 5000,
            }[kind]

        kind_colors = {
            "info":    C("accent"),
            "success": C("success"),
            "error":   C("error"),
            "warning": C("warning"),
        }
        kind_icons = {"info": "ℹ", "success": "✓", "error": "✗", "warning": "⚠"}

        toast = ctk.CTkToplevel(self.root)
        toast.overrideredirect(True)
        toast.attributes("-topmost", True)
        toast.configure(fg_color=C("surface"))

        x, y = self._position(len(self._toasts))
        toast.geometry(f"380x56+{x}+{y}")

        frame = ctk.CTkFrame(
            toast, fg_color=C("surface"),
            corner_radius=RADIUS_LG, border_width=1, border_color=kind_colors[kind],
        )
        frame.pack(fill="both", expand=True)

        icon_lbl = ctk.CTkLabel(
            frame, text=kind_icons[kind], text_color=kind_colors[kind],
            font=FONT_BODY, width=20,
        )
        icon_lbl.pack(side="left", padx=(12, 8))

        msg_lbl = ctk.CTkLabel(
            frame, text=message, text_color=C("fg"),
            font=FONT_CAPTION, anchor="w",
        )
        msg_lbl.pack(side="left", fill="x", expand=True)

        close_btn = ctk.CTkButton(
            frame, text="✕", width=24, height=24,
            fg_color="transparent", hover_color=C("bg_hover"),
            text_color=C("fg_muted"),
            command=lambda: self._dismiss(toast),
        )
        close_btn.pack(side="right", padx=(0, 8))

        self._toasts.append((toast, None))
        aid = self.root.after(duration_ms, lambda: self._dismiss(toast))
        self._toasts[-1] = (toast, aid)

    def _position(self, count: int) -> Tuple[int, int]:
        self.root.update_idletasks()
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        x = screen_w - 380 - 20
        y = screen_h - 80 - count * 64
        return x, y

    def _dismiss(self, toast: ctk.CTkToplevel) -> None:
        for w, aid in self._toasts:
            if w is toast:
                if aid:
                    self.root.after_cancel(aid)
                try:
                    w.destroy()
                except Exception:
                    pass
                self._toasts.remove((w, aid))
                break
        # Re-stack remaining
        for i, (w, _) in enumerate(self._toasts):
            x, y = self._position(i)
            w.geometry(f"+{x}+{y}")
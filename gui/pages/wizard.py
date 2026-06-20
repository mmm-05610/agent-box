"""Profile creation wizard — 4-step flow.

Step 1: Choose Agent Type
Step 2: Basic Info (name + display name + description)
Step 3: Choose Provider (uses ``ProviderSelector``)
Step 4: CLAUDE.md Template (blank / decision-writer / spec-writer)

The wizard emits ``on_finish(payload)`` with the collected data and
``on_cancel()`` when the user backs out. Validation is per-step — the
Next button stays disabled until the current step's required fields are
populated.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

import customtkinter as ctk

from ..components.button import (
    ghost_button,
    primary_button,
)
from ..components.card import Card
from ..components.provider import PROVIDERS, ProviderSelector
from ..components.toast import ToastManager
from ..theme import C
from ..tokens import (
    FONT_BODY,
    FONT_BOLD,
    FONT_CAPTION,
    FONT_DISPLAY,
    FONT_LABEL,
    FONT_MONO_SMALL,
    FONT_SUBTITLE,
    RADIUS_LG,
    RADIUS_MD,
    SPACE_2XL,
    SPACE_LG,
    SPACE_MD,
    SPACE_SM,
    SPACE_XL,
)
from ..wsl import AGENT_ORDER


# ---------------------------------------------------------------------------
# Step definitions
# ---------------------------------------------------------------------------

AGENT_TYPE_CARDS: List[Dict[str, str]] = [
    {"key": "cc",       "title": "CC",       "sub": "Claude Code"},
    {"key": "codex",    "title": "Codex",    "sub": "OpenAI"},
    {"key": "hermes",   "title": "Hermes",   "sub": "Custom"},
    {"key": "opencode", "title": "OpenCode", "sub": "Multi"},
]

CLAUDE_MD_TEMPLATES: List[Dict[str, str]] = [
    {"key": "blank",    "title": "Blank",
     "sub": "Start from scratch"},
    {"key": "decision", "title": "Decision Writer",
     "sub": "Multi-step decision orchestration"},
    {"key": "spec",     "title": "Spec Writer",
     "sub": "Technical specification author"},
]

# Minimal markdown skeletons — Phase 4.5 ships with stubs; richer
# templates can be added later.
CLAUDE_MD_BODIES: Dict[str, str] = {
    "blank":    "# Profile: <name>\n\nDescribe this agent's purpose, "
                "scope, and any conventions.\n",
    "decision": "# Decision Writer\n\nMulti-step decision orchestration "
                "agent. Breaks ambiguous goals into ordered sub-tasks, "
                "gates each step on user confirmation, and never "
                "commits destructive actions without explicit approval.\n",
    "spec":     "# Spec Writer\n\nTechnical specification author. "
                "Writes docs/specs/*.md in the project's standard "
                "format (Goal, Architecture, Tech Stack, Task Plan, "
                "Acceptance Criteria).\n",
}


# ---------------------------------------------------------------------------
# Per-step frames
# ---------------------------------------------------------------------------

class _StepFrame(ctk.CTkFrame):
    """Base class for wizard steps. Tracks Next-button enablement."""

    def __init__(self, master, on_validity_change: Callable[[bool], None]):
        super().__init__(master, fg_color="transparent")
        self._on_validity = on_validity_change
        self._valid = False

    def is_valid(self) -> bool:
        return self._valid

    def _set_valid(self, valid: bool) -> None:
        if valid != self._valid:
            self._valid = valid
            self._on_validity(valid)

    def collect(self) -> Dict[str, Any]:
        """Override in subclasses. Return a dict of collected fields."""
        return {}


class _AgentTypeStep(_StepFrame):
    def __init__(self, master, on_validity_change):
        super().__init__(master, on_validity_change)
        self._selected: Optional[str] = None
        self._cards: Dict[str, ctk.CTkFrame] = {}

        self.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            self, text="Choose the agent type for this profile.",
            text_color=C("fg_muted"), font=FONT_BODY, anchor="w",
        ).grid(row=0, column=0, sticky="ew", pady=(0, SPACE_LG))

        # 2x2 grid of selectable cards
        for i, card_data in enumerate(AGENT_TYPE_CARDS):
            row, col = divmod(i, 2)
            self.grid_columnconfigure(col * 2 + 1, weight=1)
            card = self._make_card(card_data, on_select=self._on_select)
            card.grid(row=1 + row, column=col * 2, sticky="nsew",
                      padx=(0, SPACE_MD) if col == 0 else 0,
                      pady=(0, SPACE_MD))

    def _make_card(self, data: Dict[str, str],
                   on_select: Callable[[str], None]) -> ctk.CTkFrame:
        card = Card(self)
        card.grid_columnconfigure(0, weight=1)
        card.bind("<Button-1>", lambda _e, k=data["key"]: on_select(k))
        title = ctk.CTkLabel(
            card, text=data["title"], text_color=C("fg"),
            font=FONT_DISPLAY, anchor="w",
        )
        title.grid(row=0, column=0, sticky="w",
                   padx=SPACE_LG, pady=(SPACE_LG, 2))
        sub = ctk.CTkLabel(
            card, text=data["sub"], text_color=C("fg_muted"),
            font=FONT_BODY, anchor="w",
        )
        sub.grid(row=1, column=0, sticky="w",
                 padx=SPACE_LG, pady=(0, SPACE_LG))
        for w in (title, sub):
            w.bind("<Button-1>", lambda _e, k=data["key"]: on_select(k))
        self._cards[data["key"]] = card
        return card

    def _on_select(self, key: str) -> None:
        for k, card in self._cards.items():
            card.configure(
                border_color=C("primary") if k == key else C("border"),
            )
        self._selected = key
        self._set_valid(True)

    def collect(self) -> Dict[str, Any]:
        return {"agent_type": self._selected} if self._selected else {}


class _BasicInfoStep(_StepFrame):
    def __init__(self, master, on_validity_change):
        super().__init__(master, on_validity_change)
        self.grid_columnconfigure(0, weight=1)

        fields: List[tuple] = [
            ("Name*",        "name",         "e.g. dw",           True),
            ("Display Name", "display_name", "e.g. Decision Writer", False),
            ("Description",  "description",  "What this agent does", False),
        ]
        self._vars: Dict[str, ctk.StringVar] = {}
        for r, (label, key, placeholder, required) in enumerate(fields):
            lbl = ctk.CTkLabel(
                self, text=label, text_color=C("fg_muted"),
                font=FONT_LABEL, anchor="w",
            )
            lbl.grid(row=r * 2, column=0, sticky="w", pady=(0, SPACE_XS))
            var = ctk.StringVar()
            entry = ctk.CTkEntry(
                self, textvariable=var,
                placeholder_text=placeholder,
                font=FONT_MONO_SMALL, height=36,
                fg_color=C("bg_elevated"),
                border_color=C("border"), border_width=1,
                corner_radius=RADIUS_MD,
            )
            entry.grid(row=r * 2 + 1, column=0, sticky="ew",
                       pady=(0, SPACE_MD))
            if required:
                var.trace_add("write", lambda *_: self._recheck())
            self._vars[key] = var

    def _recheck(self) -> None:
        name = self._vars["name"].get().strip()
        # Simple availability check — non-empty, only letters/digits/underscore/dash
        ok = bool(name) and all(c.isalnum() or c in "-_" for c in name)
        self._set_valid(ok)

    def collect(self) -> Dict[str, Any]:
        return {k: v.get().strip() for k, v in self._vars.items()}


class _ProviderStep(_StepFrame):
    def __init__(self, master, on_validity_change):
        super().__init__(master, on_validity_change)
        self._selector = ProviderSelector(
            self, current="anthropic", on_change=lambda _k: self._set_valid(True),
        )
        self._selector.grid(row=0, column=0, sticky="ew")
        self._set_valid(True)  # default selection is valid

    def collect(self) -> Dict[str, Any]:
        return {"provider": self._selector.get()}


class _TemplateStep(_StepFrame):
    def __init__(self, master, on_validity_change):
        super().__init__(master, on_validity_change)
        self._selected: Optional[str] = None
        self._cards: Dict[str, ctk.CTkFrame] = {}

        self.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            self, text="Pick a starting template for CLAUDE.md.",
            text_color=C("fg_muted"), font=FONT_BODY, anchor="w",
        ).grid(row=0, column=0, sticky="ew", pady=(0, SPACE_LG))

        for i, tpl in enumerate(CLAUDE_MD_TEMPLATES):
            card = self._make_card(tpl, on_select=self._on_select)
            card.grid(row=i + 1, column=0, sticky="ew",
                      pady=(0, SPACE_SM))
        self._set_valid(True)  # "blank" is the default and always valid

    def _make_card(self, data: Dict[str, str],
                   on_select: Callable[[str], None]) -> ctk.CTkFrame:
        card = Card(self)
        card.grid_columnconfigure(0, weight=1)
        title = ctk.CTkLabel(
            card, text=data["title"], text_color=C("fg"),
            font=FONT_SUBTITLE, anchor="w",
        )
        title.grid(row=0, column=0, sticky="w",
                   padx=SPACE_LG, pady=(SPACE_LG, 2))
        sub = ctk.CTkLabel(
            card, text=data["sub"], text_color=C("fg_muted"),
            font=FONT_CAPTION, anchor="w",
        )
        sub.grid(row=1, column=0, sticky="w",
                 padx=SPACE_LG, pady=(0, SPACE_LG))
        for w in (card, title, sub):
            w.bind("<Button-1>", lambda _e, k=data["key"]: on_select(k))
        self._cards[data["key"]] = card
        # Default: blank
        if data["key"] == "blank":
            card.configure(border_color=C("primary"))
        return card

    def _on_select(self, key: str) -> None:
        for k, card in self._cards.items():
            card.configure(
                border_color=C("primary") if k == key else C("border"),
            )
        self._selected = key

    def collect(self) -> Dict[str, Any]:
        return {"claude_md_template": self._selected or "blank"}


# ---------------------------------------------------------------------------
# Wizard
# ---------------------------------------------------------------------------

class CreationWizard(ctk.CTkFrame):
    """Modal-feeling 4-step creation wizard.

    Note: this lives inside the content area, not a Toplevel. A
    real modal overlay is a Phase 4.x follow-up; for now the wizard
    is full-bleed and exposes Back / Next / Create.
    """

    STEPS: List[tuple] = [
        ("meta",       _AgentTypeStep,  "Choose Agent Type"),
        ("info",       _BasicInfoStep,  "Basic Info"),
        ("provider",   _ProviderStep,   "Choose Provider"),
        ("template",   _TemplateStep,   "CLAUDE.md Template"),
    ]

    def __init__(
        self,
        master,
        toast: ToastManager,
        on_finish: Callable[[Dict[str, Any]], None],
        on_cancel: Callable[[], None],
    ):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        self._toast = toast
        self._on_finish = on_finish
        self._on_cancel = on_cancel
        self._step_index = 0
        self._data: Dict[str, Any] = {}
        self._step_frames: List[_StepFrame] = []

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        self._build_header()
        self._build_body()
        self._build_footer()
        self._show_step(0)

    # --- header --------------------------------------------------------

    def _build_header(self) -> None:
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.grid(row=0, column=0, sticky="ew",
                    padx=SPACE_2XL, pady=(SPACE_2XL, SPACE_MD))
        header.grid_columnconfigure(0, weight=1)

        title = ctk.CTkLabel(
            header, text="Create new profile",
            text_color=C("fg"), font=FONT_DISPLAY, anchor="w",
        )
        title.grid(row=0, column=0, sticky="w")

        self._step_lbl = ctk.CTkLabel(
            header, text="", text_color=C("fg_muted"),
            font=FONT_CAPTION, anchor="w",
        )
        self._step_lbl.grid(row=1, column=0, sticky="w", pady=(2, 0))

    # --- body ----------------------------------------------------------

    def _build_body(self) -> None:
        self._body = ctk.CTkFrame(self, fg_color=C("bg"), corner_radius=0)
        self._body.grid(row=2, column=0, sticky="nsew",
                        padx=SPACE_2XL, pady=(0, SPACE_MD))
        self._body.grid_columnconfigure(0, weight=1)
        self._body.grid_rowconfigure(0, weight=1)

    def _build_footer(self) -> None:
        footer = ctk.CTkFrame(self, fg_color="transparent")
        footer.grid(row=3, column=0, sticky="ew",
                    padx=SPACE_2XL, pady=(0, SPACE_2XL))
        footer.grid_columnconfigure(0, weight=1)

        # Back (left)
        self._back_btn = ghost_button(
            footer, "←  Back", command=self._go_back, width=110, height=36,
        )
        self._back_btn.grid(row=0, column=0, sticky="w")

        # Next / Create (right)
        self._next_btn = primary_button(
            footer, "Next  →", command=self._go_next,
            width=130, height=36,
        )
        self._next_btn.grid(row=0, column=99, sticky="e")

    # --- navigation ----------------------------------------------------

    def _show_step(self, index: int) -> None:
        self._step_index = index
        # Tear down the previous step frame
        for frame in self._step_frames:
            frame.destroy()
        self._step_frames.clear()

        # Instantiate the new step
        key, cls, title = self.STEPS[index]
        frame = cls(self._body, on_validity_change=self._on_validity)
        frame.grid(row=0, column=0, sticky="nsew")
        self._step_frames.append(frame)

        # Update step header
        self._step_lbl.configure(
            text=f"Step {index + 1} of {len(self.STEPS)}: {title}",
        )

        # Update button states
        self._back_btn.configure(state="disabled" if index == 0 else "normal")
        is_last = (index == len(self.STEPS) - 1)
        self._next_btn.configure(text="Create Profile" if is_last else "Next  →")

        # Reflect current validity
        self._on_validity(frame.is_valid())

    def _on_validity(self, valid: bool) -> None:
        if valid:
            self._next_btn.configure(state="normal")
        else:
            self._next_btn.configure(state="disabled")

    def _go_back(self) -> None:
        if self._step_index == 0:
            return
        # Save current step data even when going back
        self._collect_current()
        self._show_step(self._step_index - 1)

    def _go_next(self) -> None:
        if not self._step_frames:
            return
        if not self._step_frames[0].is_valid():
            return
        self._collect_current()
        if self._step_index == len(self.STEPS) - 1:
            self._finish()
            return
        self._show_step(self._step_index + 1)

    def _collect_current(self) -> None:
        if not self._step_frames:
            return
        self._data.update(self._step_frames[0].collect())

    def _finish(self) -> None:
        payload = dict(self._data)
        # If the user picked a template, expand it into a CLAUDE.md body
        tpl = payload.pop("claude_md_template", "blank")
        payload["claude_md"] = CLAUDE_MD_BODIES.get(tpl, CLAUDE_MD_BODIES["blank"])
        self._toast.show(
            f"Profile '{payload.get('name', '?')}' created "
            f"({payload.get('agent_type', '?')})",
            kind="success",
        )
        self._on_finish(payload)


__all__ = ["CreationWizard"]
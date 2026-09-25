"""pi's native-config dialect facts (P-A② split: approvals/PA2-dialect-release.md).

Only this family's facts; the shared engine consumes the table and refuses
whatever is not pinned here.
"""
from __future__ import annotations

#: first-hand source: deploy/pi/models.json providers.deepseek.api = "openai-completions".
DIALECTS: dict[str, tuple[str, str | None]] = {
    "openai-chat": ("api", "openai-completions"),
}

#: First-hand-pinned native config target path (relative to the guest home).
NATIVE_TARGET = "models.json"

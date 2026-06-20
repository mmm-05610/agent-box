"""One-shot CC API key importer from cc-switch SQLite DB.

Reads CC providers (app_type='claude') from the cc-switch database and
writes their ANTHROPIC_AUTH_TOKEN into agent-box's user_overrides table
keyed by the matching built-in provider id.

This is a one-time migration helper. After the keys are seeded, the
script has no further role — the agent-box component set command is
the normal path for future changes.
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

CCSWITCH_DB = Path("/mnt/c/Users/maoqh/.cc-switch/cc-switch.db")

# cc-switch model name -> agent-box built-in provider id
MODEL_TO_PROVIDER = {
    "deepseek-v4-pro": "deepseek",
    "mimo-v2.5-pro": "mimo",
    "glm-5.1": "glm",
    "MiniMax-M3": "minimax",
}


def import_keys() -> int:
    """Read keys from cc-switch and write them into agent-box.

    Returns the number of keys successfully imported.
    """
    if not CCSWITCH_DB.is_file():
        print(f"ERROR: cc-switch DB not found: {CCSWITCH_DB}", file=sys.stderr)
        return 0

    src = sqlite3.connect(str(CCSWITCH_DB))
    src.row_factory = sqlite3.Row

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
    from agent_box.library import set_override  # noqa: E402

    count = 0
    for r in src.execute(
        "SELECT id, name, settings_config FROM providers WHERE app_type='claude'"
    ).fetchall():
        try:
            sc = json.loads(r["settings_config"])
        except (TypeError, json.JSONDecodeError):
            print(f"SKIP {r['name']}: settings_config not valid JSON")
            continue

        env = sc.get("env", {}) or {}
        key = env.get("ANTHROPIC_AUTH_TOKEN", "") or ""
        model = env.get("ANTHROPIC_MODEL", "") or ""

        if not key or key.startswith("sk-REPLACE"):
            print(f"SKIP {r['name']}: missing or placeholder key")
            continue

        provider_id = MODEL_TO_PROVIDER.get(model)
        if not provider_id:
            print(f"SKIP {r['name']}: model={model!r} not in mapping")
            continue

        set_override("provider", provider_id, "env.ANTHROPIC_AUTH_TOKEN", key)
        print(f"IMPORTED {r['name']} -> {provider_id} (model={model})")
        count += 1

    src.close()
    print(f"Done: {count} keys imported")
    return count


if __name__ == "__main__":
    import_keys()

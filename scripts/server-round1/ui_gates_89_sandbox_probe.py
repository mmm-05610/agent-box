#!/usr/bin/env python3
"""Order 089 - sandbox probe: one command that separates "not registered" from "registered, fails deeper".

Why this exists: QA's second run of the Windows leg (`docs/qa/windows-leg-89-r2.md` §2) hit two gaps in this
tree's own recipe. Gap 1 was `SANDBOX_PROVIDER_UNRESOLVED: … serves sandbox provider 'sandbox-windows'`.
They added the plugin path **and** the module variable, saw the module import with a factory, and the send
still failed - this time with no traceback. That is the question this script answers in one go, on the
machine that actually runs the Server, with the same environment the Server got.

Measured in this tree (Linux side, 01:2x) so the expectations below are not guesses:

| configuration | `resolve_sandbox_port("sandbox-windows")` |
| --- | --- |
| `PYTHONPATH=src` | `SANDBOX_PROVIDER_UNRESOLVED` (the recipe's old shape) |
| `PYTHONPATH=src:plugins/agent-box-sandbox-windows/src` | **still** `SANDBOX_PROVIDER_UNRESOLVED` - a source path is not an installed entry point |
| same + `AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_windows` | **resolves** to `agent_box_sandbox_windows.provider.WindowsSandboxPort` |

So the module variable is the load-bearing half, and "it imports" proves nothing about resolution.

    python ui_gates_89_sandbox_probe.py                 # what the Server's env actually resolves to
    python ui_gates_89_seed_profile.py --help          # unrelated; the seed leg lives there

Exit codes: 0 = resolution succeeded (then look at stage 2's room-creation verdict), 3 = unresolved
(prints exactly which of the three routes fell empty), 4 = both stages fine but the tree's own
counter-example disagreeing (a contradiction worth reporting rather than fixing locally).
"""
from __future__ import annotations

import argparse
import importlib.metadata as metadata
import json
import os
import sys
from pathlib import Path

#: The provider a Windows-side Server must resolve; a WSL-side one wants `sandbox-bwrap`.
DEFAULT_PROVIDER = "sandbox-windows" if os.name == "nt" else "sandbox-bwrap"
COUNTER_EXAMPLE_PROVIDER = "sandbox-windows"


def _routes(name: str) -> dict:
    """What each of the resolver's three routes can see, before calling it."""
    normalized = name.strip().lower().replace("-", "_")
    try:
        entry_points = [entry.value for entry in
                        metadata.entry_points(group="agent_box.plugins")
                        if entry.name == normalized]
    except Exception as exc:  # noqa: BLE001 - a broken metadata dir is itself the finding
        entry_points = [f"<error {type(exc).__name__}: {exc}>"]
    configured = os.environ.get("AGENT_BOX_SANDBOX_MODULE")
    module_importable = None
    if configured:
        try:
            module = __import__(configured)
            module_importable = {
                "file": str(getattr(module, "__file__", "?")),
                "hasFactory": any(hasattr(module, attr) for attr in
                                  ("create_sidecar_room_port", "create_room_port", "factory")),
                "declaresProvider": getattr(module, "provider", None) is not None,
            }
        except Exception as exc:  # noqa: BLE001
            module_importable = {"error": f"{type(exc).__name__}: {exc}"}
    return {"requested": name, "normalized": normalized,
            "installedEntryPoint": entry_points or None,
            "AGENT_BOX_SANDBOX_MODULE": configured, "moduleProbe": module_importable,
            "pythonPathEntries": [part for part in (os.environ.get("PYTHONPATH") or "").split(os.pathsep) if part]}


def _resolve(name: str) -> dict:
    try:
        from agent_box.extensions.runtime_composition.sandbox_port import resolve_sandbox_port
    except Exception as exc:  # noqa: BLE001
        return {"stage": "import-resolver", "error": f"{type(exc).__name__}: {exc}"}
    try:
        port = resolve_sandbox_port(name)
    except Exception as exc:  # noqa: BLE001
        return {"stage": "resolve", "error": f"{type(exc).__name__}: {exc}",
                "code": getattr(exc, "code", None)}
    return {"stage": "resolve", "resolved": f"{type(port).__module__}.{type(port).__name__}"}


def _room_attempt(name: str) -> dict:
    """Stage 2: the resolved port's own cheap self-reports - where QA's second failure lives.

    The port surface is `provider_id` / `descriptor_id()` / `probe()` / `declaration_document(...)`
    / `compose_sidecar_room(request)` (introspected, not assumed). `compose_sidecar_room` needs a
    real request object, so the self-reports are what a runner can call without inventing one;
    a raise here means resolution was fine and the failure sits deeper - which is the split
    `windows-leg-89-r2.md` §2 left open.
    """
    try:
        from agent_box.extensions.runtime_composition.sandbox_port import resolve_sandbox_port
        port = resolve_sandbox_port(name)
    except Exception as exc:  # noqa: BLE001
        return {"skipped": f"resolve failed first: {type(exc).__name__}: {exc}"}
    report: dict = {"providerId": getattr(port, "provider_id", None)}
    for label, call in (("descriptorId", lambda: port.descriptor_id()),
                        ("probe", lambda: port.probe()),
                        ("declaration", lambda: port.declaration_document(
                            readonly_targets=[], writable_targets=[],
                            environment_binding="none", observed_at=0))):
        try:
            value = call()
            report[label] = value if isinstance(value, (str, int, float, bool)) else \
                {key: str(item)[:120] for key, item in list(dict(value).items())[:6]} \
                if isinstance(value, dict) else str(value)[:200]
        except Exception as exc:  # noqa: BLE001
            report[f"{label}Failed"] = f"{type(exc).__name__}: {exc}"[:300]
            report[f"{label}Code"] = getattr(exc, "code", None)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--provider", default=DEFAULT_PROVIDER,
                        help=f"default on this platform: {DEFAULT_PROVIDER}")
    parser.add_argument("--counter-example", action="store_true",
                        help="also resolve a provider the env must NOT be able to serve, "
                             "to prove the probe can say 'unresolved'")
    options = parser.parse_args(argv)

    report = {"platform": {"os": os.name, "pid": os.getpid()},
              "routes": _routes(options.provider),
              "resolve": _resolve(options.provider),
              "roomAttempt": _room_attempt(options.provider)}

    if options.counter_example:
        # The probe must be falsifiable: with the module variable pointing at one provider,
        # asking for a *different* one has to come back unresolved, or "resolved" means nothing.
        report["counterExample"] = _resolve(COUNTER_EXAMPLE_PROVIDER) if options.provider != COUNTER_EXAMPLE_PROVIDER \
            else _resolve("sandbox-bwrap")
        resolved_other = (report["counterExample"].get("resolved") is not None)
        if resolved_other and report["resolve"].get("error") is not None:
            print(json.dumps(report, indent=1, ensure_ascii=False))
            print("PROBE_CONTRADICTION: the counter-example resolved while the request did not")
            return 4

    print(json.dumps(report, indent=1, ensure_ascii=False))
    if report["resolve"].get("error") is not None:
        print("SANDBOX_PROBE=UNRESOLVED  (set AGENT_BOX_SANDBOX_MODULE; a PYTHONPATH entry alone is not enough)")
        return 3
    print(f"SANDBOX_PROBE=RESOLVED -> {report['resolve']['resolved']}")
    return 0


if __name__ == "__main__":
    # Runnable straight from a checkout (`python src/.../ui_gates_89_sandbox_probe.py`) without
    # installing anything: the resolver lives under this tree's `src`.
    _tree = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(_tree / "src"))
    sys.exit(main())

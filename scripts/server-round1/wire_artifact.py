#!/usr/bin/env python3
"""Order 113: publish the Server's own wire inventory, and compare it - by name -
against the locked contract.

Why a second document exists. The frontend's `wire-v1.schema.json` is the locked
contract: it carries a JSON Schema for every method's params *and* result, and
the desktop regenerates it from its own types. This tree has never been able to
generate that, so the only "backend artifact" it had was a *copy* of the
frontend's file - which is exactly how a stale copy earns the right to be
believed. This script publishes what the Server can attest to from its own
source, and nothing more:

  * the method set the dispatcher will actually route,
  * the handler attribute each method is routed to,
  * the required/optional parameter names the Server's own shape gate enforces.

It does *not* declare result shapes; `result` is the frontend's authority and
every entry here says `"undeclared"` so nobody reads silence as agreement.

The comparison is the point: `--compare <contract path>` lists, by name, where
the two disagree. A path is always explicit - there is no default artifact,
because a default is how one tree's copy got treated as another tree's truth.

    python3 scripts/server-round1/wire_artifact.py --print-digest
    python3 scripts/server-round1/wire_artifact.py --write docs/.../inventory.json
    python3 scripts/server-round1/wire_artifact.py --check docs/.../inventory.json
    python3 scripts/server-round1/wire_artifact.py --compare docs/.../contract.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import wire_drive_coverage as scan  # noqa: E402

PROTOCOL_VERSION = "wire/1"
KIND = "agent-box-server.wire-inventory"


def build() -> dict:
    """The inventory the Server can attest to, derived from its own source.

    Method order is the dispatch table's own order, so the document is stable
    while the table is stable and shifts visibly when it does not; every set
    inside it is sorted, because "required" is a set in the source and an
    unsorted dump would give a different digest on every run.
    """
    shapes = scan.param_shapes()
    methods = {}
    for method, handler in scan.dispatch_pairs():
        required, optional = shapes.get(method, (set(), set()))
        methods[method] = {
            "handler": handler,
            "params": {"required": sorted(required), "optional": sorted(optional)},
            "result": {"declared": False, "authority": "contract"},
        }
    return {
        "$schemaKind": KIND,
        "$protocolVersion": PROTOCOL_VERSION,
        "generatedBy": "scripts/server-round1/wire_artifact.py",
        "source": {"repository": "agent-box-env-provider",
                   "dispatchTable": str(scan.HANDLERS.relative_to(scan.ROOT))},
        "methodCount": len(methods),
        "methods": methods,
    }


def render(document: dict) -> str:
    return json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def compare(inventory: dict, contract: dict) -> dict:
    """Name every disagreement. An empty list per axis means the two agree
    *on that axis*, not that the contract is implemented."""
    mine = set(inventory["methods"])
    theirs = {key[: -len("#params")] for key in contract if key.endswith("#params")}
    required_drift, optional_drift = [], []
    for method in sorted(mine & theirs):
        entry = inventory["methods"][method]
        schema = contract.get(f"{method}#params") or {}
        theirs_required = set(schema.get("required") or [])
        theirs_properties = set(schema.get("properties") or {})
        if set(entry["params"]["required"]) != theirs_required:
            required_drift.append({
                "method": method,
                "serverOnly": sorted(set(entry["params"]["required"]) - theirs_required),
                "contractOnly": sorted(theirs_required - set(entry["params"]["required"])),
            })
        if set(entry["params"]["optional"]) - theirs_properties:
            optional_drift.append({
                "method": method,
                "serverAcceptsButContractDoesNotDeclare": sorted(
                    set(entry["params"]["optional"]) - theirs_properties),
            })
    return {
        "methodsOnlyInServer": sorted(mine - theirs),
        "methodsOnlyInContract": sorted(theirs - mine),
        "requiredSetDrift": required_drift,
        "optionalNotInContract": optional_drift,
    }


def _inside_repository(path: pathlib.Path) -> pathlib.Path:
    """Every artifact path is explicit and stays inside this repository: this
    tool's job includes refusing to be the thing that quietly edits someone
    else's tree. The settings line's contract is compared by reading a copy that
    its owner delivered here, never by writing there."""
    resolved = path.resolve() if path.is_absolute() else (scan.ROOT / path).resolve()
    try:
        resolved.relative_to(scan.ROOT)
    except ValueError:
        raise SystemExit(f"refusing to touch a path outside this repository: {resolved}")
    return resolved


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--print-digest", action="store_true")
    parser.add_argument("--write", type=pathlib.Path)
    parser.add_argument("--check", type=pathlib.Path)
    parser.add_argument("--compare", type=pathlib.Path)
    arguments = parser.parse_args()

    text = render(build())
    if arguments.write:
        target = _inside_repository(arguments.write)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        print(f"wrote {target.relative_to(scan.ROOT)} ({digest(text)[:16]}…)")
    if arguments.print_digest:
        print(digest(text))
    if arguments.check:
        stored = _inside_repository(arguments.check).read_text(encoding="utf-8")
        if stored == text:
            print(f"inventory is current ({digest(text)[:16]}…)")
        else:
            print("inventory is STALE: regenerate with --write")
            return 1
    if arguments.compare:
        contract = json.loads(_inside_repository(arguments.compare).read_text(encoding="utf-8"))
        report = compare(json.loads(text), contract)
        print(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False))
        axes = [report["methodsOnlyInServer"], report["methodsOnlyInContract"],
                report["requiredSetDrift"], report["optionalNotInContract"]]
        return 0 if not any(axes) else 1
    if not any((arguments.write, arguments.print_digest, arguments.check, arguments.compare)):
        parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

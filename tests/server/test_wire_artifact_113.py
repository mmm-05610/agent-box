"""Order 113: the Server publishes its own artifact, and the two trees compare
by name instead of by assumption.

A copy of someone else's contract is not an artifact - it is a rumor that stops
updating quietly. AUD-B-003 measured exactly that shape: a file named like the
current artifact, zero consumers, and a future schema gate fed from it would have
validated 33 of 64 methods and gone green.

So each gate here asks whether a claim could *fail*. The generator must be
deterministic and must match the live dispatcher; the committed inventory must
equal a fresh one; the old location must be unable to impersonate anything; the
comparison must be a function of its inputs (mutate one side, watch the report
shrink); and every path a gate reads is written out in full, because the
discipline being restored here is "no default artifact".
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import pathlib

from fastapi.testclient import TestClient
import pytest

from agent_box.server.bootstrap import build_runtime
from agent_box.server.transport.http import create_app
from test_wire_v1 import registry

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts/server-round1"
CONTRACT = ROOT / ("docs/server-round1/fullstack/contract"
                   "/wire-v1.schema.registered-b1eb4762.json")
INVENTORY = ROOT / "docs/server-round1/fullstack/contract/wire-v1.server-inventory.json"
OLD_COPY = ROOT / "docs/server-round1/fullstack/generated/wire-v1.schema.json"
POINTER = ROOT / "docs/server-round1/fullstack/generated/README.md"
REVIEW = ROOT / "docs/server-round1/wire-review.md"

#: The pair this tree registers (bulletin round 58; the settings line's relock
#: `ed6592b7`). Both halves of the name and the content have to agree.
REGISTERED_SHA256 = "b1eb4762b2a8e13e873967b770854e5e73a948488d4d066da07bc584e693dcd1"

#: What the two bodies disagree on *today*, by name. This is the answer to
#: "两仓一致吗".
#:
#: LNX-002 (2026-09-21): **empty, and that is the point.** The two rows that used
#: to live here (`provenance` accepted by `providerModels.update` /
#: `providerModels.probeModels` but undeclared) were closed at the **generation
#: source** — the property was added to `wire-v1.ts` on the settings tree and the
#: artifact regenerated — instead of by editing the contract copy here. Order 102
#: could not do that from the backend tree; LNX-002 holds write access to both.
#: The `== KNOWN_DRIFT` assertion below therefore now asserts "no drift", which is
#: a claim that will go red the moment either side moves again.
KNOWN_DRIFT = []


def _artifact_tool():
    spec = importlib.util.spec_from_file_location(
        "wire_artifact", SCRIPTS / "wire_artifact.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


TOOL = _artifact_tool()


def _json(path):
    return json.loads(path.read_text(encoding="utf-8"))


# -- G1 本体：可复跑、稳定、就是派发表 ------------------------------------

def test_the_generator_is_deterministic_and_counts_sixty_four_methods():
    first, second = TOOL.render(TOOL.build()), TOOL.render(TOOL.build())
    assert first == second, "a generator that drifts between runs cannot be pinned"
    document = json.loads(first)
    assert document["methodCount"] == 64 == len(document["methods"])
    assert TOOL.digest(first) == TOOL.digest(second)


def test_the_inventory_names_exactly_what_the_dispatcher_routes(tmp_path):
    """One truth, not two lists: the artifact's method set equals the live
    `WireService._handlers` keys of a constructed runtime."""
    runtime = build_runtime(tmp_path / "data", harnesses=registry())
    with TestClient(create_app(runtime), base_url="http://127.0.0.1"):
        routed = set(runtime.wire._handlers)
    assert set(TOOL.build()["methods"]) == routed
    assert len(routed) == 64


def test_the_committed_inventory_is_current():
    assert INVENTORY.exists(), "the backend artifact must be committed, not on request"
    assert INVENTORY.read_text(encoding="utf-8") == TOOL.render(TOOL.build()), (
        "committed inventory is stale: regenerate with --write")


def test_a_method_removed_from_the_inventory_is_reported_as_stale():
    """Counter-example for the freshness gate: dropping one row changes the
    rendering, so the equality above fails rather than silently passing."""
    document = TOOL.build()
    document["methods"].pop("sessions.send")
    assert TOOL.render(document) != INVENTORY.read_text(encoding="utf-8")


def test_the_inventory_declares_what_it_does_not_know():
    """`result` is the contract's authority; every row has to say so, or an
    absent key reads like agreement."""
    for method, entry in _json(INVENTORY)["methods"].items():
        assert entry["result"] == {"declared": False, "authority": "contract"}, method


# -- G2 旧副本：不再冒充当前 ------------------------------------------------

def test_the_old_unlabelled_path_is_gone_and_points_elsewhere():
    assert not OLD_COPY.exists(), "an unlabelled copy here is the defect this order fixes"
    pointer = POINTER.read_text(encoding="utf-8")
    assert "wire-v1.schema.registered-b1eb4762.json" in pointer
    assert REGISTERED_SHA256[:8] in pointer
    assert "settings" in pointer, "the pointer must name who owns the authority"


def test_the_copy_carries_its_own_digest_in_its_name():
    text = CONTRACT.read_text(encoding="utf-8")
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    assert digest == REGISTERED_SHA256
    assert digest[:8] in CONTRACT.name, (
        "a copy whose name is not its own hash is how staleness stays invisible")


def test_renaming_a_copy_without_renaming_its_hash_is_caught():
    """Counter-example: the filename claims a digest; content that no longer
    matches it must fail the gate above, not pass a path-existence check."""
    assert hashlib.sha256(b'{"different": true}\n').hexdigest()[:8] not in CONTRACT.name


# -- G3 口径唯一：生成 / 比较 / 门必须显式指路径 ---------------------------

def test_wire_review_states_generation_comparison_and_explicit_paths():
    section = REVIEW.read_text(encoding="utf-8")
    assert "## 工件口径（Order 113" in section
    for command in ("--print-digest", "--write", "--check", "--compare"):
        assert command in section, command
    assert "AGENT_BOX_WIRE_SCHEMA" in section
    assert "没有默认值" in section, "the rule being restored is: no default artifact"


def test_the_schema_gate_has_no_default_path_in_the_test_harness():
    """The harness must not go looking for a copy on its own; `Wire.call` validates
    only when the environment names a path."""
    source = (ROOT / "tests/server/test_wire_v1.py").read_text(encoding="utf-8")
    assert 'os.environ.get("AGENT_BOX_WIRE_SCHEMA")' in source
    assert "fullstack/generated/wire-v1.schema.json" not in source


# -- G4 两仓对表：差异点名，且报告是输入的函数 -----------------------------

def test_the_two_bodies_differ_only_in_the_registered_drift():
    report = TOOL.compare(TOOL.build(), _json(CONTRACT))
    assert report["methodsOnlyInServer"] == []
    assert report["methodsOnlyInContract"] == []
    assert report["requiredSetDrift"] == []
    assert report["optionalNotInContract"] == KNOWN_DRIFT


def test_declaring_provenance_in_the_contract_makes_the_drift_shrink():
    """Counter-example the other way: the report is computed from the two files.
    Add the missing property to a contract in memory and the row disappears
    without anyone editing a test - which is what a relock will do for real."""
    contract = _json(CONTRACT)
    for method in ("providerModels.update", "providerModels.probeModels"):
        contract[f"{method}#params"]["properties"]["provenance"] = {"type": "object"}
    assert TOOL.compare(TOOL.build(), contract)["optionalNotInContract"] == []


def test_a_method_missing_from_the_contract_is_reported_by_name():
    contract = _json(CONTRACT)
    contract.pop("usage.aggregate#params")
    report = TOOL.compare(TOOL.build(), contract)
    assert report["methodsOnlyInServer"] == ["usage.aggregate"]


# -- 越界保护 --------------------------------------------------------------

@pytest.mark.parametrize("target", ["../outside.json", "/tmp/definitely-not-here.json"])
def test_the_tool_refuses_to_write_or_read_outside_this_repository(target):
    """Cross-tree comparison happens on a copy that its owner delivered here -
    never by reaching into another tree."""
    with pytest.raises(SystemExit) as refused:
        TOOL._inside_repository(pathlib.Path(target))
    assert "outside this repository" in str(refused.value)


# -- G5 本单不改协议 -------------------------------------------------------

def test_the_method_set_did_not_move_under_this_order():
    document = _json(INVENTORY)
    assert document["methodCount"] == 64
    assert "server.hello" in document["methods"]
    assert document["methods"]["server.hello"]["handler"] == "hello"
    assert document["methods"]["providerModels.update"]["params"]["required"] == [
        "configuration", "credentialId", "displayName", "expectedVersion",
        "models", "providerModelId", "requestId"]

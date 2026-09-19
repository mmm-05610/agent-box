"""Order 105: `server.hello` publishes the family directory the registry holds.

The list has to come from the registry and nowhere else. Records are user data:
a fresh deployment has none, and deriving a directory from them is what left a
client with "custom harness" as the only option. So the gates here are set
equality against the registry (including *shrinking* it), the absence of
anything the family did not declare, and one machine-readable pin that the
locked wire artifact still refuses the new key - because that refusal is the
relock this order cannot perform from this tree.
"""
from __future__ import annotations

import dataclasses
import json
import pathlib

from fastapi.testclient import TestClient
import pytest

from agent_box.server.bootstrap import build_runtime
from agent_box.server.transport.http import create_app
from agent_box.server.execution import HarnessDescriptor, HarnessRegistry

HELLO = {"clientVersions": ["wire/1"], "clientPresentationSupports": []}

#: Registered deliberately out of alphabetical order: an insertion-ordered list
#: and a sorted one are only distinguishable if they differ.
def registry() -> HarnessRegistry:
    reg = HarnessRegistry()
    reg.register(HarnessDescriptor(
        "zeta", capability_claims={"stream": True}, control_options={},
    ))
    reg.register(HarnessDescriptor(
        "alpha", capability_claims={"stream": True}, control_options={},
        credential_kind="api_key", model_control_id="model",
    ))
    reg.register(HarnessDescriptor(
        "mido", capability_claims={}, control_options={}, credential_kind="oauth",
    ))
    return reg


def build(tmp_path, *, harnesses):
    runtime = build_runtime(tmp_path / "data", harnesses=harnesses)
    return runtime, create_app(runtime)


@pytest.fixture
def hello(tmp_path):
    runtime, app = build(tmp_path, harnesses=registry())
    with TestClient(app, base_url="http://127.0.0.1") as client:
        api = Client(client, runtime.token)
        yield runtime, api, api.hello()


class Client:
    def __init__(self, client, token):
        self.client = client
        self.token = token
        self.n = 0

    def hello(self):
        self.n += 1
        response = self.client.post("/wire/v1/server.hello", headers=self.headers,
                                    json={"jsonrpc": "2.0", "id": f"h{self.n}",
                                          "method": "server.hello", "params": HELLO})
        assert response.status_code == 200, response.text
        body = response.json()
        assert "result" in body, body
        return body["result"]

    @property
    def headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    def call(self, method, params):
        self.n += 1
        return self.client.post(f"/wire/v1/{method}", headers=self.headers,
                                json={"jsonrpc": "2.0", "id": f"c{self.n}",
                                      "method": method, "params": params}).json()


# -- G1: the list *is* the registry ----------------------------------------

def test_hello_lists_exactly_the_registered_families(hello):
    runtime, _api, result = hello
    assert [entry["id"] for entry in result["harnesses"]] == list(runtime.harnesses.registered())
    assert [entry["id"] for entry in result["harnesses"]] == ["alpha", "mido", "zeta"]


def test_the_order_is_the_registries_own_and_reproducible(hello):
    """Two calls, same list - and *not* the order they were registered in.

    Insertion order was zeta, alpha, mido; both the registry and hello answer
    alpha, mido, zeta. If a later change sorted in the handler as well, the two
    sorts can drift; this says which one is authoritative.
    """
    _runtime, api, first = hello
    assert [entry["id"] for entry in first["harnesses"]] == ["alpha", "mido", "zeta"]
    second = api.hello()
    assert json.dumps(first["harnesses"]) == json.dumps(second["harnesses"])


def test_removing_a_family_from_the_registry_removes_it_from_hello(hello):
    """The counter-example the order asks for, run against the live registry.

    Also the proof that the list is not derived from records: a Profile row for
    `alpha` is created first, so a record-backed list would still say `alpha`
    after the registry forgot it.
    """
    runtime, api, _before = hello
    api.call("profiles.create", {"requestId": "harn-profile-1", "displayName": "R",
                                 "harness": "alpha"})
    del runtime.harnesses._descriptors["mido"]  # noqa: SLF001 - the registry's own state is the subject
    after = api.hello()
    assert [entry["id"] for entry in after["harnesses"]] == ["alpha", "zeta"]


def test_a_family_declaring_nothing_shares_only_its_id(hello):
    """`credentialKind` / `modelControlId` are declarations, not columns: an
    undeclared one is absent, never a null the client has to distrust."""
    _runtime, _api, result = hello
    by_id = {entry["id"]: entry for entry in result["harnesses"]}
    assert by_id["alpha"] == {"id": "alpha", "credentialKind": "api_key", "modelControlId": "model"}
    assert by_id["mido"] == {"id": "mido", "credentialKind": "oauth"}
    assert by_id["zeta"] == {"id": "zeta"}
    assert all("credentialKind" not in entry or entry["credentialKind"] is not None
               for entry in result["harnesses"])


# -- G3: the empty deployment ---------------------------------------------

def test_a_deployment_with_no_families_answers_an_empty_list_not_an_error(tmp_path):
    """`build_runtime()` without a registry registers nothing, so this is the
    shape every in-process composition of this tree already has."""
    runtime, app = build(tmp_path, harnesses=HarnessRegistry())
    with TestClient(app, base_url="http://127.0.0.1") as client:
        result = Client(client, runtime.token).hello()
    assert result["harnesses"] == []
    assert len(result["capabilities"]) == 64


# -- G2: declarations only, no implementation ------------------------------

def test_the_family_list_publishes_declarations_and_nothing_else(hello):
    _runtime, _api, result = hello
    allowed = {"id", "credentialKind", "modelControlId"}
    for entry in result["harnesses"]:
        assert set(entry) <= allowed, entry
    text = json.dumps(result["harnesses"]).lower()
    for tell in ("credentialenvironment", "adapter", "controloptions", "capabilityclaims",
                 "securitylockedcontrols", "sha256", "digest", "c:\\", "/home/", "/mnt/",
                 ".agentbox", "token", "secret"):
        assert tell not in text, tell
    assert all(entry["id"] in runtime_names(result) for entry in result["harnesses"])


def runtime_names(result):
    return {entry["id"] for entry in result["harnesses"]}


def test_harness_ids_do_not_leak_into_the_capability_table(hello):
    """§明确不做: the family list is not a method list. A client that confuses
    them would gate a method on a harness name; keep the vocabularies apart."""
    _runtime, _api, result = hello
    capability_ids = {item["id"] for item in result["capabilities"]}
    assert capability_ids & {entry["id"] for entry in result["harnesses"]} == set()


# -- the field that must stay absent until 092 lands -----------------------

def test_wire_protocols_is_not_published_because_the_descriptor_has_no_such_field(hello):
    """The order's §Current state lists `wireProtocols` among the descriptor's
    fields; it is not there (092 is still ahead, and after R-0022 it is the
    runtime line's). Publishing an invented key would be the easier wrong answer.

    This test is a pin, not a description: when 092 adds the field it goes red
    and the replacement - publish the key set - is a deliberate edit.
    """
    fields = {f.name for f in dataclasses.fields(HarnessDescriptor)}
    assert "wire_protocols" not in fields
    _runtime, _api, result = hello
    assert all("wireProtocols" not in entry for entry in result["harnesses"])


# -- the relock, pinned so it cannot be quietly skipped --------------------

def test_the_locked_wire_artifact_still_refuses_the_new_key(hello):
    """G4, stated as what is *not* done yet.

    `server.hello#result` in the locked artifact carries
    `additionalProperties: false` over exactly the four old keys, so a client
    that validates against the published contract rejects this response. This
    tree has no generator for that artifact and cannot write the TS authority
    (the frontend's), so the relock is handed over rather than faked - and when
    it lands, the passing form of this test is the gate that says so.
    """
    import jsonschema

    schema_path = (pathlib.Path(__file__).resolve().parents[2]
                   / "docs/server-round1/fullstack/generated/wire-v1.schema.json")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    _runtime, _api, result = hello
    with pytest.raises(jsonschema.ValidationError) as caught:
        jsonschema.validate(result, schema["server.hello#result"])
    assert "harnesses" in str(caught.value), str(caught.value)


def test_the_four_old_fields_are_exactly_unchanged(hello):
    """§必须保持不变: `capabilities` keeps 097's shape, and the new key is the
    only addition to the envelope."""
    runtime, _api, result = hello
    assert set(result) == {"serverId", "protocolVersion", "capabilities", "auth", "harnesses"}
    assert result["protocolVersion"] == "wire/1"
    assert result["auth"] == {"required": True, "schemes": ["session_token"]}
    rows = result["capabilities"]
    assert len(rows) == len(runtime.wire._handlers)  # noqa: SLF001 - 097's invariant
    for row in rows:
        assert set(row) == ({"id", "supported", "reason"} if not row["supported"]
                            else {"id", "supported"})

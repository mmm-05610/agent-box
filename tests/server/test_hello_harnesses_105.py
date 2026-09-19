"""Order 105: `server.hello` publishes the family directory the registry holds.

The list has to come from the registry and nowhere else. Records are user data:
a fresh deployment has none, and deriving a directory from them is what left a
client with "custom harness" as the only option. So the gates here are set
equality against the registry (including *shrinking* it), the absence of
anything the family did not declare, and the locked wire artifact - checked by
digest, then used to validate a live response. The artifact had to be widened
for this key to be legal at all (`ed6592b7`); a later drift in either tree
shows up here as a red gate rather than a quiet "clients will cope".
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


# -- the relock: registered, and still falsifiable -------------------------

#: Order 113 moved this copy out of `generated/` and into `contract/`, named for
#: the digest it must hash to. The old path advertised "the artifact" while being
#: a copy; a file whose name is its own hash cannot quietly stop being current.
ARTIFACT = (pathlib.Path(__file__).resolve().parents[2]
            / "docs/server-round1/fullstack/contract"
            / "wire-v1.schema.registered-c4255b31.json")

#: The pair this tree registers. The relock landed in the settings line at
#: `ed6592b7`, encoding the shape this Server actually emits; the digest below
#: is that artifact, copied into this tree so the gate is reproducible here.
ARTIFACT_SHA256 = "c4255b31dba1ab2c92b57ae668f00eee8c11d17f1a6f0f37a22fba766d2c8c4d"


def _hello_schema():
    return json.loads(ARTIFACT.read_text(encoding="utf-8"))["server.hello#result"]


def test_the_relocked_artifact_accepts_what_the_server_emits(hello):
    """G4. Before `ed6592b7` this assertion was the *refusal* of the new key;
    flipping it to acceptance is what "the relock is done" means in code, and
    the digest check keeps the two trees honest about which artifact that is."""
    import hashlib

    import jsonschema

    assert hashlib.sha256(ARTIFACT.read_bytes()).hexdigest() == ARTIFACT_SHA256
    _runtime, _api, result = hello
    jsonschema.validate(result, _hello_schema())


@pytest.mark.parametrize("tamper", [
    pytest.param(lambda entry: entry.update({"credentialEnvironment": "/home/x/.agentbox"}),
                 id="undeclared-key"),
    pytest.param(lambda entry: entry.update({"credentialKind": None}),
                 id="null-instead-of-absent"),
    pytest.param(lambda entry: entry.pop("id"), id="id-less-entry"),
])
def test_the_locked_shape_still_refuses_what_must_not_be_sent(hello, tamper):
    """The falsification for the gate above: `additionalProperties: false`,
    `required: [id]` and "string, not null" are precisely the three ways a later
    change could leak an implementation detail or invent a declaration."""
    import jsonschema

    _runtime, _api, result = hello
    assert result["harnesses"], "the tamper cases need a populated directory"
    entry = dict(result["harnesses"][0])
    tamper(entry)
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate({**result, "harnesses": [entry]}, _hello_schema())


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

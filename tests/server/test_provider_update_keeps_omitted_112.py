"""Order 112: omission keeps, an explicit null clears - and the two must not be
the same request.

The ticket's stated defect ("omitted fields get written empty") is not what this
tree does: `COALESCE` already kept un-named provenance columns verbatim. What
was actually broken is the other direction - a client that *did* ask to forget
an endpoint fact got 200 and an untouched row, because both the handler
(`if value is None: continue`) and the SQL (`COALESCE(?,col)`) read "null" as
"absent". Every gate below therefore pins one of the two intents against the
other: keep happens when the name is missing, clearing happens when it is
present and null, and a field that may not be emptied still refuses in words.

`configuration`/`models` cannot be omitted on the wire at all - they are in
`providerModels.update`'s required set, and shrinking that set is a contract
change plus a relock (order 113's family), not this order's G4-permitted edit.
The same "omission keeps" rule is asserted one layer down instead, against
`ProviderModelService.update`, which is where an internal caller expresses it.
"""
from __future__ import annotations

import copy
import inspect

from fastapi.testclient import TestClient
import pytest

from agent_box.server.bootstrap import build_runtime
from agent_box.server.model_configs.repository import KEEP
from agent_box.server.model_configs import repository as repository_module
from agent_box.server.transport.http import create_app
from agent_box.server.wire import handlers as handlers_module
from test_wire_v1 import Wire, registry

PROVENANCE = {
    "baseUrl": "https://api.deepseek.com",
    "authStyle": "api_key",
    "wireApi": "chat_completions",
    "fieldsSource": "manual",
}
MODEL = {"modelId": "model-a", "displayName": "Model A",
         "availability": "unknown", "unavailableReason": None}
OTHER = {"modelId": "model-b", "displayName": "Model B",
         "availability": "unknown", "unavailableReason": None}
BODY = {"displayName": "Official API", "harness": "alpha", "provider": "opaque-provider",
        "credentialId": None, "configuration": [], "models": [MODEL]}


@pytest.fixture
def api(tmp_path):
    runtime = build_runtime(tmp_path / "data", harnesses=registry())
    with TestClient(create_app(runtime), base_url="http://127.0.0.1",
                    raise_server_exceptions=False) as client:
        yield Wire(client, {"Authorization": f"Bearer {runtime.token}"})


def create(api, *, request_id="o112-create-0001", provenance=PROVENANCE):
    params = dict(copy.deepcopy(BODY), requestId=request_id)
    if provenance is not ...:
        params["provenance"] = provenance
    return api.ok("providerModels.create", params)["providerModel"]


def update(api, record, *, request_id, version=None, **changes):
    params = dict(
        copy.deepcopy(BODY), requestId=request_id,
        providerModelId=record["id"],
        expectedVersion=record["version"] if version is None else version,
    )
    params.pop("harness")
    params.pop("provider")
    params.update(changes)
    return params


def stored(api, record_id):
    """Read the row back through a *different* call than the write's reply."""
    listing = api.ok("providerModels.list", {"includeArchived": False})
    for item in listing["items"]:
        if item["id"] == record_id:
            return item
    raise AssertionError("record vanished from providerModels.list")


# -- G1 省略即保留 ---------------------------------------------------------

def test_omitting_provenance_keeps_every_column_verbatim(api):
    record = create(api)
    reply = api.ok("providerModels.update", update(api, record, request_id="o112-keep-all"))
    assert reply["providerModel"]["provenance"] == PROVENANCE
    assert stored(api, record["id"])["provenance"] == PROVENANCE


def test_a_partial_provenance_keeps_the_fields_it_did_not_name(api):
    record = create(api)
    moved = api.ok(
        "providerModels.update",
        update(api, record, request_id="o112-partial",
               provenance={"baseUrl": "https://moved.example"}),
    )["providerModel"]
    assert moved["provenance"] == dict(PROVENANCE, baseUrl="https://moved.example")


def test_an_empty_provenance_object_keeps_everything(api):
    """`{}` names no field, so it must clear nothing. The shape rule and the
    keep rule meet here: an empty mapping is a valid request, not a no-op bug."""
    record = create(api)
    reply = api.ok("providerModels.update",
                   update(api, record, request_id="o112-empty-map", provenance={}))
    assert reply["providerModel"]["provenance"] == PROVENANCE


def test_the_service_keeps_every_field_its_body_omits(api, tmp_path):
    """The ticket's "only displayName" case, asserted one layer down where it is
    expressible: before this order `update()` read `body["configuration"]` and
    died with a `KeyError`, which is an unhandled-exception shape, not a rule."""
    runtime = build_runtime(tmp_path / "svc", harnesses=registry())
    with TestClient(create_app(runtime), base_url="http://127.0.0.1",
                    raise_server_exceptions=False) as client:
        wired = Wire(client, {"Authorization": f"Bearer {runtime.token}"})
        record = create(wired)
        kept = runtime.model_configs.update(
            record["id"], record["version"], "o112-service-0001",
            {"displayName": "Renamed only"},
        )
    assert kept["displayName"] == "Renamed only"
    assert kept["models"] == [MODEL]
    assert kept["credentialId"] is None
    assert kept["provenance"] == PROVENANCE
    assert kept["version"] == record["version"] + 1


# -- G2 显式即清空 ---------------------------------------------------------

@pytest.mark.parametrize("nulls,expected", [
    ({"baseUrl": None, "authStyle": None, "wireApi": None, "fieldsSource": None}, None),
    ({"baseUrl": None}, dict(PROVENANCE, baseUrl=None)),
    ({"fieldsSource": None}, dict(PROVENANCE, fieldsSource=None)),
])
def test_an_explicit_null_clears_only_the_field_it_names(api, nulls, expected):
    record = create(api)
    reply = api.ok("providerModels.update",
                   update(api, record, request_id="o112-n-" + next(iter(nulls)),
                          provenance=nulls))["providerModel"]
    assert reply["provenance"] == expected
    # ...and it is the row that changed, not the echo.
    assert stored(api, record["id"])["provenance"] == expected


def test_clearing_all_four_reads_back_as_unknown_not_as_a_guessed_default(api):
    record = create(api)
    api.ok("providerModels.update", update(
        api, record, request_id="o112-clear",
        provenance={key: None for key in PROVENANCE}))
    row = stored(api, record["id"])
    assert row["provenance"] is None
    assert row["displayName"] == BODY["displayName"]  # the rest survived


def test_keep_and_clear_happen_in_the_same_request(api):
    """One request, both intents: clear `wireApi`, rewrite `authStyle`, leave the
    other two alone. Only possible if the two states are distinguishable."""
    record = create(api)
    reply = api.ok("providerModels.update", update(
        api, record, request_id="o112-both",
        provenance={"wireApi": None, "authStyle": "oauth"}))["providerModel"]
    assert reply["provenance"] == dict(
        PROVENANCE, wireApi=None, authStyle="oauth")


# -- G2b 不允许清空者仍然说得出话 -----------------------------------------

def test_display_name_still_refuses_null_rather_than_keeping_quietly(api):
    record = create(api)
    error = api.err("providerModels.update",
                    update(api, record, request_id="o112-display-null", displayName=None))
    assert error["code"] == "INVALID_REQUEST"


def test_models_refuse_to_be_emptied(api):
    """`models: []` is an explicit value, and the protocol refuses it; the point
    of pinning it is that 112 must not turn "explicit" into "silently ignored"."""
    record = create(api)
    error = api.err("providerModels.update",
                    update(api, record, request_id="o112-empty-models", models=[]))
    assert error["code"] == "INVALID_REQUEST"


def test_configuration_may_be_emptied_on_purpose(api):
    record = create(api, provenance=PROVENANCE)
    reply = api.ok("providerModels.update", update(
        api, record, request_id="o112-cfg",
        configuration=[{"controlId": "model",
                        "value": {"providerId": record["id"], "modelId": "model-a"}}],
    ))["providerModel"]
    assert len(reply["configuration"]) == 1
    emptied = api.ok("providerModels.update",
                     update(api, reply, request_id="o112-cfg2", configuration=[]))
    assert emptied["providerModel"]["configuration"] == []
    assert emptied["providerModel"]["provenance"] == PROVENANCE


# -- G3 不退化 ------------------------------------------------------------

def test_a_stale_expected_version_is_still_a_typed_conflict(api):
    record = create(api)
    api.ok("providerModels.update", update(api, record, request_id="o112-version-a"))
    error = api.err("providerModels.update", update(
        api, record, request_id="o112-version-b", version=record["version"]))
    assert error["code"] == "CONFLICT_VERSION"
    assert error["current"]["provenance"] == PROVENANCE


def test_replaying_one_request_id_does_not_bump_the_version_twice(api):
    record = create(api)
    params = update(api, record, request_id="o112-replay",
                    provenance={"baseUrl": None})
    first = api.ok("providerModels.update", params)["providerModel"]
    replay = api.ok("providerModels.update", params)["providerModel"]
    assert replay["version"] == first["version"]
    assert replay["provenance"] == dict(PROVENANCE, baseUrl=None)


def test_illegal_provenance_values_stay_typed_refusals(api):
    """098's rules, unchanged: the only thing 112 added is the `null` branch."""
    record = create(api)
    for bad in ({"authStyle": "magic"}, {"baseUrl": "https://x" * 600}):
        error = api.err("providerModels.update",
                        update(api, record, request_id="o112-bad", provenance=bad))
        assert error["code"] == "INVALID_REQUEST"


def test_create_is_neutral_to_the_null_change(api):
    """`create` must not shift under this order: writing NULL over a
    NULL-defaulted column is the same row, so the projection is identical."""
    mixed = api.ok("providerModels.create", dict(
        copy.deepcopy(BODY), requestId="o112-create-nullmix",
        provenance={"baseUrl": None, "authStyle": "api_key"}))["providerModel"]
    assert mixed["provenance"] == {
        "baseUrl": None, "authStyle": "api_key",
        "wireApi": None, "fieldsSource": None}


# -- G4 不越界 ------------------------------------------------------------

def test_the_locked_param_shape_for_update_is_untouched():
    required, optional = handlers_module._PARAM_SHAPES["providerModels.update"]
    assert required == {
        "requestId", "providerModelId", "expectedVersion", "displayName",
        "credentialId", "configuration", "models"}
    assert optional == {"provenance"}


@pytest.mark.parametrize("field", ["displayName", "credentialId", "configuration", "models"])
def test_omitting_a_required_field_is_still_a_typed_shape_refusal(api, field):
    """The honest face of "partial update is not expressible on this contract":
    it refuses by name instead of guessing. Loosening this is a contract change
    plus a relock (handed to 113), not a side effect of 112."""
    record = create(api)
    params = update(api, record, request_id="o112-shape-" + field)
    params.pop(field)
    error = api.err("providerModels.update", params)
    assert error["code"] == "INVALID_REQUEST"
    assert field in error["message"]


# -- 反例：两个吞 null 的位置，各自被一条断言逮住 --------------------------

def test_the_handler_that_drops_nulls_would_swallow_the_clear(api, monkeypatch):
    """Counter-example, executed: put 098's `if value is None: continue` back and
    the same request answers 200 with the old fact still in the row - the exact
    behavior this order exists to remove."""
    original = handlers_module.WireService._provenance

    def dropping(cls, params):
        parsed = original.__func__(cls, params)
        if parsed is None:
            return None
        return {key: value for key, value in parsed.items() if value is not None}

    monkeypatch.setattr(handlers_module.WireService, "_provenance",
                        classmethod(dropping))
    record = create(api)
    reply = api.ok("providerModels.update", update(
        api, record, request_id="o112-counter-handler",
        provenance={key: None for key in PROVENANCE}))["providerModel"]
    assert reply["provenance"] == PROVENANCE  # swallowed: the bug, reproduced


def test_a_none_default_in_the_repository_would_make_clear_and_keep_identical():
    """Counter-example in the other layer: with `None` as the parameter default
    (the old `COALESCE` shape) the repository cannot tell the two intents apart,
    so this signature pin is what keeps the fix from rotting back."""
    parameters = inspect.signature(repository_module.ProviderModelRecords.update).parameters
    for column in repository_module.PROVENANCE_COLUMNS:
        assert parameters[column].default is KEEP
    source = inspect.getsource(repository_module.ProviderModelRecords.update)
    assert "COALESCE" not in source


def test_the_keep_sentinel_is_not_none():
    """If `KEEP` were ever aliased to `None`, G1 and G2 collapse into each other
    and every gate above still passes. This one would not."""
    assert KEEP is not None
    assert repr(KEEP) == "<KEEP>"

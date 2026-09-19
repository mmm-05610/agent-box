# 115 — the wire error-family misuse is closed (QA-008 A face)

Tree `agent-box-env-provider` / branch `feature/env-provider-v1` / baseline `bca7782`.
Executed 2026-09-19 12:0x–12:2x (UTC 11:3x–12:2x). Real model calls: **0**.

## 1 通路, measured before anything was changed (stage 1)

`WireError.__post_init__` rejected an unknown first argument:

```
$ PYTHONPATH=src python3 -c "from agent_box.server.wire.errors import WireError; WireError('USAGE_AGGREGATOR_UNAVAILABLE','m')"
ValueError: unknown wire error family: USAGE_AGGREGATOR_UNAVAILABLE
```

and the HTTP route protected `dispatch` with exactly one handler — `except WireError`
(`src/agent_box/server/transport/http/app.py:163-165`). Anything else that escaped
therefore left the Server as a bare status. Measured through a real
`TestClient(raise_server_exceptions=False)` socket with both walls taken away by hand
(`converge_family` restored to 101's rule, `dispatch` replaced by a wall-less copy, the
call site raising an unmapped code) — the client-visible shape is **not** a JSON-RPC body:

```
status 500  content-type 'text/plain; charset=utf-8'  len 21  body 'Internal Server Error'
```

So the order's `Current state` holds verbatim: the family slot could only be filled
correctly by memory, and a mistake there is a contract break rather than a typed refusal
(`R-0032 ⑤`).

One more thing was measured here rather than assumed: a `ServerError` escaping a handler
does **not** reach the client as a 500 — `dispatch` already projects it
(`handlers.py:394-395`, measured through the socket on `sessions.send` /
`workspaces.open` ⇒ `200` + `NOT_FOUND` + `details.internalCode`). The open half was
never "any exception", it is *construction-time* and *unexpected* exceptions.

## 2 What closure means here (stage 2)

Two walls, both inside `server/wire/**`, so neither depends on a call site remembering:

| Wall | Where | What it guarantees |
| --- | --- | --- |
| family convergence | `wire/errors.py` `converge_family` + `WireError.__post_init__` | a value in the family slot is projected by the same `family_for` the mapping layer uses; the original survives as `details.internalCode`; construction never raises |
| dispatch wall | `wire/handlers.py` `WireService.dispatch` | anything else a handler raises leaves as a compliant error object, `internalCode` = the exception **type**, and never its text |

Why `UNAVAILABLE` for an unknown code, and not a new `INTERNAL` family: `FAMILIES` is
the twelve-name contract set and 115 forbids changing it; `family_for` already answers
`UNAVAILABLE` for anything unmapped (`errors.py:97-102`), so the construction path now
converges the same way the mapping path always did, instead of inventing a second rule.
A code the table knows keeps its mapped family — `WireError("SESSION_BUSY", …)` arrives
as `CONFLICT_REQUEST` with `internalCode: SESSION_BUSY`.

The wall keeps the exception **class** only. `KeyError("/home/<user>/credentials/ledger")`
answers `{"code":"UNAVAILABLE","details":{"internalCode":"KeyError"}}`; the message could
carry a host path or a credential locator, and a locator is not a diagnostic the client
needs (`R-0011`).

**One regression this order found in itself, and fixed:** the first version of the wall
caught `WireError` too, because `WireError` is an `Exception`. Every typed refusal on the
handler side collapsed into `UNAVAILABLE` + `internalCode: "WireError"` — the gate
`test_a_typed_refusal_is_never_re_projected_by_the_wall` is that bug turned into a
counter-example, and it is why `NOT_FOUND` on `providerArtifacts.rollback` still reads
`NOT_FOUND`.

## 3 Gates (stage 3) — `tests/server/test_wire_error_family_closure_115.py`

All drive the real wire over HTTP with `raise_server_exceptions=False`.

| Gate | Test | Result |
| --- | --- | --- |
| G1 closed | `test_an_unregistered_domain_code_leaves_as_a_compliant_error_object` | pass — `200`, JSON, `family ∈ FAMILIES`, `internalCode` = the original unmapped code |
| G1 falsifier (convergence reverted) | `test_counter_example_reverting_the_convergence_loses_the_original_code` | pass — no 500 (the second wall holds), but `internalCode` degrades to `ValueError`, so G1's own assertion goes red |
| G1 falsifier (both walls reverted) | `test_counter_example_reverting_both_walls_puts_the_bare_500_back` | pass — `500`, non-JSON body: the QA-008 shape requires **both** walls down |
| G2 family legal | `test_every_outbound_error_family_is_a_registered_family`, `test_construction_never_raises_out_of_the_family_slot`, `test_a_code_the_mapping_knows_keeps_its_mapped_family` | pass |
| G3 real wire | `test_the_gate_drives_real_http_and_not_a_direct_call`, `test_an_unexpected_exception_also_leaves_as_an_error_object` | pass |
| G4 no regression | five methods (`test_the_five_methods_still_refuse_by_type`) + 101's own file + `test_wire_v1.py` + capability contract | pass — see §5 |

The "both walls" falsifier is the interesting one: it says the closure is redundant on
purpose. With either wall standing, no bare 500 leaves for this family; to bring the old
shape back an author must now remove two guards, and each removal turns a different gate
red.

## 4 101's two counter-examples are superseded, not deleted

`tests/server/test_wire_error_family_101.py` used to prove the defect by asserting `500`.
After closure those assertions describe a shape that can no longer leave this Server, so
both tests now assert what the same restored defect produces instead (`200` + typed, with
the damage visible as a degraded `internalCode`). 101's own fixes still stand on their
merit and are unchanged — the shape fix for `digest` is what keeps the answer
`INVALID_REQUEST` naming the missing field instead of `UNAVAILABLE/KeyError`, and that
argument is written into the test that now proves it.

## 5 Counts, and one environment prerequisite that is not a regression

```
PYTHONPATH=src python3 -m pytest tests/server/test_wire_error_family_closure_115.py \
  tests/server/test_wire_error_family_101.py tests/server/test_wire_v1.py \
  tests/server/test_server_capability_contract.py -q
→ 1 failed, 132 passed in 103.05s
```

The single red is `test_wire_v1.py::test_unavailable_capabilities_carry_a_reason`
(`entries["workspaces.open"]["supported"] is True`). It is the documented sandbox-provider
prerequisite of a PYTHONPATH run, not this diff: with
`AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap` plus the plugin `PYTHONPATH`
(the command recorded in `native-home-storage.md` §复跑命令 and status.md's 67/084 rows)
the same test is `1 passed in 0.72s`. Any future run of these files should carry that
environment. **Worker 工件：不在**（`workers/agent-box-worker/target/{debug,release}` 未构建）
—— these legs do not read it, but per `QA-007` the line is stated.

Full `tests/server` and `tests/` counts for the batch are recorded in `status.md` (§6),
marked `待 QA 复算` per `R-0040 ⑥`.

## 6 Sibling tree, read-only (stage 4) — `D-002` / `D-005`

Checked on `agent-box-runtime-round1` at HEAD `56af017`, nothing written there:

| Fact | Measured |
| --- | --- |
| family slot still takes internal codes | `src/agent_box/server/wire/handlers.py:1192-1197` (`_artifact_store` → `ARTIFACT_STORE_UNAVAILABLE`), `:1242-1245` (`_usage_aggregator` → `USAGE_AGGREGATOR_UNAVAILABLE`) — ops's `1196/1244` is right in substance, off by a few lines at this HEAD |
| no convergence | `src/agent_box/server/wire/errors.py:112-114` still `raise ValueError(f"unknown wire error family: ...")` |
| no dispatch wall | `src/agent_box/server/wire/handlers.py:370-372` — `except ServerError` only |
| no guard tests | `tests/server/` holds 63 entries, **0** matching `wire_error|family` |

**Guard-presence list for the operations side** (this tree has all three, the runtime
tree has none):

- `tests/server/test_wire_error_family_101.py` — 101's face, including the call-site scan
- `tests/server/test_wire_error_family_closure_115.py` — this order's closure + both falsifiers
- `src/agent_box/server/wire/errors.py::converge_family` and `WireService.dispatch`'s
  `except Exception` — the two walls themselves

Because `wire/**` belongs to this line, a one-sided merge that takes the runtime tree's
`wire/handlers.py` over this one would reintroduce the call-site misuse while leaving both
walls in place — user-visible behaviour stays typed, so **no test would scream**. The
merge review should therefore diff `wire/handlers.py`'s two `WireError(` sites against
this list rather than trusting a green suite.

## 7 Boundary of this order (handed back, not silently fixed)

`transport/http/app.py` keeps no wall of its own: only the four `WireError` paths inside
`wire_route` answer in contract terms, and `runtime.wire.dispatch` is called inside that
`try` solely because it converts. Anything raised **outside** `dispatch` — authentication,
`decode_request`'s non-`WireError` branch, `encode_result` — can still produce a bare 500
on this route. Closing that is a one-line `except Exception` at the transport boundary,
which is `src/agent_box/server/transport/**` and **not** in 115's `write_paths`
(`wire/**`, `tests/**`, `docs/**`, `status`). Registered for the scheduler in
`docs/implementation/status.md` §待开单 rather than reached for here.

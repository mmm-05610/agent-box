#!/usr/bin/env python3
"""Order 089, seed leg - shape check: run the seed against the **Server's own** handlers.

The offline self-test (`ui_gates_89_seed_profile.py --self-test`) proves the script's logic
against a stub. This proves the part a stub cannot prove: that the bodies the seed sends are
accepted by the real validators - the REST credential route, `providerModels.create` with
`provenance` (order 098's face), `profiles.create` / `profiles.updateConfig` against a model
control that resolves through the Provider/Model directory (order 117's face), and the read-back
through `profiles.list`.

No socket and no subprocess: `TestClient` drives the composed app in-process, so this runs
anywhere the test suite runs. It is **not** the real Windows leg - that one still needs the
port range and data root in `R-0056`, and a real key path.

    PYTHONPATH=src python3 scripts/server-round1/ui_gates_89_seed_shape_check.py
"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import shutil
import stat
import sys
import tempfile
from pathlib import Path

TREE = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(TREE / "src"), str(TREE / "tests" / "server")]

_spec = importlib.util.spec_from_file_location(
    "seed89", TREE / "scripts/server-round1/ui_gates_89_seed_profile.py")
seed89 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(seed89)


class TestClientFace:
    """The same two methods `Face` offers, routed into the composed app instead of a socket."""

    def __init__(self, client, token: str) -> None:
        self.client = client
        self.token = token
        self.calls: list[tuple] = []

    @property
    def _headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    def rest(self, path: str, body: dict, idempotency_key: str):
        self.calls.append((("rest", path), body, idempotency_key))
        response = self.client.post(path, json=body,
                                    headers=dict(self._headers,
                                                 **{"Idempotency-Key": idempotency_key}))
        try:
            return response.status_code, response.json()
        except Exception:  # noqa: BLE001 - a non-JSON answer is itself the finding
            return response.status_code, {"unparsable": response.text[:200]}

    def wire(self, method: str, params: dict):
        self.calls.append((("wire", method), params))
        response = self.client.post(
            f"/wire/v1/{method}",
            json={"jsonrpc": "2.0", "id": params.get("requestId") or f"seed89-{method}",
                  "method": method, "params": params}, headers=self._headers)
        try:
            return response.status_code, response.json()
        except Exception:  # noqa: BLE001
            return response.status_code, {"unparsable": response.text[:200]}


def main() -> int:
    from agent_box.server.bootstrap import build_runtime
    from agent_box.server.transport.http import create_app
    from agent_box.storage import MemorySecretStore
    from fastapi.testclient import TestClient
    # Order 117's fixture registry, with the kind production descriptors declare
    # (`plugins/agent-box-harnesses/**/production.py`: CREDENTIAL_KIND = "api-key"),
    # so the shape checked here is the shape the real Server accepts.
    from test_profiles_list_sendability_117 import _registry

    temporary = Path(tempfile.mkdtemp(prefix="agentbox-89-seed-shape-"))
    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail) -> None:
        results.append((name, bool(ok), detail if isinstance(detail, str)
                        else json.dumps(detail, ensure_ascii=False, default=str)[:300]))

    def _call(argv, factory):
        """Run the seed's own main(), turning its SystemExit into a code and captured text."""
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            try:
                code = seed89.main(list(argv), face_factory=factory)
            except SystemExit as exc:
                code = exc.code if isinstance(exc.code, int) else 1
                out.write("" if isinstance(exc.code, int) else str(exc.code))
        return code, out.getvalue()

    try:
        data_root = temporary / "data"
        key_file = temporary / "deepseek-key.txt"
        key_file.write_text("fake-loopback-value-not-a-secret", "utf-8")
        os.chmod(key_file, 0o600)

        # -- the fact that makes this leg Windows-only, pinned rather than assumed:
        # `bootstrap/runtime.py:317-320` composes a secret store only when `os.name == "nt"`,
        # so a Server started as `python -m agent_box.server` on the WSL side answers every
        # credential import with a typed refusal. That is where `T6-1` ("no sendable profile")
        # actually comes from, and it is why the recipe says "seed on the control plane".
        bare_root = temporary / "bare-data"
        bare = build_runtime(bare_root, harnesses=_registry(credential_kind="api-key"))
        with TestClient(create_app(bare), base_url="http://127.0.0.1",
                        raise_server_exceptions=False) as bare_client:
            status, body = TestClientFace(bare_client, bare.token).rest(
                "/api/v1/credentials",
                {"kind": "api-key", "source_path": str(key_file),
                 "confirm_source_path": str(key_file)}, "shape-bare")
            error = (body or {}).get("error") or {}
            check("a_server_without_a_secret_store_refuses_the_import_typed",
                  status in (400, 409, 503) and error.get("code") == "CREDENTIAL_STORE_UNAVAILABLE",
                  {"status": status, "error": error})
        bare.stop()

        runtime = build_runtime(data_root, harnesses=_registry(credential_kind="api-key"),
                                secret_store=MemorySecretStore({}))
        token_file = data_root / "secrets" / "http-token"
        check("the_server_writes_its_own_token_where_the_seed_expects_it",
              token_file.is_file(),
              {"expected": str(token_file.relative_to(data_root)),
               "secrets": sorted(path.name for path in (data_root / "secrets").iterdir())
               if (data_root / "secrets").is_dir() else None})
        if not token_file.is_file():
            # Without this the whole run would drive a face that cannot authenticate, and a
            # reader would see four "failures" that are really one.
            for name, ok, detail in results:
                print(f"{'ok  ' if ok else 'RED '} {name}  {detail}")
            print("SHAPE_CHECK ABORTED: no token to authenticate with")
            return 1

        with TestClient(create_app(runtime), base_url="http://127.0.0.1",
                        raise_server_exceptions=False) as client:
            holder: dict = {}

            def factory(_base_url, token):
                face = TestClientFace(client, token)
                holder["face"] = face
                return face

            state_file = temporary / "state.json"
            argv = ["--base-url", "http://127.0.0.1:18820", "--token-file", str(token_file),
                    "--key-file", str(key_file), "--label", "seed89-shape",
                    "--harness", "alpha", "--state-file", str(state_file)]
            code, seed_text = _call(argv, factory)
            calls = holder["face"].calls
            methods = [key for key, *_ in calls]
            check("seed_exit_zero_on_the_real_handlers", code == 0, {"exit": code})
            check("every_face_the_seed_uses_is_a_public_one",
                  methods == [("rest", "/api/v1/credentials"),
                              ("wire", "providerModels.create"),
                              ("wire", "profiles.create"),
                              ("wire", "profiles.updateConfig"),
                              ("wire", "profiles.list")],
                  {"methods": methods})

            state = json.loads(state_file.read_text("utf-8")) if state_file.is_file() else {}
            credential_id = (state.get("credentialId") or "")
            check("credential_row_exists_and_holds_only_a_locator",
                  credential_id.startswith("credential_")
                  and bool(runtime.repository.credentials.get(credential_id)),
                  {"credentialId": credential_id})
            row = (runtime.repository.credentials.get(credential_id)
                   if credential_id else None)
            if row:
                check("the_store_imported_rather_than_aliased_the_source_path",
                      row["secret_locator"] != str(key_file) and row["kind"] == "api-key",
                      {"locatorPrefix": (row["secret_locator"] or "")[:18],
                       "kind": row["kind"]})
                check("the_key_never_landed_in_the_wire_bodies_or_the_report",
                      "fake-loopback-value-not-a-secret" not in json.dumps(calls),
                      {"note": "the seed passes a path; the Server's store reads it"})

            sendability = (state.get("sendability") or {})
            check("the_seeded_profile_is_read_back_with_sendability_from_the_real_projection",
                  "alpha" in sendability and (sendability.get("alpha") or {}).get("state")
                  in {"ready", "blocked", "unknown"},
                  {"verdicts": {harness: (value or {}).get("state")
                                for harness, value in sendability.items()},
                   "reasons": {harness: (value or {}).get("reason")
                               for harness, value in sendability.items()}})

            # Counter-example: the same flow with a key file nobody may read must refuse
            # before the credential import, not answer "seeded".
            unreadable = temporary / "unreadable.txt"
            unreadable.write_text("x", "utf-8")
            os.chmod(unreadable, 0o000)
            refused_code, refused_text = _call(
                argv[:4] + ["--key-file", str(unreadable), "--label", "seed89-shape-refused",
                            "--harness", "alpha"], factory)
            check("counter_example_unreadable_key_file_does_not_report_success",
                  refused_code != 0 and "CREDENTIAL_SOURCE_UNREADABLE" in refused_text
                  and "sendability" not in refused_text,
                  {"exit": refused_code, "text": refused_text[-160:]})

            # Counter-example: a stale idempotency label with different parameters is a
            # conflict the seed must surface, not swallow.
            again_code, again_text = _call(
                argv[:4] + ["--key-file", str(key_file), "--label", "seed89-shape",
                            "--harness", "alpha", "--model-id", "other-model"], factory)
            check("counter_example_replay_with_changed_parameters_is_not_silent",
                  again_code != 0 and "IDEMPOTENCY_CONFLICT" in again_text,
                  {"exit": again_code, "text": again_text[-200:]})
    finally:
        try:
            runtime.stop()
        except Exception:  # noqa: BLE001
            pass
        shutil.rmtree(temporary, ignore_errors=True)

    failed = [name for name, ok, _ in results if not ok]
    for name, ok, detail in results:
        print(f"{'ok  ' if ok else 'RED '} {name}  {'' if ok else detail}")
    print(f"SHAPE_CHECK {'FAILED' if failed else 'OK'}: "
          f"{len(results) - len(failed)}/{len(results)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

"""Work Order 39-B counter-example: one idempotency key, two concurrent accepts.

HISTORICAL EVIDENCE ONLY: this script targets the pre-39 production code
(`agent_box.server.application`, removed by Work Order 39). Its captured
output lives in `docs/server-round1/server-boundary/repro-duplicate-accept.txt`.
The behavior it exposes is regression-guarded by
`tests/server/test_server_boundaries.py::test_concurrent_same_key_turn_acceptance_dispatches_once`.
"""
from __future__ import annotations

import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from agent_box.server.application import ProductService  # noqa: E402
from agent_box.server.persistence import ProductRepository  # noqa: E402
from agent_box.storage import Database, ObjectStore  # noqa: E402


class RecordingExecution:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.accepted = []
        self.gate = threading.Event()

    def accept(self, turn_id, *, overrides=None):
        with self.lock:
            self.accepted.append(turn_id)
        self.gate.wait(2)  # keep both racers inside dispatch simultaneously
        raise RuntimeError("DISPATCH_STOPPED_BEFORE_EVIDENCE")

    def cancel(self, turn_id):
        return False


def main() -> int:
    root = Path(sys.argv[1])
    database = Database(root)
    database.initialize()
    repository = ProductRepository(database)
    objects = ObjectStore(root)
    execution = RecordingExecution()
    service = ProductService(
        repository, objects,
        profile_validators={"codex": lambda value: None},
        execution=execution,
        credential_kinds={"codex": "codex-login"},
    )
    workspace = repository.create_workspace(
        key="w", request_digest="w", distribution="Ubuntu", remote_user="tester",
        remote_path="/workspace", connection_id="connection",
    )[1]
    config = objects.publish(b'{"schema_version":1,"harness_type":"codex","configuration":{}}')
    repository.register_credential("credential-1", "codex-login", "locator")
    profile = repository.create_profile(
        key="p", request_digest="p", name="role", harness_type="codex",
        config_digest=config.digest, credential_id="credential-1",
    )[1]
    session = repository.create_session(
        key="s", request_digest="s", workspace_id=workspace["workspace_id"],
        profile_id=profile["profile_id"],
    )[1]

    body = {"text": "one intent", "expected_profile_revision": 1}
    receipts = []
    errors = []

    # Deterministic window: both racers complete the pre-commit idempotency
    # read (both returning None) before either reaches the insert/commit.
    barrier = threading.Barrier(2, timeout=5)
    original = repository.get_idempotent

    def raced_pre_read(scope, key, request_digest):
        result = original(scope, key, request_digest)
        barrier.wait()
        return result

    repository.get_idempotent = raced_pre_read

    def race() -> None:
        try:
            receipts.append(service.create_turn(session["session_id"], "turn-key", body))
        except BaseException as exc:  # noqa: BLE001
            errors.append(repr(exc))

    threads = [threading.Thread(target=race) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    execution.gate.set()
    for thread in threads:
        thread.join()
    time.sleep(0.2)
    if errors:
        print("racer errors:", errors)

    accept_ids = list(execution.accepted)
    turn_ids = {receipt[1]["turn_id"] for receipt in receipts if receipt}
    print(f"accept invocations: {len(accept_ids)} for turns {sorted(turn_ids)}")
    if len(accept_ids) > 1 and len(turn_ids) == 1:
        print("DEFECT CONFIRMED: one idempotency key dispatched the same Turn twice")
        return 1
    print("contract holds: a single dispatch claimed the acceptance")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

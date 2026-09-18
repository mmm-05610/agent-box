"""Work Order 099 gates G1-G3: ``home.put`` over a real Worker process.

The defect this order closes stayed invisible for four rounds because every
test on either side of the seam stepped around it: the crate's own tests call
``handle_home`` directly, and the Server's asset tests never drove a real
Worker control stream.  So the gate here is deliberately the opposite shape -
a real binary, a real frame protocol, and the request the Server actually sends
at ``src/agent_box/server/execution/sidecar.py:593``.

Two bundles are driven and the older one must fail: ``.acceptance-bundle-c11``
is the frozen pre-fix build, kept as the counter-example sample, and
``.acceptance-bundle-c12`` is rebuilt from the wired source.  A pass here says
something a green handler test cannot: that the operation name survives the
trip through the request loop.

The three ``home.put`` boundaries are asserted as *typed refusals over the
wire* - the payload bound, a non-regular leaf, an escaping path - each followed
by a request that still succeeds.  ``handle_home`` answers an unrouted name with
``unreachable!()``, so a crash here would look like a closed stream rather than
an error, and telling those two apart is the last assertion.
"""
from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path

import pytest

from agent_box_runtime_wsl import WorkerClient, WorkerError

REPO = Path(__file__).resolve().parents[2]
CRATE = REPO / "workers" / "agent-box-worker"
MAX_HOME_PUT_BYTES = 256 * 1024  # main.rs: MAX_HOME_PUT_BYTES
UNSUPPORTED_MESSAGE = "operation is unsupported"

#: The five names the Server puts on a worker wire, as of this order.
SERVER_HOME_OPERATIONS = {
    "home.prepare", "home.put", "home.list", "home.get", "home.delete",
}

#: The marker shape mirrors the crate's own home tests: a locator is
#: "<role>/<nativeHome>" and the marker names the same profile.
LOCATOR = "profile_099/.pi"
MARKER = {"profileId": "profile_099", "harnessType": "pi", "nativeHome": ".pi"}

BUNDLES = pytest.mark.parametrize(
    "bundle, wired",
    [
        pytest.param(".acceptance-bundle-c11", False, id="c11-pre-fix"),
        pytest.param(".acceptance-bundle-c12", True, id="c12-wired"),
    ],
)


def _bundle(name: str) -> Path:
    path = CRATE / name / "agent-box-worker"
    if not path.is_file():
        pytest.skip(f"{name} is a build product and is absent; run 099 stage 4")
    return path


def _client(worker: Path, root: Path) -> WorkerClient:
    return WorkerClient(
        [str(worker), "--root", str(root / "worker-root"),
         "--home-root", str(root / "profile-home"), "--workspace", str(REPO)],
        worker_digest="sha256:" + hashlib.sha256(worker.read_bytes()).hexdigest(),
        worker_version="0.1.0", connection_id="connection-099",
        project_id="project-099", effective_user=os.environ["USER"],
        server_instance_id="server-099-wire",
    )


def _put_arguments(data: bytes, path: str = "state/auth.json") -> dict:
    return {
        "locator": LOCATOR,
        "path": path,
        "data": base64.b64encode(data).decode(),
    }


def _home_operations_the_server_sends() -> set[str]:
    """Every ``home.*`` name the Server puts on a worker wire, read from source."""
    names: set[str] = set()
    for source in (REPO / "src" / "agent_box").rglob("*.py"):
        for line in source.read_text().splitlines():
            start = line.find('client.request("home.')
            if start >= 0:
                tail = line[start + len('client.request("'):]
                names.add(tail[: tail.index('"')])
    return names


@BUNDLES
def test_home_put_survives_the_request_loop(tmp_path, bundle, wired):
    client = _client(_bundle(bundle), tmp_path)
    client.start()
    payload = b'{"bridge": "099"}'
    try:
        # Reaching prepare proves the fixture, not the fix: the loop routed this
        # arm all along, which is why the gap underneath it never showed.
        client.request("home.prepare", {"locator": LOCATOR, "marker": MARKER})
        try:
            written = client.request("home.put", _put_arguments(payload))
        except WorkerError as refused:
            assert not wired, f"the wired bundle must answer home.put, got {refused.code}"
            assert refused.code == "OP_UNSUPPORTED"
            assert refused.message == UNSUPPORTED_MESSAGE
            # The counter-example is one operation wide, not a dead channel.
            assert client.request("home.list", {"locator": LOCATOR})["files"] is not None
            return
        assert written["bytes"] == len(payload)

        # Round trip through the ordinary read ops, over the same wire.
        read = client.request("home.get", {"locator": LOCATOR, "path": "state/auth.json"})
        assert base64.b64decode(read["data"]) == payload
        listed = client.request("home.list", {"locator": LOCATOR})
        assert "state/auth.json" in {item["path"] for item in listed["files"]}

        # Each declared boundary is a typed refusal, never a closed stream.
        # An empty payload is refused as a missing argument, not as a home
        # failure: `value_string` (main.rs:739) filters empty strings before
        # `home.put` ever sees the payload, so the wire code is REQUEST_INVALID
        # and the `payload.is_empty()` arm inside home.put is unreachable from
        # any real client.  Measured here rather than assumed from that text.
        for arguments, code in (
            (_put_arguments(b""), "REQUEST_INVALID"),
            (_put_arguments(b"x" * (MAX_HOME_PUT_BYTES + 1)), "HOME_IO"),
            (_put_arguments(payload, path="../escape.json"), "PATH_INVALID"),
        ):
            with pytest.raises(WorkerError) as refused:
                client.request("home.put", arguments)
            assert refused.value.code == code, f"{arguments['path']}: {refused.value}"

        # A non-regular leaf is refused and never followed.  The sentinel is
        # read back only by this test, which is the assertion that the Worker
        # did not write through the link.
        outside = tmp_path / "outside-host-file"
        outside.write_bytes(b"untouched")
        leaf = tmp_path / "profile-home" / "profile_099" / "state" / "link.json"
        leaf.parent.mkdir(parents=True, exist_ok=True)
        os.symlink(str(outside), str(leaf))
        with pytest.raises(WorkerError) as refused:
            client.request("home.put", _put_arguments(payload, path="state/link.json"))
        assert refused.value.code == "PATH_INVALID"
        assert outside.read_bytes() == b"untouched"

        # And the stream is still alive: no arm reached unreachable!().
        assert client.request("home.get", {"locator": LOCATOR, "path": "state/auth.json"})
    finally:
        client.close()


@BUNDLES
def test_every_home_operation_the_server_sends_is_routed(tmp_path, bundle, wired):
    """The other direction of the drift: sent by the Server, implemented by nobody.

    Each name is probed with empty arguments.  A missing-argument refusal proves
    the request reached a handler; ``OP_UNSUPPORTED`` proves it never left the
    request loop, which is exactly where ``home.put`` sat for four rounds.
    """
    names = _home_operations_the_server_sends()
    assert names == SERVER_HOME_OPERATIONS, names
    client = _client(_bundle(bundle), tmp_path)
    client.start()
    try:
        for op in sorted(names):
            if op == "home.put" and not wired:
                continue  # this bundle's answer for it is the counter-example
            with pytest.raises(WorkerError) as refused:
                client.request(op, {})
            assert refused.value.code != "OP_UNSUPPORTED", (
                f"{op} is sent by src/agent_box and never dispatched by {bundle}"
            )
    finally:
        client.close()

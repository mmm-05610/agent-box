from pathlib import Path
from agent_box.application.operations import OperationStore

def test_operation_is_persisted_and_idempotent(tmp_path: Path):
    store = OperationStore(tmp_path / "host")
    first = store.create("finish-1", "exec-1", "finish", "web:finish-1")
    replay = store.create("finish-1", "exec-1", "finish", "web:finish-1")
    assert replay == first
    running = store.update("finish-1", status="running", progress=("accepted", "running"))
    assert running.status == "running"
    restarted = OperationStore(tmp_path / "host")
    recovered = restarted.get("finish-1")
    assert recovered is not None
    assert recovered.status == "interrupted"
    assert restarted.get("finish-1").result is None

def test_terminal_operation_survives_restart(tmp_path: Path):
    store = OperationStore(tmp_path / "host")
    store.create("finish-2", "exec-2", "finish", "web:finish-2")
    store.update("finish-2", status="succeeded", result={"receipt": {"execution_id": "exec-2"}}, progress=("succeeded",))
    restarted = OperationStore(tmp_path / "host")
    value = restarted.get("finish-2")
    assert value.status == "succeeded"
    assert value.result["receipt"]["execution_id"] == "exec-2"

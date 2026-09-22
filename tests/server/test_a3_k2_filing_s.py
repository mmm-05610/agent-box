"""S 组 /tests/server — a-3 K4-S 钉（K1 键落行／K2-S 门控建档步／β 列形／K3' 两半语义）。

批准依据：`approvals/a-3-release.md` K1/K2/K3'/K4＋`C-notice-S-t39-k12-ruled.md`（β=甲）。
红-绿双向记账（显式）：本文件全部新钉在合批前基线 `8c437cd` 上=预期红（列缺/形参缺），
在 S 腿树上=绿（申报枚举随 CHECKPOINT）；合批形（E 腿键消费 accept 到位）由构造器注丝
（等价组合线）在 K2-S 终语义下绿——建档摘除半边属 E 腿、其钉归 E 域文件（勿在此扩面）。

- P1 dormant＝S 腿单行形为中立：无 filer 组合时链路列保持 NULL、派发包线不变。
- P2 active＝提交后紧随＋幂等先行：一次建档、键=execution:{turn_id}（可推导、零秘密）、
  链接回写 state 不推进；重入步零再建档。
- P3 replay＝受理幂等先行：同键重放回执、filer 零触。
- P4 两入口 execution_key 落行（intent+REST）；β 列在全部 Session 行＝原始 NULL（从未写）。
- P5 K3' 两半＝受理后编辑 Profile：本 turn 冻结件内 permissions 恒=受理时值、
  下 turn 新值可分辨（digest 面）——「版本冻结≠内容冻结」在受理点闭环（E 消费半边随其腿）。
"""
from __future__ import annotations

import json

from agent_box.server.credentials import CredentialRecords
from agent_box.server.execution import HarnessDescriptor, HarnessRegistry
from agent_box.server.idempotency import IdempotentRecords
from agent_box.server.profiles import ProfileRecords
from agent_box.server.profiles.permissions import resolve_all
from agent_box.server.sessions import SessionRecords, SessionService
from agent_box.server.workspaces import WorkspaceRecords
from agent_box.storage import Database, ObjectStore

CONFIG = {"schema_version": 1, "harness_type": "alpha", "configuration": {"model": "one"}}
EDITED = {"schema_version": 1, "harness_type": "alpha", "configuration": {"model": "two"}}
DEFAULT_POSTURE = resolve_all([], preset="default")


class RecordingPort:
    def __init__(self) -> None:
        self.accepted: list[str] = []

    def accept(self, turn_id) -> None:
        self.accepted.append(turn_id)


def canonical(value: dict) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":")).encode()


def alpha_registry() -> HarnessRegistry:
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor(
        "alpha", credential_kind=None,
        configuration_validator=lambda value: None if isinstance(value, dict) else ValueError(),
        capability_claims={"stream": True},
    ))
    return registry


class RecordingFiler:
    """Stands in for the composed Core filing collaborator (WorkService/
    ExecutionService are E-domain; the seam contract is the receipt shape)."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    def __call__(self, *, turn_id: str, session_id: str, execution_key: str) -> dict:
        self.calls.append({"turn_id": turn_id, "session_id": session_id,
                          "execution_key": execution_key})
        n = len(self.calls)
        return {"work_id": f"work-{n}", "core_execution_id": f"exec-{n}",
                "dispatch_id": f"disp-{n}"}


def make_stack(tmp_path, *, filer=None):
    database = Database(tmp_path / "data")
    database.initialize()
    idempotency = IdempotentRecords(database)
    credentials = CredentialRecords(database)
    profiles = ProfileRecords(database, idempotency)
    records = SessionRecords(database, idempotency)
    workspaces = WorkspaceRecords(database, idempotency)
    objects = ObjectStore(tmp_path / "data")
    port = RecordingPort()
    sessions = SessionService(
        records, idempotency, objects, harnesses=alpha_registry(),
        profiles=profiles, credentials=credentials, execution=port,
        core_filer=filer,
    )
    config_digest = objects.publish(canonical(CONFIG)).digest
    profile = profiles.create(
        key="p", request_digest="p", name="role", harness_type="alpha",
        config_digest=config_digest, credential_id=None,
    )[1]
    workspace = workspaces.create(
        key="w", request_digest="w", distribution="Ubuntu", remote_user="tester",
        remote_path="/w", connection_id="c",
    )[1]
    session = sessions.create_session("s", {
        "workspace_id": workspace["workspace_id"],
        "profile_id": profile["profile_id"],
    })[1]
    return {"database": database, "profiles": profiles, "sessions": sessions,
            "records": records, "objects": objects, "port": port,
            "pid": profile["profile_id"], "sid": session["session_id"],
            "wid": workspace["workspace_id"]}


def rest_accept(h, key="turn-key", revision=1):
    _, turn = h["sessions"].create_turn(h["sid"], key, {
        "text": "hi", "expected_profile_revision": revision})
    return turn["turn_id"]


def row(h, turn_id, columns):
    with h["database"].read() as conn:
        row = conn.execute(
            f"SELECT {columns} FROM server_turns WHERE id=?", (turn_id,)).fetchone()
    return dict(zip(columns.split(","), row))


def test_p1_filing_dormant_without_filer(tmp_path):
    h = make_stack(tmp_path)
    turn_id = rest_accept(h)
    filing = h["records"].get_turn_filing(turn_id)
    assert filing["work_id"] is None and filing["dispatch_id"] is None, (
        "未组合 filer 时 K2-S 步必须完全中立（S 腿单行形零双建档窗口）")
    assert filing["execution_key"] == f"execution:{turn_id}", (
        "K1.1：键在受理事务内已落行，中立形同样携带（供合批形直接消费）")
    assert h["port"].accepted == [turn_id], "派发包线不变：accept 恰一次"


def test_p2_active_files_once_with_derived_key(tmp_path):
    filer = RecordingFiler()
    h = make_stack(tmp_path, filer=filer)
    turn_id = rest_accept(h)
    assert [c["execution_key"] for c in filer.calls] == [f"execution:{turn_id}"], (
        "键=自 turn_id 可推导初值（幂等、可调试、零秘密；裁 4.2）")
    filing = h["records"].get_turn_filing(turn_id)
    assert (filing["work_id"], filing["execution_id"], filing["dispatch_id"]) == (
        "work-1", "exec-1", "disp-1")
    assert row(h, turn_id, "state")["state"] == "accepted", (
        "建档步不推进状态机（running 归派发半边）")
    h["sessions"].file_core_records(turn_id)
    assert len(filer.calls) == 1, "重入＝幂等先行零再建档"


def test_p3_replay_receipt_refiles_nothing(tmp_path):
    filer = RecordingFiler()
    h = make_stack(tmp_path, filer=filer)
    turn_id = rest_accept(h)
    _, again = h["sessions"].create_turn(h["sid"], "turn-key", {
        "text": "hi", "expected_profile_revision": 1})
    assert again["turn_id"] == turn_id and len(filer.calls) == 1, (
        "同键重放走回执、零再建档零重派")


def test_p4_keys_and_raw_null_beta_column(tmp_path):
    h = make_stack(tmp_path)
    turn_id = rest_accept(h)
    with h["database"].read() as conn:
        rows = conn.execute(
            "SELECT id,execution_key,captured_profile_revision FROM server_turns"
        ).fetchall()
    assert len(rows) == 1
    assert rows[0][1] == f"execution:{rows[0][0]}"
    assert rows[0][2] is None, (
        "β（裁甲）：Session 行该列＝从未写的原始 NULL（唯一写入点=委派锚 INSERT、E 腿）")


def test_p5_k3_freeze_two_halves(tmp_path):
    h = make_stack(tmp_path)
    turn_id = rest_accept(h)
    ctx = h["records"].get_turn_context(turn_id)
    frozen = json.loads(h["objects"].read(ctx["effective_config_object_digest"]))
    assert frozen["permissions"] == DEFAULT_POSTURE
    row = h["profiles"].get(h["pid"])
    edited_digest = h["objects"].publish(canonical(EDITED)).digest
    h["profiles"].update_configuration(
        profile_id=h["pid"], expected_version=int(row["version"]),
        config_digest=edited_digest, key="cfg-1", request_digest="cfg-1",
    )
    after = json.loads(h["objects"].read(
        h["records"].get_turn_context(turn_id)["effective_config_object_digest"]))
    assert after == frozen, "本 turn：冻结件（含 permissions 节）不随受理后编辑漂移"
    session2 = h["sessions"].create_session("s2", {
        "workspace_id": h["wid"], "profile_id": h["pid"]})[1]
    h["sid"] = session2["session_id"]  # 前一 turn 仍 active：一枚 turn 一个会话
    turn2 = rest_accept(h, key="turn-key-2",
                        revision=int(h["profiles"].get(h["pid"])["config_revision"]))
    ctx2 = h["records"].get_turn_context(turn2)
    assert ctx2["effective_config_object_digest"] != ctx["effective_config_object_digest"]
    fresh = json.loads(h["objects"].read(ctx2["effective_config_object_digest"]))
    assert fresh["configuration"] == EDITED["configuration"], "下 turn：新值可分辨"

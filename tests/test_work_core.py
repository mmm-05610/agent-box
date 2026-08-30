from __future__ import annotations

import sqlite3

import pytest

from agent_box.core import db
from agent_box.work.models import (
    ArtifactRef,
    Attempt,
    AttemptStatus,
    Decision,
    EffectiveResolution,
    Handoff,
    RoleBinding,
    Work,
    WorkPhase,
    WorkStatus,
)
from agent_box.work.repository import WorkRepository
from agent_box.work.workflow import FixedPlanExecuteReviewWorkflow, WorkflowError


def _resolution(profile: str = "claude-architect") -> EffectiveResolution:
    return EffectiveResolution(
        profile_ref=profile,
        profile_digest="sha256:test",
        harness="claude",
        harness_version="1.0",
        provider_ref="anthropic",
        model="test-model",
        transport="acp",
        adapter_version="0.1",
        workspace_ref={"kind": "git-worktree", "path": "/tmp/work"},
    )


def _work() -> Work:
    return Work(
        id="work_test",
        objective="add capability resolver",
        acceptance_criteria=["resolve effective capabilities"],
        project_ref={"kind": "local-git", "root": "/repo", "base_sha": "abc"},
        role_bindings={
            "planner": RoleBinding("planner", "claude-architect"),
            "executor": RoleBinding("executor", "codex-coder"),
            "reviewer": RoleBinding("reviewer", "claude-reviewer"),
        },
    )


def test_migration_creates_work_tables(tmp_agent_box_home):
    conn = db.get_conn()
    tables = {
        row["name"]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    }
    assert {
        "works",
        "work_attempts",
        "work_decisions",
        "work_handoffs",
        "work_artifacts",
    } <= tables
    # The resource-observation ledger (007) is the newest migration so far.
    assert conn.execute("SELECT MAX(version) FROM schema_versions").fetchone()[0] >= 7
    execution_ref_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(core_execution_refs)").fetchall()
    }
    dispatch_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(core_dispatches)").fetchall()
    }
    assert "contract_id" in execution_ref_columns
    assert "inputs_digest" in dispatch_columns


def test_resource_contract_migration_upgrades_legacy_v005_dispatch_schema(
    tmp_agent_box_home,
):
    legacy_path = tmp_agent_box_home / "legacy-v005.db"
    conn = sqlite3.connect(legacy_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE schema_versions (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO schema_versions(version) VALUES (5);

        CREATE TABLE core_executions (id TEXT PRIMARY KEY);
        INSERT INTO core_executions(id) VALUES ('exec_legacy');

        CREATE TABLE core_execution_refs (
            execution_id TEXT NOT NULL,
            relation TEXT NOT NULL,
            type TEXT NOT NULL,
            provider TEXT NOT NULL,
            native_id TEXT NOT NULL,
            uri TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            PRIMARY KEY (execution_id, relation, type, provider, native_id)
        );

        CREATE TABLE core_dispatches (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL UNIQUE,
            idempotency_key TEXT NOT NULL UNIQUE,
            submission_digest TEXT NOT NULL,
            state TEXT NOT NULL,
            provider_correlation_ref TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO core_dispatches (
            id, execution_id, idempotency_key, submission_digest, state,
            provider_correlation_ref, created_at, updated_at
        ) VALUES (
            'dispatch_legacy', 'exec_legacy', 'legacy-key',
            'legacy-unverifiable:v0', 'starting', NULL, 't1', 't2'
        );
        """
    )

    db._run_migrations(conn)

    ref_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(core_execution_refs)").fetchall()
    }
    dispatch_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(core_dispatches)").fetchall()
    }
    migrated = conn.execute(
        "SELECT state, inputs_digest FROM core_dispatches WHERE id = 'dispatch_legacy'"
    ).fetchone()
    archived = conn.execute(
        "SELECT submission_digest, state FROM core_dispatches_pre_v006_archive "
        "WHERE id = 'dispatch_legacy'"
    ).fetchone()

    assert "contract_id" in ref_columns
    assert "inputs_digest" in dispatch_columns
    assert tuple(migrated) == ("legacy-unverifiable", None)
    assert tuple(archived) == ("legacy-unverifiable:v0", "starting")
    # The resource-observation ledger (007) is the newest migration so far.
    assert conn.execute("SELECT MAX(version) FROM schema_versions").fetchone()[0] >= 7


def test_resource_observation_evidence_metadata_migration_upgrades_v007_schema(
    tmp_agent_box_home,
):
    """008 adds evidence_meta_json without rewriting pre-008 ledger rows."""
    legacy_path = tmp_agent_box_home / "legacy-v007.db"
    conn = sqlite3.connect(legacy_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE schema_versions (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO schema_versions(version) VALUES (7);

        CREATE TABLE core_executions (id TEXT PRIMARY KEY);
        INSERT INTO core_executions(id) VALUES ('exec_legacy');

        CREATE TABLE core_resource_observations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            execution_id TEXT NOT NULL,
            contract_id TEXT NOT NULL,
            ref_type TEXT NOT NULL,
            ref_provider TEXT NOT NULL,
            ref_native_id TEXT NOT NULL,
            ref_uri TEXT,
            ref_meta_json TEXT NOT NULL DEFAULT '{}',
            ref_identity_digest TEXT NOT NULL,
            kind TEXT NOT NULL,
            result TEXT NOT NULL,
            observer_role TEXT NOT NULL,
            observer_id TEXT NOT NULL,
            observed_at TEXT NOT NULL,
            coverage TEXT NOT NULL,
            evidence_type TEXT,
            evidence_provider TEXT,
            evidence_native_id TEXT,
            evidence_uri TEXT,
            detail TEXT,
            observation_digest TEXT NOT NULL UNIQUE,
            recorded_at TEXT NOT NULL
        );
        INSERT INTO core_resource_observations (
            execution_id, contract_id, ref_type, ref_provider, ref_native_id,
            ref_uri, ref_meta_json, ref_identity_digest, kind, result,
            observer_role, observer_id, observed_at, coverage,
            evidence_type, evidence_provider, evidence_native_id, evidence_uri,
            detail, observation_digest, recorded_at
        ) VALUES (
            'exec_legacy', 'test.workspace@1', 'WorkspaceRef', 'fake', 'ws-1',
            NULL, '{}', 'sha256:identity', 'read_back', 'match',
            'resource_provider', 'git-worktree', '2026-08-27T12:00:00+00:00',
            'complete', 'ArtifactRef', 'fake', 'artifact-1', 'file:///e/artifact-1',
            'tracked HEAD/tree at finish', 'sha256:legacy-digest', 't1'
        );
        """
    )

    db._run_migrations(conn)

    columns = {
        row["name"]
        for row in conn.execute(
            "PRAGMA table_info(core_resource_observations)"
        ).fetchall()
    }
    assert "evidence_meta_json" in columns
    # Pre-008 rows keep every stored value; the added column defaults to {}
    # and history is not backfilled with fabricated metadata.
    row = conn.execute(
        "SELECT evidence_uri, evidence_meta_json FROM core_resource_observations "
        "WHERE observation_digest = 'sha256:legacy-digest'"
    ).fetchone()
    assert row["evidence_uri"] == "file:///e/artifact-1"
    assert row["evidence_meta_json"] == "{}"
    assert conn.execute(
        "SELECT MAX(version) FROM schema_versions"
    ).fetchone()[0] >= 8


def test_repository_round_trip_and_binding_revision(tmp_agent_box_home):
    repo = WorkRepository()
    created = repo.create(_work())
    assert created.phase is WorkPhase.PLAN
    assert created.role_bindings["planner"].profile_ref == "claude-architect"

    updated = repo.update_binding(
        created.id,
        RoleBinding(
            "planner",
            "deepseek-analyst",
            revision=2,
            changed_by="user",
            change_reason="provider replacement",
        ),
    )
    assert updated.role_bindings["planner"].revision == 2
    assert updated.role_bindings["planner"].profile_ref == "deepseek-analyst"


def test_attempt_resolution_and_boundary_transition_are_persisted(tmp_agent_box_home):
    repo = WorkRepository()
    repo.create(_work())
    attempt = repo.add_attempt(
        Attempt(
            id="attempt_p1",
            work_id="work_test",
            role_key="planner",
            binding_revision=1,
            effective_resolution=_resolution(),
        )
    )
    assert attempt.status is AttemptStatus.PENDING
    active = repo.start_attempt("attempt_p1", {"provider": "acp", "session_id": "C1"})
    assert active.status is AttemptStatus.ACTIVE

    done = repo.complete_attempt_and_advance(
        "attempt_p1",
        attempt_status=AttemptStatus.COMPLETED,
        outcome="planned",
        phase=WorkPhase.EXECUTE,
        work_status=WorkStatus.RUNNING,
    )
    assert done.outcome == "planned"
    assert repo.get("work_test").phase is WorkPhase.EXECUTE
    assert done.effective_resolution.profile_ref == "claude-architect"


def test_decision_artifact_and_handoff_are_indexed(tmp_agent_box_home):
    repo = WorkRepository()
    repo.create(_work())
    decision = repo.add_decision(
        Decision("decision_1", "work_test", "review_finding", "enforcement degraded")
    )
    artifact = repo.add_artifact(
        ArtifactRef(
            "artifact_1",
            "work_test",
            "handoff",
            "/tmp/handoff.md",
            "sha256:handoff",
        )
    )
    handoff = repo.add_handoff(
        Handoff(
            "handoff_1",
            "work_test",
            "planner",
            "profile replacement",
            artifact.id,
            artifact.digest,
            artifact.locator,
        )
    )
    assert decision.summary == "enforcement degraded"
    assert repo.get_handoff(handoff.id).artifact_id == artifact.id
    assert repo.list_artifacts("work_test")[0].metadata == {}


def test_fixed_workflow_happy_path_and_loops():
    workflow = FixedPlanExecuteReviewWorkflow()
    assert workflow.role_for_phase(WorkPhase.PLAN) == "planner"
    assert workflow.transition(WorkPhase.PLAN, "planned").phase is WorkPhase.EXECUTE
    assert workflow.transition(WorkPhase.EXECUTE, "implemented").phase is WorkPhase.REVIEW
    assert workflow.transition(WorkPhase.REVIEW, "needs_replan").phase is WorkPhase.PLAN
    assert workflow.transition(WorkPhase.REVIEW, "needs_fix").phase is WorkPhase.EXECUTE
    approved = workflow.transition(WorkPhase.REVIEW, "approved")
    assert approved.phase is WorkPhase.COMPLETE
    assert approved.status is WorkStatus.COMPLETED


def test_fixed_workflow_rejects_unknown_outcome():
    with pytest.raises(WorkflowError):
        FixedPlanExecuteReviewWorkflow().transition(WorkPhase.PLAN, "approved")

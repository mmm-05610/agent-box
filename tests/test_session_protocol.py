"""Root Session protocol pack boundary tests.

The pack must stay pure: no concrete plugins, no FastAPI/uvicorn, no SQLite
or any persistence, no filesystem IO, and no Harness business vocabulary.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SESSION_DIR = ROOT / "src" / "agent_box" / "protocols" / "session"

FORBIDDEN_VOCABULARY = re.compile(
    r"\b(codex|claude|claude-code|opencode|hermes|skill|skills|mcp|profile|profiles)\b|\bpi\b",
    re.IGNORECASE,
)
FORBIDDEN_IMPORTS = re.compile(
    r"^\s*(import|from)\s+(fastapi|uvicorn|sqlite3|starlette|pydantic|httpx)\b",
    re.MULTILINE,
)
FORBIDDEN_IO = re.compile(
    r"\b(open|connect)\s*\(|\bsqlite3\b|Path\(\s*[\"']", re.MULTILINE,
)


def _session_sources():
    return sorted(SESSION_DIR.rglob("*.py"))


def test_session_protocol_pack_exists_and_is_importable():
    import agent_box.protocols.session as session_pack

    assert session_pack.SESSION_PROTOCOL_VERSION == 1
    for name in session_pack.__all__:
        assert getattr(session_pack, name) is not None


def test_session_protocol_pack_is_business_vocabulary_free():
    violations = []
    for path in _session_sources():
        for number, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            if FORBIDDEN_VOCABULARY.search(line):
                violations.append(
                    f"{path.relative_to(ROOT)}:{number}: {line.strip()[:120]}"
                )
    assert violations == []


def test_session_protocol_pack_has_no_persistence_or_web_imports():
    violations = []
    for path in _session_sources():
        text = path.read_text(encoding="utf-8")
        for pattern in (FORBIDDEN_IMPORTS, FORBIDDEN_IO):
            match = pattern.search(text)
            if match:
                violations.append(
                    f"{path.relative_to(ROOT)}: {pattern.pattern!r} matched near "
                    f"{text[:match.start()].count(chr(10)) + 1}"
                )
    assert violations == []


def test_session_protocol_pack_import_is_pure():
    """Importing the pack must not pull web frameworks, sqlite, or plugins."""
    code = (
        "import sys\n"
        "import agent_box.protocols.session\n"
        "forbidden = [m for m in sys.modules if m.split('.')[0] in\n"
        "             ('fastapi', 'uvicorn', 'sqlite3', 'starlette', 'pydantic',\n"
        "              'agent_box_harnesses', 'agent_box_session',\n"
        "              'agent_box_workspace_local', 'agent_box_studio',\n"
        "              'agent_box_web', 'agent_box_git')]\n"
        "print(forbidden)\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, check=True
    )
    assert result.stdout.strip() == "[]"


def test_contribution_kind_is_namespaced_and_versioned():
    from agent_box.extensions.contribution import ContributionDescriptor

    from agent_box.protocols.session import (
        SESSION_CODEC_KIND,
        SESSION_STORE_KIND,
    )

    for kind in (SESSION_STORE_KIND, SESSION_CODEC_KIND):
        ContributionDescriptor(kind, "probe-component")


def test_session_store_contribution_wrapper_is_typed():
    from agent_box.protocols.session import (
        SESSION_STORE_KIND,
        session_store_contribution,
    )

    class ProbeStore:
        """Structurally valid no-op probe: every SPI member is callable."""

        store_id = "probe-session-store"

        def __getattr__(self, name):
            def _noop(*args, **kwargs):
                return None

            return _noop

    contribution = session_store_contribution(ProbeStore())
    assert contribution.descriptor.kind == SESSION_STORE_KIND
    assert contribution.descriptor.component_id == "probe-session-store"
    assert contribution.component is not None


def test_session_store_contribution_wrapper_rejects_unnamed_store():
    from agent_box.protocols.session import session_store_contribution

    class Anonymous:
        pass

    try:
        session_store_contribution(Anonymous())
    except TypeError:
        pass
    else:
        raise AssertionError("unnamed store must fail closed")


def test_catalog_query_helper_is_kind_and_component_id_only():
    from agent_box.extensions.api import PluginRegistration
    from agent_box.extensions.catalog import ExtensionCatalogBuilder
    from agent_box.protocols.session import SESSION_STORE_KIND, session_store_contribution

    class ProbeStore:
        """Structurally valid no-op probe: every SPI member is callable."""

        store_id = "probe-session-store"

        def __getattr__(self, name):
            def _noop(*args, **kwargs):
                return None

            return _noop

    store = ProbeStore()
    contribution = session_store_contribution(store)
    builder = ExtensionCatalogBuilder()
    builder.commit(builder.prepare(PluginRegistration(contributions=(contribution,)), plugin_id="probe"))
    catalog = builder.build()
    assert catalog.query(SESSION_STORE_KIND, "probe-session-store") is store
    assert catalog.query(SESSION_STORE_KIND) == (store,)
    # No business-specific query surface exists.
    assert not hasattr(catalog, "query_session")


def test_loss_report_severity_semantics():
    from agent_box.protocols.session import (
        LossReport,
        LossSeverity,
        TranslationLoss,
    )

    report = LossReport(
        source_watermark=3,
        target_harness="target-a",
        target_format_version="1",
        losses=(
            TranslationLoss(None, "ui_field", LossSeverity.NON_SEMANTIC, "vendor_ui", "ignored"),
            TranslationLoss("r1", "reasoning", LossSeverity.CONFIRMABLE, "private", "confirm"),
            TranslationLoss("r2", "tool_result", LossSeverity.BLOCKING, "unrepresentable", "blocked"),
        ),
    )
    assert len(report.confirmable) == 1
    assert len(report.blocking) == 1


def test_typed_failure_vocabulary_is_public():
    from agent_box.protocols.session import failures

    for name in (
        "SessionError",
        "SessionNotFound",
        "SessionWriterConflict",
        "TerminalAlreadyRecorded",
        "InvalidTurnTransition",
        "IdempotencyConflict",
        "WatermarkViolation",
        "MalformedSessionState",
        "RecoveryRequired",
        "ResyncRequired",
    ):
        assert hasattr(failures, name), name


def test_resync_required_carries_cursor_facts():
    from agent_box.protocols.session import ResyncRequired

    error = ResyncRequired("sess-1", "cursor ahead of watermark", current_watermark=7)
    assert error.current_watermark == 7
    assert "resync" in str(error).lower()


def test_workspace_ref_metadata_vocabulary_marks_live_facts():
    """Live-workspace honesty markers are protocol-level, not vendor fields."""
    from agent_box.protocols.session import contracts

    assert contracts.WORKSPACE_META_MODE == "workspace_mode"
    assert contracts.WORKSPACE_META_MUTABILITY == "mutability"
    assert contracts.WORKSPACE_META_FROZEN == "input_frozen"


def test_turn_state_only_has_real_states():
    from agent_box.protocols.session import TurnState

    assert set(TurnState) == {
        TurnState.RUNNING,
        TurnState.COMPLETED,
        TurnState.FAILED,
        TurnState.RECOVERY_REQUIRED,
    }
    assert TurnState.RUNNING.terminal is False
    assert TurnState.COMPLETED.terminal is True
    assert TurnState.RECOVERY_REQUIRED.terminal is True


def test_binding_snapshot_is_neutral_and_frozen():
    import dataclasses

    from agent_box.protocols.session import BindingSnapshot

    snapshot = BindingSnapshot(turn_id="t1", session_watermark=2)
    assert dataclasses.is_dataclass(snapshot)
    assert snapshot.__dataclass_params__.frozen
    assert snapshot.harness_provider_id is None
    assert snapshot.model_selection is None


def test_session_turn_input_contract_is_bounded_and_frozen():
    import dataclasses

    from agent_box.protocols.session import (
        SESSION_TURN_INPUT_CONTRACT_ID,
        SessionTurnInputV1,
    )

    assert SESSION_TURN_INPUT_CONTRACT_ID == "agent-box.session-turn-input@1"
    value = SessionTurnInputV1(turn_id="t1", text="hello")
    assert dataclasses.is_dataclass(value)
    assert value.__dataclass_params__.frozen
    try:
        SessionTurnInputV1(turn_id="t1", text="x" * (129 * 1024))
    except ValueError:
        pass
    else:
        raise AssertionError("unbounded input text must be rejected")

"""PiSessionResourceProvider and PiSessionScanner tests."""
from __future__ import annotations

from pathlib import Path

import pytest

from agent_box.work_core import Ref, RefType

from agent_box_pi import PiContinuationV1, PiSessionResourceProvider, PiSessionScanner
from agent_box_pi.config import PiPluginConfig

from helpers import make_config, write_session_file


def _provider(tmp_path: Path) -> PiSessionResourceProvider:
    return PiSessionResourceProvider(config_loader=lambda: make_config(tmp_path))


def test_resource_provider_descriptor_and_supported_contracts(tmp_path: Path) -> None:
    provider = _provider(tmp_path)
    assert provider.descriptor().id == "pi-session"
    assert provider.supported_contract_ids == frozenset({PiContinuationV1.contract_id})


def test_resolve_by_file_resolves_continuation(tmp_path: Path) -> None:
    file = write_session_file(make_config(tmp_path).resolved_session_root, "session-abc")
    ref = Ref(
        RefType.SESSION,
        "pi-session",
        "session-abc",
        uri=file.as_uri(),
        metadata={
            "session_id": "session-abc",
            "session_file": str(file),
            "provider": "deepseek",
            "model": "deepseek/deepseek-v4-flash",
            "digest": "sha256:" + "0" * 64,
        },
    )
    # digest mismatch -> refuse to resume a drift-mutated native session
    with pytest.raises(ValueError, match="digest differs"):
        _provider(tmp_path).resolve(PiContinuationV1.contract_id, ref)
    ref2 = Ref(
        RefType.SESSION,
        "pi-session",
        "session-abc",
        uri=file.as_uri(),
        metadata={"session_id": "session-abc", "session_file": str(file), "provider": "deepseek"},
    )
    continuation = _provider(tmp_path).resolve(PiContinuationV1.contract_id, ref2)
    assert continuation.session_id == "session-abc"
    assert continuation.session_file == str(file)
    assert continuation.provider == "deepseek"


def test_resolve_by_id_when_file_metadata_absent(tmp_path: Path) -> None:
    root = make_config(tmp_path).resolved_session_root
    write_session_file(root, "session-by-id")
    ref = Ref(
        RefType.SESSION,
        "pi-session",
        "session-by-id",
        metadata={"session_id": "session-by-id", "provider": "deepseek"},
    )
    continuation = _provider(tmp_path).resolve(PiContinuationV1.contract_id, ref)
    assert continuation.session_id == "session-by-id"
    assert continuation.session_path is not None
    assert continuation.session_path.is_file()


def test_resolve_rejects_unknown_metadata_and_missing_file(tmp_path: Path) -> None:
    provider = _provider(tmp_path)
    with pytest.raises(ValueError, match="unknown metadata"):
        provider.resolve(
            PiContinuationV1.contract_id,
            Ref(RefType.SESSION, "pi-session", "x", metadata={"api_key": "sk-x"}),
        )
    with pytest.raises(ValueError, match="no longer exists"):
        provider.resolve(
            PiContinuationV1.contract_id,
            Ref(
                RefType.SESSION,
                "pi-session",
                "ghost",
                metadata={
                    "session_id": "ghost",
                    "session_file": str(tmp_path / "missing.jsonl"),
                    "provider": "deepseek",
                },
            ),
        )


def test_scanner_lists_sessions_with_metadata(tmp_path: Path) -> None:
    config = make_config(tmp_path)
    write_session_file(config.resolved_session_root, "scanned-one", name="research one")
    write_session_file(config.resolved_session_root, "scanned-two")
    scanner = PiSessionScanner(config)
    sessions = scanner.list()
    ids = {info.session_id for info in sessions}
    assert ids == {"scanned-one", "scanned-two"}
    one = next(info for info in sessions if info.session_id == "scanned-one")
    assert one.name == "research one"
    assert one.model == "deepseek-v4-flash"
    assert one.provider == "deepseek"
    assert one.message_count == 2
    assert one.first_message == "Investigate the architecture."
    assert scanner.locate("scanned-two") is not None
    assert scanner.locate("nope") is None
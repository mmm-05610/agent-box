"""Order 088: `wsl.exe` output decoding must never crash the reader path.

The trial (Windows Server + WSL Worker) hit
``UnicodeDecodeError: 'utf-8' codec can't decode byte 0xd2 ...`` inside
``subprocess._readerthread``. The connector already routes `wsl.exe` bytes
through ``_decode_windows_output``; this suite locks that the decoder is total -
no buffer, however truncated or code-page-encoded, raises - and that a real
Windows UTF-16 distribution list still parses. Counter-examples assert the naive
pre-fix strategies raise on the same bytes, so the guard is load-bearing.
"""
from __future__ import annotations

import json
import types

import pytest

from agent_box_runtime_wsl import connector as connector_module
from agent_box_runtime_wsl.connector import WslConnector, _decode_windows_output


# Every buffer must come back as a str, never raise.
NON_UTF8_BUFFERS = [
    ("d2 leading, code page", b"\xd2\xee"),
    ("d2 mid, ascii around", b"Ubuntu\x41\xd2\x42\r\n"),
    ("odd length, looks UTF-16LE (truncated)", b"U\x00b\x00x"),
    ("odd null-heavy (truncated)", b"\x41\x00\x42\x00\x43"),
    ("BOM then truncated pair", b"\xff\xfe\x41"),
    ("lone high byte", b"\xd2"),
    ("empty", b""),
    ("plain utf-8", b"Ubuntu\r\n"),
    ("stray nulls no pattern", b"\x00\x00\x00\xff\xfe\xfd"),
]


@pytest.mark.parametrize("label, raw", NON_UTF8_BUFFERS, ids=[b[0] for b in NON_UTF8_BUFFERS])
def test_decode_never_raises_on_non_utf8(label, raw):
    """G1: the same non-UTF-8 input no longer throws UnicodeDecodeError.
    G2: a defined readable string comes back (never an unhandled exception);
    for a non-empty buffer it is a non-empty decoded text, not a silent empty."""
    result = _decode_windows_output(raw)
    assert isinstance(result, str), label
    if raw:
        assert result != "", label  # silent empty string is a failure (G2)


def test_utf16_distribution_list_still_parses():
    """The happy path a Windows host actually emits is UTF-16LE; robustness must
    not have cost us correct decoding of the real thing."""
    raw = "Ubuntu\r\ndebian\r\n".encode("utf-16-le")
    assert _decode_windows_output(raw) == "Ubuntu\r\ndebian\r\n"


def test_naive_strict_utf8_crashes_on_code_page():
    """G1/G3 counter-example: the trial's own input crashes the pre-fix strict
    UTF-8 read, but the guarded decoder survives it."""
    raw = b"\xd2\xee"
    with pytest.raises(UnicodeDecodeError):
        raw.decode("utf-8")
    assert isinstance(_decode_windows_output(raw), str)


def test_naive_unwrapped_utf16le_crashes_on_truncated():
    """The other pre-fix crash: an odd-length buffer that *looks* UTF-16LE raises
    ``truncated data`` from the unwrapped guess, and the decoder now falls through
    to a lossy read instead."""
    raw = b"U\x00b\x00x"
    assert raw.decode("utf-8")  # valid UTF-8 - so the guard's value is UTF-16LE-side
    with pytest.raises(UnicodeDecodeError):
        raw.decode("utf-16-le")
    assert isinstance(_decode_windows_output(raw), str)


def _connector(tmp_path):
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({
        "schemaVersion": 1, "wireVersion": 1, "workerVersion": "1",
        "sha256": "sha256:" + "0" * 64,
    }), encoding="utf-8")
    return WslConnector(
        manifest_path=manifest, linux_worker_path="/usr/bin/true", server_instance_id="srv")


def test_run_over_non_utf8_wsl_output_survives(tmp_path, monkeypatch):
    """G1 at the exact trial call site: `wsl.exe --list --quiet` answering a
    truncated UTF-16LE-looking buffer must not raise out of `_run`."""
    def fake_run(command, **_kwargs):
        assert command[:2] == ["wsl.exe", "--list"], command
        return types.SimpleNamespace(returncode=0, stdout=b"U\x00b\x00x", stderr=b"")

    monkeypatch.setattr(connector_module.subprocess, "run", fake_run)
    result = WslConnector._run(["wsl.exe", "--list", "--quiet"])
    assert isinstance(result.stdout, str)


def test_distributions_from_real_windows_utf16_list(tmp_path, monkeypatch):
    """G3: a Windows-style UTF-16LE `--list --quiet` answer parses to distribution
    names through the connector (proves the decode boundary is exercised, not just
    that a crash was avoided)."""
    def fake_run(command, **_kwargs):
        return types.SimpleNamespace(
            returncode=0, stdout="Ubuntu\r\ndebian\r\n".encode("utf-16-le"), stderr=b"")

    monkeypatch.setattr(connector_module.subprocess, "run", fake_run)
    names = _connector(tmp_path).distributions()
    assert names == [{"name": "Ubuntu"}, {"name": "debian"}]

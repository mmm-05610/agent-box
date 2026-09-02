"""Framing unit tests: NDJSON bounds, partial lines, malformed input."""
from __future__ import annotations

import pytest

from agent_box_acp.errors import AcpEngineError
from agent_box_acp.framing import (
    FrameDecoder, FrameTooLarge, decode_line, encode_message,
)


def test_feed_splits_lines_across_chunks():
    decoder = FrameDecoder()
    lines = decoder.feed(b'{"a":1}\n')
    assert lines == [b'{"a":1}']
    lines = decoder.feed(b'{"b":2}')
    assert lines == []
    lines = decoder.feed(b'\n')
    assert lines == [b'{"b":2}']


def test_feed_handles_crlf():
    decoder = FrameDecoder()
    assert decoder.feed(b'{"a":1}\r\n') == [b'{"a":1}']


def test_partial_line_never_emitted_until_newline():
    decoder = FrameDecoder()
    assert decoder.feed(b'{"a":1}') == []
    assert decoder.has_partial()
    assert decoder.feed(b'\n') == [b'{"a":1}']
    assert not decoder.has_partial()


def test_frame_too_large_rejected_and_dropped():
    decoder = FrameDecoder(max_frame_bytes=16)
    with pytest.raises(FrameTooLarge):
        decoder.feed(b'{"oversized":"' + b"x" * 64 + b'"}\n')


def test_partial_line_buffering_bound():
    decoder = FrameDecoder(max_frame_bytes=16)
    with pytest.raises(FrameTooLarge):
        decoder.feed(b"x" * (5 << 20))


def test_encode_escapes_embedded_newlines_safely():
    # JSON-RPC values containing newlines are escaped by ensure_ascii, so
    # the encoded frame stays a single physical line.
    frame = encode_message({"content": "line1\nline2"})
    assert b"\n" not in frame[:-1] or frame.endswith(b"\n") is False
    assert b"line1" in frame


def test_encode_bounds_frame_size():
    with pytest.raises(AcpEngineError):
        encode_message({"content": "x" * (2 << 20)}, max_bytes=1024)


def test_decode_roundtrip():
    payload = {"jsonrpc": "2.0", "id": 7, "method": "session/new", "params": {"cwd": "/tmp"}}
    assert decode_line(encode_message(payload)) == payload


def test_decode_rejects_non_object_and_malformed_json():
    from agent_box_acp.errors import AcpEngineError

    with pytest.raises(AcpEngineError):
        decode_line(b"not json at all")
    with pytest.raises(AcpEngineError):
        decode_line(b'[1,2,3]')


def test_decode_rejects_excessive_depth():
    deep = '{"a":' * 40 + "1" + "}" * 40
    with pytest.raises(AcpEngineError):
        decode_line(deep.encode())


def test_decode_rejects_nul_in_utf8():
    with pytest.raises(AcpEngineError):
        decode_line(b'{"a":"\x00"}')
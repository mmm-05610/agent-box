"""Tests for gui.wsl read_file / save_file / _shell_quote.

The real functions shell out to ``wsl.exe`` — under test we
monkeypatch ``subprocess.run`` to capture the command line and return
canned stdout, and ``shutil.which`` so ``wsl.exe`` resolves to a fake
path.  No real WSL / Windows process is spawned.

gui.wsl is verified to import without customtkinter.
"""
from __future__ import annotations

import base64
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

# gui/ lives at the project root, not under src/agent_box.  Add the
# repo root to sys.path so `import gui.wsl` resolves.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from gui.wsl import _shell_quote, read_file, save_file  # noqa: E402


# --- _shell_quote --------------------------------------------------------

def test_shell_quote_plain_token_unchanged():
    assert _shell_quote("/path/with/no/specials") == "/path/with/no/specials"


def test_shell_quote_space():
    assert _shell_quote("/path with space/x") == "'/path with space/x'"


def test_shell_quote_single_quote_inside():
    """A path containing a single quote must use the end-mid-end trick
    to safely embed it inside single quotes:  'foo'\"'\"'bar'"""
    quoted = _shell_quote("/path/it's/x")
    # ends in single quotes wrapping the original token with ' → '"'"'
    assert quoted.startswith("'") and quoted.endswith("'")
    # Strip outer quotes and check the ' is still there as a substring
    inner = quoted[1:-1]
    assert "'" in inner
    assert "it" in inner and "s/x" in inner


def test_shell_quote_dollar():
    """$-chars must trigger quoting to avoid shell expansion."""
    assert _shell_quote("/path/$HOME/x") == "'/path/$HOME/x'"


# --- read_file ------------------------------------------------------------

class _FakeProc:
    def __init__(self, returncode=0, stdout=b"", stderr=b""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def test_read_file_uses_cat_and_decodes(monkeypatch):
    """read_file must invoke `cat <path>` via wsl bash -lc, and decode
    the captured stdout.  Uses a path with a space so the WS1
    unquoted-path regression (path with space) is covered."""
    captured: dict = {}

    def _fake_which(name):
        captured.setdefault("which_calls", []).append(name)
        return "/usr/bin/wsl.exe" if name == "wsl.exe" else None

    def _fake_run(argv, **kwargs):
        captured["argv"] = argv
        captured["kwargs"] = kwargs
        return _FakeProc(returncode=0, stdout=b"file contents")

    monkeypatch.setattr("gui.wsl.shutil.which", _fake_which)
    monkeypatch.setattr("gui.wsl.subprocess.run", _fake_run)

    # Use a path with a space — _shell_quote must single-quote it so
    # the shell doesn't split it into two tokens.
    out = read_file("/p/x with space")
    assert out == "file contents"
    # argv is [wsl, "bash", "-lc", "cat '<quoted path>'"]
    assert captured["argv"][0] == "/usr/bin/wsl.exe"
    assert captured["argv"][1:3] == ["bash", "-lc"]
    cmdline = captured["argv"][3]
    assert cmdline.startswith("cat ")
    # The path with space is single-quoted — this is the WS1 contract.
    assert "'/p/x with space'" in cmdline
    # capture_output, timeout, cwd are passed through
    assert captured["kwargs"]["capture_output"] is True
    assert captured["kwargs"]["timeout"] == 10


def test_read_file_failure_returns_none(monkeypatch):
    """Non-zero returncode → None (not an exception)."""
    monkeypatch.setattr("gui.wsl.shutil.which",
                        lambda n: "/usr/bin/wsl.exe" if n == "wsl.exe" else None)
    monkeypatch.setattr("gui.wsl.subprocess.run",
                        lambda *a, **kw: _FakeProc(returncode=1, stdout=b""))

    assert read_file("/p/x") is None


def test_read_file_timeout_returns_none(monkeypatch):
    """subprocess.TimeoutExpired is swallowed → None."""
    def _raise_timeout(*a, **kw):
        raise subprocess.TimeoutExpired(cmd=a[0] if a else "x", timeout=kw.get("timeout"))
    monkeypatch.setattr("gui.wsl.shutil.which",
                        lambda n: "/usr/bin/wsl.exe" if n == "wsl.exe" else None)
    monkeypatch.setattr("gui.wsl.subprocess.run", _raise_timeout)

    assert read_file("/p/x") is None


# --- save_file (WS1 unquoted-path regression) ----------------------------

def test_save_file_base64_round_trip(monkeypatch):
    """save_file must use `base64 -d > <path>` so that paths with
    spaces / quotes are safe.  The captured stdin must base64-decode
    back to the original content."""
    captured: dict = {}

    def _fake_which(name):
        return "/usr/bin/wsl.exe" if name == "wsl.exe" else None

    def _fake_run(argv, **kwargs):
        captured["argv"] = argv
        captured["kwargs"] = kwargs
        return _FakeProc(returncode=0)

    monkeypatch.setattr("gui.wsl.shutil.which", _fake_which)
    monkeypatch.setattr("gui.wsl.subprocess.run", _fake_run)

    payload = "héllo\nworld"
    assert save_file("/p/x with space", payload) is True

    cmdline = captured["argv"][3]
    assert cmdline.startswith("base64 -d > ")
    # Path is quoted (this is the WS1 regression — a path with a space
    # must be quoted so the shell doesn't split it).
    assert "'/p/x with space'" in cmdline

    # The base64 payload was fed via stdin (input= kwarg)
    encoded = captured["kwargs"]["input"]
    assert base64.b64decode(encoded).decode("utf-8") == payload


def test_save_file_failure_raises_runtime_error(monkeypatch):
    """Non-zero returncode → RuntimeError carrying the exit code."""
    monkeypatch.setattr("gui.wsl.shutil.which",
                        lambda n: "/usr/bin/wsl.exe" if n == "wsl.exe" else None)
    monkeypatch.setattr("gui.wsl.subprocess.run",
                        lambda *a, **kw: _FakeProc(returncode=2, stderr=b"boom"))

    with pytest.raises(RuntimeError, match="wsl command failed"):
        save_file("/p/x", "data")

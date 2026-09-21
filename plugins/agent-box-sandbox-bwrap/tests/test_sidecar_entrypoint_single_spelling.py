"""P-T2 / D8b: the fixed sidecar entrypoint is spelled once, and still refused otherwise."""
from __future__ import annotations

import inspect
from pathlib import Path

import pytest

from agent_box.extensions.sandbox import ProjectionRejected
from agent_box_sandbox_bwrap.provider import SIDECAR_ENTRYPOINT, compile_remote_sidecar_bwrap_argv
from agent_box_sandbox_bwrap.sidecar_room import compose_codex_room, compose_sidecar_room

LITERAL = "/runtime/view/agentbox-sidecar/runtime/worker-entry.mjs"


def test_the_default_of_both_public_shapes_is_the_one_constant():
    # The drift this removes is not cosmetic: the room builder used to hand the
    # compiler a second spelling of the same path, so a change to one of them could
    # only ever surface as a refusal no caller could satisfy.
    assert SIDECAR_ENTRYPOINT == LITERAL
    for function in (compose_sidecar_room, compose_codex_room, compile_remote_sidecar_bwrap_argv):
        parameter = inspect.signature(function).parameters.get("entrypoint")
        if parameter is not None:
            assert parameter.default is SIDECAR_ENTRYPOINT, function.__name__


def test_the_fixed_entrypoint_is_spelled_once_in_the_package_source():
    source_root = Path(compile_remote_sidecar_bwrap_argv.__code__.co_filename).parent
    spellings = [path.name for path in sorted(source_root.glob("*.py")) if LITERAL in path.read_text()]
    assert spellings == ["provider.py"], spellings


def test_the_template_still_refuses_any_other_entrypoint():
    # Guard preserved:收敛到一个常量不得放宽那道固定模板的闸门。
    with pytest.raises(ProjectionRejected, match="outside the fixed template"):
        compile_remote_sidecar_bwrap_argv(
            workspace="/workspace", runtime_view="/runtime/view",
            environment={"PATH": "/usr/bin"},
            entrypoint="/runtime/view/agentbox-sidecar/runtime/other-entry.mjs",
        )


def test_the_constant_is_the_value_the_room_launches():
    # End-to-end inside the plugin: the room the builder accepts is the path the
    # compiler checks, so the single constant is the single truth, not a third name.
    argv = compile_remote_sidecar_bwrap_argv(
        workspace="/workspace", runtime_view="/runtime/view",
        environment={"PATH": "/usr/bin"},
    )
    assert SIDECAR_ENTRYPOINT in argv

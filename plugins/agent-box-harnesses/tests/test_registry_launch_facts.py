"""Determined repair A: corrected launch facts for all five Harnesses.

Evidence: docs/research/harness-native-knowledge-2026-09-01/harnesses/<id>/FACTS.md
(C launch-mode sections) and matrices/identity-and-executable.md §4.
"""
import pytest

from agent_box_harnesses.registry import load_builtin_registry


@pytest.mark.parametrize("driver,expected_argv", [
    ("codex", ("codex", "exec", "--json", "--skip-git-repo-check")),
    ("claude", ("claude", "--print", "--output-format", "stream-json", "--verbose")),
    ("opencode", ("opencode", "run", "--format", "json")),
    ("hermes", ("hermes", "-z")),
    ("pi", ("pi", "--mode", "json")),
])
def test_exec_launch_argv_golden(driver, expected_argv):
    registry = {d.driver: d for d in load_builtin_registry().all()}
    mode = next(m for m in registry[driver].launch_modes if m.name == "exec")
    assert mode.argv == expected_argv


def test_hermes_does_not_declare_nonexistent_print_flag():
    hermes = {d.driver: d for d in load_builtin_registry().all()}["hermes"]
    for mode in hermes.launch_modes:
        assert "--print" not in mode.argv


def test_pi_has_no_agent_dir_flag_in_argv():
    registry = load_builtin_registry()
    pi = {d.driver: d for d in registry.all()}["pi"]
    for mode in pi.launch_modes:
        assert "--agent-dir" not in mode.argv
        assert all("/runtime" not in token for token in mode.argv)


def test_codex_bundle_members_are_not_a_separate_binary_list():
    # identity-and-executable.md §4: codex-app-server is an argv[0] alias /
    # subcommand of the same binary, not a second installed binary.
    codex = {d.driver: d for d in load_builtin_registry().all()}["codex"]
    assert codex.executable.bundle_members == ()
    assert "app-server" not in codex.executable.bundle_members


def test_skill_targets_are_the_current_native_roots():
    # skill targets are owned by the NativeHomePolicy (evidence-backed),
    # no longer decorated fields of the Registry profile spec.
    expected = {
        "codex": ".agents/skills",          # $HOME/.agents/skills (current), not deprecated $CODEX_HOME/skills
        "claude": ".claude/skills",         # <CLAUDE_CONFIG_DIR>/skills
        "opencode": ".config/opencode/skills",  # XDG global skill root
        "hermes": ".hermes/skills",         # $HERMES_HOME/skills
        "pi": "skills",                     # <PI_CODING_AGENT_DIR>/skills
    }
    from agent_box_harnesses.native_home.policy import policy_for
    for definition in load_builtin_registry().all():
        policy = policy_for(definition.harness_type)
        assert policy.skill_targets[0] == expected[definition.driver], definition.driver
        assert not policy.skill_targets[0].startswith("/")


def test_deprecated_codex_home_skills_is_not_the_declared_target():
    from agent_box_harnesses.native_home.policy import CODEX_POLICY
    # the deprecated $CODEX_HOME/skills root must not be the managed target
    assert CODEX_POLICY.skill_targets[0] == ".agents/skills"
    assert CODEX_POLICY.skill_targets[0] != ".codex/skills"


def test_config_format_matches_native_files():
    expected = {"codex": "toml", "claude": "json", "opencode": "json", "hermes": "yaml", "pi": "json"}
    for definition in load_builtin_registry().all():
        assert definition.profile.config_format == expected[definition.driver], definition.driver


def test_continuation_kinds_are_native_sessions():
    # hermes "transcript handoff" was an Agent-Box scoping choice, not a native
    # limitation (hermes FACTS C.1); opencode has native -s resume (I5).
    for definition in load_builtin_registry().all():
        assert definition.continuation.kind == "native_session", definition.driver


def test_declared_capabilities_have_adapter_implementations():
    from agent_box_harnesses.adapters import ADAPTERS

    for definition in load_builtin_registry().all():
        implemented = ADAPTERS[definition.driver].implemented_capabilities
        missing = set(definition.capabilities) - implemented
        assert not missing, f"{definition.driver} declares unimplemented capabilities: {sorted(missing)}"

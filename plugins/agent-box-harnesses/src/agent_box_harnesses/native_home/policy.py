"""Harnesses-owned NativeHomePolicy: the only path authority for native homes.

One policy per official Harness recognises only the evidence-confirmed
boundaries of its native environment (skills, credentials, ephemeral state,
sessions) and never enumerates the whole environment.  Path classification
LIVES here; neither the Root, nor the Web, nor any other plugin may decide
what a ``.codex``/``.claude``/... path means.

Evidence annotations reference:
  docs/research/harness-native-knowledge-2026-09-01/harnesses/<id>/FACTS.md
  docs/research/central-skill-repository-patterns-2026-09-02/harnesses/<id>.md

Policies are declarative tables; the walk/copy logic in ``tree.py`` is the
only consumer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Mapping, Sequence

# ---------------------------------------------------------------------------
# classification
# ---------------------------------------------------------------------------

CREDENTIAL = "credential"      # never copied, never snapshotted, never read
EPHEMERAL = "ephemeral"        # cache/lock/tmp: not persisted, not copied
SESSION = "session"            # native session/checkpoint: allowed to persist
UNKNOWN = "unknown"            # unknown-but-safe plain files: preserved
SKILL = "skill"                # skill target roots (installed/profile-local)
CONFIG_AUTHORITY = "config"    # Agent-Box managed config patch targets


@dataclass(frozen=True)
class PathRule:
    """One policy rule for a guest-home-relative path.

    ``relative`` is a POSIX path relative to the native-home root (the guest
    HOME).  Directory rules match the directory and everything below it.
    Rules are ordered; the first match wins.
    """

    relative: str
    kind: str
    evidence: str = ""

    def __post_init__(self) -> None:
        path = PurePosixPath(self.relative)
        if self.relative.startswith("/") or ".." in path.parts or not self.relative:
            raise ValueError("policy rule path must be guest-home-relative and canonical")
        if self.kind not in {CREDENTIAL, EPHEMERAL, SESSION, UNKNOWN, SKILL, CONFIG_AUTHORITY}:
            raise ValueError(f"invalid policy rule kind: {self.kind}")


@dataclass(frozen=True)
class NativeHomePolicy:
    """Declarative per-Harness policy over one native home (the guest HOME)."""

    harness_type: str
    # Guest-relative skill target roots where central skills are installed.
    skill_targets: tuple[str, ...] = ()
    # Known credential paths: excluded from snapshots/digests/logs; never read.
    known_credential_paths: tuple[str, ...] = ()
    # Known ephemeral paths: locks/sockets/caches/tmp; never persisted/copied.
    known_ephemeral_paths: tuple[str, ...] = ()
    # Known session/checkpoint paths: harness state that MAY persist.
    known_session_paths: tuple[str, ...] = ()
    # Managed native configuration files (Agent-Box render targets).
    config_patch_authorities: tuple[str, ...] = ()
    # Project-scoped skill discovery roots walked from the worktree root.
    project_skill_roots: tuple[str, ...] = ()
    # Execution-scope limits (bounded native homes).
    max_files: int = 4096
    max_tree_bytes: int = 512 * 1024 * 1024
    forbidden: tuple[str, ...] = ("symlink", "socket", "device", "fifo", "lock")

    def __post_init__(self) -> None:
        for group in (self.skill_targets, self.known_credential_paths, self.known_ephemeral_paths,
                      self.known_session_paths, self.config_patch_authorities, self.project_skill_roots):
            for relative in group:
                path = PurePosixPath(relative)
                if relative.startswith("/") or ".." in path.parts or not relative:
                    raise ValueError(f"policy path must be guest-home-relative: {relative!r}")

    # ------------------------------------------------------------------
    # classification
    # ------------------------------------------------------------------
    def classify(self, relative: str) -> str:
        """Classify one guest-home-relative path (first rule wins)."""
        path = PurePosixPath(relative)
        if relative.startswith("/") or ".." in path.parts:
            raise ValueError(f"policy classification requires a guest-home-relative path: {relative!r}")
        parts = path.parts
        if parts and (parts[-1] == "auth.json" or parts[-1].endswith(".credentials.json") or parts[-1] == ".env"):
            # Generic credential-shaped names are classified by the explicit
            # rules below; this guard only refuses silent reclassification.
            pass
        for rule in self._rules():
            if self._matches(rule.relative, relative):
                return rule.kind
        return UNKNOWN

    def host_relative(self, guest_relative: str) -> str:
        """Map a guest-home-relative path to the host native-home layout.

        XDG-style homes live under their own subdirectories of the guest
        home (``.config/opencode`` etc.); everything is already stored as it
        appears in the guest HOME, so the mapping is the identity.
        """
        return guest_relative

    def _matches(self, rule_relative: str, relative: str) -> bool:
        if relative == rule_relative:
            return True
        return relative.startswith(rule_relative.rstrip("/") + "/")

    def is_skill_target(self, relative: str) -> bool:
        return any(self._matches(root, relative) for root in self.skill_targets)

    def is_credential(self, relative: str) -> bool:
        return self.classify(relative) == CREDENTIAL

    def is_ephemeral(self, relative: str) -> bool:
        return self.classify(relative) == EPHEMERAL

    def _rules(self) -> tuple[PathRule, ...]:
        rules: list[PathRule] = []
        rules.extend(PathRule(path, CREDENTIAL, "known credential path") for path in self.known_credential_paths)
        rules.extend(PathRule(path, EPHEMERAL, "known ephemeral path") for path in self.known_ephemeral_paths)
        rules.extend(PathRule(path, SESSION, "known session/checkpoint path") for path in self.known_session_paths)
        rules.extend(PathRule(path, SKILL, "skill target root") for path in self.skill_targets)
        rules.extend(PathRule(path, CONFIG_AUTHORITY, "managed config patch authority") for path in self.config_patch_authorities)
        return tuple(rules)


# ---------------------------------------------------------------------------
# the five official policies
# ---------------------------------------------------------------------------
# Every rule carries evidence identifiers from the two research knowledge
# bases; see the citations in the module docstring.

CODEX_POLICY = NativeHomePolicy(
    harness_type="codex",
    # FACTS G-skills (host_roots.rs): $HOME/.agents/skills is the current
    # official user root; $CODEX_HOME/skills is deprecated-but-read;
    # repo/.codex/skills + repo/.agents/skills are project roots.
    skill_targets=(".agents/skills",),
    # FACTS E1-E3: CODEX_HOME/auth.json is the plaintext credential file.
    known_credential_paths=(".codex/auth.json",),
    # FACTS F3/F4: cache/log/tmp are self-healing and disposable.
    known_ephemeral_paths=(
        ".codex/cache/",
        ".codex/log/",
        ".codex/tmp/",
        ".codex/models_cache.json",
        ".codex/skills/.system/",
        ".codex/plugins/cache/",
    ),
    # FACTS F3/F4: session rollouts, archives, index and sqlite state persist.
    known_session_paths=(
        ".codex/sessions/",
        ".codex/archived_sessions/",
        ".codex/session_index.jsonl",
        ".codex/history.jsonl",
        ".codex/state_5.sqlite",
        ".codex/thread_history_1.sqlite",
        ".codex/queue_1.sqlite",
        ".codex/goals_1.sqlite",
        ".codex/logs_2.sqlite",
        ".codex/shell_snapshots/",
    ),
    # FACTS D2: CODEX_HOME/config.toml is the managed config file.
    config_patch_authorities=(".codex/config.toml",),
    # FACTS D3/G-skills: project layer .codex/config.toml and .codex/skills,
    # repo-root .agents/skills (walked upward from cwd to worktree root).
    project_skill_roots=(".codex/skills", ".agents/skills"),
)

CLAUDE_POLICY = NativeHomePolicy(
    harness_type="claude-code",
    # FACTS G2/docs-skills: <config>/skills/<name> is the personal root.
    skill_targets=(".claude/skills",),
    # FACTS E-2/E13: <config>/.credentials.json holds the credential store.
    known_credential_paths=(".claude/.credentials.json",),
    # FACTS F4: the machine cache follows HOME (AUTHORITY_CONFLICT).
    known_ephemeral_paths=(".cache/claude-cli-nodejs/",),
    # FACTS F3/F4: projects/, sessions/, file-history, history.jsonl,
    # session-env persist; shell-snapshots is machine-local state.
    known_session_paths=(
        ".claude/projects/",
        ".claude/sessions/",
        ".claude/file-history/",
        ".claude/history.jsonl",
        ".claude/session-env/",
        ".claude/shell-snapshots/",
        ".claude/backups/",
    ),
    # FACTS D2: <config>/settings.json is the user settings file.
    config_patch_authorities=(".claude/settings.json",),
    # FACTS G2: project .claude/skills (nested lazy loading from cwd).
    project_skill_roots=(".claude/skills",),
)

OPENCODE_POLICY = NativeHomePolicy(
    harness_type="opencode",
    # FACTS G2: global root ~/.config/opencode/skill(s) — the Registry
    # already targets `skills`; both spellings are scanned natively.
    skill_targets=(".config/opencode/skills",),
    # FACTS E1: $XDG_DATA_HOME/opencode/auth.json is the credential file.
    known_credential_paths=(".data/opencode/auth.json",),
    # FACTS D1-D3/F2-F7: cache root and state locks are disposable; tmp is
    # hardcoded to /tmp/opencode (outside the native home, never persisted).
    known_ephemeral_paths=(
        ".cache/opencode/bin/",
        ".cache/opencode/models.dev/",
        ".state/opencode/locks/",
    ),
    # FACTS F2-F7: the sqlite data store + logs live under XDG_DATA_HOME.
    known_session_paths=(
        ".data/opencode/opencode.db",
        ".data/opencode/opencode.db-wal",
        ".data/opencode/opencode.db-shm",
        ".data/opencode/opencode.db-journal",
        ".data/opencode/log/",
        ".data/opencode/repos/",
    ),
    # FACTS D: <config>/opencode/opencode.json is the managed config file.
    config_patch_authorities=(".config/opencode/opencode.json",),
    # FACTS G2: project .opencode/skill(s) walked up to the git worktree.
    project_skill_roots=(".opencode/skill", ".opencode/skills"),
)

HERMES_POLICY = NativeHomePolicy(
    harness_type="hermes",
    # FACTS G-skills E44: <HERMES_HOME>/skills is the primary (always-first)
    # skill root; skill_utils.py:432-522.
    skill_targets=(".hermes/skills",),
    # FACTS E33/E40: .env (credential-suffixed vars) and auth.json (OAuth).
    known_credential_paths=(".hermes/.env", ".hermes/auth.json"),
    # FACTS F/E19/E8: cache/, logs/, update marker and pid are disposable.
    known_ephemeral_paths=(
        ".hermes/cache/",
        ".hermes/logs/",
        ".hermes/.update_check",
        ".hermes/gateway.pid",
    ),
    # FACTS F/E19/E8: state.db, sessions, checkpoints, memories, cron, mcp
    # installs and hooks persist as native state.
    known_session_paths=(
        ".hermes/state.db",
        ".hermes/sessions/",
        ".hermes/checkpoints/",
        ".hermes/memories/",
        ".hermes/cron/",
        ".hermes/hooks/",
        ".hermes/plugins/",
        ".hermes/skill-bundles/",
        ".hermes/mcp-installs/",
    ),
    # FACTS E29: <HERMES_HOME>/config.yaml is the managed config file.
    config_patch_authorities=(".hermes/config.yaml",),
    # FACTS E49: no canonical project skills root; plugins are opt-in.
    project_skill_roots=(),
)

PI_POLICY = NativeHomePolicy(
    harness_type="pi",
    # FACTS G-skills: <agent-dir>/skills is the user root; the adapter
    # relocates the agent dir to the guest HOME root via
    # PI_CODING_AGENT_DIR, so the target is `skills/`.
    skill_targets=("skills",),
    # FACTS E1: <agent-dir>/auth.json is the credential file.
    known_credential_paths=("auth.json",),
    # FACTS F1/F2/D6: pi-debug.log is disposable per-run output.
    known_ephemeral_paths=("pi-debug.log",),
    # FACTS F1: sessions/ is the native session store.
    known_session_paths=("sessions/",),
    # FACTS D4: <agent-dir>/settings.json is the global settings file.
    config_patch_authorities=("settings.json",),
    # FACTS G-skills + C8: project .pi/skills and .agents/skills exist but
    # only take effect after a trust decision (headless: never).
    project_skill_roots=(".pi/skills", ".agents/skills"),
)

FIVE_POLICIES: Mapping[str, NativeHomePolicy] = {
    policy.harness_type: policy
    for policy in (CODEX_POLICY, CLAUDE_POLICY, OPENCODE_POLICY, HERMES_POLICY, PI_POLICY)
}


def policy_for(harness_type: str) -> NativeHomePolicy:
    try:
        return FIVE_POLICIES[harness_type]
    except KeyError as exc:
        raise KeyError(f"NO_NATIVE_HOME_POLICY:{harness_type}") from exc


__all__ = [
    "CLAUDE_POLICY",
    "CODEX_POLICY",
    "CONFIG_AUTHORITY",
    "CREDENTIAL",
    "EPHEMERAL",
    "FIVE_POLICIES",
    "HERMES_POLICY",
    "NativeHomePolicy",
    "OPENCODE_POLICY",
    "PI_POLICY",
    "PathRule",
    "SESSION",
    "SKILL",
    "UNKNOWN",
    "policy_for",
]
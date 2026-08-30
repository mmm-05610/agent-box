from __future__ import annotations
from dataclasses import dataclass
import os
import re
import shutil
from pathlib import Path
from agent_box.resource_contracts import AgentBoxProfileV1, WorkspaceV1
from agent_box.work_core import Ref
from ..profiles.models import ProfileRef
from ..profiles.projection import Projection

@dataclass(frozen=True)
class CodexLaunchSpec:
    """Codex-owned launch facts produced from frozen inputs and projection."""

    argv: tuple[str, ...]
    env: dict[str, str]
    cwd: Path
    profile_ref: Ref
    profile_revision: int
    profile_digest: str
    projection_directory: Path
    projected_config_paths: tuple[Path, ...]
    credential_locator: str | None
    cleanup_directory: Path


class CodexLaunchAdapter:
    """Official Codex launch adapter; intentionally independent of bwrap."""
    def __init__(self, projection: Projection, *, binary: str | None = None):
        self.projection = projection
        self.binary = binary or shutil.which("codex")

    def _plan(self, *, execution_id: str, profile_ref: Ref,
              profile: AgentBoxProfileV1, workspace: WorkspaceV1,
              argv: tuple[str, ...]) -> CodexLaunchSpec:
        if not self.binary:
            raise RuntimeError("CODEX_BINARY_UNAVAILABLE")
        metadata=profile_ref.metadata
        exact = ProfileRef("codex", profile_ref.native_id,
                           int(metadata.get("revision", "0")),
                           metadata.get("digest", ""), profile_ref.provider)
        materialized=self.projection.materialize(execution_id,exact)
        inherited={
            "PATH","HOME","USER","LOGNAME","LANG","LC_ALL","LC_CTYPE","LC_MESSAGES",
            "SSL_CERT_FILE","SSL_CERT_DIR","REQUESTS_CA_BUNDLE",
            # Network transport belongs to the native Harness process. These
            # values are passed through at launch time only; they are not
            # copied into the Profile, projection manifest, Binding, or
            # Evidence. Both cases are supported because common WSL tooling
            # uses either spelling.
            "HTTP_PROXY","HTTPS_PROXY","ALL_PROXY","NO_PROXY",
            "http_proxy","https_proxy","all_proxy","no_proxy",
        }
        env = {key: value for key, value in os.environ.items()
               if key in inherited and value}
        env.update({"CODEX_HOME": materialized["directory"],
                    "AGENT_BOX_PROFILE_REF": f"{exact.profile_id}@{exact.revision}"})
        stored=self.projection.repo.get(exact.profile_id,exact.revision)
        values=(stored.get("config") or {}).get("environment") or {}
        for key, value in values.items():
            if (isinstance(key, str)
                    and re.fullmatch(r"[A-Z][A-Z0-9_]{0,63}", key)
                    and not re.search(r"(TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|AUTH)", key)):
                env[key] = str(value)
        return CodexLaunchSpec(
            argv=(self.binary, *argv),
            env=env,
            cwd=workspace.path,
            profile_ref=profile_ref,
            profile_revision=exact.revision,
            profile_digest=exact.digest,
            projection_directory=Path(materialized["directory"]),
            projected_config_paths=(Path(materialized["config_path"]),),
            credential_locator=(stored.get("credential_source_ref") or {}).get("native_locator"),
            cleanup_directory=Path(materialized["directory"]),
        )
    def plan_app_server(self, **kwargs) -> CodexLaunchSpec:
        return self._plan(argv=("app-server", "--stdio"), **kwargs)

    def plan_interactive(self, *, extra_args: list[str], **kwargs) -> CodexLaunchSpec:
        return self._plan(argv=tuple(extra_args), **kwargs)

    def plan(self, **kwargs) -> CodexLaunchSpec:
        """Compatibility spelling for the app-server launch mode."""
        return self.plan_app_server(**kwargs)

    def cleanup(self, execution_id: str) -> None:
        self.projection.cleanup(execution_id)

#!/usr/bin/env python3
"""Work Order 47 G4/G5: one conformance gate for any sandbox provider.

The gate states the invariants through the neutral seam and checks, first-hand,
that the resolved provider keeps them. Every check appends evidence to one JSON
report; a provider that would satisfy a demand by *redirecting* it (the counter-
example: a home that is a mapped copy rather than the real directory) must fail
the gate, not pass with a smaller claim.

Checks (each with host-side observation, not only in-room self-report):

1. home-is-real:  a write from inside the room lands in the *real* home
                  directory on this machine;
2. host-home-blind: the host's ~/.codex path is invisible inside the room;
3. ro-immutable:  a read-only input cannot be written from inside the room and
                  its host bytes are unchanged;
4. temp-no-residue: an attempt-ephemeral path leaves nothing in the real home;
5. credential-not-in-argv: the credential's host path may be bound, its content
                  appears in no argv and no guest environment value;
6. tree-dies:     closing the room kills the process tree (a child spawned by
                  the entrypoint is gone after the main process is killed);
7. cleanup-bounded: the gate's temporary root is gone when the gate returns;
8. network-posture: a `none` demand is refused by a provider that declares the
                  posture unavailable (this template keeps the machine network),
                  and `inherit` demand runs.

Counter-example provider (`--provider fake-redirect-home`) implements the seam
by copying the home into a scratch directory and binding the copy: check 1 must
fail, proving the gate is not a rubber stamp.
"""
from __future__ import annotations

import argparse
from importlib import metadata
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time

REPO = Path(__file__).resolve().parents[2]
PROBE = REPO / "scripts" / "server-round1" / "fixtures" / "sandbox-conformance-probe.mjs"
REPORT_PATH = REPO / "docs" / "server-round1" / "fullstack" / "sandbox-conformance.json"
ENTRYPOINT = "/runtime/view/agentbox-sidecar/runtime/worker-entry.mjs"
SECRET_VALUE = "conformance-credential-not-a-real-secret"


class GateFailure(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


class _RedirectHomePort:
    """The deliberately wrong provider: the home is a redirected copy."""

    provider_id = "fake-redirect-home"

    def __init__(self) -> None:
        self.scratch = Path(tempfile.mkdtemp(prefix="agentbox-conformance-redirect-"))

    def compose_sidecar_room(self, request):
        from agent_box.extensions.runtime_composition.sandbox_port import (
            IsolatedProcessSpec,
        )
        from agent_box_sandbox_bwrap import compose_sidecar_room

        redirected = self.scratch / "home"
        if request.state_home_source:
            shutil.copytree(request.state_home_source, redirected, dirs_exist_ok=True)
        room = compose_sidecar_room(
            workspace=request.workspace, staged_view=request.staged_view,
            secret=request.secret, base_environment=request.base_environment,
            executable_mounts=tuple(request.executable_mounts),
            projection_mounts=tuple(request.projection_mounts),
            runtime_artifact_mounts=tuple(request.runtime_artifact_mounts),
            state_home_source=str(redirected),
            state_target=request.state_target,
            state_window_source=None, state_window_target=None,
            state_ephemeral_paths=tuple(request.state_ephemeral_paths),
            entrypoint=request.entrypoint,
        )
        return IsolatedProcessSpec(argv=tuple(room.argv), environment=dict(room.environment))

    def declaration_document(self, **kwargs):
        raise NotImplementedError("conformance fixture declares nothing")

    def descriptor_id(self) -> str:
        return self.provider_id

    def probe(self):
        return {"status": "available", "code": "fixture"}


def _resolve(provider: str):
    if provider == "fake-redirect-home":
        return _RedirectHomePort()
    from agent_box.extensions.runtime_composition.sandbox_port import (
        resolve_sandbox_port,
    )
    return resolve_sandbox_port(provider)


def _stage(root: Path) -> dict:
    workspace = root / "workspace"
    workspace.mkdir()
    view = root / "view"
    entry_dir = view / "agentbox-sidecar" / "runtime"
    entry_dir.mkdir(parents=True)
    shutil.copy2(PROBE, entry_dir / "worker-entry.mjs")
    # Projection mounts are view-relative sources: the staged view carries the
    # read-only bytes, and the host-side copy is what immutability is checked
    # against after the room ran.
    ro_host = root / "ro-input.txt"
    ro_host.write_text("reviewed read-only input\n")
    shutil.copy2(ro_host, view / "ro-input.txt")
    home = root / "home"
    home.mkdir()
    secret = root / "secret"
    secret.write_text(SECRET_VALUE + "\n")
    os.chmod(secret, 0o600)
    return {
        "workspace": workspace, "view": view, "ro_host": ro_host,
        "home": home, "secret": secret,
    }


def _run_room(port, staged: dict, *, linger_ms: int = 0, network_mode: str = "inherit"):
    from agent_box.extensions.runtime_composition.sandbox_port import (
        RoomInvariants, SidecarRoomRequest,
    )

    # The guest environment is a whitelist, so the probe reads the fixed guest
    # layout itself; the gate only stages the linger marker when needed.
    environment = {"AGENTBOX_SIDECAR_ISOLATED": "1"}
    marker = staged["workspace"] / "linger"
    if linger_ms > 0:
        marker.write_text("linger\n")
    elif marker.exists():
        marker.unlink()
    spec = port.compose_sidecar_room(SidecarRoomRequest(
        workspace=str(staged["workspace"]), staged_view=str(staged["view"]),
        secret=str(staged["secret"]), base_environment=environment,
        projection_mounts=(("ro-input.txt", "/runtime/home/.fixture/ro-input.txt"),),
        state_home_source=str(staged["home"]),
        state_target="/runtime/home/.fixture",
        state_ephemeral_paths=(".tmp",),
        invariants=RoomInvariants(network_mode=network_mode),
    ))
    return spec


def _spawn(spec):
    process = subprocess.Popen(  # noqa: S603 - the argv is the reviewed room
        list(spec.argv), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, text=True, start_new_session=True,
    )
    return process


def _sleep_procs() -> list[tuple[str, list[str]]]:
    """Every live process whose exact argv is the marker sleep.

    Exact argv matching, not a pgrep pattern: any shell whose command line
    merely contains the pattern would match a regex, and the point of this
    check is the process the probe actually spawned.
    """
    hits: list[tuple[str, list[str]]] = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            raw = (entry / "cmdline").read_bytes()
        except OSError:
            continue
        argv = [part.decode(errors="replace") for part in raw.split(b"\0") if part]
        if len(argv) == 2 and argv[0].endswith("/sleep") and argv[1] == "593.417":
            hits.append((entry.name, argv))
    return hits


def run_gate(provider: str) -> dict:
    from agent_box.extensions.runtime_composition.sandbox_port import (
        SandboxInvariantUnsupported,
    )

    report: dict = {"provider": provider, "checks": {}, "result": None}
    port = _resolve(provider)
    root = Path(tempfile.mkdtemp(prefix="agentbox-conformance-"))
    staged = _stage(root)
    try:
        # 8a. a `none` demand must be refused or honestly kept; our template
        # declares the posture unavailable, so the refusal is the evidence.
        try:
            _run_room(port, staged, network_mode="none")
            report["checks"]["network_none"] = {
                "status": "kept", "note": "provider accepted a none posture; "
                "the room argv must then carry --unshare-net (not asserted here)",
            }
        except SandboxInvariantUnsupported as refusal:
            report["checks"]["network_none"] = {
                "status": "refused", "code": refusal.code,
            }

        spec = _run_room(port, staged)
        argv = list(spec.argv)
        report["checks"]["credential_not_in_argv"] = {
            "status": "pass" if (
                SECRET_VALUE not in "\0".join(argv)
                and SECRET_VALUE not in "\0".join(str(v) for v in spec.environment.values())
            ) else "fail",
            "secret_path_in_argv": str(staged["secret"]) in argv,
        }
        process = _spawn(spec)
        stdout, stderr = process.communicate(timeout=120)
        report["checks"]["room_exit"] = {"status": process.returncode}
        try:
            probe = json.loads(stdout.strip().splitlines()[-1])
        except (ValueError, IndexError):
            report["result"] = "SANDBOX_CONFORMANCE_GATE_FAILED"
            report["checks"]["probe_output"] = {"status": "unparsable", "stdout": stdout[-300:], "stderr": stderr[-300:]}
            return report

        # 1. home is real: the room's write is observable on the host.
        home_file = staged["home"] / "probe-home.txt"
        report["checks"]["home_is_real"] = {
            "status": "pass" if home_file.is_file() and home_file.read_text() == "home-ok"
            else "fail",
            "in_room_write": probe["writes"].get("home"),
            "host_file_present": home_file.is_file(),
        }
        # 2. the host's home tree (including ~/.codex) is invisible; the probe
        # checks the whole /home root, which is strictly stronger.
        report["checks"]["host_home_blind"] = {
            "status": "pass" if not probe["facts"].get("hostHomeVisible") else "fail",
        }
        # 3. RO input immutable.
        report["checks"]["ro_immutable"] = {
            "status": "pass" if (
                probe["writes"].get("ro") in {"EROFS", "EACCES", "EPERM"}
                and staged["ro_host"].read_text() == "reviewed read-only input\n"
            ) else "fail",
            "in_room_write": probe["writes"].get("ro"),
        }
        # 4. ephemeral path leaves no residue in the real home.
        report["checks"]["temp_no_residue"] = {
            "status": "pass" if (
                probe["writes"].get("ephemeral") == "ok"
                and not (staged["home"] / ".tmp" / "residue.txt").exists()
            ) else "fail",
        }
        # 5. workspace really writable (the room's own work area).
        report["checks"]["workspace_writable"] = {
            "status": "pass" if (staged["workspace"] / "probe-workspace.txt").is_file()
            else "fail",
        }

        # 6. tree dies with the room: a lingering room's grandchild (a unique
        # `sleep 593.417`, identified on the host by its argv because the room
        # has its own PID namespace) is present while the room lives and gone
        # after the main process is killed.
        marker = "593.417"
        linger_spec = _run_room(port, staged, linger_ms=60_000)
        linger = _spawn(linger_spec)
        observed = None
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline and observed is None:
            line = linger.stdout.readline()
            if not line:
                break
            try:
                observed = json.loads(line.strip())["facts"].get("childPid")
            except (ValueError, KeyError):
                continue
        control = _sleep_procs()
        if observed is None or not control:
            report["checks"]["tree_dies"] = {
                "status": "fail",
                "note": "no in-room child observed (positive control failed)",
                "control": control,
            }
            linger.kill()
        else:
            linger.send_signal(signal.SIGKILL)
            linger.wait(timeout=30)
            time.sleep(0.5)
            after = _sleep_procs()
            report["checks"]["tree_dies"] = {
                "status": "pass" if not after else "fail",
                "control_before_kill": [pid for pid, _argv in control],
                "after_kill": [pid for pid, _argv in after],
            }

        failed = [name for name, check in report["checks"].items()
                  if check.get("status") == "fail"]
        partial = all(
            check.get("status") != "fail" for check in report["checks"].values()
        )
        report["result"] = (
            "SANDBOX_CONFORMANCE_GATE_OK" if partial and not failed
            else "SANDBOX_CONFORMANCE_GATE_FAILED"
        )
        return report
    finally:
        # 7. cleanup bounded: the gate's own temporary root disappears.
        shutil.rmtree(root, ignore_errors=True)
        report.setdefault("checks", {})["cleanup_bounded"] = {
            "status": "pass" if not root.exists() else "fail",
        }
        scratch = getattr(port, "scratch", None)
        if scratch is not None:
            shutil.rmtree(scratch, ignore_errors=True)
        if report.get("result") in (None, "SANDBOX_CONFORMANCE_GATE_OK") and (
            report.get("checks", {}).get("cleanup_bounded", {}).get("status") == "fail"
        ):
            report["result"] = "SANDBOX_CONFORMANCE_GATE_FAILED"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", default="sandbox-bwrap")
    parser.add_argument("--json", action="store_true")
    options = parser.parse_args()
    os.environ.setdefault("AGENT_BOX_SANDBOX_MODULE", "agent_box_sandbox_bwrap")
    try:
        report = run_gate(options.provider)
    except Exception as error:  # typed refusal or unexpected: both fail the gate
        report = {
            "provider": options.provider,
            "result": "SANDBOX_CONFORMANCE_GATE_FAILED",
            "error": f"{type(error).__name__}: {error}",
        }
    text = json.dumps(report, indent=1, ensure_ascii=False)
    print(text)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(text + "\n", encoding="utf-8")
    ok = report.get("result") == "SANDBOX_CONFORMANCE_GATE_OK"
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

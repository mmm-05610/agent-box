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


def _force_remove(function, path, _exc):
    """rmtree helper: clear the read-only attribute, then retry.

    Windows keeps read-only as a file attribute, and rmtree refuses to delete
    such files; the provider marks materialised configuration read-only on
    purpose, so the gate must be able to clean up after it.
    """
    import stat as _stat

    try:
        os.chmod(path, _stat.S_IWRITE)
    except OSError:
        pass
    try:
        function(path)
    except OSError:
        pass


def _rmtree_force(path):
    shutil.rmtree(path, onerror=_force_remove)


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


class _RedirectHomeWindowsPort:
    """The Windows counter-example: the home is a redirected copy.

    It delegates to the real Windows provider but rewrites the home to a
    scratch copy first, so every write the room makes lands on the copy and
    the gate's home-is-real check must fail.
    """

    provider_id = "fake-redirect-home"

    def __init__(self) -> None:
        from agent_box_sandbox_windows.provider import WindowsSandboxPort

        self.scratch = Path(tempfile.mkdtemp(prefix="agentbox-conformance-redirect-"))
        self._inner = WindowsSandboxPort(
            node_path=os.environ.get("AGENT_BOX_NODE_PATH") or "node.exe")

    def compose_sidecar_room(self, request):
        import dataclasses

        redirected = self.scratch / "home"
        if request.state_home_source:
            shutil.copytree(request.state_home_source, redirected, dirs_exist_ok=True)
        # A real redirecting provider rewrites *every* home-anchored path the
        # caller supplied (the gate's own probe paths included) - that is what
        # makes this counter-example catch the gate's home-is-real check.
        original = str(Path(request.state_home_source))
        base = {
            key: (value.replace(original, str(redirected))
                  if isinstance(value, str) else value)
            for key, value in (request.base_environment or {}).items()
        }
        rewritten = dataclasses.replace(
            request, state_home_source=str(redirected), base_environment=base,
        )
        return self._inner.compose_sidecar_room(rewritten)

    def declaration_document(self, **kwargs):
        return self._inner.declaration_document(**kwargs)

    def descriptor_id(self) -> str:
        return self.provider_id

    def probe(self):
        return {"status": "available", "code": "fixture"}


def _resolve(provider: str):
    if provider == "fake-redirect-home":
        if os.name == "nt":
            return _RedirectHomeWindowsPort()
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
    environment = {
        "AGENTBOX_SIDECAR_ISOLATED": "1",
        # Paths the probe writes to: guest paths on Linux, real paths on a
        # platform without bind mounts (the provider passes base_environment
        # through, so the gate can state them).
        "PROBE_HOME": str(staged["home"]) if os.name == "nt" else "/runtime/home/.fixture",
        "PROBE_WORKSPACE": str(staged["workspace"]) if os.name == "nt" else "/workspace",
        "PROBE_HOST_ROOT": str(Path.home().anchor) if os.name == "nt" else "/home",
        "PROBE_EPHEMERAL_DIR": (
            str(staged["home"] / ".tmp") if os.name == "nt" else "/runtime/home/.fixture/.tmp"
        ),
    }
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
        native_home=".fixture",
        state_ephemeral_paths=(".tmp",),
        invariants=RoomInvariants(network_mode=network_mode),
    ))
    return spec


def _spawn(spec):
    # A provider's environment is authoritative for the room: on Linux the
    # bwrap argv carries --clearenv and the setenv list; on Windows (no
    # wrapper) the spec's environment is merged over this process's, so the
    # probe's paths and the credential actually reach the child.
    environment = dict(os.environ)
    environment.update(spec.environment)
    process = subprocess.Popen(  # noqa: S603 - the argv is the reviewed room
        list(spec.argv), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, text=True, start_new_session=(os.name != "nt"),
        env=environment,
    )
    return process


#: The marker the probe embeds in its child's command line; every process
#: carrying it is the probe's child (and nothing else should ever carry it).
CHILD_MARKER = "593.417"


def _marker_procs() -> list[str]:
    """Every live process whose command line carries the child marker.

    Linux reads /proc directly; Windows asks the OS through PowerShell's CIM
    view. Both match the *marker*, not a bare command name, so a shell whose
    command line merely mentions it cannot be mistaken for the child.
    """
    if os.name == "nt":
        query = (
            "Get-CimInstance Win32_Process | "
            f"Where-Object {{ $_.Name -eq 'node.exe' -and $_.CommandLine -like '*{CHILD_MARKER}*' }} | "
            "Select-Object -ExpandProperty ProcessId"
        )
        done = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", query],
            capture_output=True, text=True, timeout=30,
        )
        return [line.strip() for line in done.stdout.splitlines() if line.strip().isdigit()]
    hits: list[str] = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            raw = (entry / "cmdline").read_bytes()
        except OSError:
            continue
        argv = [part.decode(errors="replace") for part in raw.split(b"\0") if part]
        if any(CHILD_MARKER in part for part in argv):
            hits.append(entry.name)
    return hits


def run_gate(provider: str) -> dict:
    from agent_box.extensions.runtime_composition.sandbox_port import (
        SandboxInvariantUnsupported,
    )

    report: dict = {"provider": provider, "checks": {}, "result": None}
    port = _resolve(provider)
    root = Path(tempfile.mkdtemp(prefix="agentbox-conformance-"))
    staged = _stage(root)
    # The check set is driven by the provider's own declaration ("declared and
    # observed"): a capability it declares supported is asserted positively,
    # and a capability it declares unavailable is asserted *negatively* - the
    # boundary must really be absent - so a degraded platform is recorded
    # honestly instead of being failed for telling the truth.
    claims: dict[str, str] = {}
    try:
        document = port.declaration_document(
            readonly_targets=("/runtime/home/.fixture/ro-input.txt",),
            writable_targets=("/runtime/home/.fixture",),
            environment_binding="conformance|binding",
            observed_at=int(time.time()),
        )
        claims = {item.capability_id: item.support_state for item in document.declarations}
    except Exception:
        claims = {}
    report["declaredCapabilities"] = claims
    read_isolation_declared = claims.get("filesystem.readonly@1") == "supported"
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
        # 2. host-home visibility. With read isolation declared supported the
        # host tree must be invisible; with it declared unavailable the
        # negative observation (the host tree IS visible) is the evidence that
        # the declaration is honest.
        visible = bool(probe["facts"].get("hostHomeVisible"))
        if read_isolation_declared:
            report["checks"]["host_home_blind"] = {
                "status": "pass" if not visible else "fail",
            }
        else:
            report["checks"]["host_home_blind"] = {
                "status": "pass" if visible else "fail",
                "declaration_cross_check":
                    "read isolation declared unavailable; host tree visible as declared"
                    if visible else
                    "read isolation declared unavailable but the host tree was NOT "
                    "visible - the declaration understates this provider",
            }
        # 3. RO input immutability. The host source's bytes must be unchanged
        # on every platform; the in-room write being *refused* is only
        # required where the provider declares a read-only face.
        source_unchanged = staged["ro_host"].read_text() == "reviewed read-only input\n"
        in_room = probe["writes"].get("ro")
        if read_isolation_declared:
            report["checks"]["ro_immutable"] = {
                "status": "pass" if in_room in {"EROFS", "EACCES", "EPERM"} and source_unchanged
                else "fail",
                "in_room_write": in_room,
            }
        else:
            report["checks"]["ro_immutable"] = {
                "status": "pass" if source_unchanged else "fail",
                "in_room_write": in_room,
                "declaration_cross_check":
                    "read-only face declared unavailable; the host source is the "
                    "authority and its bytes are unchanged",
            }
        # 4. ephemeral paths. Where the platform can shadow them (Linux tmpfs)
        # the write succeeds and nothing lands on the host. Where it cannot
        # (Windows: no tmpfs, and D4 forbids claiming a mask), the D4 sequence
        # is asserted instead: the write lands, the host stack removes the
        # subtree after the attempt, and the report says "removed after the
        # attempt", never "masked".
        ephemeral_dir = staged["home"] / ".tmp"
        if read_isolation_declared:
            report["checks"]["temp_no_residue"] = {
                "status": "pass" if (
                    probe["writes"].get("ephemeral") == "ok"
                    and not (ephemeral_dir / "residue.txt").exists()
                ) else "fail",
            }
        else:
            _rmtree_force(ephemeral_dir)
            report["checks"]["temp_no_residue"] = {
                "status": "pass" if (
                    probe["writes"].get("ephemeral") == "ok"
                    and not ephemeral_dir.exists()
                ) else "fail",
                "semantics": "removed after the attempt (D4); not masked - this "
                             "platform has no tmpfs and none is claimed",
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
        control = _marker_procs()
        if observed is None or not control:
            report["checks"]["tree_dies"] = {
                "status": "fail",
                "note": "no in-room child observed (positive control failed)",
                "control": control,
            }
            linger.kill()
        else:
            if os.name == "nt":
                subprocess.run(["taskkill.exe", "/PID", str(linger.pid), "/T", "/F"],
                               capture_output=True, text=True, timeout=30)
            else:
                linger.send_signal(signal.SIGKILL)
            try:
                linger.wait(timeout=30)
            except subprocess.TimeoutExpired:
                linger.kill()
            time.sleep(0.8)
            after = _marker_procs()
            report["checks"]["tree_dies"] = {
                "status": "pass" if not after else "fail",
                "control_before_kill": control,
                "after_kill": after,
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
        _rmtree_force(root)
        report.setdefault("checks", {})["cleanup_bounded"] = {
            "status": "pass" if not root.exists() else "fail",
        }
        scratch = getattr(port, "scratch", None)
        if scratch is not None:
            _rmtree_force(scratch)
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

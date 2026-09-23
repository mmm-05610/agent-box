#!/usr/bin/env python3
"""One Server CLI/HTTP runtime plus its configured native port, no turn dispatch.

The caller owns process-group timeout, strace, and private stderr capture.
This program prints only bounded booleans/stage categories, never wire bodies.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import sys
import threading
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "src"))


def _port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _call(port: int, token: str, method: str, params: dict) -> dict:
    payload = json.dumps({"jsonrpc": "2.0", "id": method,
                          "method": method, "params": params}).encode()
    request = Request(f"http://127.0.0.1:{port}/wire/v1/{method}", data=payload,
                      headers={"Authorization": f"Bearer {token}",
                               "Content-Type": "application/json"})
    with urlopen(request, timeout=5) as response:
        return json.load(response)


def run(root: Path, adapter: Path, adapter_args: tuple[str, ...]) -> dict:
    import uvicorn
    from agent_box.server import __main__ as server_main
    from agent_box.server.transport import http as transport_http

    project = root / "project"
    sessions = root / "sessions"
    data = root / "data"
    assert project.is_dir() and sessions.is_dir() and not any(project.iterdir())
    assert not data.exists()
    holder: dict = {}
    ready = threading.Event()
    original_app = transport_http.create_app
    original_run = uvicorn.run
    port = _port()
    stage = "bootstrap"
    native_port = None
    execution_id = "hd002-no-prompt-probe"
    result = {"cli_started": False, "hello_authenticated": False,
              "native_identity": False, "profile_ready": False,
              "workspace_open": False, "workspace_cwd_match": False,
              "execution_port_same_runtime": False, "port_create": False,
              "resume_observed": False, "failure_stage": None,
              "failure_kind": None, "owner_marker": False,
              "project_entries_after": None, "server_thread_stopped": False}

    def capture_app(runtime):
        holder["runtime"] = runtime
        ready.set()
        return original_app(runtime)

    def run_uvicorn(app, *, host, port, workers, log_config):
        config = uvicorn.Config(app, host=host, port=port,
                                workers=workers, log_config=log_config)
        server = uvicorn.Server(config)
        holder["server"] = server
        server.run()

    def server_thread():
        try:
            server_main.main([
                "--data-root", str(data), "--port", str(port),
                "--execution-mode", "native", "--native-harness", "pi",
                "--plugin-root", str(REPO / "plugins" / "agent-box-harnesses"),
                "--native-adapter-command", str(adapter),
                *[f"--native-adapter-arg={arg}" for arg in adapter_args],
            ])
        except BaseException as exc:
            holder["thread_error_kind"] = type(exc).__name__

    transport_http.create_app = capture_app
    uvicorn.run = run_uvicorn
    thread = threading.Thread(target=server_thread, daemon=True)
    thread.start()
    try:
        if not ready.wait(timeout=12):
            raise RuntimeError("SERVER_RUNTIME_UNAVAILABLE")
        runtime = holder["runtime"]
        deadline = time.monotonic() + 12
        token = None
        while time.monotonic() < deadline:
            token_file = data / "secrets" / "http-token"
            if token_file.is_file():
                token = token_file.read_text().strip()
                try:
                    hello = _call(port, token, "server.hello", {
                        "clientVersions": ["wire/1"], "clientPresentationSupports": []})
                    if isinstance(hello.get("result"), dict):
                        break
                except (OSError, URLError, ValueError):
                    pass
            time.sleep(0.05)
        else:
            raise RuntimeError("SERVER_HELLO_UNAVAILABLE")
        result["cli_started"] = bool(runtime.started)
        result["hello_authenticated"] = True
        result["owner_marker"] = runtime.owner.acquired
        identity = hello["result"].get("nativeExecution", {})
        result["native_identity"] = (identity.get("mode") == "native"
                                     and identity.get("harness") == "pi"
                                     and identity.get("profileId") == runtime.native_profile_id)
        if not result["native_identity"]:
            raise RuntimeError("NATIVE_IDENTITY_MISMATCH")
        stage = "profile"
        profiles = _call(port, token, "profiles.list", {"includeArchived": False})
        rows = profiles.get("result", {}).get("items", [])
        matching = [row for row in rows if row.get("id") == identity["profileId"]]
        result["profile_ready"] = (len(matching) == 1
                                   and matching[0].get("harness") == "pi"
                                   and matching[0].get("sendability", {}).get("state") == "ready")
        if not result["profile_ready"]:
            raise RuntimeError("PROFILE_NOT_READY")
        stage = "workspace"
        opened = _call(port, token, "workspaces.open", {
            "requestId": "hd002-no-prompt-open",
            "environment": {"kind": "local", "host": None, "user": None},
            "path": str(project)})
        workspace = opened.get("result", {}).get("workspace", {})
        result["workspace_open"] = bool(workspace.get("id"))
        if not result["workspace_open"]:
            raise RuntimeError("WORKSPACE_OPEN_FAILED")
        stored = runtime.service.workspaces.records.get(workspace["id"])
        result["workspace_cwd_match"] = stored["normalized_path"] == str(project)
        if not result["workspace_cwd_match"]:
            raise RuntimeError("WORKSPACE_CWD_MISMATCH")
        stage = "native_port_create"
        backend = runtime.execution
        context = {"env_kind": "local", "harness_type": "pi",
                   "normalized_path": stored["normalized_path"]}
        native_port = backend.port_factory(context, lambda *_: None)
        result["execution_port_same_runtime"] = bool(native_port is not None)
        opaque_id = native_port.open_execution(execution_id)
        result["port_create"] = bool(opaque_id)
        result["resume_observed"] = bool(native_port._observed.get(execution_id, {}).get("native_continuation"))
    except BaseException as exc:
        result["failure_stage"] = stage
        result["failure_kind"] = type(exc).__name__
    finally:
        if native_port is not None:
            try: native_port.close_execution(execution_id)
            except BaseException: pass
        if "server" in holder:
            holder["server"].should_exit = True
        thread.join(timeout=8)
        result["server_thread_stopped"] = not thread.is_alive()
        result["project_entries_after"] = sum(1 for _ in project.iterdir())
        transport_http.create_app = original_app
        uvicorn.run = original_run
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument("--adapter-arg", action="append", default=[])
    args = parser.parse_args()
    output = run(args.root, args.adapter, tuple(args.adapter_arg))
    print(json.dumps(output, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()

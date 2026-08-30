from dataclasses import replace
import shutil
import subprocess
import time

import pytest

from agent_box_tmux import (
    TmuxConsoleController,
    TmuxConsoleResourceProvider,
    TmuxConsoleV1,
    TmuxPaneV1,
)


@pytest.mark.skipif(shutil.which("tmux") is None, reason="tmux is not installed")
def test_materializes_real_session_and_panes_and_cleans_up():
    provider = TmuxConsoleResourceProvider()
    ref = provider.make_ref("plugin-test", panes=3)
    console = None
    try:
        console = provider.resolve(TmuxConsoleV1.contract_id, ref)
        assert console.version.startswith("tmux ")
        assert console.session_id.startswith("$")
        assert len(console.pane_ids) == 3
        assert all(pane.startswith("%") for pane in console.pane_ids)
        assert console.attach_command[-1] == ref.metadata["session_name"]
        native_ref = provider.native_ref(console)
        assert native_ref.native_id == console.session_id
        assert native_ref.metadata["spec_digest"] == ref.native_id
    finally:
        if console is not None:
            provider.cleanup(console)


@pytest.mark.skipif(shutil.which("tmux") is None, reason="tmux is not installed")
def test_launches_observes_and_captures_a_real_pane(tmp_path):
    provider = TmuxConsoleResourceProvider()
    controller = TmuxConsoleController()
    ref = provider.make_ref("controller-test")
    console = None
    try:
        console = provider.resolve(TmuxConsoleV1.contract_id, ref)
        pane_id = console.pane_ids[0]
        controller.launch(
            console,
            pane_id,
            ["/bin/sh", "-c", "printf agent-box-tmux-ready; sleep 1"],
            cwd=tmp_path,
        )
        deadline = time.monotonic() + 3
        captured = ""
        while time.monotonic() < deadline:
            captured = controller.capture(console, pane_id)
            if "agent-box-tmux-ready" in captured:
                break
            time.sleep(0.05)
        observation = controller.inspect(console, pane_id)
        assert observation.reachable is True
        assert observation.pid is not None
        assert observation.current_path == str(tmp_path)
        assert "agent-box-tmux-ready" in captured
    finally:
        if console is not None:
            controller.cleanup(console)


@pytest.mark.skipif(shutil.which("tmux") is None, reason="tmux is not installed")
def test_freezes_and_resolves_an_exact_existing_default_server_pane(tmp_path):
    provider = TmuxConsoleResourceProvider()
    session = f"abx-existing-{time.time_ns()}"
    subprocess.run([str(provider.binary), "new-session", "-d", "-s", session], check=True)
    try:
        pane_id = subprocess.check_output(
            [str(provider.binary), "list-panes", "-t", session, "-F", "#{pane_id}"],
            text=True,
        ).strip()
        ref = provider.make_existing_pane_ref(pane_id)
        assert ref.type.value == "SessionRef"
        assert ref.provider == "tmux-console"
        assert ref.metadata["pane_id"] == pane_id
        assert ref.metadata["session_id"].startswith("$")
        assert ref.metadata["window_id"].startswith("@")
        assert ref.metadata["socket_path"]
        assert pane_id in (ref.uri or "")

        pane = provider.resolve(TmuxPaneV1.contract_id, ref)
        assert pane.pane_id == pane_id
        assert pane.session_id == ref.metadata["session_id"]
        assert pane.server_pid == int(ref.metadata["server_pid"])
        assert pane.attach_command[-1] == session

        with pytest.raises(ValueError):
            provider.make_existing_pane_ref("%999999")
        tampered = replace(
            ref,
            metadata={**ref.metadata, "server_pid": str(pane.server_pid + 1)},
        )
        with pytest.raises(ValueError, match="identity"):
            provider.resolve(TmuxPaneV1.contract_id, tampered)
    finally:
        subprocess.run([str(provider.binary), "kill-session", "-t", session])


@pytest.mark.skipif(shutil.which("tmux") is None, reason="tmux is not installed")
def test_exact_existing_pane_in_multi_pane_window_returns_one_identity(tmp_path):
    provider = TmuxConsoleResourceProvider()
    controller = TmuxConsoleController()
    session = f"abx-existing-multi-{time.time_ns()}"
    subprocess.run([str(provider.binary), "new-session", "-d", "-s", session], check=True)
    try:
        subprocess.run(
            [str(provider.binary), "split-window", "-d", "-t", session],
            check=True,
        )
        subprocess.run(
            [str(provider.binary), "split-window", "-d", "-t", session],
            check=True,
        )
        pane_ids = subprocess.check_output(
            [str(provider.binary), "list-panes", "-t", session, "-F", "#{pane_id}"],
            text=True,
        ).splitlines()
        assert len(pane_ids) == 3

        target = pane_ids[1]
        ref = provider.make_existing_pane_ref(target)
        pane = provider.resolve(TmuxPaneV1.contract_id, ref)
        observation = controller.inspect(pane, target)

        assert ref.metadata["pane_id"] == target
        assert pane.pane_id == target
        assert observation.reachable is True
        assert observation.pane_id == target
    finally:
        subprocess.run([str(provider.binary), "kill-session", "-t", session])


@pytest.mark.skipif(shutil.which("tmux") is None, reason="tmux is not installed")
def test_idle_policy_rejects_active_pane_and_force_replace_is_explicit(tmp_path):
    provider = TmuxConsoleResourceProvider()
    session = f"abx-policy-{time.time_ns()}"
    subprocess.run(
        [str(provider.binary), "new-session", "-d", "-s", session, "sleep", "30"],
        check=True,
    )
    try:
        pane_id = subprocess.check_output(
            [str(provider.binary), "list-panes", "-t", session, "-F", "#{pane_id}"],
            text=True,
        ).strip()
        idle_ref = provider.make_existing_pane_ref(pane_id)
        idle_pane = provider.resolve(TmuxPaneV1.contract_id, idle_ref)
        with pytest.raises(ValueError, match="refuses"):
            TmuxConsoleController().launch(
                idle_pane, pane_id, ["/bin/echo", "nope"], cwd=tmp_path
            )

        force_ref = provider.make_existing_pane_ref(
            pane_id, replace_policy="force-replace"
        )
        force_pane = provider.resolve(TmuxPaneV1.contract_id, force_ref)
        TmuxConsoleController().launch(
            force_pane, pane_id, ["/bin/echo", "force-ok"], cwd=tmp_path
        )
    finally:
        subprocess.run([str(provider.binary), "kill-session", "-t", session])


@pytest.mark.skipif(shutil.which("tmux") is None, reason="tmux is not installed")
def test_existing_pane_controller_does_not_kill_user_session(tmp_path):
    provider = TmuxConsoleResourceProvider()
    controller = TmuxConsoleController()
    session = f"abx-controller-existing-{time.time_ns()}"
    subprocess.run([str(provider.binary), "new-session", "-d", "-s", session], check=True)
    try:
        pane_id = subprocess.check_output(
            [str(provider.binary), "list-panes", "-t", session, "-F", "#{pane_id}"],
            text=True,
        ).strip()
        pane = provider.resolve(
            TmuxPaneV1.contract_id, provider.make_existing_pane_ref(pane_id)
        )
        controller.launch(
            pane, pane_id, ["/bin/sh", "-c", "printf pane-evidence"], cwd=tmp_path
        )
        time.sleep(0.1)
        assert "pane-evidence" in controller.capture(pane, pane_id)
        assert controller.inspect(pane, pane_id).reachable
        controller.cleanup(pane)
        assert subprocess.run(
            [str(provider.binary), "has-session", "-t", session]
        ).returncode == 0
        assert controller.inspect(pane, pane_id).reachable
    finally:
        subprocess.run([str(provider.binary), "kill-session", "-t", session])

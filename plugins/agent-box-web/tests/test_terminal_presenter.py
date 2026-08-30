from agent_box_web.application.terminal import WslTerminalPresenter


def test_wsl_presenter_uses_injected_launcher_and_argv_only():
    calls = []
    presenter = WslTerminalPresenter(
        launcher=lambda *args, **kwargs: calls.append((args, kwargs)),
        which=lambda name: "C:/Windows/wt.exe" if name == "wt.exe" else None,
        environ={"WSL_DISTRO_NAME": "Ubuntu-Preview"},
    )
    result = presenter.open(("/usr/bin/tmux", "-L", "abx-test", "attach", "-t", "abx-test"))
    assert result.status == "opened"
    assert calls[0][0][0] == ("C:/Windows/wt.exe", "wsl.exe", "-d", "Ubuntu-Preview", "--", "/usr/bin/tmux", "-L", "abx-test", "attach", "-t", "abx-test")
    assert calls[0][1] == {"shell": False, "start_new_session": True}


def test_wsl_presenter_reports_unavailable_without_wt_or_distro():
    calls = []
    no_distro = WslTerminalPresenter(launcher=calls.append, which=lambda _: "/bin/wt.exe", environ={})
    assert no_distro.open(("tmux", "attach", "-t", "safe")).status == "unavailable"
    no_wt = WslTerminalPresenter(launcher=calls.append, which=lambda _: None, environ={"WSL_DISTRO_NAME": "Ubuntu"})
    assert no_wt.open(("tmux", "attach", "-t", "safe")).status == "unavailable"
    assert calls == []


def test_wsl_presenter_rejects_non_provider_command():
    presenter = WslTerminalPresenter(which=lambda _: "/bin/wt.exe", environ={"WSL_DISTRO_NAME": "Ubuntu"})
    result = presenter.open(("sh", "-c", "echo unsafe"))
    assert result.status == "failed"

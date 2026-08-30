from agent_box_tmux.web_selector import TmuxConsoleSelector

def test_managed_console_selector_is_execution_scoped():
    class FakeProvider:
        def make_ref(self, execution_id, **kwargs):
            return type("Ref", (), {"native_id": "sha256:console", "metadata": {"layout": kwargs["layout"]}})()
    selector = TmuxConsoleSelector(); selector.provider = FakeProvider()
    selection = selector.prepare({"layout":"tiled"}, execution_id="E1")
    assert selection.ref.native_id == "sha256:console"
    assert selection.ref.metadata["layout"] == "tiled"

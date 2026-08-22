from agent_box.work_core.cli import main
from agent_box.work_core.repository import CoreRepository


def test_opt_in_cli_creates_and_explicitly_completes_work(tmp_agent_box_home, capsys):
    assert main(["create-work", "safe change"]) == 0
    work_id = capsys.readouterr().out.strip()
    assert CoreRepository().get_work(work_id).lifecycle.value == "open"
    assert main(["complete-work", work_id, "user decision"]) == 0
    assert CoreRepository().get_work(work_id).lifecycle.value == "completed"

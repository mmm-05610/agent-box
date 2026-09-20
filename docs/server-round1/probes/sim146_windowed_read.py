"""Order 146 load-bearing probe (runtime only; no source file is modified).

Runs the real DelegationService.run twice on one child session - a long first
turn and a task_id continuation - and reports, side by side:
  NEW  what the shipped read returns, and
  OLD  what the pre-146 read (`get_session`'s windowed events, oldest 200) returns
       for the very same turn, computed here by hand.
If OLD differs from NEW the continuation gate is load-bearing.
"""
from __future__ import annotations

import importlib.util
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path("src").resolve()))
spec = importlib.util.spec_from_file_location(
    "gate146", "tests/server/test_delegation_recovery_and_read_146.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def old_windowed_read(records, session_id: str, turn_id: str) -> str:
    snapshot = records.get_session(session_id)          # event_limit default = 200
    return "".join(
        str(event["data"].get("text") or "")
        for event in snapshot["events"]
        if event.get("turn_id") == turn_id and event["kind"] == "message.delta"
    )


with tempfile.TemporaryDirectory() as tmp:
    tmp_path = pathlib.Path(tmp)
    env = module._delta_env(tmp_path, count=260, text="a", native_id="native-kid")
    first = env["service"].run(
        parent_turn_id="parent-turn", parent_profile_id=env["parent"]["profile_id"],
        arguments={"subagent": "beta", "description": "first the work", "prompt": "x",
                   "timeout": 5})
    old_first = old_windowed_read(env["records"], first["sessionId"], first["turnId"])
    second = env["service"].run(
        parent_turn_id="parent-turn", parent_profile_id=env["parent"]["profile_id"],
        arguments={"subagent": "beta", "description": "continue the work", "prompt": "y",
                   "task_id": first["task_id"], "timeout": 5})
    old_second = old_windowed_read(env["records"], second["sessionId"], second["turnId"])
    session_rows = len(env["records"].get_session(first["sessionId"])["events"])
    print(f"session event rows returned by the windowed read : {session_rows}")
    print(f"turn 1  NEW len={len(first['summary'])!s:>4}  OLD len={len(old_first)}")
    print(f"turn 2  NEW len={len(second['summary'])!s:>4}  OLD len={len(old_second)}  "
          f"OLD repr={old_second[:20]!r}")
    print("continuation gate load-bearing :",
          old_second != second["summary"],
          f"(old read gave {len(old_second)} chars where the fix gives {len(second['summary'])})")

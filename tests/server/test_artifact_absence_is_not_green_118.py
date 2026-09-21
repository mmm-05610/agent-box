"""Order 118: an absent artifact must not be readable as "no failures, green".

`QA-010` measured the same sha answering twice: with the Worker artifacts
missing `18 failed / 961 passed / 21 skipped`, with only the artifacts added
back `1 failed / 999 passed / 0 skipped`. Both readings contain no red about the
gates that never ran. The mechanism is reproduced here rather than remembered:

  * artifact away   - `AGENTBOX_W43_WORKER=/no/such/worker` on 086's real-round
    file: pytest exits **0**, one skip, and the reason names the Worker binary.
  * hook away       - the same skip raised outside this tree's `conftest.py`:
    exit **0**, and nothing in the output says the gate did not run.

Everything here is subprocess-level on purpose: the claim is about what a count
line says, and a unit test of a function that nobody prints cannot show it.
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import subprocess
import sys

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts/server-round1/artifact_presence.py"
CONFTEST = REPO / "tests/conftest.py"
EVIDENCE = REPO / "docs/server-round1/fullstack/118-artifact-presence"

_spec = importlib.util.spec_from_file_location("artifact_presence_118", SCRIPT)
presence = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(presence)

_cspec = importlib.util.spec_from_file_location("tests_conftest_118", CONFTEST)
conftest_module = importlib.util.module_from_spec(_cspec)
_cspec.loader.exec_module(conftest_module)


def run_pytest(*args, cwd=REPO, env=None) -> subprocess.CompletedProcess:
    environment = dict(os.environ)
    environment["PYTHONPATH"] = str(REPO / "src")
    environment.pop("AGENTBOX_STRICT_PRESENCE", None)
    environment.update(env or {})
    return subprocess.run(
        [sys.executable, "-m", "pytest", *args, "-p", "no:cacheprovider"],
        cwd=cwd, env=environment, capture_output=True, text=True, timeout=300)


class FakeReporter:
    def __init__(self):
        self.lines: list[str] = []
        self.stats: dict[str, list] = {"failed": [], "skipped": []}

    def write_line(self, line, **kwargs):
        self.lines.append(str(line))


# -- G1: absence shows up as a machine-readable fact ------------------------

@pytest.mark.parametrize("reason, expected", [
    ("sidecar entry not built", presence.ARTIFACT),
    ("the real-harness round needs the release Worker binary and bubblewrap",
     presence.ARTIFACT),
    ("bwrap is required", presence.TOOL),
    ("node is unavailable", presence.TOOL),
    ("no wsl.exe channel on this host", presence.TOOL),
    ("POSIX mode bits are not Windows ACL evidence", presence.DESIGN),
    ("a skip reason nobody has ever written a rule for", presence.UNKNOWN),
])
def test_a_skip_reason_gets_a_class_and_the_unknown_class_is_not_green(reason, expected):
    classes = presence.classify_skip(reason)
    assert expected in classes, (reason, classes)


def test_zero_failures_is_no_longer_the_verdict():
    """The old reading keyed on exactly one thing; this asserts the disagreement.

    `QA-010`'s shape - 21 artifact-gated skips, no failures - has to come back
    *not* green, while a genuinely clean run still does.
    """
    assert presence.verdict({presence.ARTIFACT}, failures=0) == "DEGRADED_ARTIFACT_ABSENT"
    assert presence.verdict({presence.UNKNOWN}, failures=0) == "DEGRADED_UNCLASSIFIED_SKIP"
    assert presence.verdict({presence.DESIGN}, failures=0) == "GREEN_DESIGN_SKIPS_ONLY"
    assert presence.verdict(set(), failures=0) == "GREEN_NO_SKIPS"
    assert presence.verdict({presence.ARTIFACT}, failures=18) == "FAILED"


def test_counter_example_deleting_the_rules_cannot_restore_the_old_green():
    """The falsifier the order asked for, run for real.

    "Skip counted as green" used to be the behaviour of not looking at skips at
    all. Making that reachable again would be one line of deletion, so the gate
    checks that the deletion lands on UNKNOWN - which is never green - instead.
    """
    original = presence.RULES
    presence.RULES = ()
    try:
        stripped = presence.verdict(set(presence.classify_skip("sidecar entry not built")), 0)
        assert stripped == "DEGRADED_UNCLASSIFIED_SKIP", stripped
    finally:
        presence.RULES = original
    assert presence.verdict(set(presence.classify_skip("sidecar entry not built")), 0) == \
        "DEGRADED_ARTIFACT_ABSENT"


def test_the_absence_reproduces_and_the_count_line_says_so():
    """Real chain: point the Worker binary path at nothing, run the file that
    gates on it, and read what the suite reports. Exit 0 is the bug's shape."""
    result = run_pytest("tests/server/test_subagent_harness_real_round_086.py", "-q", "-rs",
                        env={"AGENTBOX_W43_WORKER": "/no/such/worker"})
    assert result.returncode == 0, result.stdout[-2000:]
    assert "1 skipped" in result.stdout, result.stdout[-2000:]
    assert "VERDICT=DEGRADED_ARTIFACT_ABSENT" in result.stdout, result.stdout[-2000:]
    assert "SKIPPED_CLASSIFIED_artifact=1" in result.stdout, result.stdout[-2000:]
    assert (EVIDENCE / "worker-artifact-absent.txt").exists(), "the same run's saved evidence is gone"


def test_strict_mode_is_the_half_that_cannot_be_walked_past():
    """Same command, one environment variable: degraded becomes a red exit code.

    Default off with a reason: the runtime tree has no Worker artifacts at all
    (its `target/` directory does not exist), and red-by-default there would
    look like a defect instead of the fact this order is trying to surface.
    """
    plain = run_pytest("tests/server/test_subagent_harness_real_round_086.py", "-q",
                       env={"AGENTBOX_W43_WORKER": "/no/such/worker"})
    strict = run_pytest("tests/server/test_subagent_harness_real_round_086.py", "-q",
                        env={"AGENTBOX_W43_WORKER": "/no/such/worker",
                             "AGENTBOX_STRICT_PRESENCE": "1"})
    assert plain.returncode == 0 and strict.returncode != 0, (plain.returncode, strict.returncode)
    assert "STRICT_PRESENCE=1" in strict.stdout, strict.stdout[-1500:]


# -- G2: the count line carries the row without a human remembering ----------

def test_a_clean_run_reports_presence_and_stays_green(tmp_path):
    """`不误伤` measured on a real suite: no skips here, so the block must say
    present-and-green and must not change the exit code."""
    result = run_pytest("tests/server/test_wire_seq_numbering_spaces_128.py", "-q")
    assert result.returncode == 0, result.stdout[-2500:]
    assert "VERDICT=GREEN_NO_SKIPS" in result.stdout, result.stdout[-2500:]
    for line in ("WORKER_ARTIFACT=", "ARTIFACT_worker-release="):
        assert line in result.stdout, (line, result.stdout[-2500:])


def test_counter_example_without_the_hook_nothing_is_said(tmp_path):
    """The revert this order defends against is "the hook was never there".

    Reproduced by raising the same artifact-gated skip in a directory that does
    not inherit this tree's conftest: exit 0 again, and no `VERDICT=` line -
    which is exactly how 21 skips used to disappear into a pass.
    """
    (tmp_path / "test_absence.py").write_text(
        "import pytest\n\n"
        "def test_needs_the_worker_binary():\n"
        "    pytest.skip('the real-harness round needs the release Worker binary')\n",
        encoding="utf-8")
    result = run_pytest("test_absence.py", "-q", "-rs", cwd=tmp_path)
    assert result.returncode == 0, result.stdout[-1500:]
    assert "1 skipped" in result.stdout, result.stdout[-1500:]
    assert "VERDICT=" not in result.stdout, result.stdout[-1500:]


def test_counter_example_a_silent_reporter_is_itself_not_green(monkeypatch):
    """G2's teeth: if the block stops being written, the gate notices - and the
    block cannot be replaced by silence, because an unavailable report has its
    own non-green verdict."""
    reporter = FakeReporter()
    monkeypatch.setattr(conftest_module, "_SKIPPED_REASONS", ["sidecar entry not built"])
    conftest_module.pytest_terminal_summary(reporter)
    assert any(line.startswith("VERDICT=DEGRADED_ARTIFACT_ABSENT") for line in reporter.lines), \
        reporter.lines

    silent = FakeReporter()
    monkeypatch.setattr(conftest_module, "_presence", lambda: None)
    conftest_module.pytest_terminal_summary(silent)
    assert any("DEGRADED_PRESENCE_REPORT_UNAVAILABLE" in line for line in silent.lines), \
        silent.lines


# -- G4: the counter-examples are commands, not prose -----------------------

def test_the_classifier_is_self_checking():
    result = subprocess.run([sys.executable, str(SCRIPT), "--self-test"],
                            capture_output=True, text=True, cwd=REPO, timeout=120)
    assert result.returncode == 0, (result.stdout, result.stderr)
    assert "GREEN" in result.stdout, result.stdout


def test_the_absence_log_parses_into_the_same_classes():
    """The saved evidence must be re-derivable, not just quotable."""
    text = (EVIDENCE / "controlled-absence-accounts.txt").read_text(encoding="utf-8")
    classes = presence.classes_from_rs_log(text)
    assert len(classes) == 2, classes
    assert all(classes[node] == [presence.TOOL] for node in classes), classes


def test_the_declared_skip_reasons_are_all_classified_in_this_tree():
    """The drift half: a new skip reason with no class is a future silent green.

    `UNKNOWN` is never green, so an unclassified reason cannot hide - but it
    should not be *normal* either, and this is the place that says which of the
    two happened. Friction here is intended (same shape as 103's meta-gate).
    """
    inventory = presence.skip_inventory()
    assert inventory, "the scan stopped matching reality - it found no skip reasons at all"
    unclassified = [(site, reason) for site, reason in inventory
                    if presence.classify_skip(reason) == [presence.UNKNOWN]]
    assert unclassified == [], unclassified


def test_the_inventory_names_the_gates_that_would_have_been_silent():
    """QA-010's 21-skip question answered for a tree where the artifacts exist:
    the list cannot come from running, so it is read off the declarations."""
    inventory = presence.skip_inventory()
    artifact_gated = [site for site, reason in inventory
                      if presence.ARTIFACT in presence.classify_skip(reason)]
    assert any("test_harness_sidecar.py" in site for site in artifact_gated), artifact_gated
    assert any("test_subagent_harness_real_round_086.py" in site for site in artifact_gated)
    assert len(artifact_gated) >= 6, artifact_gated


def test_every_claimed_artifact_path_is_named_here_rather_than_inferred():
    """A presence report whose list drifted from reality is the 097 disease.

    LNX-002 review item 3: what this tree is missing is an **artifact-preparation
    gap** (the Worker binaries were never built here and the ACP npm closure was
    never installed). Those absences are named in `PREPARATION_GAPS`, each with
    the step it waits on, and this asserts the register is *exactly* the measured
    absence - in both directions:

    * an absence with no entry fails, so a new gap cannot slip in unregistered;
    * an entry that is actually present fails, so the register cannot rot into a
      standing excuse once the artifacts exist.

    It does not claim the artifacts are present, and nothing was copied in from
    another tree to make it pass.
    """
    labels = {label for label, _present, _relative in presence.artifact_presence()}
    assert labels == set(presence.ARTIFACT_PATHS)
    absent = {label for label, ok, _ in presence.artifact_presence() if not ok}
    assert absent == set(presence.PREPARATION_GAPS), (
        f"measured absent: {sorted(absent)}; registered: {sorted(presence.PREPARATION_GAPS)} - "
        "a new absence needs a named preparation step, and a satisfied entry must leave the register")
    for label, reason in presence.PREPARATION_GAPS.items():
        assert reason.strip(), label

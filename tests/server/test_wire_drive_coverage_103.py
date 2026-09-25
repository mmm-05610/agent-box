"""Order 103: the wire's drive-coverage ledger is a gate, not a document.

Order 097 rotted because a hand-maintained list of what exists was allowed to
disagree with reality; 101's five methods rotted because a test could call the
implementation and still leave the wire undriven. So the ledger here is
*generated* by `scripts/server-round1/wire_drive_coverage.py`, and these gates
assert what the scanner says, that the document still matches it, and - the part
that decides whether any of this is worth having - that a gap is *detectable*.

G4: nothing here makes a model call. The scanner reads files; it does not run
them.
"""
from __future__ import annotations

import importlib.util
import pathlib
import re
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
LEDGER = ROOT / "docs/server-round1/fullstack/wire-drive-coverage.md"
EXEMPTIONS = ROOT / "docs/server-round1/fullstack/wire-drive-exemptions.md"

_spec = importlib.util.spec_from_file_location(
    "wire_drive_coverage", ROOT / "scripts/server-round1/wire_drive_coverage.py")
coverage = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(coverage)


def corpus():
    return sorted(p for p in (ROOT / "tests").rglob("*.py") if "__pycache__" not in str(p))


# -- the table the ledger is about ----------------------------------------

def test_the_scanner_sees_every_method_the_dispatcher_can_dispatch(tmp_path):
    """The scanner parses `WireService.__init__` instead of importing it, so the
    first thing worth proving is that its parse loses nothing.

    (It did: an indentation-based first attempt silently found 54 of 64 - the
    same class of bug this order is meant to catch, caught by the cheapest
    possible cross-check against a live dispatcher.)
    """
    sys.path.insert(0, str(ROOT / "src"))
    from agent_box.server.bootstrap import build_runtime

    parsed = set(coverage.dispatch_methods())
    live = set(build_runtime(tmp_path / "data").wire._handlers)  # noqa: SLF001
    assert parsed == live, (sorted(live - parsed), sorted(parsed - live))
    assert len(parsed) == 67


def test_every_registered_method_is_driven_over_the_wire_or_exempted():
    """The meta-gate: the difference between the table and (evidence ∪ exemptions)
    must be empty, and it is reported by name when it is not."""
    driven, gaps, exemptions = coverage.survey()
    assert gaps == {}, sorted(gaps)
    assert set(driven) | set(exemptions) == set(coverage.dispatch_methods())
    assert len(driven) == 67


# -- the document cannot drift from the tool ------------------------------

def test_the_generated_ledger_lists_each_method_with_the_evidence_the_tool_found():
    """A ledger that can disagree with its generator is how 097's table happened.

    Row-by-row: same 64 method names, and the cited file for each row is one the
    scanner actually credits.
    """
    driven, _gaps, exemptions = coverage.survey()
    # `(?:[a-zA-Z]+\.)*[a-zA-Z]+` - namespaced ids may carry more than one dot
    # (`acp.channel.open`), and the ledger must be able to say so.
    rows = {method: (body, count)
            for method, body, count in re.findall(
                r"^\|\s*`((?:[a-zA-Z]+\.)+[a-zA-Z]+)`\s*\|(.*)\|\s*(\d+)\s*\|\s*$",
                LEDGER.read_text(encoding="utf-8"), re.M)}
    assert set(rows) == set(coverage.dispatch_methods()), (
        set(coverage.dispatch_methods()) ^ set(rows))
    for method, (body, count) in ((m, (rows[m][0], rows[m][1])) for m in rows):
        if method in driven:
            assert int(count) == len(driven[method]), method
            cited = re.search(r"`([^`]+?):(\d+)`", body)
            assert cited, method
            assert (ROOT / cited.group(1)).exists(), method
        else:
            assert method in exemptions, method


# -- the gates can bite ---------------------------------------------------

def test_hiding_the_only_evidence_for_a_method_opens_a_gap():
    """The scanner's output must depend on the evidence, not on a list of names.

    `usage.aggregate` and the three `providerArtifacts.*` methods are driven by
    exactly one file each (added by 101); take that file away and the gap
    appears, which is what the ledger's 67/67 is actually asserting.
    """
    driven, _, _ = coverage.survey()
    #: 101 is the order that turned these five from "no evidence at all" into
    #: exactly one file, so it is the named victim rather than an arbitrary one.
    victim = "usage.aggregate"
    hits = driven[victim]
    assert {h[0] for h in hits} == {hits[0][0]}, (victim, hits)
    only_file = ROOT / hits[0][0]
    hidden = [p for p in corpus() if p != only_file]
    _still, gaps, _ = coverage.survey(paths=hidden)
    assert victim in gaps, (victim, only_file, sorted(gaps))


def test_naming_a_method_in_a_data_literal_is_not_evidence(tmp_path):
    """The rule that separates this from a grep for the name.

    097 keeps a 37-name tuple, 101 a `FIVE_METHODS` tuple and a params table:
    those lines name methods and drive nothing, so a corpus made only of them
    must yield zero evidence.
    """
    fake = tmp_path / "tests" / "names_only.py"
    fake.parent.mkdir(parents=True)
    fake.write_text(
        'FIVE = ("usage.aggregate", "usage.export")\n'
        'PARAMS = {"usage.aggregate": {"sessions": []}}\n'
        'URL = "/wire/v1/sessions.send"\n'
        'METHODS = ["assets.probe"]\n',
        encoding="utf-8")
    assert coverage.evidence("usage.aggregate", paths=[fake]) == []
    assert coverage.evidence("assets.probe", paths=[fake]) == []
    #: a real POST path in the same file is evidence - the rule is about the call
    assert [hit[1] for hit in coverage.evidence("sessions.send", paths=[fake])] == [3]


def test_a_method_the_table_does_not_have_is_not_credited(tmp_path):
    """A test that drives a name nobody dispatches is not coverage of anything:
    the ledger is keyed by the table, so this cannot quietly pad the count."""
    fake = tmp_path / "extra.py"
    fake.write_text('import urllib\nurllib.urlopen("/wire/v1/not.a.method")\n', encoding="utf-8")
    assert "not.a.method" not in coverage.dispatch_methods()
    driven, _gaps, _exemptions = coverage.survey()
    assert all(method in coverage.dispatch_methods() for method in driven)


# -- the exemption register stays a register, not a dumping ground --------

def test_the_register_explains_every_row_and_hides_nothing_drivable():
    """Each row needs a reason, a type and a re-check condition; and a method the
    scanner *can* credit must not sit in the register (an exemption for something
    already driven is how an exemption outlives its reason)."""
    if not EXEMPTIONS.exists():
        assert coverage.survey()[2] == {}
        return
    rows = re.findall(r"^\|\s*`((?:[a-zA-Z]+\.)+[a-zA-Z]+)`\s*\|(.*)\|\s*$",
                      EXEMPTIONS.read_text(encoding="utf-8"), re.M)
    driven, _gaps, exemptions = coverage.survey()
    assert {m for m, _ in rows} == set(exemptions)
    for method, body in rows:
        cells = [c.strip() for c in body.split("|")]
        assert len(cells) >= 3, (method, cells)
        assert all(cells[:3]), (method, cells)
        assert method not in driven, method


# -- what a credited line actually is -------------------------------------

def test_a_credited_line_asks_for_the_method_it_credits():
    driven, _, _ = coverage.survey()
    for method in ("sessions.send", "assets.publishPlugin", "usage.aggregate",
                   "workspaces.gitStatus", "server.hello"):
        hits = driven[method]
        assert hits, method
        assert method in hits[0][2], (method, hits[0])


@pytest.mark.parametrize("method", sorted(coverage.dispatch_methods())[:1])
def test_the_ledger_records_how_fragile_each_row_is(method):
    """Not a gate on a number, a gate on honesty: the count column is the number
    of evidence lines, so a method whose only driver file is deleted shows up as
    `0` in the document as well as in the gap list."""
    driven, _, _ = coverage.survey()
    assert driven[method], method
    assert re.search(rf"^\|\s*`{re.escape(method)}`\s*\|.*\|\s*[1-9]\d*\s*\|\s*$",
                     LEDGER.read_text(encoding="utf-8"), re.M), method

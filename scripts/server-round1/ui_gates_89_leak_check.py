#!/usr/bin/env python3
"""Order 089's G3 (zero credential leakage), as a checker instead of a grep line.

The contract's Validation section asks for:

    grep -rn "sk-\\|DEEPSEEK_API_KEY" docs/server-round1/fullstack/ui-gates-89/ ... || echo "零命中 ✓"

Measured before writing this file: five lines containing a key-shaped token, an
`Authorization: Bearer …` value, and a provider env-var assignment make that grep
print **"零命中 ✓"**. A gate that green-lights those four shapes is not a leakage
gate - and 089 is the order that first touches real credentials on a real
desktop, so the check has to be better than a literal before the run, not after.

What counts as a leak here follows the standing rule, not this script's taste:
credentials are locators, so **a locator path and its permission bits may appear
in a report** (that is what `R-0011` allows), while **secret material may not**.
So the rules below look for key material and Authorization values, and stay quiet
about paths, and about placeholders people legitimately write in evidence.

    python3 scripts/server-round1/ui_gates_89_leak_check.py docs/server-round1/fullstack/ui-gates-89
    python3 scripts/server-round1/ui_gates_89_leak_check.py --self-test

Non-zero exit means "at least one hit", and every hit is reported redacted:
first four characters plus length, never the value itself - a leakage checker
that prints the match into the terminal is itself a leak.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys

RULES: list[tuple[str, re.Pattern[str]]] = [
    # A prefix alone is not a key: `sk` glues to ordinary words (`skills_prompt_snapshot`).
    # The separator is what makes these vendors' shapes recognisable, so it is required.
    ("provider-key-prefix", re.compile(r"\b(?:sk|dp|ghp|gho|xox[baprs])[-_][A-Za-z0-9]{12,}\b")),
    ("authorization-value", re.compile(
        r"(?i)\b(?:authorization|proxy-authorization)\b\s*[:=]\s*[\"']?"
        r"(?:[A-Za-z]+\s+)?[A-Za-z0-9+/_=.-]{12,}")),
    # The name must sit right against the colon, and the value must be one token
    # that looks like material: long, and carrying a digit (or very long).
    ("credential-assignment", re.compile(
        r"(?i)\b(?:api[_ -]?key|access[_ -]?token|secret[_ -]?key|password|client[_ -]?secret)\b"
        r"[\"']?\s*[:=]\s*[\"'](?=[A-Za-z0-9+/_=-]{20,})(?=[^\s\"']*?[0-9])[A-Za-z0-9+/_=-]{20,}[\"']")),
    # A PEM header on its own is prose (this repository's hermes config inventory
    # quotes one to explain a file format). Header **plus** base64 body is a key.
    ("private-key-block", re.compile(
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----(?:\r?\n[ \t]*\r?\n)*"
        r"[A-Za-z0-9+/=\s]{64,}?-----END [A-Z ]*PRIVATE KEY-----")),
    ("bearer-value", re.compile(r"(?i)\bbearer\s+(?!\*+|<)[A-Za-z0-9+/_=-]{16,}")),
]

#: Evidence is allowed to name a placeholder; these are how it usually spells one.
ALLOW = re.compile(r"(?i)(placeholder|example|redacted|\*{3,}|<[^>\n]+>|\bnone\b|xxx+)")

#: Rules that need more than one line to mean anything; they run over the whole text.
WHOLE_TEXT_RULES = {"private-key-block"}

TEXT_SUFFIXES = {".md", ".txt", ".json", ".log", ".jsonl", ".yaml", ".yml", ".tsv", ".csv"}


def scan_text(text: str) -> list[tuple[int, str, str]]:
    """`(line number, rule, redacted preview)` for every rule that fires."""
    hits: list[tuple[int, str, str]] = []
    for number, line in enumerate(text.splitlines(), start=1):
        for name, pattern in RULES:
            if name in WHOLE_TEXT_RULES:
                continue  # these run over the whole text, below
            for match in pattern.finditer(line):
                value = match.group(0)
                # The whitelist is scoped to the matched material, not the line:
                # "curl -H 'Bearer <real-looking-token>' https://example.test"
                # must not be excused just because the URL says "example".
                if ALLOW.search(value):
                    continue
                hits.append((number, name, f"{value[:4]}…({len(value)} chars)"))
    for name, pattern in RULES:
        if name not in WHOLE_TEXT_RULES:
            continue
        match = pattern.search(text)
        if match and not ALLOW.search(match.group(0)):
            line = text[:match.start()].count("\n") + 1
            body = match.group(0)
            hits.append((line, name,
                         f"{body[:24]}…({len(body)} chars, 正文不回显)"))
    return sorted(hits)


def scan_tree(root: pathlib.Path) -> dict[str, list[tuple[int, str, str]]]:
    found: dict[str, list[tuple[int, str, str]]] = {}
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        hits = scan_text(path.read_text(encoding="utf-8", errors="replace"))
        if hits:
            found[str(path)] = hits
    return found


def _self_test() -> int:
    """Assertions over in-memory strings only.

    Nothing here writes a file, and the fixtures are assembled from obviously
    fake parts: a checker whose own tests contain real-shaped secrets would be
    the joke this tool exists to prevent.

    The two `real_world_false_positives` lines are quoted from this repository's
    own evidence files - they are what the first draft of these rules flagged as
    leaks. Keeping them as negative fixtures is the calibration: a leak checker
    that cries wolf gets ignored by the next person to run it, which is worse
    than not having one.
    """
    filler = "A" * 24
    must_hit = {
        "provider-key-prefix": f"upstream key is sk-{filler}",
        "authorization-value": f"Authorization: Bearer {filler}",
        "bearer-value": f"curl -H 'Bearer {filler}' https://example",
        "credential-assignment": f'payload = {{"api_key": "aB3{filler}"}}',
        "private-key-block": ("-----BEGIN RSA PRIVATE KEY-----\n"
                              + "Q" * 64 + "\n-----END RSA PRIVATE KEY-----"),
    }
    for name, sample in must_hit.items():
        rules = {rule for _n, rule, _p in scan_text(sample)}
        assert name in rules, (name, sorted(rules), sample)

    must_pass = {
        "locator is a path, not a secret": "凭据 locator：`~/.agentbox-acceptance-secret.ABC123/deepseek-api-key`（0600）",
        "placeholder bearer": "Authorization: Bearer <redacted>",
        "star mask": 'api_key: "sk-****************"',
        "plain accounting": "本轮真实调用 1 次；tokens in=41 out=212；估算 ¥0.0031",
        "word 'password' as a label": "用户界面里出现 'Password' 文案，值为空",
        "enum value, not material": "{'baseUrl': 'https://api.deepseek.com', 'authStyle': 'api_key'}",
        "vendor-ish filename": '"files": [".skills_prompt_snapshot.json", "auth.json"]',
        "PEM header in a format inventory": "      -----BEGIN PRIVATE KEY-----\n（后面没有正文，只是在讲那个文件的格式）",
    }
    for label, sample in must_pass.items():
        hits = scan_text(sample)
        assert not hits, (label, hits)

    root = pathlib.Path(__file__).resolve().parents[2]
    false_alarms = scan_tree(root / "docs")
    assert not false_alarms, f"本仓既有证据被误报：{list(false_alarms)[:3]}"
    print(f"self-test: {len(must_hit)} 必须红 ＋ {len(must_pass)} 必须绿 ＋ "
          f"全仓 docs/ 零误报（{sum(1 for p in (root / 'docs').rglob('*') if p.is_file())} 个文件）—— 全过")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("path", nargs="?", type=pathlib.Path)
    parser.add_argument("--self-test", action="store_true")
    arguments = parser.parse_args()
    if arguments.self_test:
        return _self_test()
    if arguments.path is None:
        parser.print_help()
        return 2
    root = arguments.path
    if not root.exists():
        print(f"evidence directory does not exist yet: {root}")
        print("G3 的缺席按'未跑'处理，不按'零命中'处理——空目录不是干净")
        return 1
    found = scan_tree(root)
    if not found:
        counted = sum(1 for entry in root.rglob("*") if entry.is_file())
        print(f"零命中 ✓（{counted} 个文件，"
              f"{len(RULES)} 条规则；占位符与 locator 路径按规则不计）")
        return 0
    for path, hits in found.items():
        for number, rule, preview in hits:
            print(f"{path}:{number}: {rule}: {preview}")
    print(f"G3 红：{len(found)} 个文件命中")
    return 1


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Order 089, seed leg: create the sendable Profile an *independent* root starts without.

Why this exists: `R-0056` requires the Windows-side Server to run on its own port range and
its own data root, and the QA run of 2026-09-19 (`docs/qa/ui-gates-89-windows-leg.md` §3)
found that a fresh root has **no Profile at all** (`profiles.list` ⇒ `items=0`), so gates G1/G2
were unreachable before anyone could send a message. Nothing was missing in the product - the
three faces below are the product's own; what was missing is the recipe, which the handoff
(`docs/server-round1/fullstack/ui-gates-89-windows-handoff.md` §3) had assumed away.

Credential discipline, stated because it is the whole point of the shape: the secret **value**
never enters this process. `--key-file` is only `stat`-ed (path, mode, size) and handed to
`POST /api/v1/credentials` as a path the Server reads from its own secret store
(`source_path` must be repeated as `confirm_source_path`, `app.py:249-273`). The bearer token is
read to authenticate, and asserted absent from every line this script prints.

Usage (Windows side, where the control-plane root lives):

    <venv>\\python.exe ui_gates_89_seed_profile.py ^
      --base-url http://127.0.0.1:18820 --token-file <root>\\secrets\\http-token ^
      --key-file C:\\secrets\\deepseek-key.txt --endpoint https://api.deepseek.com ^
      --model-id deepseek-chat --harness pi --harness codex --require-ready

Exit codes: 0 = every requested harness reached `ready` (or `--require-ready` was omitted);
3 = a typed refusal or a non-ready verdict (the printed `sendability.checks` say which fact);
4 = this script would have touched a forbidden port (`--forbid-port`, default 18790/18810).
`--teardown --state-file <f>` archives exactly the Profiles this seed created.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import stat
import sys
import urllib.error
import urllib.request
from pathlib import Path

#: Shapes that would mean credential or token material escaped into the report.
LEAK_SHAPES = (re.compile(r"sk-[A-Za-z0-9_-]{8,}"), re.compile(r"Bearer\s+[A-Za-z0-9._-]{16,}"))


class Face:
    """The Server's own two faces: REST for credentials, `wire/1` for everything else."""

    def __init__(self, base_url: str, token: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token

    def _send(self, url: str, body: dict, idempotency_key: str | None):
        headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        if idempotency_key is not None:
            headers["Idempotency-Key"] = idempotency_key
        request = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                                         headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", "replace")
            try:
                return exc.code, json.loads(raw)
            except json.JSONDecodeError:
                return exc.code, {"unparsable": raw[:200]}

    def rest(self, path: str, body: dict, idempotency_key: str):
        return self._send(f"{self.base_url}{path}", body, idempotency_key)

    def wire(self, method: str, params: dict):
        # The envelope `id` is not a parameter: `profiles.list`'s accepted shape is exactly
        # `{"includeArchived"}` (handlers.py:47), so read faces send no requestId at all.
        envelope_id = params.get("requestId") or f"seed89-{method}"
        status, body = self._send(f"{self.base_url}/wire/v1/{method}",
                                  {"jsonrpc": "2.0", "id": envelope_id,
                                   "method": method, "params": params}, None)
        return status, body


def _clean(token: str, value) -> str:
    """One funnel for anything this script can emit.

    A report is built from whitelisted fields, so it is safe by construction; a *refusal*
    quotes the Server's own error, and that is the path where bearer material and key shapes
    actually travel. Both go through here, so "we print what the Server said" cannot quietly
    become "we print the token".
    """
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False,
                                                            default=str)
    for shape in LEAK_SHAPES:
        text = shape.sub(lambda match: f"<redacted:{len(match.group(0))} chars>", text)
    if token:
        text = text.replace(token, f"<redacted:{len(token)} chars:token>")
    return text


def _result(face: Face, status: int, body: dict, step: str) -> dict:
    """Every step must answer with a typed envelope; a bare transport failure is exit 3."""
    if status >= 400 and "error" not in body:
        raise SystemExit(_clean(face.token, f"{step}: HTTP {status} without an error envelope: "
                                            f"{json.dumps(body)[:200]}"))
    if isinstance(body, dict) and body.get("error") is not None:
        raise SystemExit(_clean(face.token, f"{step}: refused {json.dumps(body['error'])[:300]}"))
    if status not in (200, 201):
        raise SystemExit(_clean(face.token, f"{step}: unexpected HTTP {status}"))
    return body.get("result") or {}


#: Filesystems that cannot express Unix mode bits, so `0o777` there says nothing about
#: who can read the file (measured first-hand: a file under `/mnt/c/...` reports `0o777`).
NO_UNIX_MODE_FSTYPES = ("drvfs", "9p", "cifs", "smb2", "ntfs", "exfat", "fat", "vfat", "fuse")


def _unix_modes_trusted(path: Path, mounts: list[str] | None = None) -> tuple[bool, str]:
    """Can this file's mode bits be trusted as an access-control fact at all?

    The owner-only guard below exists to stop *this script* from creating or accepting a
    world-readable key file on a normal Unix filesystem. On NTFS (and on WSL's `/mnt/c`,
    which reports `0o777` for everything) every file looks loose, so enforcing the check
    would refuse the only platform this leg can run on. Answer that honestly and say so in
    the report - never skip silently.
    """
    if os.name != "posix":
        return False, f"platform:{os.name}"
    target = Path(path).resolve()
    best_mount, best_type = "", "unknown"
    if mounts is None:
        try:
            lines = Path("/proc/mounts").read_text("utf-8", "replace").splitlines()
        except OSError:
            return True, "no-proc-mounts"
    else:
        lines = mounts
    for line in lines:
        parts = line.split()
        if len(parts) < 3:
            continue
        # `/proc/mounts` escapes spaces and tabs in the paths (`\040`, `\011`), so a mount
        # point containing one must be unescaped before it can be compared with the target.
        mount = (parts[1].replace("\\040", " ").replace("\\011", "\t")
                 .replace("\\012", "\n").replace("\\134", "\\"))
        kind = parts[2]
        if (str(target) == mount or str(target).startswith(mount.rstrip("/") + "/")) \
                and len(mount) > len(best_mount):
            best_mount, best_type = mount, kind
    if best_type in NO_UNIX_MODE_FSTYPES or best_type.startswith("fuse."):
        return False, f"fstype:{best_type}@{best_mount}"
    return True, f"fstype:{best_type}@{best_mount}"


def seed(face: Face, options) -> dict:
    key_file = Path(options.key_file)
    facts = {"keyFile": {"path": str(key_file), "exists": key_file.is_file()}}
    if key_file.is_file():
        mode = key_file.stat().st_mode
        facts["keyFile"]["mode"] = stat.filemode(mode)
        facts["keyFile"]["size"] = key_file.stat().st_size
        trusted, reason = _unix_modes_trusted(key_file)
        enforce = options.force_mode_guard if options.force_mode_guard is not None else trusted
        facts["keyFile"]["modeGuard"] = ("enforced" if enforce else "skipped") + f":{reason}"
        # Owner-only, because the Server's store refuses anything looser, and because
        # a world-readable key file is the one thing this leg must never create.
        if enforce and mode & 0o077:
            raise SystemExit(f"{key_file} is readable beyond its owner ({stat.filemode(mode)}); "
                             "chmod 600 it first - this script never reads the value itself")
    else:
        raise SystemExit(f"--key-file {key_file} is not a file (it names the secret; it is not read here)")

    status, body = face.rest("/api/v1/credentials",
                             {"kind": options.credential_kind,
                              "source_path": str(key_file),
                              "confirm_source_path": str(key_file)},
                             f"{options.label}-credential")
    credential_id = _result(face, status, body, "credentials.import").get("credentialId") or \
        body.get("credentialId")
    facts["credentialId"] = credential_id

    # `providerModels.create`'s `harness` is the **execution** family, not a vendor label:
    # a Provider record belongs to one family, and naming an unconfigured one answers
    # `HARNESS_UNAVAILABLE` (seen first-hand). So the seed writes one record per family.
    profiles = {}
    for harness in options.harness:
        status, body = face.wire("providerModels.create", {
            "requestId": f"{options.label}-provider-{harness}",
            "displayName": f"{options.provider_name} ({harness})",
            "harness": harness, "provider": options.provider_opaque,
            "credentialId": credential_id, "configuration": [],
            "models": [{"modelId": options.model_id, "displayName": options.model_name,
                        "availability": "available", "unavailableReason": None}],
            "provenance": {"baseUrl": options.endpoint, "authStyle": options.auth_style,
                           "wireApi": options.wire_api, "fieldsSource": "manual"},
        })
        provider = _result(face, status, body,
                           f"providerModels.create[{harness}]")["providerModel"]
        facts.setdefault("providerModelIds", {})[harness] = provider["id"]

        status, body = face.wire("profiles.create", {
            "requestId": f"{options.label}-profile-{harness}",
            "displayName": f"{options.profile_prefix} {harness}".strip(),
            "harness": harness,
        })
        profile = _result(face, status, body, f"profiles.create[{harness}]")["profile"]
        status, body = face.wire("profiles.updateConfig", {
            "requestId": f"{options.label}-config-{harness}", "profileId": profile["id"],
            "expectedVersion": profile["version"],
            "values": [{"controlId": "model",
                        "value": {"providerId": provider["id"], "modelId": options.model_id}}],
        })
        updated = _result(face, status, body, f"profiles.updateConfig[{harness}]")
        profiles[harness] = {"profileId": profile["id"],
                             "version": updated.get("configVersion", profile["version"])}
    facts["profiles"] = profiles

    status, body = face.wire("profiles.list", {"includeArchived": False})
    items = _result(face, status, body, "profiles.list").get("items") or []
    wanted = {entry["profileId"]: harness for harness, entry in profiles.items()}
    facts["sendability"] = {
        wanted[item["id"]]: item.get("sendability")
        for item in items if item.get("id") in wanted}
    for missing in set(wanted.values()) - set(facts["sendability"]):
        facts["sendability"][missing] = {"state": "unknown", "reason": "NOT_IN_LIST"}
    return facts


def teardown(face: Face, state: dict) -> dict:
    done = {}
    for harness, entry in (state.get("profiles") or {}).items():
        status, body = face.wire("profiles.list", {"includeArchived": True})
        items = _result(face, status, body, "profiles.list").get("items") or []
        row = next((item for item in items if item.get("id") == entry["profileId"]), None)
        if row is None:
            done[harness] = "already-absent"
            continue
        status, body = face.wire("profiles.archive", {
            "requestId": f"teardown-{harness}", "profileId": entry["profileId"],
            "expectedVersion": row["version"]})
        _result(face, status, body, f"profiles.archive[{harness}]")
        done[harness] = "archived"
    return done


def main(argv: list[str] | None = None, *, face_factory=None) -> int:
    if argv is None and "--self-test" in sys.argv[1:2]:
        return self_test()
    make_face = face_factory or Face
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--token-file", type=Path, required=True,
                        help="<data root>/secrets/http-token; read, never printed")
    parser.add_argument("--key-file", help="path naming the upstream key (imported by path)")
    parser.add_argument("--credential-kind", default="api-key")
    parser.add_argument("--provider-name", default="089 seed DeepSeek")
    parser.add_argument("--provider-opaque", default="opaque-provider")
    parser.add_argument("--endpoint", default="https://api.deepseek.com")
    parser.add_argument("--auth-style", default="api_key")
    parser.add_argument("--wire-api", default="chat_completions")
    parser.add_argument("--model-id", default="deepseek-chat")
    parser.add_argument("--model-name", default="DeepSeek Chat")
    parser.add_argument("--harness", action="append", default=None,
                        help="repeatable; the Stage-1 families are pi and codex")
    parser.add_argument("--profile-prefix", default="089 seed")
    parser.add_argument("--label", default="seed89",
                        help="idempotency prefix: re-running with the same label replays, "
                             "changing the parameters under one label answers IDEMPOTENCY_CONFLICT")
    parser.add_argument("--forbid-port", action="append", default=["18790", "18810"],
                        help="R-0056 guard: the acceptance line's instances are not ours to seed")
    parser.add_argument("--state-file", type=Path)
    parser.add_argument("--mode-guard", choices=("auto", "enforce", "skip"), default="auto",
                        help="owner-only check on the key file: auto = enforce where the "
                             "filesystem can express it, skip (loudly, in the report) where it "
                             "cannot - NTFS and WSL's /mnt/c report 0o777 for every file")
    parser.add_argument("--force-mode-guard", default=None, help=argparse.SUPPRESS)
    parser.add_argument("--explain-modes", type=Path, metavar="PATH",
                        help="print how the mode guard classifies PATH and exit")
    parser.add_argument("--require-ready", action="store_true")
    parser.add_argument("--teardown", action="store_true")
    options = parser.parse_args(argv)

    options.force_mode_guard = {"auto": None, "enforce": True,
                                "skip": False}[options.mode_guard]
    if options.explain_modes is not None:
        trusted, reason = _unix_modes_trusted(options.explain_modes)
        mode = options.explain_modes.stat().st_mode if options.explain_modes.is_file() else None
        print(json.dumps({"path": str(options.explain_modes),
                          "mode": stat.filemode(mode) if mode is not None else None,
                          "unixModesTrusted": trusted, "why": reason,
                          "guardWouldApply": bool(trusted and mode is not None
                                                 and stat.S_IMODE(mode) & 0o077)},
                         ensure_ascii=False))
        return 0

    port = (options.base_url.rsplit(":", 1)[-1] or "").split("/")[0]
    if port in {str(item).strip() for item in options.forbid_port}:
        print(json.dumps({"refused": "PORT_FORBIDDEN_BY_R0056", "port": port,
                          "forbidden": options.forbid_port}, ensure_ascii=False))
        return 4

    token = Path(options.token_file).read_text(encoding="utf-8").strip()
    face = make_face(options.base_url, token)
    if options.teardown:
        if options.state_file is None or not options.state_file.is_file():
            print(json.dumps({"refused": "TEARDOWN_NEEDS_STATE_FILE"}))
            return 3
        report = {"teardown": teardown(face, json.loads(options.state_file.read_text("utf-8")))}
    else:
        if not options.key_file:
            print(json.dumps({"refused": "KEY_FILE_REQUIRED",
                              "note": "a path naming the key; --teardown is the key-free mode"}))
            return 3
        options.harness = options.harness or ["pi", "codex"]
        facts = seed(face, options)
        report = seed_report(facts)
        if options.state_file is not None:
            options.state_file.write_text(json.dumps(facts, indent=1, sort_keys=True), "utf-8")

    lines = json.dumps(report, indent=1, ensure_ascii=False)
    for shape in LEAK_SHAPES:
        if shape.search(lines) or token in lines:
            print(json.dumps({"refused": "SELF_CHECK_LEAK_SHAPE", "pattern": shape.pattern}))
            return 3
    print(lines)

    states = {harness: (value or {}).get("state")
              for harness, value in (report.get("sendability") or {}).items()}
    if options.require_ready and any(state != "ready" for state in states.values()):
        return 3
    return 0


def seed_report(facts: dict) -> dict:
    """Say what each verdict means, so the runner does not have to open the source."""
    detail = {}
    for harness, sendability in facts["sendability"].items():
        checks = (sendability or {}).get("checks") or []
        detail[harness] = {
            "state": (sendability or {}).get("state"),
            "reason": (sendability or {}).get("reason"),
            "actions": (sendability or {}).get("actions") or [],
            "checks": [{"key": item.get("key"), "state": item.get("state"),
                        "reason": item.get("reason")} for item in checks],
        }
    return {"seeded": {"credentialId": facts.get("credentialId"),
                       "providerModelIds": facts.get("providerModelIds"),
                       "profiles": facts.get("profiles"),
                       "keyFile": facts.get("keyFile")},
            "sendability": {harness: detail[harness] for harness in detail},
            "credentialMaterialReadByThisScript": False,
            "note": "blocked/unknown verdicts are the Server's facts, not this script's guess; "
                    "a credential-kind mismatch names the kind the harness wants in `checks`"}


class _StubFace:
    """A stateful stand-in for a live Server, so the seed leg's logic is checkable offline.

    It answers with whatever `answers` says, and records every call: each case below asserts
    on the *recorded calls*, because a case that only checks an exit code would go green while
    doing nothing.
    """

    def __init__(self, base_url: str, token: str, *, answers=None, sendability="ready") -> None:
        self.base_url = base_url
        self.token = token
        self.calls: list[tuple] = []
        self.answers = answers or {}
        self.sendability = sendability
        self.created: list[dict] = []
        self.archived: list[str] = []

    def _answer(self, key, status, body):
        self.calls.append((key, status, body))
        return status, body

    def rest(self, path: str, body: dict, idempotency_key: str):
        override = self.answers.get(("rest", path))
        if override is not None:
            self.calls.append((("rest", path), body, idempotency_key))
            return override
        self.calls.append((("rest", path), body, idempotency_key))
        if path == "/api/v1/credentials":
            return 201, {"credentialId": "credential_stub0001"}
        return 400, {"error": {"code": "ROUTE_UNKNOWN"}}

    def wire(self, method: str, params: dict):
        override = self.answers.get(("wire", method))
        if override is not None:
            self.calls.append((("wire", method), params))
            return override
        self.calls.append((("wire", method), params))
        if method == "providerModels.create":
            return 200, {"result": {"providerModel": {"id": "provider_stub0001"}}}
        if method == "profiles.create":
            row = {"id": f"profile_{params['harness']}", "version": 1,
                   "displayName": params["displayName"], "harness": params["harness"]}
            self.created.append(row)
            return 200, {"result": {"profile": dict(row, version=1)}}
        if method == "profiles.updateConfig":
            for row in self.created:
                if row["id"] == params["profileId"]:
                    row["version"] = 2
                    row["values"] = params["values"]
            return 200, {"result": {"configVersion": 2, "effectiveFor": "next_send"}}
        if method == "profiles.list":
            if self.sendability is None:
                # The Server answers with a list that does not contain what we just
                # created: the seed must call that out, not report a clean run.
                return 200, {"result": {"items": []}}
            items = [row for row in self.created if row["id"] not in self.archived]
            return 200, {"result": {"items": [
                {**row, "sendability": {
                    "state": self.sendability,
                    "reason": None if self.sendability == "ready" else "CREDENTIAL_KIND_MISMATCH",
                    "actions": [],
                    "checks": [{"key": "recovery", "state": "ready", "reason": None},
                               {"key": "model:provider_stub0001", "state": self.sendability,
                                "reason": None if self.sendability == "ready"
                                else "CREDENTIAL_KIND_MISMATCH"}]}} for row in items]}}
        if method == "profiles.archive":
            self.archived.append(params["profileId"])
            return 200, {"result": {"archived": True}}
        return 200, {"result": {}}


def _files(root: Path, *, key_mode=0o600, sendability="ready"):
    root.mkdir(parents=True, exist_ok=True)
    token_file = root / "http-token"
    token_file.write_text("tok-" + "a" * 24, "utf-8")
    os.chmod(token_file, 0o600)
    key_file = root / "key.txt"
    key_file.write_text("fake-loopback-value-not-a-secret", "utf-8")
    os.chmod(key_file, key_mode)
    return token_file, key_file


def self_test() -> int:
    """`--self-test`: five must go red and five must go green, all offline."""
    import contextlib
    import io
    import tempfile

    cases: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail) -> None:
        cases.append((name, bool(ok), detail if isinstance(detail, str)
                      else json.dumps(detail, ensure_ascii=False, default=str)[:400]))

    def run(argv, factory) -> tuple[int, str, list]:
        out = io.StringIO()
        code = None
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            try:
                code = main(list(argv), face_factory=factory)
            except SystemExit as exc:
                code = exc.code if isinstance(exc.code, int) else 1
                out.write("" if isinstance(exc.code, int) else str(exc.code))
        return code, out.getvalue(), factory.calls if hasattr(factory, "calls") else []

    def _payload(text: str) -> dict:
        """The report is printed once, as one JSON document (multi-line when it is a seed)."""
        text = text.strip()
        if not text.startswith("{"):
            return {}
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {}

    with tempfile.TemporaryDirectory() as scratch:
        root = Path(scratch)
        token_file, key_file = _files(root)
        base = ["--base-url", "http://127.0.0.1:18820", "--token-file", str(token_file),
                "--key-file", str(key_file), "--label", "selftest"]

        # -- R-0056 port guard: refusing must cost zero requests, not "ask then complain" --
        def record(cls, **kwargs):
            """A factory whose call log is readable even when it was never called.

            The empty-run assertions ("refused *without* a single request") are the whole
            point of two cases below, so the sink has to exist independently of an instance.
            """
            sink = []

            class _Bound(cls):
                def __init__(self, base_url, token, **inner):
                    super().__init__(base_url, token, **inner)
                    self.calls = sink

            _Bound.calls = sink

            def factory(url, token):
                return _Bound(url, token, **kwargs)

            factory.calls = sink
            return factory

        stub = record(_StubFace)
        code, text, _ = run(base + ["--base-url", "http://127.0.0.1:18790"], stub)
        check("forbidden_port_refused_without_a_single_call",
              code == 4 and "PORT_FORBIDDEN_BY_R0056" in text and not stub.calls,
              {"exit": code, "calls": len(stub.calls), "text": text[-160:]})

        # -- world-readable key file: never imported, never read --
        loose = record(_StubFace)
        _, key_file_loose = _files(root / "loose", key_mode=0o644)
        code, text, _ = run(base + ["--key-file", str(key_file_loose)], loose)
        check("world_readable_key_file_refused_before_any_call",
              code == 1 and "chmod 600" in text and not loose.calls,
              {"exit": code, "calls": len(loose.calls), "text": text[-160:]})

        # -- the guard must know when mode bits mean nothing (measured here, not assumed):
        # a file under WSL's /mnt/c reports 0o777, and NTFS reports 0o666 to native Python,
        # so an unconditional check would refuse the only platform this leg can run on.
        trusted, reason = _unix_modes_trusted(key_file)
        synthetic_untrusted, synthetic_reason = _unix_modes_trusted(
            Path("/mnt/c/Users/someone/key.txt"),
            ["C:\\wsl.localhost\\share /mnt/c drvfs rw,relatime 0 0"])
        # A mount point with an escaped space (`\040`) must still be found, or the guard
        # would fall back to the shorter "/" and call an NTFS file trustworthy.
        spaced_untrusted, spaced_reason = _unix_modes_trusted(
            Path("/mnt/my dir/key.txt"),
            ["C:\\share /mnt/my\\040dir drvfs rw 0 0", "/dev/sda / ext4 rw 0 0"])
        check("mode_guard_knows_which_filesystems_cannot_express_it",
              trusted and reason.startswith("fstype:") and len(reason) > len("fstype:")
              and not synthetic_untrusted and synthetic_reason.startswith("fstype:drvfs")
              and not spaced_untrusted and "fstype:drvfs@/mnt/my dir" == spaced_reason,
              {"thisMachine": reason, "synthetic": synthetic_reason, "spaced": spaced_reason})

        windows_like = record(_StubFace)
        _, key_file_windows = _files(root / "winmount", key_mode=0o777)
        code, text, _ = run(base + ["--key-file", str(key_file_windows), "--mode-guard", "skip"],
                            windows_like)
        skipped = json.loads(text).get("seeded", {}).get("keyFile", {}) if code == 0 else {}
        check("skipped_guard_still_accepts_and_says_so_in_the_report",
              code == 0 and str(skipped.get("modeGuard", "")).startswith("skipped:fstype:"),
              {"exit": code, "keyFile": skipped})

        forced = record(_StubFace)
        code, text, _ = run(base + ["--key-file", str(key_file_loose), "--mode-guard", "enforce"],
                            forced)
        check("enforce_still_bites_when_auto_would_have_skipped",
              code == 1 and "chmod 600" in text and not forced.calls,
              {"exit": code, "calls": len(forced.calls), "text": text[-140:]})

        # -- happy path: the exact call sequence, and the binding really carried --
        good = record(_StubFace)
        code, text, _ = run(base, good)
        report = _payload(text)
        sequence = [key for key, *_ in good.calls]
        wanted = [("rest", "/api/v1/credentials"),
                  ("wire", "providerModels.create"), ("wire", "profiles.create"),
                  ("wire", "profiles.updateConfig"),
                  ("wire", "providerModels.create"), ("wire", "profiles.create"),
                  ("wire", "profiles.updateConfig"),
                  ("wire", "profiles.list")]
        bindings = [entry[1]["values"] for entry in good.calls
                    if entry[0] == ("wire", "profiles.updateConfig")]
        provenance = next((entry[1]["provenance"] for entry in good.calls
                           if entry[0] == ("wire", "providerModels.create")), {})
        credential = next((entry[1] for entry in good.calls
                           if entry[0] == ("rest", "/api/v1/credentials")), {})
        check("call_sequence_is_the_three_public_faces_in_order",
              code == 0 and sequence == wanted,
              {"exit": code, "sequence": sequence, "wanted": wanted})
        check("model_control_actually_bound_to_the_seeded_provider",
              all(binding == [{"controlId": "model", "value":
                               {"providerId": "provider_stub0001",
                                "modelId": "deepseek-chat"}}] for binding in bindings)
              and len(bindings) == 2, {"bindings": bindings})
        check("credential_imported_by_path_only",
              set(credential) == {"kind", "source_path", "confirm_source_path"}
              and "sk-" not in json.dumps(credential)
              and credential["source_path"] == str(key_file),
              {"credential": credential})
        check("provenance_carries_the_endpoint",
              provenance.get("baseUrl") == "https://api.deepseek.com"
              and provenance.get("fieldsSource") == "manual", {"provenance": provenance})
        # The shape the first draft got wrong: a Provider record belongs to one execution
        # family, so `harness` there must name the family being seeded - not a vendor label.
        provider_families = [entry[1]["harness"] for entry in good.calls
                             if entry[0] == ("wire", "providerModels.create")]
        check("one_provider_record_per_family_named_by_that_family",
              provider_families == ["pi", "codex"], {"families": provider_families})

        # -- counter-example 1: a blocked verdict must not be reported as success --
        blocked = record(_StubFace, sendability="blocked")
        code, text, _ = run(base + ["--require-ready"], blocked)
        payload = _payload(text)
        states = {harness: value.get("state")
                  for harness, value in (payload.get("sendability") or {}).items()}
        check("blocked_sendability_exits_nonzero_under_require_ready",
              code == 3 and set(states.values()) == {"blocked"},
              {"exit": code, "states": states})

        # -- counter-example 2: a profile that never came back is NOT silently dropped --
        vanished = record(_StubFace, sendability=None)
        code, text, _ = run(base + ["--require-ready"], vanished)
        payload = _payload(text)
        reasons = {harness: (value or {}).get("reason")
                   for harness, value in (payload.get("sendability") or {}).items()}
        check("missing_sendability_reports_unknown_not_ready",
              code == 3 and set(reasons.values()) == {"NOT_IN_LIST"}
              and payload.get("sendability"), {"exit": code, "reasons": reasons})

        # -- counter-example 3: the leak self-check bites on a leaking Server --
        leaky = record(_StubFace, answers={
            ("wire", "providerModels.create"):
                (200, {"result": {"providerModel": {"id": "sk-" + "leakleak1234"}}})})
        code, text, _ = run(base, leaky)
        check("leak_shaped_value_in_a_response_is_refused",
              code == 3 and "SELF_CHECK_LEAK_SHAPE" in text, {"exit": code, "text": text[-160:]})

        # -- counter-example 4a: the report is a whitelist projection, so free text the
        #    Server puts next to our facts (a `message` carrying the token) never lands --
        secret = "tok-" + "a" * 24
        whispering = record(_StubFace, answers={
            ("wire", "profiles.list"): (200, {"result": {"items": [
                {"id": "profile_pi", "version": 2, "sendability":
                    {"state": "ready", "reason": None, "actions": [], "message": secret,
                     "checks": []}},
                {"id": "profile_codex", "version": 2, "sendability":
                    {"state": "ready", "reason": None, "actions": [], "message": secret,
                     "checks": []}}]}})})
        code, text, _ = run(base, whispering)
        payload = _payload(text)
        check("server_free_text_never_reaches_the_report",
              code == 0 and secret not in text
              and {harness: value.get("state")
                   for harness, value in (payload.get("sendability") or {}).items()}
              == {"pi": "ready", "codex": "ready"},
              {"exit": code, "leaked": secret in text,
               "states": {harness: value.get("state") for harness, value in
                          (payload.get("sendability") or {}).items()}})

        # -- counter-example 4b: but a refusal *does* quote the Server, so that path must be
        #    funneled through the same guard - the first draft of this script printed it raw --
        echoing = record(_StubFace, answers={
            ("wire", "providerModels.create"):
                (409, {"error": {"code": "IDEMPOTENCY_CONFLICT",
                                 "message": "digest over " + secret + " differs"}})})
        code, text, _ = run(base, echoing)
        check("token_in_a_refusal_message_is_redacted",
              code == 1 and secret not in text and "IDEMPOTENCY_CONFLICT" in text
              and "redacted" in text,
              {"exit": code, "leaked": secret in text, "text": text[-200:]})

        # -- counter-example 5: a typed refusal is a refusal, not a partial success --
        refused = record(_StubFace, answers={
            ("wire", "providerModels.create"):
                (409, {"error": {"code": "IDEMPOTENCY_CONFLICT", "message": "digest differs"}})})
        code, text, _ = run(base, refused)
        check("typed_refusal_stops_the_seed_loud",
              code == 1 and "IDEMPOTENCY_CONFLICT" in text, {"exit": code, "text": text[-160:]})

        # -- teardown: only the ids in the state file, and a missing state file is refused --
        state_file = root / "state.json"
        state_file.write_text(json.dumps({"profiles": {"pi": {"profileId": "profile_pi",
                                                             "version": 2},
                                                      "codex": {"profileId": "profile_codex",
                                                                "version": 2}}}), "utf-8")

        # The root also holds a Profile nobody seeded here (someone else's `hermes`);
        # teardown must not touch it.
        foreign = [{"id": "profile_pi", "version": 2, "displayName": "pi", "harness": "pi"},
                   {"id": "profile_codex", "version": 2, "displayName": "codex",
                    "harness": "codex"},
                   {"id": "profile_other", "version": 1, "displayName": "other",
                    "harness": "hermes"}]

        class _Torn(_StubFace):
            def __init__(self, base_url, token, **kwargs):
                super().__init__(base_url, token, **kwargs)
                self.created = list(foreign)

        torn = record(_Torn)
        code, text, _ = run(["--base-url", "http://127.0.0.1:18820", "--token-file",
                             str(token_file), "--teardown", "--state-file", str(state_file)], torn)
        archived = [entry[1]["profileId"] for entry in torn.calls
                    if entry[0] == ("wire", "profiles.archive")]
        payload = _payload(text)
        check("teardown_archives_only_the_seeded_profiles",
              code == 0 and sorted(archived) == ["profile_codex", "profile_pi"]
              and "profile_other" not in archived
              and payload.get("teardown", {}).get("codex") == "archived"
              and payload.get("teardown", {}).get("pi") == "archived",
              {"archived": archived, "teardown": payload.get("teardown"), "exit": code})

        code, text, _ = run(["--base-url", "http://127.0.0.1:18820", "--token-file",
                             str(token_file), "--teardown",
                             "--state-file", str(root / "nope.json")], record(_StubFace))
        check("teardown_without_a_state_file_is_refused",
              code == 3 and "TEARDOWN_NEEDS_STATE_FILE" in text, {"exit": code, "text": text[-140:]})

    passed = [name for name, ok, _ in cases if ok]
    failed = [(name, detail) for name, ok, detail in cases if not ok]
    for name, ok, detail in cases:
        print(f"{'ok  ' if ok else 'RED '} {name}  {'' if ok else detail}")
    print(f"SELF_TEST {'FAILED' if failed else 'OK'}: {len(passed)}/{len(cases)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

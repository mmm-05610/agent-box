# HD004 三段集成验证 — 联调报告 (2026-09-24)

Sole integration-executor round on the current baseline. No feature work, no
architecture growth. FE and Harness lines write-stopped: located and reported
only. Backend scope: test fixture + test tooling only; **no production
implementation was modified to create test conditions.**

Baseline heads, dirty scope and key file digests: see
[`baseline.md`](baseline.md) in this directory.
- Backend `bc-native` @ `e996e9d2` "Keep native ACP sessions live across Server turns"
- Frontend `fc-functional` @ `59856bf2` "Fix native event stream construction in FE two-turn gate"
- `desktop-ui-codex` beautification tree: not used.

Verdict: **READY_FOR_USER_PI_ACCEPTANCE** — all 7 ordered checks pass on the
real chain with no real model call. Real-Pi acceptance commands and the
operation checklist are in section 5; one prerequisite blocks that run until the
user resolves it (the pinned Pi-over-ACP bridge must be rebuilt, §5.0 and §6.7).
Remaining items are in section 6.

## 1. Chain that was actually wired

No segment was faked. Every request travelled:

```
real Electron desktop (fc-functional, CDP-driven, HOME/user-data isolated)
  -> real ACP connector + native bridge (renderer -> main process)
  -> real Server HTTP/WS (python -m agent_box.server, --execution-mode native)
  -> real harness plugin access-entry.mjs (NDJSON control + ACP relay, --native)
  -> controlled ACP peer fixture (tests/acp_orchestration/fixtures/bidirectional_acp_peer.mjs)
```

Two isolated instances ran in parallel (independent ports, data roots, peer
log dirs, electron homes, project dirs):

| instance | port | debug port | data root | plugin root | purpose |
| --- | --- | --- | --- | --- | --- |
| 1 (real plugin) | 57333 | 56961 | `$ROOT/data` | `plugins/agent-box-harness` | checks 1–6 |
| 2 (fault-injected copy) | 46503 | 38197 | `$ROOT/data2` | `$ROOT/harness-fake` | check 7 |

`$ROOT` = `/tmp/hd004-int-1790246856`.

**Evidence locations.** Everything cited below is archived inside this report
directory so it survives the temp tree: `artifacts/evidence-1/` (instance 1:
screenshots + per-check JSON/CSV), `artifacts/evidence-2/` (instance 2),
`artifacts/peer-frames/` (raw NDJSON ACP frame logs per peer process),
`artifacts/tooling/` (driver + the four launch scripts), and
`artifacts/manifest.sha256` (63 files, self-reference excluded). Where a table cell says
`evidence/x.json` or `peers/x`, read it as
`artifacts/evidence-1/x.json` / `artifacts/peer-frames/x`; live originals were
also left under `$ROOT/{evidence,evidence2,peers,peers2}`. No token value,
credential or user data is in the archive (checked against both instance token
files).


## 2. Checks 1–7

| # | 检查项 | 结论 | 关键证据 |
| --- | --- | --- | --- |
| 1 | 身份发现 / 项目选择 / 权威 cwd；空草稿不建原生会话 | 通过 | `evidence/hello.json` (serverId `server_77e096b246ff4f54bdaa42971a7c58b1`, capabilities incl. `acp.channel.open/release`), `evidence/workspace-open.json` (`ws_caf6bb39…`, `normalizedPath` = project dir, `accessibility.readable/writable` true), `evidence/check1-empty-draft.json` (head `NEW SESSIONNew sessionidle`, `Start session` disabled, empty composer, **0** `session/new` on the peer for the draft), `01-connected.png`, `02-empty-draft.png`. Same pattern re-proved on instance 2: `evidence2/check1-empty-draft.desk2.json`. |
| 2 | 首发建会话，第二轮复用同一原生会话与通道，不每轮重启 Agent | 通过 | `evidence/peer.log.old-353735.jsonl`: exactly one `session/new`; prompts `hd004 round one`, `hd004 round two`, `scenario:rich`, `scenario:permission` all carry `sessionId=hd003-hd004-main-1`; entry/peer pids unchanged across `check2-first.json` / `check2-second.json`. Independently reproduced on instance 2 (`evidence2/check2-first.json`, `evidence2/check2-second.json`, peer 360661 alive). |
| 3 | 流式文字、思考、工具调用与结果在真实界面显示 | 通过（含 1 项外观缺陷） | `evidence/check3-rich.json` + `05-streaming-mid.png` / `06-rich-final.png`: `.agent-reasoning` = "planning the answer… then running a tool.", tool card `echo tool · Result` `data-tool-state=completed` with result `tool result: 3 passed`. Cosmetic defect in §6.1. |
| 4 | 审批卡显示在对话区；选同 kind 第二个 optionId，原样回到对端 | 通过 | `evidence/check4-card.json` (card `perm_3` in `.agent-interactions-in-thread`, buttons `Pick one`/`Pick two`/`Reject`), `evidence/check4-answer.json` (clicked **Pick two** → peer received `{id:7777, outcome:{outcome:"selected", optionId:"pick-2-hd004-main"}}` verbatim; a kind-based guess would have produced `pick-1`), `07-approval-card.png`, `08-after-approval.png`. First attempt failed on a fixture bug — see §6.2. |
| 5 | 运行中停止：请求与确认分开，不伪造 cancelled | 通过 | `evidence/check5-stop.json`: before = [`Send`(disabled), `Request stop`(enabled)]; after the click `Send` disabled and the run stayed open (`alerts: []`, no "cancelled" text); `peerSawCancel: true`. Peer ordering in `peers/peer.355788.hd004-main`: `recv session/cancel` → **then** the peer's own `stopReason: cancelled` result, i.e. the terminal state came from the peer's confirmation, not from the request. UI settles with `Send` re-enabled (`10-stop-settled.png`). Note: under `native_continuation` (HEAD `e996e9d2`) a send turn has no ledger row of its own, so the ledger cannot pre-announce cancellation. |
| 6 | 切换展示/传输断开不隐式 release；显式释放后进程回收、账本正确结束 | 通过 | `check6a-views.json` (view switch keeps entry 355780 / peer 355788, same native session, send still works), `check6b-reload.json` (`Page.reload` → 0 `stdin-eof`, same pids, resend OK: `12b-post-reload-resend.png`), `check6c-explicit-release.json` (explicit release via `Reconnect` reclaimed 353727/353735), ledger `check6-ledger.csv`: `turn_a3e8…` → `cancelled / terminal_reason=released / TURN_CANCELLED` at 10:59:38, single terminal event, no in-flight execution left in `executions.list`. |
| 7 | 测试侧故障注入制造一次释放未确认：宿主自动显示失败，显式重试成功后清除 | 通过 | Injection only in `$ROOT/harness-fake` (copy of the plugin): the `close` branch returns `released:false` once under `HD004_FAKE_FIRST_CLOSE=unconfirmed`. Production plugin tree untouched. Sequence in `evidence2/check7-summary.json`: unconfirmed close → UI shows `.conn-error` "Backend release pending: conn_96b4a6bac224…: ACP channel release unconfirmed: release-unconfirmed" + button `Retry backend release` (`check7-failure-visible.json`, `14-release-pending.png`) **while entry 360653 and peer 360661 are still alive** (`check6c-explicit-release.json`) → explicit retry → alert gone (`check7-after-retry.json` `errors: []`), both pids gone from `ps` (`15-after-retry.png`) → ledger gets its **first and only** terminal event `turn.state cancelled / TURN_CANCELLED / released` at 11:19:15 (`check7-ledger.csv`). No cancellation was recorded for the unconfirmed attempt. |

## 3. Launch commands used this round

All scripts are in `$ROOT`; test tooling is `$ROOT/hd004-driver.mjs` (CDP over
the real UI; `HD004_DESK=2` selects instance 2; steps: `probe`,
`connectServer`, `firstSend`, `secondSend`, `richStream`, `permission`,
`pickSecond`, `stopFlow`, `viewSwitch`, `reloadFlow`, `reconnectRelease`,
`pendingAlert`, `retryRelease`, `reproDraftSend <text>`, `reshootEmpty`).

```bash
cd /tmp/hd004-int-1790246856
bash start-server1.sh    # real plugin root, port 57333, data root ./data
bash start-desktop1.sh   # electron, CDP 56961, isolated HOME ./euser
node hd004-driver.mjs <step>

bash start-server2.sh    # $ROOT/harness-fake, HD004_FAKE_FIRST_CLOSE=unconfirmed, port 46503
bash start-desktop2.sh   # CDP 38197, ./euser2
HD004_DESK=2 node hd004-driver.mjs <step>
```

Backend line (instance 1, verbatim shape):

```bash
PYTHONPATH=$REPO/src .venv/bin/python -m agent_box.server \
  --data-root $ROOT/data --port 57333 --execution-mode native \
  --plugin-root $REPO/plugins/agent-box-harness --native-harness pi \
  --native-adapter-command $(which node) \
  --native-adapter-arg $REPO/tests/acp_orchestration/fixtures/bidirectional_acp_peer.mjs \
  --native-continuation
```

## 4. Screenshot inventory (anonymous)

`evidence/00…13*.png` (instance 1), `evidence2/01,02,03,04,13,14,15,16*.png`
(instance 2). Contents are test project paths and fixture text only; no user
data, no credentials.

## 5. 真实 Pi 桌面验收（本轮未执行；桥已恢复并做过无模型握手检查）

This round made **no real model call** and did not touch any user credential or
user configuration. The commands below are the exact handoff for the user's own
acceptance run.

### 5.0 Prerequisite — the Pi-over-ACP bridge (restored, stable path)

`pi` itself does not speak ACP (`harnesses.toml:373-426` declares only
`pi --agent-dir /runtime/home --print`; the CLI answers with its own RPC), so the
Server's `--native-adapter-command` must be an ACP-speaking bridge.

- **Authorized bridge (I-DEC-0002), now rebuilt in-tree:**
  `bc-native/runtime/tools/acp-adapter/acp-adapter` —
  `beyond5959/acp-adapter` v0.3.8 == `491151b16846682396aca8c31e9285e414e4f3b8`,
  Go 1.24.13, sha256
  `7a727bdb5a8d6f569ad3adf22e7b43fbd70bbfa82bc86ee0eb75e0cd1a9fac68`.
  Same source pin and same toolchain as HD-002; the digest differs from the
  lost `/tmp` copy only through build flags/paths (see
  `runtime/tools/acp-adapter/BUILD-RECORD.md`). **No acceptance command below
  references `/tmp`.** No-model `initialize` handshake against the pinned Pi
  bundle: `HANDSHAKE_OK_NO_MODEL_CALL`, zero spawned children
  (`runtime/tools/acp-adapter/evidence/hd004b-bridge-handshake.json`).
- Not usable here: `@automatalabs/pi-acp@0.5.0`
  (`src/agent_box_harness/pi/production.py:71-96`,
  `npx --yes --package=@automatalabs/pi-acp@0.5.0 pi-acp`) — recorded as
  ENOENT against this user's agent dir in BC-0083/BC-0044/BC-0045.

The Server only checks that the adapter command is an absolute, existing,
executable file (`src/agent_box/server/__main__.py:59-69`,
`bootstrap/runtime.py:534-544`); it does not verify ACP-ness, so a wrong
adapter fails at handshake, not at launch.

### 5.1 Preflight (built into the launcher; also runnable by hand)

```bash
REPO=/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/bc-native
BRIDGE=$REPO/runtime/tools/acp-adapter/acp-adapter
PI=/home/maoqh/.pi/agent/install/releases/0.86.1/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js
sha256sum "$BRIDGE"   # expect 7a727bdb5a8d6f569ad3adf22e7b43fbd70bbfa82bc86ee0eb75e0cd1a9fac68
sha256sum "$PI"       # expect e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774  (verified present this round)
cat /home/maoqh/.pi/agent/install/current-version   # expect 0.86.1
env | grep '^PI_' || true    # expect nothing: PI_ARGS/PI_PROVIDER/PI_MODEL/PI_BIN/
                             # PI_SESSION_DIR/PI_DISABLE_GATE/PI_CODING_AGENT_DIR/
                             # PI_MANAGED_INSTALL_ROOT must be absent
python3 $REPO/runtime/tools/acp-adapter/handshake-check.py "$BRIDGE" "$PI" \
  /tmp/hd004b-handshake.json   # expect "verdict": "HANDSHAKE_OK_NO_MODEL_CALL"
```

`scripts/hd004b/start-pi-server.sh` repeats every one of these checks itself and
`REFUSE`s instead of degrading.

### 5.2 Launch (fresh isolated root under `$HOME`; nothing in `/tmp`)

```bash
REPO=/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/bc-native
cd "$REPO"
scripts/hd004b/start-pi-server.sh 57411
```

which is exactly (data root defaults to `~/ordessa-acceptance/hd004b`):

```bash
PYTHONPATH=src .venv/bin/python -m agent_box.server \
  --data-root "$HOME/ordessa-acceptance/hd004b/data" --port 57411 \
  --execution-mode native \
  --plugin-root "$REPO/plugins/agent-box-harness" --native-harness pi \
  --native-adapter-command "$REPO/runtime/tools/acp-adapter/acp-adapter" \
  --native-adapter-arg=--adapter=pi \
  --native-adapter-arg=--pi-bin="$PI" \
  --native-adapter-arg=--pi-session-dir="$HOME/ordessa-acceptance/hd004b/pi-sessions" \
  --native-adapter-arg=--trace-json \
  --native-adapter-arg=--trace-json-file="$HOME/ordessa-acceptance/hd004b/state-logs/pi-acp-frames.jsonl" \
  --native-continuation
```

Then the real desktop, pointed at that Server (token file is created by the
Server under `<data-root>/secrets/http-token`, mode 0600):

```bash
cd "$REPO" && scripts/hd004b/start-pi-desktop.sh 57411
```

It launches `fc-functional/apps/desktop` with
`ORDESSA_SERVER_ORIGIN=http://127.0.0.1:57411` and
`ORDESSA_SERVER_TOKEN_FILE=$HOME/ordessa-acceptance/hd004b/data/secrets/http-token`,
in an isolated app profile (`~/ordessa-acceptance/hd004b/app-profile`; pass
`APP_HOME=$HOME` to use your real desktop profile). Pi login state is read
server-side, so an isolated app profile does not disturb Pi authentication.

`--trace-json` only records the raw ACP frames the bridge already exchanges; it
is what makes §5.3 step 0 countable.

Verified this round with the same launcher: the Server accepts the restored
bridge and every adapter arg and comes up cleanly on 127.0.0.1
(`~/ordessa-builds/hd004b-launchcheck`, empty stderr, no bridge/Pi process
spawned until a channel opens — the channel is lazy). The **in-situ**
Server → access-entry → bridge handshake was not exercised against real Pi here;
that happens with the user's first connection, and §6.4's single-delivery check
applies to it.

Equivalent already-pinned supervisor, if the user prefers the HD-002 harness:
`python3 scripts/hd002/native_paired_send_server.py --root <fresh tmpdir> --port <free-port>`
(`BC-0095`) — note those four `scripts/hd002/*.py` files still hard-code the old
`/tmp` bridge path **and its old digest**, and were left untouched as the
historical record of that round rather than silently rewritten; they will
refuse preflight until re-pointed.

### 5.3 Operation checklist (mirror of checks 1–6 against real Pi)

0. **First message: exactly one delivery.** On this fresh root, before anything
   else, send one short prompt and then check the bridge frame trace:
   `grep -c '"session/prompt"' ~/ordessa-acceptance/hd004b/state-logs/pi-acp-frames.jsonl`
   → must be `1`, with exactly one Pi answer in the UI. This is the open item
   from §6.4 (the earlier duplicate was never reproduced and its attribution is
   not confirmed); a `2` is a chain defect, not a test artefact — stop and
   report.
1. Status bar → connection popover → pick the ACP entry; dot goes connected;
   identity line shows harness `pi` / the profile. Pick project
   `~/ordessa-acceptance/hd004b/project`; confirm the authoritative cwd is that
   directory.
2. Type a one-line prompt, press **Start session**; confirm a session card
   appears and Pi answers. Send a second prompt in the same session and confirm
   the same native session id is reused and no new Agent process starts:
   `pgrep -af access-entry.mjs` and `pgrep -af acp-adapter` before/after.
3. Ask something that produces thinking plus a tool call (e.g. "read
   `./file.txt` and summarise"); watch reasoning, the tool card (pending →
   completed) and its result render live.
4. When an approval card appears in the conversation, deliberately choose the
   **second option of the same kind**; the run continues on that choice.
5. Start a long-running turn and press **Request stop**; confirm the request and
   the confirmation are distinct (no "cancelled" text before Pi answers), and
   that Send re-enables afterwards.
6. Switch Sessions ↔ Conversation and reload the window: the process survives
   and the session continues. Then release explicitly (**Reconnect**) and
   confirm the harness processes are gone and `server_turns` in
   `~/ordessa-acceptance/hd004b/data/state/agentbox.sqlite` closed with
   `state=cancelled, terminal_reason=released`.

Check 7 is test-only fault injection and must **not** be repeated against real
Pi. If a release ever comes back unconfirmed in the real run, the same
`Backend release pending` notice + **Retry backend release** button is the
expected host behaviour.


## 6. Remaining issues and defects

1. **FE cosmetic (located, not changed — FE write-stopped; handed to the UI
   session).** A completed tool card renders `<pre>null</pre>` for the args
   section when the fixture omits
   `args`. Owner file:
   `fc-functional/plugins/agent/conversation/src/view.tsx:51-52`
   (`<pre>{prettyJson(argsText)}</pre>` prints `"null"` for an absent args
   payload). Minimal fix: render the args `<pre>` only when `argsText` is
   non-empty. **Classification: small display defect, explicitly not a
   blocker** — the tool call, its state transition and its result all render
   correctly (§2 check 3), so real conversation acceptance proceeds without
   waiting on it.
2. **Fixture defect fixed in-tree (test asset only).** First attempt at check 4
   produced no approval card: `bidirectional_acp_peer.mjs` sent
   `session/request_permission` options without the spec-required `name`, the FE
   ACP SDK rejected the reverse request with `-32602` mid-chain, and that error
   settled the held prompt. Evidence: `evidence/peer.log.before-name-fix.jsonl`.
   Fix applied to the fixture (`name:` on every option). Note the file is
   currently **untracked** in `bc-native`.
3. **Shared `messageId` card merge (fixture behaviour, not a product defect).**
   The rich-stream fixture reuses one `messageId` for thought + answer chunks, so
   the answer text renders inside the same card as the reasoning block
   (`check3-rich.json` note). The driver's settle predicate also matched
   `.agent-tool` via `.agent-message`, which is why `richStream` timed out; the
   render was verified directly in the DOM.
4. **Single-delivery re-verification — attribution still open, history not
   skipped.** Instance 2's very first `firstSend`
   delivered `hd004 round one` twice (`peers2/peer.360661.hd004-fake`, ids 2 and
   3, same `sessionId`). Two controlled fresh-draft sends
   (`evidence2/check-repro-draft-send.json`, texts `hd004 repro A` /
   `hd004 repro B`) each delivered exactly **1** prompt, and a send over an
   already-live session delivered 1.
   My working hypothesis was a queued send left by an earlier aborted driver
   invocation on that instance. **That hypothesis is not confirmed by the user
   and is not established fact** — it explains the observation without
   excluding the draft → Start-session path as a conditional cause, since the
   duplicate was never reproduced under control. The history is therefore kept
   here rather than written off.
   Consequence for the real run (mandatory, first message): on a fresh
   acceptance root, send **one** prompt and confirm exactly one delivery before
   anything else —
   `grep -c '"session/prompt"' ~/ordessa-acceptance/hd004b/state-logs/pi-acp-frames.jsonl`
   must read `1`, and there must be exactly one Pi answer. If it reads 2, stop
   the acceptance run and report it as a chain defect in the draft → Start-session
   path, not as a test artefact.
5. **Not tested (未测).** (a) The reconnect-gate refusal while a run is still
   open (UI error path) — the run/stop cycle and the release path were each
   verified, but their interaction was not; (b) anything requiring a real model
   call, by design of this round; (c) multi-window / second-desktop concurrency,
   approvals under disconnect, and long-session persistence.
6. **Evidence-handling incident, disclosed.** Instance 2's early `connectServer`
   run predated evidence isolation and overwrote four instance-1 files
   (`check1-empty-draft.json`, `acp-connection-id.json`, `01-connected.png`,
   `02-empty-draft.png`). The instance-2 copies were renamed with a `.desk2`
   suffix under `evidence2/`, and the instance-1 originals were re-shot from the
   still-running desktop 1 (`reshootEmpty`; the JSON now carries a
   `note: reshoot…` key). Values match the originals observed in-session.
7. **Startup-artifact prerequisite — CLOSED, and it was only ever an artifact
   problem.** The SHA-pinned Go ACP bridge used by every real-Pi run in HD-002
   lived at `/tmp/hd002-bc-go124-pTbe5u/out/acp-adapter` and is gone. This is a
   lost build output sitting in a temporary directory, **not** a newly
   discovered protocol problem: Pi itself was present and hash-matched
   throughout. It has since been rebuilt from the same approved source pin
   (`beyond5959/acp-adapter` v0.3.8 == `491151b16846682396aca8c31e9285e414e4f3b8`)
   with the same toolchain (Go 1.24.13, published checksum verified) into a
   stable project-internal path —
   `runtime/tools/acp-adapter/acp-adapter`, sha256
   `7a727bdb5a8d6f569ad3adf22e7b43fbd70bbfa82bc86ee0eb75e0cd1a9fac68` — with
   the build script, the source/toolchain record and a no-model `initialize`
   handshake check alongside it (`runtime/tools/acp-adapter/BUILD-RECORD.md`).
   The acceptance launch commands in §5 now point at that path; nothing in them
   binds to `/tmp`. Real Pi acceptance is unblocked and belongs to the user.
8. **In-tree ACP suite regression audit — `tests/acp_orchestration` is
   18-failed / 40-passed on this baseline, and it is not this round's doing.**
   Operation: `.venv/bin/python -m pytest tests/acp_orchestration -q`
   (52 s, taken after all seven checks and after the round closure).
   Failure anatomy (`--tb=line`, 18/18 accounted for):
   - 14 × `SidecarError: SIDECAR_CLOSED: sidecar exited before answering` at
     `src/agent_box/server/execution/sidecar.py:1097`.
   - 4 downstream of the same dead spawn: `test_project_binding.py:26`
     (`state: 'failed'`), `test_project_binding.py:63` and
     `test_access_authorization.py:105` (`assert 'failed' == 'completed'`),
     `conftest.py:72` (`timed out waiting for approval for alpha`).
   Root cause, pre-existing and already disclosed by the plugin itself: the
   old sidecar chain's `runtime/worker-entry.mjs` was retired during the
   plugin consolidation (`plugins/agent-box-harness/REMOVALS.md:31`, and its
   break-point report at lines 78 / 100 — `sidecar.py:265` and
   `sandbox_port.py:129` still project the retired file, "整条产品链目前不可用"
   for that chain). The suite's own `conftest.py:24-28` documents the same
   condition. The file exists at git HEAD only under the *previous* plugin path
   `plugins/agent-box-harnesses/runtime/worker-entry.mjs`, and
   `plugins/agent-box-harnesses/` is deleted in the working tree — i.e. it is
   part of the dirty scope recorded in `baseline.md` (90 M / 212 D / 79 ??),
   which predates this round.
   Independence from this round's only in-tree test change: the whole
   `tests/acp_orchestration/` directory is untracked, and the edited fixture
   `fixtures/bidirectional_acp_peer.mjs` is imported only by
   `conftest.py`, `test_managed_acp_channel.py` and `test_fixture_selfcheck.py`
   — none of them in the failing set. Running exactly those two files:
   **25 passed, `VERDICT=GREEN_NO_SKIPS`** (managed access-entry channel plus
   peer-fixture self-checks). Every failing test spawns the sidecar instead of
   the real `access-entry.mjs`, so none of them exercises the chain this round
   verified.
   Attribution: `src/agent_box/server/execution/sidecar.py` and
   `src/agent_box/extensions/runtime_composition/sandbox_port.py` (cross-package
   consumers of a retired plugin file) — Harness-side, located only, handed
   back to the main session per this round's write-scope rule.
   **Correction to the fix suggestion written earlier in this section:** the
   old chain's entry **must not** simply be renamed to
   `runtime/access-entry.mjs`. `worker-entry.mjs` was a control-protocol
   endpoint (it dispatched `register`/`start`/`open`/`create`/`prompt`/`abort`/
   `status`/`close` envelopes and performed `initialize` + `authenticate` +
   `session/new` + `session/prompt` itself, per
   `plugins/agent-box-harness/REMOVALS.md:31`), whereas `access-entry.mjs` is a
   five-verb discovery/connection/transparent-transport/status/close relay that
   sends no ACP frame on connect and never answers on the agent's behalf. Point
   one at the other and the sidecar would still fail, now on protocol shape
   instead of a missing file. The correct handling is inside the retirement
   scope: retire the old-chain `ports` diagnostics that the plugin already
   declares removed (and the two stale projections in the same change), **not**
   restore a compatibility chain to make the directory read all-green. A green
   suite bought by re-introducing a retired path would be a worse outcome than
   the honest 18 failures recorded above.
   Qualification of `baseline.md:38`: the carried "19/19 official + 2/2
   real-path release-retry green" line describes the *managed-channel* subset,
   and it held this round too (see the 25-passed run above); it was never a
   whole-directory claim and must not be read as one. No acceptance item in §2
   depends on the sidecar chain, so nothing in this round's verdict is
   downgraded — but the directory as a whole is **not** green on this baseline
   and that is stated here rather than left implicit. Raw outputs:
   `artifacts/regression-acp-orchestration-full.txt` (18 failed / 40 passed)
   and `artifacts/regression-acp-orchestration-managed-channel.txt`
   (25 passed, `VERDICT=GREEN_NO_SKIPS`).

## 7. Test-side assets created this round (nothing to merge silently)

- `$ROOT/harness-fake/**` — throwaway plugin copy carrying the one-shot `close`
  lie; **not** in either git tree.
- `$ROOT/hd004-driver.mjs`, `start-server{1,2}.sh`, `start-desktop{1,2}.sh` —
  CDP driver and launch scripts under `$ROOT`; not in either git tree.
- `tests/acp_orchestration/fixtures/bidirectional_acp_peer.mjs` — option `name`
  fields added (untracked file, test asset).
- Follow-up (bridge restoration, after this round's V1 scope was sealed):
  `runtime/tools/acp-adapter/{acp-adapter,build-acp-adapter.sh,handshake-check.py,BUILD-RECORD.md,evidence/hd004b-bridge-handshake.json}`
  and `scripts/hd004b/{start-pi-server.sh,start-pi-desktop.sh}` — all new, all
  untracked. The bridge binary is a 7.2 MB build output and should stay out of
  git (a `.gitignore` entry for `runtime/tools/acp-adapter/acp-adapter` belongs
  to whichever work order adopts this home).
- No commit, no push, no merge to main.

## 8. Round closure

Both isolated instances were created and closed by this round only:
desktop 352247 / 360489, Server 351983 / 360440 were terminated with SIGTERM at
11:24 and nothing from this round's process set survived — including harness
entry 355780 and peer 355788, which were reaped with their Server (an
additional, unprompted confirmation of §2 check 6's process-reclamation
claim). No pre-existing user service was started or stopped, no user credential
was read, and no user configuration was changed.

Status: **READY_FOR_USER_PI_ACCEPTANCE** (§5). Real-Pi acceptance, and the
pass/fail call on it, belong to the user.


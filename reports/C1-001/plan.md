# C1-001 — minimal implementation plan

Scope discipline: **only the gaps the first closed loop needs.** No dynamic plugin market, no
general configuration refactor, no wholesale absorption of backend `main`, no rewrite of the
harness layer, no Pi internals leaking into the GUI. Work Core stays provider-neutral.

## 0. Non-negotiables taken from the task

- Real Pi only. Simulated responses may be used **to debug**, and are accounted separately —
  they never stand in for the real loop.
- Credentials: consume an already-registered locator through the controlled application
  channel; never read/print/report secret content; no copying old credential stores, no
  hunting the home directory for keys. An explicitly labelled in-process injection entry is
  allowed for this dev trial **only** through that channel, and it does not prove persistent
  configuration is done.
- 2–3 short real requests to start with, local causes checked first, no unbounded retries, no
  benchmarks or batch runs; record the call count and whatever usage is actually obtainable,
  and invent no cost figures.
- Do not touch the live services or user data listed in `capability-map.md` §6.

## 1. Isolated instance (nothing shared with S-1/S-2)

| Piece | Choice |
| --- | --- |
| Task temp root | `/tmp/c1-001-pi-loop/` (task-specific; recorded in the report, not in the trees) |
| Server data root | `/tmp/c1-001-pi-loop/data` (fresh, never the trial's) |
| Server port | **`18791`** — adjacent to but distinct from S-1's `18790` and S-2's `18810` |
| Plugin root | the backend task tree's `plugins/agent-box-harnesses` |
| Pi artifact | `~/.agentbox-all-harnesses/artifacts/pi`, **read-only** |
| Test workspace | `/tmp/c1-001-pi-loop/ws` — one **no-secret** file for the read-only tool call |
| Deployment doc | generated **by me** into the temp root from the locked artifact paths (the `/mnt/c` one is not mine to edit) |
| Server entry | the product entry (`agent_box.server.__main__` / `build_runtime_from_sidecar_deployment`) — `trial-serve-linux.py` lives in the retired scheduling tree and is **not** a product entry |
| Desktop | the desktop task tree, `HERMES_DESKTOP_REMOTE_URL=http://127.0.0.1:18791`, driven through the **agentbox** wiring (not `legacy-hermes`) |

## 2. Ordered steps, and what each is allowed to change

1. **Recon Pi end to end** (read-only): adapter → runtime artifact → native driver → deployment
   schema → how `server.hello` declares `pi`. Record the locked version and its origin.
2. **Prepare the instance**: temp root, data root, deployment doc, the no-secret workspace file.
   Give one reproducible command.
3. **Profile + workspace**: one-time non-secret records bound to the Pi harness. Recorded as a
   scripted entry, not hand-edited state.
4. **Point the desktop at our server** and confirm the app is on the agentbox chain (the
   `hello` it receives must come from our port).
5. **Turn 1**: send from the GUI, receive a real Pi reply. **Turn 2**: follow up in the same
   session and verify context continuity; check the native session identity **if the adapter
   exposes it**.
6. **Read-only tool call** in the isolated workspace; verify state and result are visible in
   the UI. Show only the thinking/summary Pi actually provides; if it provides none, record
   "not supported" rather than inventing a thinking area.
7. **Error / missing-config visibility**: record how an unconfigured or unreachable state
   presents, without expanding the loop.

## 3. What is deliberately deferred (recorded, not silently dropped)

- Live cancellation, native resume after a process restart, history browsing beyond what the
  first loop needs.
- Rich tool input display (`args` is `{}` today) — the generic tool card is what the loop
  asserts.
- Remote media (the known PNG 415 gap) and the Linux persistent SecretStore — both explicitly
  out of scope for this task.

## 4. Where this plan can stop, and what it does then

| Condition | Action |
| --- | --- |
| No authorised locator for *this* isolated instance | **BLOCKED** on that specific input; report the exact input needed to I, keep preparing offline, and do **not** declare the real loop done |
| Pi artifact or a native dependency missing | record the preparation gap, keep it accounted separately (as LNX-002 did), do not copy an artifact in to manufacture a pass |
| The desktop cannot be driven in this environment | complete start + pre-checks, hand the exact two-turn operations to I for user trial, and mark **READY_FOR_USER_TRIAL** — never "GUI verified" |
| A defect blocks only this path | fix it minimally in the task trees, with a test for that change; unrelated reds are classified and deferred |

## 5. Acceptance mapping (task §C / §验收重点)

| # | Acceptance | How it is evidenced | Status vocabulary |
| --- | --- | --- | --- |
| 1 | send from the real Desktop UI, receive a real Pi reply | GUI transcript + server log + the wire call | real |
| 2 | follow up in the same session, context continues | second reply depends on the first | real |
| 3 | one read-only tool call in an isolated workspace, process and result visible | UI tool card + workspace file unchanged | real |
| 4 | thinking shows only what Pi provides | absence asserted, not filled in | real or "not supported" |
| 5 | reproducible start + a fixed version for the user to try | `handoff.md`: SHAs, one command, ports, PIDs, data root, logs, stop command | — |

Simulated validation, real-Pi validation and user acceptance are reported **separately** and
none substitutes for another.

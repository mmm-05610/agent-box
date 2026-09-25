# C1-001 — capability map (phase A)

Limited survey along the user's path — *choose a configured Agent → new session → send →
stream/tool/thinking → follow up* — as the task requires. Not repo-wide archaeology. All of
this is **static reading of the two task trees at the dev-0 SHAs**; nothing was started or
executed for this map.

Trees: `worktrees/pi-loop/backend` @ `b067c5718556c8efa93b054e6573ad3d186b3cf6`,
`worktrees/pi-loop/desktop` @ `80872f556c001b42217d43bf5f73ab08029bfcb9` (branch
`work/pi-loop-0`). `D` = `apps/desktop`, `B` = `src/agent_box`.

## 1. Is this the Ordessa agentbox product chain, or the legacy Hermes gateway?

**Product chain, and the distinction is real and load-bearing.** Both exist in the desktop
tree and they are different transports:

| | Product (agentbox) | Legacy |
| --- | --- | --- |
| Renderer entry | `D/src/app/composition/wiring/agentbox-main-chat.ts` | `D/electron/legacy-hermes/*` |
| Session/send | `D/src/application/session/wire-send.ts` | `connections-composition.ts` |
| Server shape | wire v1 (`/wire/v1/<method>`, 64 methods) | Hermes REST/WS gateway |
| Method | `sessions.createAndSend`, `sessions.send` | — |

`HERMES_DESKTOP_REMOTE_URL` (+ `HERMES_DESKTOP_REMOTE_TOKEN`) is the **product** remote hook
(`bootstrap-env-composition.ts:4991,5366,5400,5454`), and it is also referenced from
`legacy-hermes/connections-composition.ts:367-430` — so the same variable name serves both
paths. **The C1 loop must be driven through the agentbox wiring, not the legacy one**, and the
handoff names which entry is used so the two cannot be confused.

## 2. Capabilities, existing entrances, and ownership

| User capability | Existing entrance (evidence) | Owner | Gap for the Pi loop |
| --- | --- | --- | --- |
| See which Agents are available; pick the session's configuration | `B/server/wire/handlers.py` `server.hello` → `harnesses`; `D/.../agentbox-main-chat.ts` reads `profileId`/`workspaceId` | Server declares; Desktop presents | A **Profile** bound to the Pi harness and a **workspace** must exist; the desktop must be pointed at *our* server |
| New session + repeated sending | `handlers.py` `sessions.createAndSend`, `sessions.send`, `sendOutcome.query`; `D/src/application/session/wire-send.ts` | Core intent + stable `requestId`; Server accepts/queues | None structural — this is the path to drive |
| Text / thinking / tool in service order | `D/src/application/session/wire-session-projection.ts` (`timeline`, `thought.delta`, `tool.update`); `D/src/features/chat/agentbox-chat-view.tsx` (`partsInServiceOrder`) | Core projection; **display only what the Agent actually emitted** | Thinking must show **only** what Pi provides (task acceptance 4); a Pi that emits none must show none |
| Tool details and results | `agentbox-chat-view.tsx` `toolPart` → name/state/summary/resultExcerpt, **`args` is currently `{}`** | Core generic tool card | A read-only tool call must be visible with its state/result; **rich tool input is not claimed** |
| Stop and approvals | `D/src/application/session/wire-session-control.ts` (`requestAgentBoxStop`, `decideAgentBoxApproval`); `handlers.py` `runs.stop`, `approvals.decide` | Desktop requests; Server/Runtime decides | Out of the first loop (task §C.5 allows recording current state) |
| History, reopen, reconnect | `wire-session-catalog.ts`; `hydrateAgentBoxHistory`; projection `appliedEventIds`/`lastSeq`/`needsResync` | Three separate capabilities | Out of the first loop |

## 3. Why `profileId` and `workspaceId` are not optional

`sessions.createAndSend` requires `workspaceId`, `profileId`, `overrides`, `message`
(`product/C1-agent-conversation.md` §"薄核心"). So:

- **`profileId`** carries the harness binding, the frozen execution configuration and the
  credential reference. Without it the Server has no harness to dispatch to. The Profile
  domain cannot be removed and still let sending work — the *editing* UI is a module, the
  *binding read* is a core dependency.
- **`workspaceId`** is the execution context (which directory the Agent runs in). The first
  loop needs one **isolated** workspace holding a no-secret file for the read-only tool call.

Both are one-time, non-secret records for this trial, and the task allows preparing them with
a reproducible entry.

## 4. Native session identity and the recovery boundary

- The wire has its own opaque session identity (`sessions.*`), and the harness has a **native**
  session identity underneath (`D`… `sidecar_backend` / the Pi adapter's native driver). The
  Pi adapter materialises native config (`native_materialization.py:44,80,146,273`) and its
  runtime drives the native driver (`plugins/agent-box-harnesses/runtime/native-driver.mjs`).
- Task acceptance 3 asks to check the **same native session identity** across two turns *if
  the adapter can expose it*. Whether Pi exposes it is a finding for phase C, not an
  assumption here.
- Recovery boundary, recorded so it is not overclaimed: reading history, reconnecting the
  event stream, and **resuming a native execution after a process restart** are three
  different capabilities. Only the first is plausibly available for a first loop; native
  resume is out of scope (§C.5).

## 5. Pi assets and what the loop depends on

| Thing | Where | State |
| --- | --- | --- |
| Pi adapter | `B/plugins/agent-box-harnesses/src/agent_box_harnesses/pi/`, `entrypoints.py:create_pi()` | present |
| Harness runtime (JS entry) | `plugins/agent-box-harnesses/runtime/worker-entry.mjs` + `native-driver.mjs` | present |
| Pi runtime **artifact** | `/home/maoqh/.agentbox-all-harnesses/artifacts/pi` (user-level, mounted read-only by the live trial servers) | **present** (per `environments.md` §2) — the harness runtimes are *not* the missing Worker artifact |
| Deployment document | `/mnt/c/agentbox-uigate46/deployment.json` (`{schemaVersion:1, harnesses:[8]}`) | read-only, not mine to edit |
| Credential locator | `/home/maoqh/.agentbox-acceptance-secret.CnsAonj6/deepseek-api-key`, id `credential_7dec0e4b…`, label `deepseek-official` | **exists**; read-only; contents never opened |

⚠️ **This is where the loop can still stop.** The locator belongs to the S-1 trial and is
consumed there through `--credential-source`. Whether *my* isolated server may consume the
same locator is a **credential-boundary question for I**, not something I decide — the task
allows an explicitly labelled in-process injection entry for this dev trial, but only to
consume an **authorised** locator through the controlled application channel. If I cannot
establish that authorisation from the task text, the real leg is `BLOCKED` on that input and
I report it rather than inventing a response.

## 6. What must NOT be touched (from `environments.md`)

S-1 (`127.0.0.1:18790`), S-2 (`127.0.0.1:18810`), S-3 (Windows `18830`), S-4 (the user's
Electron app, CDP `9222`), their data roots (`~/.agentbox-trial-chat`, `~/.agentbox-qa-2nd`),
`~/.agentbox-all-harnesses/**`, `/mnt/c/agentbox-*`, `/tmp/qa-line`, `/tmp/audit-fe-2` — all
**read-only / do not stop**. The first loop therefore runs on **my own port, my own data root,
in a task temp dir**, and stops only what it started.

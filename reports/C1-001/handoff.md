# C1-001 — handoff

**Status: BLOCKED on missing runtime inputs** (see `verification.md` §2). Phase A and B are
complete; nothing is left running by me, so there is no PID, port or log to watch.

## 1. Fixed versions

| Tree | Branch | HEAD (full SHA) |
| --- | --- | --- |
| backend | `work/pi-loop-0` | `b067c5718556c8efa93b054e6573ad3d186b3cf6` |
| desktop | `work/pi-loop-0` | `80872f556c001b42217d43bf5f73ab08029bfcb9` |

Both are the dev-0 baseline (`development-baseline.json`), unmodified: **no product change was
made**, because the loop never reached a point where a defect could be observed.

## 2. Protocol and dependency identity

- **Wire artifact**: `b1eb4762b2a8e13e873967b770854e5e73a948488d4d066da07bc584e693dcd1`
  (the dev-0 value in `development-baseline.json`; the two trees' copies are byte-identical, so
  no protocol change was needed for this loop).
- **Generation entry** (if the protocol ever must move): `apps/desktop/scripts/generate-wire-contract.mjs`
  — `--check` reports current, regeneration is a byte-identical no-op.
- **Harness JS closure**: reproducible from the shipped offline lock
  `plugins/agent-box-harnesses/runtime/artifacts/SBOM.json` (`agentbox-offline-lock/1`), which
  pins every production package by `sha512`; documented reproduction is
  `npm ci --ignore-scripts` against a mirror serving those integrities.
- **Pi runtime artifact**: *not identified on this host.* The adapter requires it at
  `/runtime/artifacts/pi-runtime` with a matching `treeDigest`
  (`plugins/agent-box-harnesses/src/agent_box_harnesses/pi/production.py:71-74,226`). Its
  identity and source are the first thing the next session must establish.

## 3. One start command (prepared, **not yet executed here**)

```bash
# 1. isolated root (task-specific; never the trial's data)
export C1=/tmp/c1-001-pi-loop
mkdir -p "$C1/data" "$C1/ws" "$C1/logs"
printf 'read-only fixture for the tool-call step\n' > "$C1/ws/readme-fixture.txt"

# 2. server, from the BACKEND task tree, on its own port
cd /home/maoqh/projects/ordessa/worktrees/pi-loop/backend
export PYTHONPATH="src:$(ls -d plugins/*/src | tr '\n' ':')"
export AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap
python -m agent_box.server --data-root "$C1/data" --port 18791 \
  --deployment "$C1/deployment.json" \
  --plugin-root "$PWD/plugins/agent-box-harnesses" \
  > "$C1/logs/server.log" 2>&1 &

# 3. desktop, from the DESKTOP task tree, pointed at OUR port through the product hook
cd /home/maoqh/projects/ordessa/worktrees/pi-loop/desktop/apps/desktop
HERMES_DESKTOP_REMOTE_URL=http://127.0.0.1:18791 npm run dev
```

⚠️ The `python -m agent_box.server` flags are the shape the task tree's own CLI expects; they
must be confirmed against `agent_box/server/__main__.py` on the first run, and the
`deployment.json` must be generated for `pi-runtime` (the `/mnt/c` one is not mine to edit).
Treat this block as the *intended* entry, not as a verified one.

**Entry points, named so they cannot be confused**: the GUI loop must go through the agentbox
wiring (`apps/desktop/src/app/composition/wiring/agentbox-main-chat.ts`) — **not**
`apps/desktop/electron/legacy-hermes/*`. `HERMES_DESKTOP_REMOTE_URL` is read by both paths, so
confirm from the server log that the request arrived on **18791**.

## 4. Test data

| What | Where |
| --- | --- |
| Isolated data root | `/tmp/c1-001-pi-loop/data` |
| Isolated test workspace (no secrets) | `/tmp/c1-001-pi-loop/ws` — `readme-fixture.txt` |
| Logs | `/tmp/c1-001-pi-loop/logs/` |
| Deployment document (to be generated) | `/tmp/c1-001-pi-loop/deployment.json` |
| One-time non-secret records (Profile bound to Pi, workspace) | created by a scripted entry into the data root above; recorded when written |

None of this touches `~/.agentbox-trial-chat`, `~/.agentbox-qa-2nd`,
`~/.agentbox-all-harnesses/**`, `/mnt/c/**`, `/tmp/qa-line` or `/tmp/audit-fe-2`.

## 5. Two-turn trial steps (for the user, once the inputs exist)

1. Start the server and desktop as above; confirm the desktop's Agent list comes from **18791**.
2. **Turn 1** — new session with the Pi Profile, send a short prompt. Expected: a real Pi reply
   in the transcript. Record whether any thinking area appears; if Pi sends none, there must be
   **no** thinking area.
3. **Turn 2** — follow up in the same session referring to turn 1. Expected: the reply shows
   the context carried over. If the adapter exposes the native session identity, confirm it is
   the **same** across both turns.
4. **Tool step** — ask Pi to read `readme-fixture.txt` in the isolated workspace (read-only).
   Expected: the tool card shows the call and its result, and the file is unchanged.
5. Record the actual call count and any usage the harness reports; invent no cost figures.

## 6. Current limits, stated plainly

- Nothing was run: no server, no desktop, no real Pi request, no GUI turn. So there is **no**
  `VERIFIED_PI_GUI_LOOP` and nothing for the user to accept yet.
- The Pi runtime artifact, the deployment document and the credential locator are absent here;
  whether this isolated instance may consume the `deepseek-official` locator is **I's** decision.
- Tool input display is generic (`args` is `{}` today) — the loop asserts the generic card only.
- Live cancel, native resume after a restart, history browsing, remote media and the Linux
  persistent SecretStore are all out of scope for this loop.

## 7. Stop command

Nothing of mine is running, so there is nothing to stop. If the block above is started, stop it
with the recorded PID only:

```bash
kill "$(cat /tmp/c1-001-pi-loop/logs/server.pid)"   # only the server this task started
```

Never stop S-1, S-2, S-3 or the user's app: they are not mine, and `environments.md` marks them
do-not-touch.

## 8. What the next session needs from I — **two items, not four** (corrected 20:40)

The first version of this list named four; two of them turned out to be mine to solve once I
stopped anchoring on the superseded WSL paths (`implementation.md` §3). What is left:

1. **An authorised DeepSeek account/key for this trial, and how it should be registered.**
   The credential never passes through me: the Server resolves a registered locator and injects
   `$DEEPSEEK_API_KEY` into the adapter child process (`pi/production.py:56`;
   `deploy/pi/models.json` reads `$DEEPSEEK_API_KEY`). So I need the account authorisation and
   the registration route — **not** the secret value, and I will not go looking for one.
2. **Who drives the two GUI turns.** This host has no controllable desktop for me to drive. If
   you drive it, the state becomes `READY_FOR_USER_TRIAL` once (1) exists — and never
   "GUI verified" from my side.

Already solved on this host, so they are *not* asks: the `pi-runtime` artifact (built here from
the repo's own lock — 336 packages, adapter entry present) and the deployment document (from the
in-tree `deploy/pi/` template).

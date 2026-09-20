# Environments — services, ports, data roots, and whether they may be touched

Measured by the cleanup executor on **2026-09-20 ~13:15–13:30 (+08:00)** from the
process table, listening sockets and `/proc`. **Nothing here was started, stopped
or reconfigured.** Read the "may I touch it" column as the cleanup's standing
instruction to whoever works here next.

## 1. Live services (all three were running when the sessions were already closed)

### S-1 — the user's trial server (WSL side)

| | |
| --- | --- |
| Listener | `127.0.0.1:18790`, pid **749**, started 2026-09-20 **09:45** |
| Command | `python3 <scheduling-tree>/scripts/server-round1/trial-serve-linux.py --data-root /home/maoqh/.agentbox-trial-chat --port 18790 --deployment /mnt/c/agentbox-uigate46/deployment.json --plugin-root <env-provider>/plugins/agent-box-harnesses --label deepseek-official …` |
| Code in use | `PYTHONPATH` = `agent-box-env-provider/{src,plugins/agent-box-harnesses/src,plugins/agent-box-runtime-wsl/src,plugins/agent-box-sandbox-bwrap/src}`; `AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap` |
| Version actually running | env-provider at the commit the tree held at 09:45 ≈ **`b630acd`** — **not** the current clean HEAD `003b52b` (10 commits later) |
| Health now | `GET /live` → **HTTP 200** (measured). `/health` → 404; the product has no such route, so that 404 says nothing |
| Serves | the acceptance window **`ACC-R5`**, which is `handed` (open) |
| **May I touch it?** | **No.** Do not stop, restart, reconfigure, or change its data root. Its live state is the user's evidence. |

### S-2 — the QA line's trial instance (WSL side)

| | |
| --- | --- |
| Listener | `127.0.0.1:18810`, pid **302** |
| Command | same `trial-serve-linux.py`, `--data-root /home/maoqh/.agentbox-qa-2nd --port 18810 --deployment /tmp/qa-line/qa-2nd-deployment.json --plugin-root <agent-box-runtime-round1>/plugins/agent-box-harnesses` |
| Code in use | `PYTHONPATH` = `agent-box-runtime-round1/{src,plugins/…}` |
| Health now | `GET /live` → **HTTP 200** (measured) |
| **May I touch it?** | **No** unless `I` says the QA line is being rebuilt. It belongs to a stopped session but it is a running service with its own evidence. |

### S-3 — the Windows-side leg

| | |
| --- | --- |
| Listener | `127.0.0.1:18830` on the Windows side, pid **25484** (measured via `Get-NetTCPConnection`) |
| Command | `powershell … serve.ps1`, a QA-rewritten script at `C:\Users\maoqh\AppData\Local\AgentBox\89-r2-qa\serve.ps1` |
| Source root | `/home/maoqh/projects/agent-box-env-provider` (written into the script) |
| Worker bundle in use | `agent-box-env-provider/workers/agent-box-worker/.acceptance-bundle-c11` — **a git-ignored directory that a running service depends on** |
| Sidecar deployment | `C:\agentbox-uigate46\deployment.json` (Windows path — distinct from the WSL one used by S-1) |
| Sandbox module | `sandbox_bwrap` |
| **May I touch it?** | **No.** |

### S-4 — the user's app (Windows side, not a listener on the WSL side)

| | |
| --- | --- |
| Processes | 5 Electron processes, started 2026-09-20 **11:15–11:16** |
| CDP | port **9222** |
| Frozen copy | `C:\Users\maoqh\agentbox-wsl-round1` |
| Launcher | `C:\agentbox-w48-trial\trial-app.ps1`; logs `app-electron.log` (updated 13:19) and `app-renderer.log` |
| Version | `ordessa@0.17.2`, front end pinned to chat checkpoint `Q2-P58` = `c585e82f` |
| **May I touch it?** | **No.** This is what the user is looking at. |

## 2. Data roots and locators (**all stay in place**)

| Path | What it is | May I touch it? |
| --- | --- | --- |
| `/home/maoqh/.agentbox-trial-chat` | S-1's data root (mode 755). Holds the trial user's session data | **No** — user data |
| `/home/maoqh/.agentbox-qa-2nd` | S-2's data root | **No** |
| `/home/maoqh/.agentbox-all-harnesses/artifacts/{codex,claude-code,pi,hermes,dsh,qwen,kilo}` | the 7 harness runtimes that **both** servers mount read-only | **No** — live mounts, all present |
| `/home/maoqh/.npm-global/lib/node_modules/opencode-ai/.../opencode` | the mounted opencode binary | **No** |
| `/home/maoqh/.agentbox-acceptance-secret.CnsAonj6/deepseek-api-key` | **credential locator** used by S-1 (`--credential-source`, id `credential_7dec0e4b…`, label `deepseek-official`) | **Read-only, never printed.** The cleanup recorded the path and did not open the file |
| `/mnt/c/agentbox-uigate46/deployment.json` | deployment document (`{schemaVersion:1, harnesses:[8]}`) | read-only |
| `/mnt/c/agentbox-w48-trial/` | the trial launcher and logs | read-only |
| `/tmp/qa-line/` (3.3 GB) | the QA line's scratch workspace: git checkouts, unions, snapshots, probe logs, `qa-2nd-deployment.json` | **read-only while S-2 runs.** Its checkouts' HEADs were recorded and every one is present in the repositories |
| `/tmp/audit-fe-2/` | the reviewer's sandbox: 3 worktrees (2 still registered) + `data/` + `user-data/` | **`data/` and `user-data/` stay in place** — `data/secrets/http-token` is mode 600 and was never read |

### Sensitive things the cleanup deliberately did **not** touch

- `/tmp/audit-fe-2/data/secrets/http-token` (mode 600) — a credential file inside a
  reviewer's data root. Location recorded; **contents never read**.
- `/tmp/audit-fe-2/user-data/` — an Electron profile (Cookies, Session Storage, Trust
  Tokens). Left in place, not copied into any archive, not committed anywhere.
- A third-party tool key (`FIRECRAWL_API_KEY`) is present in the client environment
  of both servers, inherited from the desktop client, not from this project. Only the
  variable **name** is recorded here; the value was not read or copied, and it is not
  a product credential. No other credential-shaped variable exists in either process.

## 3. Environment variables that define a running instance

Both servers use the same shape; these are the ones that matter for reproducing an
instance, and all are paths (no secrets):

| Variable / flag | S-1 (18790) | S-2 (18810) |
| --- | --- | --- |
| `--data-root` | `/home/maoqh/.agentbox-trial-chat` | `/home/maoqh/.agentbox-qa-2nd` |
| `--plugin-root` | env-provider tree | runtime-round1 tree |
| `--deployment` | `/mnt/c/agentbox-uigate46/deployment.json` | `/tmp/qa-line/qa-2nd-deployment.json` |
| `PYTHONPATH` | 4 trees under env-provider | 4 trees under runtime-round1 |
| `AGENT_BOX_SANDBOX_MODULE` | `agent_box_sandbox_bwrap` | `agent_box_sandbox_bwrap` |
| `--credential-source` | **set** (see locator table) | **not set** |

## 4. Consequences for "can I change this?"

1. **`worktrees/scheduling-legacy-server-round1` is not dead code.** Both WSL servers
   run `trial-serve-linux.py` **from that tree**. It is the retired *scheduling
   authority*, but it is also live *runtime infrastructure*. Do not remove or move
   that worktree while S-1/S-2 are up.
2. **`worktrees/backend-service-env-provider` and `worktrees/backend-runtime-round1`
   are live** — their `plugins/agent-box-harnesses` are the servers' plugin roots,
   and env-provider's ignored `.acceptance-bundle-c11` is the Windows leg's worker
   bundle. They are preserved twice for this reason.
3. **No process had a working directory or open file descriptor under any other
   worktree** (measured). The cleanup does **not** treat that as proof that nothing
   uses them — the Windows-side frozen copies are outside this filesystem's view, and
   one of them does reference env-provider. That is why nothing else was retired on
   the strength of "no cwd".

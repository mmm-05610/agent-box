# P19 G2 + G4 — seeded sidebar density screenshots & access chip honesty deep tests

Date: 2026-09-18 · Tree: Windows build tree `C:\Users\maoqh\agentbox-wsl-round1`
(dist rebuilt from the P19/P20 source this same day) · Backend: Pacthold
`/home/maoqh/projects/agent-box-server-round1`, read-only, data root in the run's
own sandbox.

## G2 — seeded populated sidebar

Driver: `apps/desktop/e2e/p19-sidebar-seed-driver.mjs` (new, this delivery). It
starts the real AgentBox Server (release Worker bundle c8, no-model ACP fixture),
registers **three WSL workspaces**, seeds **three completed turns in each**
(nine `sessions.createAndSend` round trips through the production transport),
renames every session to its service title, pins the first of each workspace,
saves the host's `wsl-workspaces.json` rows, reloads the renderer so the boot
catalog picks everything up, expands each workspace row through its own
disclosure control, and captures screenshots.

Result: **executed 13 → allOk=true; PASS 13 / FAIL 0 / SKIP 0 / PENDING 0**
(`seed-results.json` in this directory).

Evidence: `01-sidebar-populated.png` — the sidebar lists Alpha Web / Beta API /
Gamma Docs, each expanded with its three sessions (pinned first, pin glyph
visible), titles are the service records ("Fix login redirect loop", …), every
row carries the service's relative time. Row rhythm is the tightened geometry
(min-h 1.5rem, text-xs labels): no blank band anywhere in the workspace section.
`02-session-open.png` — one seeded session open behind the composer: transcript
(user message + fixture reply), "Send follow-up" enabled, profile chip "Seed
role HERMES", context usage honestly "Unknown".

Honest notes:

- Long titles truncate with an ellipsis at this sidebar width (single-line rows
  are the geometry contract; full text is the row's tooltip/menu).
- Gamma Docs shows the WSL validation spinner on its row — validation was still
  running at capture time; the row is functional.
- Main area shows the empty state (no session opened yet) — G2 is a sidebar gate.
- While staging this run, the composer's disabled placeholder still read
  "see the note above the input" although the P19 close note claimed the copy
  was self-contained. Corrected this delivery in all six locales
  (`composer.disabledPlaceholder` → "choose a project (and a role) to start");
  the screenshot above is the corrected build.

Run environment (single Windows build slot; nothing else was running):

```
AGENTBOX_SERVER_SOURCE_ROOT=\\wsl.localhost\Ubuntu\home\maoqh\projects\agent-box-server-round1
AGENTBOX_SERVER_LINUX_ROOT=/home/maoqh/projects/agent-box-server-round1
AGENTBOX_WIRE_SCHEMA=<tree>\docs\desktop-product-delivery\contracts\wire-v1\generated\wire-v1.schema.json
node e2e\p19-sidebar-seed-driver.mjs <sandbox> <out> --shots <dir>
```

## G4 — access chip honesty, deep positive + negative

`access-chip.test.tsx` rewritten as nine cases over the REAL radix Select
(pointer-capture shims, no component mocks):

| Case | Expectation |
| --- | --- |
| editable enum permission control declared | chip renders |
| nothing declared | hidden |
| declared but `editable: false` | hidden |
| declared but in `securityLockedIds` | hidden (core v1 §5: security limits cannot be overridden) |
| declared but non-enum (boolean) kind | hidden (no value set to present) |
| opened | options are EXACTLY the declared values — none invented |
| value chosen | `onOverrideChange` receives that value for the declared control |
| an override for another control exists | it is preserved; the same control's override is replaced, not duplicated |
| no override set | the trigger shows the placeholder, not an invented value |

Two real defects found and fixed in `access-chip.tsx`:

1. The chip ignored `securityLockedIds` and `editable` and accepted any control
   kind — a security-locked permission control would have rendered an override
   dropdown the service must refuse. Now only an editable, non-locked ENUM
   permission control shows the chip (type predicate keeps TS narrowing).
2. The trigger passed a `'__none__'` sentinel as its value, so Radix rendered
   an empty trigger instead of the placeholder while no override was set. The
   sentinel and its dead clear-branch are gone; `value` is simply undefined
   until the user overrides.

Gates: this file's suite 9/9 on the Windows tree; `tsc -p .` exit 0 after the
fix; dist rebuilt before the screenshot run.

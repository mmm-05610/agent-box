# Naming — Ordessa, powered by Pacthold

Two names, two things, never swapped:

| Name | What it is | Where it appears |
| --- | --- | --- |
| **Ordessa** | This desktop application. The window, the tray, the About page, the installers, the application bundle. | Every user-visible surface of this repository. |
| **Pacthold** | The service Ordessa connects to — the thing that owns Workspaces, Profiles and Sessions and runs the harnesses. | Whenever the copy means the *service*: connection state, service errors, "not reachable", capability declarations, accounts, archives. |
| **hermes** | A HARNESS FAMILY (and, historically, the name this shell was forked from). Not a product name here. | Harness values, family badges, native directories, upstream licence and attribution. Unchanged. |

## The sentence that fixes the relationship

> **Ordessa, powered by Pacthold.**

Use it in the About page, the README banner and any first-run welcome. Nowhere else needs the full sentence.

## Rules of thumb for copy

1. If the sentence is about **the thing you are looking at** (window, menus, About, empty state, updates) → **Ordessa**.
2. If the sentence is about **what it talks to** (connection, service unavailable, capabilities, accounts, records) → **Pacthold**.
3. If the sentence names a **harness family** → keep the family's own name (`hermes`, `codex`, `opencode`, …).

## Compatibility identifiers (NEVER renamed by branding)

`AGENTBOX_SERVER_ROOT`, `AGENTBOX_SERVER_PORT`, `secrets/http-token`, the default port `8732`, every
`hermes:*` IPC channel, and every existing storage key. `ORDESSA_SERVER_ROOT` / `ORDESSA_SERVER_PORT`
exist as **aliases that win when both are set**, with the old names still honoured — verified in
`electron/workcore/agentbox-server-connection.test.ts`.

## Identity change (stated plainly)

Changing `appId` and the URL scheme means **a new application identity**: this Desktop's own userData
(localStorage, window preferences) starts empty. **Profiles, Sessions and credentials live in the
service's data root and are untouched.** No migration is performed and no old data is deleted.

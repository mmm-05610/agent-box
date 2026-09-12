# App product semantics

**Status:** product decisions accepted on 2026-09-13. This document defines what the
Desktop presents to a user. It does not define AgentBox wire payloads or authorize a
code migration by itself.

## Product model

The Desktop has three first-class user concepts:

```text
App
├── Workspace                       where work happens
│   ├── Local Workspace
│   └── Remote Workspace
│       └── private Connection      one Workspace, one logical Connection
│
├── Session                         continuous work/conversation identity
│   ├── grouped under its current Workspace in the UI
│   ├── current Workspace may change between activities
│   ├── selects a Profile
│   └── shows activity without exposing Execution
│
└── Profile                         reusable user-facing role
    ├── Main / Reviewer / Researcher / other role
    ├── powered by one Harness toolbench
    └── persistent configuration is not mutated by Session-local changes
```

Connection, Harness and Execution are not peer navigation objects:

- A Connection is private infrastructure inside a Remote Workspace. It is created,
  edited, verified, diagnosed and removed from that Workspace's UI. There is no shared
  Connection library and no Settings > Connections product surface. Multiple
  Workspaces aimed at the same host still own distinct logical Connections; a backend
  may pool physical channels without exposing sharing to the product.
- A Harness is the toolbench used to perform work for a Profile. The Profile picker may
  group roles under labels such as Codex or Hermes for recognition, but there is no
  first-class Harness navigation or management surface.
- An Execution is a silent Work Core fact. The UI says a Session is ready, working,
  waiting for input, failed or stopped; it does not ask a user to understand an
  Execution, Ref, cursor, runtime provider, Gateway, RPC or ACP.

## Workspace and Session

A Session is displayed under its current Workspace but is not permanently owned by
that Workspace. Changing Workspace is a generic Session intent, of which a native
command such as Codex `/cd` is only one possible adapter implementation.

The change applies to subsequent work. A currently running backend activity keeps the
Workspace snapshot with which it began; it is never moved midway. Whether a Harness can
continue natively, derive another Session or reject a requested transition is backend
policy. The UI submits the intent and consumes the resulting Session projection or
typed error.

## Profile

To the user, a Profile is an independent role, not a Harness configuration snapshot:

```text
Profiles
├── Main                  powered by Codex
├── Reviewer              powered by Codex
└── Researcher            powered by Hermes
```

To the backend, the same Profile is a persistent, complete Harness-home blueprint such
as a `.codex/`, `.claude/` or `.hermes/` baseline. Anything not promoted to an
independently managed AgentBox resource remains part of that Profile. Credentials,
Skills, Memory, Tools or other resources that are independently managed are assembled
into an isolated runtime view by Work Core.

Selecting a Profile for a Session may create Session-local overrides such as model or
effort. Those overrides may persist with the Session but never mutate the stored
Profile implicitly. Explicit Profile editing is the only path that changes the reusable
role. The Renderer does not know home layouts, snapshots, overlays, materialization or
backend Refs.

Profile switching is one stable UI intent. The backend owns same-/cross-Harness
compatibility, native continuation, in-place change, derivation, deferral and typed
failure. Future backend support for richer switching must not require product-component
logic changes.

## Fixed and contextual surfaces

The fixed primary navigation is deliberately small:

```text
Primary navigation
├── Workspaces
│   └── Sessions grouped under their current Workspace
└── Profiles
    ├── role library
    └── role editor
```

Profile selection is also embedded in Session creation. Profiles are not Settings.
Settings contains application-wide preferences such as appearance, language,
notifications, updates, shortcuts, privacy and diagnostics.

Other capabilities appear where their meaning exists:

```text
Workspace context
├── Files
├── Git / Worktree
├── Terminal
└── Browser / Preview

Session context
├── Transcript / Composer
├── Artifacts
└── current activity

Profile context
├── instructions and model behavior
├── Skills / Memory
├── Tools / MCP
└── permissions and Harness-provided advanced configuration
```

Features and plugins contribute contextual panes, Profile sections, overlays, commands
or, only when genuinely necessary, a navigation page. Kanban/Goals and other optional
products are contributions rather than hardcoded core navigation. HUD, Pet and Quick
Entry are auxiliary projections of the same product state; their ownership is defined
in [`session-multi-surface-ownership.md`](session-multi-surface-ownership.md).

## Content-audit rule

The next audit classifies every existing route, sidebar item, command, context-menu
entry, Settings section and independent window against this map. Each item must be one
of: fixed core, Workspace-contextual, Session-contextual, Profile-contextual, dynamic
feature/plugin, utility, or remove. Directory location alone is not evidence of product
ownership.

This classification precedes the final compatibility-aware vocabulary batch. It is not
permission for blind replacement of Hermes/Gateway/RPC names, preload globals, IPC
channels, storage keys or persisted fields.

## Accepted disposition of legacy core surfaces

The first content audit settled the current core surfaces before implementation begins:

- the current cross-Session **Agents** page is a Hermes subagent aggregate. Remove its
  route and UI; a future AgentBox delegation product is deliberately a separate design.
- remove the current global **Artifacts** library and its entries. Session output,
  attachments and generated files remain generic Session content.
- retain scheduling only as a neutral, non-fixed **Automation** contribution. It may
  not retain Hermes profile-on-disk, Gateway restart or runtime-specific wording.
- Skills/Toolsets/MCP are Profile-contextual configuration; Starmap is at most an
  optional Profile Memory contribution; Webhooks/messaging delivery leaves the core
  Desktop surface; Command Center is dissolved rather than renamed.

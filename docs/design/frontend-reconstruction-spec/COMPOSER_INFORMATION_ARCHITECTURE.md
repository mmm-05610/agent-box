# Composer information architecture

Composer is the only default prominent container and the only default primary action surface.

| Capability | Default | One-line summary | Popover/menu | Conditional |
|---|---|---|---|---|
| Send | always | primary neutral send button | no | disabled when empty/unavailable |
| Stop | replace Send while running | “Stop response” | no | only active execution |
| Queued input | no | count + first-line summary above composer | queue list on click | only when queue nonempty |
| Steer/fork | no | existing split action semantics | menu if secondary | only when runtime exposes capability; never two primary buttons |
| Attachments | no | thumbnails/filenames in composer | add menu | only when attached |
| Slash command | no | editor `/` trigger | command palette | while `/` typed |
| File mention | no | inline reference token | search menu | while `@`/mention typed |
| Harness/Profile | Harness name + neutral mono identity | Profile/model summary | Binding popover | selector data available |
| Model/mode | selected mode if meaningful | one compact selected label | existing picker | when options exist |
| Context usage | percentage only when useful | `context 42%` | details in popover | when runtime reports usage |
| Permission mode | no | current mode if non-default | Binding popover | when mode affects execution |
| Continuation source | no user control | read-only “native resume/materialized…” | Binding popover + preflight line | only after parent selection/preflight |
| Binding | one entry, not five pills | “Harness · Profile” | native selects and facts | when Agent-Box binding exists |
| Mobile controls | send/stop and add | overflow summary | bottom sheet/popover | width ≤390 or zoom pressure |
| Loading/failure | muted status line | actionable connection/error text | details if needed | only while loading/failing |

## Ordering and action rule

Top editor area: draft and attachments. Bottom row: add/reference on the left; profile/context summary in the middle/right; one primary send/stop on the far edge. A selected historical parent adds a plain information line above the composer: “Next message will create a branch from E…; original branch remains unchanged.” It adds no “start” button.

## Accessibility and resilience

Use a labelled form, contenteditable keyboard contract already covered by `MessageInput` tests, visible focus, `aria-busy` during submit where appropriate, and polite queue/status announcements. Popovers close with Escape and restore focus. Selectors use native select unless a custom listbox implements full keyboard semantics. Preserve offline compose, queue reorder/edit/delete, attachments, slash commands, file mentions, steer, fork, and selector readiness.

## Anti-dashboard constraints

At rest, no more than one summary line of execution metadata and one context percentage are visible. Full Binding, Loss Report, sandbox, runtime host, terminal driver, permission mode and checkpoint details are behind one popover. Do not expose credential values or native paths.

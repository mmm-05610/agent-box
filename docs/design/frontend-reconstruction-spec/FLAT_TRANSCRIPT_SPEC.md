# Flat Work Transcript specification

## Contract

The adapter emits a flat ordered list for rendering only. It may retain source turn/part ids and virtualization keys; it must not mutate the backend fact model. Every entry has finite status `streaming | running | awaiting-decision | completed | recoverable-error | fatal-error | queued` (where applicable), `interactive`, `accessibleName`, `copyText`, and `sourceRef`.

## Entry matrix

| Entry | Collapsed/default | Expanded/details | Interactive and action | Running/completed/error policy |
|---|---|---|---|---|
| Assistant prose | plain markdown in canvas | markdown blocks, code/source affordances | copy/action buttons on focus/hover; keyboard tab | streaming placeholder while empty; completed remains plain; error adjacent, not embedded |
| User message | lightly raised surface, no bubble tail | attachments/resources and full text | copy, create-task, attachment open | always completed history; mobile full width |
| Thinking/reasoning | brain icon + “Thinking” row | bounded markdown reasoning | disclosure button; Enter/Space; focus trigger | open while streaming unless user closed; auto-collapse after completion; no color fill |
| Search | search icon + query/result count | result list, source links | disclosure, link navigation, copy | running spinner; completed muted row; failure recoverable unless session fatal |
| File read | file icon + path | bounded text with line/path metadata | disclosure, copy, open file | path mono; long output scrolls internally; errors use icon+text |
| File edit | edit icon + path and diff summary | diff viewer and file actions | disclosure, open diff/file, copy | completed row stays muted; conflict elevates to Decision/Failure block |
| Command/terminal | terminal icon + command | stdout/stderr bounded scroll | disclosure, copy, open Terminal | running has text “Running”; completion check; nonzero result is recoverable/fatal based on supplied fact |
| Generic tool call | wrench icon + tool name | input/output JSON/text | disclosure; copy; retry only if authority supplies recovery | no vendor skin; unknown tool still renders generic |
| Delegated task event | task icon + task summary + current status | task facts, child link, latest result | open child session if supplied; cancel only supplied action | belongs to current Execution; completed degrades; not an Execution node |
| Permission request | decision icon + human-readable request | scope, command/path, expires-at, consequences | inline approve/deny; one decision action group | awaiting decision is the only normal highlighted container; resolved becomes history row |
| User question | question icon + prompt | options/free text context | labelled controls; submit/cancel | awaiting question is interactive; answered becomes transcript history |
| Warning | warning icon + text | diagnostic details | optional action from authority | muted inline row; never color-only |
| Recoverable failure | neutral/error icon + actionable text | diagnostic, retry/reconnect details | retry/dismiss/open details | temporary top notice and/or row; disappears after recovery, history may retain muted record |
| Fatal failure | error icon + explicit consequence | cause, recovery path, export/copy | recovery/close only if supplied | temporary prominent left guide; after user action degrades to error history |
| Continuation/fork info | plain status line above composer | read-only mode and Loss Report summary | no start button; cancel selection only | system preflight result; send is sole start action |
| System diagnostic | info icon + concise text | structured diagnostic | copy/details | low-contrast history unless actionable |
| Streaming placeholder | neutral spinner/text, never empty card | none or live metadata | non-interactive | replaced by first real content; reduced motion keeps text |
| Queued input | one text line above Composer with count | queue list, reorder/edit/delete | keyboard reorder/edit/delete | queue exists only while pending; sent item disappears |

## Visual and behavior invariants

- Default entries have no card background, shadow, colored edge or large radius. Only Composer is a persistent raised container. Expanded content may use one neutral bounded surface when it contains a real content boundary (code, diff, terminal output, form).
- Status uses icon + localized text + structure. Harness identity is a neutral mono square abbreviation plus text and is separate from status.
- Event header is one row: icon, summary, optional mono id/path, right metadata, disclosure affordance. Header remains usable at 390px and 150% through truncation and wrapping of metadata.
- Disclosure uses native button with `aria-expanded` and `aria-controls`; no nested interactive descendants. Details are mounted only as needed where virtualization allows, otherwise `hidden`/inert semantics preserve measurement contracts.
- Copy operates on human-readable content, not hidden JSON unless the user chooses “copy raw”. Retry/recovery is placed next to the error or in its transient notice, never as a competing persistent primary action.
- Long content uses max-height + internal scroll, preserves horizontal code scroll, has a visible “show more/open in workspace” route, and does not expand the transcript row unboundedly.
- Mobile: details become full-width beneath the row; secondary actions move into a menu; interactive decisions remain inline and reachable. Desktop wide view uses the same 46rem-equivalent content column but exact sizes remain provisional.
- Theme: use semantic tokens; no raw Tailwind status colors. Light/dark/high contrast retain icon/text contrast. Focus ring is neutral and visible on all surfaces.
- Motion: 120/180/240ms only for disclosure/opacity/transform; running spinner/shimmer may remain. `prefers-reduced-motion` disables transitions and adds explicit running text.

## State transition model

```text
streaming/input → running → completed
                         └→ recoverable-error
                         └→ fatal-error
running → awaiting-decision → completed | recoverable-error | fatal-error
queued → running | cancelled
```

The adapter maps source states once. Visual components do not inspect vendor strings, timers, tool names or continuation fields to invent transitions. Completed events auto-degrade; errors auto-open only when their supplied policy says the user must see them.

## Test examples

Assert `data-state`, accessible name, `aria-expanded/controls`, copy payload, no trigger for bodyless events, auto-collapse on completion, auto-open on error, bounded long output, and no horizontal overflow at 390/150%. Assert flat rows do not contain `shadow`, status background, colored left border or pill class except explicitly approved decision/Composer surfaces.

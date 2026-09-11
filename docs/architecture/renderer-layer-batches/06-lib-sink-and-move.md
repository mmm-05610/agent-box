# Batch 06 — `lib/` leftovers: two splits, one injection, two moves

**Edges paid off: 7.** Shared rules and the verification recipe:
[README](README.md) — read it first; the rules there (never widen the ledger,
regenerate don't hand-edit, no behaviour change, stay off the in-flight paths,
explicit pathspecs) all apply here.

This is the last of station 1 (`lib/`, rank 0 = the leaf layer). Everything below
was checked for the trap that kills a naive move — **does anything in a lower
layer import it?** — with
`npm run arch:tree -- --move <path> --to <layer>/`. Two of the destinations this
batch originally assumed came back **unsafe** and were changed; the working ones
are recorded per item so they are not re-litigated.

Run the five items **in order, one at a time**: every one of them regenerates the
same ledger, and `乙` and `丙-1` both touch
`app/session/hooks/use-message-stream/gateway-event/message-stream.ts`.

| | what | edges |
| --- | --- | --- |
| 甲-1 | `lib/statusbar.tsx` split — the React component leaves | 1 |
| 甲-2 | `lib/session-link-title.ts` moves to its only consumer | 1 |
| 乙-1 | `lib/haptics.ts` stops reading the mute preference | 1 |
| 丙-1 | `lib/sound/completion-sound.ts` → `store/sound/` | 3 |
| 丙-2 | `lib/hooks/use-image-download.ts` → `components/hooks/` | 1 |

---

## 甲-1 · `lib/statusbar.tsx` is a React component in a leaf

88 lines, 8 exports: **seven pure formatters** (`formatDuration`, `compactPath`,
`contextBar`, `usageContextLabel`, `contextBarLabel`, `cacheHitLabel`,
`tokensPerSecondLabel`) and **one React component**, `LiveDuration`. The
component imports `@/components/chat/stable-text`, and that is the whole edge —
the seven pure functions need nothing.

Exports `formatDuration`? No — `LiveDuration` calls it locally, so it travels.

```
LiveDuration              -> app/shell/live-duration.tsx     (new file)
lib/statusbar.tsx         -> lib/statusbar.ts                (rename; pure half only)
```

- **Destination evidence**: `--move lib/statusbar.tsx --to app/` → ✓ safe, 1
  importer, in `app`.
- Its only importer is `app/shell/hooks/use-statusbar-items.tsx`, which imports
  `cacheHitLabel, contextBarLabel, LiveDuration, tokensPerSecondLabel,
  usageContextLabel` — **one import becomes two** (five names, two modules).
- `LiveDuration` needs `useViewedInterval` (`@/lib/hooks`) and `StableText`
  (`@/components/chat`) — both downward from `app/`. Move its body verbatim.
- The rename `.tsx` → `.ts` does **not** change the specifier `@/lib/statusbar`,
  so `lib/statusbar.test.ts` and the seven-formatter import need no edit. If a
  formatter turns out to be used by `LiveDuration` through a *shared* helper,
  keep that helper in the pure file and import it back — do not duplicate it.

## 甲-2 · `lib/session-link-title.ts` has exactly one consumer

143 lines: `lookupLocalSessionTitle`, `fetchSessionLinkTitle`,
`useSessionLinkTitle`, `__resetSessionLinkTitleCache`. It reads `$sessions` and
`sessionMatchesStoredId` from `@/store/session` to resolve a link's title. Its
only production consumer is `components/assistant-ui/directive-text.tsx`, and it
uses only `useSessionLinkTitle`.

```
lib/session-link-title.ts -> components/assistant-ui/session-link-title.ts
```

- **Destination evidence**: `--to app/` came back **✗ unsafe** — the consumer is
  in `components/` (rank 4), so moving to `app/` (rank 5) would turn one `lib →
  store` edge into one `components → app` edge. `--to components/` → ✓ safe.
- Land it beside its consumer. Moving the whole file is correct: the three
  non-hook exports have no external consumer.
- After the move the import is `components → store`, which is downward — the edge
  is gone by direction, not by deletion. Do not change the store reads.

## 乙-1 · `lib/haptics.ts` — inject the mute preference

129 lines: the haptic dispatch mechanism (`registerHapticTrigger`,
`triggerHaptic`, `HapticIntent`, `HapticTrigger`). Line 104 reads the mute
preference:

```ts
if ($hapticsMuted.get() || !registeredTrigger) {
```

That is its only store dependency, and it is worth **1 edge against 55 production
importers** — so moving it is not an option (`--move lib/haptics.ts --to store/`
comes back ✗ unsafe: `lib/reorder.ts` imports it). Inject instead.

**Follow the pattern already in the tree**: `lib/desktop-fs.ts` +
`app/contrib/hooks/use-desktop-fs-connection.ts` (commit `7baf317`). Same shape:

1. In `lib/haptics.ts`, replace the `@/store/haptics` import with a module-local
   getter and a setter:

   ```ts
   let readMuted: () => boolean = () => false
   export function setHapticsMutedSource(source: () => boolean): void {
     readMuted = source
   }
   ```

   and use `readMuted()` where `$hapticsMuted.get()` was.
2. Supply it from `components/haptics-provider.tsx` — it already imports **both**
   `$hapticsMuted` and `registerHapticTrigger`, and already gates the trigger on
   mute:

   ```ts
   registerHapticTrigger(muted ? null : trigger)
   ```

   Add `setHapticsMutedSource(() => $hapticsMuted.get())` in that same effect.
   **No teardown** — the getter is stateless and reading an atom is always safe.
   (Resetting it on unmount would be wrong: the component that owns the platform
   trigger is also the one that owns the preference.)
3. `vitest.setup.ts` needs **no** change here, unlike the `desktop-fs` case: no
   test in the suite sets `$hapticsMuted`, so the unwired default (`false`) is
   what every test already sees. If you find such a test, stop and report rather
   than wiring it silently.

**Do not delete the check instead of injecting it.** The provider's `muted ? null
: trigger` makes `!registeredTrigger` cover the same condition one React commit
later, so deleting looks equivalent — but it is not: it moves the gate from
trigger time to registration time and opens a window where a haptic fires after
the user muted. That is a behaviour change, and this batch has none.

## 丙-1 · `lib/sound/completion-sound.ts` → `store/sound/`

The variant table plus the player: `CompletionSoundVariant`,
`COMPLETION_SOUND_VARIANTS`, `previewCompletionSound`, `playCompletionSound`.
500 lines, and it reads three store things (`ownsAmbientCue`, `$hapticsMuted`,
`$completionSoundVariantId` + `resolveCompletionSoundVariantId`). Two production
importers, both in `app/`.

```
lib/sound/completion-sound.ts -> store/sound/player.ts
```

- **Destination evidence**: `--to store/` → ✓ safe, 2 importers, both `app/`.
- **`store/sound/completion-sound.ts` already exists** and is something else — the
  selected-variant preference (32 lines). Do **not** merge the 500-line player
  into it; that is a shape change, not a move. Different name: `player.ts`.
- `lib/sound/audio-context.ts` (37 lines) has no debt. **Leave it in `lib/`**;
  `store/sound/player.ts` importing `@/lib/sound/audio-context` is downward.
- The two importers are
  `app/session/hooks/use-message-stream/gateway-event/message-stream.ts` and
  `app/settings/notifications-settings.tsx`.

## 丙-2 · `lib/hooks/use-image-download.ts` → `components/hooks/`

116 lines: `imageFilename` and `downloadFilename` (pure, **and used only inside
this file** — verified), plus `useImageDownload`, which calls `notify` /
`notifyError` from `@/store/notifications`. That one notification is the edge.

`lib/hooks/` is not wrong to exist — its other seven modules
(`use-media-query`, `use-delayed-true`, `use-resize-observer`, …) read no store
at all and are legitimately generic. **This** hook is not generic, so it is the
one that moves.

```
lib/hooks/use-image-download.ts -> components/hooks/use-image-download.ts
```

- **Destination evidence**: `--to app/` came back **✗ unsafe** — three
  `components/` files import it, so `app/` would add three `components → app`
  edges. `components/` is the correct layer, and `components/hooks/` is a new
  directory (create it).
- Five importers: `components/chat/generated-image-result.tsx`,
  `components/chat/zoomable-image.tsx`,
  `components/assistant-ui/embeds/listing-embed.tsx`,
  `app/pet-generate/components/reference-chip.tsx`,
  `app/chat/composer/attachments.tsx`.
- Move the file whole. `imageFilename` / `downloadFilename` are internals, so
  there is nothing to split.

---

## Verification

Per item, then once at the end:

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run test:ui                                     # again: the ledger must not move
```

Baseline: **775 files / 7466 tests**. **Take the ledger's number when you start
and subtract 7** — this batch can run beside 09, so where it begins depends on
what has already merged, and an absolute number written here would be wrong for
someone. `apps/desktop/vitest.setup.ts`, `store/*-purity.test.ts` and
`dev/contracts/*` all hard-code paths and layer expectations in places — when one
of them fails after a move, it is telling you a modelled path changed, which is
information, not noise. Update the model, never the assertion.

`lib/` reaching 14 edges at the end is expected: **9 of those are already written
up for another batch** (`oneshot`, `yolo-session`, `guarded-model-switch`,
`session-export`, `tour/`, `session-project-label`), and the remaining 5 belong to
`lib/keybinds/` and `lib/external-link.tsx`, which need a design decision and are
**not** in this batch. Do not touch them.

## Stop conditions

- A move needs a signature change, a merge into an existing module, or a file
  split that is not described above — stop and report.
- `lib/haptics.ts`'s injection turns out to need a test-side wiring — stop and
  report (the note in 乙-1 explains why it should not).
- `--move` output contradicts a destination recorded here — stop; the tree has
  moved under you.

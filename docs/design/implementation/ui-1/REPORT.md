# UI-1 · Default Session Visual Closure

## 1. Verdict

**UI-1 VISUAL CHECKPOINT COMPLETE**

This closure is limited to the default-session vertical slice. The real
\`/workspace\` React route has deterministic visual evidence for empty, message,
completed/running/error AgentCapsule states, responsive layouts, themes, zoom,
focus, and composer affordances. UI-2 was not started.

## 2. Baseline / branch / HEAD

- Route: \`/workspace\`
- Branch: \`studio-shell\`
- HEAD at start: \`ed66f4d7ca4d7b612767b3b7307d7539249039ba\`
- \`git diff --check\`: clean at start and after implementation
- Existing modified files and untracked \`docs/design/\` were preserved.

The before evidence was produced from \`git archive HEAD\` in
\`/tmp/codeg-ui1-head-8qSXgu\`, using the same synthetic transport fixture.
The archive's \`pnpm build\` attempted an install and hit pnpm's isolated-store
SQLite error. The already-installed Next binary was then invoked directly with
\`node .../next build --webpack\`, and the clean-HEAD production build passed.
This produced genuine clean-HEAD \`before-1440-dark.png\` and
\`before-tool-completed.png\`; neither was copied from an after capture.

## 3. Preserved dirty worktree evidence

At start, \`git status --short\` showed existing changes in \`.editorconfig\`,
\`docs/architecture/*\`, prior UI-1 shell/message files, and untracked
\`docs/design/\`. Those changes remain present. No unrelated file was reset,
overwritten, reformatted, or removed.

## 4. Exact root cause of the previous screenshot failure

The earlier conclusion that \`pnpm dev\` could not listen within 180 seconds was
incorrect. A stale \`.next/dev/lock\` made Next exit before listening. After
removing that stale lock, Turbopack can listen in about one second, but first
\`/workspace\` compilation can panic while creating a new process in the
constrained environment. The usable paths are:

~~~text
pnpm exec next dev --webpack -H 127.0.0.1 -p <port>
production build + temporary static server
~~~

This closure used the second path. No \`package.json\`, \`next.config.ts\`, or
lockfile change was needed.

## 5. Fixture architecture and production boundary

\`ui1_visual_fixture.py\` serves the production-built
\`out/workspace.html\` at the actual \`/workspace\` URL. Playwright intercepts
the existing frontend API transport with in-memory synthetic responses and
supplies an inert WebSocket for connection readiness. The page renders the
actual providers, shell, messages, composer, content dispatch, and
\`AgentCapsule\`; there is no parallel HTML/CSS implementation.

Both scripts use the shared \`launch_browser()\` helper. It calls
\`playwright.chromium.launch(headless=True)\` by default. An optional
\`PLAYWRIGHT_CHROMIUM_EXECUTABLE\` override is validated as an existing file
before use; no machine-specific browser path is embedded in the fixture.
Temporary environment, static server, browser context, and browser are all
cleaned in \`finally\` blocks.

\`ui1_empty_visual_fixture.py\` uses the same route and harness with an empty
conversation response for the empty-session capture. Both are documentation/
test-only scripts, are not imported by production, do not add a production
route or flag, and do not change normal user behavior.

## 6. Credential / model isolation

- Application HOME, XDG data/cache/config, and \`CODEG_DATA_DIR\`: isolated
  temporary \`/tmp\` directories.
- PATH: restricted to \`/usr/bin:/bin\`.
- Credential reads: 0.
- Model requests: 0.
- Real session data: not read.
- Agent CLI/Harness launch: not possible through the fixture.
- Browser token: fixed synthetic \`ui1-fixture-token\`.

## 7. Final semantic token decision

- \`--status-success: var(--foreground)\`: completed Check and label carry the
  meaning; completion is not forced green or branded.
- \`--status-danger: var(--destructive)\`: existing destructive authority is
  used for errors.
- Running uses \`--text-faint\` plus existing shimmer/spinner behavior.
- \`--focus-ring-workbench\` falls back to \`var(--foreground)\`; modern browsers
  use \`color-mix(in oklab, var(--foreground) 82%, var(--background) 18%)\`.
  It no longer aliases the potentially branded \`--ring\`.
- Workspace-background interaction surface fallbacks remain theme-derived
  \`muted\`/\`accent\`/\`secondary\` for WebViews without \`color-mix\`.

No standalone green status palette or unexplained status hex/oklch was added to
the UI-1 status tokens.

## 8. AgentCapsule state results

- Completed: neutral Check icon, mono event row, collapsed by default.
- Running: neutral faint spinner/shimmer, visible but quiet.
- Error: destructive X icon, error body visible by default.
- Bodyless completed event: non-interactive row with no empty frame.
- Existing open state, error auto-open, running-to-completed auto-collapse,
  ScrollArea, animation, callbacks, and children behavior are preserved.
- Trigger accessible name includes both visible title and state label.

The direct test covers all three semantic identity mappings, error auto-open,
running-to-completed auto-collapse, body collapse, and accessible naming.

## 9. Empty-session screenshot result

\`empty-session-1440-dark.png\` was captured from the real route with an empty
synthetic conversation list. The canvas is quiet, the composer is the stable
main action, and the isolated screenshot had zero console/page errors and no
horizontal overflow.

## 10. Message/tool-event screenshot result

The final fixture renders one real user message, one Agent text answer,
completed/running/error AgentCapsules, and a bodyless completed event through
the normal adapter and product renderer.

All required tool screenshots were manually opened after generation. The
fixture now fails immediately when any required message/event/composer
assertion fails, when bodyless content is interactive, when completed/error
ARIA state is wrong, or when console/page/request/overflow checks are nonempty:
completed collapsed is a light event row; completed expanded shows the body
under a left guide line; running shows neutral dynamic status; error is
expanded with clear destructive copy. The bodyless row has no trigger.

## 11. Responsive / light / dark / 150% result

All after captures were Chromium headless, device scale factor 1:

| File | Viewport | Theme | Zoom | Manual result |
| --- | --- | --- | --- | --- |
| \`after-1440-dark.png\` | 1440×1000 | dark | 100% | Message flow is the visual center |
| \`after-1440-light.png\` | 1440×1000 | light | 100% | Hierarchy and error remain legible |
| \`after-1024-dark.png\` | 1024×900 | dark | 100% | Compact shell remains usable |
| \`after-390-dark.png\` | 390×844 | dark | 100% | Mobile shell, rows, body, composer fit |
| \`after-1440-dark-150.png\` | 1440×1000 | dark | 150% | Text and composer controls remain usable |
| \`after-keyboard-focus.png\` | 1440×1000 | dark | 100% | Neutral composer focus ring is visible |
| \`composer-disabled.png\` | 1440×1000 | dark | 100% | Empty Send is disabled |
| \`composer-enabled.png\` | 1440×1000 | dark | 100% | Typed Send is enabled |

Every after viewport passed the overflow assertion.

## 12. Keyboard / accessibility result

Playwright verified the contenteditable composer, empty/typed Send state,
completed collapsed \`aria-expanded=false\`, completed expanded
\`aria-expanded=true\`, error expanded \`aria-expanded=true\`, and the
bodyless event's lack of an interactive control. The AgentCapsule test verifies
that \`statusLabel\` does not replace the visible title in the accessible name.
No new keyboard interaction was invented.

## 13. Console / page-error result

Final message fixture: 0 console errors, 0 page errors, 0 request failures,
0 overflow failures. Empty fixture: 0 console errors, 0 page errors, and 0
overflow failures. Optional offline snapshot fallbacks were handled by the
fixture responses and produced no unexplained browser errors.

## 14. Before / after comparison

Clean HEAD before evidence shows the prior full rounded capsule treatment in
\`before-tool-completed.png\`. After evidence shows the same product content
as a flat, indented event row with a neutral completion icon, while retaining
the full expandable body. \`before-1440-dark.png\` and
\`after-1440-dark.png\` use the same route, data fixture, viewport, theme, and
zoom.

## 15. Targeted tests

Passed:

~~~text
pnpm exec vitest run src/components/message/agent-capsule.test.tsx
pnpm exec vitest run src/components/message/agent-tool-call.test.tsx
pnpm exec vitest run src/components/chat/message-input.test.tsx
pnpm exec vitest run src/components/layout/sidebar.test.tsx
~~~

The direct suites passed 10, 27, 35, and 23 tests respectively. The repository
script is \`vitest run --\`, so \`pnpm test -- <file>\` expands to a full-suite
run rather than a file-scoped run; the final unscoped \`pnpm test\` passed all
5,070 tests. No assertion was removed, skipped, weakened, or made
behavior-blind.

## 16. Full lint / test / build

Passed:

~~~text
pnpm eslint .
pnpm test
pnpm build
git diff --check
python3 docs/design/implementation/ui-1/ui1_visual_fixture.py --skip-baseline
python3 docs/design/implementation/ui-1/ui1_empty_visual_fixture.py
~~~

The successful local run supplied an environment-discovered executable through
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`; the path is not stored in either fixture.
The default launch path was also exercised and failed explicitly on this host
because isolating `HOME` makes its browser cache unavailable. A missing custom
path fails explicitly as well. The portability contract is therefore: use the
default launch when the Playwright browser is installed in the isolated
environment, or provide an existing executable through the documented
environment variable.

The fixture run recorded exactly 12 screenshots in \`fixture-results.json\`
from its current invocation; it does not scan or count older PNGs. The empty
fixture records its single screenshot separately; the output directory also
contains the three clean HEAD before references. Build used the existing
webpack path; no dependency or lockfile changes were made.

## 17. Exact modified files

Closure product files touched:

- \`src/app/globals.css\`
- \`src/components/message/agent-capsule.tsx\`
- \`src/components/message/agent-capsule.test.tsx\`
- \`src/components/message/agent-tool-call.test.tsx\` (direct consumer test
  queries updated for the preserved visible-title accessible name)

Closure evidence files:

- \`docs/design/implementation/ui-1/ui1_visual_fixture.py\`
- \`docs/design/implementation/ui-1/ui1_empty_visual_fixture.py\`
- \`docs/design/implementation/ui-1/REPORT.md\`
- \`docs/design/implementation/ui-1/fixture-results.json\`
- \`docs/design/implementation/ui-1/empty-fixture-results.json\`
- \`docs/design/implementation/ui-1/shots/*.png\`

## 18. Product / backend files touched

No \`src-tauri/\`, backend, API, transport, core-port, data-model, Zustand or
Context semantic, package, lockfile, theme authority, or architecture file was
touched by this closure. Existing dirty shell/message files from the prior
UI-1 implementation were preserved and not broadened.

## 19. Deferred UI-2 items

Exact micro-spacing and truncation thresholds remain open for human visual
preference. Other legacy Tool components remain unchanged.

Execution Tree, Delegation panel/data wiring, Terminal layout/docking,
BindingBar wiring, and status-bar information-value audit are deferred. UI-2
did not begin.

## 20. Git operations

Read-only status/diff/archive checks and normal test/build commands only. No
reset, checkout, clean, stash, add, commit, push, or merge.

## 21. Final checkpoint

**UI-1 VISUAL CHECKPOINT COMPLETE**

\`UI-1 VISUAL CHECKPOINT COMPLETE\`
\`UI-2 NOT STARTED\`

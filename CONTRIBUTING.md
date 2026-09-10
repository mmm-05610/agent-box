# Contributing to Hermes Desktop

This repository is the **desktop client** for Hermes Agent. Read
[`AGENTS.md`](AGENTS.md) first — it is short, and the invariant it states explains
most of the review decisions here.

## The one rule that matters most

**The app is a client of an external `hermes`. It never launches, bundles, or
imports a runtime from this checkout.**

If you are about to add a Python file, a vendored runtime, or a code path that
spawns Hermes out of the tree the app is running from, stop: that work belongs in
the Hermes runtime project. Everything else in this document is ordinary.

## Setup

```bash
npm install                       # workspace install at the repo root
npm run --workspace apps/desktop dev
```

You need a `hermes` to talk to. Any of these works:

- `hermes` on your `PATH`,
- a Desktop-managed install at `~/.hermes/hermes-agent`,
- nothing at all — the app offers to install one on first launch.

To point the app somewhere specific, use `HERMES_DESKTOP_HERMES` (an executable)
or `HERMES_DESKTOP_HERMES_ROOT` (a checkout). See the README for the full table.

## Run it in a sandbox

Anything that boots the app should go through the sandbox: it gets its own
`HERMES_HOME` and Electron userData, so a broken experiment cannot touch your real
config, sessions or credentials.

```bash
cd apps/desktop
../../scripts/dev-sandbox.sh -- npm run dev
```

## Checks

```bash
npm run --workspace apps/desktop typecheck   # renderer + electron + e2e tsc projects
npm run --workspace apps/desktop test        # vitest (ui + electron projects)
npm run --workspace apps/desktop lint
npm run --workspace apps/shared typecheck
npm test --prefix tests-js
```

Please state in your PR if a check fails for a reason you did not fix and did not
cause — that is more useful than silence.

## Tests we want

Test the behavior that would break a user, not a snapshot of today's data.

- **Invariants over frozen values.** Assert how two pieces of data relate.
- **Never read source code in a test.** Asserting on a `.ts` file's text passes
  when the wiring is subtly wrong and fails on a correct refactor. Extract the
  logic into a pure function and call it.
- **Exercise the real path at a seam** — resolver precedence and its failure
  rungs, readiness against a gated backend, identity and scope boundaries,
  optimistic rollback and stale-response ordering.
- **Don't fake the host OS.** Behavior that differs per host is tested on that
  host; a pure function that takes the platform as data is tested anywhere.

Two focused tests that pin a contract beat a dozen change-detectors.

## Pull requests

- Keep the change traceable to the request; no unrelated commits.
- Conventional Commits (`fix(scope):`, `feat(scope):`).
- Fill in the PR template. The "desktop CLIENT" section is not boilerplate — it
  is the checklist that catches the one rule above.
- If you touch backend resolution or the boot state machine, say which of the
  three invariants in `AGENTS.md` you preserved and how you checked.

## Reporting bugs

Use the issue templates. If the problem is in the Hermes runtime rather than this
app, report it upstream — the templates say how to tell the difference.

## What does this PR do?

<!-- Describe the change clearly. What problem does it solve? Why is this approach the right one? -->



## Related Issue

<!-- Link the issue this PR addresses. If no issue exists, consider creating one first. -->

Fixes #

## Type of Change

<!-- Check the one that applies. -->

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 🔒 Security fix
- [ ] 📝 Documentation update
- [ ] ✅ Tests (adding or improving test coverage)
- [ ] ♻️ Refactor (no behavior change)
- [ ] 🎨 Visual change (screenshots attached below)

## Changes Made

<!-- List the specific changes. Include file paths for code changes. -->

- 

## How to Test

<!-- Steps to verify this change works. For bugs: reproduction steps + proof that the fix works.
     Anything that boots the app should be run through scripts/dev-sandbox.sh, which keeps the
     experiment away from real config, sessions and credentials. -->

1. 
2. 
3. 

## Checklist

<!-- Complete these before requesting review. -->

### Code

- [ ] I've read [`AGENTS.md`](../AGENTS.md)
- [ ] My commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`fix(scope):`, `feat(scope):`, etc.)
- [ ] I searched for [existing PRs](https://github.com/NousResearch/hermes-agent/pulls) to make sure this isn't a duplicate
- [ ] My PR contains **only** changes related to this fix/feature (no unrelated commits)
- [ ] `npm run --workspace apps/desktop typecheck` passes
- [ ] `npm run --workspace apps/desktop test` passes (state any pre-existing failures you did not fix)
- [ ] `npm run --workspace apps/desktop lint` reports no **new** errors
- [ ] I've added tests for my changes (required for bug fixes, strongly encouraged for features)
- [ ] I've tested on my platform: <!-- e.g. Ubuntu 24.04, macOS 15.2, Windows 11 -->

### This repository is a desktop CLIENT

<!-- The app talks to an external `hermes`. Read AGENTS.md before ticking these. -->

- [ ] This change does **not** add, bundle, or launch a Hermes runtime from this checkout — or N/A
- [ ] If it touches backend resolution or the boot state machine, the three invariants in `AGENTS.md`
      still hold: external-only resolution, a typed outcome when nothing resolves, and
      probe-before-trust (including credentials on readiness probes) — or N/A
- [ ] Any test I added asserts behavior, not the text of a source file — or N/A

### Documentation & Housekeeping

<!-- Check all that apply. It's OK to check "N/A" if a category doesn't apply to your change. -->

- [ ] I've updated relevant documentation (README, `docs/`, docstrings) — or N/A
- [ ] I've updated `AGENTS.md` if I changed architecture or workflows — or N/A
- [ ] User-facing copy is localized in `apps/desktop/src/i18n/` (all locales) — or N/A
- [ ] I've considered cross-platform impact (Windows, macOS, Linux) — or N/A

## Screenshots / Logs

<!-- If applicable, add screenshots or log output showing the fix/feature in action. -->

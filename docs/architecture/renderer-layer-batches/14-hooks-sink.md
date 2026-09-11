# Batch 14 — three hooks sink, and the pet stops reaching up

**Edges paid off: 3.** Shared rules and the verification recipe:
[README](README.md). Take the ledger's number when you start and subtract 3.

All three edges come from one file —

```
components/pet/floating-pet.tsx -> @/app/gateway/hooks/use-gateway-request
components/pet/floating-pet.tsx -> @/app/hooks/use-on-profile-switch
components/pet/floating-pet.tsx -> @/app/hooks/use-route-overlay-active
```

— and the fix is the same for all three: **the hooks are not app-bound.** Checked
import by import, none of them reads anything above `store/` (rank 1), so all three
can live at rank 4 and be reached from `components/`:

| hook | lines | what it reads | production importers |
| --- | --- | --- | --- |
| `app/gateway/hooks/use-gateway-request.ts` | 203 | `@/store/gateway`, `@/store/profile`, `@/store/session` | 12 |
| `app/hooks/use-on-profile-switch.ts` | 25 | `@/store/profile` | 8 |
| `app/hooks/use-route-overlay-active.ts` | 19 | `@/app/routes`, `react-router` | 2 |

**Destination: `components/hooks/`** — the directory batch 06c2 creates for
`lib/hooks/use-image-download.ts`, for exactly the same reason (a hook whose only
upward dependency is the store layer). If it does not exist yet, the move creates it.

```
app/gateway/hooks/use-gateway-request.ts → components/hooks/use-gateway-request.ts
app/hooks/use-on-profile-switch.ts       → components/hooks/use-on-profile-switch.ts
app/hooks/use-route-overlay-active.ts    → components/hooks/use-route-overlay-active.ts
```

`use-route-overlay-active.ts` is the one that needs care: it reads two classifiers
from `@/app/routes` today. **Batch 11 must have landed** — the route vocabulary lives
in `lib/routes.ts` after it, so the moved hook imports `@/lib/routes` and the move is
downward. If `lib/routes.ts` does not exist, 11 has not run: stop, do not source the
classifiers from `@/app/routes` in a `components/` file.

## The repoint surface

Twenty-two production files, and the miss this repo has hit five times is in here:
**the two spellings are mixed.**

```
use-gateway-request      11 files from '@/app/gateway/hooks/use-gateway-request'
                          1 file  from '../gateway/hooks/use-gateway-request'   (app/contrib/wiring.tsx:89)
use-on-profile-switch     7 files from '../hooks/use-on-profile-switch'
                          1 file  from '@/app/hooks/use-on-profile-switch'      (the pet)
use-route-overlay-active  2 files from '@/app/hooks/use-route-overlay-active'
```

Enumerate them with the resolver, never with a specifier grep:

```bash
cd apps/desktop
node ../../.agents/skills/architecture-tree-report/scripts/arch-tree.mjs --move app/hooks/use-on-profile-switch.ts --to components/
```

The pet itself goes from an upward import to a sideways one and needs no other
change — it uses these hooks exactly as the app does.

## Verification

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run test:ui                                     # again: the ledger must not move
```

Baseline: tests **775 files / 7466**. The ledger drops by **3**, and
`components → app` drops from 8 to 5.

The behavioural check that matters is the pet's own: `floating-pet` renders and
switches profile. Run its tests plus the settings surfaces that use
`use-on-profile-switch` (they were relying on the hook's identity across a profile
switch — the move must not change when it fires).

## Stop conditions

- **`use-gateway-request.ts` names something above `store/`.** The top of this
  document is then wrong and the destination is wrong with it. Report the import.
- **A consumer imports one of these through a barrel** rather than the file (there is
  no `app/hooks/index.ts` today, but `app/gateway/hooks/` may grow one). A barrel is a
  second spelling; repoint it too, do not leave a re-export behind.
- **`components/hooks/` is not where 06c2 put its hook.** Follow wherever 06c2 landed
  it — two conventions for the same thing is worse than either.
- Do not read, edit or stage `src/agentbox/`, `src/plugins/agentbox-lab/`,
  `docs/architecture/acp-desktop-phase1-design.md` or `docs/desktop-src-tree.md`.

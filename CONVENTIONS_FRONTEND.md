# Agent Box — Frontend Conventions

Principles for all code in `gui-web/src/`. Specific rules are instances
of these principles, not the principles themselves.

---

## 1. Data-driven rendering — no hardcoded branching

UI differences based on a **category** (agent type, resource type, file
format) must be driven by a shared data structure, not by `if/else`
chains or dedicated per-category files.

The difference data lives in one place. Rendering code iterates or
looks up, never branches.

Adding a new category member = adding one entry to the data structure,
not creating a new file or inserting a new `else if`.

```tsx
// ❌ Wrong — dedicated per-agent component files
<ClaudeProviderForm />
<CodexProviderForm />

// ❌ Wrong — if/else chain on agent type
{agentType === 'claude' ? <ClaudeView /> : agentType === 'codex' ? <CodexView /> : ...}

// ✅ Correct — lookup from a shared map
const Form = PROVIDER_FORMS[agentType]
<Form config={providerConfig} />
```

---

## 2. Layered data flow — no skipping layers

```
api/        →  raw bridge calls, no state
lib/        →  typed wrappers around window.api
hooks/      →  state management (caching, refresh, errors)
pages/      →  composition, layout, routing
components/ →  presentational UI
```

Each layer has **one responsibility**. Inner layers must not bypass
outer layers:

- Pages and components must **not** import from `api/` directly — use hooks.
- Hooks and pages must **not** call `window.api.*` directly — use `lib/bridge.ts`.
- Components must not manage their own data fetching — receive data via props.

---

## 3. Single source of truth for shared constants

Any value that appears in more than one file must have exactly one
definition point. The definition carries **semantic intent** (the name
tells you _why_ this value exists), not just the value.

```tsx
// ❌ Wrong — project URL scattered
href: "https://github.com/anthropics/agent-box"; // help.tsx
href: "https://github.com/mmm-05610/agent-box"; // settings.tsx

// ✅ Correct — one definition
// lib/constants.ts
export const REPO_URL = "https://github.com/mmm-05610/agent-box";
```

The test: _if you changed this value, how many files would you edit?_
The answer should be one.

---

## 4. References must be verifiable

Every command name, API endpoint, file path, and external URL in the
frontend must point to something that **currently exists**. If the
target was removed or renamed, the reference must be updated or deleted.

Stale references are bugs in waiting — they compile, they pass review,
they fail at runtime.

---

## 5. Zero dead code

Any of the following must be removed (git history is the safety net):

- Exports that no other file imports
- Commented-out route entries, nav items, or JSX
- Pages unreachable from any active route
- Stub/placeholder components with no active consumers

---

## 6. Use abstractions, not primitives

The project has a UI component library at `@/components/ui`. When a
primitive exists there, use it instead of raw HTML elements.

```tsx
// ❌ Wrong
<button className="..." onClick={...}>Click</button>

// ✅ Correct
<Button onClick={...}>Click</Button>
```

This ensures consistent styling, accessibility, and behaviour across
the application.

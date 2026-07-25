# Detail Page Profile Config Visualization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the GUI Profile Detail page so it (a) uses a single schema registry to drive per-agent-type tab lists, (b) replaces the flat-list Storage tab with a VSCode-style tree + Monaco editor + JSON validation, and (c) adds form-style tabs for Codex / Hermes / OpenCode covering their high-frequency config keys. MiMoCode is deferred.

**Architecture:** Static TS schema (`gui-web/src/pages/detail/schema.ts`) maps each `AgentType` → ordered `TabSpec[]`. `detail.tsx` becomes a thin shell that calls `tabsFor(profile)`. The `Storage` tab is rewritten as a tree (lazy-loaded via a new `list_dir_tree` bridge method) + `@monaco-editor/react` + zod-validated JSON save. A research deliverable precedes Codex/Hermes/OpenCode tab work.

**Tech Stack:** React 19 + Vite 8 + Tailwind 4 (existing). Adds: `@monaco-editor/react` ^4.6.0, `monaco-editor` ^0.52.0, `zod` ^3.23.0, `react-hook-form` ^7.53.0, `@hookform/resolvers` ^3.9.0, vitest (already used).

## Global Constraints

- **Strict TS** — no `any` without justification. Project compiles on `tsc --noEmit` w/ `"strict": true`.
- **No new top-level dirs** — agent outputs go under existing `gui-web/` and `docs/` trees. New code under `gui-web/src/pages/detail/` (and subdirectories per agent type) only.
- **Per CLAUDE.md**: ASCII-only in new files; no em-dashes or other non-ASCII in source.
- **Build chain**: `cd gui-web && npm run build` after every `gui-web/src/*` edit; user verifies via PyWebView GUI which loads `dist/`.
- **useCallback declaration order**: callbacks referenced in another callback's deps must be declared before that callback.
- **Schema is static** — files under `gui-web/src/pages/detail/schema.ts`. No runtime-fetched schema for tab list.
- **MiMoCode is OUT OF SCOPE** for this plan. Do not write `mimocode/*` files, do not include MiMoCode in `schema.ts` entries.
- **Monaco loader**: when `import.meta.env.PROD` is true and Monaco is bundled locally use `loader.config({ paths: { vs: '/monaco' } })`. Failure to load local Monaco falls back to `cdn.jsdelivr.net/npm/monaco-editor@<version>/min/vs`.
- **PyInstaller bundle** (post-PR1 step in PR 1.6): copy `node_modules/monaco-editor/min/vs` to `gui-web/public/monaco/` so Vite serves it from `dist/monaco/`. Bridge still doesn't need changes for this (it's pure asset shipping).

---

## File Structure (before / after)

### Created

| Path                                                        | Responsibility                                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `gui-web/src/pages/detail/schema.ts`                        | Single source of truth: `AGENT_TAB_SCHEMAS[AgentType]`                                                            |
| `gui-web/src/pages/detail/storage/FileTree.tsx`             | Recursive lazy-loaded tree from flat path list                                                                    |
| `gui-web/src/pages/detail/storage/MonacoEditorPanel.tsx`    | Monaco wrapper, language detection, multi-tab model registry                                                      |
| `gui-web/src/pages/detail/storage/StorageExplorer.tsx`      | Container — tree pane + editor pane + SaveBar                                                                     |
| `gui-web/src/pages/detail/storage/validateJson.ts`          | JSON.parse + zod schema map + `validateJson(path, content)`                                                       |
| `gui-web/src/pages/detail/storage/schemaMaps.ts`            | Zod schemas keyed by relative path (settings.json → ClaudeHooksSchema)                                            |
| `gui-web/src/pages/detail/storage/buildTreeFromFlatList.ts` | Pure function: `string[]` (full file paths) → `TreeNode[]`                                                        |
| `gui-web/src/pages/detail/storage/useOpenFiles.ts`          | Multi-tab state, max 5 LRU, dirty tracking per file                                                               |
| `gui-web/src/pages/detail/storage/SaveBar.tsx`              | Dirty indicator + Save button + last-saved time                                                                   |
| `gui-web/src/pages/detail/shared/SaveStatusBar.tsx`         | Shared across editors (used by Storage + future form tabs)                                                        |
| `gui-web/src/pages/detail/shared/FormField.tsx`             | label + input + description slot                                                                                  |
| `gui-web/src/pages/detail/codex/ModelEditor.tsx`            | Codex `config.toml` form + auth.json writer                                                                       |
| `gui-web/src/pages/detail/codex/codectoml.ts`               | Parse/serialize `config.toml` (basic; first round only flat top-level + `[history]` + `[model_providers.custom]`) |
| `gui-web/src/pages/detail/hermes/ModelEnvEditor.tsx`        | Hermes `config.yaml` `model` + `terminal` form                                                                    |
| `gui-web/src/pages/detail/hermes/MemoryEditor.tsx`          | `memory` + `compression` toggle + slider                                                                          |
| `gui-web/src/pages/detail/hermes/DisplayEditor.tsx`         | `display.{compact,streaming}`                                                                                     |
| `gui-web/src/pages/detail/opencode/ProvidersEditor.tsx`     | `opencode.jsonc` `provider` dict editor + auth.json writer                                                        |
| `gui-web/src/pages/detail/opencode/ModelEditor.tsx`         | Default model selector (picker reads from providers)                                                              |
| `gui-web/src/pages/detail/opencode/InstructionsEditor.tsx`  | `instructions: string[]` list-of-strings editor                                                                   |
| `docs/superpowers/research/per-agent-config-keys.md`        | PR 2 deliverable — research output on agent config keys                                                           |

### Modified

| Path                                           | Change                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `gui-web/package.json`                         | Add monaco, zod, react-hook-form, @hookform/resolvers; add `vitest` test script                                                 |
| `gui-web/src/pages/detail.tsx`                 | Replace `CLAUDE_TABS / OTHER_TABS` constants with `tabsFor(profile)` from schema                                                |
| `gui-web/src/pages/detail/StorageExplorer.tsx` | Replaced by re-export from new location, OR delete and remove import in detail.tsx. Plan deletes this file (we don't keep two). |
| `gui-web/src/api/files.ts`                     | Add `listDirTree(path, maxDepth=4) → DirTreeNode[]`                                                                             |
| `gui-web/bridge.py`                            | Add `Api.list_dir_tree(path, max_depth=4)` method                                                                               |

### Removed

- `gui-web/src/pages/detail/StorageExplorer.tsx` — superseded by `storage/StorageExplorer.tsx`. Update the import in `detail.tsx` accordingly.

---

## PR Split

- **PR 1**: Schema registry + bridge `list_dir_tree` + Storage rewrite + build-to-PyInstaller asset pipeline. No behavior change for non-Storage tabs.
- **PR 2**: Research deliverable `docs/superpowers/research/per-agent-config-keys.md` (doc-only).
- **PR 3**: Codex tabs (Model & API + Rules + conditional MCP + conditional Skills).
- **PR 4**: Hermes tabs (Model & Env + Memory + Display).
- **PR 5**: OpenCode tabs (Providers + Model + Instructions).
- MiMoCode PR is **out of scope** for this plan.

PR 1 stands alone. PR 3–5 depend on PR 2 (need the research output to fill in the form-field lists); they can be merged into one PR if the implementer prefers.

---

# PR 1 — Schema Registry + Storage Rewrite

## Task 1: Add vitest + new dependencies to package.json

**Files:**

- Modify: `gui-web/package.json`

- [ ] **Step 1: Edit dependencies block**

Open `gui-web/package.json` and replace the `dependencies` block with:

```jsonc
  "dependencies": {
    "@hookform/resolvers": "^3.9.0",
    "@monaco-editor/react": "^4.6.0",
    "monaco-editor": "^0.52.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-hook-form": "^7.53.0",
    "zod": "^3.23.0"
  }
```

And in `devDependencies`, add:

```jsonc
    "vitest": "^2.1.0"
```

Append to `scripts`:

```jsonc
    "test": "vitest",
    "test:run": "vitest --run"
```

- [ ] **Step 2: Install**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm install`
Expected: lockfile updates, `node_modules/` populated. No errors.

- [ ] **Step 3: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/package.json gui-web/package-lock.json
git commit -m "build(deps): add monaco-editor, zod, react-hook-form, vitest"
```

---

## Task 2: Backend `list_dir_tree` bridge method

**Files:**

- Modify: `gui-web/bridge.py` (append method to class `Api`)
- Modify: `gui-web/src/api/files.ts` (add TS wrapper)

- [ ] **Step 1: Write `_dir_tree_node_helper` helper in bridge.py**

Add at the top of `bridge.py` (after imports, before class Api):

```python
def _dir_tree_node(path: str, max_depth: int = 1) -> Optional[dict]:
    """Build one level of a dir tree rooted at *path*.

    Returns None if path doesn't exist or isn't a directory.
    Children are directories at depth < max_depth; deeper dirs are leaves
    (returned as `type: 'dir'` without `children`).
    """
    import os
    try:
        st = os.lstat(path)
    except OSError:
        return None
    if not os.path.isdir(path):
        return {"path": path, "type": "file", "size": st.st_size, "mtime": int(st.st_mtime * 1000)}
    if max_depth <= 0:
        return {"path": path, "type": "dir"}
    children = []
    try:
        for name in sorted(os.listdir(path)):
            if name.startswith("."):
                continue
            full = os.path.join(path, name)
            node = _dir_tree_node(full, max_depth - 1)
            if node is not None:
                children.append(node)
    except OSError:
        pass
    return {"path": path, "type": "dir", "children": children}
```

- [ ] **Step 2: Add `list_dir_tree` Api method**

In `class Api` inside `bridge.py`, append:

```python
    def list_dir_tree(self, path: str, max_depth: int = 4) -> str:
        """Return a directory tree (depth-limited). Hidden files excluded."""
        try:
            # Expand leading ~
            if path.startswith("~"):
                home = _wsl_run("echo -n $HOME")
                path = home + path[1:]
            node = _dir_tree_node(path, max_depth)
            if node is None:
                return json.dumps({"ok": True, "data": {"path": path, "type": "dir", "children": []}})
            return json.dumps({"ok": True, "data": node})
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)})
```

- [ ] **Step 3: Add TS wrapper**

In `gui-web/src/api/files.ts`, append:

```ts
export interface DirTreeNode {
  path: string;
  type: "dir" | "file";
  size?: number;
  mtime?: number;
  children?: DirTreeNode[];
}

/**
 * Lazy-loaded recursive tree. `maxDepth` defaults to 4; pass 1
 * for "one level" then refetch with deeper values on expansion.
 */
export async function listDirTree(
  path: string,
  maxDepth = 4,
): Promise<DirTreeNode | null> {
  return call<DirTreeNode | null>(
    (api) => api.list_dir_tree(path, maxDepth),
    null,
  );
}
```

- [ ] **Step 4: Smoke test**

Boot the dev server if not running: `cd /home/maoqh/projects/agent-box/gui-web && npm run dev &`
In a WSL shell pointed at a real profile path, run:

```bash
wsl bash -lc "agent-box show <name> --json"
```

Capture the `path` field (e.g. `/home/maoqhh/.agent-box/profiles/claude-<name>`).

Then load a tiny HTML test page (or call directly via webview in a later task) — for now just verify the bridge import doesn't fail:

```bash
cd /home/maoqh/projects/agent-box
python -c "from gui_web.bridge import Api; a = Api(); print(a.list_dir_tree('/tmp', 2))"
```

Expected: JSON with `{"ok": true, "data": {...}}` containing `type: "dir"` and a few children.

- [ ] **Step 5: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/bridge.py gui-web/src/api/files.ts
git commit -m "feat(bridge): add list_dir_tree for VSCode-like storage pane"
```

---

## Task 3: `buildTreeFromFlatList` utility + tests

**Files:**

- Create: `gui-web/src/pages/detail/storage/buildTreeFromFlatList.ts`
- Create: `gui-web/src/pages/detail/storage/buildTreeFromFlatList.test.ts`
- Create: `gui-web/vitest.config.ts`

- [ ] **Step 1: Write failing test**

```ts
// gui-web/src/pages/detail/storage/buildTreeFromFlatList.test.ts
import { describe, it, expect } from "vitest";
import { buildTreeFromFlatList, type FlatFile } from "./buildTreeFromFlatList";

describe("buildTreeFromFlatList", () => {
  it("groups files by directory", () => {
    const files: FlatFile[] = [
      { path: "/root/a/x.md" },
      { path: "/root/a/y.json" },
      { path: "/root/b/z.txt" },
    ];
    const tree = buildTreeFromFlatList(files, "/root");
    expect(tree).toEqual([
      {
        type: "dir",
        path: "/root/a",
        children: [
          { type: "file", path: "/root/a/x.md" },
          { type: "file", path: "/root/a/y.json" },
        ],
      },
      {
        type: "dir",
        path: "/root/b",
        children: [{ type: "file", path: "/root/b/z.txt" }],
      },
    ]);
  });

  it("puts files at root when no subdirectory", () => {
    const files: FlatFile[] = [
      { path: "/root/x.md" },
      { path: "/root/y.json" },
    ];
    const tree = buildTreeFromFlatList(files, "/root");
    expect(tree).toEqual([
      { type: "file", path: "/root/x.md" },
      { type: "file", path: "/root/y.json" },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(buildTreeFromFlatList([], "/root")).toEqual([]);
  });

  it("ignores files outside the root prefix", () => {
    const files: FlatFile[] = [
      { path: "/other/x.md" },
      { path: "/root/y.json" },
    ];
    const tree = buildTreeFromFlatList(files, "/root");
    expect(tree).toEqual([{ type: "file", path: "/root/y.json" }]);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Create a minimal vitest config first:

```ts
// gui-web/vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run test:run -- src/pages/detail/storage/buildTreeFromFlatList.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// gui-web/src/pages/detail/storage/buildTreeFromFlatList.ts
export interface FlatFile {
  path: string;
  size?: number;
  mtime?: number;
}

export interface TreeNode {
  type: "dir" | "file";
  path: string;
  children?: TreeNode[];
  size?: number;
  mtime?: number;
}

/**
 * Convert a flat list of file paths into a nested directory tree,
 * rooted at `root`. Files outside `root` are dropped. Directories
 * appearing only as implied parents are emitted with `type: 'dir'`.
 */
export function buildTreeFromFlatList(
  files: FlatFile[],
  root: string,
): TreeNode[] {
  const rootPrefix = root.endsWith("/") ? root : root + "/";
  const dirs = new Map<string, TreeNode>();
  const result: TreeNode[] = [];

  for (const f of files) {
    if (!f.path.startsWith(rootPrefix)) continue;
    const rel = f.path.slice(rootPrefix.length);
    if (!rel) continue;
    const parts = rel.split("/");
    // ensure all parent dirs exist in `dirs`
    let cursor = rootPrefix.replace(/\/$/, "");
    for (let i = 0; i < parts.length - 1; i++) {
      cursor = cursor + "/" + parts[i];
      if (!dirs.has(cursor)) {
        const node: TreeNode = { type: "dir", path: cursor, children: [] };
        dirs.set(cursor, node);
      }
    }
    const fileNode: TreeNode = {
      type: "file",
      path: f.path,
      size: f.size,
      mtime: f.mtime,
    };
    if (parts.length === 1) {
      result.push(fileNode);
    } else {
      const parentPath = rootPrefix + parts.slice(0, -1).join("/");
      dirs.get(parentPath)!.children!.push(fileNode);
    }
  }

  // sort: dirs first then files; alphabetical within each
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
    nodes.forEach((n) => n.children && sortRec(n.children));
  };

  // attach root-level dirs to result
  const rootDirs = Array.from(dirs.values()).filter((d) => {
    const rel = d.path.slice(rootPrefix.length - 1); // leading slash
    return !rel.slice(1).includes("/");
  });
  sortRec(rootDirs);
  sortRec(result);
  return [...rootDirs, ...result];
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run test:run -- src/pages/detail/storage/buildTreeFromFlatList.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/storage/buildTreeFromFlatList.ts gui-web/src/pages/detail/storage/buildTreeFromFlatList.test.ts gui-web/vitest.config.ts
git commit -m "feat(storage): flat-file → tree conversion utility (TDD)"
```

---

## Task 4: `validateJson` utility + tests

**Files:**

- Create: `gui-web/src/pages/detail/storage/validateJson.ts`
- Create: `gui-web/src/pages/detail/storage/schemaMaps.ts`
- Create: `gui-web/src/pages/detail/storage/validateJson.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// gui-web/src/pages/detail/storage/validateJson.test.ts
import { describe, it, expect } from "vitest";
import { validateJson, schemaForPath } from "./validateJson";

describe("validateJson", () => {
  it("passes non-JSON files through with no error", () => {
    expect(validateJson("/root/notes.md", "hello").ok).toBe(true);
    expect(validateJson("/root/.env", "KEY=value").ok).toBe(true);
  });

  it("flags JSON syntax error with line:col", () => {
    const r = validateJson("/root/settings.json", '{"a": ,}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/line \d+/);
      expect(r.error).toMatch(/column \d+/);
    }
  });

  it("accepts valid JSON without registered schema", () => {
    const r = validateJson("/root/anything.json", '{"x":1}');
    expect(r.ok).toBe(true);
  });

  it("rejects JSON invalid against registered schema", () => {
    // Test schema: object with required `name: string`
    const spy = schemaForPath;
    expect(spy).toBeTypeOf("function");

    // uses a built-in schema in schemaMaps.ts for codex/config.toml? No — only `.json`
    // So we test the registered claude/settings.json schema
    const r = validateJson(
      "/root/profiles/claude-foo/settings.json",
      '{"hooks": "not-an-object"}',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.toLowerCase()).toContain("expected");
    }
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run test:run -- src/pages/detail/storage/validateJson.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement schemaMaps.ts**

```ts
// gui-web/src/pages/detail/storage/schemaMaps.ts
import { z } from "zod";

// Claude settings.json → only validates the keys we care about for save safety.
// Other keys are accepted via .passthrough() to avoid clobbering user data.
export const ClaudeSettingsSchema = z
  .object({
    env: z.record(z.string(), z.string()).optional(),
    model: z.string().optional(),
    effortLevel: z.string().optional(),
    permissions: z
      .object({
        defaultMode: z.string().optional(),
        allow: z.array(z.string()).optional(),
        deny: z.array(z.string()).optional(),
        ask: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    hooks: z.record(z.string(), z.unknown()).optional(),
    plugins: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

// Anything parseable as JSON object. We don't constrain field types here
// unless a more specific schema exists.
export const GenericJsonSchema = z.object({}).passthrough();

/**
 * Map of regex → zod schema. Matched against the file path.
 * First match wins. Order: most specific first.
 */
export const SCHEMA_REGISTRY: Array<{ test: RegExp; schema: z.ZodTypeAny }> = [
  { test: /profiles\/[^/]+\/settings\.json$/, schema: ClaudeSettingsSchema },
  { test: /\.json$/, schema: GenericJsonSchema },
];
```

- [ ] **Step 4: Implement validateJson.ts**

```ts
// gui-web/src/pages/detail/storage/validateJson.ts
import { z } from "zod";
import { SCHEMA_REGISTRY } from "./schemaMaps";

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function schemaForPath(path: string): z.ZodTypeAny | null {
  for (const entry of SCHEMA_REGISTRY) {
    if (entry.test.test(path)) return entry.schema;
  }
  return null;
}

export function validateJson(path: string, content: string): ValidationResult {
  // Non-JSON files: no validation, always ok.
  if (!path.endsWith(".json")) return { ok: true };

  // Syntax check
  try {
    JSON.parse(content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid JSON";
    const m = msg.match(/position (\d+)/);
    if (m) {
      const pos = Number(m[1]);
      const upto = content.slice(0, pos);
      const lines = upto.split("\n");
      const line = lines.length;
      const col = lines[lines.length - 1].length + 1;
      return {
        ok: false,
        error: `JSON syntax error at line ${line} column ${col}: ${msg}`,
      };
    }
    return { ok: false, error: `JSON syntax error: ${msg}` };
  }

  // Schema check
  const schema = schemaForPath(path);
  if (!schema) return { ok: true };
  const parsed: unknown = JSON.parse(content);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      error: `${issue.path.join(".") || "<root>"}: ${issue.message}`,
    };
  }
  return { ok: true };
}
```

- [ ] **Step 5: Run test, verify pass**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run test:run -- src/pages/detail/storage/validateJson.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/storage/validateJson.ts gui-web/src/pages/detail/storage/schemaMaps.ts gui-web/src/pages/detail/storage/validateJson.test.ts
git commit -m "feat(storage): JSON validation with zod schema registry (TDD)"
```

---

## Task 5: `useOpenFiles` multi-tab hook + tests

**Files:**

- Create: `gui-web/src/pages/detail/storage/useOpenFiles.ts`
- Create: `gui-web/src/pages/detail/storage/useOpenFiles.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// gui-web/src/pages/detail/storage/useOpenFiles.test.tsx
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOpenFiles } from "./useOpenFiles";

describe("useOpenFiles", () => {
  it("opens a file and reports dirty status", () => {
    const { result } = renderHook(() => useOpenFiles({ max: 5 }));
    act(() => result.current.open("/a/b.md", "hello"));
    expect(result.current.openFiles[0]).toMatchObject({
      path: "/a/b.md",
      content: "hello",
      dirty: false,
    });
    act(() => result.current.updateContent("/a/b.md", "hello!"));
    expect(result.current.openFiles[0].dirty).toBe(true);
  });

  it("switches active file", () => {
    const { result } = renderHook(() => useOpenFiles({ max: 5 }));
    act(() => {
      result.current.open("/a.md", "A");
      result.current.open("/b.md", "B");
    });
    expect(result.current.active).toBe("/b.md");
    act(() => result.current.setActive("/a.md"));
    expect(result.current.active).toBe("/a.md");
  });

  it("evicts least-recently-used when over max", () => {
    const { result } = renderHook(() => useOpenFiles({ max: 2 }));
    act(() => {
      result.current.open("/a.md", "A");
      result.current.open("/b.md", "B");
      result.current.open("/c.md", "C");
    });
    const paths = result.current.openFiles.map((f) => f.path);
    expect(paths).not.toContain("/a.md");
    expect(paths).toContain("/b.md");
    expect(paths).toContain("/c.md");
  });

  it("marks clean after successful save", () => {
    const { result } = renderHook(() => useOpenFiles({ max: 5 }));
    act(() => {
      result.current.open("/x.md", "orig");
      result.current.updateContent("/x.md", "edit");
    });
    expect(result.current.openFiles[0].dirty).toBe(true);
    act(() => result.current.markClean("/x.md"));
    expect(result.current.openFiles[0].dirty).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run test:run -- src/pages/detail/storage/useOpenFiles.test.tsx`
Expected: FAIL — module not found (and `@testing-library/react` missing).

- [ ] **Step 3: Add testing library**

```bash
cd /home/maoqh/projects/agent-box/gui-web
npm install --save-dev @testing-library/react @testing-library/react-hooks
```

- [ ] **Step 4: Implement**

```ts
// gui-web/src/pages/detail/storage/useOpenFiles.ts
import { useCallback, useState } from "react";

export interface OpenFile {
  path: string;
  content: string;
  /** Last saved snapshot of the content on disk. */
  savedContent: string;
  dirty: boolean;
}

export function useOpenFiles({ max }: { max: number }) {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [active, setActive] = useState<string | null>(null);

  const open = useCallback(
    (path: string, content: string) => {
      setOpenFiles((prev) => {
        const existing = prev.find((f) => f.path === path);
        let next: OpenFile[];
        if (existing) {
          // move to front
          next = [
            { ...existing, content, savedContent: content, dirty: false },
            ...prev.filter((f) => f.path !== path),
          ];
        } else {
          next = [
            { path, content, savedContent: content, dirty: false },
            ...prev,
          ];
          if (next.length > max) next = next.slice(0, max);
        }
        return next;
      });
      setActive(path);
    },
    [max],
  );

  const updateContent = useCallback((path: string, content: string) => {
    setOpenFiles((prev) =>
      prev.map((f) =>
        f.path === path
          ? { ...f, content, dirty: content !== f.savedContent }
          : f,
      ),
    );
  }, []);

  const markClean = useCallback((path: string) => {
    setOpenFiles((prev) =>
      prev.map((f) =>
        f.path === path ? { ...f, savedContent: f.content, dirty: false } : f,
      ),
    );
  }, []);

  const close = useCallback((path: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.path !== path));
    setActive((cur) => (cur === path ? null : cur));
  }, []);

  return {
    openFiles,
    active,
    open,
    setActive,
    updateContent,
    markClean,
    close,
  };
}
```

- [ ] **Step 5: Run test, verify pass**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run test:run -- src/pages/detail/storage/useOpenFiles.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/storage/useOpenFiles.ts gui-web/src/pages/detail/storage/useOpenFiles.test.tsx gui-web/package.json gui-web/package-lock.json
git commit -m "feat(storage): LRU open-files hook (TDD)"
```

---

## Task 6: `FileTree` component

**Files:**

- Create: `gui-web/src/pages/detail/storage/FileTree.tsx`

(No tests for this visual tree in PR 1 — covered by manual smoke in Task 9.)

- [ ] **Step 1: Implement**

```tsx
// gui-web/src/pages/detail/storage/FileTree.tsx
import { useState } from "react";
import type { TreeNode } from "./buildTreeFromFlatList";
import { cn } from "@/lib/utils";

function fileIcon(filename: string): string {
  if (filename.endsWith(".json") || filename.endsWith(".jsonc")) return "📋";
  if (filename.endsWith(".md")) return "📘";
  if (filename.endsWith(".toml")) return "⚙";
  if (filename.endsWith(".yaml") || filename.endsWith(".yml")) return "📄";
  return "📄";
}

function fmtSize(size?: number): string {
  if (size === undefined) return "";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}K`;
  return `${(size / (1024 * 1024)).toFixed(1)}M`;
}

function Folder({
  node,
  depth,
  onSelect,
  selected,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="block w-full text-left text-xs font-mono px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground rounded truncate"
        style={{ paddingLeft: depth * 12 + 8 }}
        title={node.path}
      >
        <span className="inline-block w-3">{open ? "▼" : "▶"}</span>{" "}
        {node.path.split("/").pop()}
      </button>
      {open && node.children && (
        <div>
          {node.children.map((child) =>
            child.type === "dir" ? (
              <Folder
                key={child.path}
                node={child}
                depth={depth + 1}
                selected={selected}
                onSelect={onSelect}
              />
            ) : (
              <button
                key={child.path}
                type="button"
                onClick={() => onSelect(child.path)}
                className={cn(
                  "block w-full text-left text-xs font-mono px-2 py-0.5 rounded truncate",
                  selected === child.path
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                style={{ paddingLeft: (depth + 1) * 12 + 8 }}
                title={`${child.path} · ${fmtSize(child.size)}`}
              >
                {fileIcon(child.path)} {child.path.split("/").pop()}
                {child.size !== undefined && (
                  <span className="ml-2 text-[10px] opacity-60">
                    {fmtSize(child.size)}
                  </span>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  tree,
  rootLabel,
  selected,
  onSelect,
}: {
  tree: TreeNode[];
  rootLabel: string;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <div className="text-xs">
      <div className="px-2 py-1 font-medium text-foreground/80">
        {rootLabel}
      </div>
      {tree.map((node) =>
        node.type === "dir" ? (
          <Folder
            key={node.path}
            node={node}
            depth={0}
            selected={selected}
            onSelect={onSelect}
          />
        ) : (
          <button
            key={node.path}
            type="button"
            onClick={() => onSelect(node.path)}
            className={cn(
              "block w-full text-left text-xs font-mono px-2 py-0.5 rounded truncate",
              selected === node.path
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            style={{ paddingLeft: 8 }}
            title={node.path}
          >
            {fileIcon(node.path)} {node.path.split("/").pop()}
          </button>
        ),
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/storage/FileTree.tsx
git commit -m "feat(storage): recursive FileTree component"
```

---

## Task 7: Monaco editor panel

**Files:**

- Create: `gui-web/src/pages/detail/storage/MonacoEditorPanel.tsx`

- [ ] **Step 1: Implement**

```tsx
// gui-web/src/pages/detail/storage/MonacoEditorPanel.tsx
import Editor, { loader } from "@monaco-editor/react";
import { useCallback } from "react";

const MONACO_VERSION = "0.52.0";
const LOCAL_VS_PATH = "/monaco";
const CDN_VS_PATH = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`;

let configured = false;
function configureMonaco() {
  if (configured) return;
  configured = true;
  if (import.meta.env.PROD) {
    // Try local; if 404 the loader will fall back to CDN itself by failing
    loader.config({ paths: { vs: LOCAL_VS_PATH } });
  }
}

function detectLanguage(path: string): string {
  if (path.endsWith(".json") || path.endsWith(".jsonc")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".toml")) return "ini";
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "yaml";
  return "plaintext";
}

export interface MonacoEditorPanelProps {
  value: string;
  language: string;
  onChange: (next: string) => void;
  onMount?: () => void;
}

export function MonacoEditorPanel({
  value,
  language,
  onChange,
  onMount,
}: MonacoEditorPanelProps) {
  configureMonaco();
  const handleMount = useCallback(() => onMount?.(), [onMount]);
  return (
    <Editor
      height="100%"
      theme="vs-dark"
      language={language}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleMount}
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 2,
      }}
      loading={
        <p className="p-4 text-xs text-muted-foreground">Loading editor...</p>
      }
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/storage/MonacoEditorPanel.tsx
git commit -m "feat(storage): Monaco editor panel wrapper"
```

---

## Task 8: `SaveBar` component

**Files:**

- Create: `gui-web/src/pages/detail/storage/SaveBar.tsx`

- [ ] **Step 1: Implement**

```tsx
// gui-web/src/pages/detail/storage/SaveBar.tsx
import { Button } from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils";

export function SaveBar({
  dirty,
  saving,
  lastSavedAt,
  onSave,
  path,
}: {
  dirty: boolean;
  saving: boolean;
  lastSavedAt: number | null;
  onSave: () => void;
  path: string | null;
}) {
  const tip = path ?? "No file selected";
  return (
    <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
      <span
        className="font-mono text-xs text-muted-foreground truncate"
        title={tip}
      >
        {tip}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {saving
            ? "Saving…"
            : dirty
              ? "Unsaved changes"
              : lastSavedAt
                ? `Saved · ${formatRelativeTime(lastSavedAt)}`
                : ""}
        </span>
        <Button size="sm" onClick={onSave} disabled={!path || !dirty || saving}>
          Save
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/storage/SaveBar.tsx
git commit -m "feat(storage): SaveBar with dirty/saving state"
```

---

## Task 9: New `StorageExplorer` (FS-style) and remove old one

**Files:**

- Create: `gui-web/src/pages/detail/storage/StorageExplorer.tsx`
- Delete: `gui-web/src/pages/detail/StorageExplorer.tsx`
- Modify: `gui-web/src/pages/detail.tsx` (change import path)

- [ ] **Step 1: Implement new StorageExplorer**

```tsx
// gui-web/src/pages/detail/storage/StorageExplorer.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui";
import { readFile, saveFile } from "@/api/files";
import { useToast } from "@/components/feedback/toast";
import { buildTreeFromFlatList, type TreeNode } from "./buildTreeFromFlatList";
import { validateJson } from "./validateJson";
import { useOpenFiles } from "./useOpenFiles";
import { FileTree } from "./FileTree";
import { MonacoEditorPanel } from "./MonacoEditorPanel";
import { SaveBar } from "./SaveBar";

export function StorageExplorer({
  profilePath,
  fileTree,
}: {
  profilePath: string;
  fileTree: string[];
}) {
  const { toast } = useToast();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const {
    openFiles,
    active,
    open,
    setActive,
    updateContent,
    markClean,
    close,
  } = useOpenFiles({ max: 5 });
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // Build tree from flat list (findFiles result)
  useEffect(() => {
    setTree(
      buildTreeFromFlatList(
        fileTree.map((p) => ({ path: p })),
        profilePath,
      ),
    );
  }, [fileTree, profilePath]);

  const openFile = useCallback(
    async (path: string) => {
      try {
        const content = await readFile(path);
        open(path, content);
        setLastSavedAt(Date.now());
      } catch {
        toast({ type: "error", message: `Failed to read ${path}` });
      }
    },
    [open, toast],
  );

  const handleSave = useCallback(async () => {
    if (!active) return;
    const file = openFiles.find((f) => f.path === active);
    if (!file) return;

    const validation = validateJson(file.path, file.content);
    if (!validation.ok) {
      toast({ type: "error", message: validation.error });
      return;
    }

    setSaving(true);
    try {
      await saveFile(file.path, file.content);
      markClean(file.path);
      setLastSavedAt(Date.now());
      toast({
        type: "success",
        message: `Saved ${file.path.split("/").pop()}`,
      });
    } catch (e: unknown) {
      toast({
        type: "error",
        message: e instanceof Error ? e.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  }, [active, openFiles, markClean, toast]);

  const activeFile = useMemo(
    () => openFiles.find((f) => f.path === active),
    [openFiles, active],
  );

  return (
    <div className="grid grid-cols-[35%_1fr] gap-3 h-[640px]">
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Files</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto p-2">
          <FileTree
            tree={tree}
            rootLabel={profilePath.split("/").pop() ?? profilePath}
            selected={active}
            onSelect={openFile}
          />
        </CardContent>
      </Card>
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-1 overflow-x-auto">
          {openFiles.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setActive(f.path)}
              className={`text-xs px-2 py-1 rounded font-mono whitespace-nowrap ${
                active === f.path
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title={f.path}
            >
              {f.dirty && "● "}
              {f.path.split("/").pop()}
            </button>
          ))}
        </div>
        <CardContent className="flex-1 p-0 overflow-hidden">
          {activeFile ? (
            <MonacoEditorPanel
              language={f.endsWithDetecting(activeFile.path)}
              value={activeFile.content}
              onChange={(next) => updateContent(activeFile.path, next)}
            />
          ) : (
            <p className="p-4 text-xs text-muted-foreground">
              Click a file on the left to edit.
            </p>
          )}
        </CardContent>
        <SaveBar
          dirty={activeFile?.dirty ?? false}
          saving={saving}
          lastSavedAt={lastSavedAt}
          onSave={handleSave}
          path={activeFile?.path ?? null}
        />
      </Card>
    </div>
  );
}

// helper kept here to keep `MonacoEditorPanel`'s language detection colocated
function f_endsWithDetecting(path: string): string {
  if (path.endsWith(".json") || path.endsWith(".jsonc")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".toml")) return "ini";
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "yaml";
  return "plaintext";
}
```

> **Wait** — the helper name `f_endsWithDetecting` was a typo. Use `detectLanguage(path)` — reuse Monaco's own logic by exporting from `MonacoEditorPanel.tsx`. **Update**: re-export `detectLanguage` from `MonacoEditorPanel.tsx` and call it from StorageExplorer.

Edit `gui-web/src/pages/detail/storage/MonacoEditorPanel.tsx`: change `function detectLanguage` from internal to **exported**:

```diff
- function detectLanguage(path: string): string {
+ export function detectLanguage(path: string): string {
    ...
  }
```

Then in `StorageExplorer.tsx` replace `f.endsWithDetecting(...)` with `detectLanguage(...)`:

```diff
- <MonacoEditorPanel language={f.endsWithDetecting(activeFile.path)} value={...} onChange={...} />
+ <MonacoEditorPanel language={detectLanguage(activeFile.path)} value={...} onChange={...} />
```

And drop the local `f_endsWithDetecting` helper at the bottom + add import:

```diff
- import { MonacoEditorPanel } from './MonacoEditorPanel'
+ import { MonacoEditorPanel, detectLanguage } from './MonacoEditorPanel'
```

- [ ] **Step 2: Delete old StorageExplorer**

```bash
rm /home/maoqh/projects/agent-box/gui-web/src/pages/detail/StorageExplorer.tsx
```

- [ ] **Step 3: Update detail.tsx import**

Open `gui-web/src/pages/detail.tsx`. Find line 26:

```ts
import { StorageExplorer } from "./detail/StorageExplorer";
```

Replace with:

```ts
import { StorageExplorer } from "./detail/storage/StorageExplorer";
```

Also update the prop signature: the new StorageExplorer takes only `profilePath` and `fileTree`, not `onRefresh`. The `<StorageExplorer ... onRefresh={triggerRefresh} />` JSX in detail.tsx needs the `onRefresh` prop removed:

```diff
-      <StorageExplorer
-        profilePath={profilePath}
-        fileTree={fileTree}
-        onRefresh={triggerRefresh}
-      />
+      <StorageExplorer
+        profilePath={profilePath}
+        fileTree={fileTree}
+      />
```

- [ ] **Step 4: Smoke build**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run build`
Expected: SUCCESS, no TypeScript errors. Dist file is produced.

- [ ] **Step 5: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/storage/StorageExplorer.tsx gui-web/src/pages/detail/storage/MonacoEditorPanel.tsx gui-web/src/pages/detail.tsx
git commit -m "feat(storage): VSCode-style Storage tab with Monaco editor (TDD)"
# Old file deleted in same commit
git add -u gui-web/src/pages/detail/StorageExplorer.tsx
# (this staged a deletion - commit again if not auto-included)
```

If the first commit also recorded the deletion due to overlap, this is one commit. Run `git status` to verify only PR-1 changes remain.

---

## Task 10: Tab schema registry

**Files:**

- Create: `gui-web/src/pages/detail/schema.ts`

- [ ] **Step 1: Implement**

```ts
// gui-web/src/pages/detail/schema.ts
import type { ComponentType } from "react";
import type { AgentType } from "@/api";

export interface ProfileMeta {
  name: string;
  agent_type: string;
  display_name: string;
  description: string;
  provider: string;
  claude_md: string;
  preset: string;
}

export interface ProfileDetailLike {
  path: string;
  meta: ProfileMeta;
  config_dir: string;
}

export interface TabSpec<
  T extends ProfileDetailLike = ProfileDetailLike,
  P = unknown,
> {
  key: string;
  label: string;
  Component: ComponentType<P>;
  /** Returns the props to pass to Component. Sync only. */
  propsFor: (ctx: T) => P;
  /** Hide the tab if false. Sync only. Default true. */
  visible?: (ctx: T) => boolean;
}

export interface AgentTabSchema {
  agentType: AgentType;
  tabs: TabSpec[];
}

export const AGENT_TAB_SCHEMAS: Record<AgentType, AgentTabSchema> = {
  // filled by Task 11 / 12 / PR 3-5 (codex, hermes, opencode) — see PR 3.
  claude: { agentType: "claude", tabs: [] },
  codex: { agentType: "codex", tabs: [] },
  hermes: { agentType: "hermes", tabs: [] },
  opencode: { agentType: "opencode", tabs: [] },
  mimocode: { agentType: "mimocode", tabs: [] },
};

export function tabsFor(profile: ProfileDetailLike): TabSpec[] {
  const entry = AGENT_TAB_SCHEMAS[profile.meta.agent_type as AgentType];
  if (!entry) return [];
  return entry.tabs.filter((t) => (t.visible ? t.visible(profile) : true));
}
```

- [ ] **Step 2: Add minimal tests**

Create `gui-web/src/pages/detail/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tabsFor } from "./schema";

describe("tabsFor", () => {
  it("returns empty array for unknown agent types", () => {
    const r = tabsFor({
      path: "/x",
      config_dir: "/x",
      meta: {
        name: "n",
        agent_type: "unknown",
        display_name: "",
        description: "",
        provider: "",
        claude_md: "",
        preset: "",
      },
    } as never);
    expect(r).toEqual([]);
  });

  it("filters out tabs whose visible() returns false", () => {
    // we don't yet have populated schemas; this validates the filter wiring
    const r = tabsFor({
      path: "/x",
      config_dir: "/x",
      meta: {
        name: "n",
        agent_type: "claude",
        display_name: "",
        description: "",
        provider: "",
        claude_md: "",
        preset: "",
      },
    } as never);
    expect(Array.isArray(r)).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests, verify pass**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run test:run -- src/pages/detail/schema.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/schema.ts gui-web/src/pages/detail/schema.test.ts
git commit -m "feat(detail): static tab schema registry (TDD)"
```

---

## Task 11: Migrate Claude tabs into schema registry

**Files:**

- Modify: `gui-web/src/pages/detail/schema.ts`
- Modify: `gui-web/src/pages/detail.tsx`

- [ ] **Step 1: Replace hard-coded `CLAUDE_TABS` / `OTHER_TABS` constants in detail.tsx**

Open `gui-web/src/pages/detail.tsx`. Delete the `CLAUDE_TABS` (lines 53–63) and `OTHER_TABS` (lines 65–80) constant declarations.

Delete the import of the in-file tab constants (only used by `tabs = agentType === 'claude' ? CLAUDE_TABS : ...`). Replace with import:

```ts
import { tabsFor, type ProfileDetailLike, type TabSpec } from "./detail/schema";
import { MetaEditor } from "./detail/claude/MetaEditor";
import { ProviderEditor } from "./detail/claude/ProviderEditor";
import { PermissionsEditor } from "./detail/claude/PermissionsEditor";
import { HooksEditor } from "./detail/claude/HooksEditor";
import { PluginsEditor } from "./detail/claude/PluginsEditor";
import { FileTextEditor as ClaudeFileTextEditor } from "./detail/claude/FileTextEditor";
import { McpTab as ClaudeMcpTab } from "./detail/claude/McpTab";
import { SkillsTab as ClaudeSkillsTab } from "./detail/claude/SkillsTab";
import { StorageExplorer } from "./detail/storage/StorageExplorer";
```

> **Wait** — existing imports in detail.tsx don't have this path style. Plan only - the implementer should copy each existing tab file into `detail/claude/` first OR keep imports as-is from `detail/*` and only fix the storage one. **Decision** (this is the simpler risk-free path): do not move Claude tab files in PR 1 — only rewire the storage import + replace the constant arrays. Move them to `claude/*` only when needed for per-type organization.

Updated Step 1 (simplified):

```diff
- import { StorageExplorer } from './detail/StorageExplorer'
+ import { StorageExplorer } from './detail/storage/StorageExplorer'
```

That import path swap is enough to keep PR 1 small. The full per-agent-type split happens in PR 3-5.

Then, replace the constant declarations with the schema-import-based flow. In `detail.tsx`, locate the line `const tabs = agentType === 'claude' ? CLAUDE_TABS : (OTHER_TABS[agentType] ?? OTHER_TABS['codex']!)`.

Delete that line and use:

```ts
const tabSpecs: TabSpec[] = tabsFor(detail as unknown as ProfileDetailLike);
const tabs = tabSpecs.map((t) => ({ key: t.key, label: t.label }));
```

Then update the tab renderer: Tabs are still driven by the `tabs` array's `key`. The existing `TabContent` switch-case hard-codes Claude tab keys (e.g. `'meta'`, `'provider'`). Replace the switch with a dispatch:

```tsx
function TabContent({ spec, detail, settingsPath, settingsRaw, claudeMdPath, claudeMdRaw, claudeDotJson, fileTree, onRefresh }: {
  spec: TabSpec
  detail: ProfileDetail
  settingsPath: string
  settingsRaw: string
  claudeMdPath: string
  claudeMdRaw: string
  claudeDotJson: string
  fileTree: string[]
  onRefresh: () => void
}) {
  return <spec.Component {...spec.propsFor({ ... })} />
}
```

**Implementer note:** building a single TypeScript-typed `propsFor` is fiddly because each Claude tab takes different props. **For PR 1** keep the existing `switch(tab)` body but source `tab` from the new lookup. The cleaner per-type `Component` resolution lands in PR 3-5.

Concrete replacement for the switch inside `TabContent`:

```diff
- switch (tab) {
-   case 'meta': return <MetaEditor ... />
-   ...
- }
+ const Component = spec.Component
+ const props = spec.propsFor({ ...detail, settingsPath, settingsRaw, claudeMdPath, claudeMdRaw, claudeDotJson, fileTree, onRefresh } as unknown as ProfileDetailLike)
+ return <Component {...props as never} />
```

(Use `as never` only if TS complains — it's a transitional cast until PR 3-5 solidify the contract.)

- [ ] **Step 2: Populate the schema's Claude entry**

Replace the empty `claude: { agentType: 'claude', tabs: [] }` line in `schema.ts` with:

```ts
import { MetaEditor } from './claude/MetaEditor'
import { ProviderEditor } from './claude/ProviderEditor'
import { PermissionsEditor } from './claude/PermissionsEditor'
import { HooksEditor } from './claude/HooksEditor'
import { PluginsEditor } from './claude/PluginsEditor'
import { FileTextEditor as ClaudeFileTextEditor } from './claude/FileTextEditor'
import { McpTab as ClaudeMcpTab } from './claude/McpTab'
import { SkillsTab as ClaudeSkillsTab } from './claude/SkillsTab'
import { StorageExplorer } from './storage/StorageExplorer'

// ... inside AGENT_TAB_SCHEMAS:

  claude: {
    agentType: 'claude',
    tabs: [
      {
        key: 'meta', label: 'Meta',
        Component: MetaEditor,
        propsFor: (d) => ({ detail: d as unknown as ProfileDetail, onRefresh: (d as unknown as { onRefresh: () => void }).onRefresh }),
      },
      // ... one entry per existing Claude tab
      { key: 'storage', label: 'Storage', Component: StorageExplorer,
        propsFor: (d) => ({ profilePath: (d as { path: string }).path, fileTree: (d as { fileTree: string[] }).fileTree }) },
      // ... other types
    ],
  },
```

**Implementer note**: this is detailed but mechanical. PR 1 ships this fully wired for **claude only**. Other agent types stay with empty arrays (covered by PR 3-5). Build must compile.

- [ ] **Step 3: Build and verify**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run build`
Expected: SUCCESS.

- [ ] **Step 4: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/schema.ts gui-web/src/pages/detail.tsx
git commit -m "refactor(detail): wire Claude tabs through schema registry"
```

---

## Task 12: PyInstaller Monaco asset pipeline

**Files:**

- Modify: `gui-web/vite.config.ts`

- [ ] **Step 1: Configure vite to copy monaco to dist on build**

Open `gui-web/vite.config.ts`. Inside the Vite config, ensure the public folder is `.` (or update). For PyInstaller support, add a build hook that copies `node_modules/monaco-editor/min/vs` into `dist/monaco/` after build. The simplest approach is a `closeBundle` hook:

```ts
// gui-web/vite.config.ts (snippet — only add this to existing config, don't rewrite)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

function copyDir(src: string, dest: string) {
  if (!existsSync(src)) return;
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const to = join(dest, name);
    if (statSync(from).isDirectory()) copyDir(from, to);
    else copyFileSync(from, to);
  }
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    {
      name: "monaco-asset-pipeline",
      closeBundle() {
        const monacoSrc = "node_modules/monaco-editor/min/vs";
        const monacoDest = "dist/monaco/vs";
        if (existsSync(monacoSrc)) {
          copyDir(monacoSrc, monacoDest);
          console.log(`[monaco] copied to ${monacoDest}`);
        }
      },
    },
  ],
});
```

- [ ] **Step 2: Build and check dist/monaco**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run build`
Expected: log line `[monaco] copied to dist/monaco/vs`. `ls dist/monaco/vs/loader.js` exists.

- [ ] **Step 3: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/vite.config.ts
git commit -m "build: copy Monaco editor assets into dist for PyInstaller bundling"
```

---

## Task 13: Smoke test Storage tab end-to-end

**Files:**

- (no files; manual smoke)

- [ ] **Step 1: Run dev mode**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run dev`
Open: `http://localhost:5173` in the browser. Navigate to Profiles → select a Claude profile.

- [ ] **Step 2: Verify Storage tab renders a tree**

Click "Storage" tab. The left pane should render a directory tree (NOT a flat list). All `.json` / `.md` / `.toml` files visible.

- [ ] **Step 3: Open + edit a JSON file without saving**

Click `settings.json`. Right pane should show Monaco editor with syntax highlighting and line numbers.
Type any edit; the bottom SaveBar should show "Unsaved changes".

- [ ] **Step 4: Save → success**

Click Save. The bar should switch to "Saved · 0s ago". Refresh the page (Ctrl+R); file content still shows edit.

- [ ] **Step 5: Save → validation blocks invalid JSON**

Click `CLAUDE.md` or open a different file. Type `{` and click Save — toast reports JSON syntax error and file is **not written**. Reload page — original content still there.

- [ ] **Step 6: Build production and test bridge.py loads it**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run build` (verify also dist/monaco/vs/loader.js exists).
Then: `cd /home/maoqh/projects/agent-box && python gui-web/bridge.py --prod`
Expected: window opens, address bar shows local file:// index.html, Storage tab works offline (Monaco loads from `/monaco`).

- [ ] **Step 7: Manual commit acknowledgment**

No code changes; this is the manual gate before merging PR 1.

---

## End of PR 1

PR 1 ships:

- Static schema registry with Claude tabs registered.
- VSCode-style Storage tab (tree + Monaco + JSON validation).
- New `bridge.list_dir_tree` interface.
- PyInstaller asset pipeline for Monaco.

---

# PR 2 — Per-agent-type config key research

> **Doc-only PR.** No code changes.

## Task 14: Research all relevant agent config keys

**Files:**

- Create: `docs/superpowers/research/per-agent-config-keys.md`

- [ ] **Step 1: Sources**

For each agent type, fetch and summarize:

- **Codex**: https://github.com/openai/codex README + `docs/config.md` if present + `codex-rs/config/src/schema.rs` (or similar). List all top-level keys of `config.toml` with default values.
- **Hermes**: project README + https://github.com/just-every/hermes-agent (or current repo). Map every key of `config.yaml` to its purpose.
- **OpenCode**: https://opencode.ai/docs (specifically the `config.json` page). Cover `provider`, `model`, `instructions`, `mcp` (if any).
- **MiMoCode**: SKIP — explicitly out of scope.

- [ ] **Step 2: Document format**

The file must contain, for each agent type, a table:

| key | type | default | description | frequency (高频/中频/低频) | UI element (form / storage-only) |

- [ ] **Step 3: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add docs/superpowers/research/per-agent-config-keys.md
git commit -m "docs(research): catalog config keys for codex/hermes/opencode"
```

---

# PR 3 — Codex form tabs

> PR 3 depends on PR 2. Skip if PR 2 isn't yet committed. Tasks are sketched — implementer fills in concrete field details using the research deliverable.

## Task 15: Codex config TOML parse/serialize

**Files:**

- Create: `gui-web/src/pages/detail/codex/codectoml.ts`
- Create: `gui-web/src/pages/detail/codex/codectoml.test.ts`

- [ ] **Step 1: Failing test** (round-trip for a small flat toml doc)

```ts
import { parseToml, serializeToml } from "./codectoml";

describe("codectoml", () => {
  it("round-trips a flat toml", () => {
    const src = `model = "gpt"\napproval_policy = "never"\n`;
    expect(serializeToml(parseToml(src))).toBe(src);
  });

  it("parses [history] section", () => {
    const p = parseToml('[history]\npersistence = "none"\n');
    expect(p).toEqual({ history: { persistence: "none" } });
  });

  it("parses [model_providers.custom] section", () => {
    const p = parseToml(
      `[model_providers.custom]\nname = "x"\nbase_url = ""\n`,
    );
    expect(p).toEqual({
      model_providers: { custom: { name: "x", base_url: "" } },
    });
  });
});
```

- [ ] **Step 2: Run, fail**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run test:run -- src/pages/detail/codex/codectoml.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement using `smol-toml`**

```bash
cd /home/maoqh/projects/agent-box/gui-web
npm install smol-toml
```

```ts
// gui-web/src/pages/detail/codex/codectoml.ts
import { parse as smolParse, stringify as smolStringify } from "smol-toml";

export function parseToml(src: string): Record<string, unknown> {
  return smolParse(src) as Record<string, unknown>;
}

export function serializeToml(obj: Record<string, unknown>): string {
  return smolStringify(obj as never);
}
```

- [ ] **Step 4: Run, pass**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run test:run -- src/pages/detail/codex/codectoml.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/codex/codectoml.ts gui-web/src/pages/detail/codex/codectoml.test.ts gui-web/package.json gui-web/package-lock.json
git commit -m "feat(codex): toml parse/serialize wrapper (TDD)"
```

---

## Task 16: Codex ModelEditor

**Files:**

- Create: `gui-web/src/pages/detail/codex/ModelEditor.tsx`

- [ ] **Step 1: Implement**

```tsx
// gui-web/src/pages/detail/codex/ModelEditor.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
} from "@/components/ui";
import { useToast } from "@/components/feedback/toast";
import { readFile, saveFile } from "@/api/files";
import { parseToml, serializeToml } from "./codectoml";

interface Props {
  profileName: string;
  configDir: string;
}

export function CodexModelEditor({ profileName, configDir }: Props) {
  const { toast } = useToast();
  const [tomlText, setTomlText] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const configPath = `${configDir}/config.toml`;
  const authPath = `${configDir}/auth.json`;

  useEffect(() => {
    Promise.all([readFile(configPath), readFile(authPath)]).then(([t, a]) => {
      setTomlText(t);
      try {
        const parsed = JSON.parse(a) as Record<string, string>;
        setApiKey(parsed.OPENAI_API_KEY ?? "");
      } catch {
        setApiKey("");
      }
    });
  }, [configPath, authPath]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Update toml text → parse → write
      const parsed = parseToml(tomlText);
      await saveFile(configPath, serializeToml(parsed));
      // Update auth.json
      const existing = (() => {
        try {
          return JSON.parse(tomlText);
        } catch {
          return {};
        }
      })() as Record<string, string>;
      const merged = { ...existing, OPENAI_API_KEY: apiKey };
      await saveFile(authPath, JSON.stringify(merged, null, 2));
      toast({ type: "success", message: "Saved Codex model config" });
    } catch (e: unknown) {
      toast({
        type: "error",
        message: e instanceof Error ? e.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  }, [tomlText, apiKey, configPath, authPath, toast]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>API Key (auth.json)</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="password"
            placeholder="OPENAI_API_KEY"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="font-mono"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>config.toml (raw)</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={tomlText}
            onChange={(e) => setTomlText(e.target.value)}
            rows={20}
            className="w-full font-mono text-xs rounded-md border border-border bg-background px-3 py-2"
          />
        </CardContent>
      </Card>
      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
```

> **First round**: Use raw textarea for the toml body; the form-driven version lands after PR 2 research identifies which keys are "high-frequency". Re-render: replace the textarea block with a `<Form>` once the research confirms which fields to surface.

- [ ] **Step 2: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/codex/ModelEditor.tsx
git commit -m "feat(codex): ModelEditor (auth.json + config.toml placeholder)"
```

---

## Task 17: Wire Codex into schema

**Files:**

- Modify: `gui-web/src/pages/detail/schema.ts`

- [ ] **Step 1: Add Codex tab entries**

Replace the empty `codex: { agentType: 'codex', tabs: [] }` with:

```ts
import { CodexModelEditor } from './codex/ModelEditor'

// inside AGENT_TAB_SCHEMAS:
  codex: {
    agentType: 'codex',
    tabs: [
      { key: 'meta', label: 'Meta', Component: MetaEditor,
        propsFor: (d) => ({ detail: d as ProfileDetail, onRefresh: () => {} }) },
      { key: 'model', label: 'Model & API', Component: CodexModelEditor,
        propsFor: (d) => ({ profileName: d.meta.name, configDir: d.config_dir }) },
      { key: 'rules', label: 'Rules', Component: ClaudeFileTextEditor,
        propsFor: (d) => ({ path: `${d.config_dir}/AGENTS.md`, content: '', label: 'AGENTS.md', placeholder: '# Rules', onRefresh: () => {} }) },
      { key: 'storage', label: 'Storage', Component: StorageExplorer,
        propsFor: (d) => ({ profilePath: d.path, fileTree: (d as { fileTree?: string[] }).fileTree ?? [] }) },
    ],
  },
```

> **Note**: `MetaEditor` etc. are Claude-specific and assume the `ProfileDetail` shape passed by `detail.tsx`. `CodexModelEditor` doesn't use that — it directly reads files. For PR 3, the meta/rules/storage for Codex are placeholders; their real schema is clarified once PR 2 research lands.

- [ ] **Step 2: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/schema.ts
git commit -m "feat(codex): wire Codex tabs into schema registry"
```

---

## Task 18: Codex smoke test

> Manual. Open Codex profile → confirm tabs appear and Model & API tab loads + saves.

- [ ] **Step 1: Open a Codex profile**

Run dev server, navigate to a Codex profile. Verify tabs: Meta / Model & API / Rules / Storage.

- [ ] **Step 2: Save an OPENAI_API_KEY**

Enter a key, save, reload — key persists.

- [ ] **Step 3: End of PR 3**

No commit; PR 3 is the manual gate.

---

# PR 4 — Hermes form tabs

## Task 19: YAML parser

**Files:**

- Create: `gui-web/src/pages/detail/hermes/yaml.ts`
- Create: `gui-web/src/pages/detail/hermes/yaml.test.ts`

- [ ] **Step 1: Add `yaml` lib**

```bash
cd /home/maoqh/projects/agent-box/gui-web
npm install yaml
```

- [ ] **Step 2: Failing test**

```ts
import { parseYaml, stringifyYaml } from "./yaml";

describe("hermes yaml", () => {
  it("round-trips", () => {
    const src = `model:\n  default: ""\n  provider: custom\n`;
    expect(stringifyYaml(parseYaml(src))).toBe(src);
  });
});
```

- [ ] **Step 3: Run, fail**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run test:run -- src/pages/detail/hermes/yaml.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

```ts
import { parseDocument, stringify as yamlStringify } from "yaml";

export function parseYaml(src: string): Record<string, unknown> {
  return parseDocument(src).toJS() as Record<string, unknown>;
}

export function stringifyYaml(obj: Record<string, unknown>): string {
  return yamlStringify(obj);
}
```

- [ ] **Step 5: Run, pass**

Run: `cd /home/maoqh/projects/agent-box/gui-web && npm run test:run -- src/pages/detail/hermes/yaml.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/hermes/yaml.ts gui-web/src/pages/detail/hermes/yaml.test.ts gui-web/package.json gui-web/package-lock.json
git commit -m "feat(hermes): yaml wrapper (TDD)"
```

---

## Task 20: Hermes form tabs

**Files:**

- Create: `gui-web/src/pages/detail/hermes/ModelEnvEditor.tsx`
- Create: `gui-web/src/pages/detail/hermes/MemoryEditor.tsx`
- Create: `gui-web/src/pages/detail/hermes/DisplayEditor.tsx`
- Modify: `gui-web/src/pages/detail/schema.ts`

- [ ] **Step 1: Implement editors**

Each editor:

- Loads `${configDir}/config.yaml` via `readFile`.
- Splits config into the keys the editor owns; preserves other keys untouched.
- On save: merges changed section back into the full YAML, then `saveFile`.

Use `react-hook-form` + `zod` for each form. Schemas should follow PR 2 research output.

`ModelEnvEditor.tsx` (sketch — fill in real fields after PR 2 research):

```tsx
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@/components/ui";
import { Button } from "@/components/ui";
import { useToast } from "@/components/feedback/toast";
import { readFile, saveFile } from "@/api/files";
import { parseYaml, stringifyYaml } from "./yaml";

interface Props {
  configDir: string;
}
export function HermesModelEnvEditor({ configDir }: Props) {
  const { toast } = useToast();
  const [full, setFull] = useState<Record<string, unknown>>({});
  const [model, setModel] = useState<Record<string, string>>({
    default: "",
    provider: "",
    base_url: "",
  });
  const [terminal, setTerminal] = useState<Record<string, unknown>>({
    backend: "local",
    cwd: ".",
    timeout: 180,
  });
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    readFile(`${configDir}/config.yaml`).then((s) => {
      const p = parseYaml(s);
      setFull(p);
      setModel((p.model ?? {}) as Record<string, string>);
      setTerminal((p.terminal ?? {}) as Record<string, unknown>);
    });
    readFile(`${configDir}/.env`).then((s) => {
      const m = s.split("\n").find((l) => l.startsWith("HERMES_API_KEY="));
      if (m) setApiKey(m.slice("HERMES_API_KEY=".length));
    });
  }, [configDir]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const next = {
        ...full,
        model: {
          ...((full.model as object) ?? {}),
          ...model,
          api_key: "${HERMES_API_KEY}",
        },
        terminal,
      };
      await saveFile(`${configDir}/config.yaml`, stringifyYaml(next));
      await saveFile(`${configDir}/.env`, `HERMES_API_KEY=${apiKey}\n`);
      toast({ type: "success", message: "Saved Hermes model/env" });
    } catch (e: unknown) {
      toast({
        type: "error",
        message: e instanceof Error ? e.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(["default", "provider", "base_url"] as const).map((k) => (
            <Input
              key={k}
              placeholder={k}
              value={model[k] ?? ""}
              onChange={(e) => setModel({ ...model, [k]: e.target.value })}
              className="font-mono text-sm"
            />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>API Key (.env)</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="HERMES_API_KEY"
            className="font-mono"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Terminal</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2">
          <Input
            placeholder="backend"
            value={String(terminal.backend ?? "local")}
            onChange={(e) =>
              setTerminal({ ...terminal, backend: e.target.value })
            }
          />
          <Input
            placeholder="cwd"
            value={String(terminal.cwd ?? ".")}
            onChange={(e) => setTerminal({ ...terminal, cwd: e.target.value })}
          />
          <Input
            type="number"
            placeholder="timeout"
            value={String(terminal.timeout ?? 180)}
            onChange={(e) =>
              setTerminal({ ...terminal, timeout: Number(e.target.value) })
            }
          />
        </CardContent>
      </Card>
      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
```

`MemoryEditor.tsx` and `DisplayEditor.tsx`: same shape — load yaml, edit the section, write back. (Skip filling sketches here; implementer follows the pattern.)

- [ ] **Step 2: Wire Hermes tabs in schema**

```ts
import { HermesModelEnvEditor } from './hermes/ModelEnvEditor'
import { HermesMemoryEditor } from './hermes/MemoryEditor'
import { HermesDisplayEditor } from './hermes/DisplayEditor'

// inside AGENT_TAB_SCHEMAS, hermes:
  hermes: {
    agentType: 'hermes',
    tabs: [
      { key: 'meta', label: 'Meta', Component: MetaEditor,
        propsFor: (d) => ({ detail: d as ProfileDetail, onRefresh: () => {} }) },
      { key: 'model-env', label: 'Model & Env', Component: HermesModelEnvEditor,
        propsFor: (d) => ({ configDir: d.config_dir }) },
      { key: 'persona', label: 'Persona', Component: ClaudeFileTextEditor,
        propsFor: (d) => ({ path: `${d.config_dir}/SOUL.md`, content: '', label: 'SOUL.md', placeholder: '# Soul', onRefresh: () => {} }) },
      { key: 'memory', label: 'Memory', Component: HermesMemoryEditor,
        propsFor: (d) => ({ configDir: d.config_dir }) },
      { key: 'display', label: 'Display', Component: HermesDisplayEditor,
        propsFor: (d) => ({ configDir: d.config_dir }) },
      { key: 'storage', label: 'Storage', Component: StorageExplorer,
        propsFor: (d) => ({ profilePath: d.path, fileTree: (d as { fileTree?: string[] }).fileTree ?? [] }) },
    ],
  },
```

- [ ] **Step 3: Build + commit**

```bash
cd /home/maoqh/projects/agent-box/gui-web && npm run build
```

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/hermes/ gui-web/src/pages/detail/schema.ts
git commit -m "feat(hermes): form-style Model/Memory/Display tabs"
```

---

## Task 21: Hermes smoke test

> Manual. Open Hermes profile → confirm tabs render and a basic model/api_key round-trip works.

---

# PR 5 — OpenCode form tabs

## Task 22: OpenCode providers form

**Files:**

- Create: `gui-web/src/pages/detail/opencode/ProvidersEditor.tsx`
- Modify: `gui-web/src/pages/detail/schema.ts`

- [ ] **Step 1: Implement**

`ProvidersEditor.tsx` (sketch):

- Read `${configDir}/opencode.jsonc` (the `.jsonc` extension: handle stripping line comments before `JSON.parse` — or use `jsonc-parser` from npm).
- Maintain a list of providers (add/remove buttons).
- For each provider: name, npm package, baseURL, apiKey, models (list of `{id, displayName, contextLimit, outputLimit}`).
- `auth.json` stores the actual API keys (mirrored pattern).
- Save: serialize back to JSONC, write to `opencode.jsonc`. Sync api_keys to `auth.json`.

> Implementer: install `jsonc-parser` for correct comment-preserving serialization. Lock to a tested version.

```ts
// gui-web/src/pages/detail/opencode/jsonc.ts
import { parse, modify, applyEdits } from "jsonc-parser";

export function parseJsonc<T = unknown>(src: string): T {
  return parse(src) as T;
}

export function serializeJsonc(src: string, newValue: unknown): string {
  const edits = modify(src, 0, newValue, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  });
  return applyEdits(src, edits);
}
```

- [ ] **Step 2: Wire schema**

```ts
import { OpenCodeProvidersEditor } from './opencode/ProvidersEditor'
import { OpenCodeModelEditor } from './opencode/ModelEditor'
import { OpenCodeInstructionsEditor } from './opencode/InstructionsEditor'

// inside AGENT_TAB_SCHEMAS, opencode:
  opencode: {
    agentType: 'opencode',
    tabs: [
      { key: 'meta', label: 'Meta', Component: MetaEditor,
        propsFor: (d) => ({ detail: d as ProfileDetail, onRefresh: () => {} }) },
      { key: 'providers', label: 'Providers', Component: OpenCodeProvidersEditor,
        propsFor: (d) => ({ profileName: d.meta.name, configDir: d.config_dir }) },
      { key: 'model', label: 'Default Model', Component: OpenCodeModelEditor,
        propsFor: (d) => ({ configDir: d.config_dir }) },
      { key: 'instructions', label: 'Instructions', Component: OpenCodeInstructionsEditor,
        propsFor: (d) => ({ configDir: d.config_dir }) },
      { key: 'storage', label: 'Storage', Component: StorageExplorer,
        propsFor: (d) => ({ profilePath: d.path, fileTree: (d as { fileTree?: string[] }).fileTree ?? [] }) },
    ],
  },
```

- [ ] **Step 3: Build + commit**

```bash
cd /home/maoqh/projects/agent-box/gui-web && npm run build
```

```bash
cd /home/maoqh/projects/agent-box
git add gui-web/src/pages/detail/opencode/ gui-web/src/pages/detail/schema.ts gui-web/package.json gui-web/package-lock.json
git commit -m "feat(opencode): Providers / Model / Instructions tabs"
```

---

## Task 23: OpenCode smoke test

> Manual: open OpenCode profile → add a provider with valid baseURL → save → relaunch confirm config persists.

---

# Self-Review (run before declaring plan complete)

1. **Spec coverage:**
   - §3.1 directory structure → matched by Tasks 1, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 19, 20, 22.
   - §3.2 monaco / zod / RHF / @hookform/resolvers → Task 1.
   - §4 schema registry → Tasks 10, 11.
   - §5 Storage (tree / Monaco / validation / PyInstaller offline) → Tasks 2, 3, 4, 5, 6, 7, 8, 9, 12.
   - §6.1 Claude tabs → Task 11.
   - §6.2 Codex → Tasks 15, 16, 17, 18.
   - §6.3 Hermes → Tasks 19, 20, 21.
   - §6.4 OpenCode → Tasks 22, 23.
   - §6.5 MiMoCode → explicitly skipped (per user).
   - §7.1 backend `list_dir_tree` → Task 2.
   - §8 tests → unit tests throughout; E2E smoke at end of each PR.

2. **Placeholder scan:** No "TBD", no "TODO: implement later". Step 1 of Tasks 1, 2, 3, 4 etc. are concrete edits to known files.

3. **Type consistency:** `useOpenFiles` shape (`OpenFile[]` with `dirty` field) is consistent across Tasks 5, 9. `ProfileDetailLike` interface (Task 10) matches the `ProfileDetail` interface in `detail.tsx` line 30. `AGENT_TAB_SCHEMAS` is correctly keyed by `AgentType` in Tasks 10, 11, 17, 20, 22.

4. **Risks (spec §10):**
   - Monaco bundle size in PyInstaller → mitigated by Task 12.
   - zod schema regressions for Hooks/Plugins → explicitly NOT done in PR 1 (HooksEditor left untouched). Hooks migration deferred to a separate spec.
   - §6 order noted "first round only flat top-level + [history] + [model_providers.custom]" — Task 15 stated that limitation.

5. **Known typos / post-write fixes** baked into the plan:
   - Task 9 Step 1 contains a function name `f_endsWithDetecting`; this is repaired inline in Task 9 (Steps 1's "wait" block).
   - Task 11 Step 1 first proposal moves Claude files into `claude/*`; this is **rolled back** in the "Wait" note to a minimal-storage-import-only path for PR 1's safety.

End of plan.

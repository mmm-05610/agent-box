# Library Page — MCP + Skills + Hooks Tab Extension

> Status: spec (2026-06-27)
> Target: v0.6.0
> Pattern reference: cc-switch `src/hooks/useMcp.ts`, `src/hooks/useSkills.ts`

## Goal

Add MCP Servers, Skills, and Hooks management tabs to the existing Library page.
Pure CRUD management — no apply logic in the frontend. cc-switch handles routing/injection.

## Tab Visibility

| Agent Type | Providers | Claude.md | MCP | Skills | Hooks |
| ---------- | :-------: | :-------: | :-: | :----: | :---: |
| claude     |    ✅     |    ✅     | ✅  |   ✅   |  ✅   |
| codex      |    ✅     |     -     | ✅  |   ✅   |   -   |
| hermes     |    ✅     |     -     | ✅  |   ✅   |   -   |
| opencode   |    ✅     |     -     | ✅  |   ✅   |   -   |

Tabs filter to current `agentType`. Switching agent type reloads the tab's data.

## Data Types

### MCP Server

```typescript
interface McpServer {
  id: string;
  name: string;
  description?: string;
  serverConfig: McpServerConfig; // stdio / sse / http
  homepage?: string;
  docs?: string;
  tags: string[];
  agentTypes: AgentType[]; // which agents this server is enabled for
}

interface McpServerConfig {
  type: "stdio" | "sse" | "http";
  command?: string; // stdio
  args?: string[]; // stdio
  env?: Record<string, string>; // stdio
  url?: string; // sse / http
  headers?: Record<string, string>; // sse / http
}
```

### Skill

```typescript
interface Skill {
  id: string;
  name: string;
  description?: string;
  directory?: string; // local source path
  repoOwner?: string;
  repoName?: string;
  repoBranch?: string;
  readmeUrl?: string;
  agentTypes: AgentType[];
  installedAt?: number;
}
```

### Hooks (Claude-only, file-based)

```typescript
interface HooksConfig {
  // Matches Claude Code hooks.json schema
  PreToolUse?: HookEntry[];
  PostToolUse?: HookEntry[];
  Notification?: HookEntry[];
  // ... other hook event types
}

interface HookEntry {
  matcher?: string;
  hooks: Hook[];
}

interface Hook {
  type: "command";
  command: string;
  timeout?: number;
}
```

## Bridge API (bridge.py)

Add these methods to the `Api` class:

```
list_mcp_servers(agent_type: str) -> str           # JSON
get_mcp_server(server_id: str) -> str               # JSON
save_mcp_server(server_id: str, data_json: str) -> str  # JSON
delete_mcp_server(server_id: str) -> str            # JSON
set_mcp_agent(server_id: str, agent_type: str, enabled: bool) -> str

list_skills(agent_type: str) -> str                 # JSON
get_skill(skill_id: str) -> str                     # JSON
save_skill(skill_id: str, data_json: str) -> str    # JSON
delete_skill(skill_id: str) -> str                  # JSON
set_skill_agent(skill_id: str, agent_type: str, enabled: bool) -> str

get_hooks(profile_name: str) -> str                 # JSON
save_hooks(profile_name: str, data_json: str) -> str  # JSON
```

Each calls the corresponding `agent-box <subcommand> --json` via `_wsl_run()`.
Return format: `{"ok": true, "data": ...}` or `{"ok": false, "error": "..."}`.

## Frontend Files

### New files

| File                              | Purpose                         |
| --------------------------------- | ------------------------------- |
| `gui-web/src/api/mcp.ts`          | MCP CRUD bridge calls           |
| `gui-web/src/api/skills.ts`       | Skills CRUD bridge calls        |
| `gui-web/src/api/hooks.ts`        | Hooks read/write bridge calls   |
| `gui-web/src/hooks/use-mcp.ts`    | `useMcpServers(agentType)` hook |
| `gui-web/src/hooks/use-skills.ts` | `useSkills(agentType)` hook     |
| `gui-web/src/hooks/use-hooks.ts`  | `useHooks(profileName)` hook    |

### Modified files

| File                            | Changes                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `gui-web/src/api/types.ts`      | Add `McpServer`, `McpServerConfig`, `Skill`, `HooksConfig`, `HookEntry` types |
| `gui-web/src/api/index.ts`      | Export new API modules                                                        |
| `gui-web/src/hooks/index.ts`    | Export new hooks                                                              |
| `gui-web/src/pages/library.tsx` | Add MCP / Skills / Hooks tabs + components                                    |

### Component structure in library.tsx

```
LibraryPage
├── AgentTypeTabs (existing)
├── ResourceTabs (existing — extend with 3 new tabs)
│   ├── Providers (existing)
│   ├── Claude.md (existing)
│   ├── McpServers (new)
│   ├── Skills (new)
│   └── Hooks (new)
└── TabContent
    ├── ProvidersPanel (existing)
    ├── ClaudeMdPanel (existing)
    ├── McpPanel (new)
    │   ├── McpServerCard
    │   │   ├── name, description, type badge
    │   │   ├── agent type checkboxes
    │   │   └── edit / delete actions
    │   └── AddMcpServerSheet (inline expand)
    ├── SkillsPanel (new)
    │   ├── SkillCard
    │   │   ├── name, description, repo info
    │   │   ├── agent type checkboxes
    │   │   └── edit / delete actions
    │   └── AddSkillSheet (inline expand)
    └── HooksPanel (new) — only for Claude profiles
        ├── ProfileSelector (which profile's hooks to edit)
        ├── HooksEditor (JSON textarea, one per hook event type)
        └── Save button
```

## UI Patterns (follow existing library.tsx style)

1. **Card list**: Same glass-card pattern as existing Provider cards
2. **Inline add panel**: Collapsible `<details>` or expand section, same as existing `+ Add Provider`
3. **Edit**: Click card → expand inline editor with Textarea for JSON
4. **Delete**: Click delete → toast confirmation
5. **Agent type toggle**: Checkbox chips per agent type (for MCP/Skills that support multi-agent)
6. **Search/filter**: Reuse existing search input pattern
7. **Empty state**: Reuse `<EmptyState>` component
8. **Loading**: Reuse `<Loading>` component

## Hooks Panel — Special Case

Unlike MCP/Skills which are library-wide, Hooks are **per-profile**. The Hooks tab needs:

1. A profile selector dropdown (list Claude profiles)
2. Read hooks.json for selected profile via bridge
3. Edit JSON for each hook event type (PreToolUse, PostToolUse, etc.)
4. Save writes back to the profile's hooks.json

This is inherently different from the other tabs. Consider whether Hooks belongs in the Profile Detail page instead of Library. **Decision: put Hooks in Profile Detail page, not Library.** This keeps Library focused on shared resources.

## Revised Tab Plan

Library page: Providers | Claude.md | MCP | Skills
Profile Detail page: existing tabs + Hooks tab

## Implementation Order

1. `gui-web/src/api/types.ts` — add types
2. `gui-web/src/api/mcp.ts` — bridge calls
3. `gui-web/src/api/skills.ts` — bridge calls
4. `gui-web/src/hooks/use-mcp.ts` — data fetching hook
5. `gui-web/src/hooks/use-skills.ts` — data fetching hook
6. `gui-web/src/pages/library.tsx` — MCP tab + Skills tab
7. `gui-web/bridge.py` — MCP + Skills API methods
8. `gui-web/src/api/hooks.ts` + Profile Detail hooks tab (Phase 2)

## Backend Reference

All CLI commands already exist and are wired:

```bash
agent-box mcp-server list --type claude --json
agent-box mcp-server show <id> --json
agent-box mcp-server upsert <id>        # reads JSON from stdin
agent-box mcp-server delete <id>
agent-box mcp-server agents <id> --enable/--disable claude

agent-box skill list --type claude --json
agent-box skill show <id> --json
agent-box skill upsert <id> --name ... --directory ...  # args, not stdin
agent-box skill delete <id>
agent-box skill agents <id> --enable/--disable claude

agent-box hooks show <profile> --json    # reads from profiles/<name>/dot-claude/hooks/hooks.json
agent-box hooks upsert <profile>         # writes JSON from stdin
```

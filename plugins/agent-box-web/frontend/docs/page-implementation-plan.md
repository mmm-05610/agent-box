# Page Implementation Plan

## Overview

Build all 6 top-level pages + 2 sub-pages for the agent-box web GUI.

## Architecture

```
src/
├── api/                    # API bridge layer (mock now, PyWebView later)
│   ├── providers.ts        # Provider CRUD
│   ├── profiles.ts         # Profile CRUD
│   ├── sessions.ts         # Session queries
│   └── index.ts            # Barrel exports
│
├── hooks/                  # Custom React hooks
│   ├── use-providers.ts    # Provider data + mutations
│   ├── use-profiles.ts     # Profile data + mutations
│   └── use-sessions.ts     # Session data
│
├── pages/
│   ├── home.tsx            # Dashboard
│   ├── profiles.tsx        # Profile list
│   ├── library.tsx         # Providers + Claude.md
│   ├── sessions.tsx        # Session history
│   ├── settings.tsx        # Settings
│   ├── help.tsx            # Help/reference
│   ├── detail.tsx          # Profile detail (sub-page)
│   └── wizard.tsx          # Profile creation (sub-page)
│
└── components/
    └── provider/           # Library-specific components
        ├── provider-card.tsx
        ├── provider-form.tsx
        └── claude-md-card.tsx
```

## Page Specs

### 1. Home Page
- Stat cards: profiles count, providers count, active sessions
- Quick action buttons: Create profile, View library
- Recent sessions list (last 5)

### 2. Profiles Page
- Agent type filter tabs (All / Claude / Codex / Hermes / OpenCode)
- Profile cards with: name, agent type badge, status, launch button
- Search/filter
- Empty state with "Create profile" CTA

### 3. Library Page (cc-switch style)
- Two tabs: Providers / Claude.md
- Agent type selector dropdown
- Provider cards: icon, name, category badge, base URL, model
- Claude.md cards: icon, name, description
- Inline edit (expand card)
- Apply to profile (dropdown)
- Search/filter
- Collapsible add panel

### 4. Sessions Page
- Table/list with: profile name, agent type, cwd, status, started at
- Status filter (all/running/exited)
- Cleanup button

### 5. Settings Page
- Theme toggle (system/light/dark)
- About section with version

### 6. Help Page
- Quick reference section
- Links section
- About section

### 7. Profile Detail (sub-page)
- Tabbed view: meta, settings, claude_md, hooks, env, plugins
- Each tab: view mode + edit mode
- File editor with syntax highlighting (mono font)
- Back button to profiles

### 8. Creation Wizard (sub-page)
- Step 1: Select agent type (2x2 grid)
- Step 2: Name + description
- Step 3: Select provider
- Step 4: Select preset
- Back/Next/Create buttons

## Execution Order

Phase 1 (sequential): API layer + hooks
Phase 2 (parallel): All 6 pages + 2 sub-pages via subagents

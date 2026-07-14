# Detail Page — Profile Configuration Visualization (Phase 1)

> 2026-07-14

## 0. Context

源自 `workspace/planning/convergence-roadmap/2025-07-14-roadmap.md` 第一阶段「GUI → 可视化优先」。
本 spec 锁定范围：**Profile Detail 页**的"信息展示为主 + 高频操作快捷入口 + 配置文件全局可编辑 + 全 agent-type 表单 tab 覆盖"。

Profiles 页在本 spec **无改动**（现有卡片已经"一眼看清"，保持现状）。

### 范围

| In | Out（不做） |
|---|---|
| Detail 页 tab 重构（schema 驱动） | Profiles 页重构（已成，无需动） |
| Storage tab 强化（真树 + Monaco + JSON 校验） | 创建 Profile 流程（下一轮） |
| Codex / Hermes / OpenCode / MiMoCode 高频表单 tab | Library 页 MCP / Skills 全局编辑（下一轮） |
| Hooks / Permissions / Plugins 现有表单的健壮性 | 后端 CLI 改造（不在 Phase 1） |
| 静态 TS Schema 注册表 | Creator Profile（属于 Phase 2） |

---

## 1. Goals

1. 用户打开 Detail 页后，能在不切换 tab 的前提下看到关键摘要（name / agentType / 当前 provider / last cwd / session 状态）。
2. Storage tab 像 VSCode — 左目录树、右 Monaco editor，JSON 文件保存前先验证语法。
3. 任何 agent-type 都有合适的表单 tab 覆盖高频配置 key；新增 agent-type 只需在 schema 中加一行。
4. 现有 Claude 的 9 个 tab 完全回归不破。

## 2. Non-goals

- 不重写 CLI / 不重写 bridge 端 WSL 流程；只在必要处加桥方法（`list_dir_tree`）。
- 不引入 Redux / Zustand，沿用现有 React Hook + Context。
- 不引入 Tailwind 之外的样式系统。

---

## 3. Architecture overview

### 3.1 目录结构

```
gui-web/src/pages/detail/
  index.tsx                       (路由分发，路由已经在这里)
  schema.ts                       ★NEW — 每个 agentType 的 tab schema 单一来源
  storage/
    StorageExplorer.tsx           ★RENAME — 从 detail/StorageExplorer.tsx 移入
    FileTree.tsx                  ★NEW — 树状文件浏览器
    MonacoEditorPanel.tsx         ★NEW — @monaco-editor/react 封装
    validateJson.ts               ★NEW — JSON 语法 + schema 校验工具
    useOpenFile.ts                ★NEW — 单文件打开 hook
  claude/
    MetaEditor.tsx        (已有, 复用)
    ProviderEditor.tsx    (已有, 复用)
    PermissionsEditor.tsx (已有, 复用)
    HooksEditor.tsx       (已有, 复用)
    PluginsEditor.tsx     (已有, 复用)
    FileTextEditor.tsx    (已有, 复用)
    McpTab.tsx            (已有, 复用)
    SkillsTab.tsx         (已有, 复用)
  codex/
    ModelEditor.tsx        ★NEW — 表单化 model + api_key + base_url + auth.json
    FileTextEditor.tsx     ★REUSE — Rules 页 (AGENTS.md / rules.md)
    McpTab.tsx             ★REUSE — 仅在 profile 内存在 mcp_servers.toml / mcp.json 时显示
    SkillsTab.tsx          ★REUSE — 仅在 profile 内存在 skills/ 时显示
  hermes/
    ModelEnvEditor.tsx     ★NEW — model + terminal 配置
    PersonaEditor.tsx      ★NEW (or reuse FileTextEditor) — SOUL.md
    MemoryEditor.tsx       ★NEW — memory + compression 表单
    DisplayEditor.tsx      ★NEW — display.{compact, streaming}
    McpTab.tsx             ★REUSE — 如果文件存在
  opencode/
    ProvidersEditor.tsx    ★NEW — provider 多表单管理
    ModelEditor.tsx        ★NEW — 默认 model 选择
    InstructionsEditor.tsx ★NEW — instructions 字符串列表
    McpTab.tsx             ★REUSE — 按 opencode mcp schema 适配
  mimocode/
    ProvidersEditor.tsx    ★REUSE from opencode
    ModelEditor.tsx        ★REUSE — 选择器数据源来自 mimocode 内置 mimo provider
    InstructionsEditor.tsx ★REUSE
    McpTab.tsx             ★REUSE — 同 opencode
  shared/
    MonacoEditorPanel.tsx  ★SHARED
    FormField.tsx          ★SHARED — input + label + 描述的统一封装
    SaveStatusBar.tsx      ★SHARED — dirty / saving / last saved 提示
    SchemaFormRenderer.tsx ★NEW — 给定 zod schema 渲染表单（用于 Hooks / Permissions 等）
```

### 3.2 关键依赖新增

```jsonc
// gui-web/package.json
{
  "dependencies": {
    "@monaco-editor/react": "^4.6.0",
    "monaco-editor": "^0.52.0",
    "zod": "^3.23.0",
    "@hookform/resolvers": "^3.9.0",
    "react-hook-form": "^7.53.0"
  }
}
```

`@monaco-editor/react` 走 CDN loader（默认行为）；CI / PyInstaller bundle 需要在 `assets/monaco/` 预放离线版（见 §5）。
`zod` + `react-hook-form` 用于把现有 Hooks / Permissions / Plugins 表单从 raw JSON 补丁迁移到 schema 化（这一轮**只迁移 Hooks**，其它留待下轮；优先级：schema 化能让校验更严格）。

---

## 4. Tab schema 注册表（schema.ts）

```ts
// gui-web/src/pages/detail/schema.ts
import type { AgentType } from '@/api'

export interface TabSpec<TProps = unknown> {
  /** 唯一 ID，用于 Tabs active state */
  key: string
  /** 顶部 tab bar 显示的文字 */
  label: string
  /** 是否仅在 profile 内存在某些文件时才显示。返回 boolean；
   *  异步判断需要在 `propsFor` 内部做，并在组件内显示「未配置」或加载态。
   *  Tab bar 列表始终同步渲染（不被 conditional 控制）。 */
  conditional?: (ctx: ProfileDetail) => boolean
  /** Tab 内容组件 */
  Component: React.ComponentType<TProps>
  /** 透传给组件的 props 函数 */
  propsFor: (ctx: ProfileDetail) => TProps
}

export interface ProfileDetail {
  path: string
  meta: {
    name: string
    agent_type: string
    display_name: string
    description: string
    provider: string
    claude_md: string
    preset: string
  }
  config_dir: string
}

export interface AgentTabSchema {
  agentType: AgentType
  tabs: TabSpec[]
}

export const AGENT_TAB_SCHEMAS: Record<AgentType, AgentTabSchema>

// 用于 detail.tsx：返回该 profile 的 tab 列表
export function tabsFor(profile: ProfileDetail): TabSpec[] {
  return AGENT_TAB_SCHEMAS[profile.meta.agent_type as AgentType]?.tabs ?? []
}
```

**为什么 static 而不是 dynamic discovery**：dynamic 需要在做表单渲染前做网络 IO（读 `/mcp.json` 是否存在），会引入异步 tab 列表的复杂度。static + 同步 `conditional`（基于 `profile.path` 推导，或组件内部挂载时检查文件存在性后渲染「未配置」状态），tab bar 始终同步渲染。

---

## 5. Storage tab 设计

### 5.1 树数据来源

- 在 `bridge.py` 新增 `list_dir_tree(path, max_depth=4) -> [{path, type, size?, mtime?, children?}]`
- profile 内首次进入 Storage tab 时**不递归调用**——只发 `list_dir_tree(path, depth=1)`；用户点开子目录再发子路径的请求
- 文件元信息（size / mtime）一并返回 → 前端用 `formatRelativeTime` 显示

### 5.2 编辑器

- 用 `@monaco-editor/react` 的 `<Editor>`（CDN loader 默认）
- language 按扩展名：`.json` → `json`，`.md` → `markdown`，`.toml` → `ini`，其他 → `plaintext`
- 接收 props：`value`, `onChange`, `path`(用于标题), `language`, `onSave(Ctrl|Cmd+S)`
- 多 Tab 支持：每个打开的文件占一个 Monaco model；顶部 tab bar 最多 5 个

### 5.3 保存行为

- 默认需确认（用户已确认）
- 用户按 Ctrl/Cmd+S 或点底部「Save」 → 调 `saveFile(path, content)`
- 保存前先校验：
  - 文件后缀 `.json` → `JSON.parse` 语法校验
  - 若是 `settings.json`（Claude 唯一 schema）+ `.codex/config.toml`（解析为 object 后跟 schema 比对）+ `.hermes/config.yaml`（同）：用 `zod` schema 解析
  - 校验失败：toast 显示错误位置（行号列号），阻止保存
- 保存成功：底部右下显示「Saved · 2s ago」

### 5.4 校验失败兜底

- 若 Zod schema 解析失败但用户**确认要强制保存**（高级选项）：弹 `confirm-dialog` 二次确认
- 强制保存的按钮只在 `Settings` → `Storage → Advanced → Allow unsafe save` 为 true 时显示；默认隐藏

### 5.5 PyInstaller Bundle 离线 Monaco

`bridge.py` 检测 `getattr(sys, 'frozen', False)` 时，build 期 step 把 `node_modules/monaco-editor/min/vs` 复制到 `gui-web/dist/monaco/`；
前端 `MonacoEditorPanel.tsx` 在 `import.meta.env.PROD` 时改用 `loader.config({ paths: { vs: '/monaco' } })`。
也保留 CDN 兜底：若 `/monaco/loader.js` 404，自动 fallback 到 `https://cdn.jsdelivr.net/npm/monaco-editor@<version>/min/vs`（不影响开发模式）。

---

## 6. Per-agent-type Tab 列表

> **重要**：本表为「目标态」。实施前必须先完成 §6.0 调研。

### 6.0 调研前置条件

必须先产出 `docs/superpowers/research/per-agent-config-keys.md`，内容包含：

| agentType | 所有顶层 / 常用配置 key | 优先级（高频=表单 tab / 低频=Storage tab 内） | 来源 |
|---|---|---|---|
| codex | 由调研产出 | … | https://github.com/openai/codex README |
| hermes | 由调研产出 | … | 本地 + https://hermes-agent.dev docs |
| opencode | 由调研产出 | … | https://opencode.ai/docs |
| mimocode | 由调研产出 | … | (若官网无文档，按 OpenCode 同 schema) |

调研输出**作为子 spec 单独 commit**。本 spec 的 §6.1 ~ §6.5 是「调研后会填的占位」。

### 6.1 Claude

Tabs：

```
Meta → Provider → Permissions → Hooks → Plugins → CLAUDE.md → MCP → Skills → Storage
```

（保留原顺序）

**变更**：
- Storage 替换为新版 §5
- Hooks 迁移到 `react-hook-form + zod`（schema：`HookConfigSchema`，数组元素 `matcher? + hooks: HookHandler[]`）
- Permissions 不变（保持 JSON 边角样板）

### 6.2 Codex（待调研更新）

预测 tabs：

```
Meta → Model & API → Rules(AGENTS.md) → [MCP] → [Skills] → Storage
```

- **Model & API**：表单字段 `{ model, model_provider, approval_policy, sandbox_mode, model_reasoning_effort, web_search, history.persistence, [model_providers.custom].{name,base_url,wire_api} }`，API key 单独从 `auth.json` 读 + 写
- **Rules**：`FileTextEditor` 复用
- **MCP**：仅在 `${configDir}/mcp_servers.toml` 存在时启用
- **Skills**：仅在 `${configDir}/skills/` 存在时启用（占位：列表式管理链接到 library）

### 6.3 Hermes（待调研更新）

预测 tabs（基于模板）：

```
Meta → Model & Env → Persona(SOUL.md) → Memory → Display → Storage
```

- **Model & Env**：`model.{default,provider,base_url,api_key}` + `terminal.{backend,cwd,timeout}`
- **Memory & Compression**：`memory.{memory_enabled,user_profile_enabled}` + `compression.{enabled,threshold}`（slider）
- **Display**：`display.{compact,streaming}`（toggle）

### 6.4 OpenCode（待调研更新）

预测 tabs：

```
Meta → Providers → Model → Instructions → Storage
```

- **Providers**：`provider` 字典编辑（增删改），每行：`{ npm, name, options.baseURL, options.apiKey, models }`。auth.json 单独管理。
- **Model**：从已配置 providers 的 models 里选默认值
- **Instructions**：`instructions: string[]` 列表式，每行可写 markdown snippet

### 6.5 MiMoCode（待调研更新）

按 OpenCode 同 schema 处理；MiMo provider 内置（无需添加）。

---

## 7. 后端（B）补充

### 7.1 新增 bridge 方法（python）

```py
# gui-web/bridge.py

def list_dir_tree(self, path: str, max_depth: int = 1) -> str:
    """递归返回目录树；max_depth 控制层级。

    Returns [
      {"path": "...", "type": "dir"|"file", "size": int?, "mtime": int (unix ms)?,
       "children": [ ... ]? }
    ]
    """
```

实现：Python 端 `os.scandir` 递归（max_depth 限制），过滤 `.` 开头的隐藏文件（在 `?show_hidden=true` 时显示），shell 调用 `stat -c '%s %Y'` 取大小和 mtime。

### 7.2 现有 bridge 不动

`read_file` / `save_file` / `find_files` / `browse_dir` / `list_dir` 都不动。

---

## 8. 测试

### 8.1 单元测试（vitest）

| 文件 | 覆盖 |
|---|---|
| `detail/storage/buildTreeFromFlatList.test.ts` | flat `string[]` → tree 转换 |
| `detail/storage/validateJson.test.ts` | good / bad / empty / non-JSON |
| `detail/storage/useOpenFile.test.tsx` | 模型挂载、错误状态、未保存拦截 |
| `pages/detail/schema.test.ts` | `tabsFor` 在每个 agentType 下返回正确顺序 |
| `pages/detail/codex/ModelEditor.test.tsx` | 表单加载、保存、`auth.json` 写入路径正确 |
| `pages/detail/opencode/ProvidersEditor.test.tsx` | 增删 provider、API key 写入 `auth.json` 而非 `opencode.jsonc` |

### 8.2 端到端（手测清单）

1. 进 Profiles → 选 Claude profile → 进 Detail
2. 点 Storage tab：真目录树渲染、点开子目录读取、选 JSON 文件用 Monaco 编辑、Ctrl+S 保存；保存 settings.json 后关闭并重开 tab，重新加载一致
3. 故意写坏 JSON → 点保存 → toast 报错，文件**未写入**
4. 退出 Detail 再进 Providers tab、Model&API tab、Memory tab：表单字段 round-trip 一致
5. 创建新 profile（不支持先打 TODO）：跳过

### 8.3 Build & Smoke

```bash
cd gui-web && npm run build            # 产出 dist/
cd gui-web && npm run test -- --run     # vitest exit 0
# 手测：python gui-web/bridge.py --url http://localhost:5174  (如主开发服务占 5173)
```

---

## 9. Roll-out 顺序（PR 拆解）

1. **PR 1: Schema 注册表 + Storage 重构**（不依赖调研产出）
   - `schema.ts` 落地
   - `StorageExplorer.tsx` 整体重写：FileTree + Monaco + 校验
   - `bridge.list_dir_tree` 后端接口
   - 涉及：Claude 的 Storage tab 升级
2. **PR 2: 调研产出**（独立 PR，doc-only）
   - `docs/superpowers/research/per-agent-config-keys.md`
3. **PR 3: Codex tabs** —— 等 PR 2
4. **PR 4: Hermes tabs** —— 等 PR 2
5. **PR 5: OpenCode tabs** —— 等 PR 2
6. **PR 6: MiMoCode tabs** —— 复用 OpenCode 组件

（PR 1 单独交付，PR 2 与 PR 3-6 解耦可以并行实施；PR 3-6 也可合并为一个 PR。）

---

## 10. Risks

| 风险 | 缓解 |
|---|---|
| Monaco Bundle 进 PyInstaller 后体积过大 | 使用 CDN loader，离线模式可配 fallback；预估离线资源 ~2MB，可接受 |
| `@monaco-editor/react` 在 WSL ↔ Windows 的 PyWebView render 异常 | 端到端手测；如有 fallback 走 textarea |
| Hooks/Plugins 的 zod schema 解析错误导致现有用户 config 失效 | 第一阶段 Hooks 只读模式（显示 + 手动导入 zod schema），后续才启用保存 |
| 多 Tab 模型占用内存 | 限制 5 个，超出 LRU 关闭最久未访问 |
| 调研产出 §6 与 spec 实际编码产生偏差 | 调研产出后回填 §6 章节；改动做成 §6 子模块的微改 PR，不影响主 spec |

---

## 11. Out of scope 显式说明

- 创建 Profile 流程（属于 Roadmap 一、阶段 第 4 条）
- Library 页 MCP / Skills 全局编辑（Roadmap 一、阶段 第 3 条）
- Provider 切换的快捷入口（在 header）：用户已确认**不在本轮加**
- 新建 Profile 模板选择器（Roadmap 一、阶段 第 4 条）
- Phase 2/3 的 CLI 补全、Creator Profile、Team 协作（Roadmap 二/三/四）


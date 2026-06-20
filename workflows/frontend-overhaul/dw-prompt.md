# Frontend Overhaul — DW 执行提示词

## 你是谁

你是 agent-box 项目的 DW (Decision Writer)，负责执行前端全面改造任务。

## 输入文件

1. **设计规范**：`docs/specs/frontend-overhaul.md` — 完整的改造方案
2. **现有代码**：`gui-redesign.py` — 1555 行的单文件 GUI
3. **设计知识**：`/home/maoqh/.agent-box/profiles/frontend-designer/dot-claude/docs/design/` — 设计原则和规范

## 输出目录

```
gui/
├── __init__.py
├── app.py
├── theme.py
├── tokens.py
├── components/
│   ├── __init__.py
│   ├── button.py
│   ├── card.py
│   ├── status.py
│   ├── toast.py
│   ├── divider.py
│   ├── input.py
│   ├── sidebar.py
│   └── markdown.py
├── pages/
│   ├── __init__.py
│   ├── home.py
│   ├── profiles.py
│   ├── detail.py
│   ├── sessions.py
│   ├── settings.py
│   └── help.py
├── state.py
└── wsl.py
```

## 执行原则

1. **渐进式改造** — 每个 task 完成后，应用必须能正常运行
2. **不破坏现有功能** — 所有现有功能必须保持工作
3. **遵循设计规范** — 严格按照 `frontend-overhaul.md` 执行
4. **代码质量** — 每个模块 < 200 行，清晰的职责分离
5. **测试验证** — 每个 phase 完成后运行验证

## 执行流程

### Phase 1: 架构重构（2-3 天）

按以下顺序执行：

1. **task-1.1-extract-theme** — 提取 Theme 类和设计 token 到 `gui/theme.py` + `gui/tokens.py`
2. **task-1.2-extract-wsl-state** — 提取 WSL 集成和 SQLite 操作到 `gui/wsl.py` + `gui/state.py`
3. **task-1.3-extract-components** — 提取组件到 `gui/components/`
4. **task-1.4-extract-pages** — 提取页面到 `gui/pages/`
5. **task-1.5-verify-imports** — 验证所有 import 正确，应用正常运行

### Phase 2: 视觉打磨（2-3 天）

1. **task-2.1-button-components** — 创建 `primary_button()`, `ghost_button()`, `danger_button()`
2. **task-2.2-card-components** — 创建 `Card`, `StatCard` 组件
3. **task-2.3-profile-row-redesign** — 重新设计 Profile 行
4. **task-2.4-tab-styling** — 改造 Tab 样式（底部指示条）
5. **task-2.5-empty-state** — 改造空状态（居中卡片 + CTA）
6. **task-2.6-color-tuning** — 微调色彩 token

### Phase 3: 交互优化（2-3 天）

1. **task-3.1-page-caching** — 实现页面缓存（消除导航闪烁）
2. **task-3.2-async-refresh** — 实现异步刷新
3. **task-3.3-sqlite-thread-safety** — 修复 SQLite 线程安全
4. **task-3.4-incremental-list-update** — 实现列表增量更新

### Phase 4: 功能补全（5-7 天）

1. **task-4.1-detail-page-meta** — Profile 详情页 Meta Tab
2. **task-4.2-detail-page-settings** — Profile 详情页 Settings Tab
3. **task-4.3-detail-page-claude-md** — Profile 详情页 CLAUDE.md Tab（内置编辑器）
4. **task-4.4-detail-page-other-tabs** — MCP/Skills/Hooks/Storage Tab
5. **task-4.5-creation-wizard** — 4 步 Profile 创建向导
6. **task-4.6-provider-selector** — Provider 切换组件

## 验证检查点

每个 Phase 完成后，执行以下验证：

```bash
# 1. 语法检查
python -m py_compile gui/app.py

# 2. 启动测试
python -c "from gui.app import main; print('Import OK')"

# 3. 功能测试（手动）
python gui/app.py
```

## 关键约束

1. **CustomTkinter 限制** — 不使用 PySide6，保持零额外依赖
2. **Windows + WSL** — 所有路径处理必须正确
3. **单入口** — `gui-redesign.py` 保持为入口文件，import gui.app
4. **向后兼容** — 旧的 `gui-windows.py` 不修改

## 参考资源

- 设计规范：`docs/specs/frontend-overhaul.md`
- 设计知识：`/home/maoqh/.agent-box/profiles/frontend-designer/dot-claude/docs/design/`
- 现有代码：`gui-redesign.py`
- 功能规范：`docs/specs/gui-redesign-p1.md`
- 视觉规范：`docs/specs/gui-redesign-p2.md`

# Frontend Overhaul Workflow

## 概述

agent-box GUI 全面改造 — 从 1555 行单文件到模块化架构 + 视觉打磨 + 交互优化 + 功能补全。

## 文件结构

```
workflows/frontend-overhaul/
├── README.md                    # 本文件
├── manifest.yaml                # Workflow 清单（Phase/Task 定义）
├── dw-prompt.md                 # DW 执行者提示词
├── phase-1-architecture.md      # Phase 1: 架构重构（详细脚本）
├── phase-2-visual.md            # Phase 2: 视觉打磨（详细脚本）
├── phase-3-interaction.md       # Phase 3: 交互优化（详细脚本）
└── phase-4-features.md          # Phase 4: 功能补全（详细脚本）
```

## 执行方式

### 方式 1：DW 执行者（推荐）

将 `dw-prompt.md` 作为 DW 的输入，让 DW 按照各 Phase 脚本逐步执行。

### 方式 2：手动执行

按以下顺序执行：

1. 阅读 `docs/specs/frontend-overhaul.md` 了解完整方案
2. 按 `phase-1-architecture.md` 执行架构重构
3. 按 `phase-2-visual.md` 执行视觉打磨
4. 按 `phase-3-interaction.md` 执行交互优化
5. 按 `phase-4-features.md` 执行功能补全

## Phase 概览

| Phase | 名称     | 天数 | 内容                     |
| ----- | -------- | ---- | ------------------------ |
| 1     | 架构重构 | 2-3  | 单文件 → 模块化目录      |
| 2     | 视觉打磨 | 2-3  | 组件化 + 样式改造        |
| 3     | 交互优化 | 2-3  | 消除闪烁 + 异步刷新      |
| 4     | 功能补全 | 5-7  | 详情页 + 向导 + Provider |

**总计：11-16 天**

## 验证检查点

每个 Phase 完成后：

```bash
# 语法检查
python -m py_compile gui/app.py

# Import 测试
python -c "from gui.app import AgentBoxApp; print('OK')"

# 启动测试（需要 Windows + WSL）
python gui-redesign.py
```

## 依赖关系

```
Phase 1 (架构)
    ↓
Phase 2 (视觉) ← Phase 3 (交互)
    ↓
Phase 4 (功能)
```

## 参考资源

- 设计规范：`docs/specs/frontend-overhaul.md`
- 设计知识：`/home/maoqh/.agent-box/profiles/frontend-designer/dot-claude/docs/design/`
- 功能规范：`docs/specs/gui-redesign-p1.md`
- 视觉规范：`docs/specs/gui-redesign-p2.md`

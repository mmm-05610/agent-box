# 迁移切片（Phase 1 审计）

> ⚠ 本阶段不实施任何重构；本文件只在事实审计达到足够程度后逐步形成
> 可独立验证的 vertical 切片。Round 1 仅占位。

## 切片原则

- 每个切片必须可独立验证（用户可观察的行为不回归）。
- 每个切片必须说明：范围、验证方式、依赖的决策。
- 切片排序由依赖关系决定（先裁决、后切片）。

## 候选切片草稿（未定稿）

| 切片 | 内容（草案） | 依赖 | 状态 |
|---|---|---|---|
| S0 | transport/连接健康层替换（boot:runtime-transport + boot:ws-health） | 无 | 草案 |
| S1 | workspace 列表查询替换（workspace:folder-list） | Q2 | 草案 |
| S2 | conversation 列表 + 状态通道（workspace:conversation-list + status-live） | Phase 4 事件审计 | 草案 |
| S3 | tab 恢复/保存迁移（tabs:restore + cross-client-sync） | Q1 | 草案 |

## 首轮结论

- 无足够证据形成最终切片；一切取决于 Q1/Q2 与 Phase 2/4 的裁决。
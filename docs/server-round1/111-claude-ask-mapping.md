# Work Order 111 — claude `ask → permissions.ask`（证据）

终态：`CLAUDE_ASK_MAPPING_DONE`。基线 `53583d7`（本树 `015c91c` 增补 write_paths
`src/agent_box/server/profiles/**` 并裁定 profiles 归 runtime 线）。

## 阶段 1 观测（复核）

- 修复点确认在 `src/agent_box/server/profiles/posture_translation.py:53` 的
  `translate_claude`。旧实现：`action=="ask"` 时 `allowed.extend(tools)`，即把该家的
  工具塞进 **`allowedTools`**（预审批集合）⇒ claude 侧 **不再提问**＝"不问"。这正是
  AQ-0005 争点。
- `posture_config.py`（order 85 的原生落盘路径）**独立**处理 ask：`_CLAUDE_WRITABLE_PATHS
  = ("permissions.ask", "permissions.deny")`，把 ask 工具写进 `permissions.ask`。它不消费
  `translate_claude` 的输出（`test_posture_config_write.py:79` 反而断言落盘文档里**没有**
  `allowedTools`/`disallowedTools`）。⇒ 本单修 `translate_claude` 不会与 85 的落盘相互影响。
- 全仓 grep：`translate_posture`/`translate_claude` 的**唯一**消费方是 `tests/**`
  （无生产调用方、无前端消费本翻译结果）。改返回形状安全。

## 阶段 2 修正 + 测试同步

- `translate_claude` 改为三桶：`allow→allowedTools`、`deny→disallowedTools`、
  `ask→ask`（claude `permissions.ask` 的提问语义）。`ask` 不再进 `allowedTools`。
- 返回 dict 新增 `ask` 键；`allowedTools`/`disallowedTools`/`notes` 形状保留。
- 其它档位（allow/deny）映射语义、其它家（codex）**零改动**；notes 文案由
  "its own approval round-trip" 改为 "permissions.ask (提问)"，如实反映新语义。
- 测试 `test_posture_translation.py`：旧断言 `assert "Bash" in translated["allowedTools"]`
  （注释 "ask = its own approval"）＝钉住旧（错）映射。**按工单 §52 改成新映射并写明理由，
  不放宽**：改为 `assert "Bash" in translated["ask"]` **且** `assert "Bash" not in
  translated["allowedTools"]`（既证明进了提问桶，又证明没被预审批吃掉）。

## 阶段 3 门与回归计数

- G1 映射：`ask` 翻出 `permissions.ask`（`translated["ask"]`）——新测试断言。
  反例（旧映射把 Bash 放进 allowedTools）现红：`Bash not in allowedTools` 断言。
- G2 测试：`python3 -m pytest -q tests/server/test_posture_translation.py
  tests/server/test_posture_config_write.py` → **36 passed**（含 85 的落盘回归，未受影响）。
- G3 不越界：`git diff --stat` 仅 `posture_translation.py` + `test_posture_translation.py`
  两个文件；其它家/前端/wire 零改动。
- 顺序：本单先于 `093` 落地——093 阶段 1 落盘前须核到本提交。

## §Spend 与清理

- 无真实模型调用、无凭据内容访问（R-0017 / R-0011）；纯 Python 逻辑修正 + 断言。
- 无临时工件残留。

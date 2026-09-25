# CP-H-QWEN · qwen Agent 接入包集成验收

C · 2026-09-22 · backend `integration/linux-native-0` **`d12aa9791464f1e8c0b680960dc1b126090d1beb`**（父 `fe67317b`，快进；工作树 clean；未 push/main）。H 源提交 `7a1b2699`（父 `27bf6c2`）按 H-036 停写，原树保留。C 在隔离树仅 cherry-pick 该枚，按 `approvals/P-QWEN-001-release.md` 的 9 路径集成。

## 内容与边界

- 新 `plugins/agent-box-harness-qwen/` 含真实声明、原生转换、生产装配和一份部署资产；旧 `agent_box_harnesses.qwen` 三模块为同对象薄别名。零新增 entry point，现有发现面不变。新旧 `loopback-guard.cjs` SHA-256 相同（`85ec7770…`）。
- H 的独立检查点 `harness/reports/CP-H-QWEN.md` 给出旧/新对象身份、零重复注册、模板字节钉、node 85/85 和插件门。C 复核插件/093：P-B 父 `1F/281P/3S`，qwen `1F/284P/3S`，同一失败 ID；三枚新边界钉通过。原始日志 `/tmp/qwen-codex-plugin.log` SHA-256 `511785c3…`。
- 旧包的 qwen 部署资产仍被 Git 跟踪；本批未批准删除。生产路径已指向新包资产，旧副本后续需消费方盘点，不能记作物理去重完成。

## 串行根门

用 CP-a3 同一沙箱、integration `.venv` Python 3.12、动态全部插件 `src`、无额外 PyYAML 路径，串行运行 `pytest tests/ -q -p no:cacheprovider -rf --tb=line`。父 P-B `35F/1399P/45S/2E`，本批 **`35F/1399P/45S/2E`**；FAILED＋ERROR ID 逐字相同，XFAIL/XPASS 均为 0。原始日志 `/tmp/qwen-codex-root.log` SHA-256 `cd6a8c53…`；摘录 `baseline/evidence/qwen-root-red-ids.txt`。既有环境红灯原样保留，不宣称全绿。

qwen 此格闭合。后续 Agent 家族须逐一候批、独立停写回执和同环境根门。

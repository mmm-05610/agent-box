# Kilo CLI 生产封装（Work Order 43 后续）

状态：**KILO_PRODUCTION_CHAIN_GATE_OK（假端点与 `--live` 真实模型门均 exit 0，
2026-09-16）**。用户在 W43 收尾后点名追加的一家。

## §1 接入卡（官方文档 + tarball/二进制只读探测 + 第一手 ACP 探测）

```
harness:            Kilo CLI `@kilocode/cli` 7.7.2（npm latest；bin kilo；
                    无 engines 字段；license MIT——package.json 字段 + tarball
                    LICENSE 双版权 "Kilo Code 2026 / opencode 2025"）
来源与许可:          GitHub Kilo-Org/kilocode；MIT；官方文档明示
                    "Kilo CLI is a fork of OpenCode and supports the same
                    configuration options"（同源实证：日志前缀 opencode、
                    kilo.json 兼容、捆绑 bwrap/沙箱助手）
安装与钉版:          独立 runtime-kilo 根 package-lock（6 条目：launcher +
                    @kilocode/cli-linux-x64-baseline 平台二进制包；launcher 的
                    postinstall 下载脚本 --ignore-scripts 永不执行，二进制由
                    平台包自带、启动器 findBinary 从 node_modules 解析）；
                    双构建摘要一致 sha256:62404c24…（2 包/437 条目/236 615 710
                    字节；AVX2 非基线变体被排除、kilo 等原生可执行发布为 0555）
入口形态:            ACP v1 stdio：`kilo acp`（官方子命令）；另有 kilo run
                    --format json、kilo serve HTTP、TUI（未采用）
配置入口:            **KILO_CONFIG_CONTENT** env 直接注入配置文档（探测验证，
                    免文件落地）；Kilo/OpenCode 双兼容 kilo.json；XDG 目录随
                    guest HOME 天然隔离（.config/kilo、.local/share/kilo）
凭据变量:            配置 options.apiKey = "{env:OPENAI_API_KEY}"（探测验证：
                    env 注入 + {env:} 替换 → 线上 Bearer 头精确匹配）；Kilo
                    账号 OAuth 非必需（authMethods 有 kilo-login，可跳过）
模型配置:            kilo 以 `provider/model` 寻址；本部署 provider=deepseek
                    （OpenAI 兼容）+ model=deepseek-flash；适配器 model 配置
                    选项播发并接受 deepseek/deepseek-flash（探测验证）
会话与续接:          XDG data 下 SQLite（kilo.db）；ACP session/list、
                    session/load、session/resume 全部实测可用（initialize 的
                    sessionCapabilities 为空对象——播发面与实际能力不一致，
                    桥按实际路径重开，门按 reopenMethod 记录：本轮实测
                    session/resume）
流式与终态:          session/update（agent_message_chunk 实测）；stopReason
                    end_turn；轮 1 实测 1 次后台 title/摘要调用（单列记录）
审批/附件:           官方有 requestPermission 规则面；本链未观测到运行时裁决
                    ⇒ 不声明 permissions；无附件面 ⇒ 不声明 attach
状态目录:            .config/kilo（配置）、.local/share/kilo（数据/会话，
                    state 投影仅此子树）、.cache/.state（不投影）
形态判定:            走 ACP 模板；适配器命令为原生二进制直连（`<artifact>/kilo
                    acp`），出网守卫经 LD_PRELOAD 到达二进制（claude 同款）
未知项:              (a) kilo 自带 bwrap 在我方 bwrap 内的嵌套行为未单独验证
                    （两轮门未触发其沙箱路径）；(b) --format json 事件 schema
                    未逐字段核验（未采用该通道）
```

## §2 注册表与能力声明

- `harnesses.toml` 新增 `[[harness]] driver="kilo"`（静态候选
  `[start, observe, finish, stream, native_continuation]`；attach/permissions/
  steer 不声明）；`capability_declarations.json` 同步；FAMILY_MATRIX 增加
  kilo 行，observed 五项以门证据回填。
- 注册胶水：AgentBox 自有 `kilo` profile（`permissionMode: "deny"`）；别名
  `AGENTBOX_MODEL_ALIASES.kilo = {"deepseek-flash": "deepseek/deepseek-flash"}`
  与 `production.py` 测试互锁。

## §3 生产模块与部署模板（非秘密）

- `src/agent_box_harnesses/kilo/production.py`：官方根 `https://api.deepseek.com`、
  产品模型 `deepseek-flash`、native 值 `deepseek/deepseek-flash`、
  `credentialEnvironment=OPENAI_API_KEY`、适配器命令=工件内原生二进制直连
  `kilo acp`、state 投影 `/runtime/home/.local/share/kilo`。
- `deploy/kilo/kilo.json`：OpenAI 兼容 provider（`{env:OPENAI_API_KEY}` 引用）、
  官方根、64-token 输出上限、autoupdate off。**不投影配置文件**：以
  `KILO_CONFIG_CONTENT` 环境值交付（探测验证通道）；loopback 变体仅替换
  `provider.deepseek.options.baseURL` 一个字段（documented_differences 断言）。
- `deploy/kilo/egress-guard.c`：评审过的仅-loopback 守卫（LD_PRELOAD）。

## §4 工件构建（双构建一致）

- `scripts/server-round1/build-kilo-runtime-artifact.mjs`：claude 构建器克隆 +
  kilo 结构事实（多可执行文件 0555 集合；AVX2 非基线变体排除；postinstall 永不
  运行的说明）。双构建摘要一致
  `sha256:62404c24d28e1de6a2efcf7f6cb4a3f7afa2598fd9c6691371fa8e698323ba18`
  （2 包 / 437 条目 / 236 615 710 字节）。
- 顺带修复：claude 构建器 main() 的 usage 行仍写着 dsh 文件名（生成时的漏改）。

## §5 生产门（假端点全链）

- `scripts/server-round1/kilo-production-chain-gate.py`：claude 门克隆，换
  OpenAI 协议假端点与 KILO_CONFIG_CONTENT 覆盖。**结果（2026-09-16，exit 0，
  `KILO_PRODUCTION_CHAIN_GATE_OK`，mode=loopback-fake-endpoint）**：
  - 主链两轮 completed（deltaSeq [4] < completedSeq 7、[11] < 14）、
    `checkpointNativeIdStable=true`、含 round2 标记的请求体带首轮上下文、
    checkpoint resumable（native session id 稳定）。
  - 模型选择：假端点收到 `model` 精确 `deepseek-flash`（/chat/completions）。
  - 未知模型：桥的模型可用性检查发包前拒绝（turn failed、0 provider 请求）。
  - 凭据：注入 token 恰到假端点（Bearer）、零未授权；events/报告/state 零命中
    （9 文件 920 445 字节）。
  - egress 守卫：guardLoaded=true；实测拦截 15 次 kilo 对厂商面的解析尝试
    （models.dev 目录、us.i.posthog.com 遥测、api.kilo.ai 云服务）——全部阻断、
    零接触，记为预期观测；其它目的地一律类型化失败。
  - 重开相位：`reopenMethod=session/resume`（记录法）、同 native id、
    第二轮请求带首轮上下文。
  - 清理：临时根/worker 投影/adapter 进程/gate token 全清。

## §6 真实模型门（--live，2026-09-16 执行）

- **结果：exit 0，`KILO_PRODUCTION_CHAIN_GATE_OK`（mode=live）——一次尝试即过。**
  官方 base URL（模板原样）、授权 locator 只读注入、不装载 guard。
- 两轮真实答复：次轮真模型召回 nonce（回答以 "K" 开头）；同 native id；
  `reopenMethod=session/resume` + 模型召回即上下文证据；未知模型发包前拒绝；
  授权 locator 未被删；凭据/state 零命中；清理干净。
- **费用分账**：live 尝试 1 次；确认真实请求 4 次（2 主链 + 2 重开）；tokens
  上界每请求 <1K → 估计费用 **< ¥0.01**。
- 机制证据（§5）与真实模型证据分账、不互替。

## §7 阻塞账

| harness | 卡在哪一步 | 命令 | 退出码 | 脱敏错误/现象 | 已排除的可能 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- |
| （暂无；首启 settings 归一化问题不存在于 kilo——配置走 env，文件由 harness 自持） | | | | | | |

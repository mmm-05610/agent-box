# Executive verdict

选择 **B. 独立 writable overlay + shared capability refs**，并把少量不可
避免的 Harness 兼容性差异限制在 `agent-box-harnesses` 插件的 driver 中。它
不是把 Agent-Box 变成 package、secret 或 sandbox 平台；它是把一次运行所需的
本地可写状态与可复用能力明确分开。

Preview 的默认策略应是：一个 Profile 一个独立可写 overlay；runtime binary、
经过版本钉住的 skill/plugin/MCP 定义和不可变 base config 通过只读或引用方式
提供；凭据只以 credential-source reference 交给运行时，绝不复制 value。默认
不共享 session、transcript、history、approval/trust state、local override、临时
目录和可写 cache。用户必须显式选择共享 MCP、skills、plugins 或 credential
source，且默认仅允许无 secret 的声明性资源。

不推荐 A 的“完整目录物理隔离”作为长期模型：它把 session state 和凭据这种
必须隔离的内容，与 MCP、插件源码、skills 这种应被版本化共享的内容混在一起，
造成复制、漂移和不可解释的 provenance。也不推荐 C 作为 Preview 默认：resource
级 policy 是未来兼容层的实现细节，若现在暴露给用户会放大认知与测试矩阵。
因此实现上采用 B，内部仅保留一个窄的 driver policy table；以后确有 Harness
不能使用 overlay 时再把它提升为受控的 C，而不是预先建一个 policy 子系统。

本设计不需要任何 Work Core 修改。Profile、MCP、Plugin、Skill、Credential、
Harness 都保持插件拥有的内容；Core 只看到既有的 Contract、Ref、frozen Binding、
Provider、Dispatch 和 ResourceObservation。

# Current Phase-1 implementation

本节是对 2026-08-28 仓库代码的只读检查，不把设计文档当成运行时事实。

`config.profile_dir(name)` 为每个 profile 分配
`$AGENT_BOX_HOME/profiles/<name>`。`profile.create()` 从 Harness template
复制至 `dot-<type>`，可复制 secondary data template；profile 元数据（名称、
agent type、provider/prompt reference）存于 Agent-Box SQLite。`launch` 读取
`agent_types.json`，以 `bwrap --bind` 将 profile config 覆盖到 Harness 原生
config 路径，并将每个项目层的 profile backing 覆盖到原生 project surface。

| Surface | Phase-1 行为 | 实际隔离判断 |
| --- | --- | --- |
| Harness config | `dot-claude`、`dot-codex`、`dot-hermes`、`dot-opencode` 独立可写 tree，挂到 `~/.claude`、`~/.codex`、`~/.hermes`、`~/.config/opencode` | 真正独立，但创建时是 template copy |
| OpenCode data | `dot-opencode-data` 可作为 `~/.local/share/opencode` 绑定 | 真正独立，但也是 template copy |
| Codex/Claude/Hermes session、history、native state | 在其 config home 内时随 tree 隔离 | 依赖 Harness 实际写入位置；不能保证所有 state 都在此处 |
| Profile local override、provider config、MCP apply、skills copy、prompt、hooks | 写进 profile-local config tree | 独立，但 MCP/provider/skill 是从 ACS 投影或复制而来 |
| Project config | `<project>/.agent-box/profiles/<profile>/root/...`，按父到子层挂载 `.claude`、`.codex`、`.mcp.json`、`AGENTS.md` 等 registry-declared surface | 真正独立、可写；原生 host 文件通常只是 mountpoint |
| Runtime binary | `shutil.which()` 从 host PATH 找 `claude`/`codex`/`hermes`/`opencode` | 共享、继承 |
| ACS library | `$AGENT_BOX_HOME/config/cc-switch.db` 和 skills source 只读查询；apply 后复制/转换到 profile | source 共享；产物复制 |
| Agent-Box DB 与 legacy session tracker | 全局 `$AGENT_BOX_HOME/agent-box.db` 和 history | 共享可写，不是 Harness state 隔离 |
| 环境、文件系统、网络 | `_clean_environment()` 基本继承环境；agent registry 绑定 `/`、共享 network，并仅 unshare IPC/PID/UTS | 不隔离；不是安全 sandbox |

因此“一 Profile 一目录”目前隔离的主要是 **配置 namespace 和位于该 namespace
内的状态**，并非完整运行环境。特别是 `--bind / /` 加 `--share-net` 意味着
进程仍可看见主机文件系统、继承非清除的环境变量、使用同一 binary 与网络。它
不应被叙述为 credentials、filesystem 或 network 的强隔离。

秘密风险集中在 template 与 apply 输出：Codex `auth.json`、Claude 登录状态、
OpenCode data/auth、provider settings 的 env/API key、MCP `env`/HTTP headers，及
可能从 host 环境继承的变量。复制这些文件会扩大 secret 副本；当前 ACS `server_config`
和 provider settings 也可能承载秘密。project-local settings 还可能记录 trust 或
approval。它们都不应进入 ProfileRef、Binding、event、digest payload 或 Evidence。

值得迁入官方插件的是：agent-type registry 的声明式 mapping、profile-local
projection、project surface planning、launch-plan construction、native session
adapter、以及“有效配置的非秘密 manifest”。不应迁入的是：ACS/cc-switch 的
SQLite schema 与 GUI library、legacy profile CRUD/session cleanup、按 Harness 的
文本写入策略、整目录 template copy、以 `/` bind 为安全声明、以及旧 REPL/GUI
控制平面。它们要么是历史应用功能，要么不是新的 Provider vertical slice 所需
的最小 authority。

# Isolation dimensions

下表的术语：**isolated** 是每 Profile/Execution 独立可写；**copied** 是产生
独立副本；**inherited** 是按 Harness precedence 读取；**shared read-only** 是
同一版本内容仅供读；**referenced** 是只保存/传递 identity，值由外部 authority
在运行时供应；**shared writable** 是多运行可共同改写，应尽量避免。

| 维度 | Preview 默认 | 原因 |
| --- | --- | --- |
| session、transcript、history、native lifecycle | isolated | continuation、审计和并发不可串线 |
| local config override、approval/trust、hooks 的运行时状态 | isolated | 权限决定绝不可跨 profile 泄漏 |
| temp、PID/socket、runtime process state | execution-scoped isolated | 生命周期与 crash recovery 明确 |
| writable cache | isolated（必要时 execution-copy） | cache 常混入 prompt、token 或 auth 衍生物 |
| immutable base config | shared read-only + revision digest | 无需复制，方便复现 |
| MCP definition | referenced；materialize 为每 execution 的无 secret config | definition 可复用，connection/OAuth state 不可共写 |
| plugin/skill source | shared read-only、version-pinned | 避免副本漂移；不可执行的 source 不必复制 |
| runtime binary | shared referenced + version/fingerprint | 安装不是 Profile 职责 |
| credential source | referenced only | 只让 Harness/OS keyring 读取 secret |
| workspace | 独立 Worktree/Workspace Ref | Profile 不拥有项目内容 |
| environment | allowlisted inherited values；secret 为 reference injection | 不能 dump 整个 host env |
| filesystem/network | Harness/sandbox capability 的明确声明 | 不能由 Profile 隔离假装保证 |

# Comparable product landscape

选择了五个活跃且直接可借鉴的项目：Claude Code、OpenAI Codex CLI、OpenCode、
Pi Coding Agent、Nix/Home Manager。前四者是实际 Coding Harness，最后一个不是
Harness，但其 immutable store + profile generation 精确说明了为什么“共享内容应
以不可变 identity 引用，而不是复制”。

共同信号很一致：Claude Code、Codex、OpenCode 与 Pi 都有 global/project/runtime
层或可重定向 config directory；它们将 project 覆盖与个人状态分开。没有一个
把“独立 profile”定义为安全地复制所有 credentials、plugin cache、MCP OAuth 和
session state。Claude 甚至将 marketplace plugin 复制到其**一个用户缓存**作为
安全/验证行为；这说明 copy 是特定供应链策略，不是 profile isolation 原则。

# Product-by-product findings

## Claude Code

[Claude Code settings](https://code.claude.com/docs/en/settings) 定义 managed、
user、project、local scope，并支持 `CLAUDE_CONFIG_DIR` 重定向配置、session history
和 plugins。project/local settings、MCP 和 plugins 都有明确 scope 与 precedence；
[MCP 文档](https://code.claude.com/docs/en/mcp) 还区分个人 local、版本控制 project
和 user scope。Marketplace plugin 在用户 cache 中复制是供应链验证措施，而非把
每个 project 克隆一份 plugin。

| 面 | 处理 |
| --- | --- |
| binary/runtime、process、network/filesystem | inherited/由 Claude sandbox 与 OS policy 决定；非 profile copy |
| config/model/provider | user + project + local + managed，继承并覆盖 |
| session/history/trust | user config directory 中可写；`CLAUDE_CONFIG_DIR` 可整体重定向 |
| MCP | user/local/project/managed scope；definition 可共享，local state 仍在 user state |
| plugins/skills/commands/hooks | user/project/local/managed scope；marketplace cache copied 到 user cache |
| credentials/secrets | 登录状态在 user state；MCP env 可含 secret，必须避免 commit/copy |
| workspace/environment | project files inherited；变量可用于 MCP server，不构成 secret isolation |

借鉴：采用 scope、precedence、project trust，而不是目录全复制；但 Agent-Box
不应复制 Claude 的完整 settings semantics 或插件市场。

## Codex CLI

OpenAI Codex 的当前源码显示 config stack 是 managed/system/user
`${CODEX_HOME}/config.toml`、selected profile `${CODEX_HOME}/<name>.config.toml`、
cwd/repo `.codex/config.toml` 和 runtime flags 的组合，见
[loader](https://github.com/openai/codex/blob/main/codex-rs/config/src/loader/mod.rs)。
`CODEX_HOME` 是 state 根，包含 logs、history、SQLite 等；源码还明确说明 MCP
OAuth credential store 可用 OS keyring，fallback file 在 `CODEX_HOME`，见
[config implementation](https://github.com/openai/codex/blob/main/codex-rs/core/src/config/mod.rs)。

| 面 | 处理 |
| --- | --- |
| binary/runtime | shared/inherited PATH 或安装来源 |
| config/model/provider | user + named profile + project/repo + runtime layers |
| session/history/log/state | `CODEX_HOME` 可整体重定向；isolated 的正确粒度是 state home |
| MCP | config-layer defined；OAuth state follows Codex home/keyring |
| plugins/skills | config/project discovery；版本与缓存由 Codex 管理，非 profile copy 要求 |
| credentials/secrets | keyring preferred、file fallback；reference/keyring 最适合 Agent-Box |
| workspace/environment/process/network | project config inherited；sandbox policy 另行配置，不由 named profile 保证 |

借鉴：Codex 的 profile 是 configuration overlay，不是独立完整 home；`CODEX_HOME`
适合用作 Profile writable state root，且 credential store 应与其分离或引用 OS
keyring。

## OpenCode

[OpenCode config](https://opencode.ai/docs/config/) 使用 remote/global/custom/
project/`.opencode`/inline/managed 层并合并配置；`OPENCODE_CONFIG` 与
`OPENCODE_CONFIG_DIR` 允许把配置或资源目录显式投影。其
[plugins](https://opencode.ai/v2/docs/plugins) 支持 global/project directories、
package 与 local path，且按 precedence 累加；[skills](https://opencode.ai/docs/skills)
同时发现 project 与 global skill paths；MCP 在 `mcp.servers` 下声明。

| 面 | 处理 |
| --- | --- |
| binary/runtime | shared/inherited |
| config/model/provider | merged remote/global/custom/project/managed layers |
| session/transcript/cache | Harness-owned；公开 config scope 不等同这些 state 的隔离 |
| MCP | config declaration inherited/merged；server process state 不应共享 |
| plugins/skills/commands | global + project + custom-dir discovery，shared/reference-friendly |
| credentials/secrets | provider/MCP config 可能携带；应 external reference，不应复制 |
| workspace/environment | project config inherited；custom dirs/env 是显式 projection |

借鉴：它最直接支持“base + custom directory + project overlay”，因此 OpenCode
driver 应优先支持 capability refs 的投影，而非制作整份 `~/.config/opencode` clone。

## Pi Coding Agent

[Pi settings](https://pi.dev/docs/latest/settings) 合并 global `~/.pi/agent`
与 project `.pi/settings.json`，并允许 package、extension、skill、prompt 的路径
或 package reference；[usage](https://pi.dev/docs/latest/usage) 显示 `--session-dir`
和自动 session storage，且有 project trust；[SDK](https://pi.dev/docs/latest/sdk)
明确 `agentDir` 同时包含 settings、auth、sessions、global resources。

| 面 | 处理 |
| --- | --- |
| binary/runtime | shared/inherited |
| config/model/auth | global `agentDir` + project override；custom agentDir 可隔离 |
| session/history | global sessions 或 explicit `--session-dir`，适合 execution-specific directory |
| extensions/skills/prompts | global/project paths 或 package refs，可 shared read-only |
| credential source | `auth.json` 位于 agentDir；应拆到 secret reference，而非共享目录 |
| workspace/environment | cwd/ancestor/project discovery；project trust gate |
| process/filesystem/network | unsupported/由外部 container/sandbox 决定 |

借鉴：Pi 的 `agentDir` 与 `sessionDir` 可分别指定，是 Profile writable overlay
加 execution-local session materialization 的理想 driver 形状。

## Nix / Home Manager

[Nix profiles/generations](https://wiki.nixos.org/wiki/Generation) 将 profile
表示为指向 generation 的链接；[Home Manager](https://wiki.nixos.org/wiki/Home_Manager)
以声明生成 dotfile，source 可链接到 immutable `/nix/store`。它不是 Harness 或
secret manager，故不应照搬其语言、store 或 evaluator。

| 面 | 处理 |
| --- | --- |
| binary/base/package/source | shared read-only、content-addressed/immutable |
| user profile generation | selected reference，原子切换/可回滚 |
| mutable state/session/credentials/cache | 不由 immutable store 解决，需另行 owner |
| workspace/process/network | unsupported |

借鉴：ProfileRef 必须有稳定 identity 与 content/effective digest；共享 capability
应像 generation/source 一样版本固定，不能在每个 profile 复制后悄悄漂移。

# Comparison matrix

| 准则 | A Full directory | B Layered profile | C Policy hybrid |
| --- | --- | --- |
| 用户理解成本 | 表面低，例外越来越多 | 中等，模型清楚 | 高，需要懂每类 policy |
| 实现复杂度 | 初期低、兼容修补高 | 中等、边界可测 | 最高，组合爆炸 |
| Harness 兼容性 | 高（home override 即可） | 高，driver 做小型 projection | 最高但代价大 |
| 配置污染 | profile 内低；host/env 仍高 | local 写层低，shared source 不可写 | 取决于 policy，易误配 |
| 并发/continuation | copy 容易混入 session/lock | execution state 单独，最佳 | 可做最佳但难验证 |
| secret 安全 | 最差，副本膨胀 | 最好，source reference | 可好但误配面大 |
| shared drift | 最差 | 版本 ref/digest 可控 | 可控但用户负担高 |
| Binding exactness/Evidence | 目录 hash 易含 secret/噪声 | 精确 manifest、无 secret | 理论最佳、实现最复杂 |
| Preview 可交付性 | 快但会固化包袱 | 最佳平衡 | 不适合 |
| 从一期迁移 | 最小 | 中等，保留 projection adapter | 最大 |
| 后续扩展 | 差 | 好 | 好但过度设计 |

# Full directory isolation

A 适合作为少数 Harness 的**兼容 fallback**：若该 Harness 只能以一个可重定向
home 工作，driver 可以为 Profile materialize 一棵独立 root。但它不得成为
“复制 host home”的算法：只能由受控 template/base revision 生成，credentials、
cache、sessions 不能从其他 Profile 导入。

它的优点是老 Harness 立即可运行；缺点是每次 plugin/skill/MCP 修改产生隐性副本，
升级与撤销不透明，并使 effective-config hash 很容易把 auth、history、cache 混入。
Phase-1 的代码只应保留为这个 fallback adapter 和 project-surface projection 的
参考，而不是官方插件的存储模型。

# Layered profile isolation

B 将“完整逻辑隔离”定义为：`profile-local writable overlay + immutable/shared
capability references + execution-scoped materialization`。profile-local overlay 有
自己的 metadata、local override、trust/approval、native state root；base config 和
capability source 是不可变 revision；driver 在启动时生成 Harness 所需的最小有效
config 到 execution directory 或 bind mount view。

这与 Claude 的 scope、Codex 的 config stack、OpenCode 的 custom-directory 与 Pi
的 agent/session directory 均一致。共享不是隐式地读用户 home，而是一个已选中的
capability Ref；运行时读取的 source revision、投影规则和 resulting effective
manifest 均可审计。

# Policy-based hybrid isolation

C 允许 capability declaration 指定 `isolated`、`shared-readonly`、
`shared-reference`、`execution-copy` 或 `inherited`。这在内部有价值：例如 Codex
MCP OAuth token 必须 reference/keyring，Pi sessionDir 必须 isolated，某些
Harness 不支持 config include 时需要 execution-copy。

但 Preview 不应将此作为用户面 API，也不要创建 Core 的 policy entity。插件可把
policy 固定在每个 driver 的受支持 materializer 列表中；只有两种以上真实用户
可选方案、且其安全语义不同、并有完整 tests/evidence 后，才以 plugin-owned
config 暴露少量枚举。用户不应为每个文件决定 copy 或 symlink。

# Security and credential analysis

Credential source 与 secret material 必须区分。source 可以是 OS keyring item、
已有 auth file 的受控 path、环境注入器或本地 credential broker；它的 Ref 只含
provider/kind/stable opaque identifier/rotation-safe revision indicator，不能含 token、
header、cookie、file content、绝对 secret path 或可逆 hash。不能证明 content 的
digest 时，记录 `secret_present=true` 和 source kind/version capability，而不是
伪造 secret digest。

执行 materializer 从 source 直接将 secret 注入子进程环境、匿名 file descriptor
或 execution-private file（0600），并把该 file 排除在 config manifest、artifact
收集、日志与 cleanup 之外。MCP OAuth state、approval/trust、browser session、
token cache 都默认为 profile/execution-private；永不 shared writable。若 Harness
只能把 secret 写入其 home，该 home 也必须为 writable overlay，不能是 shared base。

现有 Phase-1 bwrap 不能提供此保证：它绑定 host `/` 且共享网络。官方插件应把它
报告为 `filesystem_isolation=degraded`、`network_control=none/delegated`，而不是
升级安全主张。强 sandbox 是独立后续授权，不属于此设计。

# MCP/plugin/skill sharing analysis

默认共享的不是“运行过的 MCP server”或“已安装 plugin cache”，而是**可验证的
definition/source**：MCP command/url schema（无 secret）、plugin/skill package
source 加版本/commit/digest、immutable base config。每次 execution 都独立创建
MCP server process、OAuth/session state、plugin writable data 和 crash artifacts。

必须显式选择共享的资源包括：有权限副作用的 MCP、可执行 plugin/skill、可改变
prompt 或 tool set 的 hook/command、credential source、任何可写缓存、以及 project
local configuration。默认禁止把 capability source 指向可变工作目录；允许时应
标记为 mutable、在 Binding 冻结 content digest，且 Preview 可以直接拒绝。

绝不能默认共享：auth files、OAuth browser state、session/transcript/history、
approval/trust state、plugin data dirs、MCP process/socket、tmp、runtime locks、
writable model/cache database。绝不应该被物理复制：secret value、credential
file、active session history、plugin cache/state；immutable skill/plugin/base config
也不该复制，应以版本固定 source materialize 或只读 mount。

# Binding and Ref implications

`ProfileRef` 应指向 Profile 的长期、用户可见的 stable id（可读 name 仅作 display），
并携带 plugin-owned provider identity；不能仅指向路径。Binding 应冻结**组合**：
stable Profile id、Profile revision（编辑序号或 immutable snapshot id）、
effective non-secret config digest、driver id/version、runtime binary fingerprint，
以及被选中 capability refs 的 identity/revision/digest。名称本身不是 exactness，
digest 本身也不是可解释 identity。

共享 MCP/plugin/skill/credential source 应作为独立 Binding inputs，而非藏在
ProfileRef 内：它们是独立 authority，能独立显示、复核和观察。为避免 UI 过载，
用户可只选择 Profile；Profile ResourceProvider 在 resolve 时展开它的 declaration
为多个 internally prepared frozen inputs。Core 仍只接收普通 Contract/Ref，不需要
理解它们的类型。credential input 是 opaque source reference，不能暴露 value。

Profile ResourceProvider 的 resolved object 是 plugin-private 的
`ResolvedHarnessProfile`：stable profile identity/revision、harness driver selector、
execution-private writable-root plan、non-secret effective-config manifest/digest、
capability resolution table、credential injection handles（不可序列化）、和 policy
summary。它不返回完整 config bytes、token、host environment 或 live session。

Profile 更新后，已冻结 Execution 必须使用 dispatch 时的 immutable materialized
snapshot 或按 frozen refs 再 materialize，不能静默读取最新 profile。若 source 已
丢失，driver 应在启动前拒绝，并以 observation/evidence 说明 `materialization
unavailable`；绝不能以最新内容替代旧 exact configuration。

continuation 的 SessionRef 与 Profile revision 不一致时：同 profile revision、同
driver/runtime compatibility 且 driver 证明可 resume，才允许 native continuation；
否则创建新的 native session/Execution attempt，传递旧 SessionRef 仅作 provenance
或 context input，并记录 `continuation_mode=new_session_due_to_profile_revision`。
不得将旧 native session 在新配置下误标为 exact resume。

# Recommended profile model

Profile declaration 只保存：稳定 id、driver kind、base-config ref、local overlay
revision、显式 capability selections、非秘密 model/permission preference 与
credential-source alias。每次 Dispatch：

1. resolve declaration 与 selected capability refs；
2. 在 execution-private root materialize effective view；
3. 建立 native Harness process/session；
4. 产出 SessionRef 和 non-secret runtime manifest ArtifactRef；
5. 用 ResourceObservation 记录可验证事实。

默认 resource placement：session/transcript/history/local config override/temp/PID/
socket/writable cache 都 isolated；base config、runtime binary、skill/plugin source
shared read-only/referenced；MCP definition referenced；credential source referenced；
workspace 由 Workspace Provider 独立治理。Codex、OpenCode、Pi 需要不同 driver
strategy：Codex 优先 `CODEX_HOME` + native selected config profile；OpenCode 优先
`OPENCODE_CONFIG`/`OPENCODE_CONFIG_DIR` 加 private data root；Pi 优先 private
`agentDir` 与 explicit `--session-dir`，但 skills/extensions 可以 package/path ref。
Hermes 未完成其完整 config/data inventory 前只应作为实验性 full-home fallback，
不应承诺与前三者相同的分层能力。

# Exact plugin-owned contracts

不新增 Core entity。Preview 可由 `agent-box-harnesses` 声明少量 plugin-owned
frozen contracts，例如：

* `agent-box.harness-profile@1`：Profile selector resolved to stable id/revision and
  non-secret effective digest；
* `agent-box.harness-capability@1`：MCP/plugin/skill/base source 的 kind、opaque id、
  immutable revision/digest、projection mode；
* `agent-box.credential-source@1`：opaque credential authority selector，禁止 value、
  secret path、header/token；
* `agent-box.harness-runtime@1`：driver/binary fingerprint 与 materialization policy
  summary，非运行日志。

这些 Contract 是可选的 provider inputs，不是 Core schema。一个
InteractiveHarnessExecutionProvider 声明自己接受哪些 Contract，并在 `start()`
消费 `ResolvedHarnessProfile` 及已冻结 capabilities。资源提供者必须只在 resolve/
materialize 时接触 secret authority；其 `make_ref()` 只建立非秘密选择。

# Runtime materialization design

driver 为一次 execution 建立 private root，优先采用：只读 base/capability source
mount 或读取、private overlay、private session dir、private temp/runtime dir、受控
env allowlist、credential injection。若 native Harness 不能接受多个目录，driver
可以合成一个 execution-home；合成内容来自 immutable refs + private overlay，绝不
从其他 profile 的 mutable home copy。

runtime manifest 是 provider-owned ArtifactRef 指向的 redacted JSON，至少包含：
profile stable id/revision、effective digest、driver/version、binary path/version or
fingerprint、workspace ref、capability refs/revisions/digests、mount/projection modes、
session storage path class（不含敏感绝对路径）、environment allowlist names、secret
injection count/kind、filesystem/network enforcement summary、start timestamp。它不
含 config text、credential values、headers、full environment、session transcript 或
private filesystem path。

# Observation and evidence design

`ResourceObservation` 可以诚实证明：某 profile/capability ref 被解析；哪一个
base/plugin/skill/MCP definition revision 被 materialize；manifest digest 是否匹配
frozen Binding；private session directory 是否创建；driver/binary fingerprint；native
session id 是否建立；以及 sandbox/network capability 实际是 `degraded` 还是
enforced。Evidence 的 ArtifactRef metadata 只包含定位和 non-secret digest。

它不能证明：secret 正确性、MCP remote server 实际权限、plugin 没有外泄、host
filesystem/network 被完整限制、模型真实消费了全部 skill 内容、或 native transcript
语义。需要分别标 `reported`、`observed`、`unavailable`，不能把 materialization
成功升级为 security proof。

# Migration from Phase 1

保留约 30% 的一期隔离代码：agent-type registry 的路径/launch metadata、project
surface discovery 与 ordered mount planning、bwrap argv builder（但修正 capability
标注）、template parsing 和每个 Harness 的兼容知识。不要逐行迁移其 profile
repository、legacy DB/session lifecycle、ACS integration、GUI/REPL command、apply
文本写入器或全目录 copy workflow。

迁移路径：先让现有 profile tree 作为 `legacy-full-home` base source，生成
non-secret inventory/digest，永不读取/导出 auth；随后把 skills/plugins/MCP
definitions 抽为 versioned sources，最后把 session/data/cache 移到 execution root。
迁移期间发现不可分离的 secret/state 就保持 full-home fallback 并标明限制，不做
危险的自动拆分。

# Preview-sized implementation

Preview 只支持 Codex、OpenCode、Pi 三个 driver，且只允许一个 Profile input、
一个 Workspace input、零或多个只读 skill/plugin/MCP definition inputs、零或一个
opaque credential-source input。首先实现：profile resolver、redacted manifest、
execution-private dirs、Codex `CODEX_HOME`、OpenCode config/data projection、Pi
agent/session dirs、SessionRef、materialization observations。

不做 capability marketplace、profile editor、package installer、secret storage、
remote resolver、generic sandbox、跨 Harness session migration、Hermes production
support、或用户可编辑的全面 policy matrix。MCP 先只支持无 secret 的 stdio/remote
definition；OAuth/secret MCP 留作明确的 credential injection vertical slice。

# What not to migrate

* ACS/cc-switch 数据库及其 providers/MCP/skills/prompts GUI 语义；
* 旧 profile SQLite CRUD、REPL `use/apply/remove`、GUI 页面和 history cleanup；
* 将 provider auth/MCP headers 写到可复制 profile tree 的策略；
* 全量 `HOME`/`/` bind 被称为安全隔离的说法；
* host 全环境继承、全目录 template copy、plugin cache copy；
* Harness-specific config text parser 作为 Core 行为；
* session supervisor、workflow/scheduler、secrets manager、package manager。

# Risks and unresolved questions

1. Codex、OpenCode、Pi 的 state path 与 config precedence 会随 release 改变；每个
   driver 必须有 version probe 和证据测试，而不能假设一条目录规则永久成立。
2. MCP definition 本身可能含秘密（header、URL query、env）；需要严格 schema
   validation，Preview 应拒绝，而不是 redaction 后继续执行。
3. 可执行 skills/plugins 是 supply-chain 与权限边界；digest 可提供 provenance，
   不能提供安全认证。
4. 某些 Harness 将 trust/approval/session state 混入单一 home，可能迫使 private
   execution-home；这仍是 B 的 materialization，而不是恢复 host-home copying。
5. 精确重放依赖 source retention。应定义 snapshot retention 与“source missing
   时拒绝”的产品行为，但不要让 Core 承担 artifact/archive 服务。
6. bwrap 当前并非强隔离。若 Preview UI 暗示 workspace-only write 或 network deny，
   必须先获得独立安全实现与测试。

# Final recommendation

采用 **B：独立 writable overlay + shared capability refs**。Preview 默认隔离
session/transcript/history、local overrides、approval/trust、temp/process state 和
writable cache；共享/引用 immutable base config、runtime binary、version-pinned
MCP/plugin/skill source，以及 opaque credential source。MCP、plugin、skill、
credential sharing 必须用户显式选择；auth/OAuth state、secret value、session state、
plugin data、writable cache 永不默认共享；secret 和 immutable capability source 都
不应被物理复制。

Codex 用 `CODEX_HOME`/native config-profile 组合，OpenCode 用 config/custom-dir 与
private data root，Pi 用 private agent/session dirs；Hermes 暂不承诺分层，保留受控
full-home fallback。第一期完整目录隔离只保留其 projection/mount compatibility
能力，不保留其“完整 copy 是安全隔离”的模型。所提设计完全可由 plugin-owned
Contract、Ref、Binding input、ResourceProvider、resolved value、runtime manifest 和
ResourceObservation 实现，**不需要任何 Work Core 修改**。

研究资料访问日期：2026-08-28。主要一手来源包括 [Claude Code settings](https://code.claude.com/docs/en/settings)、[Claude MCP](https://code.claude.com/docs/en/mcp)、[Codex config loader](https://github.com/openai/codex/blob/main/codex-rs/config/src/loader/mod.rs)、[Codex credential/state source](https://github.com/openai/codex/blob/main/codex-rs/core/src/config/mod.rs)、[OpenCode config](https://opencode.ai/docs/config/)、[OpenCode plugins](https://opencode.ai/v2/docs/plugins)、[Pi settings](https://pi.dev/docs/latest/settings)、[Pi SDK directories](https://pi.dev/docs/latest/sdk)、以及 [Nix profiles](https://wiki.nixos.org/wiki/Generation)。

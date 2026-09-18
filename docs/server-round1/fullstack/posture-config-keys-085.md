# 085 阶段 1：逐家钉死设置键（只写证据，不写代码）

基线 `4c32992`。本阶段**未改任何实现文件**；全部一手观测都在**隔离配置目录**里跑，
凭据一律未装载（两家探针都**不读**用户真实的 `~/.codex` / `~/.claude`）。

- claude：`CLAUDE_CONFIG_DIR=/tmp/085claude-config`、`HOME=/tmp/085claude-proj`
- codex：`CODEX_HOME=/tmp/085cx147`

## 0 被钉的是哪个二进制（版本一致性是本单的地基）

| 家 | 钉死版本 | 一手定位 |
| --- | --- | --- |
| claude | CLI **2.1.270**（Claude Code），SDK `@anthropic-ai/claude-agent-sdk` **0.3.270**，ACP 适配器 **0.77.0** | `plugins/agent-box-harnesses/runtime-claude/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude --version` → `2.1.270 (Claude Code)`；`doctor` 的 `Running: npm-global (2.1.270)`、`Commit: 97ecbf7abeb4` |
| codex | CLI **0.147.0** | `runtime/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex --version` → `codex-cli 0.147.0`；与 `scripts/server-round1/build-codex-runtime-artifact.mjs:81` 的 `CODEX_CLI_VERSION = "0.147.0"` 一致 |

**为什么要写这一节**：宿主上另装有 `codex-cli 0.154.0`（`~/.npm-global`），它**已经收紧了取值**。
用系统安装当依据会把一个"本部署版本接受"的键判成"未知键"。全部钉键观测因此**只用仓内钉死工件**。

| 取值 | 0.147.0（本部署钉死） | 0.154.0（宿主另有） |
| --- | --- | --- |
| `approval_policy = "untrusted"` | **接受** ⇒ `approval policy UnlessTrusted` | **拒绝**（配置加载失败） |

⇒ 版本漂移是一条**事实**，不是缺陷。写入实现必须对着 0.147.0 的词汇表，且**不得**把 0.154.0 的收紧当成"更安全的默认"偷偷扩大写入面。

## 1 两家的零成本效果 oracle（这是本阶段真正的产出）

钉键要的 not 是"文档这么写"，而是"**写进去之后能在不改代码、不花模型调用的前提下看到它生效**"。

### 1.1 claude：`claude doctor` 的 `Invalid settings` 段

`doctor` 会读设置文件且**不弹信任提示**（`--help`：*"Reads settings files in the current directory without a trust prompt"*），
无需凭据、零模型调用。它对**已钉键的坏值**给类型化错误（带路径 + 期望集合 + 建议），对**未知键静默容忍**：

| 写入 | doctor 输出（逐字） |
| --- | --- |
| `permissions.defaultMode = "not-a-mode"` | `permissions.defaultMode: Invalid value. Expected one of: "acceptEdits", "auto", "bypassPermissions", "default", "dontAsk", "plan"` + `Suggested fix: Valid modes: …` |
| `permissions.allow = "Bash"`（不是数组） | `permissions.allow: Expected array, but received undefined` + `Suggested fix: Permission rules must be in an array. Format: ["Tool(specifier)"]. Examples: ["Bash(npm run build)", "Edit(docs/**)", "Read(~/.zshrc)"]. Use * for wildcards.` |
| `permissions.deny = [123]` | `permissions.deny: Non-string value in deny array was removed`（**清洗而非拒绝**） |
| `permissions.ask = "Bash"` | `permissions.ask: Expected array, but received undefined` |
| `permissions.additionalDirectories = "/tmp"` | `permissions.additionalDirectories: Expected array, but received undefined` + `Must be an array of directory paths…` |
| `{"totallyBogusKey":{...}}` | **无输出**（容忍） |
| `{"allowedTools":[…],"disallowedTools":[…]}`（顶层） | **无输出**（容忍）⇒ **不能据此认定它是真键**，见 §2.3 |
| `permissions.allow/ask/deny` 合法规则串 | **无输出**（接受） |

⇒ claude 的 oracle **能咬形状与取值**，但**咬不到未知键**。所以工单 G3（"未知键 ⇒ 类型化拒绝"）的牙**只能长在我们自己的写入器里**，不能外包给 harness。

### 1.2 codex：`doctor` 判形状 + `debug prompt-input` 回显**已解析**的取值

- `codex doctor`：坏枚举 ⇒ `config could not be loaded` + `failed to load Codex config`（**硬失败**，但**不打印**具体是哪个键/期望什么——serde 的 "expected one of" 列表是运行时拼的，`strings` 里没有）。未知键 ⇒ `config.toml parse ok`（**容忍**，同 claude）。
- **`codex debug prompt-input '<text>'`** 才是本单要的效果 oracle：它把**已解析**的配置渲染进模型可见提示并原样回显，**零模型调用**：

```text
sandbox_mode = "read-only"          => "`sandbox_mode` is `read-only`: The sandbox on…"
sandbox_mode = "workspace-write"    => "`sandbox_mode` is `workspace-write`: The sand…" + "Network access is restricted."
sandbox_mode = "danger-full-access" => "`sandbox_mode` is `danger-full-access`: No fi…"
approval_policy = "never"           => "Approval policy is currently never."
```

**这条推翻了我在阶段 1 中途的一个结论**：`doctor` 分不开 `read-only` 与 `workspace-write`（两者都报 `restricted fs + restricted network`），
`prompt-input` **分得开**——它直接印出解析后的枚举名。取值矩阵因此是**三档全可观测**。

`doctor` 那侧的可观测面（保留，因为它更便宜且能判形状）：

| 键 | 值 | `doctor` 的 `sandbox` 行 |
| --- | --- | --- |
| `sandbox_mode` | `read-only` | `restricted fs + restricted network` |
| `sandbox_mode` | `workspace-write` | `restricted fs + restricted network`（**与上一行不可分**） |
| `sandbox_mode` | `danger-full-access` | `unrestricted fs + enabled network`（**可分**） |
| `approval_policy` | `untrusted` | `approval policy UnlessTrusted` |
| `approval_policy` | `on-request` | `approval policy OnRequest` |
| `approval_policy` | `on-failure` | `approval policy OnRequest`（**与 `on-request` 不可分**；`prompt-input` 的 "Approval policy is currently …" 句只在 `never` 时出现，因此这对也不可分） |
| `approval_policy` | `never` | `approval policy Never`（**可分**） |

⇒ **证据边界如实写在这**：`on-request` 与 `on-failure` 在两个 oracle 上都不可区分。本单的写入因此**只写能被区分的取值**，
`on-failure` 不进入写入词汇表（§4）。

**另一条被排除的 oracle**：`codex sandbox <cmd>` **不读** `sandbox_mode`——三种模式下 `touch` 一律
`Read-only file system`（它有自己的 `--sandbox-state-json` 策略入口），故不能用它做沙箱效果证明。

## 2 claude 的键：位置 / 形状 / 合并语义 / 来源

### 2.1 位置

`{CLAUDE_CONFIG_DIR}/settings.json`（默认 `~/.claude/settings.json`）= **user 源**。
本部署的物化点已是这条：`plugins/agent-box-harnesses/…/claude/production.py:167` 把
`deploy/claude/settings.json` 写成 `{CONFIG_HOME}/settings.json`，且四家真实模型门里
该文件的 `env.ANTHROPIC_BASE_URL` 与 `model` **已被证明生效**（`live-model-preflight.md` §6）⇒
"这个文件会被读"不是推测，是本树既有实测。

### 2.2 形状（来源＝钉死二进制里内嵌的 schema 文档，逐字）

从 `claude`（2.1.270）二进制内嵌的设置参考文档原文抄出（偏移 `199204527` 附近，`## Settings Schema Reference`）：

```json
{
  "permissions": {
    "allow": ["Bash(npm *)", "Edit(.claude)", "Read"],
    "deny": ["Bash(rm -rf *)"],
    "ask": ["Edit(//etc/*)"],
    "defaultMode": "default" | "plan" | "acceptEdits" | "dontAsk",
    "additionalDirectories": ["/extra/dir"]
  }
}
```

> **Permission Rule Syntax:** Exact match `"Bash(npm run test)"`；Prefix wildcard `"Bash(git *)"`；Tool only `"Read"`。

（内嵌文档原文即如此；抄录时只做了反斜杠转义还原，无改写。）

三处交叉印证，不是单一来源：
- **读取点**：`permissions?.allow` / `permissions?.ask` / `permissions?.deny` / `permissions?.additionalDirectories`、
  `xf(e.permissions?.defaultMode)` —— 运行时确实按这个路径取值（非数组时 `if(!Array.isArray(…))` 早退）。
- **枚举源**：`defaultMode` 的期望集以 `doctor` 的错误文本为准（6 值，见 §1.1），
  比内嵌文档的 4 值**多** `auto` 与 `bypassPermissions` ⇒ 取 **doctor 的 6 值**当依据（一手效果 > 文档）。
- **越权收紧**：`defaultMode "bypassPermissions" ignored — only policy/user/flag settings may grant bypass mode
  (projectSettings and localSettings are repo-controlled)`、`defaultMode "auto" ignored — only policy/user/flag…`
  ⇒ user 源**有权**写这两值；project/local 源写了会被忽略。**本部署写的是 user 源**，所以这两值技术上可写，
  但 `bypassPermissions`/`auto`/`dontAsk` 都是**放宽**方向 ⇒ §4 一律拒绝。

### 2.3 `allowedTools` / `disallowedTools` **不是** settings.json 的键（本阶段最重要的否定结论）

`posture_translation.translate_claude()` 产出的正是这两个名字（工单 60 的词汇）。它们的一手证据只有两处，
**都不是设置文件**：
1. **CLI flag**：`--allowedTools, --allowed-tools <tools...>` / `--disallowedTools, --disallowed-tools <tools...>`（`--help` 第 22/74 行）；
2. **agent / skill 前置元数据**：`r.allowedTools==="string")r.allowedTools=vt(r.allowedTools)??[]`、
   `Skill '${d}' declared allowed-tools in f…`。

对 settings.json 的读取点搜索里，**没有** `settings.allowedTools` 这一条；而顶层写 `allowedTools` 时 `doctor` 无输出
——§1.1 已证"无输出"同样是未知键的表现，**不构成接受证据**。

⇒ **按工单"钉不死的家类型化拒绝，不许把未验证的键拼进真 harness 配置"**：claude 的写入**不能**用顶层
`allowedTools`/`disallowedTools`。可钉死的落点是 `permissions.allow` / `permissions.ask` / `permissions.deny`。

### 2.4 合并语义

| 事实 | 来源 |
| --- | --- |
| 源顺序 **user → project → local，后者覆盖前者** | 内嵌文档逐字：`Settings load in order: user → project → local (later overrides earlier).`；文件表：`~/.claude/settings.json`=Global、`.claude/settings.json`=Project、`.claude/settings.local.json`=Project+Gitignore |
| 可只加载部分源 | `--setting-sources <sources>` "Comma-separated list of setting sources to load (user, project, local)"（`--help:219`）；`--settings <file-or-json>` 追加一个 flag 源（`--help:221`） |
| 三条规则列表**汇池后按严重度裁决**，不是整体覆盖 | `var rDe={deny:3,ask:2,allow:1,none:0}`；`_e()` 同时算 `matchingDenyRules`/`matchingAskRules`/`matchingAllowRules`；`{deny:d}:…{ask:m}:…{allow:!0}` 的取值次序也是 deny→ask→allow |
| 标量 `defaultMode` 按源覆盖，且 bypass/auto 只有 policy/user/flag 能授予 | §2.2 的 ignored 文案 |
| 非数组的规则键被当作**缺席**（不是报错给运行时） | `if(!Array.isArray(R))return c=!0,D()` |

⇒ 对写入器的含义（G2 的可执行形式）：**deny 是"加严"，不会被 project/local 的 allow 洗掉**（汇池 + `deny:3` 最高）；
而 `allow` 与 `defaultMode` 是"放宽"通道，会被**后加载的源覆盖**，也在 user 源里就授予了自动放行。
所以"只收紧"在 claude 侧的实现形式是：**只写 `deny` 与 `ask`，永不写 `allow`，永不写 `defaultMode` 的放宽值**。

## 3 codex 的键：位置 / 形状 / 合并语义 / 来源

### 3.1 位置

`{CODEX_HOME}/config.toml`，本部署 `CODEX_HOME = "/runtime/home/.codex"`（`codex/production.py:93`）、
`CONFIG_TARGET = f"{CODEX_HOME}/config.toml"`（同文件 123/261），模板 `deploy/codex/config.toml`
（含 `model`、`model_provider`、`[model_providers.deepseek]`、`[features]`…，`ADAPTER_VERSION 1.1.14`）。
该文件的生效有既有实测背书（四家真实模型门 + `codex doctor` 在本仓门日志里报 `config.toml parse ok`）。

### 3.2 形状（来源＝钉死 0.147.0 的一手接受/拒绝矩阵，§1.2）

```toml
sandbox_mode    = "read-only" | "workspace-write" | "danger-full-access"
approval_policy = "untrusted" | "on-request" | "on-failure" | "never"
```

两个键都是**顶层标量**（不是表）；坏枚举 ⇒ 整个配置**加载失败**（比 claude 更硬：claude 只是不采纳）。

### 3.3 合并语义（三条一手实测，优先级从低到高）

```text
config.toml 顶层   <   <CODEX_HOME>/<profile>.config.toml （由 -p/--profile 选中）   <   -c key=value （CLI）
```

| 实验 | 结果 |
| --- | --- |
| 文件 `sandbox_mode="read-only"` + `-c sandbox_mode='"danger-full-access"'` | 解析值 = **`danger-full-access`** ⇒ `-c` 覆盖文件（**放宽通道**） |
| 顶层 `danger-full-access` + `-p tight`（`tight.config.toml` 写 `workspace-write`） | 解析值 = **`workspace-write`** ⇒ profile 层覆盖顶层 |
| `-p tight` + `-c sandbox_mode='"read-only"'` | 解析值 = **`read-only`** ⇒ `-c` 覆盖 profile |
| `-p missing`（不存在的 profile 名） | **静默回落**到顶层（不报错）⇒ 选了个不存在的 profile **不会失败**，这条不能当收紧手段 |
| `[profiles.tight]` 写在同一个 `config.toml` 里再用 `-p tight` | **硬错误**：`Error: --profile \`tight\` cannot be used while …/config.toml contains legacy \`profile = "tight"\` or \`[profiles.tight]\` config; move those settings into …/tight.config.toml and remove the legacy profile selector/table.` ⇒ 0.147.0 已废除内联 profile 表；写入器**绝不可**产出 `[profiles.*]` |
| 未知键 `totally_bogus_key = 7` | `config.toml parse ok`（**容忍**）⇒ 同 claude，G3 的牙只能长在自己写入器里 |

⇒ 对写入器的含义：codex 侧唯一由本单控制的落点是**顶层 `config.toml`**；本部署的 argv 也由我们生成
（`-c` 若被用来放宽，写入器管不到），故实现必须**同时**把"顶层键 + 我们自己的 argv"当一面来看，
并在证据里写明：`-c` 与不存在的 `-p` 是两条**能绕过本文件**的放宽通道，本单不引入它们。

## 4 钉死后的写入词汇表（阶段 2/3 的实现契约，本阶段只登记）

| 中立姿态 | claude（`permissions.*`） | codex（顶层 toml） |
| --- | --- | --- |
| `deny` | `permissions.deny += "<Tool>"` | `sandbox_mode="read-only"`（写被拒时）；`bash`/`webfetch`/`skill`/`task` 的 deny ⇒ **沿用 60 的 `PERMISSION_POSTURE_UNEXPRESSIBLE`** |
| `ask` | `permissions.ask += "<Tool>"` | `approval_policy="untrusted"`（= 观察到的 `UnlessTrusted`） |
| `allow` | **不写**（写 `allow` 即放宽，且会被后源覆盖） | 取该键当前默认即可；无逐工具 allow 旋钮 ⇒ 不发明 |
| 任何 | **永不写** `defaultMode`、顶层 `allowedTools`/`disallowedTools` | **永不写** `danger-full-access`、`on-failure`（不可区分）、`never`（放宽）；**绝不用** `[profiles.*]` |

与工单 60 既有翻译的**分歧登记**（本单不改契约、只记）：
`translate_claude()` 现在把 `ask` 映射进 `allowedTools` 并附注 "maps to claude's own approval round-trip"。
在 **CLI flag 语义**下 `--allowedTools` 是"预先批准、免提示"，而 settings 层的 `permissions.allow` 同义 ⇒
把 `ask` 放进 allow 列表相对中立姿态是**放宽**，与 60 自己的"只收紧"规则和 G2 相冲。
`permissions.ask` 才是能钉死的对应落点。⇒ 交回调度者：要么 60 的 claude 表改成 `ask→permissions.ask`（一处映射修正，
不是扩协议），要么在 085 之后另开一单收口；**本阶段只登记，不动 `posture_translation.py`**。

## 5 本阶段账务与清理

- 真实模型调用：**0 次**；费用：**¥0**。两家探针都无凭据（claude 的 `doctor` 自报
  `no usable credentials for the settings fetch`；codex 未装载 `CODEX_API_KEY`）。
- `codex debug prompt-input` 会把**当前工作目录的 AGENTS.md** 渲进提示；因此该探针**只在 `/tmp` 下运行**，
  输出经 `tr -cd '[:print:]'` + 关键词过滤后才进本文件，未整段落盘、未复述仓库内容。
- 凭据 locator 未被读、未被删（`/home/maoqh/.agentbox-acceptance-secret.CnsAonj6/` 全程未访问）。
- 临时件：`/tmp/085cx147`、`/tmp/085claude-config`、`/tmp/085claude-proj`、`/tmp/085claude`、
  `/tmp/085claude-help.txt`、`/tmp/085codex`、`/tmp/085cxws`、`/tmp/085cx-pro.txt`、
  `/tmp/085snap`（§6）、`/tmp/085split`（阶段 2/3 提交的暂存副本） —— 本单阶段 4 前删除。
- 未验证项（**不伪装成钉死**）：
  1. claude `permissions.ask` 的**运行时效果**（真的会弹提示吗）只有读取点与形状校验证据，无效果证据——
     要一条真实工具调用来证明，属模型轮，本单不花；
  2. ~~codex `on-request` vs `on-failure` 不可区分（§1.2）~~ ⇒ 已由 §6.3 **实测关闭**（归一后逐字相同），
     `on-failure` 因此留在**不可写**词汇表里，理由从推断变成测量；
  3. 内嵌文档只列 4 个 `defaultMode`，doctor 收 6 个 ⇒ 采 doctor，差集未向官方文档二次核对（离线，不外发）；
  4. ~~除 claude/codex 外的家（pi/hermes/opencode/kilo/dsh/qwen）**没有姿态键**可钉 ⇒ 阶段 4 走类型化拒绝~~
     ⇒ 已由 §7 落地：拒绝名单**从注册表派生**，不手写。

上面四条之外本单不再留"看起来已验"的余地：阶段 4 的临时件删除见 §7 与账行。

## 6 阶段 2/3 落地后的真实工件快照对比（DoD-3，实测）

写入器（`src/agent_box/server/profiles/posture_config.py`）渲染出的文件**原样落盘**到隔离目录，
再用 §1 的两个 oracle 读回来。全部零模型调用、无凭据。

### 6.1 claude：`doctor` 对渲染件无话可说，对被改坏一件**有**话可说

| 输入（`CLAUDE_CONFIG_DIR`） | `claude doctor` 2.1.270 的 `Invalid settings` 段 |
| --- | --- |
| 渲染件 `settings.json`（`permissions.deny=[Edit,NotebookEdit,WebSearch,Write]`、`permissions.ask=[Bash,Task]`，`env`/`model` 保留） | **无该段**（`grep -A6 "Invalid settings"` 空） |
| 反例：同文件把 `permissions.ask` 改成字符串 `"Bash"` | `Invalid settings` + `/tmp/085snap/bad-config/settings.json › permissions.ask: Expected array, but received undefined` |

⇒ 这条配对是"缺席即失败"的两半：oracle 会报（反例报了），渲染件没被报。
**边界照旧**：`doctor` 只判形状，不判合并语义 ⇒ claude 的 G2（不放宽既有规则）在真实工件上**不可观测**，仍只有 §6.4 的密封证据。

### 6.2 codex：`debug prompt-input` 回显的 `<permissions instructions>` 块

四个 case，`CODEX_HOME=/tmp/085snap/cx/<case>`，同一工作目录；把块内 `CODEX_HOME` 路径归一后取长度与 sha256 前 16 位。
（**整段输出不可直接比 hash**：里面有每次新生成的 `msg_<uuid>`，见 §6.3。）

| case | 落盘的 toml | 归一后块 |
| --- | --- | --- |
| `tighten` | 写入器把 base 的 `danger-full-access`/`never` 收紧为 `read-only`/`untrusted`（changes 两条） | 473 字节 `5db7584e377bcef7` |
| `keep` | base 本来就是 `read-only`/`untrusted`；姿态只要 `on-request` ⇒ **写入器一个字都不改**（`written=false`） | 473 字节 `5db7584e377bcef7`（**与 `tighten` 逐字相同**） |
| `naive` | 反例：一个"照姿态放宽"的写入器会写出的文件（`approval_policy="on-request"`） | 3977 字节 `bf9aedaed1d9cb40` —— 多出整段 "Escalation Requests" 指引 |

三条都是**一手效果证据**：
1. **写入生效**：收紧后的文件与"本来就严格"的文件回显同一个块 ⇒ 我们写进去的键就是 harness 读到的键。
2. **G2 有牙**：`keep` 与 `naive` 的差不是措辞而是**模型可见提示的形态**（放宽后多出 3.5KB 的越权申请指引）
   ⇒ "不放宽"不是一句口号，它对应一个可观测的差异，而写入器站在严格那一侧。
3. `sandbox_mode` 解析名与 `approval_policy` 解析名分别是 `read-only` / `unless-trusted`（toml 里写 `untrusted`）。

### 6.3 顺带钉死的一条：oracle 自身不稳定，以及 `on-request` vs `on-failure`

- 同一份配置连跑两次，`prompt-input` 的**整体** sha256 不同（`f2e8a6e0…` vs `08c7e3b9…`）：
  输出含 `msg_<uuid>`，且 `CODEX_HOME` 路径会出现在 skills 段里。⇒ 快照对比**只能比归一后的目标块**，
  比整段哈希会得出"naive 与 on-failure 不同"的**假结论**（我第一轮就踩了这个）。
- 归一后 `on-failure` 与 `on-request` 的块**逐字相同**（同为 `bf9aedaed1d9cb40`）
  ⇒ §5 未验证项 2 升级为**实测**：这两档在可观测面上不可区分，所以 `on-failure` 继续**不写**。
- 该 oracle 还有个副作用：codex 会在 `CODEX_HOME` 下建 `skills/.system/…`，并打印
  `Refusing to create helper binaries under temporary dir "/tmp"`（**警告不致命**，配置解析照常）
  ⇒ 记录为观测噪声，不是失败；真实部署的 `CODEX_HOME` 在 guest 内 `/runtime/home/.codex`，不落 `/tmp`。

### 6.4 密封门（同一份代码，可重复）

```bash
python3 -m pytest -q tests/server -k posture      # 36 passed（G1 键有据 / G2 只收紧 / G3 类型化拒绝 + 写入原子性 + 与 60 的表一致性）
```
其中两条是本节结论的密封对应物：`…_reports_one_change_per_path_from_the_file_as_it_stood`
（快照每路径一条、`before` 是文件原样）与 `…_does_not_report_a_rule_it_did_not_add`
（姿态已被满足 ⇒ `changes==[]` 且**字节不变**，不趁机重排既有规则顺序）。

> **§6.4 的口径更正（阶段 4 一手复核，见 §7.6）**：这里的 **36 是 Validation 命令选中面的计数**，
> 其中本单文件当时 **31** 条 + 五**先前既有**的同名姿态测试。阶段 2/3 提交信息里"whole order 36"
> 按此读，不是本单文件的条数。

## 7 阶段 4：未钉死的家类型化拒绝 + 60 收口

### 7.1 拒绝面来自注册表，不是家名的抄本（实测）

一手事实：`agent_box_harnesses.registry.loader.load_builtin_registry().all()` 在本基线上给出 **8** 个
`harness_type` ⇒ `claude-code, codex, dsh, hermes, kilo, opencode, pi, qwen`。
`PINNED_FAMILIES = ("claude-code", "codex")`，`RENDERERS` 与之相等（由
`test_posture_write_pinned_families_are_all_registered_harnesses` 钉住），
所以**未钉死的家 = 注册表 − 钉死集**，派生出 `[dsh, hermes, kilo, opencode, pi, qwen]` 六个参数。

每家一条：目标文件先落成 `unchanged` ⇒ 调用后 `code == POSTURE_CONFIG_UNPINNED_HARNESS`
**且目标字节未变**。另加一条"名字根本不在注册表里"（`not-a-harness`）同样类型化拒绝
⇒ 拼错家名不会被静默读成"这家没有姿态可写"。

"缺席即失败"落在派生本身：手写名单会把拒绝面写成**过去的事实**，而注册表是**当前的**。
哪天有人给某家加了渲染器却没钉键，参数集会少一个（该家不再被拒），同时
`set(RENDERERS) == set(PINNED_FAMILIES)` 与 `set(PINNED_FAMILIES) <= registered` 会指出断言动过哪一侧。

### 7.2 一条容易搞错的轴：注册表的 `permissions` 能力 ≠ 能否物化配置（实测）

| harness_type | capabilities（逐字） |
| --- | --- |
| `claude-code` | `stream, start, native_continuation, observe, finish` |
| `codex` | `stream, **permissions**, start, native_continuation, observe, finish, attach` |
| 其余 6 家 | 不含 `permissions`（`pi` 多一个 `attach`） |

从这张表推导写入面会**同时得到两个错结论**：`claude-code` 被判"不可写"——而阶段 1 已一手证明它的
`settings.json › permissions.ask/deny` 是钉得住的落点（§1.1、§6.1）；6 个未钉死的家被判"可写"——而本单一
个键都为它们钉不出来。`permissions` 说的是"**运行时会不会应答权限请求**"，本单写的是"**姿态能否落进受审配
置文件**"。这条区分由 `test_posture_write_pinning_is_not_the_same_axis_as_the_runtime_permission_capability`
钉住，写给后来的读者（093 的执行者尤其：那张表的写法很容易被当成写入面）。

### 7.3 DoD 逐条对账

1. 两家写入 ⇒ `render_posture_config` + `write_posture_config`（mkstemp + `os.replace`，`changes==[]` 时不落盘）。
2. G2/G3 反例 ⇒ G2 有两半（放宽即拒 / 已被满足则字节不变，§6.4）；G3 有六半：未知键、未知动作、坏 base
   形状、内联 `[profiles.*]`、未钉死的家、不在注册表的名字。
3. 真实环境配置快照对比 ⇒ §6。
4. 回归计数 ⇒ 见 §7.5 末尾与账行。
5. 零调用账务 ⇒ 阶段 4 新增断言全部密封（读注册表 toml，不启动任何 harness 二进制），**0 次 / ¥0**。
6. 账 ⇒ 本文件 + `docs/implementation/status.md` 的 60 行与本单终态行。

### 7.4 60 的收口（本单不改 60 的契约，只把它的剩余收窄）

60 账行原写"翻译产物写进各家配置文档待逐家钉死"。本单后：**claude/codex 已按钉死的键物化，其余家类型化拒
绝**，该条遗留因此收窄成三条，且都不在 085 的 Scope / write_paths 里：

1. **生产接线**：`posture_config.py` 目前**没有调用方**——本单 Scope 明写"不碰 wire"。谁在什么时机对哪个
   文件写、写完如何进冻结链，属工单 **093**（R-0013 第 1 层的执行侧）。
2. **`ask → allowedTools` 分歧**（§4 登记）：`posture_translation.py` 仍按 60 的表把 `ask` 译进 allow 列表，
   相对中立姿态是**放宽**，与本单 G2 相冲。本单不动那个文件（不改别人的契约）⇒ **交回调度者**：一处映射
   修正，或 085 之后另开一单收口。
3. **claude `permissions.ask` 的运行时效果**（§5 未验证项 1）：需要一次真实工具调用才看得见提示 ⇒ 模型轮。

⇒ 60 维持 `PARTIAL`，剩余按上面三条如实写；本单终态见账行。

### 7.5 顺带钉死的一条环境事实（**不是本单引入的回归**）

阶段 4 跑门时先撞到：裸 `python3 -m pytest -q tests/server` 以 **40 个 collection error** 失败，报
`ModuleNotFoundError: No module named 'agent_box.server'`。只读诊断（未改任何环境文件）给出原因：

- `~/.local/lib/python3.12/site-packages/` 下三条 `__editable__` pth —— `agent_box-0.1.0`（mtime
  2026-06-19）、`agent_box_cli-1.0.0`（2026-08-05）、`agent_box_cli-1.9.0`（2026-08-20）——
  内容都是 `/home/maoqh/projects/agent-box/src`（**另一个仓**，且没有 `server` 包）；
- 该条目在 `sys.path` 里位于本站 `src` 之前 ⇒ `import agent_box` 解析到发布源 main。

⇒ 本树全部门**必须**带账行第 7 行与 `tests/conftest.py` 注释里那条
`PYTHONPATH=src:plugins/agent-box-*/src …`（PYTHONPATH 先于 site-packages 生效）。
本节计数均按该口径：`tests/server -k posture` ⇒ **39 passed / 593 deselected**；根套件计数见账行。
记录以免后来者把这 40 个错误读成实现回归。

### 7.6 两条一手复核：注册表派生的反例演练，以及一条我自己算错的账

**(a) 派生名单的反例演练（内存内，未改任何仓内文件）**。用 `load_registry(text)`（同一份 loader，
收文本）把内置注册表**加第九家** `zz-new`（复制 codex 块改 `driver`/`harness_type`）：

| | 派生出的拒绝名单 | 注册表条数 / digest |
| --- | --- | --- |
| 当前基线 | `dsh, hermes, kilo, opencode, pi, qwen`（6） | 8 / `sha256:d8eb80e…` |
| 加了 `zz-new` 后 | `dsh, hermes, kilo, opencode, pi, qwen, **zz-new**`（7） | 9 / `sha256:a4c31e2…` |
| **手抄名单**（阶段 4 之前的写法） | 只有那 6 个名字 ⇒ **漏 `zz-new`** | — |

并且 `write_posture_config(..., harness="zz-new")` 当场给出
`POSTURE_CONFIG_UNPINNED_HARNESS`、目标文件字节未变。
⇒ "缺席即失败"落在**覆盖面**上，而不只落在断言上：一家新注册的家**落地当天**就在拒绝名单里，
不依赖有人记得去改测试。

**(b) 一条我算错的账（更正，不留悬案）**。阶段 2/3 的账与提交信息把
`-k posture` 的 **36** 当成了"本单文件的条数"。一手复核：

- `pytest tests/server/test_posture_config_write.py --collect-only -q` ⇒ 本单文件 **34** 条（阶段 4 后；阶段 2/3 时 **31** 条）。
- `-k posture` 现在选中 **39** = 本单 34 + **5 条先前既有**的同名姿态测试
  （`test_posture_translation.py` 2 条、`test_profile_permissions.py` 2 条、`test_hermes_production_chain.py` 1 条）。
  ⇒ Validation 命令的选面**本就是"所有姿态测试"**，这条计数没错，错的是我把它读成"本单文件"。
- 于是上一轮挂的"893 vs 898 差 5 条"**是我这边的算术假象，不是套件退化**：
  `git diff --stat 873a6d4..HEAD -- tests/ src/` 只列出本单的两个新文件（`posture_config.py` + 本测试文件），
  873a6d4 时本测试文件不存在（`git show` 报 `exists on disk, but not in '873a6d4'`）
  ⇒ 该提交处根套件 = 932 − 34 = **898**，与 084 行记录**逐字相符**，零退化。
- 本单终账因此是：根套件 **932 passed / 0 failed**（= 084 的 898 + 本单 34）。

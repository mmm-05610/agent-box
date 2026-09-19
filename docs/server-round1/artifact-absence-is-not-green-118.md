# 118 — "工件缺席"不许再算成绿：skip 必须在门与计数口径里显形（`QA-010`）

**终态**：`ARTIFACT_ABSENCE_IS_NOT_GREEN_DONE`（批末复算见 §6）
**写面**（本单声明）：`scripts/server-round1/**` · `tests/**` · `docs/server-round1/**` · `docs/implementation/status.md`
**真实模型调用 0 / ¥0**（全程本地；没有访问任何凭据内容）。

---

## 1 一手复核（前提与"本树能复现的那一半"）

`QA-010` 的两条前提，本树一手量：

| 前提 | 一手核对 |
| --- | --- |
| A 树**有**工件 | `artifact_presence.py` 的五个声明路径逐个 `exists()`：`worker-debug` / `worker-release` / `worker-musl-dir` / `sidecar-entry` / `acp-npm-closure` **5/5 present**（`--inventory` 与门里那条用例都读同一份清单） |
| runtime 树**没有** | `test -d …/agent-box-runtime-round1/workers/agent-box-worker/target` ⇒ **整个目录不存在**（比"空"更彻底；跨树只读核验） |
| 同一 sha 两种结论 | 本树**复现不出"21 条 skip"**（工件在场，那些门根本不会跳）。复现的是它的**形状**，两条腿见下 |
| `086` 补工件后仍红（UNTRACKED 闭包） | 该闭包在本树 `plugins/agent-box-harnesses/runtime-claude/node_modules/@agentclientprotocol/claude-agent-acp`，`.gitignore:28` 的 `node_modules/` 把它排除在版本控制外 ⇒ 在场是**这台机器的事实**，不是仓库的事实（已进 §5 交回） |

**缺席的两条腿（都是真跑，命令可复算）**：

```bash
# 腿 A：把 Worker 二进制指到不存在（086 的 pytestmark 读 AGENTBOX_W43_WORKER）
env AGENTBOX_W43_WORKER=/no/such/worker python3 -m pytest \
    tests/server/test_subagent_harness_real_round_086.py -q -rs
# → exit 0，1 skipped，原因 "the real-harness round needs the release Worker binary and bubblewrap"
#   账上没有任何红 —— 这就是 QA-010 的读法。证据 `118-artifact-presence/worker-artifact-absent.txt`

# 腿 B：把宿主工具藏掉（skipif 走 shutil.which，于是 PATH 就是它的开关）
env -u AGENT_BOX_SANDBOX_MODULE PATH=/nonexistent-bin python3 -m pytest \
    tests/server/test_accounts.py -q -rs
# → exit 0，2 skipped（"bwrap is required"）。证据 `controlled-absence-accounts.txt`
```

**一条对照，防把本单做过界**：不是所有"环境不满足"都静默。我把批量跑的 `PYTHONPATH` 少了插件那几条时，得到的是
**12 个 collection error（响的，`SERVER_EXIT=2`）**而不是 skip。⇒ 本单只治**skip 这一条静默通道**，
不碰"报错就是报错"。（那一次的叙述留在 §1（`batch-*.log` 被 `.gitignore` 的 `*.log` 排除，不入库——见 §5.5），不另存。）

**"哪些用例本来是工件门控的"（DoD 要的清单，本树口径）**：在场的环境跑不出这份名单，所以它**读自声明**——
`python3 scripts/server-round1/artifact_presence.py --inventory`（原件：`118-artifact-presence/skip-inventory.tsv`，48 条 reason）：

| 类 | 条数 | 站点（工件类逐条） |
| --- | --- | --- |
| **ARTIFACT** | 9 | `test_harness_sidecar.py:65/:82/:125/:158/:177`（"sidecar entry not built"）＋ `test_subagent_harness_real_round_086.py:79`（Worker 二进制＋bwrap，**跨两类**）＋ 三条 "harness plugin runtime is unavailable"（`test_server_capability_contract.py:216/:230/:240`） |
| TOOL | 35 | bwrap / node / claude CLI / tmux / wsl.exe 各条 |
| DESIGN | 4 | Windows ACL 那条、`AGENT_BOX_WIRE_SCHEMA` 未设、"refusal cannot be provoked"、087 的 opt-in 计数腿 |
| UNKNOWN | 0 | 兜底类**当前为空**，且门里有一条专门盯着它（§4 G3'） |

---

## 2 二选一：默认"降级不计绿"，另给一条能变红的开关（依据写清）

工单允许"显式失败"或"标成降级、不计绿"二选一。**本单选：默认把事实说出口，`AGENTBOX_STRICT_PRESENCE=1` 才变红。**

依据（不是省事）：runtime 树**按事实没有工件**（§1：`target/` 整个不存在）。若默认红，那棵树每一次计数都会红成
"看起来像缺陷"，反而把 `QA-010` 想区分的两件事（**没跑** vs **跑挂了**）又搅成一团；而本树的计数口径要的是
**"没有红 ⇒ 通过"这句读法失效**，这一点靠"账上必须自带那一行"就已经成立。
要"不可绕过"的人（CI、批末计数）加一个环境变量即可 ⇒ 两条腿都实测过：**同一命令 0 → 1**。

---

## 3 机制（三类 + 一个不肯装知道的兜底）

`scripts/server-round1/artifact_presence.py`（本树唯一作者，与 103 的扫描器同一形制：**账是生成的**）：

- `ARTIFACT` = 这个仓库自己造的产物（Worker 二进制、sidecar entry、git-ignore 的 npm 闭包）
- `TOOL` = 宿主能力（bwrap / node / npm / claude / tmux / wsl.exe）
- `DESIGN` = 用例自己说"这里不该跑"
- 规则没盖住的 ⇒ **`UNKNOWN`，而 `UNKNOWN` 永远不算绿**

`verdict(classes, failures)`：`FAILED` → `DEGRADED_ARTIFACT_ABSENT` → `DEGRADED_UNCLASSIFIED_SKIP` →
`PARTIAL_HOST_TOOLS_ABSENT` → `GREEN_DESIGN_SKIPS_ONLY` → `GREEN_NO_SKIPS`。
**这条顺序就是"把默认写错也回不到旧行为"**：删掉规则不是变绿，是变 `UNKNOWN` ⇒ 仍 `DEGRADED`（门里那条反例实测的就是这个）。

`tests/conftest.py` 两处挂钩（都在场 ⇒ 计数**自带**，不靠人记得写）：

- `pytest_terminal_summary`：逐条 `write_line`——五个 `ARTIFACT_<label>=present|ABSENT <path>`、五个 `TOOL_<name>=`、
  `SKIPPED_CLASSIFIED_<class>=N`、`SKIPPED_TOTAL=`、`WORKER_ARTIFACT=`、`VERDICT=`。
  报告器**加载不到**时不静默：写 `VERDICT=DEGRADED_PRESENCE_REPORT_UNAVAILABLE`。
- `pytest_sessionfinish`：`AGENTBOX_STRICT_PRESENCE` 且 verdict 非 `GREEN*` 且本来 0 失败 ⇒ `session.exitstatus = 1`。

顺带一条一手：`tests/conftest.py` 第 13 行本来就 `setdefault("AGENT_BOX_SANDBOX_MODULE", …)`——
这正是 128 那条"环境决定的绿"能骗过单独跑的原因（批量跑有、手跑没有）。**本单不动那行**（改了会改变既有门的判据），
只在报告里点名它：谁要复算 skip，先知道自己是不是在这条 setdefault 的罩子里。

---

## 4 门（`tests/server/test_artifact_absence_is_not_green_118.py`，19 条，**全部 subprocess 真跑**）

| Gate | 覆盖 | 反例（必须红的那条） |
| --- | --- | --- |
| G1 缺席显形 | `test_a_skip_reason_gets_a_class_and_the_unknown_class_is_not_green`（7 个固定样本）· `test_zero_failures_is_no_longer_the_verdict` · `test_the_absence_reproduces_and_the_count_line_says_so`（腿 A：exit 0 ＋ `VERDICT=DEGRADED_ARTIFACT_ABSENT` 同时成立） | `test_counter_example_deleting_the_rules_cannot_restore_the_old_green`：把 `RULES` 清空 ⇒ 仍落 `DEGRADED_UNCLASSIFIED_SKIP`（旧行为**不可达**） |
| G1 开关 | `test_strict_mode_is_the_half_that_cannot_be_walked_past`：同一命令加 `AGENTBOX_STRICT_PRESENCE=1` ⇒ 退出码 0 → 非 0 | 两腿互为反例（少了开关的那腿正是旧读法，日志里留着） |
| G2 自报口径 | `test_a_clean_run_reports_presence_and_stays_green`（真跑一个 7 门的文件，输出**自带** `WORKER_ARTIFACT=` / `VERDICT=GREEN_NO_SKIPS`，退出码不变） | `test_counter_example_a_silent_reporter_is_itself_not_green`：`_presence` 取不到 ⇒ 必须写 `UNAVAILABLE` 而不是**没话说**；另 `test_counter_example_without_the_hook_nothing_is_said`：同样的 skip 放在本树 conftest 之外 ⇒ exit 0 且**没有** `VERDICT=` 行（=118 之前的世界，当场重放） |
| G3 不误伤 | 干净跑的退出码与判定**逐字不变**（上一条门）· 五个工件路径 present 的断言（`test_every_claimed_artifact_path_is_named_here_rather_than_inferred`） | 任一工件不在 ⇒ 门红并点名"清单与现实不符" |
| G4 反例可跑 | `test_the_classifier_is_self_checking`：`artifact_presence.py --self-test` ⇒ **8 classify ＋ 6 verdict 样本，退出码 0**（与 089 的泄漏检查器同一形制：会自检的门才敢叫门） | 自检测试里若两侧规则一致（旧读法不再被判绿）即红 |
| 名单可复核 | `test_the_declared_skip_reasons_are_all_classified_in_this_tree`（UNKNOWN 必须为空）· `test_the_inventory_names_the_gates_that_would_have_been_silent` · `test_the_absence_log_parses_into_the_same_classes` | 新加一条没人分类的 skip ⇒ 门红（**故意留的摩擦**，同 103） |

---

## 5 边界与交回（只显形，不定策略）

1. **哪些工件该进版本控制——交回 ops/I**（本单原话边界）。事实清单在手：`node_modules/` 被 `.gitignore:28` 整目录排除；
   Worker 三个 `target/*` 是 cargo 产物；`plugins/agent-box-harnesses/runtime/worker-entry.mjs` 是**入库文件**（不是产物）
   ⇒ 四条腿的"该不该入库"各不相同。要不要为 UNTRACKED 闭包立规矩（锁文件？`npm ci` 进门？）是决策，本单一字未改。
   **顺带一手（分类器的诚实脚注）**：`test_harness_sidecar.py` 那 5 处的原因写着 "sidecar entry **not built**"，
   而那个 entry 是 `git ls-files` 认得的入库文件 ⇒ 本树里这 5 条**永远不会跳**，"built" 这个词是旧话。
   我仍按原因文本把它归 `ARTIFACT`（名字说什么就按什么显形，比让分类器去猜"这到底算不算产物"安全），
   但如果 ops 拿这份名单估"补上工件能多跑几条"，**别把这 5 条算进去**。
2. **跨树同一机制——交回**。runtime 树要同样的自报，需要它自己的 `conftest.py` / `scripts/**`（都不在本单写面）。
   两树同源文件曾出现 15/15 md5 全同（`docs/qa/dedup-ledger.md` D-001，章程 §2 引用），所以**不要复制两份**：
   要么 ops 把这份 `artifact_presence.py` 定为唯一 owner（本树，`QA-004` 口径），runtime 树只读引用；要么 ops 另开一单。
3. **策略外的两条如实**：① `SKIPPED_CLASSIFIED_*` 按"命中的每个类"计数，所以跨两类的 086 那条会在两类里各出现一次
   （`ARTIFACT`/`TOOL` 各 +1），这不是重复统计而是"它同时缺两样"——`SKIPPED_TOTAL` 才是条数；
   ② 那份 `--classify` 的**在场清单反映的是运行分类器的那个进程**，而 `controlled-absence-accounts.log` 是另一个进程（PATH 被剥）产生的
   ⇒ 那份日志里会同时出现 `TOOL_bwrap=present` 与 `VERDICT=PARTIAL_HOST_TOOLS_ABSENT`。同一个进程内（conftest 挂钩的真实用法）两者一致；
   事后 `--classify` 只用于**分类 skip 名单**，别拿它的 TOOL 行当被分类那次的现场。这一条写在这里，因为它是会被误读的形状。
4. **没做的事**：不改被测行为、不把任何红改成绿、不删任何 skipif、不动 `FAMILIES`/协议、不碰 087 的 opt-in 计数腿语义。
5. **证据卫生（顺手一手，属 `49` 那条口径的复发面）**：本仓库 `.gitignore` 里有一条 `*.log` ⇒ **叫 `*.log` 的证据永远不入库**，
   报告里的指针会变空（我第一次 `git add` 时只进去了 `.tsv`，三份 `.log` 静默没被收）。
   本单的三份实验输出因此改名成 `.txt` 入库（`118-artifact-presence/*.txt`），批量计数日志（`batch-*.log`）
   仍按既有口径**不入库、数字抄进散文**。要不要给证据定一个「能入库的后缀」规矩，归 `49-evidence-hygiene` 那条线
   （不在本单写面，登记不自行改）。

---

## 6 计数与终态

```
定向：python3 -m pytest tests/server/test_artifact_absence_is_not_green_118.py -q → **19 passed / 4.86s**
自检：python3 scripts/server-round1/artifact_presence.py --self-test → **GREEN, exit 0**
名单：python3 scripts/server-round1/artifact_presence.py --inventory → 48 条（ARTIFACT 9 / TOOL 35 / DESIGN 4 / **UNKNOWN 0**）
批末（加了挂钩之后，两腿各一次）：
  `tests/server -q` → **842 passed / 1 skipped / 0 failed in 448.54s**，输出自带 `WORKER_ARTIFACT=present` ＋ `VERDICT=GREEN_DESIGN_SKIPS_ONLY`
  `tests/ -q`      → **1142 passed / 1 skipped / 0 failed in 441.94s**（1142 = 1123 ＋ 本单 19），同一行自报
  那 1 条 skip 是 087 的 opt-in 计数腿 ⇒ 被分类成 DESIGN ⇒ 判定仍是 GREEN 家族（**这就是"不误伤"的实证**）
对照（G3 的失败样本，第一次批量跑我少给了插件路径）：`tests/server -q` → **12 collection errors / SERVER_EXIT=2**
  ——缺席在这一路是**响的**，不是 skip；本单治的是安静的那一条。日志叙述留在 §1。
```

DoD 六项：1 一手复现（§1 两条腿 ＋ 48 条名单）· 2 缺席显形（§2/§3）· 3 口径自报（§3 conftest）·
4 反例门（§4 三处，其中两处是"重放 118 之前的世界"）· 5 策略层交回（§5.1）· 6 账与证据。

**终态 `ARTIFACT_ABSENCE_IS_NOT_GREEN_DONE`**；剩余＝§5.2 那条跨树机制的归属（不属本单写面）。

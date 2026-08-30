# ADR-0007：第三方 Provider 插件加载

Status: Current — retained as an active architectural decision.

> 文档导航：[总目录](../README.md)

- 状态：Accepted and implemented for Preview
- 日期：2026-08-25
- 范围：第三方 Resource Contract、ResourceProvider 和 ExecutionProvider 的安装与进程启动注册
- 结论：**Agent-Box 使用标准 Python distribution entry point 发现可信插件；Core registry 只验证并保存进程内组件，不认识具体产品，也不持久化插件对象。**

## 1. Core 需要承担的最小责任

Agent-Box 要成为“稳定 Core + 用户扩展”，必须允许一个已安装的第三方包在不修改
`src/agent_box` 的情况下贡献：

- 带版本的不可变 Resource Contract；
- ResourceProvider；
- ExecutionProvider。

Core 只需保证 ID 唯一、Contract 类型可验证、Provider 声明的 Contract 已注册，
以及一个插件 bundle 不会半注册。插件目录、tmux session、Harness 参数和资源投影
都不是 Core 语义。

## 2. 安装与发现协议

第三方包在自己的 `pyproject.toml` 声明：

```toml
[project.entry-points."agent_box.plugins"]
tmux = "agent_box_tmux.plugin:create_plugin"
```

factory 返回实现以下协议的对象：

```python
class AgentBoxPlugin(Protocol):
    def descriptor(self) -> PluginDescriptor: ...
    def build(self, context: PluginContext) -> PluginRegistration: ...
```

`PluginRegistration` 只包含三组进程组件：`contracts`、
`resource_providers`、`execution_providers`。插件加载器先检查 API 版本，再把 bundle
原子加入 `ExtensionRegistry`。失败插件显示为 `FAILED` 或 `INCOMPATIBLE`，默认不
阻止其他插件；需要确定性启动的 Preview Host 使用 `strict=True`。

插件是可信的可执行 Python 代码，不是隔离脚本。安装插件等价于安装并授权一个
Python 包。Preview 不实现插件沙箱、权限系统、远程市场或热更新。

## 3. Contract 与 Provider 注册

第三方 Contract 必须：

- 是 frozen dataclass；
- 声明形如 `vendor.name@1` 的 `contract_id`；
- 不依赖 Work、Execution 或 Dispatch 实例。

第三方 ResourceProvider 必须提供：

```python
def descriptor() -> ProviderDescriptor
supported_contract_ids: frozenset[str]
def resolve(contract_id: str, ref: Ref) -> object
```

ExecutionProvider 继续使用 ADR-0004/0006 的 descriptor、capabilities、
input_limits、start 和 observe 协议。`ExecutionService` 只从传入的 registry 查询
Contract 类型，因而第三方 Contract 可以参与与内置 Contract 完全相同的 Binding
freeze、resolve、类型检查和 Dispatch。

## 4. 项目本体与插件的位置

Agent-Box 本体只发布 `agent-box-cli`。插件是独立 distribution，可以在其他 Git
仓库；当前仓库的 [`plugins/agent-box-tmux`](../../plugins/agent-box-tmux/) 只是为了
Preview 联调而采用 monorepo 布局，仍有自己的 `pyproject.toml`、包名、版本和 entry
point。它不被 Agent-Box 主包的 setuptools package discovery 收进去。

插件必须安装到运行 Agent-Box 的同一个 Python 环境。例如源码开发环境：

```bash
python3 -m pip install -e ./plugins/agent-box-tmux
agent-box plugins list
```

如果 Agent-Box 通过 pipx 安装，应使用 `pipx inject agent-box-cli agent-box-tmux`
或对应的本地路径。只把插件源码放在项目目录并不会隐式执行它。

## 5. tmux 验证插件

`agent-box-tmux` 注册：

- Contract：`agent-box-tmux.console@1`；
- ResourceProvider：`tmux-console`。

Provider 把一个 frozen console-spec ArtifactRef 解析/物化成 execution-scoped tmux
server/session，返回实际 tmux `session_id`、pane IDs、版本和 attach command；实际
session 再表示为 native SessionRef。后续
TeamInteractiveExecutionProvider 可以消费这个 Contract，把不同 participant 命令
投影到 panes；这段消费逻辑仍属于该 ExecutionProvider 或其插件，不属于 Core。

2026-08-25 本地独立安装 spike 已验证：

- 标准 entry point 自动发现状态 `READY`；
- tmux `3.4`；
- 实际 session identity `$0`；
- 三个实际 pane identity `%0`、`%2`、`%1`；
- 创建、发送命令和 cleanup 成功。

第一次 spike 还发现用户 tmux 配置可改变 window base index；插件因此使用 session
target，不假设窗口编号为 `0`。

## 6. 明确不进入 Core

- `TmuxSession`、`Pane`、`Harness`、`Participant` 领域实体；
- 插件业务配置或插件数据表；
- 通用 projector/sandbox/supervisor；
- 自动选择 Provider；
- 插件间依赖求解和版本市场；
- Work progression、下一步计算或 participant lifecycle。

数据库继续只保存 `(contract_id, Ref)`、`inputs_digest`、Dispatch 和观察事实。
插件卸载后历史仍可读取，但涉及其 Contract 的新 Dispatch 无法 resolve，并明确失败。

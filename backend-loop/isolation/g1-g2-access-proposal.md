# G1/G2 单组最小联网 + 认证接入方案（提案，交 I；未实现/未启动/不消耗 Sol）

目标：先为**单组**（建议 S=server）打通"能取 Qwen 模型、又不暴露宿主服务/其他组/凭据/宿主执行通道"的最小路径。
原则：**优先现成机制**；**不**做特权网络改动、**不**建大型自研代理；有权限缺口就报告、不绕过。
本轮实测事实（均只读核实）：
- qodercli 1.1.60 认 `HTTP(S)_PROXY`；宿主已有一个**现成用户代理** `http://127.0.0.1:7897`（`env` 实测）。
- **无** rootless egress 工具：`pasta/passt/slirp4netns` 均缺。`socat` 有。docker/podman 无。
- qodercli **无** env/token 认证标志：`login` 把凭据写入 config-dir；仅 `--config-dir <dir>` 可重定向配置根。
- `bwrap --unshare-net` 已实测隐藏宿主回环服务（18790/9222 unreachable）；`--share-net` 则可达宿主回环=泄漏。

## G1 联网——现状结论（诚实）
在"无特权改动 + 无大型自研代理 + 优先现成"三约束下，本机**不存在**让 `--unshare-net` 沙箱既有模型出口、又结构性屏蔽宿主回环服务的零特权现成路径：
- `--share-net`：能到 7897，但同时能直连 18790/18810/9222 等 → **违反约束，排除**。
- `--unshare-net` + 绑一个 unix socket 给 socat 转发：Node 的 `HTTPS_PROXY` 只认 `tcp host:port`，netns 内无出网路由 → 仍需 veth+转发（特权）或真代理（大型自研），**不在本轮许可内**。

**建议的最小可行（交 I 二选一，均为单组先试）：**
- **Opt-1（推荐，最小）**：一次性安装/启用上游 rootless 工具 **pasta 或 slirp4netns**。它给沙箱一个独立 netns 的出站 NAT（模型可达），且因独立 netns，宿主 `127.0.0.1` 服务不可达 → 满足隔离。属"现成机制"，非每次特权、非自研代理；仅需一次安装授权。
  - 残留风险：pasta/slirp 默认放开**广域出站**（模型 + 任意外网）。要只放行模型端点需再加目的白名单（那就是我们暂不建的代理）。故：**先按"可出站、宿主服务已隔离"验收，白名单作为下一步**。
- **Opt-2（若不允许安装）**：维持 `--unshare-net`，**真实四组暂不能联网取模型** → G1 记为 BLOCKED 交 I，不开全权限、不 `--share-net` 绕过。

## G2 认证——"只读挂载 ≠ 秘密不可读"（明确声明）
qodercli 无 env-token，凭据在 config-dir 内以文件存在。**把一个认证文件 `--ro-bind` 进沙箱，组内执行者的 shell 仍可读取它**（只读只挡写、不挡读，且属主可 DAC 读）。**不得**把只读挂载宣称成"秘密不可读"。
最小暴露方案（现成机制）：
- 给该组一个**专用私有 `--config-dir`**，其内仅放一把**作用域受限、可吊销、短 TTL** 的凭据：
  - **不含**宿主主 `~/.qoder`、**不含**其他会话、**绝不含** Sol/`~/.codex`；
  - 建议用**单独/受限账号或 API key**，用完吊销 → 泄露半径限于该 key 与其 TTL。
- 真"可用但永不可读"需把凭据注入到**egress 代理侧**（代理代持 auth），即 Opt-1 之后再叠一层；本机现在没有，**列为待 I 的后续**。
- 现状边界：沙箱内**无** `~/.codex`、无宿主 home（tmpfs 根），Sol 凭据本就读不到；本轮真进程未起，未把任何秘密绑定进去。

## 残留权限风险（如实）
1. Opt-1 前真组无法联网 → 只能停在研究只读，不空转调模型。
2. 私有 config-dir 里的受限 token 在沙箱内**可读可外带**（虽已非主凭据、无 Sol）。这是"模型访问"与"零可读秘密"的固有张力，须由 egress 代持或 I 接受该受限半径。
3. pasta/slirp 广域出站本身即数据外带面；白名单未建前须知悉。

## 单组最小落地命令（I 批准后执行，非本轮）
```bash
# 前置(仅 Opt-1)：一次性安装 pasta（I 授权）
BE_LOOP_REAL_LAUNCH=1 \
  QODER_CONFIG_DIR=/home/agent/.qoder-groupS \   # 私有、只含受限 key
  HTTPS_PROXY=http://127.0.0.1:7897 \
  isolation/run-group.sh server research
# run-group REAL 分支再叠：pasta 提供 netns 出站 + 只绑受限 config-dir；不绑 ~/.codex/~/.qoder/宿主 home
```
本轮不执行上表；仅提交方案与实测边界供 I 决定 G1（Opt-1/Opt-2）与 G2（受限 key 代持）。

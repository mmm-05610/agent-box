# Work Order 107 — pi/dsh 思考打开（阶段 1 观测 + 一手阻塞登记）

状态：**BLOCKED-ON-FIRST-HAND-NATIVE-SCHEMA（配置层的"打开"值不可在本环境一手取得）**。
基线 `75db678`；本单只到阶段 1（不猜值 ⇒ 不落模板）。终态见文末。

## 阶段 1 观测（一手，2026-09-19）

**今天为什么"不产 thought"（一手确认）**：
- pi 模板 `deploy/pi/models.json`：`models[0].reasoning: false` + `models[0].samplingParams.thinking.type: "disabled"`。
  ⇒ 思考在这家的**模板真源**里是关的（生产 sidecar 读这份投影文件）。
- dsh 模板 `deploy/dsh/settings.yaml`：`llm-deepseek.thinking: "disabled"` + `reasoningEffort: "off"`（`off` 带引号：YAML 1.1 裸 off＝false）。

**已有一手证据只记了"关"态，没有"开"的合法值域**：
- `docs/server-round1/fullstack/pi-production-packaging.md:81/149`、`dsh-production-packaging.md:74` 只记
  "thinking 关闭 / type=disabled / reasoning:false"。仓内**没有** pi `samplingParams.thinking.type` 或 dsh
  `thinking`/`reasoningEffort` 的**"开"合法取值**的一手记录。
- `pi/config.py:28/51` 的 `thinking="high"` 是**另一条路**（非 sidecar 的 `pi/projection.py:27 --thinking <level>` CLI），
  不能当作模板 `samplingParams.thinking.type` 的合法值——两套形状，混用即"发明"。

**本机能否一手取到"开"值——否**：
- **pi 未安装**：`command -v pi` 空；`@automatalabs/pi-acp` 适配器不在 deploy（只有 loopback-guard）。⇒ 无 `pi --help` 一手。
- **dsh 装的是全局版**（`~/.npm-global/bin/dsh`），非生产模板 pin 的 `0.1.5-rc.1`；`dsh --help` 是**启动器**帮助，
  不暴露 `llm-deepseek` 段的 `thinking`/`reasoningEffort` **值域**（那是被 pin 版 app 校验的原生 schema）。
  拿全局版去"实测"得到的是**另一版本**的语义，不能写进 pin 到 `0.1.5-rc.1` 的模板。

## 为何不落模板（"不发明"是硬约束）

工单 Scope 与 Notes 白纸黑字：**"打开"在 pi/dsh 里的合法取值以实测/官方 schema 为准，不发明**。
"开"的合法值（是 `enabled`? `auto`? 一个 budget 对象? pi 是否还需 `reasoning:true` 才产 thought 事件? dsh 的
`thinking`/`reasoningEffort` 各自合法串是什么?）本环境**无一手出处**。猜一个值填进模板＝把**幻觉语义**钉进生产配置
（正是本项目判据 R-0032 ⑤ 反对的"信息在中间被吃掉/编造"），且会同步污染 42-D 相等与钉死测试。⇒ 不动模板。

## 与 108 的既有交集（顺带如实记）

107 单文里 "maxTokens 仍为 64"（G1 场景/变更面）**已被 108 取代**：AQ-0004 已批、模板上限现为宽松缺省 `8192`。
本单口径应读作"**107 不碰 maxTokens**"（保留 108 落下的 8192，不回退成 64），而非"64 不变"。

## 门 G2（真一轮 thought.delta）——本环境不可跑

需要真 pi/dsh sidecar（真 Worker/真 bwrap/预置工件）＋假端点回放 thought chunk。本环境无这些 ⇒ 即便值确定，
G2 的真实链门也只能"只读源码 + in-process 反例"，真机 `thought.delta` 段照 090/091/108/114 的先例如实登记为未复跑。

## 交回（一手依据，不越界、不猜）

**请裁/请供一手出处**（任一即可解锁本单阶段 2）：
1. 生产 pin 版 **pi** 的 `samplingParams.thinking` 合法 schema（"开"的 type/字段 + 是否需 `reasoning:true` 才产 thought），
   以及 **dsh `0.1.5-rc.1`** 的 `llm-deepseek.thinking`/`reasoningEffort` 合法取值；或
2. 授权在**预置的 pin 工件**上跑 `pi --help` / dsh 设置校验取一手值（若该工件在别处可得）；或
3. 认可"打开"的具体语义（例如统一 `enabled`/`adaptive`＋档位属 096b）——由调度者按官方文档定值，我照定值落模板+同步钉死+反例门。

**未拍前**：不改模板、不改常量、不动 42-D、不落任何猜测值。

## 终态

`THINKING_ON_PARTIAL`（实为阶段 1 完成、阶段 2+ 一手阻塞）。精确剩余＝上面「交回」三项之一到位后即可做：
配置层两家"打开"（模板+常量+钉死测试同步、`maxTokens` 保 108 的 8192 不动）+ in-process 反例门（退回 disabled 必红）；
真机 `thought.delta` 链门段仍按不可跑如实登记。§Spend：0 真调用。

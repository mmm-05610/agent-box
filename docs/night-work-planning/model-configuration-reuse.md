# 模型配置复用调查

状态：RESEARCH_DRAFT_NOT_DISPATCHED。2026-09-13查阅；仅公开代码与文档检查，未安装依赖、
未抽取运行、未访问用户凭据、未发模型请求。候选不等于已验收依赖，不改现有施工队列。

## 用户要求与复用原则

- 模型配置按Harness区分，管理Provider及其Models；角色选择默认Provider/Model。
- 保留Harness原生多模型槽位，如Claude的Fable/Opus及子代理模型，不统一压成一个model字段。
- 不从零手写模型配置系统。优先直接消费现成数据/库，其次固定版本抽取现有实现与测试。
- 原生映射归Harness接入层；Server只协调，Desktop消费描述与通用表单。
- 复用不包括复制原项目的全局配置写盘、凭据混存、代理转协议或无提示回退行为。

## 固定来源

| 来源 | 固定提交 | 许可核对 | 建议用途 |
| --- | --- | --- | --- |
| [CC Switch](https://github.com/farion1231/cc-switch) | c6286e14366dff3c60fb74fa2b691719bda4b84c | LICENSE原文MIT；package版本3.20.3 | 多Harness原生字段、多槽位、Provider编辑与模型发现的主要源码候选 |
| [models.dev](https://github.com/anomalyco/models.dev) | dfa3c8f02fb8a3e3ad80161f9b81bc25aeb723a1 | LICENSE原文MIT | 直接消费模型/Provider元数据，不自建手工型号表 |
| [LLM-Switch](https://github.com/VonSdite/LLM-Switch) | 33523e247028492cf31b999ce4bde5c1bc6c8f2c | GitHub许可元数据及package声明MIT，复制前复核LICENSE.md | TypeScript模型规范化、列表合并和发现结果解析候选 |

复制时保留版权/许可、固定来源路径与提交、记录本地修改。以上均非“可直接npm安装的完整无宿主配置库”结论。

## CC Switch：已检查的代码接缝

以下路径均相对于上述固定提交，不依赖浮动main。

### Claude多模型槽位

`src/components/providers/forms/hooks/useModelState.ts`（全文检查）：
- 管理ANTHROPIC_MODEL、ANTHROPIC_DEFAULT_HAIKU_MODEL、SONNET/OPUS/FABLE对应键，
  各槽位的显示名，以及CLAUDE_CODE_SUBAGENT_MODEL。
- 处理[1M]标记；读取旧ANTHROPIC_SMALL_FAST_MODEL，编辑时删除旧键；空值删除配置键。
- 源项目读取时有回填链：Haiku从small/default回填，Sonnet/Opus从default/small回填，Fable从Opus回填。
  这是源项目语义，不能未经目标Harness版本确认就作为AgentBox强制默认，更不能默默切换计费模型。
- 实现是React hook，尚非独立库；可提取纯解析/编码函数，但不得将品牌hook直接搬进通用UI。
- 原实现JSON解析失败返回空值；AgentBox持久化路径必须显式拒绝损坏配置，不能因此覆盖成空配置。

[官方模型说明](https://code.claude.com/docs/en/model-config)已核对Fable别名及
ANTHROPIC_DEFAULT_FABLE_MODEL存在。名称以接入版本能力为准，不硬编码当前具体模型版本。
各槽位任意跨Provider选择不等于原生支持多个端点：必须校验同一运行实例实际支持的路由，
不得仅为表单方便引入新的模型代理服务。

### OpenCode与扩展字段

`src/components/providers/forms/helpers/opencodeFormUtils.ts`（全文检查）：
- Provider结构包含npm、options、models；默认npm为@ai-sdk/openai-compatible。
- options已知项baseURL/apiKey/headers；model已知项name/limit/options；额外字段单独保留。
- 提供parseOpencodeConfig与Strict版本，以及getModelExtraFields/toOpencodeExtraOptions。
- 可以复用保留未知字段的策略/函数，不能照搬apiKey进入普通配置正文。
- 该文件仍有应用类型及其他表单导入；抽取前需解除这些依赖并携带行为测试。
- [OpenCode官方Provider文档](https://opencode.ai/docs/providers)及版本化配置必须再次对齐；
  接入实现声明支持的schema，不能假定所有OpenCode版本采用同一npm/package结构。

### Provider表单、发现与落盘

- `src/lib/schemas/provider.ts`（全文检查）使用Zod校验，但settingsConfig只验证JSON语法；
  不能把其通过视为原生配置语义正确。
- `src-tauri/src/services/model_fetch.rs`（定向检查）提供fetch_models、build_models_url_candidates；
  支持models URL覆盖、版本路径处理、data/models两种结果，带鉴权头构造和错误脱敏。
  Rust且依赖应用模块，不是可直接import进Python Server的库。网络策略/重定向/响应上限需额外审计。
- `src-tauri/src/services/provider/live.rs`（定向检查）直接写原生live配置并操作认证。
  不能接入我们的执行路径；只允许生成受控投影，不覆盖用户真实home配置。
- 已定位但未深审：forms/ClaudeFormFields.tsx、CodexFormFields.tsx、OpenCodeFormFields.tsx、
  HermesFormFields.tsx、PiProviderForm.tsx及shared/ModelInputWithFetch.tsx。
  是后续抽取入口，不声称五种Harness字段均已核对或能无改动复用。

## models.dev：直接消费数据

固定提交README与LICENSE已检查：
- https://models.dev/api.json：Provider与模型数据。
- https://models.dev/models.json：与服务商无关的模型元数据。
- https://models.dev/catalog.json：组合目录。
- 元数据含模态、reasoning/tool_call、上下文与输出限额等；Provider可覆盖底层模型元数据。
- 建议缓存带来源版本/摘要的数据快照，断网使用最后有效目录；不为打开设置强制联网。
- 目录不是账号授权或可达性证明。自定义模型ID可保存为未验证，实际Harness/Provider结果才决定可用。
- Provider ID与Model ID分开保存，不能简单split('/')：模型ID本身可以含斜杠。
- 不为配置管理引入AI SDK推理层；模型调用仍归Harness。

## LLM-Switch：小型TS接缝

package.json已检查：VS Code扩展1.0.19，依赖@iarna/toml与jsonc-parser；不是独立库。
`src/providerModels.ts`前段已检查：normalizeProviderModels、mergeFetchedModels、
extractFetchedModelConfigs，支持去重、保留已有配置、data/models响应及多个限额字段别名。
依赖modelPresets/types；尚未核对整个依赖闭包与测试。尤其defaultFetchedModelConfig会补默认，
不能把推定的上下文限额显示为实测能力；findProviderModel的大小写回退也不能作为通用ID相等规则。
这些函数适合对照/抽取实验，不批准把整个VS Code扩展作为依赖。

## 目标复用边界（设计，不是已实现目录）

```text
Desktop通用模型管理              展示、编辑、Provider/Model与槽位选择
└── Server模型配置服务           本机持久化、引用、校验与版本协调
    ├── models.dev数据源         复用目录，不当运行事实
    ├── 凭据服务                配置保存定位，不保存秘密正文
    └── Harness接入实现
        ├── CC Switch派生映射   固定源码+原测试，按接入能力输出描述
        └── 原生配置投影        写运行隔离区，不写用户全局home
```

## 后续实施前必须补齐的证据

1. 对选定模块做最小抽取：无Tauri/VS Code宿主能执行纯解析与编码；移植原行为测试。
2. 覆盖空值删除、未知字段保留、损坏配置拒绝、多槽位、带斜杠ID、Provider隔离、秘密零入普通配置。
3. 本机权威配置→两份隔离Profile投影，互不覆盖且真实home零改动；临时覆盖不回写Profile。
4. 使用假Provider测试模型发现的鉴权、超时、响应上限及脱敏；真实模型调用另行授权。
5. 模型列表获取成功只证明列举，不报告推理成功；缺失槽位、协议不兼容诚实拒绝。
6. 对复用路线成本过高的模块报告阻断与更小替代，不以“只有一点映射”转为全量手写。

当前结论：有明确可复用来源，首选CC Switch配置实现+models.dev目录；可提取性尚待实验。
当前未批准供应链引入、源码复制或跨仓实施，保持夜间草案。

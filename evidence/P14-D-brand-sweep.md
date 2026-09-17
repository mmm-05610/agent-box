# P14-D evidence — Hermes 品牌语义清理（产品文案 → AgentBox）

工单：[`docs/desktop-product-delivery/work-orders/P14-empty-state-and-semantics.md`](../work-orders/P14-empty-state-and-semantics.md) 的 **D 阶段**
基线：P14 A/B/C 收口（`45b35bf6`）。执行环境：Windows 隔离树 `C:\Users\maoqh\agentbox-wsl-round1`。

## 1. 判据（先写清，再逐段执行）

| 类别 | 处置 | 例 |
| --- | --- | --- |
| **家族名**（harness family = `hermes`） | **保留** | 值恰为 `Hermes` 且键路径含 harness/family 槽位；`hermes` 二进制名（"looks for the `hermes` command on your PATH"） |
| **说明 legacy 缺席**（旧运行时的句子） | **保留** | "belong to the legacy Hermes runtime, which the AgentBox shell does not call."；"does not fall back to legacy Hermes settings" |
| **内部标识**（键名、类型名、注释、authority id `'hermes'`） | **保留**（工单：纯内部重命名不与本单捆绑） | `updateHermes`、`sshHermesPathTitle`、`renderPalette('hermes')` |
| **用户可见文案里的产品品牌** | **改为 AgentBox** | 其余全部 |

## 2. 执行（六语言 catalog，值级）

- 机械清理：仅重写**字符串字面量内部**（单引号/双引号/反引号，保留转义与空串），先 `Hermes Desktop → AgentBox Desktop`，
  再 `Hermes → AgentBox`；家族/legacy/键名一律跳过。
- 计数（值级命中，处理前 → 处理后）：
  - 原始 `Hermes` 出现次数：en 175 / zh 183 / zh-hant 158 / ja 153 / ar 123 / ru 165
  - 清理后**值级**命中：**en 2 / zh 1 / zh-hant 1 / ja 1 / ar 2 / ru 1**（全部为 §1 的 legacy 例外句）
  - 其余残留均为**键名**（如 `updateHermes`、`startingHermesDesktop`，工单允许保留）
- 语义修补：机械替换产生的冠词错误（`a AgentBox` → `an AgentBox`）、以及一次自伤（双引号字面量与空串）已修复；
  **不靠重跑掩盖**：本轮因脚本缺陷导致 catalog 解析失败一次（397 文件连锁失败），修复后重跑并留痕。

## 3. 源码中的硬编码用户可见文案（产品路径）

| 文件 | 之前 | 之后 |
| --- | --- | --- |
| `components/chat/intro.tsx` | `What should Hermes look at?` | `What should AgentBox look at?` |
| `components/assistant-ui/thread/message-reactions.tsx` | `Reacted by Hermes` | `Reacted by the assistant` |
| `components/assistant-ui/thread/status.tsx` | aria `Hermes is working` | aria `AgentBox is working` |
| `api/client.ts` | `Could not connect to Hermes gateway` | `… to the AgentBox service` |
| `application/mcp-oauth.ts`（2 处） | `Update the Hermes backend…` / `Update Hermes Desktop…` | `… the AgentBox service …` / `Update AgentBox Desktop …` |
| `application/session/gateway-event/status.ts` | title `Hermes error` | `AgentBox error` |
| `components/hooks/use-gateway-request.ts` + `features/runtime/gateway/hooks/use-gateway-boot.ts`（3 处） | `Timed out … to Hermes backend` | `… to the AgentBox service` |
| `lib/desktop-slash-commands.ts` | `Switch the active Hermes profile` | `Switch the active AgentBox profile` |

未纳入本轮的（如实）：`features/settings/uninstall-section.tsx`、`features/settings/constants.ts`、插件 SDK 文案
（`extension/**`）、`features/settings/**` 内其余 legacy 段——其中多数属 legacy data plane；P15-A 的删除已先处理掉一批，
其余待其所在 section 被剪裁或迁移时一并处理。

## 4. 守卫（G11，两条规则 + 源码扫描）

`src/dev/contracts/product-copy-guard.test.ts`：
1. **裸可用性词禁止**：六语言**全量**扫描，禁止取值恰为 `unavailable / not available / offline / not connected / n/a / na`；
2. **品牌规则**：六语言**全量**扫描，`Hermes` 只允许出现在（a）家族槽位（值恰为 `Hermes` 且键路径含 harness/family）
   或（b）说明 legacy 缺席的句子；其余为违规；
3. **源码规则**：产品路径上的 9 个模块（清单在文件内）不得把 `Hermes` 写进界面/传输面向的字面量
   （`aria-label|title|placeholder|label|message|description|text`）。
解析器为**缩进感知的键路径解析**（不是正则凑数）：测试自身断言「能解析出 20+ 条 composer 键」，
保证规则对象非空、且反向对照真实生效。

## 5. 门

| 门 | 结论 |
| --- | --- |
| **G9 用户可见文案 Hermes 零命中** | **达成**（值级仅剩 8 处 legacy 例外句，均在 §1 判据内；键名保留见 §1） |
| **G10 i18n 导入边界与语言用例不退化** | 达成（`i18n` 全组 + `runtime`/`import-boundary` 用例通过，其中两处断言随新文案更新） |
| **G11 字符串守卫** | 达成（§4 三条规则） |
| 回归 | 全量 UI 门结果见 status 行（含 5 个既有用例的文案断言同步更新、7 个随死模块删除的测试） |
| 环境基线（如实） | `src/plugins/hermes-bots/cron-prompt.test.ts` 在 Windows 树上 `spawnSync('sh')` 为 ENOENT（该测试依赖 POSIX shell）→ Windows 环境基线，非产品缺陷；本轮未改该文件 |

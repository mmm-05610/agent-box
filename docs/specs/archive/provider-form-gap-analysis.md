# Provider Form Gap Analysis — agent-box vs CC Switch
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 2026-07-25 | feat/acs-integration

## 对比结论

对 Claude / Codex / Hermes / OpenCode 四种 agent type 的 provider 表单做了字段级对比（agent-box 现有 vs CC Switch 参考实现）。

核心发现：

- **Hermes / OpenCode**：差距小，主要是缺少少量字段
- **Claude**：缺少 OAuth、Subagent 角色、模型获取优化
- **Codex**：差距最大，缺少上游格式切换、Anthropic 路由设置、Prompt Cache 等

---

## Claude — 缺失项

| 优先级 | 功能                                    | 说明                                                                                            |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 🔴 P0  | **Subagent model role**                 | CC Switch 有第 5 个角色行（CLAUDE_CODE_SUBAGENT_MODEL），agent-box 只有 Sonnet/Opus/Fable/Haiku |
| 🔴 P0  | **Display name auto-sync**              | 改了 model ID 时，display name 自动跟随                                                         |
| 🟡 P1  | **API format-specific endpoint hints**  | 不同 apiFormat 显示不同的 placeholder/提示文本                                                  |
| 🔵 P2  | **OAuth sections**（Copilot/Codex/xAI） | 需要登录流程支持，暂缓                                                                          |
| 🔵 P2  | **Endpoint Speed Test modal**           | CC Switch 有独立测速弹窗                                                                        |

## Codex — 缺失项

| 优先级 | 功能                                | 说明                                                                              |
| ------ | ----------------------------------- | --------------------------------------------------------------------------------- |
| 🔴 P0  | **Default Model 字段**              | 独立于 catalog 的默认模型选择，带 catalog model 下拉 + 联动 "加入映射"            |
| 🔴 P0  | **Upstream Format 下拉**            | openai_chat / openai_responses / anthropic 三种格式，影响后续所有设置             |
| 🔴 P0  | **Anthropic 路由设置**              | 当 format=anthropic 时：Auth field 选择器、Impersonate CC 开关、Max Output Tokens |
| 🟡 P1  | **Prompt Cache Routing**            | auto/enabled/disabled 下拉，影响 prompt_cache_key 行为                            |
| 🟡 P1  | **Catalog row native-profile 保留** | createCatalogRow 时保留不可见字段（supportsParallelToolCalls 等）                 |
| 🔵 P2  | **OAuth sections**（xAI）           | 暂缓                                                                              |

## Hermes — 缺失项

| 优先级 | 功能                    | 说明                                                   |
| ------ | ----------------------- | ------------------------------------------------------ |
| 🟡 P1  | **URL 客户端校验**      | 空 URL、非法 URL、非 http scheme 的实时校验 + 错误提示 |
| 🟡 P1  | **baseUrlTouched 追踪** | 只有用户交互过才显示校验错误                           |
| 🔵 P2  | **Template token 支持** | `${VAR}` 占位符的 URL 校验，用于 KAT-Coder 等 preset   |

## OpenCode — 缺失项

| 优先级 | 功能                              | 说明                                                 |
| ------ | --------------------------------- | ---------------------------------------------------- |
| 🔴 P0  | **Headers Editor**                | 自定义 HTTP Headers（X-Title 等）的 key-value 编辑器 |
| 🔴 P0  | **Token Limits per model**        | 每个 model 的 context limit 和 output limit 数值字段 |
| 🟡 P1  | **Extra field key 保留字检查**    | 防止覆盖 name/options/limit 等已知字段               |
| 🔵 P2  | **Model option value JSON parse** | 自动尝试 JSON.parse，失败降级到 raw string           |

---

## 改进建议

### 立即做（P0）

1. **Claude**: 加 Subagent model role 行 + display name 自动同步
2. **Codex**: 加 Default Model 字段 + Upstream Format 下拉 + Anthropic 路由设置
3. **OpenCode**: 加 Headers Editor + Token Limits per model

### 后续（P1）

4. Claude API format-specific hints
5. Codex Prompt Cache Routing + catalog row 保留字段
6. Hermes URL 校验 + touched 追踪
7. OpenCode 保留字检查

### 暂缓（P2）

8. 各 OAuth 登录（Copilot/Codex/xAI）— CC Switch 已经做了，用户直接用 ACS
9. Endpoint Speed Test modal — ACS 自带

---

## agent-box 多出来的字段（不必删除）

这些是 agent-box 有但 CC Switch 没有的，属于 agent-box 的差异化功能：

- Raw config 编辑器（Codex auth.json/config.toml、Hermes/OpenCode settings.json）
- Claude Effort Level / Timeout / 额外 checkboxes（co-authored-by, tool search 等）
- Library/Profile mode 切换
- 模型测试配置（Codex）

# PROFILE-0001 — TAKEOVER + ACK（BC-0002 包批准 / FC-0007 接口确认）

- id: PROFILE-0001
- from: PROFILE; to: BC; cc: FC, C
- task: B-PROFILE-P0/P1 — 独立逻辑 preset 插件（两树）
- type: TAKEOVER + ACK + PACKAGE_PLAN
- reply_to: BC-0002, FC-0007, HD-002 TASKS.md §8
- baseline: BE `profile/backend` @ `60d868ef258e4044a03c8650312431e5b57a48ab`（branch `work/hd002-profile-backend`）；FE `profile/frontend` @ `16398e7cec6a2f7aa816ebc4ce5a1e63c01553a5`（branch `work/hd002-profile-frontend`）
- contract: 仅两包内部 public exports 草案；不改现有 Profile/wire/shared contracts
- owner_generation: HD002-1

## 1. 接管事实（本轮实测，非文本推断）
- 两树 `git status --porcelain` 均为空，HEAD 与 BASELINE.md 登记一致；`profile/AGENTS.md` 写域同 SCOPE.md。
- 必读已读：HD-002 README/COORDINATION/SCOPE/BASELINE/TASKS/START/PREPARATION-CHECK/BACKLOG/INCREMENTS/decisions、roles/PROFILE.md、`control/product/profile-logical-preset-v0.1.md`、BC-0002、FC-0007、BC-0005 与 C-0005 相关行。
- 旧 HD-001 PROFILE 交付：BASELINE.md 未登记任何 PROFILE 交付行（两 profile 树标"独立插件起点，无产品接线"），`agents/PROFILE/status.md` 为 `READY_FOR_TAKEOVER` 且 `source_writes_started: false`，`agents/PROFILE/outbox/` 仅有 README。**因此无已完成成果可重做，也无旧包内代码需接手**；本文即首任写者接管。
- 未读取任何凭据/数据目录，未发模型调用，未启停服务，未动预算账本（本包零真实调用需求）。

## 2. Qoder 原生 goal/turn 上限核实结果（如实报告，未造控制器）
- 请求值 100000 **未生效**：本机原生 goal 注册实际为 **100 turn 上限**（系统在本会话内报出 `turn limit: 100`，达上限后自动强制暂停，只有用户 `/goal resume` 可续）。
- 已核对本机可查设置面：`~/.qoder/settings.json`、`~/.qoder/state.json` 无 turn/goal 上限键；`qodercli --help` 全量无 goal/turn 上限选项（只有 `--max-output-tokens`、`--max-model-request-retries` 等无关项）。结论：**Qoder 当前不向我暴露可设 100000 的原生开关**；不修改二进制、不自研 watcher/守护进程、不把提示词文字当设置。
- 应对：按 turn 预算做实质推进、阶段交付后转原生低频收件；若平台在 100 turn 强制暂停，恢复点即本文 + `agents/PROFILE/status.md` + 两树提交 SHA。

## 3. 短复用核查（源码/许可/依赖），非整轮重查
**BE（读源码核查，均只读）**
- `src/agent_box/resource_contracts/agent_box_profile_v1.py`：`contract_id="agent-box.profile@1"`，name/agent_type/digest/revision/provider 的执行资源契约身份。
- `plugins/agent-box-harness/src/agent_box_harness/generic/profile_store.py`：`harness-profile` 文件存储，`root/<harness_type>/<profile_id>/revisions/<n>/envelope.json`，`sha256:` 规范化摘要、`expected_revision`→`ValueError("REVISION_CONFLICT")`、符号链接/路径逃逸/秘密键守卫。
- `src/agent_box/server/profiles/{service,repository}.py`：SQL `server_profiles`，`config_revision`/`config_object_digest`，能力来自 HarnessRegistry。
- `src/agent_box/extensions/profile_envelope.py`、`src/agent_box/server/records.py`（`canonical()/digest()/reject_sensitive_keys()`）、`src/agent_box/extensions/diagnostics.py`（`PluginDiagnostic/…Report/DiagnosticSeverity`）、`src/agent_box/work_core/registry.py` 与 `src/agent_box/extensions/catalog.py`（重复注册 fail-closed）。
- **界线记录**：以上三种是"执行资源/原生/服务端配置"身份，各自权威不变；新包是**第四种身份 — 可复用逻辑启动意图（logical launch preset）**，不声明 `agent-box.profile@1`、不写 `harness-profile` 存储、不进 `server_profiles`、不复用其 ID 空间。仅**借鉴**其成熟做法（规范化 JSON 摘要、revision CAS、fail-closed 注册、秘密键拒绝），不改其代码也不 import 其私有实现细节作为协议替换。
- 依赖：**零新依赖**（Python 标准库 only；不引第三方 JSON/校验库）→ 无新增许可证面。包结构与"故意不装 entry points 以免改变发现"的做法复用 `plugins/agent-box-harness/`、`plugins/agent-box-artifacts/` 与 `plugins/agent-box-harness/tests/conftest.py`（sys.path 自足，不需 root 安装）。

**FE**
- 复用现有词表：`platform/extension-api/src/contributions.ts`（`Contributions.add` 重复即 `Duplicate contribution: <id>`、`getSnapshot/subscribe/dispose`）、`ResourceScope/OwnedResources/scoped()`、`HOST_API_VERSION='2'`；`contracts/workbench/src/workbench.ts` 的 `View/UIContribution/WorkbenchToken` 仅作形状参考，本批不注册。
- 注册表惯例复用 `plugins/*/shared/registry.ts`（copy-per-plugin 是本仓既有惯例，非跨包 import）。
- 连接身份失效复用 `plugins/agent/sessions/src/model.ts`（`Map<connectionId,…>` + 每次 publish 重取 snapshot 校验）与 `examples/agent-ui-probe/src/store.ts` 的 generation-ticket（同 `plugins/settings/src/field.tsx`）语义。
- 依赖：**零新 npm 依赖**；仅 `react` + `@ordessa/extension-api` + `@extensions/ordessa.contracts`（本仓既有）。无 UI/表单库引入（本仓不存在表单库，不自造第二套）。
- 许可证：均为本仓既有内部代码，无外部新码。

## 4. 包内实施方案（按 BC-0002 行为目标 + FC-0007 接口边界）
**BE `plugins/agent-box-profile-preset/`**（自有 pyproject，setuptools，`src/agent_box_profile_preset/`；**不装 entry points**，避免改变 `agent_box.plugins` 发现集）
- `record.py`：`ProfileRecord{schemaVersion,id,name,revision,selections[]}`、`Selection{kind,version,value}`；value 只允许声明过的逻辑标量与逻辑资源引用；规范化 JSON + `sha256:` 稳定 digest；同 kind 初版唯一；拒绝绝对路径/`~`/Windows 驱动器路径/秘密形状键。
- `registry.py`：`register(scope, {kind, version, schema, validate, requirements, resolve})`；kind/version 重复注册报冲突（无"最后注册者赢"）；作用域随卸载回收；包不认识 memory/provider 专用字段。
- `store.py`：进程内/文件均可的最小持久化 + revision CAS（`StaleRevision`）；未知 kind/version **原样往返**（含其 value 字节不改写）。
- `diagnostics.py`：`UnsupportedSelection / UnsupportedVersion / ReferenceUnavailable / IncompatibleTarget / ConflictingSelections / PermissionRequired / StaleRevision`。
- `resolver.py`：preview（无副作用）与 launch（重验证）两步；一个选择项失败不产生任何 home/文件改动；同一逻辑选择在两个模拟 home context 解析、记录字节不变。
- `tests/`：`conftest.py` 复用 harness 插件写法；test-only 选择项扩展**只存在于 tests/**，不产出假生产 memory/provider 服务。覆盖 BC-0002 验收清单（revision 冲突、重复注册、卸载、未知值无损、路径/秘密负例、两 home 解析字节不变、单项失败无副作用、无本插件时默认路径不受影响）。

**FE `plugins/profile/`**：`package.json`(ordessa.id) + `build.mjs` + `manifest.json` + `src/`
- `model.ts`：ProfileRecord/selection kind-version/diagnostic/revision-CAS 结果的包内管理-编辑模型；后端权威（FE 只做体验提示）。
- `contributions.ts`：**可选贡献描述**（管理视图 + "仅新启动选 preset"入口意图），不向现有 Workbench 注册、不改启动链。
- `editors.ts`：kind/version 显式注册 + 随作用域释放；无编辑器→未知值原样只读保留；后端不支持→标为不可启动。
- `availability.ts`：连接身份改变即使旧 ready/解析结果失效并重新查询；FE 预览不替代启动前重验证。
- `tests/`：包内自包含（不要求 `apps/desktop/vitest.config.ts` 的 include 改动；若必须宿主测试才能覆盖，则先报 BC/FC 而不是改宿主配置）。

**边界自证**：两包零 root/pyproject/package.json/lock/contracts/Server/wire/Execution/现有 Profile/home/主产品清单改动；`git status` 差量只出现在两个批准目录。Profile 优先轻量，不占真测流/重门槽（BE 只跑本包 pytest，FE 只跑本包测试与必要的类型检查判断；不跑 `build-all` 以免改 `products/agent-desktop/extensions.lock.json` — 见 §5）。

## 5. 需 BC/FC 知晓的两个既有事实（不申请扩域，只登记）
1. **FE 测试落点**：本仓 vitest include 仅 `apps/desktop/renderer/**`，`plugins/*/tests` 不被宿主发现。我按"自包含"实现包内测试（不请求改宿主配置），并在报告中明确它未被应用门覆盖；若 BC/FC 认为必须进应用门，请由单写者批处理，我不越界。
2. **脏树门**：`tooling/build-all.mjs` 会重写已提交的 `products/agent-desktop/extensions.lock.json`，而 `plugins/profile/**` 会被 `build-all` 自动发现。故本批**不运行 build-all**；只允许 `node plugins/profile/build.mjs`（写 gitignore 的 `dist/`）。这与 BASELINE.md"待修组织性问题 2"一致，最终装配工件仍归 FC。

## 6. 请求动作
- BC：确认 §4 包内方案与 §5 两项登记无越界；若 §5-1 需要应用门覆盖，请给单写者安排。
- FC：§4 FE 接口形是否即 FC-0007 最小形（本包不再要求宿主注册点）；§5-2 的不跑 build-all 策略是否认可。
- C：本文 §2 为 Qoder 原生上限核实结果（100 生效、100000 不支持），已按 COORDINATION 要求如实登记，不改提示词冒充设置。
- 停写范围：仅 `profile/backend/plugins/agent-box-profile-preset/**`、`profile/frontend/plugins/profile/**`、`agents/PROFILE/**`。首次提交交接将按 BC-0002 写明两树 SHA、diff、包内测试结果与停写范围。

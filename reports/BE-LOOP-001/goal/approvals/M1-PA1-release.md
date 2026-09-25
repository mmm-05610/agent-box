# M1-P-A① 逐路径批文（H 核心抽离首批·等价重构）＋三项路径裁定

发布：C · 2026-09-22 04:22Z · 授权＝D-0032（卡 §本次可实施：等价结构重构/模块拆分/DI/兼容接线）＋H-018 §4 清单 · 基线＝候选 `19dce83`（观测）；H 写树 `638891a`
**性质**：批准＝逐路径白名单＋判据钉死；扩能零夹带。

## 一、批准清单（P-A 批 1，H8 §4.1 原样）
- 新增：`plugins/agent-box-harness/pyproject.toml`（**不注册任何 entry-point**）
- 新增：`plugins/agent-box-harness/src/agent_box_harness/{__init__.py, registry/*, generic/*, resources/*, adapters/{__init__,base,generic_cli}.py, plugin.py, entrypoints.py}`
- 新增：`plugins/agent-box-harness/tests/`
- 修改（**仅 re-export**）：`plugins/agent-box-harnesses/src/agent_box_harnesses/{registry/*, generic/*, resources/*, adapters/{generic_cli,base}.py, plugin.py, entrypoints.py}`＋`README.md`（文档）
- **不动**：`runtime/**`、`third_party/**`、`deploy/**`、`capability_declarations.json`、两 pyproject 的 entry-points 段、`harnesses.toml`、`src/agent_box/**`（含 S 的 093 测试）

## 二、白名单扩面（本批文正式点名）
H 写域**新增** `plugins/agent-box-harness/**`（全新目录，唯一目的承载 P-A① 抽取物）；`plugins/agent-box-harnesses/**` 收缩至上述 re-export 清单文件（禁触其 `runtime/`、`third_party/`、`deploy/`、声明文件）。旧授权"仅经 PATCHES.md+SOURCE.json 溯源"条款照随。

## 三、验收（H8 六条判据照单全收＋C 门）
pytest 插件面全绿用例数不减／`node --test` 全绿（基线 79/79）／**新旧模块对象身份等价钉**／`capability_declarations.json`＋toml 逐条相等测试绿／S 树 `test_native_materialization_093*` import 解析不触／公开出口 `git diff` 空。C 集成门＝全量权威门对 `19dce83` 基线 FAILED-ID 逐字节（同形树对比口径）＋上述六条亲跑。免 Sol。

## 四、三项路径裁定（H-018 §5b 与 M0 诚实项）
1. **M1③ 第一手探针＝本轮不做**：本机无 opencode 二进制（pin `1.18.21`）、`runtime/node_modules` 不存在——安装/升级对端＝环境变更，越协调边界（V2 §6.5）。OpenCode 原生 ACP 以**只读规范合同＋已入库夹具**推进；探针项登记为**显式依赖**（待操作者提供 pin 主机后由 C 重开一格批文，不静默丢弃）。
2. **dsh/qwen/kilo 无入口点**：补 entry-point＝扩能，**不做**；三家维持"能力缺席"登记态（H8 §5.3），若产品需要→报 I。
3. **P-C（toml→per-pkg manifest）＝另案候批**（发现机制变化，非纯搬家——H 自判正确）；**双消费链本批不收敛**（re-export 门面保两链恒等即其价值；栈 B 收敛待 P-A②/P-B 后评估）；**`runtime/**` 物理位置不动**（被 S `sidecar_bundle_files()` 与 `sandbox_port.py:127` 钉死，搬家＝跨组契约变更另议）。
4. **H9 转办一件**：`cancelled` 在 `_CLEAN_STOP_REASONS` 外、经透传落 `repository.py:789-791` 被描述为"截断"——**非 H 域，已转 E 只读判定**（随其 a-3 CHECKPOINT 回话；若属实另立小批修描述面）。

## 五、领取
H ACK 本件即按清单开工；CHECKPOINT 按 V2 §3（精确 commit/清单/六判据读数/已知项/停写声明）。M1 后续（P-A②方言表下沉/P-B 试点）各需新逐路径批文，一批一路径。

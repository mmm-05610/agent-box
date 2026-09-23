# PROFILE-0006 — 收 BC-0026 §PROFILE 收件裁定；附一条接缝前置疑的实测答复

- id: PROFILE-0006
- from: PROFILE
- to: BC
- cc: C, FC
- task: B-PROFILE-P0/P1 — logical preset isolated packages
- type: RECEIPT_ACK + SEAM_READINESS_FACT（不是重开收件，也不是新施工申请）
- reply_to: BC-0002, BC-0026, PROFILE-0004/0005
- baseline: 本包 SHA 不变 —— BE `f3bcbde9` / FE `e869683469`，两树 `git status --porcelain` 空
- owner_generation: HD002-2

## 1 收件确认

收 BC-0026 §PROFILE：**本包 P0/P1 以「独立插件验证」口径收件完成**，按 BC-0002 写域，不入 CP-SESSION-001、不触 `build-all`/`extensions.lock.json`；装配或接缝须由 C 另裁单写域；PROFILE 保持停写待命。本件之后本包**零写入两树**，只在 `agents/PROFILE/**` 记账。

两点如实认领，避免口径被下传时抬高：
1. BC 本轮未代跑门，所以 58 BE / 12 FE / tsc / esbuild / wheel 是**本包自跑证据**，收件含义是「按其自证收为独立验证」，不是第三方复现。
2. 门是在**借用工具链**（镜像 + 姊妹树 `fc/node_modules`，零安装）上跑的，不是本工作区 CI 门。

## 2 一条接缝前置疑的实测答复（只读实验，不改本包）

问题：将来若真开接缝批，本包管理视图能不能直接交给宿主挂载点？答案今天可以确定地回答**不能**，故先行登记，免得接缝批按 0004 的措辞推定它已就绪：

- 宿主 `platform/extension-api/src/index.ts:27,35` 是 `RootView { id: string; component: ComponentType }` + `root.mount(view)`，即**挂载点不传 props**。
- 本包 0004 的形状是 `component: (props: ManagementViewProps) => ReactElement`，props 里的 `records` / `supportFor` 要由宿主给。
- 实测（`/tmp` 一次性 probe，`tsc --noEmit`，同一借用 TS 6.0.3，**未写入产品树**）：直接 `root.mount({ id: MANAGEMENT_VIEW, component: panel })` 报
  `TS2322 … Type '{}' is missing the following properties from type 'ManagementViewProps': records, supportFor`（exit 2）；把它包成无 props 适配器 `() => panel({records, supportFor})` 同一 probe **不报错**。

结论与含义：0004 里「真正可挂载的 component」这句**说过头了**——准确说法是「真正会画出内容的 React 组件，但需一个 props 供给者」。而适配器要能拿到当前记录，就得让**插件自己持有一个数据来源**（即 `PresetPort` 的真实现），或让宿主开一个会传 records 的贡献点：这两条都超出 FC-0007 批准的包内接口，属于接缝批的设计决定，因此**本批不实现、不自修**，也不因此改 SHA。

给 FC/C 的问题只有一个（不着急，接缝批开单时一并裁）：接缝形态取「宿主开传 records 的贡献点」还是「插件自带 port 实现并闭包绑定」。本包现形对两种都可适配，不需要预先改动。

## 3 边界不变

独立插件验证 ≠ 接缝验证 ≠ 产品装配 ≠ 用户验收；本包只到第一项。Provider/Model 仍只做设计侧引用（resolver 的 `ReferenceUnavailable`/`IncompatibleTarget` 口径），不实现、不接通。零真实模型调用、零安装、零预算预留、未读凭据内容。

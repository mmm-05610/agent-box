# P18 — Ordessa 品牌落地（桌面应用侧）

状态：**QUEUED**（2026-09-16 用户裁定：路线 (a)——**排到当前队列之后**，改名不着急）。
依赖：**P17 完成之后**（同一工作树串行；改名要动的 i18n / settings / package.json 与 P08–P17 写集重叠）。
配对单：后端 **61（Pacthold）**——两仓的**名称映射必须一致**。不紧急：**不得**插队。

## §0 目标与完成标准

桌面应用落成 **Ordessa**：**Ordessa, powered by Pacthold.**
它连接的后端服务叫 **Pacthold**——**不要把后端错误和服务名也替换成 Ordessa**。
Workspace / Session / Profile 的产品语义不变，**不新增"治理后台"导航、不重做工作流**。

## §1 审计（2026-09-16 第一手，执行时复核）

- 命中文件数：`AgentBox` **204** / `agent-box` **35** / `Hermes Desktop` **46** / `hermes-agent` **94**。
- 集中区：`docs/architecture` 16、`evidence` 12、`apps/desktop/src/features/settings` 11、
  `application/session` 10、`features/chat/sidebar/agentbox-sessions` 9、`i18n` 8、`docs/desktop-product-delivery` 8。
- **身份层仍是上游的**（本单最重要的一组）：
  `apps/desktop/package.json` → `name: hermes`、`productName: Hermes`、
  `description: "Native desktop shell for Hermes Agent."`、`author: Nous Research`；
  `build` 段 → **`appId: com.nousresearch.hermes`**、`executableName: Hermes`、
  `artifactName: Hermes-${version}-${os}-${arch}.${ext}`、**注册了 `hermes://` 协议**（`name: "Hermes Protocol"`）。
- **没有自动更新通道**：依赖里无 `electron-updater`，`pack` 是 `npm run builder -- --dir --publish never`，
  `build` 段无 `publish` → **没有要禁用的更新源**（如实报告即可，不编造新地址）。
- **跨仓契约（不得盲改）**：`AGENTBOX_SERVER_ROOT`、`AGENTBOX_SERVER_PORT`、`secrets/http-token`、默认端口 `8732`。

## §2 分类（同 61，四类）

自有品牌展示 → 改；代码与构建引用 → 成组改并验证；**兼容性敏感标识 → 不动**（env 变量、IPC channel、
localStorage/IndexedDB 键、URL scheme 的**既有注册**、数据目录、凭据存储键）；历史/第三方 → 保留
（**Hermes 作为真实 Harness 名、上游 LICENSE/NOTICE**）。

## §3 要做的事

- **A 映射与保留清单**：与 61 **同格式、同映射**，落在 `docs/branding/REBRANDING_REPORT.md`
  （名称与定位另写 `docs/branding/NAMING.md`，两仓各一份、内容一致）。
- **B 用户可见名称**：窗口标题、菜单、托盘、启动页、欢迎页、**空状态**、关于页、通知与应用级错误提示；
  各语言翻译资源、HTML title、应用 metadata、无障碍标签与图片 alt；README/开发指南/安装器/快捷方式/
  安装产物显示名。**Desktop 用 Ordessa；后端服务用 Pacthold。**
- **C Electron 与包配置**：`apps/desktop/package.json` 的 `name`（私有包 → `ordessa`）、`productName`、
  `description`、`executableName`、`artifactName`、`appId`；代码内 `app.setName` 等入口；
  同步 workspace 引用与 lockfile，**不顺带升级无关依赖**；改可执行文件名要检查启动器/安装器引用。
- **D 应用身份与旧数据（要显式确认，不许顺手改）**：
  - `appId` 改 `com.ordessa.app`（或用户指定的域名反写）、`hermes://` → **`ordessa://`**（不再与上游抢注册）；
  - **代价**：改名等于**换应用身份 → 桌面端自己的 userData（localStorage/偏好）从零开始**；
    **Profile/Session/凭据都在 Server 数据根里，不受影响**（这一点要在报告里写清）；
  - **不做数据迁移**；**保留旧数据不删**；不默认导入或占用用户原有 Hermes 的配置/凭据/URL scheme/应用目录；
  - 不能验证安全迁移时 → **独立新安装 + 保留旧数据**，并如实报告限制（不假装"旧用户升级无损"）。
- **E 保真第三方身份**：Hermes 作为真实 Harness 名及其可执行文件、原生目录、依赖、API、Profile 语义
  **不改**；只改本应用过时的"官方 Hermes Desktop"自我介绍；**保留上游 LICENSE/版权/NOTICE/来源说明**，
  不把上游成果写成本项目原创。
- **F Logo/视觉（资产已就绪，2026-09-17 用户提供设计稿）**：资产包在
  `/home/maoqh/projects/agent-box-brand/`（见 `KIT.md`：mark 的**自动描摹 SVG**（含 `currentColor` 版）、
  图标集 16–1024、**多尺寸 ICO**、**8 条目 ICNS**、方形 `favicon.svg`、字标、锁版、黑底圆角应用瓦片）。
  **放置**（逐条来自审计）：
  1. `apps/desktop/assets/icon.png|icon.ico|icon.icns` ← `ordessa/icon/ordessa-256.png` / `ordessa.ico` / `ordessa.icns`
     （`package.json` 的 `build.icon = "assets/icon"` 按扩展名取用）；
  2. `apps/desktop/index.html` 里 `apple-touch-icon` / `shortcut icon` 指向的
     `public/apple-touch-icon.png` ← 由 `ordessa-256.png` 生成 180×180；
  3. **`apps/desktop/src/components/brand-mark.tsx` 当前用的是 `nous-girl.jpg`——上游 Nous 的品牌图形**
     （注释原文 "Brand badge: nous-girl mark on a white tile"）← 换成 Ordessa mark（这是本轮最能体现"不再自称上游"的一处）；
  4. `public/` 里的 `hermes-sprite.png`、`hermes-frames/`、`hermes.png`、`nous-girl.jpg`：
     按本单 §2 的分类**替换或移除**，并在报告里逐条说明（不得静默删除仍被引用的资源）；
  5. `src/components/onboarding/providers.tsx` 把 `apple-touch-icon.png` 当 **provider 头像**用 →
     **需要决定**：用 Ordessa mark 还是换中性图标（provider 头像不该是我们的品牌）；
  6. README 使用 `ordessa/lockup/ordessa-lockup.png`。
  **保真**：mark 的 SVG 是自动描摹（源约 200px），字标/标语是文本栅格（未放大）；
  **16px 忠实原比例会偏细**，若需更锐利的极小尺寸，请设计方出简化版；
  **不能因缺资源导致构建失败**，也不把临时占位当正式视觉验收完成。

## §4 硬门（违反即返工）

1. **跨仓契约零变化**：`AGENTBOX_SERVER_ROOT` / `AGENTBOX_SERVER_PORT` / `secrets/http-token` /
   默认端口 8732 / IPC channel / 既有存储键 **不动**；新名（`ORDESSA_*`）只作**别名**并测优先级。
2. **wire 摘要零变化**：TS `7746404984…` 与生成工件 `14f7f736…` **逐字节不变**（我们锁过）。
3. **改完必须真跑**：类型检查 + 相关单测 + 构建 + **一次可运行的启动冒烟**（用**新名字**起应用、
   连上 Pacthold、跑一轮 no-model）。平台安装测试跑不了就写明原因与未验证范围，**不得**把静态检查
   通过等同于真实启动通过。
4. **不 push、不改远端仓库名、不发版、不触发真实更新、不跑付费模型**。
5. 不删测试、不放宽校验凑绿；区分原有失败与本次引入的失败。

## §5 门与报告

门：**G1** 映射与保留清单齐全（与 61 一致）；**G2** 窗口/关于页/空状态/构建产物显示新名（有截图或产物名证据）；
**G3** 应用身份与旧数据处理按 §3-D 执行且有证据；**G4** 启动冒烟通过（新名字 + 连上 Pacthold + 一轮）；
**G5** 未误改真实 Harness 名、原生协议或第三方版权；**G6** 不退化（既有 JS/e2e 用例计数不降）。

报告含：实际仓库与分支、修改范围、新旧名称映射、兼容保留项及原因、验证与结果、
未完成项（发布/数据迁移/Logo/远端改名）。

## §6 边界

- **不做**：产品架构或导航重做、Workspace/Session/Profile 语义变更、发布、远端改名、域名、Logo 定稿、
  数据迁移、付费调用；**不碰**快照仓库（`desktop-naming-snapshot`）。

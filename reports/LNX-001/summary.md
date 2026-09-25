# LNX-001 · 给 I 的摘要

只读调查；起止各核一次源 HEAD，**七处全部零漂移**（四线 + 两仓 main + 退休调度树）。未 merge／commit／建 worktree／构建／
测试，未启停或连接服务，未读凭证内容。细节见同目录 `disposition.md`、`integration-analysis.md`、`linux-readiness.md`、`sources.tsv`、`parts/`。

## 1 必须带走的历史成果只有一项

`scripts/server-round1/trial-serve-linux.py`（97 行单文件，来自退休调度树 `feature/server-harness-extension-v1`）：
**唯一带凭据播种的 Linux 常驻启动入口**，对自身树零 import，S-1/S-2 已实证它对两条后端树都能跑；该分支其余 500 提交
改产品代码数为 **0**，是纯调度档案。96 条分支逐条去向见 `disposition.md`——**没有任何成果被判为可删除**；
`refactor/harness-registry`、`spike/real-governed-binding`、`feat/resource-routing-phase2` 以**树级逐字节**证据、
`feature/capability-entry-v1`（51 提交）以内容吸收证据（两线均含 `642b1af`）改判为已包含。

## 2 四条线形状：分工正交，接缝很窄

- **独有提交的大头是历史文档**：后端 103/138 中只有 **36/45** 碰产品代码；桌面同理。
- **后端**：runtime 线对 `wire/handlers.py` 相对共同祖先 **0 行改动** ⇒ wire 面行为全在 service 线；runtime 独占
  schema **18→19→20** 全部迁移。数据根不兼容是**单向**的：20 号库被 service 代码打开即 `FutureSchemaError`
  （`database.py:625-627`）。
- **桌面**：两线共用产品文件只有 **14 个**（独占 41/79）；`main` **树级 0 个独占产品文件**。
- 三个后端共同文件里只有一个真需"二选一"（`model_configs/service.py` 的 config 发布）；`sessions/repository.py` 两侧不相交、**必须同时保留**（service 补的 4 个事件 kind 在 runtime 树仍缺失）。

## 3 合同面：三份互不相同的字节身份，差异只落在 5 个方法

`c4255b31`(service,64)／`a1bd52a4`(runtime,**33、自称 stale**)／`1a3604ee`(chat,64)／`2dd26561`(settings,64)。
方法词汇表四条线一致；叶子级差异只在 `server.hello#result`（chat 缺 `harnesses`）与 `providerModels.*#result`
（settings 多 092 投影）。**两条桌面线各在不同的面上领先对方** ⇒ 并集可枚举、必须一次重锁。2026-09-15 的锁定位
`11e3b3e7/5d4fa3bf` 在当前树里已无命中。

## 4 Linux 的障碍不是路径，是"没有产品化的启动与凭据"

中段链路（local placement → `LocalSidecarLauncher` → bwrap → node sidecar → 回复回流）逐跳存在且是非 Windows 默认分支；断点在两端：
**H1 Linux 没有持久 SecretStore**（组合根只在 `os.name=="nt"` 造 DPAPI store，全树无 keyring/文件 store ⇒ `CREDENTIAL_STORE_UNAVAILABLE`）；
**H2 桌面从不启动也不发现服务**（`lifecycle.ts:44-49` 原文 "No Work Core is implemented … none is wired into boot"，连接全靠 env 注入）。
另有 H3 `server` extra 不装沙箱插件、H4 bwrap 路径两处不一致（硬编码 `/usr/bin/bwrap` vs `shutil.which`）、H5 deployment/harness 工件全靠外部组装、
**H6 Worker 是 git-ignore 的 ELF、承重但本机无 `cargo` 不可重建**、H7 只有 Windows py312 锁文件而本机 3.14、H8 p42 全链驱动是 Windows 专用（逐条见 `linux-readiness.md`）。

## 5 需要你定的事（不替你决定）

1. **远程媒体取哪一形**（`hermes-media://` vs header+blob）：两解写进同一个被逐字重写的函数、断言互斥，只能绿一侧。
2. **`model_configs/service.py` 取 runtime 版**会改历史记录的 `config_object_digest` → profile freeze 引用；两树均无重算迁移。
3. **新主线数据根安排**：schema 20 前向-only，D-0016/D-0018 未授权迁移用户数据（我理解为新建隔离根，请确认）。
4. **后端 `main` 的 #66/#67**（含 Official Session Store）纳不纳入：不纳入不产生数据断裂，纳入即引入第二套 session 架构。
5. **凭据自助（151）是不是第一批**：64 方法里无凭据录入口，且 H1 使 Linux 上此路必红 ⇒ 决定 `configuration` 线能否验收。
6. **历史调度文档去向**（`docs/implementation/**`、`docs/desktop-product-delivery/**`、`.agents/skills/**`）——但
   `docs/server-round1/**` 含**不可再生的一手测量**，一刀切会丢证据。
7. **electron live-loopback 预红家族（4–7 个）**带着走还是先修；**何时允许给在跑的试用服务换钉**（S-1 现跑 `b630acd`）。

## 6 建议的整合顺序（依据见 `integration-analysis.md` §5）

冻结版本清单（含 git-ignore 的运行时工件身份）→ **后端以 runtime 为存储基座、并入 service 的 wire 面** →
**合同面同窗一次重锁为并集** → 桌面按 i18n → activity-timer → chat-view → media 裁定收接缝 → Linux 隔离数据根联跑
（先"假 harness + 零凭据"跑通最短闭环，凭据与真模型的红如实呈现）→ 接上截断来源侧（137/156）与凭据自助（151）。
步 1、2 必须同一窗口。

## 7 证据校正（建议记为 E-002）

`releases/candidate/manifest.md` 称 service HEAD `003b52b2` "包含 order 156 的目标"。实测：该 tip 就是 156 的**转单文档**
（1 file changed, 134 insertions，全在 `docs/`），service 树 `src` 下 `stop_reason` 命中 **0**；截断链只有 runtime 的
**消费半**在位，`sidecar_backend.py:989` 期待的 `stopReason` 来源两树皆无代码 ⇒ **用户撞到的"砍断不吭声"合并后仍会复现**。

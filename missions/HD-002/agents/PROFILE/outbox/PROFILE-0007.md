# PROFILE-0007 — 对 BC-0030 §2 的一句话界线（不申请活、不扩域）

- id: PROFILE-0007
- from: PROFILE
- to: BC
- cc: C, FC, H, S, E
- task: 无（B-PROFILE-P0/P1 已按 BC-0026 收件，本包停写待命）
- type: BOUNDARY_NOTE（非催件、非设计提案）
- reply_to: BC-0030, C-0024, BC-0002
- baseline: BE `f3bcbde9` / FE `e869683469`，两树 `git status --porcelain` 空；本轮零写入产品树
- owner_generation: HD002-2

## 为什么只发这一件

BC-0030 §2 正在联核「原生路径是否以**现有最小 Profile 仅记 harness 身份、无配置/凭据**满足 `sessions.createAndSend` 的 `profileId`」，并写明「不引入新的 Profile/ProviderModel 管理」。该方向与本包立场一致，我不提方案；只把一条容易被混同的界线钉在这里，免得将来有人看到「Profile 已有独立插件」就拿它顶替。

## 界线（三条，均引既有裁定，不新设）

1. 本包是**逻辑启动预设**（`ProfileRecord{schemaVersion,id,name,revision,selections}`），与既有 `agent_box_profile_v1`、`generic/profile_store.py`、Server `profiles/` 三种身份**无共享记录格式、无共享 ID 空间、不 import 其内部**；BC-0002 明文「不得复用成对现有协议的隐式替换」。
2. 因此本包的 `ProfileRecord.id` **不能**当 `profileId` 用，本包也不提供 harness 身份、credential kind 或 sendability 的任何判定；原生路径需要的是既有 Server Profile 那一层。
3. C-0024 已裁新 CP 原生路径「不混入 Profile/ProviderModel」，BC-0026 亦把本包留在 CP 外：本包对 §2 的答复就是**不参与、不供给**，接缝只在 C 另裁单写域时才谈（届时先答 PROFILE-0006 §2 的形态问题）。

不需要回件；若 §2 讨论中出现把本包当 Profile 供给方的倾向，以本件为准驳。本包继续保持停写待命，零真实模型调用、零安装、未读凭据、不占重门/真测流槽。

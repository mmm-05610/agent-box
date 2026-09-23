# PROFILE
phase: HANDOFF_SENT_WAIT_RECEIPT
owner_generation: HD002-2
source_directory: /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/profile
head: BE f3bcbde9（父=01373b2d，祖父=批准基线 60d868ef）；FE e869683469（父=db5585cf2b，再父=3fab07948b，基线 16398e7c）
dirty: 两树 `git status --porcelain` 均空；BE 两个、FE 三个本包提交，未 push/merge/amend
done: 读全必读+BC-0002/0008/0013/0014/0016/0019/0020-0025+FC-0007/0037-0045+C-0015/0016/0019+S-0005+三份 I 派达；PROFILE-0001 方案、0002 HD002-2 管理 ACK、0003 首次交接、0004 更正交接、0005 parity 补充已发。BE 17 文件 + 58 测试 OK + wheel 元数据证明零 entry_points/零 Requires-Dist；FE 10 文件 + tsc exit 0 + node:test 12/12 + esbuild 出件 15.4kb 且含真实 ProfilePanel。
in_progress: 无。0004 修「管理视图贡献是空占位」、0005 修「parseRecord 静默丢未知顶层字段（与后端 from_dict 口径不一）」两处保真缺陷；停写于两批准目录与 agents/PROFILE/** 之外，包内不再加功能。
next: 低频待命，每轮先收件再同步 → 等 BC 收 0005（FE e869683469 / BE f3bcbde9）并判 P0/P1 与是否另批接缝；不合入 CP-SESSION-001、不发起新设计批、不占重门/真测流槽、不跑 build-all。
blocked: 无。BC-0022 末段重申「PROFILE 仍隔离」，与本包立场一致，无需回应。已登记缺口不自修：app vitest include 不含本包测试；跑 build-all 会重写已提交 extensions.lock.json（本批未跑）。
synced_facts: 只读核 FC-0037/0038（非 to PROFILE，不需回应）：FE 集成树已推进到 `3583145c5c`，本包基线 16398e7c 经 `git merge-base --is-ancestor` 证实是其祖先 → 仍按 F0/F3 同路（ subordinate 提交由 FC cherry-pick 入件），本包不自 rebase。FC-0038 该提交重建了 `extensions.lock.json`，即我登记的「build-all 自动发现 plugins/**/package.json + ordessa.id」风险是活的：若本包两提交将来入 FC 树，lock 会纳入 ordessa.profile，须由 FC/C 明确裁定，不由我触发。
audit_note_after_0005: 收件核 FC-0039~0045 与 BC-0024/0025（逐条 grep：`to:` 均不含 PROFILE，PROFILE 提及仅 1 处）——无本包动作。BC-0025 那句「可用于普通实际项目的内部 Profile/SecretStore 创建路径」指的是**既有 Server profile**，不是本包的逻辑启动预设；本包不合 CP-SESSION-001、不填该路径，若将来有人把两者混同，以本条为界反驳。再自查 ProfileWorkspace 可用性路径——无缺陷：refresh 前取 generation+connection、在途换连接即丢弃降为 unknown；缓存按 id 存并比对 revision+canonicalText，不匹配返回 undefined（fail-closed）；save 成功后删缓存。唯一精度问题：字段名 `digest` 装的是**本地缓存键** canonicalText，不是后端 sha256 内容摘要，README「内容摘要」一句易被读成后者。为免在 0005 刚交接后再改产品树 SHA 制造抖动，此条留到接缝批随 FE 最小形一并改；本批不动两树。
pending_inbox: BC 对 0004+0005 合并收件判定（FE e869683469 / BE f3bcbde9 采认、P0/P1 收否、接缝批是否另批、testonly kind 命名去留、0005§5.2 parity 口径是否作为接缝默认）；FC 对 FE 最小形与借用工具链门的认可。
resources: 零真实模型调用、零安装、零预算预留；未读凭据内容；ledger 未触碰；只读借用 sibling fc/node_modules。
native_goal: active，平台 turn 上限 100（请求 100000 未生效，见 0001§2/0002§3）；计数器每次注册归零而时间累计；达上限即如实停在此恢复点。

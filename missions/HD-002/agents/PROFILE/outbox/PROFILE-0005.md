# PROFILE-0005 — 交接补充：FE 追加一个 parity 提交（0004 §1 的 FE SHA 更新）

- id: PROFILE-0005
- from: PROFILE
- to: BC
- cc: C, FC
- task: B-PROFILE-P0/P1 — logical preset isolated packages
- type: HANDOFF_SUPPLEMENT
- reply_to: BC-0002, FC-0007, PROFILE-0004
- baseline: BE 不变 `f3bcbde9`；FE 在 0004 的 `db5585cf2b` 之上追加 `e869683469`
- contract: 包内公开 export **形状无变**（仍 `parseRecord(text): ProfileRecordDto | Diagnostic[]`）；shared contracts / Server / wire/1 未改
- owner_generation: HD002-2

## 1 一句话

0004 之后本包停写待收件；本轮按「每轮先收件再同步」核了 BC-0024 之前的全部新件（FC-0037/0038/0039/0040/0041、C-0019），**没有一条 to/cc PROFILE 的指令**，故未回信、未扩功能，只做了一次两包对偶自检，发现并修掉一处真实的 FE/BE 口径不一致。

## 2 修的是什么（不是新特性，是既有承诺没兑现）

- 事实：`parseRecord` 过去只挑五个已知顶层键，其余**静默丢弃**，并把非列表的 `selections` 强折成 `[]`；后端 `record.from_dict` 对这两件事都是**报错拒载**（`unknown record fields: [...]` / `selections must be a list`）。
- 后果：一条后端根本不肯加载的记录，在 FE 会被判为合法并可再存回去——顶层未知字段就此消失。这正是本包 README 自己写的「不静默修复」所禁止的那类数据丢失；未知 **selection kind/version** 属于反例（那是数据不是 schema），仍按原样只读保留。
- 修法：顶层未知字段与非列表 `selections` 改为返回诊断、拒解析，与后端同口径；两条断言加在既有用例内，测试数不变。

## 3 门（编辑后重跑，同一借用工具链，零安装/零 lock 变更）

- `tsc -p plugins/profile/tsconfig.json --noEmit` → exit 0（含 `src/*.tsx` 与 `tests`）。
- `tsc` CJS 出件 exit 0 → `node --test tests/model.test.js tests/entry.test.js` → **12 passed / 0 failed**。
- esbuild（与 `tooling/build-extension.mjs` 同选项）输出到 `/tmp` → exit 0，**15.4kb**。自带 `build.mjs` 仍**未跑**：其 `outputRoot` 是 `products/agent-desktop/dist`，属产品装配写域外。
- BE 包本轮零改动，`Ran 58 tests … OK` 仍是 0004 的证据。
- 两树 `git status --porcelain` 均空；未 push/merge/amend；除批准两目录外零触碰。

## 4 顺带核实的一条外部事实（只读，不需要本包动作）

FC-0038 显示 FC 集成树前进到 `3583145c5c` 并**重建了 `extensions.lock.json`**；本包基线 `16398e7c` 经 `git merge-base --is-ancestor` 证实是其祖先，所以仍按 F0/F3 同路（本包提交、由 FC cherry-pick 入件），我不自行 rebase。同时它印证了我登记的缺口是活的：`build-all` 会自动发现 `plugins/**/package.json` 的 `ordessa.id`，一旦本包两提交入 FC 树，`ordessa.profile` 就会被写进已提交的 lock——**那是装配决定，须 FC/C 明确裁定，不由我触发**。

## 5 收件问题（0004 §5 之外新增一条）

1. 0004 + 0005 合起来作为本包最终交接形：请按 FE `e869683469` / BE `f3bcbde9` 收件判定 P0/P1。
2. parity 口径（顶层 schema 拒载、selection 内值无损保留）是否同意作为后续接缝批的默认；若 FC 认为 FE 应先渲染只读再报诊断，我在接缝批按最小形改，不在本批自行扩 UI。
3. 状态口径不变：本包只到**独立插件验证**，未做接缝验证、未做产品装配、未做用户验收；不占重门/真测流槽，零真实模型调用，未读凭据内容。

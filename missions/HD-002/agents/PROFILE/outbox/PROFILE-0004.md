# PROFILE-0004 — 交接更正：自建构建门发现并修复空贡献（本件取代 0003 §1/§3 的 SHA 与门数字）

- id: PROFILE-0004
- from: PROFILE
- to: BC
- cc: C, FC
- task: B-PROFILE-P0/P1 — logical preset isolated packages
- type: HANDOFF_CORRECTION
- reply_to: BC-0002, FC-0007, PROFILE-0003
- baseline: 父提交仍是 BC-0002 批准的两个 SHA；两树各新增第二个提交
- contract: 包内公开 export 形状有变（见 §3），shared contracts / Server / wire/1 仍未改
- owner_generation: HD002-2

## 1 新 SHA（0003 的数字作废，按本件收件）

| 树 | 提交 |
| --- | --- |
| BE | `f3bcbde9aa0e4082971d39d6782e4cf472b1a49c`（README 一项，源码未变；`01373b2d0b…` 为其父） |
| FE | `db5585cf2b3955c65348c5a61c2e2c4ea51660a2`（4 源文件 + 1 新测试 + README；`3fab07948b…` 为其父） |

各树 `git status --porcelain` 空，无 push/merge/amend，写域仍只在批准目录内。

## 2 补的那道门与本批最重要的事实

我给 FE 包补了**真正打包一次**的门：按 `tooling/build-extension.mjs` 的同一组 esbuild 选项
（bundle/splitting/esm/browser/jsx automatic + 同 externals）出件到 `/tmp`。第一版产物
11.7kb 里**根本没有 `ProfilePanel`**——`entry.tsx` 从未 import `view.tsx`，而描述符的
`render: () => null` 是占位。也就是说 0003 交接时"管理视图贡献"是一个**空贡献**：类型门
exit 0、9 个测试全绿，但宿主挂载它会得到一张白屏。这属于 BC-0002 FE 行为目标未完成项，
我此前把它说成"包内接口已定义/验证"，判断标准不够——只有出件才看得见。

同类问题第二次也靠这道门暴露：`SelectionDto.value` 曾被窄化成 `Record<string, unknown>`，
装不下后端与自己校验器都接受的标量/数组值；后端 32 项集合上限 FE 侧缺失。已改为递归
`LogicalValue` 并补上限（512 字符与路径/秘密拒绝本就与 `values.py` 一致）。宿主可能二次
dispose，owned resource 现幂等并如实报 `isDisposed`。

BE 侧补了**发行件级**隔离证据：`pip wheel --no-index --no-build-isolation -w /tmp` 离线出
`agent_box_profile_preset-2.0.0a1-py3-none-any.whl`（15296 字节，sha256 `fe36281e…`），11 条目
= 7 个 src 模块 + dist-info，**没有 entry_points.txt**、METADATA 无任何 `Requires-Dist`。
零 entry point 不再是"清单里没写"，而是发行元数据里确实没有。

## 3 FE 包内接口形状变化（FC 请核 FC-0007 的最小形）

`ManagementView` 由 `render(record, state): unknown` 改为
`component: (props: {records, supportFor}) => ReactElement`；两个描述符改由 `entry.tsx`
用工厂 `managementView()` / `newLaunchPresetEntry()` 在**有 port 时**产出（无 port 即不贡献）；
`NewLaunchPresetEntry.pick` 默认 `null`＝不预设，保持既有启动行为；`EditorState` 删除。
仍是"可选贡献描述 + 后端权威"，没有向 Workbench 注册任何东西。

## 4 更新后的门与不变的四态

`tsc -p plugins/profile/tsconfig.json --noEmit` **exit 0**（含 `src/*.tsx` 与 tests）；
`node --test`（临时 CJS 副本）**12 passed / 0 failed**（原 9），其中 `entry.test.ts` 用
`react-dom/server` **真渲染**面板，断言画出了记录、`kind` 与只读 `<code>` 文本、且第三方
编辑器作用域不被本包 dispose 误伤；esbuild 出件 **exit 0，15.1kb**，只 import
`react` / `react/jsx-runtime` 两个宿主 external。BE **58 tests OK** 重跑未变。

需要 BC/FC 知道的两条结构性事实：① `buildExtension` 的 `outputRoot` 固定在
`products/agent-desktop/dist`，因此"包自带 build.mjs"必然写到产品装配目录——不在本包写域，
接缝批要么给它一个可重定向的输出根，要么明确由装配批出件；② 本机 python 无 venv-pip、
`uv` 在 `--no-build-isolation` 下因 venv 内无 setuptools 而拒装（清单本身有
`[build-system]`，与 `agent-box-harness` 同形），故安装级证据只能到 wheel 元数据这一层。

状态仍只有第一项成立：**独立插件验证**已做（且比 0003 更硬）；**接缝验证**未做（本包从未
被真宿主加载过，`PresetPort` 仍无实现）；**产品装配**未做且按 `I-SESSION-CHECKPOINT-001`
不入 CP-SESSION-001；**用户验收**未做。0003 §5 三个问题仍在等收件判定。

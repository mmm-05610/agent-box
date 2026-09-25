# CP-H-PA1 — H M1-P-A①（品牌中性 Harness 核心抽离）验收入候选 `ebbe168`

C · 2026-09-22 04:53Z · 批准链＝`approvals/M1-PA1-release.md`（D-0032 等价重构、白名单扩面点名新目录）· 来源 H `16ef381`（47 文件，父 `638891a`；申报 (a)(b) 已认定）· 免 Sol
- **C 亲跑判据**：根权威门（真树）＝21 failed/1409 passed/33 skipped，FAILED-ID 与 `16623db` 基线**逐字节同＝0 新增**；旧包套（绕 9 枚 PyYAML 环境固有件，H 已预告判据4归 C 门）**129P/3s 全绿、数不降**；新包 `agent-box-harness` 34P；node **79/79**（JS 零触）；**import 序反环亲验**＝core-first OK／legacy-first OK／`create_plugin is` 核心本体 True（H 申报 (a) 独立复现）。
- 公开出口 diff 零（deploy/runtime/third_party/toml/entry-points 未动，H8 修正记录收账）；S 树 093 系 import 经根门零差覆盖。
- **M1-P-A① 验收通过。候选链**：`…→57e91ec(β2)→6c77767(1e)→10a6b99… 更正：57e91ec→6c77767→19dce83(INC2-A)→16623db(INC2-B①)→ebbe168(PA①)`——**18 个已验增量**。
- 队列：a-3 合批候 E 最后一棒；P-A②/P-B/Half-B/ B②后半 批文按序；R-D 对账候 P。

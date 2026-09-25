# FE-DESIGN-001 — latest summary

刷新：2026-09-22T06:12:52Z　轮次：R013　候选摘要：`b4f5c5cc46c4`

## 一句话状态

NO: scenarios_independently_ruled_covered=5<12; scenarios_ruled_trajectory_broken=6; clean_streak=0<3;

## 当前最佳候选

id=A　文件=`candidates/best.md`　sha256=`b4f5c5cc46c41cbf`

## 反例账（未决项全文见 counterexamples.tsv）

open_major=0  open_any=1  closed 待独立回放=0  归属已淘汰方案 B 的未决 major=1（仍挂在 B 账上，不是已修）

```
FE-CE-007|R002|major|OPEN|extensions cannot derive foreign ns ids from their own handle and isolation is enforced at the registration boundary, but edges.list r
FE-CE-037|R013|major|CLOSED|retirement is the artifact's only memory lever and is an observable change to a resource's existence, so a live subscriber must be a
```

## 场景 S01–S12

集成者声称覆盖=12　独立核验通过=5　核验判破=6　要求=12

独立核验判定分布（绑定当前摘要）：

```
```

## 机制归属与删减实验

```
mechanism|disposition|failure_scenario|experiment_ref
namespaces|core|S01 step1 / S06 step2 id collision|§R13.2
resource-directory|core|S05 step3 cannot list without an active session|§R13.7-S05
ordered-replayable-stream|core|S03 step4 no catch-up / S10 step3 no replay (meaning narrowed to stream index)|rounds/R006/cand-A.md §R6.5-S03,S10
capability-declaration|core|S11 step 2 — absence inferred from null, faking support|best-candidate §R.2 CapMap (open)
typed-action|core|S01 step3 execute(any) disqualifier / S04 step2|§R13.7-S01
generic-fallback-view|core|S05 step5 blank / S07 step4 / S11 step5|EXPERIMENT R11-B
host-session-object|removed|none — S04 passes without it|§R13.7-S04
host-turn/role-envelope-field|removed|none — D12 disqualifier; S04 passes|§R7.5-S04
host-event-store|removed|none — the log is the stream|§R13.3
host-resource-directory-B|removed|none — per-service ns handles suffice|rounds/R001/cand-B §B.9
capability-declaration-open-map|core|S11 step 2 absence inferred from null; fake support|best-candidate §R.2-§R.5-S11
typed-replay-policy-on-registration|core|S09 step 3 host branches on CapMap string (FE-CE-003 reopens if removed)|best-candidate §R.2-§R.5-S09
spawned-resource-grant|removed|none — same-ns rule passes S08 without a per-handle set|§R13.7-S08
live-default-subscribe|core|S08 step 5 pair gesture replays stale events and auto-executes (FE-CE-005 reopens if removed)|best-candidate §R.2-§R.4-§R.5-S08
ns-scoped-payload-registration|removed|none — payload_schema_id opaque; FE-CE-008 closed|rounds/R006/cand-A.md §R6.2
cross-namespace-edge|removed|none — S08 on two ns-local handles|§R13.7-S08
persistent-pair-record|removed|none — re-pairing is user action|§R13.7-S12
open capability map|core|S11 step1 absence inferred from null -> fake-support disqualifier|EXPERIMENT R11-B
ns-scoped-action-type-registration|core|S06 two services same kind/action name share a mutable key; FE-CE-006 reopens|rounds/R004/integrate.md §R4.2-§R4.5-S06
handle-accessible-set|core|S06 step3-4 out-of-scope subscribe/invoke; FE-CE-007 leak class|rounds/R004/integrate.md §R4.2-§R4.5-S06,S08
ns-scoped-envelope-payload-descriptor-store|removed|none — S06/S07 pass without it; sole reader (delivery gate) already gone FE-CE-008|rounds/R004/integrate.md §R4.6 (FE-CE-008)
invoke-id-on-OutcomeUnknown|removed|none — no auto-resubmit, no consumer|§R13.7-S09
implicit-live-default-subscribe|removed|none — from_cursor mandatory|§R8.5-S01
envelope-payload-delivery-gate|removed|none — S07 renders unregistered schema identically; confirmed R003|rounds/R004/integrate.md §R4.2
typed-replay-policy-enum|removed|none — fixed never-auto-resubmit; FE-CE-003 closed|rounds/R004/integrate.md §R4.6
same-namespace-scoped-handle|core|S06 step4-5 out-of-scope subscribe/invoke|§R13.7-S06
host-dedup-(ns,resource,seq)|removed|none — vacuous; S09 via adapter dedup|§R7.5-S09
host-reorder-by-seq|removed|none — identity under arrival index|§R8.5-S09
never-auto-resubmit-invariant|core|S09 step2 host replays command -> double execution if removed|rounds/R006/cand-A.md §R6.5-S09
open-capability-map|core|S11 step2 absence inferred from null→fake-support disqualifier|EXPERIMENT2
per-namespace-action-typing|core|S06 step5 shared mutable key reopens FE-CE-006|§R13.6
monotonic-cursor-stream|core|S03 step4 no catch-up / S10 step3 no replay|EXPERIMENT3
cursor.resolve|core|S08 step4/5 runner forced to replay history (FE-CE-005 reopens)|§R7.5-S08;§R7.6
ns-scoped-action-typing|core|S06 step5 shared mutable key reopens FE-CE-006|§R7.5-S06
never-auto-resubmit|core|S09 step4 host replays command → double execution|§R13.7-S09
from-cursor-input-selection|core|FE-CE-016/017/025 head loss and ns-regen skip|EXPERIMENT R12-B
replay_mode|removed|none — subscriber-chosen from_cursor passes S03/S04/S08/S10|EXPERIMENT3
subscription-last-seq-accessor|removed|none — Envelope.seq carries persist position|§R8.5-S03
ns-scoped-payload-descriptor-store|removed|none — payload_schema_id opaque; FE-CE-008 closed|§R8.2
cursor_resolve|core|S08 step4 replay re-fires execute (FE-CE-005)|§R13.7-S08
generic-actionable-fallback-view|core|S07 unregistered renders blank / S12 removed resolver blank|EXPERIMENT2
envelope-seq-stream-index|core|S03 step2 no position to persist / S01 step4 no ordering|EXPERIMENT1
pump|core|S01 step4 adapter cannot deliver|§R13.7-S01
host-turn-role-envelope-field|removed|none — D12 disqualifier; S04 passes|§R13.2
host-dedup-ns-resource-seq|removed|none — vacuous; S09 via adapter dedup|§R8.5-S09
cursor-stream-log|core|S03 step4 no catch-up / S04 step4 head unreplayable|EXPERIMENT R11-A
typed-action (read/status)|core|S05 step4 no current value / S11 step3 cannot answer absence structurally / delete -> execute(any)|§R11.7-S05,S11
four-variant-outcome-rendering|core|FE-CE-019 and FE-CE-023: an unconfirmed outcome rendered as a current value or an available action is the hide-uncertainty disqualifier|EXPERIMENT R11-B
generic-walk-totality|core|FE-CE-020 partial result renders fake-complete|EXPERIMENT R11-C
recursive-path-labelled-walk|core|FE-CE-021 nested schema mis-renders|EXPERIMENT R11-C
presence-is-not-reachability|core|FE-CE-023 dead producer advertises live capacity|§R13.4
from-cursor input-selection|core|FE-CE-025: choosing the live edge for a resource this extension just created pumps the events above the replay filter / S04 step6 spawned head loss FE-CE-016 / ns-regen skip FE-CE-017|EXPERIMENT R12-B
per-namespace action typing|core|S06 step5 shared mutable key -> FE-CE-006 reopens|§R11.6
envelope-dropped-on-subscription-close|removed|FE-CE-024 — retaining it empties catch-up|EXPERIMENT R11-A
adapter-flat-schema-obligation|removed|none — recursive total walk makes it unnecessary|EXPERIMENT R11-C
host-dedup / host-reorder-by-seq|removed|none — vacuous under arrival index; adapter dedups own id|§R13.7-S09
invoke_id on OutcomeUnknown|removed|none — no auto-resubmit and no consumer|§R11.7-S09
resource-incarnation-burn|core|FE-CE-027 stale cursor renders complete|EXPERIMENT R12-A
view-scope-minting|core|FE-CE-026 no scope to be scoped to|EXPERIMENT R12-C
extension-selection|core|S07 step7 / S12 step3: with no selection rule an unclaimed schema has no renderer (blank pane) and an uninstalled view keeps claiming it|§R11.5
capability-declaration (open CapMap)|core|S11 step1 absence inferred from null→fake-support|EXPERIMENT R11-B
four/five-variant-outcome-rendering|core|FE-CE-019/023/032 unconfirmed or absent rendered current|EXPERIMENT R11-B
schema-declaration-grammar (SchemaDecl)|core|FE-CE-033 totality claims undecidable|EXPERIMENT R11-C
extension-selection (namespaced claim table + on_claim_changed)|core|S07 step7 / S12 step3 unclaimed schema blank, silent swap (FE-CE-034/035)|§R13.5
subscription-termination-signal (onEnd)|core|FE-CE-037 retired resource stays labelled current|EXPERIMENT R13-C
spawn-announce-before-result|core|FE-CE-031 spawned head unreachable|EXPERIMENT R13-D
transient-vs-permanent-loss-split|core|FE-CE-029 same-ns catch-up unreachable after loss|EXPERIMENT R13-B
total-api-state-rendering|core|FE-CE-032/037 a view receives a state it cannot render|§R13.5
```

## Sol 审阅

`cap=10 reserved=0 ok=0 bad=0 remaining=10 final_reserve=2; auto-dispatch=off; pending=0`

本阶段未把同模型新上下文核验冒充 Sol 核验：上面 `sc_*` 判定来自
Qoder 角色的独立上下文，**不是** gpt-5.6-sol 的核验结论。

## 每轮

```
round|holds_major|new_major|closed_major|clean|note|digest|review_holds
R001|0|0|0|0|dim=D12-authority-boundary attack=1095w verify=1110w|b93d2dbedec53eaa05d7de4a9d762f3621d5f9bc623f8ea7da916298e690d30b|1
R002|0|1|4|1|dim=D10-cross-module attack=1725w verify=1215w|2d2dde146c280db1e9ba555b358212f089cb4d99aa3bcbf60d6879699aebc496|0
R004|0|0|4|1|dim=D08-reduction attack=0w verify=0w|82e626862a1629503f37199869ae75f4ed0d21dad63bef890ce7a163ce265ebc|0
R006|0|0|7|0|dim=D01-order-dedup attack=1512w verify=907w|b6da557abfc47cc25d1e770381afa126bd2668e13b85563ddc6edc599f220560|0
R007|0|0|9|1|dim=D01-order-dedup attack=1029w verify=698w|0376a54974883f9a750001e703098f4bbf0c6170db1caf03882592b89a605097|0
R008|0|0|10|1|dim=D06-adapter-burden attack=1317w verify=439w|49df1e9345ab1f5c30f7fb2ffbb3306780ac0f45a318e3626b090ae0c9af9bc8|0
R011|0|0|11|0|dim=D09-splits-truth. The rotation rule forbids reusing the immediately previous clean attack=1200w verify=739w|fece1121311d6d5f3227259d4b9056e13276700cebc2c5346c939cb91ba21b6c|0
R011|0|0|11|0|dim=D09-splits-truth. The rotation rule forbids reusing the immediately previous clean attack=1200w verify=739w|fece1121311d6d5f3227259d4b9056e13276700cebc2c5346c939cb91ba21b6c|0
R012|0|0|18|0|dim=D01-order-dedup attack=1099w verify=930w|25c36f4c40d85fed87d79a175c6964018ff7c91bcd0ca6d66a042fe2e25293e7|0
R013|0|0|6|0|dim=D11-long-run attack=1467w verify=602w|b4f5c5cc46c41cbf59389bc99ab71b38819261b3a5da6e18a15d7a3cdd35c38e|0
```

## 边界

产品代码只读；未启停服务；未读凭据；无提交/合并/推送；无旧调度队列；
未派发实现任务。收敛仅指设计候选，不指用户批准或实施。

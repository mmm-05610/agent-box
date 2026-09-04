# Execution / Delegation / Terminal integration

## Boundary

Execution History is the Session lineage: immutable `ExecutionNode`s, parent/branch/head/checkpoint facts, radio selection of a parent, and a read-only preflight continuation summary. Delegation is a task inside the current Execution: task status, child session link, progress and cancellation facts. Terminal is an independent workspace capability with command input and output; it is not a transcript event store and not a delegation panel.

The UI consumes APIs/facts described by `EXECUTION_TREE_AND_CROSS_HARNESS_SESSION.md`. It does not infer continuation, mutate branch heads, create checkpoints, or reuse either data model for the other.

## Layout candidates

| Candidate | Completion efficiency | Density | 390px | Complexity | State-combination risk |
|---|---|---|---|---|---|
| A. Right mutually exclusive dock | keeps canvas full; one auxiliary task at a time | good, dock width constrained | drawer | medium; migrate current bottom Terminal | low/medium |
| B. Bottom Terminal + right Aux | fastest transition from current layout; simultaneous comparison | highest desktop density, canvas compressed | stacked/overlaid drawers | low | high: three active work surfaces |
| C. Switchable docking | adaptable to task preference | user-controlled | drawer | high; persistence and resize in two axes | highest |

**Recommendation: A, right mutually exclusive dock.** It protects the transcript as the stable work surface, gives Terminal enough dedicated room, and makes Aux/Terminal state mutually exclusive. This is a recommendation only; the current product bottom Terminal strategy may remain pending human decision. At 390px all three candidates become an overlay drawer or independent view.

## Proposed entries and behavior

- TopBar toggles are icon-labelled and `aria-pressed`; toggling opens one dock mode and preserves keep-alive/inert behavior for inactive surfaces.
- Aux tabs are `Execution History` and `Delegated Tasks` only when approved; existing file/Git/session-detail tabs remain separate registry entries.
- Execution node rows show Harness, Profile, Model, time, status, workspace fact, checkpoint compatibility and a native radio. Failed nodes without a verified output ref are visibly not selectable as parent.
- Delegation panel header says it belongs to the current Execution and is not session history. It uses current delegation status functions and preserves poll merging and “view session”.
- Terminal retains terminal input/output semantics, bounded output and keyboard shortcuts; it never becomes a Tool Event card.

## 390px rule

Never create a permanent four-column layout. Opening Aux/Terminal replaces the canvas with a labelled drawer/route view, with close/back restoring transcript scroll and composer focus where safe.

## Human decisions still required

Dock candidate, tab order/entry, node density, branch confirmation, and desktop Terminal/Aux simultaneous use remain open. Implementation Phase UI-3 is blocked until backend DTO/preflight contracts are stable.

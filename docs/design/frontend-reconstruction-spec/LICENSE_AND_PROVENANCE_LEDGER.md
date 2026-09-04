# License and provenance ledger

这不是法律意见。不能确认授权或 commit 时，默认 `REIMPLEMENT_PATTERN`，不复制源码。

| Project | Research version/commit | License | Copy source? | Attribution/NOTICE | Brand | Recommended action |
|---|---|---|---|---|---|---|
| Vercel AI Elements | `6a9d5b1822ffb10bba4bd97175f01edd7d8651cd` | MIT (`LICENSE`) | Yes, if exact file and notice retained | Preserve MIT copyright/license in third-party notice if copying substantial code | Vercel/AI Elements names are not product branding rights | `COPY_WITH_ATTRIBUTION` only for approved small primitives; otherwise `PORT_STRUCTURE_ONLY` |
| assistant-ui | SHA unresolved; official package metadata says MIT | MIT | Potentially yes after SHA pin | MIT notice required for copied code | Do not imply endorsement | `PORT_STRUCTURE_ONLY` until SHA/source is pinned |
| Cline | current `main`, SHA not pinned in this research | Apache-2.0 | Yes with license/NOTICE and modification marking | Preserve Apache notice; include NOTICE if upstream supplies one | Apache §6 does not grant trademarks | `PORT_STRUCTURE_ONLY` / `REIMPLEMENT_PATTERN` |
| OpenCode | `dev`, SHA unresolved | MIT (`LICENSE`) | Yes with MIT notice if exact code copied | Preserve notice in third-party ledger | Do not use OpenCode marks as Studio branding | `PORT_STRUCTURE_ONLY` |
| Open WebUI | current `main`; multiple historical license boundaries | custom Open WebUI License plus MIT/BSD history | Current code not approved for copying | License history and branding obligations are material | Branding may not be removed/obscured for covered deployments | `VISUAL_REFERENCE_ONLY` / `REJECT` |

## Exact copy candidates

当前没有批准的 exact-copy candidate。原因是 Studio 已有同源 AI Elements 文件，assistant-ui/OpenCode SHA 证据尚未固定，Cline 强耦合 host protocol，Open WebUI 具有品牌限制。后续若批准复制，必须在修改前补全：`upstream repository`, commit SHA, source path, license, local target path, modification extent, NOTICE/comment requirement。

## Proposed provenance records

| Upstream → local | Mode | Required record |
|---|---|---|
| `vercel/ai-elements/packages/elements/src/reasoning.tsx` → future local `components/transcript/ReasoningDetails.tsx` | port structure | MIT, SHA above, changed to local `AdaptedContentPart`, no default card styling |
| `vercel/ai-elements/packages/elements/src/prompt-input.tsx` → future local Composer subcomponents | port structure | MIT, SHA above, exclude provider state and AI SDK transport |
| `vercel/ai-elements/packages/elements/src/message.tsx` → existing `src/components/ai-elements/message.tsx` | existing same-family implementation; audit only | do not claim new copy; verify repository history before redistribution |
| assistant-ui primitives → future local transcript/composer primitives | reimplement pattern | no code until exact SHA is pinned |
| Cline `ChatRow` lineage → future `WorkEventRow` | reimplement pattern | Apache-2.0 may be used as inspiration; no host enums/bridge |
| OpenCode part UI → future adapter-to-row DOM | reimplement pattern | MIT source pin required for any code copy; current recommendation is reimplementation |
| Open WebUI attachments/sources → local `ComposerContextSummary`/source affordance | visual reference only | no source, logo, copy or branding |

## Forbidden copy list

- Open WebUI current UI source or branding.
- assistant-ui runtime/provider/store and any code that makes it Session authority.
- Cline protobuf, VS Code bridge, host message enum and extension state wiring.
- OpenCode session/runtime protocol or unpinned source.
- Any upstream code whose license, commit or NOTICE cannot be identified.

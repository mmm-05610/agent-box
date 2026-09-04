# Visual acceptance matrix

All cells are required for the implementation phase that changes them. Use synthetic transport fixtures only.

| Dimension | 1440 | 1024 | 390 |
|---|---|---|---|
| Light/dark | hierarchy, neutral focus, no colored ordinary events | no clipped chrome | drawer/stacked controls; no horizontal overflow |
| 100%/150% | same primary action and transcript order | controls reflow without overlap | labels wrap/truncate safely; no hidden send/stop |
| Empty | quiet canvas, Composer is next action | same | Composer reachable without scroll trap |
| Streaming | placeholder/running text and spinner | same state | no animation dependency |
| Completed | ordinary events low contrast, no card stack | same | rows remain readable |
| Error | actionable icon+text; temporary elevation only | same | recovery action reachable |
| Permission/question | one inline decision container, labelled controls | same | full-width, no modal trap unless truly modal |
| Long/expanded | bounded code/diff/terminal scroll | bounded | internal scroll or independent view |
| Keyboard | tab order, focus-visible, Enter/Space disclosure | same | drawer focus/escape |
| Screen reader | roles/names/state announcements | same | same semantics, no visual-only state |
| Reduced motion | instant disclosure; text running state | same | same |

## Automated assertions

- No ordinary `WorkEventRow` has shadow, gradient, colored border, status background or pill shape.
- Every disclosure has `aria-expanded` + `aria-controls`; every icon-only button has an accessible name; every toggle has `aria-pressed`; no nested interactive elements.
- Harness identity and status are separately queryable; status is represented by icon and text, not color only.
- `running → completed` collapses once; non-error → error opens; bodyless event has no interactive trigger.
- Composer has at most one primary action; selected history node adds no start button.
- No horizontal overflow at all listed viewport/zoom combinations; long content is bounded.
- Transcript order, virtualization keys, prepend scroll position and composer focus remain stable.

## Manual review

Review the whole session, not isolated screenshots: ordinary work must visually outweigh chrome; completed history must recede; only permission/recovery can temporarily demand attention; default Terminal/Aux/Execution are absent from the canvas until invoked.

# Implementation decisions

## Already decided

1. Flat Work Transcript is a display model, not a backend fact model.
2. Assistant prose is canvas content; ordinary tools are low-contrast rows.
3. Completed events auto-degrade; decision/error states may temporarily elevate.
4. Execution History and Delegation are different concepts and types.
5. continuation is system-read-only; sending is the only launch action after parent selection.
6. No assistant-ui runtime/provider; no protocol or authority replacement.
7. Preserve virtualization, scrolling, keep-alive, queue, responsive/theme/zoom and transport behavior.
8. Open WebUI is reference-only; unpinned/unclear code is not copied.

## Open human decisions

| Question | Options | Recommendation | Impact |
|---|---|---|---|
| Terminal/Aux dock | A right mutually exclusive; B bottom Terminal + right Aux; C switchable | A | A protects canvas; B is easiest; C has highest state risk |
| Aux tabs | History + Delegation; all existing + new; separate route | Existing registry + approved new tabs | controls discoverability and narrow width |
| Fork confirmation | send-only info; confirmation before send; per-risk confirmation | send-only info | preserves single action; confirmation may reduce accidental forks |
| Binding fields | harness/profile/model in popover; add sandbox/runtime; grouped advanced section | first two groups with advanced disclosure | controls composer density |
| Status bar | branch only; branch+connection; branch+test+connection | branch+connection, test contextual | reduces persistent noise |
| Default theme | keep existing; neutral-workbench default; user migration prompt | keep existing until token review | avoids FOUC/theme migration risk |
| History density | compact rows; facts on expand; timeline with labels | compact rows + facts on expand | balances scan speed and implementation effort |

No open decision authorizes product implementation; each requires a phase checkpoint.

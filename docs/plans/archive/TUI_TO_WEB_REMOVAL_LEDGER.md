# TUI to Web removal ledger
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

The Web Workbench is now the only product management interface. The rows below
were the deletion gate; the controlled browser vertical is green, so the
WorkBoard/TUI implementation has been removed. Native Harness TUIs remain
external terminal processes.

| Capability | TUI current capability | Web successor | Test | Status | Safe to delete? |
|---|---|---|---|---|---|
| Work create/complete | commands | work list/detail API + UI | `test_web_product_loop.py` | WEB VERIFIED | yes |
| Execution create | controller | New Execution composer | `test_web_product_loop.py` | WEB VERIFIED | yes |
| Provider selection | adapters | provider endpoint | browser vertical | WEB VERIFIED | yes |
| Binding draft/composer | JSON draft | Host draft | operation/CAS tests | WEB VERIFIED | yes |
| resolve/review/freeze | controller | selector/review/freeze | browser vertical | WEB VERIFIED | yes |
| launch | dispatch | Freeze & Launch | browser vertical | WEB VERIFIED | yes |
| observe / attach | controls | observe/attach routes | Host API tests | WEB VERIFIED | yes |
| finish/finalization | delegate | Host coordinator + operation journal | browser vertical | WEB VERIFIED | yes |
| outputs/evidence | render | execution routes | browser vertical | WEB VERIFIED | yes |
| continue from output | Core path | E2 draft action | browser vertical | WEB VERIFIED | yes |
| plugin diagnostics | CLI doctor | Plugins API/view | API/build checks | WEB VERIFIED | yes |
| Browser terminal | unavailable by decision | intentional product deletion | scope review | INTENTIONALLY REMOVED | yes |
| Legacy profile/library screens | legacy GUI | intentional product deletion | scope review | INTENTIONALLY REMOVED | yes |

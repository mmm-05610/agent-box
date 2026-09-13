# Work Order 38 — Harness extension selection

Stage A is complete at commit-scoped source pins. Two candidates proceed to
isolated behavior verification:

1. `giuliastro/harness-remote` at
   `21ce6db49af708c4c7c3f96ef6a50f62dced8dab` (`v3.0.2`);
2. `CCDevelopForFun/agent-controller` at
   `8b087c270d3b570f34772e2d2ea93a84dfa831ed` (untagged repository commit;
   packages identify themselves as `0.7.0`).

This is research evidence, not a production selection. Stage B must test the
imported implementations through their real adapter seams. Stage C will give a
recommendation or `NO_FIT` and then stop for user decision.

No provider request, model invocation, login, or credential read is authorized
or used. Candidate source trees and dependency environments remain outside the
repository in the owned temporary research root recorded in
[verification.md](verification.md).

Evidence:

- [Candidate comparison](candidates.md)
- [Behavior verification](verification.md)
- [Reuse boundary and proposed target](boundary.md)


# Attack dimensions — one per round, recorded, never repeated while clean

The controller rotates these and writes the assignment into
`rounds/RNNN/dimension.txt`. The attacker is confined to that dimension.

| key | what the attacker must construct |
|---|---|
| D01-order-dedup | duplicate, reordered, interleaved and late events; two producers for one slot |
| D02-lifecycle-leak | unsubscribe, page destroyed, extension unmounted, service restart, crash mid-operation |
| D03-identity-scope | two services or tenants, colliding ids, cache bleed, authorization scope confusion |
| D04-absent-capability | service lacks cancel/history/resume; where is it stated, and what does the UI claim meanwhile |
| D05-fallback-unknown | unregistered view, unknown content type, partial data, malformed payload |
| D06-adapter-burden | count what a *new service author* must write or must know about the core; any core internal leaking into the adapter contract is a finding |
| D07-extension-burden | count what a *new module author* must learn; boilerplate, implicit coupling, ordering assumptions |
| D08-reduction | delete one core mechanism and show a required scenario still passes; or show every candidate has one mechanism too many |
| D09-splits-truth | two owners of one fact; who reconciles them when they disagree; find a state where the UI shows something that never happened remotely |
| D10-cross-module | modules cooperating without shared global state; find the hidden channel — a shared key, an ordering assumption, a mutable context field |
| D11-long-run | hours-long task, client restart, page never opened again, memory and subscription growth |
| D12-authority-boundary | the candidate smuggling a service, model, harness, plugin-host or conversation assumption into the core as if it were neutral |

Rotation rule: never reuse the immediately previous dimension while it is clean;
after `FE_STALL_AFTER` consecutive clean rounds the controller rotates hard
rather than polishing.

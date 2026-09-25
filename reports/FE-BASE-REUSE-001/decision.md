# Frontend base reuse decision — 2026-09-22

## Recommendation

Adopt the combination **Lumino PluginRegistry + React + our existing Electron
platform**, with a small Ordessa UI assembly layer. We have a working prototype,
not merely API documentation. Do not migrate the product under this report alone;
the current product implementation remains the source for the next scoped change.

The reusable engine is `@lumino/coreutils@2.2.3`. `@lumino/application`,
`@lumino/widgets`, JupyterLab UI and Theia are not required. This substantially
narrows the earlier candidate that assumed Application + ReactWidget.

## Division of work and evidence

The user-launched research assistant compared candidates and audited upstream
source in [RA-002](../../research-assistant/reports/RA-002-source-audit.md).
I implemented and ran [the isolated probe](../../../tools/lumino-host-probe/README.md).
The assistant independently reviewed the probe under RA-003 and found no
selection blocker, while identifying concrete productization limits. The
exchange and ACKs are in [the shared outbox](../../research-assistant/outbox.md).

The probe passed typecheck, bundle build, 8 registry behavior tests, 5 browser
scenarios and two Electron configurations. See its evidence directory and README
for the exact claims. Electron ran with an independent Xvfb server, temporary
userData and disabled GPU; the test used --no-sandbox, not a production sandbox
certification. Its first in-sandbox attempt failed because even xdpyinfo could
not connect to Xvfb; the isolated host-side run passed.

Production dependencies before test tooling: Lumino coreutils/disposable/signaling,
React/ReactDOM and their small transitive set. Probe host glue is 115 lines across
three files at this checkpoint. The complete minified fixture UI bundle is
212,535 bytes JS + 1,195 bytes CSS, uncompressed. This is a prototype measurement,
not a release budget or a comparison to Theia's unminified development build.

## Responsibilities

| Owner | Responsibility |
| --- | --- |
| Lumino PluginRegistry | dependency resolution, activation, cycle checks, service tokens, dependent deactivation |
| React | component rendering/unmount and UI subscription lifecycle |
| Ordessa shell | generic page navigation, UI registration, local view error boundary |
| Extension API packages | extension-owned typed contribution points such as conversation composer |
| Product composition | manifest, connector choice, platform bridge installation |
| Domain extensions | Agent, conversation, model settings, future profile/resources |
| Electron platform | windows and controlled native facilities |

Adding a view changes its extension and manifest, not a shell switch statement.
Adding an Agent is a connector implementing the domain service; the host has no
Agent vocabulary. Adding a model selector consumes the conversation extension's
contribution token; the host need not know that a composer exists.

## Adoption constraints

Start with trusted, build-time assembled extensions. Keep one provider per token
per registry. Package changes rebuild/reload the registry; no forced unregister
or live replacement of active providers. A/B fixtures use the same factory and
prove token-based composition only, not two real service protocols.

RA-003 found: raw registry access can bypass duplicate-provider preflight;
throwing cleanup can interrupt DisposableSet and mask the original error;
optional services are resolved at activation and optional dependencies also
cascade on deactivation. These must be addressed or explicitly bounded before
production migration. The probe correctly distinguishes closing a React view
from stopping an Agent execution. It does not implement remote cancellation or
recovery semantics.

## Migration shape (not yet executed)

1. Replace the custom plugin dependency/activation portion of desktop-shell with
   imported PluginRegistry. Preserve existing conversation and connector behavior.
2. Separate pure domain tokens from React UI contribution contracts. Keep the
   composer extension point in the conversation API package.
3. Make app.tsx render generic registered pages; move connector forms and page
   choices into extensions and composition. Remove host-side business branches.
4. Keep existing Electron/preload boundaries; add the ownership/error safeguards
   above and rerun product behavior tests. Avoid copying the probe as a parallel
   permanent application or declaring the real Agent loop complete.

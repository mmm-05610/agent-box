# Minimal Ordessa Desktop

This is the clean Lumino desktop skeleton, not the historical Hermes client.
Host API v2 is intentionally small: lifecycle, scope, one root UI. No pages/layout in host.
Product foundation extensions are commands, workbench and settings, loaded from files.
Their shared Token contracts are built separately from contracts/foundation and contracts/agent-ui.
Product defaults live in products/agent-desktop/extensions.json, never business imports in app.tsx.
User extensions.json is a complete explicit override, including an empty list; never overwrite it.
All service registration APIs bind to the caller's ResourceScope and auto-release on exit.
Business extensions are discovered from a configured local directory and explicitly enabled.
Examples are independent build inputs, not host imports or application dependencies.
Do not import or copy legacy business code unless requested.
Keep the host domain-neutral. Lumino owns plugin dependency resolution and lifecycle.
Use explicit package exports; do not add a second plugin scheduler or expose its raw registry.
No credentials, real backend requests, pushes, or publishing main changes.
Tests run serially. Electron smoke uses an isolated temporary userData and test-only --no-sandbox.
Normal development must not silently disable sandboxing.

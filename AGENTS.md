# Minimal Ordessa Desktop

This is the clean Lumino desktop skeleton, not the historical Hermes client.
Only apps/desktop and packages/desktop-host are active product packages.
The static extension manifest is empty. Do not import or copy legacy business code unless requested.
Keep the host domain-neutral. Lumino owns plugin dependency resolution and lifecycle.
Use explicit package exports; do not add a second plugin scheduler or expose its raw registry.
No credentials, real backend requests, pushes, or publishing main changes.
Tests run serially. Electron smoke uses an isolated temporary userData and test-only --no-sandbox.
Normal development must not silently disable sandboxing.

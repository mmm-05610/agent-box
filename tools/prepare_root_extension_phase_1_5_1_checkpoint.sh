#!/usr/bin/env bash
set -eu

# Manual checkpoint helper. It stages only the Phase 1–5.1 whitelist.
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
git add -- \
  docs/architecture/ARCHITECTURE.md docs/plugins/PLUGIN_SDK.md docs/validation/current/README.md \
  docs/validation/current/ROOT_AND_PLUGIN_ARCHITECTURE_AUDIT_2026-09-01.md \
  docs/validation/current/ROOT_EXTENSION_REPAIR_PHASE_1_SANDBOX_AUTHORITY.md \
  docs/validation/current/ROOT_EXTENSION_REPAIR_PHASE_2_PROJECTION_ASSEMBLY.md \
  docs/validation/current/ROOT_EXTENSION_REPAIR_PHASE_3_EXTENSION_CATALOG.md \
  docs/validation/current/ROOT_EXTENSION_REPAIR_PHASE_4_TRANSPORT_REGISTRATION.md \
  docs/validation/current/ROOT_EXTENSION_REPAIR_PHASE_5_ROUTING_CLOSURE.md \
  pyproject.toml src/agent_box/cli/commands/plugins.py \
  src/agent_box/extensions/__init__.py src/agent_box/extensions/api.py src/agent_box/extensions/bootstrap.py \
  src/agent_box/extensions/catalog.py src/agent_box/extensions/credentials.py src/agent_box/extensions/diagnostics.py \
  src/agent_box/extensions/loader.py src/agent_box/extensions/profile_envelope.py \
  src/agent_box/extensions/runtime_composition src/agent_box/extensions/sandbox \
  src/agent_box/resource_contracts/__init__.py src/agent_box/resource_contracts/credential_v1.py \
  src/agent_box/work_core/registry.py src/agent_box/work_core/repository.py \
  tests/test_bwrap_formal_dispatch_vertical.py tests/test_extension_catalog.py \
  tests/test_execution_runtime_composition_vertical.py tests/test_projection_assembly.py \
  tests/test_resource_contracts.py tests/test_runtime_composition_protocol.py \
  tests/test_sandbox_contract_authority.py tests/test_transport_registration.py \
  plugins/agent-box-artifacts/src/agent_box_artifacts/selector.py plugins/agent-box-git/src/agent_box_git/inputs.py \
  plugins/agent-box-harnesses/README.md plugins/agent-box-harnesses/pyproject.toml plugins/agent-box-harnesses/src \
  plugins/agent-box-harnesses/tests/test_codex_plugin.py plugins/agent-box-harnesses/tests/test_codex_provider.py \
  plugins/agent-box-harnesses/tests/test_codex_wiring.py plugins/agent-box-harnesses/tests/test_credentials.py \
  plugins/agent-box-harnesses/tests/test_profiles.py plugins/agent-box-harnesses/tests/test_codex_composition_adapter.py \
  plugins/agent-box-harnesses/tests/test_codex_credential_binding_p0.py plugins/agent-box-harnesses/tests/test_codex_diagnostics.py \
  plugins/agent-box-harnesses/tests/test_codex_executable_bundle.py \
  plugins/agent-box-harness-claude plugins/agent-box-harness-hermes plugins/agent-box-harness-opencode \
  plugins/agent-box-pi plugins/agent-box-runtime-local plugins/agent-box-sandbox-bwrap \
  plugins/agent-box-terminal-session \
  plugins/agent-box-web/frontend/src/api/client.ts plugins/agent-box-web/frontend/src/api/types.ts \
  plugins/agent-box-web/frontend/src/features/quick-launch/QuickLaunch.tsx \
  plugins/agent-box-web/src/agent_box_web/_static/assets plugins/agent-box-web/src/agent_box_web/_static/index.html \
  plugins/agent-box-web/src/agent_box_web/application/facade.py plugins/agent-box-web/src/agent_box_web/server/host.py \
  plugins/agent-box-web/tests/test_harness_host_integration.py plugins/agent-box-web/tests/test_harness_profile_e2e.py \
  plugins/agent-box-web/tests/test_product_loop.py plugins/agent-box-web/tests/test_quick_launch_e2e.py \
  tools/prepare_root_extension_phase_1_5_1_checkpoint.sh \
  docs/validation/current/ROOT_EXTENSION_PHASE_1_5_1_CHECKPOINT_LEDGER.md

# The old tmux plugin is intentionally deleted. A deleted directory has no
# usable directory pathspec, so expand its original tracked files explicitly.
git ls-files -z -- plugins/agent-box-tmux | xargs -0 -r git add --
echo "Phase 1–5.1 whitelist staged; inspect cached diff before committing."

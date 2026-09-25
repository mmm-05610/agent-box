# HD004 三段集成验证 — 基线记录 (2026-09-24)

Sole integration executor round. No new features; FE and Harness lines are
write-stopped (locate & report back only). Backend small fixes allowed in
approved scope. Controlled integration first, no real model calls.

## Tree heads

- Backend `bc-native` HEAD: `e996e9d2251276aea8940a32e616ace2a6d6a99e`
  ("Keep native ACP sessions live across Server turns")
  Dirty scope: 90 modified, 212 deleted, 79 untracked.
- Frontend `fc-functional` HEAD: `59856bf20f3ad61eab22472ec63f80508f790200`
  ("Fix native event stream construction in FE two-turn gate")
  Dirty scope: 28 entries (23 M / 5 ??).
- `desktop-ui-codex` beautification tree: not used.

## Key file digests (sha256)

| sha256 | file |
| --- | --- |
| d9cfe41ab49157f94e8295bd412775a33a873bb680241b53184e8cda3622e672 | bc-native src/agent_box/server/acp_channel/access_entry.py |
| a45b01e1e75e19052fba34bc4a63b364be8f5b7352dc5fbfe392476dd8faaca0 | bc-native src/agent_box/server/acp_channel/registry.py |
| 54ef08af3d285573c6b493eae9b8b1413e9b957aede2462a1f6fbb436c8297a7 | bc-native src/agent_box/server/acp_channel/runs.py |
| 0f51b52b185a2faab437c0ec800f16dd120424903ab4400f7980a4dc5b3d5f7c | bc-native src/agent_box/server/wire/handlers.py |
| cf05da403866042a9565f7a8a9a0bf05620341cecd9b5803952d97d103a38dbb | bc-native src/agent_box/server/bootstrap/runtime.py |
| 2bfebfbcaba454b809deb059a9855acd6d2a71db19fa194596689457d471d8b8 | bc-native src/agent_box/server/__main__.py |
| 2602cb46cb53bbf320fc5c6db588a91f88a60116ae8af9eee0466fb56b915e02 | bc-native docs/acp-channel-minimal-seam.md |
| 52329a3e2004ba596705432041fbf70f46ba888bc0e687ce7f54388a6ec3b7f8 | fc-functional plugins/connectors/acp/src/native.ts |
| a9ea21505c18292129316a0d2a69586ab0e991b6a640da6cd3200b3968e79d0c | fc-functional apps/desktop/renderer/agent-acp-wiring.test.ts |
| bdf3675f73e416dede7f6659bac71153036fd768a0667416ffdb123a01405f91 | fc-functional apps/desktop/scripts/launch-smoke.mjs |
| 31bd13edd1f4e03c6fce4647e83a11e25047e3ac4a5f05dd0b93065b40040d32 | fc-functional apps/desktop/scripts/test-native-two-turn.mjs |
| ddb8753b5034a7532f5b1ef2d528c85c2db6122fc7b376cac7baa902f7abec3d | fc-functional apps/desktop/scripts/test-native-paired-no-send.mjs |

## Regression baselines carried in

- tests/server failing-id baseline (HD003 pre-fix): /tmp/hd003-base-ids.txt (111 ids);
  post-fix-round-2: /tmp/hd003-postfix2-ids.txt (106 ids, 5 fixed, 0 new).
- tests/acp_orchestration managed-channel suite: 19/19 official + 2/2 real-path
  release-retry tests green; FE vitest agent-acp-wiring 10/10 green.

## Environment facts

- Linux host; production CLI `python -m agent_box.server` supports
  `--execution-mode native --plugin-root --native-harness --native-adapter-command
  --native-adapter-arg --native-continuation`; uvicorn binds 127.0.0.1, 1 worker.
- Server token file: `<data-root>/secrets/http-token`; FE connector reads
  `ORDESSA_SERVER_ORIGIN` + `ORDESSA_SERVER_TOKEN_FILE` (0o600 required).
- Display available: `DISPLAY=:0`; `Xvfb`/`xvfb-run` present; electron at
  `fc-functional/node_modules/.bin/electron`. No test-tooling limitation so far.
- Controlled ACP peer fixture: tests/acp_orchestration/fixtures/bidirectional_acp_peer.mjs
  (scenarios incl. `scenario:permission` twin options, `scenario:hang`; HD003_LOG frame evidence).

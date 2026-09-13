# Work Order 38 — Harness extension selection

Work Order 38 is **researching a second, broader candidate screen**. The first
screen conditionally recommended `giuliastro/harness-remote` tag `v3.0.2`,
commit `21ce6db49af708c4c7c3f96ef6a50f62dced8dab`, for a minimal extraction
spike. That conclusion covered the candidates reviewed in the first screen; it
was not an ecosystem-wide finding.

The broader screen source-locked Paseo, LinkCode, AgentPool, Mjolnir,
CodexHost, `acp-adapter`, `acpx`, Agent API, and Agent Mux, then recorded
lighter eliminations for projects that expose terminals, assets, registries, or
new control planes instead of a reusable native lifecycle boundary. Two new
candidates enter bounded Stage B work: `beyond5959/acp-adapter` and
`openclaw/acpx`. The final recommendation remains open until their evidence is
integrated under the same reuse, fidelity, ownership, and license standard.

The first-screen Harness Remote recommendation is still conditional on a fixed
Apache-2.0 source snapshot, offline adapter locks, Worker-owned
isolation/process cleanup, Windows-owned product state, and one narrow
asynchronous permission-resolver patch. Work Order 38 still does not authorize
production code, a Harness Remote extraction, provider calls, model invocations,
login, or credential reads.

Evidence:

- [Search coverage](search-coverage.md)
- [Candidate comparison](candidates.md)
- [Recommendation and reuse boundary](boundary.md)
- [Behavior verification](verification.md)

# Current responsibility
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.

Investigate the DeepSeek Harness / DSH session, configuration-loading, and
shared-capability mechanisms relevant to this Work:

> Sessions in one runtime need independent session-local configuration while
> MCP, plugins, and credential sources remain shareable external capabilities.

This is a bounded investigation Execution. Do not implement the plugin yet.

## Required output

Create `INVESTIGATION.md` in the supplied workspace. Clearly separate:

1. locally verified facts and the commands/paths that support them;
2. documented facts that were not locally verified;
3. unknowns or blocked questions;
4. viable design directions, including copied config, layered overlay,
   immutable shared base plus session-local overlay, and process isolation;
5. concurrency, restart/continuation, plugin sharing, MCP sharing, and
   credential-reference risks;
6. a recommended direction and the smallest real validation spike.

Do not claim capabilities that cannot be observed. Do not copy credential
secret values into the report or workspace. When the report is ready, remain
available for interactive user steering; a completed turn does not finish the
Agent-Box Execution.

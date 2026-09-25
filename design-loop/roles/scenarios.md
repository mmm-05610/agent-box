# Required scenario set S01–S12 (authoritative; user-approved goals, not to be cut)

A scenario states only the user-observable result. It never states an internal
object, a UI or a mechanism. The loop must answer, per scenario: what concrete
event trajectory makes it succeed, which module owns each step, and what fails if
that owner is removed.

| id | user result | the question the design must answer |
|---|---|---|
| S01 | Connect a simple agent that only does text round-trip | Does it work with no profile, workspace, tool or recovery capability at all? |
| S02 | Use Pi through the Ordessa backend: watch tools and approvals, keep conversing | How does the real existing chain map, and which parts are carried by extensions? |
| S03 | Start a long task, leave its page, return later for progress and artefacts | How are page lifecycle and remote execution lifecycle kept distinct? |
| S04 | An agent offers only submit / progress / result, with no chat protocol | Is the host forced to fake a conversation and assistant messages? |
| S05 | Browse configuration, resources or git changes without starting any agent | Can a domain module live with no active session or run at all? |
| S06 | Two services at once, both returning the same session or task id | Do identity, authorization scope, caches and events cross over? |
| S07 | A new module supplies a view for a special artefact; it is not installed | How are extensions selected, what is the default fallback, what happens to unknown content? |
| S08 | A resource module and an execution module cooperate; the latter is replaceable | How is capability exchanged without shared arbitrary global state? |
| S09 | The link drops with an operation's outcome unknown; on reconnect events arrive duplicated and out of order | Who confirms facts, restores state and prevents double execution? |
| S10 | An extension crashes, closes or is uninstalled while a remote task still runs | Who releases subscriptions and resources, and how does running state stay explainable? |
| S11 | A service has no cancel, no history and no resume | How is unavailability stated truthfully instead of pretended to be supported? |
| S12 | Remove one core domain module that claims to be optional | Do the host and the other independent modules still work? |

S01 and S02 anchor near-term real need. The rest are extension and failure
tests. Nothing here requires hot-loading arbitrary third-party untrusted code,
nor compatibility with every protocol or every future capability.

## Scenario ledger format (`scenarios.tsv`)

```
S01|<covered|partial|open>|<core|adaptation|extension|unassigned>|<mechanism or trajectory>|<evidence pointer: round/artifact section>
```

`covered` requires (a) a named trajectory with an owning module per step and
(b) the deletion consequence for each core step in that trajectory. Anything
less is `partial`. S01..S12 all covered is the convergence gate.

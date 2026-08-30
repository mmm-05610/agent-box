# agent-box-preview-resources

Preview artifact and profile ResourceProviders. Workspace authority is supplied
by the separately installed `agent-box-git` distribution; this plugin contributes
only the resources it registers. Discovery/build do not create runtime
directories.

## Evidence ceiling

Artifact values are projections/materializations; projected does not mean
consumed, and provider self-report is not independent verification.

## What this plugin cannot prove

It cannot prove all resources were used or that a run is fully isolated, secure,
or attested.

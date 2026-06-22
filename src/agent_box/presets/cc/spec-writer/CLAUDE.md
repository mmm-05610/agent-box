# Spec Writer

Role: write technical specifications into `docs/specs/*.md`.

Use the project's standard structure:

1. **Goal** — what this workstream delivers, in one or two sentences.
2. **Architecture** — components, their responsibilities, and how they interact.
3. **Tech Stack** — languages, libraries, tools, and the rationale for each.
4. **Task Plan** — ordered, bite-sized tasks with explicit verification steps.
5. **Acceptance Criteria** — concrete checks that prove the spec is met.

Conventions:

- Keep specs self-contained; a reader with no prior context should be able
  to act on the plan.
- Number task items so reviewers can refer to them ("see T3").
- Prefer declarative language ("the resolver returns X") over imperative
  pseudocode.
- Link to relevant existing docs (`docs/ARCHITECTURE.md`, etc.) instead of
  duplicating their content.

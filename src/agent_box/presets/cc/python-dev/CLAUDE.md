# Python Developer

Role: Python implementation work — feature code, bug fixes, refactors,
and tests.

Conventions:

- Prefer the standard library. Add a third-party dependency only when
  stdlib is clearly insufficient and the dep is already in the project's
  baseline.
- Match the surrounding code style exactly (indentation, naming, import
  ordering, quote style). If a formatter is configured (black, ruff,
  etc.), let it decide — don't hand-format.
- New modules start with a module docstring explaining the responsibility
  in one or two sentences. Public functions and classes get docstrings;
  private helpers may omit them when the name is self-explanatory.
- Add tests in the project's test layout (`tests/` mirroring `src/` is
  the default). Cover the happy path and at least one failure mode.
- Run the test suite before declaring a task done. A change that breaks
  an existing test is not done — fix the test (if the contract changed)
  or fix the code (if the test is still correct), and document the call.
- Avoid premature abstraction. Two similar code blocks are better than
  a shared helper that hides the difference. Refactor on the third
  occurrence, not the second.

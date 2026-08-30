# Frontend conventions

These rules apply to `plugins/agent-box-web/frontend/`.

- Keep API access and state boundaries explicit; components receive data via
  the Web plugin's application layer.
- Drive provider/category differences from registries rather than brand-name
  branching.
- Keep shared constants and types single-sourced.
- Every route, command, and path in the frontend must point to a current Web
  plugin target.
- Run `npm run test:run`, `npm run lint`, and `npm run build` from this
  frontend directory before release validation.

# Release Process

Agent-Box Preview is distributed as one Root CLI wheel and five independent
official plugin wheels. The Root wheel owns Core, the Plugin SDK, resource
contracts, migrations, and the thin CLI. Web, Harnesses, Git, tmux, and
Artifacts remain plugin-owned.

## 2.0.0a1 Preview build

```bash
python -m pip install build
npm ci --prefix plugins/agent-box-web/frontend
npm run build --prefix plugins/agent-box-web/frontend
python -m build --wheel --sdist --outdir dist .
for package in plugins/agent-box-web plugins/agent-box-harnesses \
  plugins/agent-box-git plugins/agent-box-tmux plugins/agent-box-artifacts; do
  python -m build --wheel --outdir dist "$package"
done
```

The GitHub artifact install is:

```bash
pip install --pre --find-links . "agent-box-cli[preview]==2.0.0a1"
```

This preview is not published to PyPI; do not document the ordinary
`pip install "agent-box-cli[preview]"` command as an unconditional install.
Before release, verify wheel contents in a clean virtual environment with a
clean `AGENT_BOX_HOME`, then run `agent-box plugins list --json` and
`agent-box doctor --json`.

CI runs Core and official plugin tests, the plugin-owned frontend tests/lint/
build, wheel builds, discovery, doctor, and offline provider paths. It never
uses user credentials or a real model. Release automation attaches the Root
artifact and all five official plugin wheels; it does not build a Windows
installer, PyInstaller GUI, or ACS binary.

`agent-box-pi` is an optional third-party/example plugin and is not part of the
Preview extra.

# Gemini CLI

Official guide: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/using-agent-skills.md. Built-in → extension → user (`~/.gemini/skills` or `~/.agents/skills`) → workspace (`.gemini/skills` or `.agents/skills`), higher precedence wins. `/skills list|reload|disable|enable|link`; `gemini skills install` defaults user and supports workspace; installation and activation consent are documented. Supporting files/scripts are possible. Symlink limits, digest lock, rollback, dependency and signature are UNKNOWN. Tier B.

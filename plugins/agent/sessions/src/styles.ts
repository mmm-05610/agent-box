export const styles = `
.agent-panel { --ui-surface:#fff; --ui-nav:#f6f6f6; --ui-sunken:#f0f0f1; --ui-hover:#eaeaea; --ui-selected:#e3e4e6; --ui-line:#e8e8e8; --ui-ink:#202123; --ui-ink-secondary:#6b6e73; --ui-ink-faint:#9a9da2; --ui-accent:#3b82f6; --ui-bubble:#eff4fb; --ui-ok:#2e7d46; --ui-warn:#b26a00; --ui-error:#b3261e; --agent-ink:var(--ui-ink); --agent-muted:var(--ui-ink-secondary); --agent-line:var(--ui-line); --agent-blue:var(--ui-accent); --agent-wait:var(--ui-warn); box-sizing:border-box; height:100%; min-height:0; color:var(--agent-ink); font:13px system-ui,sans-serif; }
.agent-panel * { box-sizing:border-box; }
.agent-panel button,.agent-panel select { font:inherit; }
.agent-panel button { cursor:pointer; }
.agent-panel button:disabled { cursor:default; opacity:.5; }
.agent-panel :focus-visible { outline:2px solid var(--ui-accent); outline-offset:2px; }
.agent-sessions { display:flex; flex-direction:column; padding:6px 0; overflow:auto; background:var(--ui-nav); }
.agent-section-head { display:flex; align-items:center; justify-content:space-between; padding:6px 12px; color:var(--ui-ink-secondary); }
.agent-section-head h2 { margin:0; font:600 11px system-ui,sans-serif; letter-spacing:.02em; text-transform:none; color:var(--ui-ink); }
.agent-section-head button,.agent-actions button { color:var(--ui-ink-secondary); border:0; background:transparent; padding:4px 8px; border-radius:8px; font-size:12px; }
.agent-section-head button:hover:not(:disabled),.agent-actions button:hover:not(:disabled) { background:var(--ui-hover); color:var(--ui-ink); }
.agent-session-list { display:flex; flex-direction:column; padding:2px 8px; gap:1px; }
.agent-session-list button { width:100%; height:32px; border:0; border-radius:8px; text-align:left; background:transparent; padding:0 8px; display:flex; align-items:center; gap:8px; overflow:hidden; }
.agent-session-list button:hover { background:var(--ui-hover); }
.agent-session-list button[aria-current=true] { background:var(--ui-selected); }
.agent-actions { display:flex; padding:0 10px 6px; gap:5px; }
.agent-session-heading { border-top:1px solid var(--ui-line); margin-top:6px; padding-top:10px; }
.agent-session-list strong { flex:1; min-width:0; font-weight:500; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agent-session-list small { flex:none; font:11px system-ui,sans-serif; color:var(--ui-ink-faint); }
.agent-session-group { margin:12px 16px 3px; color:var(--ui-ink-faint); font-size:11px; font-weight:550; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agent-session-state { display:inline-flex; align-items:center; gap:4px; color:var(--ui-warn); font-size:11px; }
.agent-session-state::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }
.agent-session-state[data-status=running] { color:var(--ui-ok); }
.agent-empty,.agent-notice,.agent-error { margin:8px 16px; line-height:1.5; font-size:12px; }
.agent-empty { color:var(--ui-ink-faint); }.agent-notice { color:var(--ui-warn); }.agent-error { color:var(--ui-error); }
.agent-draft { border:1px solid var(--ui-line); border-radius:14px; background:var(--ui-surface); margin:4px 8px 8px; padding:6px 0; }
.agent-project-picker { display:flex; flex-direction:column; padding:2px 8px; gap:1px; }
.agent-project-picker button { width:100%; height:30px; border:0; border-radius:8px; text-align:left; background:transparent; padding:0 8px; font-size:12px; display:flex; align-items:center; overflow:hidden; }
.agent-project-picker button span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agent-project-picker button:hover { background:var(--ui-hover); }
.agent-project-picker button[aria-pressed=true] { background:var(--ui-selected); }
`

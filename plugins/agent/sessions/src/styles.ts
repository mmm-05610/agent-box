export const styles = `
.agent-panel { --agent-ink:#26374b; --agent-muted:#6f8094; --agent-line:#d9e1e9; --agent-blue:#315f92; --agent-wait:#a96924; box-sizing:border-box; height:100%; min-height:0; color:var(--agent-ink); font:13px system-ui,sans-serif; }
.agent-panel * { box-sizing:border-box; }
.agent-panel button,.agent-panel select { font:inherit; }
.agent-panel button { cursor:pointer; }
.agent-panel button:disabled { cursor:default; opacity:.5; }
.agent-panel :focus-visible { outline:2px solid var(--agent-blue); outline-offset:2px; }
.agent-sessions { display:flex; flex-direction:column; padding:8px 0; overflow:auto; background:#f7f9fb; }
.agent-section-head { display:flex; align-items:center; justify-content:space-between; padding:7px 12px; border-bottom:1px solid var(--agent-line); color:var(--agent-muted); }
.agent-section-head h2 { margin:0; font:600 10px ui-monospace,monospace; letter-spacing:.08em; text-transform:uppercase; }
.agent-section-head>span { font:11px ui-monospace,monospace; }
.agent-section-head button,.agent-actions button { color:var(--agent-blue); border:0; background:transparent; padding:4px 6px; border-radius:3px; font-size:11px; }
.agent-section-head button:hover,.agent-actions button:hover { background:#e7edf4; }
.agent-connections,.agent-session-list { display:flex; flex-direction:column; padding:5px 6px; gap:2px; }
.agent-connections button,.agent-session-list button { width:100%; border:0; border-radius:4px; text-align:left; background:transparent; padding:8px; display:flex; gap:8px; align-items:center; }
.agent-connections button:hover,.agent-session-list button:hover { background:#eaf0f6; }
.agent-connections button.agent-selected,.agent-session-list button[aria-current=true] { background:#e0eaf4; color:#254e7b; }
.agent-connections small { margin-left:auto; color:var(--agent-muted); font-size:10px; }
.agent-connection-mark { width:8px; height:8px; border:1px solid #8495a7; border-radius:50%; flex:none; }
.agent-selected .agent-connection-mark { background:#46846d; border-color:#46846d; }
.agent-actions { display:flex; padding:0 8px 8px; gap:5px; }
.agent-session-heading { border-top:1px solid var(--agent-line); }
.agent-session-list button { display:block; }
.agent-session-list strong,.agent-session-list small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agent-session-list strong { font-weight:500; }
.agent-session-list small { font:10px ui-monospace,monospace; color:var(--agent-muted); margin-top:3px; }
.agent-session-group { margin:6px 8px 2px; color:var(--agent-muted); font:600 10px ui-monospace,monospace; letter-spacing:.08em; text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agent-session-state { color:var(--agent-wait); }
.agent-session-state[data-status=running] { color:#376a58; }
.agent-empty,.agent-notice,.agent-error { margin:8px 12px; line-height:1.45; font-size:11px; }
.agent-empty { color:var(--agent-muted); }.agent-notice { color:var(--agent-wait); }.agent-error { color:#9b3e3e; }
`

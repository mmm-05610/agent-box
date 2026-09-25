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
.agent-section-head button,.agent-actions button { color:var(--agent-blue); border:0; background:transparent; padding:4px 6px; border-radius:3px; font-size:11px; }
.agent-section-head button:hover,.agent-actions button:hover { background:#e7edf4; }
.agent-session-list { display:flex; flex-direction:column; padding:5px 6px; gap:2px; }
.agent-session-list button { width:100%; border:0; border-radius:4px; text-align:left; background:transparent; padding:8px; display:block; }
.agent-session-list button:hover { background:#eaf0f6; }
.agent-session-list button[aria-current=true] { background:#e0eaf4; color:#254e7b; }
.agent-actions { display:flex; padding:0 8px 8px; gap:5px; }
.agent-session-heading { border-top:1px solid var(--agent-line); }
.agent-session-list strong,.agent-session-list small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agent-session-list strong { font-weight:500; }
.agent-session-list small { font:10px ui-monospace,monospace; color:var(--agent-muted); margin-top:3px; }
.agent-session-group { margin:6px 8px 2px; color:var(--agent-muted); font:600 10px ui-monospace,monospace; letter-spacing:.08em; text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agent-session-state { color:var(--agent-wait); }
.agent-session-state[data-status=running] { color:#376a58; }
.agent-empty,.agent-notice,.agent-error { margin:8px 12px; line-height:1.45; font-size:11px; }
.agent-empty { color:var(--agent-muted); }.agent-notice { color:var(--agent-wait); }.agent-error { color:#9b3e3e; }
.agent-project-picker { display:flex; flex-direction:column; padding:2px 6px; gap:2px; }
.agent-project-picker button { width:100%; border:0; border-radius:4px; text-align:left; background:transparent; padding:6px 8px; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agent-project-picker button:hover { background:#eaf0f6; }
.agent-project-picker button[aria-pressed=true] { background:#e0eaf4; color:#254e7b; }
.agent-sidebar-primary { display:grid; gap:3px; padding:8px 9px 7px; }
.agent-sidebar-primary button { border:0; background:transparent; color:var(--agent-ink); text-align:left; border-radius:6px; padding:9px 11px; font-size:12px; font-weight:550; }
.agent-sidebar-primary button:hover { background:#e9eff5; }
.agent-sidebar-primary span { display:inline-block; width:22px; color:#50657a; font-size:16px; line-height:10px; vertical-align:middle; }
.agent-new-session::before { content:'✎'; display:inline-block; width:22px; color:#50657a; font-size:16px; line-height:10px; vertical-align:middle; }
.agent-refresh { padding:2px 9px 8px; }
.agent-sidebar-sections { padding-bottom:14px; }
.agent-list-heading { color:#8793a0; padding:16px 14px 7px; font-size:10px; letter-spacing:.06em; text-transform:uppercase; }
.agent-recent-heading { margin-top:8px; border-top:1px solid var(--agent-line); }
.agent-project-row { display:flex; align-items:center; margin:1px 7px; border-radius:6px; min-height:32px; }
.agent-project-row:hover { background:#eaf0f6; }
.agent-project-row button { border:0; background:transparent; color:var(--agent-ink); border-radius:5px; height:29px; }
.agent-project-expand { width:26px; flex:none; color:#73859a!important; transition:transform .15s; }
.agent-project-group[data-state=open] .agent-project-expand { transform:rotate(90deg); }
.agent-project-name { flex:1; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; text-align:left; padding:0 4px; font-weight:550!important; }
.agent-project-name[aria-current=true] { color:#315f92; }
.agent-project-new { width:27px; flex:none; opacity:.45; font-size:18px!important; }
.agent-project-row:hover .agent-project-new,.agent-project-new:focus-visible { opacity:1; }
.agent-project-content { padding:1px 6px 4px 30px; }
.agent-session-item { border:0; border-radius:5px; background:transparent; color:var(--agent-ink); display:block; width:100%; padding:7px 8px; text-align:left; overflow:hidden; }
.agent-session-item:hover { background:#eaf0f6; }
.agent-session-item[aria-current=true] { background:#e1ebf4; color:#244b72; }
.agent-session-item strong { display:block; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:11px; font-weight:450; }
.agent-session-item small { display:block; font-size:10px; margin-top:2px; }
.agent-session-list { padding:2px 7px; }
.agent-draft { margin:0 8px 4px; border:1px solid var(--agent-line); border-radius:7px; padding:7px 0; background:#fff; }
`

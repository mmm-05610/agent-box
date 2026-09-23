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
.agent-empty,.agent-notice,.agent-error { margin:8px 12px; line-height:1.45; font-size:11px; }
.agent-empty { color:var(--agent-muted); }.agent-notice { color:var(--agent-wait); }.agent-error { color:#9b3e3e; }
.agent-placeholder { display:flex; flex-direction:column; justify-content:center; align-items:center; background:#fff; text-align:center; padding:20px; }
.agent-placeholder h2 { font-size:17px; margin:0; font-weight:550; }.agent-placeholder p { color:var(--agent-muted); }
.agent-conversation { display:flex; flex-direction:column; background:#fff; }
.agent-conversation-head { display:flex; align-items:center; justify-content:space-between; padding:10px 18px; border-bottom:1px solid var(--agent-line); }
.agent-conversation-head small { font:10px ui-monospace,monospace; color:var(--agent-muted); letter-spacing:.1em; }
.agent-conversation-head h2 { margin:2px 0 0; font-size:15px; font-weight:600; }
.agent-run-state { font:11px ui-monospace,monospace; padding:4px 8px; border-left:3px solid #a8b3c0; color:var(--agent-muted); text-transform:uppercase; }
.agent-run-state[data-status=running] { border-color:#47816b; color:#376a58; }.agent-run-state[data-status=stop-requested],.agent-run-state[data-status=unknown] { border-color:var(--agent-wait); color:var(--agent-wait); }
.agent-options { display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding:5px 18px; border-bottom:1px solid var(--agent-line); background:#fafbfd; }
.agent-options label { display:flex; align-items:center; gap:6px; color:var(--agent-muted); font-size:10px; }
.agent-options select { border:1px solid #cbd6e1; background:#fff; color:var(--agent-ink); padding:3px 5px; max-width:180px; font-size:11px; }
.agent-thread { display:flex; flex-direction:column; min-height:0; flex:1; }.agent-viewport { overflow:auto; flex:1; min-height:0; padding:14px 18px; }
.agent-message { padding:12px 14px; margin:0 0 10px; border-left:2px solid #aebed0; background:#f6f8fb; white-space:pre-wrap; overflow-wrap:anywhere; }
.agent-message:has(.agent-tool) { border-left-color:#b88a54; }.agent-reasoning,.agent-tool { padding:6px 0; }.agent-reasoning summary,.agent-tool summary { cursor:pointer; color:#586e86; font-size:11px; }
.agent-tool pre { overflow:auto; max-height:180px; padding:8px; background:#edf1f5; white-space:pre-wrap; font:11px ui-monospace,monospace; }
.agent-tool[data-tool-state=failed] { border-left:2px solid #9b3e3e; padding-left:8px; }.agent-tool[data-tool-state=failed] summary { color:#9b3e3e; }
.agent-tool[data-tool-state=unknown] { border-left:2px solid var(--agent-wait); padding-left:8px; }.agent-tool[data-tool-state=unknown] summary { color:var(--agent-wait); }
.agent-interactions-in-thread { display:flex; flex-direction:column; gap:8px; padding:9px 18px; border-bottom:1px solid var(--agent-line); background:#fbf7f0; }
.agent-interaction { padding:9px 10px; border:1px solid var(--agent-line); border-left:3px solid #b88a54; background:#fff; overflow-wrap:anywhere; }
.agent-interaction header { display:flex; align-items:center; justify-content:space-between; gap:6px; }
.agent-interaction header strong { font-size:12px; font-weight:600; }.agent-interaction header small { font:10px ui-monospace,monospace; color:var(--agent-muted); text-transform:uppercase; }
.agent-interaction p { margin:5px 0; font-size:11px; line-height:1.45; }
.agent-interaction fieldset { border:0; padding:0; margin:7px 0; }.agent-interaction legend { padding:0; font-size:11px; font-weight:600; }
.agent-interaction label { display:block; margin:4px 0; color:var(--agent-muted); font-size:10px; }
.agent-interaction input,.agent-interaction textarea,.agent-interaction select { display:block; width:100%; margin-top:3px; padding:6px; border:1px solid #cbd6e1; border-radius:4px; background:#fff; color:var(--agent-ink); font:12px system-ui,sans-serif; }
.agent-interaction textarea { min-height:72px; resize:vertical; }
.agent-interaction button { margin:5px 5px 0 0; border:1px solid #bfcddd; border-radius:4px; background:#edf3fa; color:var(--agent-blue); padding:6px 9px; font-size:11px; }
.agent-interaction button:hover:not(:disabled) { background:#dceaf7; }
.agent-interaction-error { color:#9b3e3e; }.agent-interaction-muted { color:var(--agent-muted); }
.agent-compose { display:flex; align-items:flex-end; flex-wrap:wrap; gap:8px; border-top:1px solid var(--agent-line); padding:10px 14px; }
.agent-compose-block { flex:1 0 100%; margin:0; color:var(--agent-wait); font-size:11px; line-height:1.45; }
.agent-compose form { display:flex; align-items:flex-end; flex:1; gap:8px; }.agent-compose textarea { flex:1; min-height:58px; max-height:180px; resize:vertical; border:1px solid #cbd6e1; border-radius:4px; padding:9px; font:13px system-ui,sans-serif; }
.agent-compose button { flex:none; border:1px solid #bfcddd; background:#edf3fa; color:#315f92; border-radius:4px; padding:8px 11px; font-size:11px; }
.agent-compose button:hover:not(:disabled) { background:#dceaf7; }
@media(max-width:800px) { .agent-conversation-head { padding:8px; }.agent-viewport { padding:10px; }.agent-compose { flex-wrap:wrap; padding:8px; } }
`

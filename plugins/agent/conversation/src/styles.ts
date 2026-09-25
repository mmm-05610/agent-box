export const styles = `
.agent-panel { --ui-surface:#fff; --ui-nav:#f6f6f6; --ui-sunken:#f0f0f1; --ui-hover:#eaeaea; --ui-selected:#e3e4e6; --ui-line:#e8e8e8; --ui-ink:#202123; --ui-ink-secondary:#6b6e73; --ui-ink-faint:#9a9da2; --ui-accent:#3b82f6; --ui-bubble:#eff4fb; --ui-ok:#2e7d46; --ui-warn:#b26a00; --ui-error:#b3261e; --ui-confirm:#256a3d; --ui-confirm-soft:#eaf4ec; --ui-confirm-line:#c4ddcd; --agent-ink:var(--ui-ink); --agent-muted:var(--ui-ink-secondary); --agent-line:var(--ui-line); --agent-blue:var(--ui-accent); --agent-wait:var(--ui-warn); box-sizing:border-box; height:100%; min-height:0; color:var(--agent-ink); font:13px system-ui,sans-serif; }
.agent-panel * { box-sizing:border-box; }
.agent-panel button,.agent-panel select { font:inherit; }
.agent-panel button { cursor:pointer; }
.agent-panel button:disabled { cursor:default; opacity:.5; }
.agent-panel :focus-visible { outline:2px solid var(--ui-accent); outline-offset:2px; }
.agent-sessions { display:flex; flex-direction:column; padding:6px 0; overflow:auto; background:var(--ui-nav); }
.agent-section-head { display:flex; align-items:center; justify-content:space-between; padding:6px 12px; color:var(--ui-ink-secondary); }
.agent-section-head h2 { margin:0; font:600 11px system-ui,sans-serif; color:var(--ui-ink); }
.agent-section-head>span { font:11px ui-monospace,monospace; }
.agent-section-head button,.agent-actions button { color:var(--ui-ink-secondary); border:0; background:transparent; padding:4px 8px; border-radius:8px; font-size:12px; }
.agent-section-head button:hover:not(:disabled),.agent-actions button:hover:not(:disabled) { background:var(--ui-hover); color:var(--ui-ink); }
.agent-connections,.agent-session-list { display:flex; flex-direction:column; padding:2px 8px; gap:1px; }
.agent-connections button,.agent-session-list button { width:100%; height:32px; border:0; border-radius:8px; text-align:left; background:transparent; padding:0 8px; display:flex; gap:8px; align-items:center; overflow:hidden; }
.agent-connections button:hover,.agent-session-list button:hover { background:var(--ui-hover); }
.agent-connections button.agent-selected,.agent-session-list button[aria-current=true] { background:var(--ui-selected); }
.agent-connections small { margin-left:auto; color:var(--ui-ink-faint); font-size:11px; }
.agent-connection-mark { width:8px; height:8px; border:1px solid var(--ui-ink-faint); border-radius:50%; flex:none; }
.agent-selected .agent-connection-mark { background:var(--ui-ok); border-color:var(--ui-ok); }
.agent-actions { display:flex; padding:0 10px 6px; gap:5px; }
.agent-session-heading { border-top:1px solid var(--ui-line); margin-top:6px; padding-top:10px; }
.agent-session-list button { display:flex; }
.agent-session-list strong { flex:1; min-width:0; font-weight:500; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agent-session-list small { flex:none; max-width:45%; font:11px system-ui,sans-serif; color:var(--ui-ink-faint); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agent-session-group { margin:12px 16px 3px; color:var(--ui-ink-faint); font-size:11px; font-weight:550; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agent-session-state { color:var(--ui-warn); font-size:11px; }
.agent-session-state[data-status=running] { color:var(--ui-ok); }
.agent-empty,.agent-notice,.agent-error { margin:8px 16px; line-height:1.5; font-size:12px; }
.agent-empty { color:var(--ui-ink-faint); }.agent-notice { color:var(--ui-warn); }.agent-error { color:var(--ui-error); }
.agent-placeholder { display:flex; flex-direction:column; justify-content:center; align-items:center; background:var(--ui-surface); text-align:center; padding:24px; }
.agent-placeholder::before { content:""; width:52px; height:52px; border-radius:50%; background:var(--ui-sunken); margin-bottom:16px; }
.agent-placeholder h2 { font-size:16px; margin:0; font-weight:600; color:var(--ui-ink); }.agent-placeholder p { color:var(--ui-ink-faint); font-size:13px; }
.agent-conversation { display:flex; flex-direction:column; background:var(--ui-surface); }
.agent-conversation-head { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 18px; border-bottom:1px solid var(--ui-line); }
.agent-conversation-head small { font:10px ui-monospace,monospace; color:var(--ui-ink-faint); letter-spacing:.1em; }
.agent-conversation-head h2 { margin:1px 0 0; font-size:14px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agent-run-state { font:11px ui-monospace,monospace; padding:3px 10px; border-radius:999px; background:var(--ui-sunken); color:var(--ui-ink-secondary); text-transform:uppercase; flex:none; }
.agent-run-state[data-status=running] { background:#e8f3ec; color:var(--ui-ok); }.agent-run-state[data-status=starting] { background:#e8f3ec; color:var(--ui-ok); }.agent-run-state[data-status=stop-requested],.agent-run-state[data-status=unknown] { background:#f7efe2; color:var(--ui-warn); }
.agent-options { display:flex; gap:10px; align-items:center; flex-wrap:wrap; padding:5px 18px; border-bottom:1px solid var(--ui-line); background:var(--ui-nav); }
.agent-options label { display:flex; align-items:center; gap:6px; color:var(--ui-ink-secondary); font-size:11px; }
.agent-options select { border:1px solid var(--ui-line); background:var(--ui-surface); color:var(--ui-ink); padding:3px 6px; border-radius:8px; max-width:180px; font-size:12px; }
.agent-thread { display:flex; flex-direction:column; min-height:0; flex:1; }
.agent-viewport { overflow:auto; flex:1; min-height:0; padding:20px 18px 8px; }
.agent-viewport>* { max-width:760px; margin-left:auto; margin-right:auto; }
.agent-message { padding:2px 0; margin:0 0 14px; white-space:pre-wrap; overflow-wrap:anywhere; font-size:14px; line-height:1.65; }
.agent-message[data-role=user] { margin-left:auto; width:fit-content; max-width:82%; background:var(--ui-bubble); color:var(--ui-ink); border-radius:16px; padding:9px 14px; font-size:14px; }
.agent-tool { padding:0; margin:0 0 10px; border-radius:12px; background:var(--ui-sunken); overflow:hidden; }
.agent-tool summary { cursor:pointer; list-style:none; display:flex; align-items:center; gap:8px; padding:8px 12px; color:var(--ui-ink-secondary); font-size:12px; }
.agent-tool summary::-webkit-details-marker { display:none; }
.agent-tool summary::before { content:""; width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-top:5px solid currentColor; opacity:.6; transition:transform .12s; }
.agent-tool[open] summary::before { transform:rotate(180deg); }
.agent-tool>:not(summary) { padding:0 12px 10px 26px; }
.agent-tool summary svg { flex:none; }
.agent-tool[data-tool-state=completed] summary svg { color:var(--ui-ok); }
.agent-tool[data-tool-state=running] summary svg { color:var(--ui-accent); }
.agent-tool-spin { animation:agent-spin .9s linear infinite; transform-origin:center; }
@keyframes agent-spin { to { transform:rotate(360deg); } }
@media(prefers-reduced-motion:reduce) { .agent-tool-spin { animation:none; } }
/* ZCode treats thinking as a quiet left-rail aside, not a card competing with tool output. */
.agent-reasoning { margin:0 0 12px; padding:2px 0 6px 12px; border-left:2px solid var(--ui-line); color:var(--ui-ink-secondary); font-size:13px; }
.agent-reasoning summary { cursor:pointer; list-style:none; display:flex; align-items:center; gap:8px; padding:2px 0; color:var(--ui-ink-faint); font-size:12px; }
.agent-reasoning summary::-webkit-details-marker { display:none; }
.agent-reasoning summary::before { content:""; width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-top:5px solid currentColor; opacity:.6; transition:transform .12s; }
.agent-reasoning[open] summary::before { transform:rotate(180deg); }
.agent-reasoning>div,.agent-reasoning>:not(summary) { padding:4px 0 0; }
.agent-tool pre { overflow:auto; max-height:200px; margin:0 12px 10px; padding:9px 11px; background:var(--ui-surface); border:1px solid var(--ui-line); border-radius:8px; white-space:pre-wrap; font:12px ui-monospace,monospace; color:var(--ui-ink); }
.agent-tool[data-tool-state=failed] summary { color:var(--ui-error); }
.agent-tool[data-tool-state=failed] { background:#f9ecea; box-shadow:inset 2px 0 0 var(--ui-error); }
.agent-tool[data-tool-state=unknown] summary { color:var(--ui-warn); }
.agent-tool[data-tool-state=running] summary { color:var(--ui-ink); }
.agent-interactions-in-thread { display:flex; flex-direction:column; gap:8px; margin:0 0 14px; }
/* ZCode confirmation.tsx: pending approvals carry a dedicated confirmation palette, never the generic success green. */
.agent-interaction { padding:12px 14px; border:1px solid var(--ui-line); border-radius:14px; background:var(--ui-surface); box-shadow:0 1px 2px rgba(32,33,35,.05); overflow-wrap:anywhere; }
.agent-interaction[data-state=pending],.agent-interaction[data-state=responding] { border-color:var(--ui-confirm-line); box-shadow:inset 3px 0 0 var(--ui-confirm), 0 1px 2px rgba(32,33,35,.05); }
.agent-interaction[data-state=resolved] { background:var(--ui-confirm-soft); border-color:var(--ui-confirm-line); }
.agent-interaction[data-state=expired],.agent-interaction[data-state=unknown] { background:var(--ui-sunken); border-color:var(--ui-line); }
.agent-interaction header { display:flex; align-items:center; justify-content:space-between; gap:6px; }
.agent-interaction header strong { font-size:13px; font-weight:600; }.agent-interaction header small { font:10px ui-monospace,monospace; color:var(--ui-warn); text-transform:uppercase; }
.agent-interaction[data-state=pending] header small,.agent-interaction[data-state=responding] header small { color:var(--ui-confirm); }
.agent-interaction[data-state=resolved] header small { color:var(--ui-confirm); }
.agent-interaction[data-state=resolved] header strong,.agent-interaction[data-state=resolved] p { color:var(--ui-ink-secondary); }
.agent-interaction p { margin:6px 0; font-size:12px; line-height:1.55; color:var(--ui-ink-secondary); }
.agent-interaction fieldset { border:0; padding:0; margin:8px 0; }.agent-interaction legend { padding:0; font-size:12px; font-weight:600; }
.agent-interaction label { display:block; margin:4px 0; color:var(--ui-ink-secondary); font-size:11px; }
.agent-interaction input,.agent-interaction textarea,.agent-interaction select { display:block; width:100%; margin-top:3px; padding:7px 9px; border:1px solid var(--ui-line); border-radius:10px; background:var(--ui-surface); color:var(--ui-ink); font:13px system-ui,sans-serif; }
.agent-interaction textarea { min-height:72px; resize:vertical; }
.agent-interaction button { margin:6px 6px 0 0; border:0; border-radius:999px; background:var(--ui-sunken); color:var(--ui-ink); padding:7px 14px; font-size:12px; font-weight:550; }
.agent-interaction button:hover:not(:disabled) { background:var(--ui-hover); }
.agent-interaction[data-state=pending] button { background:var(--ui-confirm-soft); color:var(--ui-confirm); }
.agent-interaction[data-state=pending] button:hover:not(:disabled) { background:#dcece2; }
.agent-interaction-error { color:var(--ui-error); }.agent-interaction-muted { color:var(--ui-ink-faint); }
.agent-compose { display:flex; flex-wrap:wrap; align-items:center; gap:8px; width:calc(100% - 36px); max-width:760px; margin:8px auto 16px; padding:10px 12px; border:1px solid var(--ui-line); border-radius:20px; background:var(--ui-surface); box-shadow:0 2px 12px rgba(32,33,35,.08); transition:border-color .12s, background-color .12s; }
/* ZCode prompt-editor: resting → hover border → focus-within surface lift, so the composer reads as the active target. */
.agent-compose:hover { border-color:#d5d8dc; }
.agent-compose:focus-within { border-color:#b9cde9; background:#fcfdff; box-shadow:0 2px 16px rgba(59,130,246,.14); }
.agent-compose form { display:contents; }
.agent-compose-block { flex:1 0 100%; margin:0; color:var(--ui-warn); font-size:12px; line-height:1.45; }
.agent-compose textarea { flex:1 0 100%; min-height:44px; max-height:180px; resize:vertical; border:0; background:transparent; padding:6px 6px; font:14px/1.6 system-ui,sans-serif; color:var(--ui-ink); }
.agent-compose textarea::placeholder { color:var(--ui-ink-faint); }
.agent-compose textarea:focus-visible { outline:none; }
.agent-compose button[type=submit] { flex:none; margin-left:auto; border:0; border-radius:999px; background:var(--ui-accent); color:#fff; width:34px; height:34px; padding:0; font-size:0; }
.agent-compose button[type=submit]::after { content:"↑"; font-size:16px; }
.agent-compose button[type=submit]:hover:not(:disabled) { background:#2f6fd6; }
.agent-compose button:not([type=submit]) { order:-1; flex:none; border:1px solid var(--ui-line); border-radius:999px; background:var(--ui-surface); color:var(--ui-ink-secondary); padding:7px 14px; font-size:12px; }
.agent-compose button:not([type=submit]):hover:not(:disabled) { background:var(--ui-hover); }
@media(max-width:800px) { .agent-conversation-head { padding:8px 12px; }.agent-viewport { padding:12px 10px 4px; }.agent-compose { width:calc(100% - 20px); padding:8px 10px; } }
`

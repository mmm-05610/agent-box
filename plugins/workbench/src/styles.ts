export const styles = `
.wb { --line:#dce2e9; --muted:#798595; --accent:#376b9e; color:#29374a; background:#f6f8fa; font-size:13px; height:100vh; overflow:hidden; }
.wb [data-testid=workspace]:not([hidden]) { display:flex; flex-direction:column; height:100%; }
.wb button { border:0; border-radius:4px; background:transparent; color:inherit; padding:5px 9px; font-size:12px; }
.wb button:hover:not(:disabled) { background:#e8edf3; }
.wb button[aria-pressed=true] { color:#315f92; background:#e8eff8; }
.wb button:disabled { opacity:.35; }
.wb h1 { margin:0; font-size:16px; font-weight:600; }
.wb p { line-height:1.6; }
.wb-bar { height:36px; flex-shrink:0; display:flex; align-items:center; gap:20px; padding:0 10px 0 16px; border-bottom:1px solid var(--line); background:#f4f6f9; }
.wb-bar strong { font-size:12px; letter-spacing:.3px; }
.wb-bar small { font-family:ui-monospace,monospace; font-size:9px; color:var(--muted); font-weight:400; letter-spacing:1.3px; margin-left:10px; }
.wb-actions,.wb-layout-actions,.wb-status { display:flex; gap:4px; align-items:center; }
.wb-layout-actions { margin-left:auto; }
.wb-layout-actions button { display:flex; padding:5px; }
.wb-body { flex:1; display:flex; min-height:0; }
.wb-navigation { width:52px; flex-shrink:0; border-right:1px solid var(--line); display:flex; flex-direction:column; justify-content:space-between; padding:6px 3px; background:#eef2f6; }
.wb-navigation button { width:100%; display:flex; align-items:center; flex-direction:column; gap:3px; font-size:10px; padding:8px 1px; overflow:hidden; }
.wb-navigation button>span:last-child { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wb-nav-icon { font-size:20px; line-height:24px; color:#60758d; }
.wb-nav-utility { margin-top:auto; }
.wb-layout { flex:1; min-width:0; position:relative; }
.wb-group { height:100%; }
.wb-region { height:100%; min-width:0; display:flex; flex-direction:column; background:#f7f9fb; overflow:hidden; }
.wb-main { background:#fff; }
.wb-region>header { height:31px; flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:4px; border-bottom:1px solid var(--line); padding:0 5px; }
.wb-region>header>[role=group] { min-width:0; overflow:auto; display:flex; align-items:center; height:100%; }
.wb-region [draggable=true] { white-space:nowrap; height:100%; border-radius:0; border-bottom:2px solid transparent; cursor:grab; }
.wb-region [draggable=true][aria-pressed=true] { border-bottom-color:var(--accent); background:transparent; }
.wb-region-actions { display:flex; align-items:center; flex-shrink:0; }
.wb-region-actions select { font:inherit; font-size:10px; color:var(--muted); border:0; background:transparent; width:54px; }
.wb-region-label { font-size:10px; color:var(--muted); margin-left:7px; }
.wb-content { overflow:auto; min-height:0; }
.wb-content:has(.wb-surface) { flex:1; }
.wb-surface { padding:16px; }
.wb-surface h1,.wb-surface h2 { font-size:16px; }
.wb-surface textarea { max-width:100%; }
.wb-separator { background:var(--line); flex-shrink:0; position:relative; }
.wb-separator[aria-orientation=vertical] { width:4px; }
.wb-separator[aria-orientation=horizontal] { height:4px; }
.wb-separator:hover,.wb-separator:focus-visible,.wb-separator[data-separator=active] { background:var(--accent); }
.wb-separator-empty { display:none; }
.wb-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px; color:var(--muted); user-select:none; }
.wb-empty-mark { font-size:64px; font-weight:300; color:#dde5ee; margin-bottom:18px; }
.wb-empty h1 { font-size:14px; font-weight:500; color:#7c8b9c; }
.wb-empty p { margin:10px 0 24px; font-size:12px; }
.wb-empty small { font-size:10px; text-align:center; }
.wb-status { min-height:23px; flex-shrink:0; padding:0 12px; border-top:1px solid var(--line); color:#8290a0; font-size:10px; gap:8px; }
.wb-status-dot { width:5px; height:5px; border-radius:50%; background:#81a18b; }
.wb-status-end { margin-left:auto; }
.wb-full { height:100vh; display:flex; flex-direction:column; background:#f6f8fa; }
.wb-full>.wb-bar { height:42px; justify-content:space-between; }
.wb-full-content { width:100%; max-width:1100px; margin:0 auto; padding:28px; overflow:auto; }
.wb-error { position:fixed; bottom:32px; right:16px; padding:16px; max-width:80vw; border:1px solid #ba6565; background:#fff; z-index:5; }
.wb-error button { margin-left:16px; }
.wb-drop-targets { position:absolute; inset:0; display:grid; grid-template-columns:25% 1fr 25%; grid-template-rows:22% 1fr 25%; gap:5px; padding:8px; z-index:4; background:#f1f5faaa; }
.wb-drop-targets>div { display:flex; align-items:center; justify-content:center; background:#dae7f5dd; border:1px dashed #547da7; color:#315f92; }
.wb-drop-targets>div:hover { background:#bed7f1; }
.wb-drop-top { grid-area:1/1/2/4; }.wb-drop-left { grid-area:2/1; }.wb-drop-main { grid-area:2/2; }.wb-drop-right { grid-area:2/3; }.wb-drop-bottom { grid-area:3/1/4/4; }
@media(max-width:800px) { .wb-bar small,.wb-status-end { display:none; }.wb-region-actions select { width:40px; } }
`

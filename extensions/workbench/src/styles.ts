export const styles = `
.wb { --line:#dbe2ea; --muted:#64748b; min-height:100vh; }
.wb [data-testid=workspace]:not([hidden]) { display:flex; flex-direction:column; height:100vh; }
.wb button { border:1px solid var(--line); border-radius:5px; background:#fff; color:inherit; padding:7px 12px; }
.wb button:hover:not(:disabled) { background:#edf2f8; }
.wb button[aria-pressed=true] { color:#315fa8; border-color:#315fa8; background:#eef4fc; }
.wb button:disabled { color:var(--muted); }
.wb h1 { margin:0; font-size:20px; font-weight:600; }
.wb p { line-height:1.6; }
.wb-bar { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 24px; border-bottom:1px solid var(--line); background:#fff; }
.wb-bar small { font-size:12px; color:var(--muted); font-weight:400; margin-left:8px; }
.wb-actions,.wb-navigation,.wb-status { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.wb-navigation { padding:12px 24px; border-bottom:1px solid var(--line); }
.wb-middle { display:flex; flex:1; min-height:0; overflow:hidden; }
.wb-region { display:flex; flex-direction:column; background:#fff; min-width:0; min-height:0; border-bottom:1px solid var(--line); }
.wb-top,.wb-bottom { max-height:22vh; flex-shrink:0; }
.wb-region>header { flex-shrink:0; }
.wb-region>header { display:flex; justify-content:space-between; gap:8px; padding:8px; border-bottom:1px solid var(--line); }
.wb-region>header>div { display:flex; flex-wrap:wrap; gap:4px; }
.wb-left,.wb-right { width:240px; flex-shrink:0; border-right:1px solid var(--line); }
.wb-right { border-right:0; border-left:1px solid var(--line); }
.wb-left.wb-collapsed,.wb-right.wb-collapsed { width:auto; max-width:140px; }
.wb-main { flex:1; }
.wb-content { padding:20px; overflow:auto; flex:1; }
.wb-empty { padding:64px 32px; color:var(--muted); }
.wb-empty h1 { color:#243247; }
.wb-status { min-height:30px; padding:8px 24px; color:var(--muted); font-size:12px; }
.wb-full { height:100vh; display:flex; flex-direction:column; }
.wb-full>.wb-bar { flex-shrink:0; }
.wb-full-content { width:100%; max-width:1100px; margin:0 auto; padding:24px; overflow:auto; }
.wb-error { padding:16px; border:1px solid #b65252; background:#fff; }
.wb-error button { margin-left:16px; }
@media(max-width:800px) { .wb-middle { flex-wrap:wrap; } .wb-main { flex-basis:100%; order:-1; } .wb-left,.wb-right { width:50%; } }
`

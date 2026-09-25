// HD004 controlled integration driver — CDP over the real Electron UI.
// usage: node hd004-driver.mjs <step> [args...]
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ROOT = readFileSync('/tmp/hd004-root.txt', 'utf8').trim()
const EVID = `${ROOT}/evidence${process.env.HD004_DESK === '2' ? '2' : ''}`
const statePath = `${EVID}/state.json`
const projectPath = process.env.HD004_DESK === '2' ? `${ROOT}/project2` : `${ROOT}/project`
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {}
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 1))

const dbgFile = process.env.HD004_DESK === '2' ? 'dbg2' : 'dbg1'
const portFile = process.env.HD004_DESK === '2' ? 'port2' : 'port1'
const DBG = readFileSync(`${ROOT}/${dbgFile}.txt`, 'utf8').trim()
const PORT = readFileSync(`${ROOT}/${portFile}.txt`, 'utf8').trim()

let ws, nextId = 1
const waiting = new Map()
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    waiting.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function connect() {
  const targets = JSON.parse(await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).text())
  const page = targets.find(t => t.type === 'page' && t.url.startsWith('ordessa://'))
  if (!page) throw new Error('no ordessa page target')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && waiting.has(m.id)) {
      const { resolve, reject } = waiting.get(m.id); waiting.delete(m.id)
      if (m.error) reject(Error(m.error.message)); else resolve(m.result)
    }
  }
  await cdp('Runtime.enable'); await cdp('Page.enable')
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function evl(expression, { awaitPromise = true } = {}) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
  if (r.exceptionDetails) throw new Error('UI: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
  return r.result.value
}
async function waitFor(name, expression, ms = 40000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await evl(`!!(${expression})`, { awaitPromise: false })) return true
    await sleep(250)
  }
  throw new Error(`timeout waiting for ${name}: ${expression}`)
}
async function shot(name) {
  await cdp('Page.bringToFront'); await sleep(150)
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' })
  const buf = Buffer.from(data, 'base64')
  writeFileSync(`${EVID}/${name}.png`, buf)
  console.log(`screenshot ${name}.png ${buf.length}`)
}
async function wire(method, params) {
  const token = readFileSync(`${ROOT}/data/secrets/http-token`, 'utf8').trim()
  const tokenFile = portFile === 'port2' ? `${ROOT}/data2/secrets/http-token` : `${ROOT}/data/secrets/http-token`
  const tok = readFileSync(tokenFile, 'utf8').trim()
  void token
  const r = await fetch(`http://127.0.0.1:${PORT}/wire/v1/${method}`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }),
  })
  return (await r.json())
}
const peerEvents = () => {
  const out = []
  for (const f of readdirSync(`${ROOT}/peers${process.env.HD004_DESK === '2' ? '2' : ''}`)) {
    for (const line of readFileSync(`${ROOT}/peers${process.env.HD004_DESK === '2' ? '2' : ''}/${f}`, 'utf8').split('\n')) {
      if (line.trim()) out.push({ file: f, ...JSON.parse(line) })
    }
  }
  return out
}
const ps = pattern => { try { return execSync(`pgrep -af ${JSON.stringify(pattern)}`).toString().trim() } catch { return '' } }
function dump(name, value) { writeFileSync(`${EVID}/${name}.json`, JSON.stringify(value, null, 1)); console.log(name, 'dumped') }

// --- shared UI primitives (selectors from electron/main.ts smoke + view.tsx) ---
const UI = {
  tab: label => `[...document.querySelectorAll('[data-region] header [role="group"] button')].find(b => b.textContent === ${label})?.click()`,
}
async function openPopover() {
  await evl(`(async () => {
    const nav = [...document.querySelectorAll('nav button')].find(b => b.getAttribute('aria-label') === 'Agents');
    nav?.click();
    for (let i = 0; i < 80 && !document.querySelector('.conn-status-toggle'); i++) await new Promise(r => setTimeout(r, 50));
    const t = document.querySelector('.conn-status-toggle');
    if (!t) throw new Error('no conn-status-toggle');
    if (!document.querySelector('[role="group"][aria-label=\"Agent connections\"]')) t.click();
    for (let i = 0; i < 80 && !document.querySelector('[role="group"][aria-label="Agent connections"]'); i++) await new Promise(r => setTimeout(r, 50));
    return true })()`)
}
async function clickConnection(substr) {
  await evl(`(() => { const b = [...document.querySelectorAll('[role="group"][aria-label="Agent connections"] button[data-connection-id]')].find(x => x.textContent.includes(${JSON.stringify(substr)})); if (!b) throw new Error('connection not found: ' + ${JSON.stringify(substr)}); b.click(); return b.getAttribute('data-connection-id') })()`)
}
async function clickTab(label) {
  await evl(`(() => { const b = [...document.querySelectorAll('[data-region] header [role="group"] button')].find(x => x.textContent === ${JSON.stringify(label)}); if (!b) throw new Error('no tab ' + ${JSON.stringify(label)}); b.click(); return true })()`, { awaitPromise: false })
}
async function compose(text, buttonLabel) {
  return await evl(`(async () => {
    const field = document.querySelector('.agent-compose textarea');
    if (!field) throw new Error('no composer');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, ${JSON.stringify(text)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
    const labels = [${JSON.stringify(buttonLabel)}, 'Start session', 'Send'];
    const find = () => { const bs = [...document.querySelectorAll('.agent-compose button')]; for (const l of labels) { const b = bs.find(x => x.textContent === l); if (b && !b.disabled) return b } return null };
    for (let i = 0; i < 80 && !find(); i++) await new Promise(r => setTimeout(r, 100));
    const b = find(); if (!b) throw new Error('send not enabled: ' + ${JSON.stringify(buttonLabel)});
    b.click(); return true })()`)
}
const messagesExpr = `[...document.querySelectorAll('.agent-message')].map(m => m.textContent)`

const steps = {
  async probe() {
    await openPopover()
    const list = await evl(`[...document.querySelectorAll('[role="group"][aria-label="Agent connections"] button')].map(b => ({ text: b.textContent, id: b.getAttribute('data-connection-id') }))`)
    dump('connections-list', list)
    await shot('00-connections-popover')
  },
  async connectServer() {
    await openPopover()
    const id = await clickConnection('ACP')
    await waitFor('connected dot', `document.querySelector('.conn-dot-connected')`)
    dump('acp-connection-id', { id })
    await shot('01-connected')
    await clickTab('Sessions')
    await waitFor('sessions panel', `document.querySelector('.agent-sessions')`)
    await evl(`[...document.querySelectorAll('.agent-sessions button')].find(b => b.textContent === 'New session')?.click()`)
    await waitFor('project picker', `document.querySelector('.agent-project-picker')`)
    await evl(`[...document.querySelectorAll('.agent-sessions button')].find(b => b.textContent === 'Refresh projects')?.click()`)
    await waitFor('project listed', `[...document.querySelectorAll('.agent-project-picker button')].some(b => b.textContent.trim() === ${JSON.stringify(projectPath)})`, 20000)
    await evl(`[...document.querySelectorAll('.agent-project-picker button')].find(b => b.textContent.trim() === ${JSON.stringify(projectPath)})?.click()`)
    await waitFor('project selected', `[...document.querySelectorAll('.agent-project-picker button')].some(b => b.textContent.trim() === ${JSON.stringify(projectPath)} && b.getAttribute('aria-pressed') === 'true')`)
    await clickTab('Conversation')
    await waitFor('composer', `document.querySelector('.agent-compose')`)
    await sleep(700)
    const draft = await evl(`({ head: document.querySelector('.agent-conversation-head')?.textContent ?? null,
      startDisabled: [...document.querySelectorAll('.agent-compose button')].find(b => b.textContent === 'Start session')?.disabled ?? null,
      value: document.querySelector('.agent-compose textarea')?.value ?? null })`)
    const peersNow = peerEvents()
    const execNow = await wire('executions.list', { requestId: 'hd004-exec-list-draft', limit: 50 })
    dump('check1-empty-draft', { draft, peerEvents: peersNow, executions: execNow, ps: { entry: ps('access-entry.mjs'), peer: ps('bidirectional_acp_peer') } })
    await shot('02-empty-draft')
  },
  async firstSend() {
    await compose('hd004 round one', 'Start session')
    await waitFor('session head', `document.querySelector('.agent-conversation-head small')?.textContent === 'SESSION'`)
    await waitFor('first reply', `(${messagesExpr}).length >= 2 && (${messagesExpr}).at(-1)?.includes('got:hd004 round one')`)
    await sleep(500)
    dump('check2-first', { messages: await evl(messagesExpr, { awaitPromise: false }), peerEvents: peerEvents(),
      executions: await wire('executions.list', { requestId: 'hd004-exec-1', limit: 50 }),
      ps: { entry: ps('access-entry.mjs'), peer: ps('bidirectional_acp_peer') } })
    await shot('03-first-reply')
  },
  async secondSend() {
    await compose('hd004 round two', 'Send')
    await waitFor('second reply', `(a => a.length >= 4 && a.at(-1)?.includes('got:hd004 round two'))(${messagesExpr})`)
    await sleep(500)
    dump('check2-second', { messages: await evl(messagesExpr, { awaitPromise: false }), peerEvents: peerEvents(),
      ps: { entry: ps('access-entry.mjs'), peer: ps('bidirectional_acp_peer') } })
    await shot('04-second-reply')
  },
  async richStream() {
    const before = await evl(`(${messagesExpr}).length`, { awaitPromise: false })
    await compose('scenario:rich hd004', 'Send')
    await waitFor('thought visible', `document.querySelector('.agent-reasoning')`)
    await sleep(1400)
    const mid = await evl(`({ reasoning: document.querySelector('.agent-reasoning')?.textContent ?? null,
      tools: [...document.querySelectorAll('.agent-tool')].map(t => ({ state: t.getAttribute('data-tool-state'), text: t.textContent })) })`)
    await shot('05-streaming-mid')
    await waitFor('rich settled', `(a => a.length > ${before} + 1 && a.at(-1)?.includes('rich streaming answer'))(${messagesExpr})`, 30000)
    const fin = await evl(`({ reasoning: document.querySelector('.agent-reasoning')?.textContent ?? null,
      tools: [...document.querySelectorAll('.agent-tool')].map(t => ({ state: t.getAttribute('data-tool-state'), text: t.textContent })) })`)
    dump('check3-stream', { mid, fin, peerEvents: peerEvents().slice(-30) })
    await shot('06-streaming-final')
  },
  async permission() {
    await compose('scenario:permission twin-options', 'Send')
    await waitFor('interaction card', `document.querySelector('.agent-interactions-in-thread article.agent-interaction')`)
    await sleep(400)
    const card = await evl(`(() => { const a = document.querySelector('.agent-interactions-in-thread article.agent-interaction');
      return { id: a.getAttribute('data-interaction'), text: a.textContent, buttons: [...a.querySelectorAll('button')].map(b => ({ text: b.textContent, aria: b.getAttribute('aria-label') })) } })()`)
    await shot('07-approval-card')
    dump('check4-card', card)
    return card
  },
  async pickSecond() {
    const clicked = await evl(`(() => {
      const a = document.querySelector('.agent-interactions-in-thread article.agent-interaction');
      if (!a) throw new Error('no interaction card');
      const buttons = [...a.querySelectorAll('button')];
      // twin-options: two allow_once options come before reject_once; pick the second of the same kind
      const b = buttons[1]; if (!b) throw new Error('no second option'); b.click();
      return { text: b.textContent, aria: b.getAttribute('aria-label') } })()`)
    await sleep(1000)
    const peerAnswer = peerEvents().filter(e => e.event === 'permission-answer')
    await waitFor('settled after answer', `!document.querySelector('.agent-interactions-in-thread article.agent-interaction')`, 25000).catch(() => false)
    dump('check4-answer', { clicked, peerAnswer: peerAnswer.slice(-3), msgs: await evl(messagesExpr) })
    await shot('08-after-approval')
  },
  async stopFlow() {
    await compose('scenario:hang hd004-stop', 'Send')
    await waitFor('stop button armed', `[...document.querySelectorAll('.agent-compose button')].some(b => /Stop requested|Request stop/.test(b.textContent))`)
    const before = await evl(`({ buttons: [...document.querySelectorAll('.agent-compose button')].map(b => ({ t: b.textContent, d: b.disabled })), msgs: (${messagesExpr}).length, alerts: [...document.querySelectorAll('[role="status"],[role="alert"]')].map(p => p.textContent) })`)
    await evl(`(() => { const b = [...document.querySelectorAll('.agent-compose button')].find(x => x.textContent === 'Request stop'); if (!b) throw new Error('no Request stop'); b.click(); return true })()`)
    await sleep(700)
    const requested = await evl(`({ buttons: [...document.querySelectorAll('.agent-compose button')].map(b => ({ t: b.textContent, d: b.disabled })), msgs: (${messagesExpr}), alerts: [...document.querySelectorAll('[role="status"],[role="alert"]')].map(p => p.textContent) })`)
    await shot('09-stop-requested')
    let peerSawCancel = false
    for (let i = 0; i < 40 && !peerSawCancel; i++) {
      peerSawCancel = peerEvents().some(e => e.dir === 'recv' && e.frame?.method === 'session/cancel')
      if (!peerSawCancel) await sleep(250)
    }
    await sleep(1500)
    const after = await evl(`({ msgs: (${messagesExpr}), buttons: [...document.querySelectorAll('.agent-compose button')].map(b => b.textContent), statuses: [...document.querySelectorAll('[role="status"],[role="alert"]')].map(p => p.textContent) })`)
    dump('check5-stop', { before, requested, peerSawCancel, after, executions: await wire('executions.list', { requestId: 'hd004-exec-stop', limit: 50 }) })
    await shot('10-stop-settled')
  },
  async viewSwitch() {
    await clickTab('Sessions'); await sleep(400)
    await evl(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'project'); if (b) b.click(); return !!b })()`); await sleep(400)
    await evl(`[...document.querySelectorAll('nav button')].find(b => b.getAttribute('aria-label') === 'Agents')?.click()`); await sleep(400)
    await clickTab('Conversation'); await sleep(400)
    const after = await evl(`({ msgs: (${messagesExpr}).length, connected: !!document.querySelector('.conn-dot-connected') })`)
    await compose('hd004 after view switch', 'Send')
    await waitFor('reply after switch', `(a => a.at(-1)?.includes('got:hd004 after view switch'))(${messagesExpr})`)
    dump('check6a-views', { after, peerEvents: peerEvents(), ps: { entry: ps('access-entry.mjs'), peer: ps('bidirectional_acp_peer') } })
    await shot('11-after-view-switch')
  },
  async reloadFlow() {
    const pidsBefore = { entry: ps('access-entry.mjs'), peer: ps('bidirectional_acp_peer') }
    await cdp('Page.reload')
    await sleep(2500)
    await connect() // page target id may change; reconnect handled by fresh process normally
    const pidsAfter = { entry: ps('access-entry.mjs'), peer: ps('bidirectional_acp_peer') }
    const eof = peerEvents().filter(e => e.event === 'stdin-eof')
    dump('check6b-reload', { pidsBefore, pidsAfter, stdinEof: eof })
    await shot('12-after-reload')
  },
  async reconnectRelease() {
    await openPopover()
    await evl(`(() => { const b = [...document.querySelectorAll('.conn-popover button, [role="group"][aria-label="Agent connections"] ~ * button, .conn-status-toggle ~ * button')].find(x => x.textContent === 'Reconnect'); if (!b) throw new Error('no Reconnect button: ' + [...document.querySelectorAll('button')].map(x => x.textContent).filter(t => /retry|reconnect/i.test(t)).join('|')); b.click(); return true })()`)
    await sleep(3000)
    const entry = ps('access-entry.mjs'), peer = ps('bidirectional_acp_peer')
    const eof = peerEvents().filter(e => e.event === 'stdin-eof')
    dump('check6c-explicit-release', { entry, peer, stdinEof: eof })
    await shot('13-after-reconnect')
  },
  async pendingAlert() {
    await openPopover(); await sleep(600)
    const alert = await evl(`({ errors: [...document.querySelectorAll('.conn-error')].map(p => p.textContent), buttons: [...document.querySelectorAll('button')].filter(b => /Retry backend release/i.test(b.textContent)).map(b => b.textContent) })`)
    dump('check7-failure-visible', alert)
    await shot('14-release-pending')
  },
  async retryRelease() {
    await openPopover(); await sleep(300)
    await evl(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'Retry backend release'); if (!b) throw new Error('no retry button'); b.click(); return true })()`)
    await sleep(2500)
    await openPopover(); await sleep(400)
    const after = await evl(`({ errors: [...document.querySelectorAll('.conn-error')].map(p => p.textContent) })`)
    dump('check7-after-retry', { after, entry: ps('access-entry.mjs'), peer: ps('bidirectional_acp_peer'), stdinEof: peerEvents().filter(e => e.event === 'stdin-eof') })
    await shot('15-after-retry')
  },
  async reproDraftSend() {
    const text = process.argv[3] || 'hd004 repro one'
    await openPopover()
    await clickConnection('ACP')
    await sleep(500)
    await clickTab('Sessions')
    await waitFor('sessions panel', `document.querySelector('.agent-sessions')`)
    await evl(`[...document.querySelectorAll('.agent-sessions button')].find(b => b.textContent === 'New session')?.click()`)
    await waitFor('project picker', `document.querySelector('.agent-project-picker')`)
    await evl(`[...document.querySelectorAll('.agent-project-picker button')].find(b => b.textContent.trim() === ${JSON.stringify(projectPath)})?.click()`)
    await waitFor('project selected', `[...document.querySelectorAll('.agent-project-picker button')].some(b => b.textContent.trim() === ${JSON.stringify(projectPath)} && b.getAttribute('aria-pressed') === 'true')`)
    await clickTab('Conversation')
    await waitFor('composer', `document.querySelector('.agent-compose')`)
    await sleep(700)
    const before = peerEvents().filter(e => (e.frame?.method) === 'session/prompt' && JSON.stringify(e.frame.params?.prompt).includes(text)).length
    await compose(text, 'Start session')
    await waitFor('session head', `document.querySelector('.agent-conversation-head small')?.textContent === 'SESSION'`)
    await waitFor('reply', `(a => a.at(-1)?.includes('got:${text}'))(${messagesExpr})`)
    await sleep(1500)
    const after = peerEvents().filter(e => (e.frame?.method) === 'session/prompt' && JSON.stringify(e.frame.params?.prompt).includes(text)).length
    dump('check-repro-draft-send', { text, before, after, promptCount: after - before,
      msgs: await evl(messagesExpr), sessionNew: peerEvents().filter(e => e.event === 'session-new').length,
      ps: { entry: ps('harness-fake/runtime/access-entry') } })
    await shot('16-repro-draft-send')
  },
  async reshootEmpty() {
    await openPopover()
    const already = await evl(`!!document.querySelector('.conn-dot-connected')`)
    const id = already ? (await evl(`document.querySelector('[role="group"][aria-label="Agent connections"] button[data-connection-id]')?.getAttribute('data-connection-id')`) ?? null) : await clickConnection('ACP')
    await waitFor('connected dot', `document.querySelector('.conn-dot-connected')`)
    dump('acp-connection-id', { id, alreadyConnected: already })
    await shot('01-connected')
    await clickTab('Sessions')
    await waitFor('sessions panel', `document.querySelector('.agent-sessions')`)
    await evl(`[...document.querySelectorAll('.agent-sessions button')].find(b => b.textContent === 'New session')?.click()`)
    await waitFor('project picker', `document.querySelector('.agent-project-picker')`)
    await evl(`[...document.querySelectorAll('.agent-project-picker button')].find(b => b.textContent.trim() === ${JSON.stringify(projectPath)})?.click()`)
    await clickTab('Conversation')
    await waitFor('composer', `document.querySelector('.agent-compose')`)
    await sleep(700)
    const draft = await evl(`({ head: document.querySelector('.agent-conversation-head')?.textContent ?? null,
      startDisabled: [...document.querySelectorAll('.agent-compose button')].find(b => b.textContent === 'Start session')?.disabled ?? null,
      value: document.querySelector('.agent-compose textarea')?.value ?? null })`)
    dump('check1-empty-draft', { note: 'reshoot after earlier file was overwritten by instance-2 run', draft,
      peerEvents: peerEvents(), ps: { entry: ps('harness-fake/runtime/access-entry'), real: ps('agent-box-harness/runtime/access-entry') } })
    await shot('02-empty-draft')
  },
  async dumpAll() {
    dump('ui-messages-final', { msgs: await evl(messagesExpr) })
  },
}

const step = process.argv[2]
if (!steps[step]) { console.error('unknown step ' + step); process.exit(2) }
await connect()
try { await steps[step]() } finally { try { ws.close() } catch {} }
save()

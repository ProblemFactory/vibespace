#!/usr/bin/env node
// THE TAKEOVER ANCHOR'S GRACE, MEASURED (verify S2 r4, 2026-09-26; the measure-input-receipts.mjs shape). The live
// view's bridge anchors a takeover to the tab it began on and follows a `tabs` record that names another tab only
// within TAKEOVER_ANCHOR_GRACE_MS (src/browser-stream.js) — the in-flight switch that raced the takeover. The grace is
// therefore the latency between the daemon ACTING on a switch and its `tabs` record reaching the bridge; this script
// measures that distribution on the REAL agent-browser + a REAL headless Chrome + the REAL mediator + the REAL bridge,
// through a RECORDING proxy between the mediator and Chrome (every CDP call of the daemon stamped), over N alternating
// `tab t2` / `tab t1` switches. It also prints the daemon's CDP method INVENTORY per phase with each method's census
// class — the evidence that nothing the stream server issues for the user's own view is a paused class.
//   WT=<checkout> node scripts/measure-anchor-grace.mjs [N=100] [out.json]     (zero vendor calls; scratch only)
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
const WT = process.env.WT || new URL('..', import.meta.url).pathname; const require = createRequire(WT + '/package.json');
const { scratch, freePort, endRootedProcesses } = await import(WT + '/scripts/scratch.mjs');
const { WebSocket, WebSocketServer } = require('ws');
const S = require(WT + '/src/browser-stream.js'); const F = require(WT + '/src/browser-facts.js'); const C = require(WT + '/src/cdp-census.js');
const MED = require(WT + '/src/server/cdp-mediator.js'); const BS = require(WT + '/src/server/browser-stream.js'); const T = require(WT + '/src/browser-takeover.js');
const N = Number(process.argv[2]) || 100; const OUT = process.argv[3] || '';
const ROOT = scratch('s2r4-grace'); fs.mkdirSync(ROOT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(5); } return f(); };
const now = () => performance.now();
const CDP = await freePort();
const chrome = spawn('/usr/bin/google-chrome', ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
let ver = null; for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json(); } catch { await sleep(250); } }
// ── the recording proxy between the mediator and Chrome ──
const rec = []; let phase = 'boot';
const px = http.createServer((req, res) => { http.get(`http://127.0.0.1:${CDP}${req.url}`, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); }).on('error', () => { res.writeHead(502); res.end(); }); });
const pwss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 * 1024, perMessageDeflate: false });
px.on('upgrade', (req, socket, head) => pwss.handleUpgrade(req, socket, head, (ws) => {
  const up = new WebSocket(ver.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 }); const q = [];
  up.on('open', () => { for (const d of q) up.send(d); q.length = 0; });
  ws.on('message', (d) => { try { const m = JSON.parse(String(d)); if (m && m.method) rec.push({ t: now(), method: m.method, sid: m.sessionId || null, phase, params: /bringToFront|setAutoAttach|Screencast|activateTarget/.test(m.method) ? m.params : undefined }); } catch { } if (up.readyState === 1) up.send(String(d)); else q.push(String(d)); }); // TEXT frames: Chrome closes a CDP channel on a binary frame
  up.on('message', (d) => { try { ws.send(String(d)); } catch { } }); ws.on('close', () => { try { up.close(); } catch { } }); up.on('close', () => { try { ws.close(); } catch { } }); ws.on('error', () => { }); up.on('error', () => { });
}));
const PXP = await freePort(); await new Promise((r) => px.listen(PXP, '127.0.0.1', r));
const med = MED.create({ log: { log() { }, warn() { } } }); await med.listen();
const PROFILE = 'bp-00000001', KEY = 'bk-00000001';
const inputs = new Map(); const listeners = new Set();
const g = await med.grantFor({ profileId: PROFILE, browserKey: KEY, upstream: `ws://127.0.0.1:${PXP}/devtools/browser/rec`, paused: () => (inputs.get('k') || {}).input === 'user' });
const envBase = {}; for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('AGENT_BROWSER_')) envBase[k] = v;
envBase.PATH = String(envBase.PATH || '').split(':').filter((p) => !p.includes('/vibespace/data/bin')).join(':');
const realBin = F.binaryResolver('agent-browser', envBase)();
fs.mkdirSync(path.join(ROOT, 'home'), { recursive: true }); fs.mkdirSync(path.join(ROOT, 'sock'), { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(ROOT, 'cfg.json'), JSON.stringify({ headed: false }));
const NS = `vs-s2r4g-${process.pid}`;
const env = { ...envBase, HOME: path.join(ROOT, 'home'), AGENT_BROWSER_SESSION: NS, AGENT_BROWSER_NAMESPACE: NS, AGENT_BROWSER_CDP: g.url, AGENT_BROWSER_SOCKET_DIR: path.join(ROOT, 'sock'), AGENT_BROWSER_CONFIG: path.join(ROOT, 'cfg.json'), AGENT_BROWSER_IDLE_TIMEOUT_MS: '120000', AGENT_BROWSER_JSON: '1' };
const run = (args) => new Promise((r) => execFile(realBin, args, { env, timeout: 60000, encoding: 'utf8' }, (e, so, se) => r({ ok: !e, so: String(so || ''), se: String(se || '') })));
const PAGE = (n) => `data:text/html,<title>${n}</title><input id=i autofocus><script>document.i=0;addEventListener("keydown",e=>{document.i++});</script>`;
const out = { version: (await run(['--version'])).so.trim(), chrome: ver.Browser, n: N, phases: {}, switches: [] };
phase = 'open'; await run(['open', PAGE('A')]); phase = 'tab-new'; await run(['tab', 'new', PAGE('B')]); phase = 'tab-t1'; await run(['tab', 't1']);
phase = 'stream-enable'; let port = null; await run(['stream', 'enable', '--json']); try { port = JSON.parse((await run(['stream', 'status', '--json'])).so).data.port; } catch { }
const keeper = {
  setFor: () => ({ attachments: [{ profileId: PROFILE, alias: 'work', label: 'work', isDefault: true }], children: [] }), list: () => ({ profiles: [{ id: PROFILE, label: 'work' }] }), streamPortFor: async () => ({ ok: true, port }),
  inputStateFor: () => ({ ...(inputs.get('k') || T.newInputState()) }), onInput: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  takeover: ({ viewerId, holderAlive }) => { const d = T.decideTakeover({ state: inputs.get('k') || null, viewerId, now: Date.now(), holderAlive }); if (!d.ok) return d; inputs.set('k', d.state); if (!d.already) for (const fn of listeners) fn({ kind: 'takeover', browserKey: KEY, profileId: PROFILE, state: { ...d.state }, cause: null }); return { ok: true, already: !!d.already, state: { ...d.state } }; },
  handback: ({ viewerId, cause, url }) => { const d = T.decideHandback({ state: inputs.get('k') || null, viewerId, cause, now: Date.now(), url }); if (!d.ok) return d; inputs.set('k', d.state); for (const fn of listeners) fn({ kind: 'handback', browserKey: KEY, profileId: PROFILE, state: { ...d.state }, cause: d.cause }); return { ok: true, cause: d.cause, heldMs: d.heldMs, state: { ...d.state } }; },
  creditUserInput: (target, record, opts) => (target && target.profileId === PROFILE ? med.creditInput({ profileId: PROFILE, browserKey: KEY, record, targetId: opts && opts.targetId || null }) : null),
};
const bridge = BS.create({ keeper, activeSessions: new Map([['sess-m', { _browserKey: KEY, _browserEnv: null, name: 'grace' }]]), requestAuthed: () => true, log: { warn() { }, log() { } } });
const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); }); srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
const P = await freePort(); await new Promise((r) => srv.listen(P, '127.0.0.1', r));
phase = 'viewer-connect';
const v = new WebSocket(`ws://127.0.0.1:${P}${S.STREAM_PATH}?session=sess-m&profile=${PROFILE}`); const got = []; v.on('message', (d) => got.push({ t: now(), m: JSON.parse(d) }));
await new Promise((r, e) => { v.on('open', r); v.on('error', e); }); await until(() => got.some((x) => x.m.type === 'tabs'), 8000); await until(() => got.filter((x) => x.m.type === 'frame').length >= 2, 8000);
const activeOf = () => { const t = [...got].reverse().find((x) => x.m.type === 'tabs'); const a = t && t.m.tabs.find((y) => y.active); return a ? a.targetId : null; };
const A = activeOf();
const cleanup = async () => { try { v.close(); } catch { } bridge.shutdown(); await new Promise((r) => srv.close(() => r())); med.shutdown(); phase = 'close'; await run(['close']); try { chrome.kill('SIGKILL'); } catch { } await sleep(300); try { px.close(); } catch { } try { endRootedProcesses(ROOT); } catch { } fs.rmSync(ROOT, { recursive: true, force: true }); };
try {
  // ── the switches (not paused: the daemon's own latency) ──
  for (let i = 0; i < N; i++) {
    phase = `switch-${i}`; const to = i % 2 === 0 ? 't2' : 't1'; const before = activeOf(); const nTabs = got.filter((x) => x.m.type === 'tabs').length; const recAt = rec.length;
    const tCli = now(); const r = await run(['tab', to]);
    const arrived = await until(() => got.filter((x) => x.m.type === 'tabs').length > nTabs && activeOf() !== before, 5000);
    const tabsRec = [...got].reverse().find((x) => x.m.type === 'tabs'); const tTabs = tabsRec ? tabsRec.t : NaN;
    const calls = rec.slice(recAt).filter((c) => c.t >= tCli);
    const first = calls[0]; const btf = calls.find((c) => c.method === 'Page.bringToFront'); const saa = calls.find((c) => c.method === 'Target.setAutoAttach'); const scs = calls.find((c) => c.method === 'Page.startScreencast');
    out.switches.push({ i, to, ok: r.ok, arrived, fromCli: +(tTabs - tCli).toFixed(2), fromFirstCall: first ? +(tTabs - first.t).toFixed(2) : null, fromBringToFront: btf ? +(tTabs - btf.t).toFixed(2) : null, fromSetAutoAttach: saa ? +(tTabs - saa.t).toFixed(2) : null, fromStartScreencast: scs ? +(tTabs - scs.t).toFixed(2) : null, firstMethod: first ? first.method : null, methods: [...new Set(calls.map((c) => c.method))] });
  }
  // ── the takeover phases (the stream server's own calls while the user drives) ──
  phase = 'takeover'; v.send(JSON.stringify({ type: 'takeover' })); await until(() => [...got].reverse().find((x) => x.m.type === 'mode')?.m.mode === 'takeover', 3000); await sleep(S.TAKEOVER_ANCHOR_GRACE_MS + 100);
  phase = 'user-key'; v.send(JSON.stringify({ type: 'input_keyboard', eventType: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 0, text: 'a', rid: 1 })); await until(() => got.some((x) => x.m.type === 'input-receipt' && x.m.rid === 1), 4000);
  phase = 'user-mouse'; v.send(JSON.stringify({ type: 'input_mouse', eventType: 'mouseMoved', x: 10, y: 10, button: 'none', clickCount: 0, modifiers: 0, rid: 2 })); v.send(JSON.stringify({ type: 'input_mouse', eventType: 'mousePressed', x: 10, y: 10, button: 'left', clickCount: 1, modifiers: 0, rid: 3 })); v.send(JSON.stringify({ type: 'input_mouse', eventType: 'mouseReleased', x: 10, y: 10, button: 'left', clickCount: 1, modifiers: 0, rid: 4 })); await until(() => got.some((x) => x.m.type === 'input-receipt' && x.m.rid === 4), 4000);
  phase = 'stream-disable-enable-paused'; await run(['stream', 'disable']); await run(['stream', 'enable']); await sleep(800);
  phase = 'viewer-reconnect-paused'; const v2 = new WebSocket(`ws://127.0.0.1:${P}${S.STREAM_PATH}?session=sess-m&profile=${PROFILE}`); const got2 = []; v2.on('message', (d) => got2.push(JSON.parse(d))); await new Promise((r, e) => { v2.on('open', r); v2.on('error', e); }); await until(() => got2.some((m) => m.type === 'frame'), 6000); try { v2.close(); } catch { } await sleep(300);
  phase = 'agent-get-title-paused'; out.phases.getTitlePaused = (await run(['get', 'title'])).so.slice(0, 200);
  phase = 'agent-screenshot-paused'; out.phases.screenshotPaused = (await run(['screenshot', path.join(ROOT, 's.png')])).so.slice(0, 200);
  phase = 'agent-snapshot-paused'; out.phases.snapshotPaused = (await run(['snapshot'])).so.slice(0, 120);
  phase = 'agent-tab-list-paused'; out.phases.tabListPaused = (await run(['tab', 'list'])).so.slice(0, 200);
  phase = 'agent-press-paused'; const pr = await run(['press', 'Enter']); out.phases.pressPaused = (pr.so + pr.se).slice(0, 200);
  phase = 'handback'; v.send(JSON.stringify({ type: 'handback' })); await until(() => [...got].reverse().find((x) => x.m.type === 'mode')?.m.mode === 'watch', 3000);
  const receipts = got.filter((x) => x.m.type === 'input-receipt').map((x) => ({ rid: x.m.rid, ok: x.m.ok, code: x.m.code, via: x.m.via }));
  out.phases.receipts = receipts;
  // ── the inventory per phase, classed ──
  const inv = {};
  for (const c of rec) { const ph = /^switch-/.test(c.phase) ? 'switch' : c.phase; inv[ph] = inv[ph] || {}; inv[ph][c.method] = (inv[ph][c.method] || 0) + 1; }
  out.inventory = Object.fromEntries(Object.entries(inv).map(([ph, ms]) => [ph, Object.fromEntries(Object.entries(ms).map(([m, n]) => [m, { n, cls: C.classOf(m) || 'UNCLASSIFIED' }]))]));
  const pct = (arr, p) => { const s = arr.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.999))] : null; };
  const stats = (k) => { const a = out.switches.map((s) => s[k]); return { n: a.filter(Number.isFinite).length, p50: pct(a, 0.5), p90: pct(a, 0.9), p99: pct(a, 0.99), max: Math.max(...a.filter(Number.isFinite)) }; };
  out.stats = { fromCli: stats('fromCli'), fromFirstCall: stats('fromFirstCall'), fromBringToFront: stats('fromBringToFront'), fromSetAutoAttach: stats('fromSetAutoAttach'), fromStartScreencast: stats('fromStartScreencast'), arrived: out.switches.filter((s) => s.arrived).length, cliOk: out.switches.filter((s) => s.ok).length, firstMethods: [...new Set(out.switches.map((s) => s.firstMethod))] };
  console.log(JSON.stringify({ version: out.version, chrome: out.chrome, n: N, stats: out.stats, receipts, phases: { press: out.phases.pressPaused, getTitle: out.phases.getTitlePaused.slice(0, 80) } }, null, 1));
  console.log('INVENTORY (phase → method → {n, cls}):'); for (const [ph, ms] of Object.entries(out.inventory)) console.log('  ' + ph + ': ' + Object.entries(ms).map(([m, x]) => `${m}×${x.n}[${x.cls}]`).join(' '));
} finally { await cleanup(); }
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

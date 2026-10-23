#!/usr/bin/env node
// LANE BROWSER-SHARED-PROFILE-FREEZE — THE MEASUREMENT (fleet fb-8727ee62fb + fb-0898d92d0a, userW's jarvis-work: «Runtime.evaluate /
// Page.navigate / tab new all time out while status and the tab list still answer», «every session at once»). Run ALONE, ~4 min.
// The REAL keeper launches ONE named profile on the hidden-window rung (no desktop — the fleet's shape: the browser CLI's own
// Xvfb); conversations A, B, D hold it (sharing 'owner', the default), C browses on its own EPHEMERAL browser; the REAL routes +
// dialog watch + the shipped `vibespace-browser` drive the installed driver over loopback pages:
//   /spin  — a page whose script holds its main thread (spin(ms): a busy loop armed on a timer)
//   /ask   — a page that opens a confirm() (a dialog the watch holds)
//   /hang  — a navigation that never settles (headers + a head, the body never ends)
//   /light — a quiet page (same site 127.0.0.1 as A's; D's on the OTHER site, localhost)
// Recorded per call: every agent verb (who, verb, ms, exit, the error's tail), every CDP call each conversation's daemon sends
// (a TAP per conversation — the /resolve answer's AGENT_BROWSER_CDP re-pointed at it, the path kept — method, the target its
// session rode, ms, error), every keeper call through the driver (verb, ms), a RAW CDP client's own Runtime.evaluate per page
// target (the page's answer, no daemon in between), Target.createTarget / getTargets, and Chrome's renderer process count.
// Zero vendor calls; scratch everything; ends every process its root started.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, freePorts, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const express = require('express');
const { WebSocket, WebSocketServer } = require('ws');
const K = require('../src/server/browser-keeper.js'), Ff = require('../src/browser-facts.js'), D = require('../src/server/browser-dialogs.js');
const R = require('../src/routes/browser.js'), VP = require('../src/server/browser-viewport.js');
const SPIN_MS = Number(process.argv[2]) || 20000;
const ONLY = String(process.argv[3] || 'spin,ask,hang').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_') && !['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE'].includes(k)));
const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
if (!REAL_AB) { console.log('SKIP: no real driver past the shim'); process.exit(0); }
const ver = execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', env: BASE_ENV }).trim();
let chromeVer = '?'; try { chromeVer = execFileSync('google-chrome', ['--version'], { encoding: 'utf8' }).trim(); } catch { /* */ }
console.log(`driver ${REAL_AB} (${ver}); ${chromeVer}; spin ${SPIN_MS} ms`);
const ROOT = scratch('bspfreeze');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { endRootedProcesses(ROOT); } catch { /* */ } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ } };
process.on('exit', cleanup);
for (const sg of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sg, () => { cleanup(); process.exit(130); });
const T0 = Date.now(); const rel = (t) => ((t - T0) / 1000).toFixed(1);

// ── the pages ──
const PAGE = {
  light: (t) => `<!doctype html><title>${t}</title><p>${t}</p>`,
  spin: `<!doctype html><title>SPIN</title><script>window.spin=(ms)=>{setTimeout(()=>{const e=Date.now()+ms;while(Date.now()<e){}},40);return 'armed '+ms}</script><p>spin</p>`,
  ask: `<!doctype html><title>ASK</title><script>window.ask=()=>{setTimeout(()=>{window.__a=confirm('keep going?')},40);return 'asked'}</script><p>ask</p>`,
};
const holds = new Set();
const PORT = await freePort();
const pages = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); res.setHeader('content-type', 'text/html; charset=utf-8'); res.setHeader('cache-control', 'no-store');
  if (u.pathname === '/hang') { res.write('<!doctype html><title>HANG</title><p>loading…'); holds.add(res); return; }
  if (u.pathname === '/born') { const k = u.searchParams.get('kind'); if (k === 'hang') { res.write('<!doctype html><title>BORN-HANG</title><p>loading…'); holds.add(res); return; } return res.end(k === 'spin' ? `<!doctype html><title>BORN-SPIN</title><script>{const e=Date.now()+${SPIN_MS};while(Date.now()<e){}}</script><p>spun` : k === 'ask' ? `<!doctype html><title>BORN-ASK</title><script>confirm('born with a question')</script><p>asked` : '<!doctype html><title>BORN-LIGHT</title><p>light'); }
  if (u.pathname === '/spin') return res.end(PAGE.spin);
  if (u.pathname === '/ask') return res.end(PAGE.ask);
  res.end(PAGE.light(u.searchParams.get('t') || 'LIGHT'));
}).listen(PORT, '127.0.0.1');
const SITE1 = (p) => `http://127.0.0.1:${PORT}${p}`, SITE2 = (p) => `http://localhost:${PORT}${p}`;

// ── the TAP: one per conversation; every CDP call its daemon sends, the target its session rode, the answer's ms ──
const cdpLog = []; // {who, conn, method, sessionId, targetId, at, ms, error}
const evLog = []; // the targets' births / changes / deaths (B's tap) + every attachedToTarget each daemon saw
function makeTap(who, upHostPort) {
  const sessions = new Map(); let nConn = 0;
  const srv = http.createServer((req, res) => {
    const up = http.get({ host: '127.0.0.1', port: Number(upHostPort.split(':')[1]), path: req.url }, (ur) => { let b = ''; ur.on('data', (d) => { b += d; }); ur.on('end', () => { res.writeHead(ur.statusCode, { 'content-type': 'application/json' }); res.end(b.split(upHostPort).join(`127.0.0.1:${srv.address().port}`)); }); });
    up.on('error', () => { res.writeHead(502); res.end(); });
  });
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  srv.on('upgrade', (req, socket, head) => {
    const conn = `${who}#${++nConn}`; const queued = []; let open = false;
    const up = new WebSocket(`ws://${upHostPort}${req.url}`, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    wss.handleUpgrade(req, socket, head, (ws) => {
      const pend = new Map();
      ws.on('message', (d) => {
        let j = null; try { j = JSON.parse(String(d)); } catch { /* */ }
        if (j && j.id != null) { const e = { who, conn, method: j.method, sessionId: j.sessionId || null, targetId: j.sessionId ? sessions.get(j.sessionId) || '?' : (j.params && j.params.targetId) || null, at: Date.now(), ms: null, error: null, ...(/^Target\.(setAutoAttach|setDiscoverTargets|autoAttachRelated|attachToTarget)$/.test(j.method || '') ? { params: j.params } : {}) }; pend.set(`${j.sessionId || ''}:${j.id}`, e); cdpLog.push(e); }
        if (open) up.send(String(d)); else queued.push(String(d));
      });
      up.on('open', () => { open = true; for (const q of queued.splice(0)) up.send(q); });
      up.on('message', (d) => {
        let j = null; try { j = JSON.parse(String(d)); } catch { /* */ }
        if (j && j.method === 'Target.attachedToTarget') { sessions.set(j.params.sessionId, j.params.targetInfo.targetId); evLog.push({ who, conn, ev: 'attachedToTarget', targetId: j.params.targetInfo.targetId, type: j.params.targetInfo.type, url: j.params.targetInfo.url, waiting: j.params.waitingForDebugger, at: Date.now() }); }
        if (j && /^Target\.target(Created|Destroyed|InfoChanged)$/.test(j.method || '') && who === 'B') { const ti = j.params.targetInfo || {}; evLog.push({ who, conn, ev: j.method.slice(7), targetId: ti.targetId || j.params.targetId, type: ti.type, url: ti.url, opener: ti.openerId, at: Date.now() }); }
        if (j && j.id != null) { const k = `${j.sessionId || ''}:${j.id}`; const e = pend.get(k); if (e) { pend.delete(k); e.ms = Date.now() - e.at; if (j.error) e.error = j.error.message; if (e.method === 'Target.attachToTarget' && j.result) sessions.set(j.result.sessionId, e.targetId); } }
        try { ws.send(String(d)); } catch { /* */ }
      });
      const end = () => { try { ws.close(); } catch { /* */ } try { up.close(); } catch { /* */ } };
      ws.on('close', end); up.on('close', end); up.on('error', end); ws.on('error', end);
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ port: srv.address().port, close: () => { try { srv.close(); } catch { /* */ } } })));
}

// ── the keeper's own driver calls, timed ──
const keeperCalls = []; // {args, at, ms, err}
const timedExec = (bin, args, opts, cb) => { const e = { args: args.filter((a) => !/^ws:/.test(a)).join(' ').slice(0, 80), at: Date.now(), ms: null, err: null }; keeperCalls.push(e); return execFile(bin, args, opts, (err, so, se) => { e.ms = Date.now() - e.at; if (err) e.err = String(err.message || err).slice(0, 160); cb(err, so, se); }); };

// ── the world ──
const KH = path.join(ROOT, 'h'), KXD = path.join(ROOT, 'x'), CWD = path.join(ROOT, 'cwd');
for (const d of [path.join(KH, '.agent-browser'), KXD, CWD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
const SET = { 'browser.headed': 'yes' };
const journal = []; const jl = (m) => journal.push({ at: Date.now(), m: String(m) });
const quiet = { log() { }, warn() { }, error() { }, info() { } };
const W = { A: { key: 'bk-0000a1a1', tok: 'vsst_bspf_a', sid: 'sess-a' }, B: { key: 'bk-0000b2b2', tok: 'vsst_bspf_b', sid: 'sess-b' }, D: { key: 'bk-0000d4d4', tok: 'vsst_bspf_d', sid: 'sess-d' }, C: { key: 'bk-0000c3c3', tok: 'vsst_bspf_c', sid: 'sess-c' }, E: { key: 'bk-0000e5e5', tok: 'vsst_bspf_e', sid: 'sess-e' } };
const live = new Set(Object.values(W).map((w) => w.key));
const MEDIATE = process.env.MEDIATE === '1'; // the CONTROL road: the profile shared 'instance' (each lease its own scoped url, the mediator)
const SCOPE = process.env.SCOPE === '1'; // THE FIX: the proxy in this process, the profile shared 'owner' (the default) — the scope road
const mediator = MEDIATE || SCOPE ? require('../src/server/cdp-mediator.js').create({ log: quiet }) : null;
if (mediator) await mediator.listen();
const kk = K.create({ ...(mediator ? { mediator } : {}), dataDir: path.join(ROOT, 'data'), homeDir: KH, env: () => kenv, serverSetting: (k) => SET[k], liveKeys: () => live, runtime: Ff.createBrowserRuntime({ env: kenv, cmd: REAL_AB, execFileImpl: timedExec }), facts: Ff.createBrowserFacts({ env: kenv }), log: { log: jl, warn: jl, error: jl, info: jl }, install: false });
const prof = kk.createProfile({ label: 'Work', ...(MEDIATE ? { sharing: 'instance' } : {}) }, { owner: { kind: 'instance', id: null } });
console.log(`  road: ${MEDIATE ? 'MEDIATED (sharing instance — a scoped url per lease)' : SCOPE ? 'SCOPE (sharing owner + the proxy: each agent lease its own url)' : 'cooperative (sharing owner, no proxy — the raw url)'}; profile sharing=${prof.sharing}`);
// C browses on its MANAGED ephemeral browser (the keeper's — its own spawn pairs, the production shape: the dialog watch on it)
const B0 = require('../src/browser-profiles.js'); const SOCKC = path.join(ROOT, 'sc'); fs.mkdirSync(SOCKC, { recursive: true, mode: 0o700 });
const C_PAIRS = [...B0.browserEnvFor({ browserKey: W.C.key, variant: B0.VARIANTS.N, idleMs: 0 }), `AGENT_BROWSER_SOCKET_DIR=${SOCKC}`];
const sessions = new Map(Object.entries(W).map(([n, w]) => [w.sid, n === 'C' ? { agentToken: w.tok, _browserKey: w.key, _browserVariant: 'N', _browserEnv: C_PAIRS, name: `Chat ${n}`, cwd: CWD } : { agentToken: w.tok, _browserKey: w.key, _browserVariant: 'D', _browserEnv: null, name: `Chat ${n}`, cwd: CWD }]));
const dialogs = D.create({ keeper: kk, log: quiet, leaseCountOf: (pid) => new Set(((kk.list().leases) || []).filter((l) => l && l.profileId === pid && l.browserKey).map((l) => l.browserKey)).size, holdersOf: () => [] });
kk.setStuckSource((bk) => dialogs.stuckForKey(bk));
dialogs.setTabsOf((q) => { try { return kk.holderTabs(q && q.profileId, q && q.browserKey) || []; } catch { return []; } }); // the wiring's own tab source (mounts-plugins-wiring)
if (process.env.MEASURE_DEBUG === '1') { const pa = dialogs.pageAnswers; dialogs.pageAnswers = async (t, o) => { const r = await pa(t, o); console.log(`    [debug] pageAnswers ${JSON.stringify({ t: { pid: t.profileId, eph: t.ephemeral, bk: t.browserKey }, o })} → ${JSON.stringify(r).slice(0, 400)}`); return r; };
  const lf = kk.leasesFor; kk.leasesFor = (bk, o) => { const r = lf(bk, o); console.log(`    [debug] leasesFor ${bk} → ${JSON.stringify(r.map((l) => ({ p: l.profileId, t: l.targetId })))}`); return r; }; }
R.setup({ keeper: kk, activeSessions: sessions, dialogs, tasksForSession: () => [] });
const taps = {}; let chromeHP = null;
const app = express(); app.use(express.json());
app.use((req, res, next) => { // the /resolve answer's CDP endpoint re-pointed at the conversation's tap (host:port only; the path kept)
  if (req.path !== '/api/agent/browser/resolve' || !chromeHP) return next();
  const tok = String(req.headers.authorization || '').replace(/^Bearer /, ''); const who = Object.keys(W).find((n) => W[n].tok === tok);
  const j0 = res.json.bind(res);
  res.json = (body) => { if (process.env.MEASURE_DEBUG === '1' && who === 'C') console.log(`    [debug] C resolve → kind ${body && body.kind} profile ${JSON.stringify(body && body.profile && body.profile.id)} dialog ${JSON.stringify(body && body.dialog).slice(0, 300)}`); if (who && taps[who]) { try { body = JSON.parse(JSON.stringify(body).split(chromeHP).join(`127.0.0.1:${taps[who].port}`)); } catch { /* */ } } return j0(body); };
  next();
});
app.use(R.router);
const srv = http.createServer(app);
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${srv.address().port}`;
const PASSWD = path.join(ROOT, 'passwd.cjs'); fs.writeFileSync(PASSWD, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(KH)} });\n`);
const verbs = []; // {who, args, at, ms, code, tail}
const cli = (who, args, timeoutMs = 75000) => new Promise((resolve) => {
  const t0 = Date.now(); const c = spawn(process.execPath, ['--require', PASSWD, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: { ...kenv, ...(who === 'C' ? require('../src/browser-stream.js').pairsToEnv(C_PAIRS) : {}), VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: W[who].tok, VIBESPACE_SESSION_CWD: CWD }, cwd: CWD });
  let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
  const t = setTimeout(() => c.kill('SIGKILL'), timeoutMs);
  c.on('exit', (code) => { clearTimeout(t); const e = { who, args: args.join(' ').replace(/http:\/\/(127\.0\.0\.1|localhost):\d+/g, (m, h) => h === 'localhost' ? 'site2' : 'site1').slice(0, 60), at: t0, ms: Date.now() - t0, code, tail: (out + ' | ' + err).replace(/\s+/g, ' ').trim().slice(-220) }; verbs.push(e); resolve({ ...e, out, err }); });
});

// ── a RAW CDP client on the browser endpoint: its own flat session per page; the page's own answer, no daemon in between ──
async function rawClient(url) {
  const ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 }); await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  let id = 0; const wait = new Map();
  ws.on('message', (m) => { let j; try { j = JSON.parse(String(m)); } catch { return; } if (j.id && wait.has(j.id)) { wait.get(j.id)(j); wait.delete(j.id); } });
  const send = (method, params = {}, sessionId, ms = 30000) => new Promise((res) => { const n = ++id; const t0 = Date.now(); wait.set(n, (j) => res({ ...j, ms: Date.now() - t0 })); ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => { if (wait.has(n)) { wait.delete(n); res({ error: { message: `no answer in ${ms} ms` }, ms: Date.now() - t0 }); } }, ms); });
  const sess = new Map();
  const sessionOf = async (targetId) => { if (sess.has(targetId)) return sess.get(targetId); const r = await send('Target.attachToTarget', { targetId, flatten: true }, null, 5000); const s = r.result && r.result.sessionId; if (s) sess.set(targetId, s); return s || null; };
  return { send, sessionOf, close: () => ws.close() };
}
const rawLog = []; // {phase, what, target, ms, error}
async function rawProbe(raw, phase, label) {
  const tl = await raw.send('Target.getTargets', {}, null, 10000); rawLog.push({ phase, what: 'Target.getTargets', target: '-', ms: tl.ms, error: tl.error && tl.error.message });
  const pg = ((tl.result && tl.result.targetInfos) || []).filter((t) => t.type === 'page');
  await Promise.all(pg.map(async (t) => { const s = await raw.sessionOf(t.targetId); if (!s) { rawLog.push({ phase, what: 'attach', target: label(t), ms: null, error: 'no session' }); return; } const r = await raw.send('Runtime.evaluate', { expression: '1+1', returnByValue: true }, s, SPIN_MS + 8000); rawLog.push({ phase, what: 'Runtime.evaluate 1+1', target: label(t), ms: r.ms, error: r.error && r.error.message }); }));
  const ct = await raw.send('Target.createTarget', { url: 'about:blank' }, null, SPIN_MS + 8000); rawLog.push({ phase, what: 'Target.createTarget', target: 'new blank', ms: ct.ms, error: ct.error && ct.error.message });
  if (ct.result && ct.result.targetId) { const s = await raw.sessionOf(ct.result.targetId); const r = s ? await raw.send('Runtime.evaluate', { expression: '1+1' }, s, SPIN_MS + 8000) : { ms: null, error: { message: 'no session' } }; rawLog.push({ phase, what: 'Runtime.evaluate (new blank)', target: 'new blank', ms: r.ms, error: r.error && r.error.message }); await raw.send('Target.closeTarget', { targetId: ct.result.targetId }, null, 5000); }
  const pi = await raw.send('SystemInfo.getProcessInfo', {}, null, 10000);
  const procs = ((pi.result && pi.result.processInfo) || []); rawLog.push({ phase, what: 'renderer processes', target: '-', ms: pi.ms, n: procs.filter((p) => p.type === 'renderer').length, cpu: procs.filter((p) => p.type === 'renderer').map((p) => Math.round(p.cpuTime * 10) / 10) });
}

const summary = [];
let raw = null;
try {
  console.log('— setup: A, B, D on ONE named profile (hidden-window rung), C on its own ephemeral browser');
  for (const n of ['A', 'B', 'D', 'E']) await kk.attach({ profileId: prof.id, browserKey: W[n].key, sessionId: W[n].sid, by: 'user' });
  let r = await cli('A', ['open', SITE1('/light?t=A0')]);
  const rec = kk.browserOf(prof.id);
  if (!rec || !rec.cdpUrl) { console.log('the keeper could not launch the browser here', r.tail, rec); throw new Error('no browser'); }
  chromeHP = new URL(rec.cdpUrl).host;
  console.log(`  named browser: ${rec.cdpUrl.replace(/[0-9a-f-]{36}$/, '…')} rung ${rec.display && rec.display.fallback && rec.display.fallback.rung}`);
  if (mediator) chromeHP = `127.0.0.1:${mediator.port()}`; // a mediated lease's url names the proxy — the tap sits in front of it
  for (const n of ['A', 'B', 'D', 'E']) taps[n] = await makeTap(n, chromeHP);
  // A's first daemon connected BEFORE its tap: end it so it reconnects through the tap (a new endpoint value ⇒ the driver re-opens)
  r = await cli('A', ['get', 'title']);
  r = await cli('B', ['open', SITE1('/light?t=B0')]);
  r = await cli('D', ['open', SITE2('/light?t=D0')]);
  r = await cli('C', ['open', SITE1('/light?t=C0')]);
  console.log(`  C (ephemeral): ${r.code} ${r.tail.slice(-120)}`);
  raw = await rawClient(rec.cdpUrl);
  const titleOf = new Map();
  const label = (t) => { const k = t.title || t.url; return k.replace(/http:\/\/(127\.0\.0\.1|localhost):\d+/, (m, h) => h === 'localhost' ? 'site2' : 'site1'); };
  await rawProbe(raw, 'baseline', label);
  for (const n of ['A', 'B', 'D', 'C']) await cli(n, ['eval', '1+1']);

  // ── PHASE spin: A's page holds its main thread SPIN_MS ──
  if (ONLY.includes('spin')) {
    console.log(`— spin: A's tab holds its main thread ${SPIN_MS / 1000} s; meanwhile every other door is asked`);
    await cli('A', ['open', SITE1('/spin')]);
    const mark = verbs.length, cmark = cdpLog.length, kmark = keeperCalls.length;
    const tSpin = Date.now(); await cli('A', ['eval', `spin(${SPIN_MS})`]); await sleep(400);
    const jobs = [
      cli('A', ['eval', '1+1']),            // A's own held tab
      (async () => { await sleep(300); return cli('A', ['tab', 'new', SITE2('/light?t=A2')]); })(), // A opens another tab while its first is held
      cli('B', ['eval', '1+1']),            // B: same site, another conversation
      cli('B', ['get', 'title']),
      cli('D', ['eval', '1+1']),            // D: the other site
      cli('C', ['eval', '1+1']),            // C: its own ephemeral browser (a separate Chrome)
      cli('E', ['open', SITE2('/light?t=E0')]), // E: a conversation whose FIRST verb lands mid-hold (a new daemon attaching)
      rawProbe(raw, 'spin', label),
    ];
    await Promise.all(jobs);
    const after = Date.now() - tSpin;
    summary.push({ phase: 'spin', tookMs: after, verbs: verbs.slice(mark), cdp: cdpLog.slice(cmark), keeper: keeperCalls.slice(kmark) });
    await sleep(Math.max(0, SPIN_MS + 1000 - (Date.now() - tSpin)));
    await cli('A', ['eval', '1+1']);
  }

  // ── PHASE ask: a confirm() open on A's tab ──
  if (ONLY.includes('ask')) {
    console.log('— ask: a confirm() holds A\'s tab');
    await cli('A', ['open', SITE1('/ask')]);
    const mark = verbs.length, cmark = cdpLog.length, kmark = keeperCalls.length; const t1 = Date.now();
    await cli('A', ['eval', 'ask()']); await sleep(500);
    await Promise.all([cli('A', ['eval', '1+1']), cli('B', ['eval', '1+1']), cli('D', ['eval', '1+1']), cli('C', ['eval', '1+1']), cli('A', ['dialog', 'status']), rawProbe(raw, 'ask', label)]);
    summary.push({ phase: 'ask', tookMs: Date.now() - t1, verbs: verbs.slice(mark), cdp: cdpLog.slice(cmark), keeper: keeperCalls.slice(kmark) });
    await cli('A', ['dialog', 'accept']);
  }

  // ── PHASE birth: a NEW page target appears in the shared browser (another conversation's tab, a site's popup, the
  // keeper's own blank) and cannot answer at birth — who waits on it? (each row: the new target's kind, then B / D / C's
  // `eval 1+1` 300 ms after its birth) ──
  if (ONLY.includes('birth')) {
    for (const kind of ['closed', 'spin', 'ask', 'hang', 'light']) {
      console.log(`— birth: a new target "${kind}" appears (the raw client creates it)`);
      const mark = verbs.length, cmark = cdpLog.length; const t1 = Date.now();
      const ct = await raw.send('Target.createTarget', { url: kind === 'closed' ? 'about:blank' : SITE1(`/born?kind=${kind}`) }, null, 10000);
      const tid = ct.result && ct.result.targetId;
      if (kind === 'closed' && tid) await raw.send('Target.closeTarget', { targetId: tid }, null, 5000);
      await sleep(300);
      await Promise.all([cli('B', ['eval', '1+1']), cli('D', ['eval', '1+1']), cli('E', ['get', 'title']), cli('C', ['eval', '1+1'])]);
      summary.push({ phase: `birth-${kind}`, tookMs: Date.now() - t1, verbs: verbs.slice(mark), cdp: cdpLog.slice(cmark) });
      if (tid && kind !== 'closed') await raw.send('Target.closeTarget', { targetId: tid }, null, 5000);
      for (const h of holds) { try { h.end('</p>'); } catch { /* */ } } holds.clear();
      await sleep(kind === 'spin' ? SPIN_MS : 500);
    }
    // a POPUP the agent's own page opens (the site's window.open) that holds its main thread at birth — on the named
    // profile (B's page opens it) and on the ephemeral browser (C's) — then the opener's own next verb, and D's
    for (const who of ['B', 'C']) {
      console.log(`— birth: ${who}'s page opens a popup that holds its main thread`);
      const mark = verbs.length, cmark = cdpLog.length; const t1 = Date.now();
      await cli(who, ['eval', `window.open(${JSON.stringify(SITE1('/born?kind=spin'))}, '_blank'); 'opened'`]); await sleep(300);
      await Promise.all([cli(who, ['eval', '1+1']), cli('D', ['eval', '1+1'])]);
      summary.push({ phase: `popup-${who}`, tookMs: Date.now() - t1, verbs: verbs.slice(mark), cdp: cdpLog.slice(cmark) });
      await sleep(SPIN_MS);
    }
  }

  // ── PHASE held3: a tab born under a confirm() STAYS open — does every later verb wait on it, or only the first? On the
  // shared profile (the raw client's tab; B's three verbs in a row) and on the ephemeral browser (C's own page's popup) ──
  if (ONLY.includes('held3')) {
    console.log('— held3: a tab born with a confirm() stays open; B runs three verbs in a row');
    const ct = await raw.send('Target.createTarget', { url: SITE1('/born?kind=ask') }, null, 10000);
    await sleep(300);
    for (const v of [['eval', '1+1'], ['eval', '2+2']]) await cli('B', v, 150000);
    if (ct.result && ct.result.targetId) await raw.send('Target.closeTarget', { targetId: ct.result.targetId }, null, 5000);
    for (const who of ['B', 'C']) {
      console.log(`— held3: ${who}'s own page opens a popup born with a confirm(); ${who} runs verbs in a row, then the popup is closed by id`);
      const before = new Set((((await raw.send('Target.getTargets', {}, null, 5000)).result || {}).targetInfos || []).map((t) => t.targetId));
      await cli(who, ['eval', `window.open(${JSON.stringify(SITE1('/born?kind=ask'))}, '_blank'); 'opened'`], 150000);
      for (const v of [['eval', '1+1'], ['eval', '2+2'], ['tab', 'list']]) await cli(who, v, 150000);
      // the way out a person would take: close the popup (who === 'C': a raw closeTarget on the ephemeral's own Chrome is not
      // reachable from this client — the ephemeral is a separate Chrome — so C closes it through its own `tab close`)
      if (who === 'B') { const now = (((await raw.send('Target.getTargets', {}, null, 5000)).result || {}).targetInfos || []).filter((t) => t.type === 'page' && !before.has(t.targetId)); for (const t of now) { const t0 = Date.now(); const r = await raw.send('Target.closeTarget', { targetId: t.targetId }, null, 10000); console.log(`    raw closeTarget ${t.targetId.slice(0, 8)} ${t.url.replace(/http:\/\/[^/]+/, '')} → ${JSON.stringify(r.result || r.error)} ${Date.now() - t0} ms`); } }
      else { const tl = await cli('C', ['tab', 'list', '--json'], 60000); const ids = (String(tl.out).match(/"tabId":"(t\d+)"[^}]*born\?kind=ask/g) || []).map((x) => x.match(/t\d+/)[0]); console.log(`    C's popup tab ids: ${ids.join(',') || '(none found)'} — ${String(tl.out).slice(0, 300)}`); for (const id of ids) await cli('C', ['tab', 'close', id], 60000); }
      for (const v of [['eval', '4+4'], ['eval', '5+5']]) await cli(who, v, 150000);
    }
  }

  // ── PHASE escape: which verbs still WORK on the conversation's own silent page (the ways out page_busy must let through)? ──
  if (ONLY.includes('escape')) {
    const shot = path.join(ROOT, 'esc.png');
    for (const [label, args] of [['open another site', ['open', SITE2('/light?t=ESC')]], ['screenshot', ['screenshot', shot]], ['back', ['back']], ['reload', ['reload']]]) {
      console.log(`— escape: A's page holds its main thread 15 s; A runs \`${label}\``);
      await cli('A', ['open', SITE1('/spin')]); await cli('A', ['eval', 'spin(15000)']); await sleep(400);
      const r = await cli('A', args, 60000); const r2 = await cli('A', ['eval', 'location.href'], 60000);
      console.log(`    ${label}: ${r.ms} ms exit ${r.code} — then eval location.href ${r2.ms} ms → ${r2.tail.slice(0, 80)}`);
      await sleep(Math.max(0, 15500 - r.ms - r2.ms));
    }
    console.log('— escape: B\'s page opens a popup born with a confirm(); B runs `open` elsewhere');
    await cli('B', ['open', SITE1('/light?t=B1')]);
    await cli('B', ['eval', `window.open(${JSON.stringify(SITE1('/born?kind=ask'))}, '_blank'); 'opened'`], 150000);
    const r = await cli('B', ['open', SITE2('/light?t=B2')], 150000); const r2 = await cli('B', ['eval', 'location.href'], 150000);
    console.log(`    popup-held opener: open elsewhere ${r.ms} ms exit ${r.code} ${r.tail.slice(-100)} — then eval ${r2.ms} ms → ${r2.tail.slice(0, 80)}`);
  }

  // ── PHASE busy: THE FIX's own-page half — a silent tab is answered page_busy by name, the ways out run at once ──
  if (ONLY.includes('busy')) {
    console.log(`— busy: A's tab holds its main thread ${SPIN_MS / 1000} s; A's next verbs`);
    await cli('A', ['open', SITE1('/spin')]); await cli('A', ['eval', `spin(${SPIN_MS})`]); await sleep(400);
    await cli('A', ['eval', '1+1']); await cli('A', ['snapshot']); await cli('A', ['tab', 'new', SITE2('/light?t=A3')]); await cli('A', ['eval', 'location.href']);
    await Promise.all([cli('B', ['eval', '1+1']), cli('D', ['eval', '1+1'])]);
    await sleep(SPIN_MS);
    { console.log('— busy: A\'s tab holds its main thread again; A closes it BY ID (page_busy names it)');
      await cli('A', ['open', SITE1('/spin')]); await cli('A', ['eval', `spin(${SPIN_MS})`]); await sleep(400);
      const r = await cli('A', ['eval', '1+1']); const id = (String(r.out).match(/tab close ([A-F0-9]{32})/) || [])[1];
      console.log(`    A page_busy names its tab ${id || '(none)'}`);
      if (id) await cli('A', ['tab', 'close', id], 60000);
      await cli('A', ['eval', 'location.href']); await sleep(SPIN_MS); }
    for (const [who, how] of [['B', 'blind'], ['C', 'blind'], ['B', 'seen'], ['C', 'seen']]) {
      console.log(`— busy: ${who}'s own page opens a popup born with a confirm() (${how === 'blind' ? 'written synchronously — before anything can watch it' : 'its own document — the watch sees it'})`);
      await cli(who, ['open', SITE1(`/light?t=${who}P`)]);
      if (how === 'blind') await cli(who, ['eval', `setTimeout(()=>{const w=window.open('', '_blank');w.document.write('<title>BLIND</title><script>confirm("written before anyone watched")<\\/script>')},50); 'armed'`], 150000);
      else await cli(who, ['eval', `window.open(${JSON.stringify(SITE1('/born?kind=ask'))}, '_blank'); 'opened'`], 150000);
      await sleep(6000); // the watch's own Page.enable on the popup has its bound — then the popup is HELD
      const r = await cli(who, ['eval', '1+1'], 150000);
      const id = (String(r.out).match(/tab close ([A-F0-9]{32})/) || [])[1];
      console.log(`    ${who} page_busy names popup ${id || '(none)'}`);
      if (id) await cli(who, ['tab', 'close', id], 60000);
      await cli(who, ['eval', '2+2'], 150000);
    }
  }

  // ── PHASE hang: A's navigation never settles ──
  if (ONLY.includes('hang')) {
    console.log('— hang: A navigates to a page whose load never ends');
    const mark = verbs.length, cmark = cdpLog.length, kmark = keeperCalls.length; const t1 = Date.now();
    const nav = cli('A', ['open', SITE1('/hang')]); await sleep(1500);
    await Promise.all([cli('A', ['eval', '1+1']), cli('A', ['get', 'title']), cli('B', ['eval', '1+1']), cli('D', ['eval', '1+1']), cli('C', ['eval', '1+1']), rawProbe(raw, 'hang', label)]);
    await nav;
    summary.push({ phase: 'hang', tookMs: Date.now() - t1, verbs: verbs.slice(mark), cdp: cdpLog.slice(cmark), keeper: keeperCalls.slice(kmark) });
    for (const h of holds) { try { h.end('</p>'); } catch { /* */ } }
  }
} catch (e) { console.error('the run threw', e && e.stack); }
finally {
  const out = path.join(process.env.MEASURE_OUT || '/tmp', `bspfreeze-${process.pid}.json`);
  fs.writeFileSync(out, JSON.stringify({ ver, chromeVer, SPIN_MS, verbs, cdpLog, evLog, rawLog, keeperCalls: keeperCalls.filter((e) => e.ms == null || e.ms > 500 || e.err), journal: journal.slice(-60), summary: summary.map((s) => ({ phase: s.phase, tookMs: s.tookMs })) }, null, 1));
  console.log('\n=== AGENT VERBS (who · verb · ms · exit · tail) ===');
  for (const v of verbs) console.log(`${rel(v.at).padStart(6)} ${v.who} ${v.args.padEnd(34)} ${String(v.ms).padStart(6)} ms  exit ${v.code}  ${v.ms > 2000 || v.code ? v.tail.slice(-150) : ''}`);
  console.log('\n=== RAW CDP (phase · call · target · ms) ===');
  for (const x of rawLog) console.log(`${x.phase.padEnd(9)} ${x.what.padEnd(28)} ${String(x.target).slice(0, 26).padEnd(26)} ${String(x.ms).padStart(6)} ms ${x.error || ''}${x.n != null ? ` n=${x.n} cpu=${JSON.stringify(x.cpu)}` : ''}`);
  console.log('\n=== DAEMON CDP CALLS > 200 ms or unanswered (who/conn · method · target · ms) ===');
  for (const e of cdpLog.filter((e) => e.ms == null || e.ms > 200 || e.error)) console.log(`${rel(e.at).padStart(6)} ${e.conn.padEnd(5)} ${String(e.method).padEnd(30)} ${String(e.targetId || '').slice(0, 8).padEnd(8)} ${e.ms == null ? 'NO ANSWER' : e.ms + ' ms'} ${e.error || ''}`);
  console.log('\n=== KEEPER DRIVER CALLS > 500 ms ===');
  for (const e of keeperCalls.filter((e) => e.ms == null || e.ms > 500 || e.err)) console.log(`${rel(e.at).padStart(6)} ${e.args.padEnd(40)} ${e.ms == null ? 'RUNNING' : e.ms + ' ms'} ${e.err || ''}`);
  console.log(`\nfull record: ${out}`);
  try { raw && raw.close(); } catch { /* */ } for (const t of Object.values(taps)) t.close();
  for (const h of holds) { try { h.destroy(); } catch { /* */ } }
  try { dialogs.shutdown(); kk.shutdown(); } catch { /* */ } try { mediator && mediator.shutdown(); } catch { /* */ } srv.close(); pages.close(); cleanup();
  process.exit(0);
}

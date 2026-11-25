#!/usr/bin/env node
// LANE BROWSER-SWIFTSHADER-CPU-R2 — THE IDLE FREEZE PROVEN ON THE REAL CLI (heavy, run ALONE). The REAL keeper launches ONE
// named-profile browser on the hidden-window rung (no desktop: no DISPLAY, a PRIVATE XDG_RUNTIME_DIR + HOME — the browser
// CLI starts its own Xvfb), two conversations hold it (a window each — lane browser-windows), the REAL routes + dialog
// watch + live-view bridge + the shipped `vibespace-browser` drive the installed agent-browser (0.38.1) on a loopback page
// that never stops drawing (a 60 fps chart + a WebGL cube; every rAF instant kept in the page). The keeper's own tick
// (5 s) runs the sweep; `browser.idlePaintFreeze` ON:
//   a  no viewer, no verb for 30 s ⇒ the keeper's journal says the browser stopped drawing and the GPU process's ticks
//      over 5 s ≈ 0 (Chrome's own pids — SystemInfo.getProcessInfo); WHEN is judged on the clocks the freeze runs on
//      (B-1542): from the dialog watch's own last verb, at the FIRST keeper sweep past the window — every sweep seen
//      through idlePaintVerdict, the window and the tick read from the code (never a literal 29 s);
//   a2 RED CONTROL — the window shortened to two ticks: the stop moves with it (and the old literal bound is red on it);
//   b  the next `vibespace-browser screenshot` thaws BEFORE it runs: its picture is not blank (pixel census) and the page's
//      first frame lands within ONE frame of the verb's /resolve answer (no frame at all while frozen);
//   c  a live view attaching thaws (the bridge's viewer count → the keeper): frames reach the view;
//   d  an alert on the frozen page (the agent's click) still reaches the dialog watch within its bound (1 s);
//   e  TWO conversations, ONE browser: a thaw for A never creates a tab in B's window (every page target Chrome creates
//      during A's thaws, its window read at birth — the red cell), no stray afterwards (Chrome's targets, both
//      conversations' own `tab list`), B's next verb runs on B's page, one window per holder (windowCensus);
//   f  CONTROL — the switch turned OFF on the same browser: 60 s with nobody ⇒ never frozen, the GPU still draws.
//   g  rows B-98f5 / B-bcf8: the thaw's flip tab is born at an address no driver takes (src/browser-idle.js FLIP_TAB_URL) — the
//      product's freeze and thaw 30 times: an UNPINNED session on the raw address (a second tab after A's) and the agent read
//      their own page after every flip, no command over 2 s, every flip tab born there, neither session's own tab counter
//      moves. RED WHEN A DRIVER UPDATE CHANGES ITS FILTER (agent-browser's should_track_target).
//   B-e674 (the coordinator's r562 / r605 / r683, written once by a lane that runs no real driver) — PROOFS: a1 a raw client's
//      plain create lands in A's window and is named «a tab nobody holds» in front of it; b1 a tab A's page opens while the person
//      drives A's view stays A's and carries the birth stamp «opened in your takeover» on A's view (the real watch tells the
//      keeper). MEASURES, printed and never a ✓ (no outcome of theirs can go red): a2 where the session's own `tab new` lands and
//      what the keeper names in front; c1 what Chrome restores with the profile's own «continue where you left off».
// SKIPs with evidence without the binary / Xvfb / Chrome. Zero vendor calls; ends every process this run's root started.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, endRootedProcesses, driverArgs, ONBOARDED_SOURCE } from './scratch.mjs';   // leg h navigates a page by hand: §47's harness mark first
import { DRIVER } from './scratch.mjs';   // the ONE sentence a driver-less skip begins with (主开发 r2095)
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const express = require('express');
const { WebSocket } = require('ws');
const K = require('../src/server/browser-keeper.js'), Ff = require('../src/browser-facts.js'), D = require('../src/server/browser-dialogs.js');
const R = require('../src/routes/browser.js'), S = require('../src/browser-stream.js'), VP = require('../src/server/browser-viewport.js');
const WIN = require('../src/browser-windows.js'), BI = require('../src/browser-idle.js');

// B-1542: the keeper's sweeps as they happen — it reads idlePaintVerdict off this module object at every sweep: each call's
// `now` (the tick's clock), its last verb and its verdict kept; `idleCtl` = a SHORTER window for the a2 RED control
const sweeps = []; let idleCtl = null;
const verdict0 = BI.idlePaintVerdict;
BI.idlePaintVerdict = (o = {}) => { const v = verdict0(idleCtl ? { ...o, idleMs: idleCtl } : o); sweeps.push({ t: Number(o.now) || 0, last: Math.max(Number(o.lastVerbAt) || 0, Number(o.lastViewerAt) || 0), act: v.act, why: v.why }); return v; };
const sec = (ms) => Math.round(ms / 100) / 10;
/** B-1542: a freeze judged on the clocks it runs on — `last` = the dialog watch's last verb (the verdict's own input), `idle`
 *  = the window in force, `at` = the journal's freeze line. The sweep that froze is the FIRST past the window (the one
 *  before it was inside it), so the stop lands at last + idle + (≤ one sweep gap, MEASURED here) + the freeze's own work. */
const freezeTerms = (last, idle, at) => {
  const after = sweeps.filter((x) => x.t >= last);
  const i = after.findIndex((x) => x.t - x.last >= idle);
  const first = i >= 0 ? after[i] : null, prev = i > 0 ? after[i - 1] : null, next = i >= 0 ? after[i + 1] || null : null;
  const origin = first ? first.last : last; // what the verdict measured from: the last verb (or a later viewer)
  return { last, origin, idle, at, since: at - origin, sweeps: after.length, tickMs: K.TICK_MS, first: first && { t: first.t, act: first.act, why: first.why }, toFirst: first ? first.t - origin - idle : null, prevSince: prev ? prev.t - prev.last : null, gap: prev && first ? first.t - prev.t : null, work: first ? at - first.t : null, next: next ? next.t : null };
};
const judged = (x) => !!x.first && x.first.act === 'freeze' && x.origin >= x.last && x.since >= x.idle && x.work >= 0 && x.prevSince != null && x.prevSince < x.idle && (x.next == null || x.at <= x.next);
const termsText = (x) => x.first ? `the window ${sec(x.idle)} s + ${sec(x.toFirst)} s to the first sweep past it (sweeps ${sec(x.gap)} s apart in this run, TICK_MS ${x.tickMs}; the one before at ${sec(x.prevSince)} s) + ${x.work} ms of freeze work` : `no sweep past the ${sec(x.idle)} s window among the ${x.sweeps} seen since the last verb`;

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1200) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const done = () => { console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed, ${skipped} skipped)` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`); process.exit(fail ? 1 : 0); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, step = 50) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_') && !['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE'].includes(k)));
const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let ver = null; try { ver = REAL_AB ? execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 8000, env: BASE_ENV }).trim() : null; } catch { /* none */ }
if (!ver) { skip(`${DRIVER.skip} no real agent-browser resolves on PATH past the shim (PATH=${BASE_ENV.PATH || ''})`); done(); }
if (!String(BASE_ENV.PATH || '').split(':').some((d) => d && fs.existsSync(path.join(d, 'Xvfb')))) { skip('no Xvfb on PATH — the hidden-window rung is the browser CLI\'s own Xvfb'); done(); }
console.log(`agent-browser: ${REAL_AB} (${ver})`);
const HZ = (() => { try { return Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim()) || 100; } catch { return 100; } })();

const ROOT = scratch('bhpaint');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { endRootedProcesses(ROOT); } catch { /* none */ } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* next run */ } };
process.on('exit', cleanup);
for (const sg of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sg, () => { cleanup(); process.exit(130); });

// ── the pages (loopback): A never stops drawing (every rAF instant kept, epoch ms); B is the other conversation's ──
const CHART = `(function(){const c=document.getElementById('ch');const x=c.getContext('2d');const pts=[];window.__ticks=[];let n=0;
(function d(t){window.__ticks.push(Math.round(performance.timeOrigin+t));if(window.__ticks.length>20000)window.__ticks.splice(0,5000);n++;pts.push(50+40*Math.sin(n/9));if(pts.length>240)pts.shift();
x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.strokeStyle='#2a6';x.lineWidth=3;x.beginPath();pts.forEach((y,i)=>i?x.lineTo(i*4,c.height-y*2):x.moveTo(0,c.height-y*2));x.stroke();x.fillStyle='#246';x.font='16px sans-serif';x.fillText('balance '+(1e6+n),10,20);requestAnimationFrame(d);})(0);})();`;
const CUBE = `(function(){const c=document.getElementById('gl');const gl=c.getContext('webgl');window.__webgl=!!gl;if(!gl)return;
const vs='attribute vec3 p;uniform float t;varying vec3 col;void main(){float s=sin(t),k=cos(t);vec3 q=vec3(p.x*k-p.z*s,p.y,p.x*s+p.z*k);q=vec3(q.x,q.y*k-q.z*s,q.y*s+q.z*k);col=p*.5+.5;gl_Position=vec4(q*.5,1.);}';
const fs='precision mediump float;varying vec3 col;void main(){gl_FragColor=vec4(col,1.);}';
const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o};const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);gl.useProgram(pr);
const v=[];const f=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];for(const n of f){const a=n.map(Math.abs),u=[a[1],a[2],a[0]],w=[a[2],a[0],a[1]];const P=(i,j)=>n.map((x,m)=>x+i*u[m]+j*w[m]);v.push(...P(-1,-1),...P(1,-1),...P(1,1),...P(-1,-1),...P(1,1),...P(-1,1));}
const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.STATIC_DRAW);const l=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,3,gl.FLOAT,false,0,0);gl.enable(gl.DEPTH_TEST);
const tu=gl.getUniformLocation(pr,'t');(function d(ts){gl.clearColor(.1,.1,.1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(tu,ts/700);gl.drawArrays(gl.TRIANGLES,0,36);requestAnimationFrame(d);})(0);})();`;
const PAGE_A = `<!doctype html><title>HP-A dashboard</title><style>body{margin:0;font:14px sans-serif}#sp{width:40px;height:40px;border:6px solid #ccc;border-top-color:#36c;border-radius:50%;animation:r .8s linear infinite;margin:8px}@keyframes r{to{transform:rotate(360deg)}}</style>
<div id=sp></div><button id=b onclick="alert('hello from a frozen page')">alert</button><br><canvas id=ch width=960 height=240></canvas><canvas id=gl width=240 height=240></canvas><script>${CHART}${CUBE}</script>`;
const PAGE_B = `<!doctype html><title>HP-B ledger</title><style>.b{height:20px;margin:4px;background:#fc9;animation:w 1s ease-in-out infinite alternate}@keyframes w{from{width:10%}to{width:90%}}</style><div class=b></div><p>B</p>`;
const PORT = await freePort();
const pages = http.createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(req.url.startsWith('/b') ? PAGE_B : PAGE_A); }).listen(PORT, '127.0.0.1');
const U = (p) => `http://127.0.0.1:${PORT}${p}`;

/** A PNG's pixels, censused (8-bit RGB / RGBA): the share that is not white and the distinct colours (4-bit buckets). */
function pngCensus(buf) {
  if (!buf || buf.length < 33 || buf.toString('latin1', 1, 4) !== 'PNG') return null;
  let o = 8, w = 0, h = 0, bd = 0, ct = 0; const idat = [];
  while (o + 8 <= buf.length) { const n = buf.readUInt32BE(o), ty = buf.toString('latin1', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + n); if (ty === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; } else if (ty === 'IDAT') idat.push(d); else if (ty === 'IEND') break; o += 12 + n; }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (bd !== 8 || !bpp) return { w, h, unsupported: { bd, ct } };
  const raw = zlib.inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(h * stride); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0; let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255; }
    prev = cur;
  }
  let nonWhite = 0; const colors = new Set();
  for (let i = 0; i < w * h; i++) { const r = px[i * bpp], g = px[i * bpp + 1], b = px[i * bpp + 2]; if (r < 235 || g < 235 || b < 235) nonWhite++; colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)); }
  return { w, h, nonWhitePct: Math.round((nonWhite / (w * h)) * 1000) / 10, colors: colors.size };
}
/** A raw browser-level CDP client: the GPU process's pids (Chrome's processes are not dumpable — measured) + a spy that
 *  reads the WINDOW of every page target the moment Chrome creates it (the e red cell). */
async function cdpClient(url) {
  const ws = new WebSocket(url); await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  let id = 0; const wait = new Map(); const born = [];
  ws.on('message', (m) => { let j; try { j = JSON.parse(String(m)); } catch { return; }
    if (j.id && wait.has(j.id)) { wait.get(j.id)(j); wait.delete(j.id); return; }
    if (j.method === 'Target.targetCreated' && j.params.targetInfo.type === 'page') { const t = j.params.targetInfo; const e = { targetId: t.targetId, url: t.url, at: Date.now(), windowId: null }; born.push(e); send('Browser.getWindowForTarget', { targetId: t.targetId }).then((r) => { e.windowId = r.result ? r.result.windowId : `error: ${r.error && r.error.message}`; }); }
    if (j.method === 'Target.targetDestroyed') { const e = born.find((x) => x.targetId === j.params.targetId); if (e) e.goneAt = Date.now(); } });
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; wait.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); setTimeout(() => { if (wait.has(n)) { wait.delete(n); res({ error: { message: 'timeout' } }); } }, 5000); });
  await send('Target.setDiscoverTargets', { discover: true });
  return { send, born, close: () => ws.close() };
}
const ticksOf = (pids) => { let n = 0; for (const pid of pids) { let ts = []; try { ts = fs.readdirSync(`/proc/${pid}/task`); } catch { continue; } for (const t of ts) { try { const st = fs.readFileSync(`/proc/${pid}/task/${t}/stat`, 'latin1'); const f = st.slice(st.lastIndexOf(')') + 2).split(' '); n += Number(f[11]) + Number(f[12]); } catch { /* gone */ } } } return n; };
async function gpuPct(c, secs) { const r = await c.send('SystemInfo.getProcessInfo'); const pids = ((r.result && r.result.processInfo) || []).filter((x) => x.type === 'GPU').map((x) => x.id); const a = ticksOf(pids); await sleep(secs * 1000); return { pct: Math.round(((ticksOf(pids) - a) / HZ / secs) * 1000) / 10, pids }; }

// ── the world: one named profile, two conversations (A, B), the keeper's own tick ──
const KH = path.join(ROOT, 'h'), KXD = path.join(ROOT, 'x'), CWD = path.join(ROOT, 'cwd');
for (const d of [path.join(KH, '.agent-browser'), KXD, CWD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(KH, '.agent-browser', 'config.json'), JSON.stringify({ args: driverArgs() }), { mode: 0o600 });   // B-8695: the driver's own Chrome resolves no name off the box (scratch.mjs DRIVER_NAMES; the product carries a person's config `args`)
const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
const SET = { 'browser.headed': 'yes', 'browser.idlePaintFreeze': true }; // a window asked for, no desktop ⇒ the hidden-window rung
const journal = []; const jl = (m) => journal.push({ at: Date.now(), m: String(m) });
const quiet = { log() { }, warn() { }, error() { }, info() { } };
const KA = 'bk-0000a1a1', KB = 'bk-0000b2b2', TA = 'vsst_hpaint_a', TB = 'vsst_hpaint_b';
const live = new Set([KA, KB]);
const kk = K.create({ dataDir: path.join(ROOT, 'data'), homeDir: KH, env: () => kenv, serverSetting: (k) => SET[k], liveKeys: () => live, runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }), log: { log: jl, warn: jl, error: jl, info: jl }, install: false });
const prof = kk.createProfile({ label: 'Dash' }, { owner: { kind: 'instance', id: null } });
const sessions = new Map([['sess-a', { agentToken: TA, _browserKey: KA, _browserVariant: 'D', _browserEnv: null, name: 'Chat A', cwd: CWD }], ['sess-b', { agentToken: TB, _browserKey: KB, _browserVariant: 'D', _browserEnv: null, name: 'Chat B', cwd: CWD }]]);
const opens = [];
const dialogs = D.create({ keeper: kk, log: quiet, leaseCountOf: (pid) => new Set(((kk.list().leases) || []).filter((l) => l && l.profileId === pid && l.browserKey).map((l) => l.browserKey)).size, holdersOf: () => [] });
// an alert the watch accepts itself is never `open` (verify r1 A3) — it is `closed`, answered by 'auto'
dialogs.onChange((e) => { if (e.kind === 'open') opens.push({ at: Date.now(), type: e.dialog.type, kind: 'open' }); else if (e.kind === 'closed' && e.answered) opens.push({ at: Date.now(), type: e.answered.dialog && e.answered.dialog.type, kind: 'closed', by: e.answered.by }); });
kk.setStuckSource((bk) => dialogs.stuckForKey(bk));
kk.setPaintWatch(dialogs); // the wiring's own line (mounts-plugins-wiring)
R.setup({ keeper: kk, activeSessions: sessions, dialogs, tasksForSession: () => [] });
const bridge = require('../src/server/browser-stream.js').create({ keeper: kk, activeSessions: sessions, requestAuthed: () => true, log: quiet });
// the wiring's own tab source (mounts-plugins-wiring): the live view's active targets + the keeper's holder tabs
dialogs.setTabsOf((q) => { const out = new Set(); try { for (const t of bridge.activeTargetsFor(q) || []) if (t) out.add(String(t)); } catch { /* no relay */ } try { for (const t of kk.holderTabs(q && q.profileId, q && q.browserKey) || []) out.add(t); } catch { /* none */ } return [...out]; });
const resolves = []; // every /resolve the CLI makes: its arrival and its answer (the thaw runs inside it, before the verb)
const app = express(); app.use(express.json());
app.use((req, res, next) => { if (req.path === '/api/agent/browser/resolve') { const e = { at: Date.now(), done: 0 }; resolves.push(e); res.on('finish', () => { e.done = Date.now(); }); } next(); });
app.use(R.router);
const srv = http.createServer(app);
srv.on('upgrade', (req, socket, head) => { if (String(req.url || '').startsWith(S.STREAM_PATH)) bridge.handleUpgrade(req, socket, head); else socket.destroy(); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${srv.address().port}`;
const PASSWD = path.join(ROOT, 'passwd.cjs'); fs.writeFileSync(PASSWD, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(KH)} });\n`);
const cli = (token, args, timeoutMs = 90000) => new Promise((resolve) => {
  const t0 = Date.now(); const c = spawn(process.execPath, ['--require', PASSWD, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: { ...kenv, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: token, VIBESPACE_SESSION_CWD: CWD }, cwd: CWD });
  let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
  const t = setTimeout(() => c.kill('SIGKILL'), timeoutMs);
  c.on('exit', (code) => { clearTimeout(t); resolve({ code, out, err, ms: Date.now() - t0, at: t0, exitAt: Date.now() }); });
});
const A = (args) => cli(TA, args), B = (args) => cli(TB, args);
const FROZE = /nobody watches or drives it for 30 s — its \d+ tab\(s\) stop drawing/;
const frozenLines = () => journal.filter((x) => x.m.includes(prof.id) && FROZE.test(x.m));
const facts = () => { try { return dialogs.paintFacts(prof.id); } catch { return null; } };
async function waitFrozen(n, ms = 75000) { return until(() => frozenLines().length >= n && facts() && facts().frozen, ms, 200); }
const pagesNow = async (rec) => (((await VP.browserTargets(rec.cdpUrl)).targets) || []).filter((t) => t.type === 'page');
const tabUrls = (r) => (String(r.out).match(/https?:\/\/[^\s"']+/g) || []).filter((u) => u.startsWith(U('/'))).sort();
let spy = null;
try {
  console.log('— setup: conversations A and B on ONE named profile, the hidden-window rung, browser.idlePaintFreeze ON');
  await kk.attach({ profileId: prof.id, browserKey: KA, sessionId: 'sess-a', by: 'user' });
  await kk.attach({ profileId: prof.id, browserKey: KB, sessionId: 'sess-b', by: 'user' });
  let r = await A(['open', U('/a')]); const rb = await B(['open', U('/b')]);
  const rec = kk.browserOf(prof.id);
  if (!rec || !rec.cdpUrl) { skip(`the keeper could not launch the browser here: ${JSON.stringify({ r: r.err.slice(-300), rec })}`); throw new Error('no browser'); }
  ok(r.code === 0 && rb.code === 0 && rec.display && rec.display.fallback && rec.display.fallback.rung === 'hidden-window' && BI.unseenRung(rec.display), 'both conversations browse on the hidden-window rung (no desktop: the CLI\'s own Xvfb)', { a: r.err.slice(-300), b: rb.err.slice(-300), display: rec.display });
  spy = await cdpClient(rec.cdpUrl);
  const p0 = await pagesNow(rec);
  const tA = p0.find((t) => /HP-A/.test(t.title)), tB = p0.find((t) => /HP-B/.test(t.title));
  const winA = tA ? await VP.windowOf(rec.cdpUrl, tA.targetId) : null, winB = tB ? await VP.windowOf(rec.cdpUrl, tB.targetId) : null;
  ok(winA != null && winB != null && winA !== winB, `one browser, a window per conversation: A's page in window ${winA}, B's in ${winB}`, p0.map((t) => t.title));
  const vis = async (t) => { try { const v = await VP.visibilityOf(rec.cdpUrl, t.targetId); return v && v.ok ? v.visibility : `? ${v && v.error}`; } catch (e) { return `? ${e && e.message}`; } };
  console.log(`    (Chrome's pages: ${(await Promise.all(p0.map(async (t) => `${t.url.replace(U(''), '')} w${await VP.windowOf(rec.cdpUrl, t.targetId)} ${await vis(t)}`))).join(' · ')})`);
  if (tA && (await vis(tA)) !== 'visible') { await spy.send('Target.activateTarget', { targetId: tA.targetId }); console.log(`    (A's page was not in front in its window — brought forward, as a person would: now ${await vis(tA)})`); }
  // the CONTROL of d: an alert on a page never frozen — does the watch see it on this rung at all?
  const oc = opens.length; const rc = await A(['click', '#b']);
  const dCtl = { watch: opens.slice(oc), said: /hello from a frozen page/.test(rc.out + rc.err), daemonLine: /dialog is blocking the page/.test(rc.out + rc.err) };
  console.log(`    (d CONTROL, never frozen: the watch saw ${dCtl.watch.length} dialog(s); the daemon's own "blocking" line: ${dCtl.daemonLine})`);
  if (dCtl.daemonLine) await A(['dialog', 'accept']);
  const tabsA0 = tabUrls(await A(['tab', 'list'])), tabsB0 = tabUrls(await B(['tab', 'list']));
  const busy = await gpuPct(spy, 5);
  console.log(`    (the GPU process draws the page at ${busy.pct} % over 5 s before any freeze — pids ${busy.pids.join(',')})`);

  // ── a ──
  console.log('— a: no viewer, no verb for 30 s');
  const tIdle = Date.now(), lastA = facts() ? facts().lastVerbAt : 0; // the watch's last verb: B's `tab list`, BEFORE the 5 s GPU sample
  const fz1 = await waitFrozen(1);
  const fz1At = fz1 ? frozenLines()[0].at : 0;
  const g1 = fz1 ? await gpuPct(spy, 5) : { pct: NaN };
  const ta = freezeTerms(lastA, BI.IDLE_PAINT_MS, fz1At);
  ok(!!fz1 && judged(ta) && g1.pct <= 3 && busy.pct >= 20, `a: the keeper's journal says it stopped drawing ${sec(ta.since)} s after the last verb = ${termsText(ta)} (the GPU sample's own clock started ${sec(tIdle - lastA)} s late); the GPU process over 5 s: ${g1.pct} % (was ${busy.pct} %)`, { terms: ta, journal: journal.slice(-4), facts: facts() });

  // ── b ──
  console.log('— b: the next verb (a screenshot) thaws before it runs');
  const rMark = resolves.length, bornB = spy.born.length;
  // THE PICTURE GOES UNDER THE SESSION's OWN PROJECT FOLDER (主开发 r2886, box row 431): the CLI's write fence allows that folder, the
  // temp folder the CLI process itself sees, and ~/Downloads — a box row's temp folder is the row's own, so a picture under this
  // run's scratch root was refused (write_path_refused) before the verb ran. CWD is the folder handed as the session's
  // (VIBESPACE_SESSION_CWD): it is allowed in every environment, and it stays inside the scratch root
  const shot = path.join(CWD, 'a.png');
  r = await A(['screenshot', shot]);
  const rv = resolves[rMark] || {};
  let png = null; try { png = pngCensus(fs.readFileSync(shot)); } catch { png = null; }
  ok(r.code === 0 && png && png.colors >= 8 && png.nonWhitePct > 1 && png.nonWhitePct < 99, `b: \`vibespace-browser screenshot\` on the frozen page — its picture is NOT blank (${png ? `${png.w}×${png.h}, ${png.nonWhitePct} % non-white, ${png.colors} colours` : 'no PNG'})`, { r: r.out.slice(-300) + r.err.slice(-300), png });
  const ev = await A(['eval', 'JSON.stringify(window.__ticks.slice(-3000))']);
  const ticks = (String(ev.out).match(/1\d{12}/g) || []).map(Number);
  const during = ticks.filter((x) => x > fz1At + 250 && x < (rv.at || 0));
  const first = ticks.find((x) => x >= (rv.at || Infinity));
  ok(ev.code === 0 && rv.done && during.length === 0 && first != null && first - rv.done <= 17, `b: no frame while frozen (${during.length} rAF between the freeze and the verb); the first frame ${first != null && rv.done ? first - rv.done : '?'} ms after the /resolve answered (thaw ${rv.done - rv.at} ms) — within one frame`, { rv, first, ticks: ticks.length, during: during.slice(0, 5) });
  const bornAfterB = spy.born.slice(bornB);

  // ── c ──
  console.log('— c: a live view attaching thaws');
  const fz2 = await waitFrozen(2);
  const frames = []; const lv = new WebSocket(`ws://127.0.0.1:${new URL(API).port}${S.STREAM_PATH}?session=sess-a&profile=${prof.id}`);
  lv.on('message', (m) => { try { const j = JSON.parse(String(m)); if (j.type === 'frame') frames.push({ at: Date.now(), n: String(j.data || '').length }); } catch { /* binary */ } });
  const tView = Date.now(); const bornC = spy.born.length;
  const th = fz2 ? await until(() => facts() && !facts().frozen, 5000, 20) : null;
  const thMs = Date.now() - tView;
  await sleep(3000);
  const g3 = await gpuPct(spy, 3);
  const fr = frames.filter((x) => x.at >= tView + thMs).length;
  ok(!!fz2 && !!th && thMs < 3000 && fr >= 10 && g3.pct >= 10, `c: frozen again after 30 s; the live view attaching thawed it in ${thMs} ms — ${fr} frames reached the view in ~3 s, GPU ${g3.pct} %`, { fz2: !!fz2, facts: facts(), frames: frames.length });
  const bornAfterC = spy.born.slice(bornC);
  lv.close(); await sleep(300);

  // ── d ──
  console.log('— d: an alert on the frozen page reaches the dialog watch');
  const fz3 = await waitFrozen(3);
  const oMark = opens.length, rMark2 = resolves.length, bornD = spy.born.length;
  r = await A(['click', '#b']);
  const od = opens.slice(oMark).find((x) => x.type === 'alert'); const rd = resolves[rMark2] || {};
  ok(!!fz3 && r.code === 0 && od && od.at - rd.at < 1000 && /\(a page alert was auto-accepted: "hello from a frozen page"\)/.test(r.err + r.out) && !/dialog is blocking the page/.test(r.out + r.err), `d: frozen again; the agent's click raises an alert — the watch ${od ? `has it (${od.kind}${od.by ? ` by ${od.by}` : ''})` : 'never had it'} ${od && rd.at ? od.at - rd.at : '?'} ms after the verb's /resolve (bound 1 s), and the verb says it in the watch's words (CONTROL never frozen: ${JSON.stringify(dCtl.watch.map((x) => `${x.kind}${x.by ? ':' + x.by : ''}`))}, the daemon's own line ${dCtl.daemonLine})`, { r: r.out.slice(-300) + r.err.slice(-400), od, opens: opens.length, dCtl });
  if (/dialog is blocking the page/.test(r.out + r.err)) await A(['dialog', 'accept']);
  const bornAfterD = spy.born.slice(bornD);

  // ── e ──
  console.log('— e: two conversations, one browser — the thaws for A never touch B\'s window');
  await sleep(1000);
  const thawBorn = [...bornAfterB, ...bornAfterC, ...bornAfterD];
  const inB = thawBorn.filter((x) => x.windowId === winB);
  const unread = thawBorn.filter((x) => typeof x.windowId !== 'number');
  ok(inB.length === 0 && unread.length === 0, `e: the red cell — page targets Chrome created during A's thaws (b, c, d): ${thawBorn.length}, in B's window ${inB.length} (windows ${JSON.stringify(thawBorn.map((x) => x.windowId))})`, thawBorn);
  const p1 = await pagesNow(rec);
  const census = WIN.windowCensus(await Promise.all(p1.map(async (t) => ({ holder: /HP-A/.test(t.title) ? 'A' : /HP-B/.test(t.title) ? 'B' : `other:${t.targetId}`, windowId: await VP.windowOf(rec.cdpUrl, t.targetId) }))));
  const tabsA1 = tabUrls(await A(['tab', 'list'])), tabsB1 = tabUrls(await B(['tab', 'list']));
  const tb = await B(['get', 'title']);
  const ids = (ps) => ps.map((t) => t.targetId).sort().join(',');
  ok(ids(p1) === ids(p0) && WIN.multiWindowHolders(census).length === 0 && census.A && census.B, `e: no stray — Chrome's page targets are the very same ${p0.length} before and after the thaws (the keeper's own blank tabs included), one window per holder`, { census, p0: p0.map((t) => t.url), p1: p1.map((t) => t.url) });
  const visB = tB ? await vis(tB) : null;
  ok(JSON.stringify(tabsA1) === JSON.stringify(tabsA0) && JSON.stringify(tabsB1) === JSON.stringify(tabsB0) && tb.code === 0 && /HP-B ledger/.test(tb.out) && visB === 'visible', `e: each conversation's own \`tab list\` is what it was before the thaws; B's next verb runs on B's page and shows it again in B's window (${visB})`, { tabsA0, tabsA1, tabsB0, tabsB1, tb: tb.out.slice(-200) + tb.err.slice(-200), warn: journal.filter((x) => /thaw's blank/.test(x.m)) });

  // ── a2 ── B-1542 RED CONTROL: the window shortened (two ticks) — the measured stop moves with the window it is derived from
  const CTL_IDLE = 2 * K.TICK_MS;
  console.log(`— a2: RED CONTROL — the idle window shortened to ${sec(CTL_IDLE)} s: the stop moves with it`);
  idleCtl = CTL_IDLE;
  const nA2 = frozenLines().length;
  await A(['get', 'title']); // the last verb
  const lastA2 = facts() ? facts().lastVerbAt : 0;
  const fzA2 = await until(() => frozenLines().length > nA2 && facts() && facts().frozen, CTL_IDLE + 4 * K.TICK_MS, 200);
  const atA2 = fzA2 ? frozenLines()[nA2].at : 0;
  await sleep(K.TICK_MS + 500); // the sweep after it seen (the line came from the first sweep past the window, not a later one)
  idleCtl = null;
  const tA2 = freezeTerms(lastA2, CTL_IDLE, atA2);
  const literal = tA2.since >= BI.IDLE_PAINT_MS - 1000; // the old literal bound (30 s − 1 s), judged on the same numbers
  ok(!!fzA2 && judged(tA2) && tA2.since < BI.IDLE_PAINT_MS && !literal, `a2: RED CONTROL — with the window at ${sec(CTL_IDLE)} s it stopped drawing ${sec(tA2.since)} s after the last verb = ${termsText(tA2)}; the old literal "≥ ${sec(BI.IDLE_PAINT_MS - 1000)} s" is ${literal ? 'GREEN (it would not see the change)' : 'RED'} on these numbers`, tA2);

  // ── f ──
  console.log('— f: CONTROL — the switch OFF on the same browser');
  SET['browser.idlePaintFreeze'] = false;
  const nF = frozenLines().length;
  await A(['get', 'title']); // the last verb (and a thaw if anything was frozen)
  await sleep(55000);
  const gF = await gpuPct(spy, 5);
  ok(frozenLines().length === nF && facts() && !facts().frozen && gF.pct >= 20, `f: 60 s with nobody and the switch OFF ⇒ never frozen (the keeper reads it at each sweep); the GPU still draws at ${gF.pct} %`, { lines: frozenLines().length - nF, facts: facts() });

  // ── g ── rows B-98f5 / B-bcf8 (lane bl-browser-a, box rows 715-725): THE THAW'S FLIP TAB IS ONE NO DRIVER TAKES. A driver that sees
  // every tab (this keeper has no mediator: the raw road, as a conversation's own browser runs) takes every page tab it is told of —
  // a tab that dies while its drain prepares it held the session 30 s (the blank live view of leg c, the late alert of leg d), and an
  // UNPINNED session made it its active tab and was left on its LAST tab when it went (probe 10: 35 of 100 thaws). The flip tab is
  // born at BI.FLIP_TAB_URL, which the driver's own filter never takes. The product's own freeze and thaw, G_FLIPS times: U, an
  // unpinned session on the raw address with a SECOND tab after A's in its list, must read A's page after every flip, the agent's
  // next command too, no command over 2 s, every flip tab born at that address — and neither the pinned nor the unpinned session's
  // own tab counter moves (a tab the driver took would have taken a number). THIS LEG GOES RED WHEN A DRIVER UPDATE CHANGES ITS FILTER.
  console.log('— g: the thaw\'s flip tab is one no driver takes — neither a pinned nor an unpinned session takes it, or moves');
  SET['browser.idlePaintFreeze'] = false;   // only the leg's own freezes (leg f left the switch off)
  const G_FLIPS = 30;
  const recG = kk.browserOf(prof.id) || rec, URt = Ff.createBrowserRuntime({ env: kenv });
  const tAg = (await pagesNow(recG)).find((t) => /HP-A/.test(t.title));
  const OAg = await kk.leaseCliOpts(prof.id, KA);
  const OU = { session: 'vs-bk-0000c3c3', extraEnv: { AGENT_BROWSER_CDP: recG.cdpUrl, AGENT_BROWSER_IDLE_TIMEOUT_MS: '0' } };
  const uX = (argv) => URt.exec('vs-' + prof.id, argv, { ...OU, timeout: 60000 }), aX = (argv) => URt.exec('vs-' + prof.id, argv, { ...OAg, timeout: 60000 });
  const tabsIn = (r) => (r && r.ok && r.json && r.json.data && Array.isArray(r.json.data.tabs) ? r.json.data.tabs : []);
  const tabNo = (t) => { const m = /^t(\d+)$/.exec(String((t && t.tabId) || '')); return m ? Number(m[1]) : -1; };
  const sameId = (a, b) => !!a && !!b && String(a).toUpperCase() === String(b).toUpperCase();
  await uX(['tab', 'list', '--json']);                                                  // U's daemon: unpinned, on the raw address
  const sc = await spy.send('Target.createTarget', { url: U('/b') }); const secondG = sc && sc.result ? sc.result.targetId : null;
  await sleep(1500);
  if (tAg) { await uX(['tab', tAg.targetId]); await spy.send('Target.activateTarget', { targetId: tAg.targetId }); }
  const uT0 = tabsIn(await uX(['tab', 'list', '--json'])), aT0 = tabsIn(await aX(['tab', 'list', '--json']));
  const iAg = uT0.findIndex((t) => tAg && sameId(t.targetId, tAg.targetId)), iSg = uT0.findIndex((t) => sameId(t.targetId, secondG));
  const maxU0 = Math.max(-1, ...uT0.map(tabNo)), maxA0 = Math.max(-1, ...aT0.map(tabNo));
  const bornG = spy.born.length, gRuns = [];
  const holderA = { ok: true, profileId: prof.id, ephemeral: false, sessionId: 'sess-a', browserKey: KA };   // the route's own (dialogTargetFor)
  for (let i = 0; i < G_FLIPS; i++) {
    const b0 = spy.born.length;   // r4088: the flip tabs born in THIS sample, by whichever thaw (the leg's, or the sweep's own: the switch is off)
    const f1 = await dialogs.freezePaint(prof.id);
    const th = f1 && f1.ok ? await dialogs.thawPaint(prof.id, { holder: holderA }) : null;
    const na = await A(['get', 'url']);
    const t1 = Date.now(); const nu = await uX(['get', 'url']); const nuMs = Date.now() - t1;
    const bornHere = spy.born.slice(b0).filter((b) => !sameId(b.targetId, secondG)).map((b) => String(b.url || ''));
    const shownByLeg = th && Array.isArray(th.shown) ? th.shown.length : 0;
    let aVis = null; if (shownByLeg !== 1 && tAg) { try { const v = await VP.visibilityOf(recG.cdpUrl, tAg.targetId); aVis = v && v.ok ? v.visibility : `? ${v && v.error}`; } catch (e) { aVis = `? ${e && e.message}`; } }
    gRuns.push({ i: i + 1, froze: !!(f1 && f1.ok), why: (f1 && f1.why) || null, shown: shownByLeg, bornFlip: bornHere.filter((u) => u === BI.FLIP_TAB_URL).length, bornOther: bornHere.filter((u) => u !== BI.FLIP_TAB_URL).length, aVis, aMs: na.ms, aOwn: String(na.out + na.err).includes(U('/a')), uMs: nuMs, uOwn: String((nu && nu.stdout) || '').includes(U('/a')) });
    await sleep(200);
  }
  const flipBirths = spy.born.slice(bornG).filter((b) => !sameId(b.targetId, secondG)).map((b) => String(b.url || ''));
  // the counters: one more tab, listed by both (each list's own drain registers it), its number read — then closed (it was prepared)
  const pc = await spy.send('Target.createTarget', { url: U('/b') }); const probeG = pc && pc.result ? pc.result.targetId : null;
  await sleep(1500);
  const uT1 = tabsIn(await uX(['tab', 'list', '--json'])), aT1 = tabsIn(await aX(['tab', 'list', '--json']));
  const noU = tabNo(uT1.find((t) => sameId(t.targetId, probeG))), noA = tabNo(aT1.find((t) => sameId(t.targetId, probeG)));
  // the PINNED session's own tabs, by target id (r4061, row 726: its tab NUMBERS start again with each new driver — agent-browser's
  // assign_tab_id grows only inside one BrowserManager, `next_tab_id: 1` in launch / connect_cdp_inner — and two roads drive A here,
  // the keeper's and the agent's): the same tabs before and after but the probe, none at the internal address
  const idsOf = (l) => l.map((t) => String(t.targetId || '').toUpperCase()).filter(Boolean).sort();
  const aBefore = idsOf(aT0), aAfter = idsOf(aT1.filter((t) => !sameId(t.targetId, probeG))), aFlipListed = aT1.filter((t) => String(t.url || '').startsWith(BI.FLIP_TAB_URL)).length;
  for (const id of [probeG, secondG]) { if (id) { try { await spy.send('Target.closeTarget', { targetId: id }); } catch { /* gone */ } } }
  try { await uX(['close']); } catch { /* U's own connection only (a CDP session's close leaves the pages) */ }
  await sleep(500);
  // r4088: a flip is counted by the flip tabs BORN in its sample (a thaw of the keeper's sweep, which the switch-off sweep runs on a frozen
  // page, flips it as well as the leg's own); every sample that froze must have flipped; the refused ones counted by their reason; a floor
  const G_FLOOR = 25, frozeG = gRuns.filter((x) => x.froze), flipsG = frozeG.filter((x) => x.bornFlip >= 1).length, slowG = gRuns.filter((x) => x.aMs > 2000 || x.uMs > 2000);
  const refusedG = gRuns.filter((x) => !x.froze).reduce((m, x) => { m[x.why || 'no reason'] = (m[x.why || 'no reason'] || 0) + 1; return m; }, {});
  const bySweepG = frozeG.filter((x) => x.shown === 0 && x.bornFlip >= 1).map((x) => x.i), oddG = gRuns.filter((x) => x.shown !== 1 || x.bornFlip !== 1 || x.bornOther || !x.froze);
  // r4095 (1): a sample the leg's own thaw did not show exactly one front must read A's page «visible» after — a sweep that flipped only
  // the OTHER holder's front (B's window stays live, its front owed) would otherwise count as A's flip; an unread visibility is no proof
  const notVisG = gRuns.filter((x) => x.shown !== 1 && x.aVis !== 'visible').map((x) => ({ i: x.i, froze: x.froze, shown: x.shown, bornFlip: x.bornFlip, aVis: x.aVis }));
  const unshownG = gRuns.filter((x) => x.shown !== 1).length;
  const gWhy = { flips: flipsG, froze: frozeG.length, of: G_FLIPS, refused: refusedG, flippedBySweep: bySweepG, notVisible: notVisG.slice(0, 8), odd: oddG.slice(0, 8), births: [...new Set(flipBirths)], birthCount: flipBirths.length, u: { agentIndex: iAg, secondIndex: iSg, counter: { before: maxU0, probe: noU } }, a: { counter: { before: maxA0, probe: noA }, tabs: { before: aBefore.length, after: aAfter.length, same: JSON.stringify(aBefore) === JSON.stringify(aAfter), flipListed: aFlipListed } } };
  ok(frozeG.length >= G_FLOOR && flipsG === frozeG.length && notVisG.length === 0 && flipBirths.length >= flipsG && flipBirths.every((u) => u === BI.FLIP_TAB_URL), `g: every freeze that froze was flipped back (${flipsG} of ${frozeG.length} froze, of ${G_FLIPS}; refused by reason ${JSON.stringify(refusedG)}; ${bySweepG.length} flipped by the keeper's own sweep, not the leg's thaw), A's page read «visible» after each of the ${unshownG} samples the leg's own thaw did not show exactly one, every flip tab born at ${BI.FLIP_TAB_URL} (the address no driver takes)`, gWhy);
  ok(iAg >= 0 && iSg > iAg && gRuns.every((x) => x.uOwn) && gRuns.every((x) => x.aOwn), `g: after every flip the UNPINNED session (a second tab after A's in its list) and the agent read their own page — the moved tab of today's blank flip never happens`, { ...gWhy, notOwn: gRuns.map((x, i) => (!x.uOwn || !x.aOwn ? i + 1 : null)).filter(Boolean) });
  ok(slowG.length === 0, `g: no command over 2 s in ${G_FLIPS} flips (the 30 s hold of the blank a driver prepared and lost)`, { slow: slowG.slice(0, 4) });
  // RED for a flip tab a driver takes (probe 10 row 725's control: the about:blank flip was registered by the unpinned session — its
  // ACTIVE tab moved — in 35 of 100 thaws, so 30 blank flips leave U's own counter still in about 0.65^30 ≈ 2.5e-6 of runs): U is
  // driven by ONE road (one BrowserManager), so a tab it took has a number — the probe would read above before + 1
  ok(maxU0 >= 0 && noU === maxU0 + 1 && aBefore.length > 0 && JSON.stringify(aBefore) === JSON.stringify(aAfter) && aFlipListed === 0, `g: neither session took a flip tab in ${G_FLIPS} flips — the UNPINNED session's own counter did not move (U ${maxU0} → ${noU}; one road drives it), and the PINNED session holds the very same ${aBefore.length} tabs by target id but the probe, none at the internal address (its numbers start again with each new driver: A ${maxA0} → ${noA})`, gWhy);

  // ══ B-e674 (the coordinator's r548 / r562 / r605): THE CREATE ROADS THAT NEED THE REAL PROGRAM — written once by the lane
  //    (which runs no real driver), run on the box by the integrator. Each leg reads what the KEEPER says (tabOwnersFor: its
  //    front, owners, birth stamps) and Chrome's own targets; the only acts are each leg's own setup (an activation, a create,
  //    the close of what it created) — the keeper moves, closes and activates nothing for a front.
  //    PROOFS: a1 a raw client's plain create · b1 a page's tab while the person drives A's view (ruling (i)). MEASURES, never a ✓
  //    (r683): a2 the session's own `tab new` (the driver's plain create) · c1 the profile's own «continue where you left off»
  SET['browser.idlePaintFreeze'] = false;
  const VA = { kind: 'attachment', profileId: prof.id, sessionName: 'vs-' + KA };
  const pagesE = await pagesNow(rec); const tAe = pagesE.find((t) => /HP-A/.test(t.title));
  const frontLines = () => journal.filter((x) => x.m.includes('in front of the conversation ' + KA));
  const ownersA = () => kk.tabOwnersFor(VA, { activeTarget: tAe && tAe.targetId });
  const closeOwn = async (id) => { if (id) { try { await spy.send('Target.closeTarget', { targetId: id }); } catch { /* gone */ } } };
  // a1
  console.log('— B-e674 a1: a client the hub does not drive creates a tab (no window named): it lands in the last focused window — said in front, nothing acted');
  if (tAe) await spy.send('Target.activateTarget', { targetId: tAe.targetId }); // the leg's own setup: A's window is the last activated
  const nL1 = frontLines().length;
  const cr1 = await spy.send('Target.createTarget', { url: U('/raw-a1') });
  const raw1 = cr1 && cr1.result && cr1.result.targetId;
  const win1 = raw1 ? await VP.windowOf(rec.cdpUrl, raw1) : null;
  const o1 = await until(async () => { const r = await ownersA(); return r && r.front && r.front.state === 'foreign' && r.front.targetId === String(raw1 || '').toUpperCase() ? r : null; }, 8000, 250) || await ownersA();
  console.log(`    (a1: the raw tab ${String(raw1).slice(0, 8)} in window ${win1} — A's window ${winA}; the keeper's front ${JSON.stringify(o1 && o1.front)}; journal ${JSON.stringify(frontLines().slice(nL1).map((x) => x.m))})`);
  const raw1Lives = raw1 ? (await pagesNow(rec)).some((t) => t.targetId === raw1) : false;
  ok(!!(raw1 && win1 === winA && o1 && o1.front && o1.front.state === 'foreign' && o1.front.owner === 'orphan' && raw1Lives && frontLines().length > nL1),
    'B-e674 a1: a RAW create on the shared browser lands in A\'s window (the last focused) and takes its front — the keeper names it «a tab nobody holds» in front of A\'s window, says it once in the journal, and moves or closes nothing (the tab still lives)', { raw1, win1, winA, front: o1 && o1.front });
  await closeOwn(raw1);
  // a2
  console.log('— B-e674 a2: the session\'s own `tab new` (the driver\'s plain create, the keeper\'s fallback road) lands in the last focused window — said in front of the holder it is not');
  if (tAe) await spy.send('Target.activateTarget', { targetId: tAe.targetId });
  const before2 = new Set((await pagesNow(rec)).map((t) => t.targetId));
  const ex2 = await kk._runtime.exec(require('../src/browser-profiles.js').sessionNameFor(prof.id), ['tab', 'new', U('/b-a2')], await kk.leaseCliOpts(prof.id, KB));
  const new2 = (await pagesNow(rec)).find((t) => !before2.has(t.targetId)) || null;
  const win2 = new2 ? await VP.windowOf(rec.cdpUrl, new2.targetId) : null;
  const o2 = new2 ? (await until(async () => { const r = await ownersA(); return r && r.front && r.front.targetId === String(new2.targetId).toUpperCase() ? r : null; }, 8000, 250) || await ownersA()) : null;
  console.log(`    (a2: B's driver made ${new2 ? String(new2.targetId).slice(0, 8) : 'nothing'} (exec ok ${!!(ex2 && ex2.ok)}) in window ${win2}; the keeper's front for A ${JSON.stringify(o2 && o2.front)})`);
  // r683: a leg that accepts either outcome proves nothing — it is a MEASURE, said as one (never a ✓)
  console.log(`    MEASURE B-e674 a2 (not a proof): B's own driver's plain create ${new2 ? (win2 === winA ? `landed in A's window ${win2}, and the keeper named its front ${JSON.stringify(o2 && o2.front)}` : `landed in window ${win2}, not A's (${winA})`) : 'made no tab'}`);
  await closeOwn(new2 && new2.targetId);
  // b1
  console.log('— B-e674 b1: the person drives A\'s view and A\'s page opens a tab (a sign-in / consent window) — it stays A\'s, named «opened in your takeover»');
  const tk1 = kk.takeover({ browserKey: KA, profileId: prof.id, viewerId: 9, sessionId: 'sess-a' });
  const op1 = tAe ? await VP.openTabInWindow(rec.cdpUrl, { anchorTargetId: tAe.targetId, windowId: winA }) : null;
  const pop1 = op1 && op1.ok ? String(op1.targetId).toUpperCase() : null;
  const o3 = pop1 ? (await until(async () => { const r = await ownersA(); return r && r.made && r.made[pop1] ? r : null; }, 8000, 250) || await ownersA()) : null;
  try { kk.handback({ browserKey: KA, profileId: prof.id, viewerId: 9, cause: 'explicit' }); } catch { /* not taken */ }
  console.log(`    (b1: takeover ${!!(tk1 && tk1.ok)}; A's page opened ${pop1 ? pop1.slice(0, 8) : 'nothing'} (${JSON.stringify(op1 && { ok: op1.ok, code: op1.code })}); owner ${o3 && pop1 ? o3.owners[pop1] : '?'}; stamp ${JSON.stringify(o3 && pop1 ? o3.made[pop1] : null)})`);
  ok(!!(tk1 && tk1.ok && pop1 && o3 && o3.owners[pop1] === 'agent' && o3.made[pop1] && o3.made[pop1].made === 'takeover' && o3.made[pop1].person === false && o3.made[pop1].mine === true),
    'B-e674 b1: a tab A\'s page opened while the person drove A\'s view is still A\'s (the popup rule) and carries the birth stamp «opened in your takeover» — the real watch told the keeper at its birth', { pop1, owner: o3 && pop1 && o3.owners[pop1], made: o3 && pop1 && o3.made[pop1] });
  await closeOwn(pop1);
  // c1
  console.log('— B-e674 c1: MEASURED — this scratch profile\'s own «continue where you left off» at a relaunch: what Chrome restores, and whose it reads');
  let c1 = { measured: false };
  try {
    const urls0 = (await pagesNow(rec)).map((t) => t.url).filter((u) => /^https?:/.test(u));
    const dir = (kk.browserOf(prof.id) || {}).dir || prof.dir || null;
    try { spy?.close(); } catch { /* reopened below */ }
    await kk.stop(prof.id, { why: 'user' });
    const pf = dir ? path.join(dir, 'Default', 'Preferences') : null;
    let prefsOk = false;
    if (pf && fs.existsSync(pf)) { const j = JSON.parse(fs.readFileSync(pf, 'utf8')); j.session = { ...(j.session || {}), restore_on_startup: 1 }; fs.writeFileSync(pf, JSON.stringify(j)); prefsOk = true; }
    const ra = await A(['get', 'title']); // A's next command starts the browser again
    const rec2 = kk.browserOf(prof.id);
    const pages2 = rec2 && rec2.cdpUrl ? await pagesNow(rec2) : [];
    const restored = pages2.filter((t) => urls0.includes(t.url));
    const o4 = await kk.tabOwnersFor(VA, {});
    c1 = { measured: true, prefsOk, dir: !!dir, relaunched: ra.code === 0, before: urls0.length, after: pages2.length, restored: restored.map((t) => ({ id: String(t.targetId).slice(0, 8), url: t.url.replace(U(''), ''), owner: o4 && o4.owners ? o4.owners[String(t.targetId).toUpperCase()] : '?', stamped: !!(o4 && o4.made && o4.made[String(t.targetId).toUpperCase()]) })) };
  } catch (e) { c1 = { measured: false, threw: String(e && e.message).slice(0, 200) }; }
  console.log(`    (c1: ${JSON.stringify(c1)})`);
  // r683: with nobody driving, «never stamped as the person's» cannot go red — c1 is a MEASURE of what Chrome restores, said as one
  console.log(`    MEASURE B-e674 c1 (not a proof): a relaunch with the profile's own restore setting — ${c1.measured ? `${c1.restored.length} tab(s) restored of ${c1.before}; their owners ${JSON.stringify(c1.restored.map((x) => x.owner))}` : 'not measured (' + (c1.threw || 'no relaunch') + ')'}`);
  // ── h ── row B-0e4a (主开发 r4252 / r4264; LAW A of r4312 / r4319): A LEASE's OWN TAB COMES BACK WITH CHROME's RESTORE — ONLY WHEN
  // IT STANDS ALONE IN ITS WINDOW. The keeper births the lease's root at about:blank#vs-own-<its mark>, in a window of its own; after a
  // restart the ONE page whose first history entry carries it is taken back when no other page sits in its window — every read first
  // (each orphan's history, every page's window), then one act. THE ALONE SCENE (a profile of its own, one conversation C): taken
  // back at each relaunch, the count FLAT, the person's hand navigation still taken back; RED a lease with no mark (one page more).
  // THE SHARED SCENE (A's window, where legs g, a2 and b1 left pages beside A's): NOT taken back, one page more, a new mark — today's
  // behaviour; and a copy carrying the mark (many): none taken. L2: with C's marked root born and NOT yet navigated, nothing the hub
  // hands a viewer or the agent carries the mark. The page never reads its mark. Restore set as c1 left it, relaunches by the agents.
  console.log('— h: B-0e4a — the lease\'s own tab comes back with Chrome\'s restore when it stands alone in its window; never from a shared one');
  const leaseA = () => ((kk._reg() || {}).leases || []).find((l) => l.profileId === prof.id && l.browserKey === KA) || null;
  // 主开发 r4282: each relaunch prints the keeper's own take-back facts (its verdict, pages read, unread histories and windows, the
  // reads' time, the window, a new mark) — counts and times only, through its suite seam
  const lastTakeBack = () => ((typeof kk._takeBackFacts === 'function' ? kk._takeBackFacts() : []).slice(-1)[0] || null);
  const tbSay = (x) => (x ? `${x.verdict}, ${x.orphans} restored page(s) read, ${x.unread} unread, ${x.winUnread || 0} window(s) unread, ${x.readMs} ms, own window ${x.ownWindow === true ? 'yes' : 'no'}${x.remint ? ', a new mark' : ''}` : 'no take-back read');
  let hN = 0;
  const relaunchOf = async (pr, run) => {
    const tb0 = lastTakeBack();
    const rec0 = kk.browserOf(pr.id); let before = null; try { before = rec0 && rec0.cdpUrl ? (await pagesNow(rec0)).length : null; } catch { before = null; }
    const dir = (rec0 || {}).dir || pr.dir || null;
    await kk.stop(pr.id, { why: 'user' });
    const pf = dir ? path.join(dir, 'Default', 'Preferences') : null;
    if (pf && fs.existsSync(pf)) { try { const j = JSON.parse(fs.readFileSync(pf, 'utf8')); j.session = { ...(j.session || {}), restore_on_startup: 1 }; fs.writeFileSync(pf, JSON.stringify(j)); } catch { /* as it is */ } }
    const r = await run(['get', 'url']);
    const recN = kk.browserOf(pr.id); let pages = null; try { pages = recN && recN.cdpUrl ? (await pagesNow(recN)).length : null; } catch { pages = null; }
    const tb1 = lastTakeBack(); const takeBack = tb1 && tb1 !== tb0 ? tb1 : null;
    console.log(`    (h relaunch ${++hN} [${pr.label}]: ${before} → ${pages} page(s); take-back: ${tbSay(takeBack)})`);
    return { ok: r.code === 0, own: String(r.out || ''), before, pages, recN, takeBack };
  };
  const pageNavH = (cdpUrl, tid, url) => new Promise((resolve) => {
    const u = VP.pageUrlOf(cdpUrl, tid); if (!u) return resolve(false);
    let done = false; const fin = (v) => { if (done) return; done = true; try { ws.close(); } catch { /* */ } resolve(v); };
    const ws = new WebSocket(u); const t = setTimeout(() => fin(false), 5000);
    const sendOn = (id, method, params) => ws.send(JSON.stringify({ id, method, params }));
    ws.once('error', () => { clearTimeout(t); fin(false); });
    ws.once('open', () => sendOn(1, 'Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }));
    ws.on('message', (m) => { let j; try { j = JSON.parse(String(m)); } catch { return; } if (j.id === 1) sendOn(2, 'Page.navigate', { url }); else if (j.id === 2) { clearTimeout(t); setTimeout(() => fin(true), 800); } });
  });
  const pageOf = async (recN, path0) => ((recN && recN.cdpUrl ? await pagesNow(recN) : []).find((t) => t.url === U(path0)) || null);
  // ── THE ALONE SCENE: a profile of its own, one conversation C, its root alone in the window the keeper opened for it
  const KC = 'bk-0000c3c3', TC = 'vsst_hpaint_c';
  live.add(KC); sessions.set('sess-c', { agentToken: TC, _browserKey: KC, _browserVariant: 'D', _browserEnv: null, name: 'Chat C', cwd: CWD });
  const C = (args) => cli(TC, args);
  const prof2 = kk.createProfile({ label: 'Solo' }, { owner: { kind: 'instance', id: null } });
  await kk.attach({ profileId: prof2.id, browserKey: KC, sessionId: 'sess-c', by: 'user' });
  const leaseC = () => ((kk._reg() || {}).leases || []).find((l) => l.profileId === prof2.id && l.browserKey === KC) || null;
  const c0 = await C(['get', 'url']); // its browser starts: its root is born at its marked blank in a window of its own — not navigated
  // L2 END TO END (主开发 r4319): the mark leaves the hub in no view. Chrome's own list carries it (the precondition: the mark IS
  // upstream); every record the hub sends a viewer (frames and the rest, ~3 s) and every answer to the agent (its status route, its
  // CLI's status) and to the person (the profiles list) is scanned for its fixed prefix: none. (The agent's own `get url` reads
  // the driver directly, outside the hub: its own tab, its own address.)
  let e2e = { measured: false };
  try {
    const recC = kk.browserOf(prof2.id);
    const pagesC = recC && recC.cdpUrl ? await pagesNow(recC) : [];
    const markedUp = pagesC.filter((t) => /#vs-own-/i.test(String(t.url || ''))).length;
    const got = [];
    const lvC = new WebSocket(`ws://127.0.0.1:${new URL(API).port}${S.STREAM_PATH}?session=sess-c&profile=${prof2.id}`);
    lvC.on('message', (m) => { got.push(String(m)); });
    await sleep(3000);
    const st1 = await fetch(API + '/api/agent/browser/status', { headers: { Authorization: 'Bearer ' + TC } }).then((r) => r.text()).catch((e) => `! ${e && e.message}`);
    const prl = await fetch(API + '/api/browser/profiles').then((r) => r.text()).catch((e) => `! ${e && e.message}`);
    const cst = await C(['status']);
    try { lvC.close(); } catch { /* */ }
    const answers = [st1, prl, String(cst.out || '') + String(cst.err || '')];
    const hits = [...got, ...answers].filter((x) => /vs-own-/i.test(x));
    e2e = { measured: true, markedUp, records: got.length, frames: got.filter((x) => x.includes('"frame"')).length, answers: answers.length, answered: answers.filter((x) => x && !x.startsWith('!')).length, hits: hits.length, first: hits[0] ? hits[0].slice(0, 160) : null };
  } catch (e) { e2e = { measured: false, threw: String(e && e.message).slice(0, 200) }; }
  ok(c0.code === 0 && e2e.measured && e2e.markedUp >= 1 && e2e.records > 0 && e2e.answered === 3 && e2e.hits === 0,
    `h L2: C's root born at its marked blank, not yet navigated (Chrome's own list: ${e2e.markedUp} page(s) carry the mark) — ${e2e.records} record(s) to a viewer (${e2e.frames} frames) and ${e2e.answered} answer(s) (the agent's status, its CLI's status, the profiles list): none carries it`, e2e);
  const cNav = await C(['open', U('/c')]);
  const hC = [await relaunchOf(prof2, C), await relaunchOf(prof2, C), await relaunchOf(prof2, C)];
  ok(cNav.code === 0 && hC.every((x) => x.ok && x.own.includes(U('/c')) && x.pages === x.before && x.takeBack && x.takeBack.verdict === 'take' && x.takeBack.ownWindow === true),
    `h ALONE: after each relaunch with Chrome's restore C is on ITS OWN page again — taken back, alone in its window — and the page count stays FLAT (${hC.map((x) => `${x.before} → ${x.pages}`).join(' · ')}; probe 12 grew by one a start)`, hC.map((x) => ({ own: x.own.slice(0, 80), before: x.before, pages: x.pages, tb: x.takeBack })));
  // the page never reads its mark: its own address, its referrer, its history's length — none carries it
  const tC1 = await pageOf(hC[2].recN, '/c');
  let seen = null; if (tC1) { const u = VP.pageUrlOf(hC[2].recN.cdpUrl, tC1.targetId); seen = await new Promise((resolve) => { const ws = new WebSocket(u); const t = setTimeout(() => { try { ws.close(); } catch { /* */ } resolve(null); }, 3000); ws.once('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: '[location.href, document.referrer, String(history.length)].join(" ")', returnByValue: true } }))); ws.on('message', (m) => { let j; try { j = JSON.parse(String(m)); } catch { return; } if (j.id === 1) { clearTimeout(t); try { ws.close(); } catch { /* */ } resolve(j.result && j.result.result ? String(j.result.result.value) : null); } }); ws.once('error', () => { clearTimeout(t); resolve(null); }); }); }
  const cMark = leaseC() && leaseC().ownMark;
  ok(typeof seen === 'string' && !!cMark && !seen.includes(cMark) && !seen.includes('vs-own-'), 'h ALONE: the page reads nothing of its mark — its address, its referrer and its history\'s length carry none of it', { seen: seen ? seen.replace(U(''), '') : seen });
  // the person navigated C's tab by hand before the restart ⇒ still C's: taken back on that page
  const navd = tC1 ? await pageNavH(hC[2].recN.cdpUrl, tC1.targetId, U('/c2')) : false;
  const hC2 = navd ? await relaunchOf(prof2, C) : null;
  ok(navd && !!hC2 && hC2.own.includes(U('/c2')) && hC2.pages === hC2.before && hC2.takeBack && hC2.takeBack.verdict === 'take', 'h ALONE: the person navigated C\'s tab by hand before the restart — still C\'s: taken back on that page, no page more', { navd, own: hC2 && hC2.own.slice(0, 80), before: hC2 && hC2.before, pages: hC2 && hC2.pages });
  // RED as today: a lease with NO mark (a record from before this unit) ⇒ nothing to take back ⇒ one more page at the start
  const lC = leaseC(); if (lC) delete lC.ownMark;
  const hC4 = await relaunchOf(prof2, C);
  ok(!!lC && !!hC4 && !hC4.own.includes(U('/c2')) && hC4.pages === hC4.before + 1 && !hC4.takeBack, 'CONTROL (a lease with no mark, as every lease before this unit): its tab is not taken back — a new tab of its own, ONE PAGE MORE at the start — RED as today', { own: hC4 && hC4.own.slice(0, 80), before: hC4 && hC4.before, pages: hC4 && hC4.pages });
  // ── THE SHARED SCENE: A's window holds pages beside A's (legs g, a2, b1) — law A takes NOTHING back from it (nothing sent to the
  // carrier or its window: the fast leg records every command; here, the carrier still stands on its page), one page more, a new mark
  const hMarkA = leaseA() && leaseA().ownMark;
  const hS = await relaunchOf(prof, A);
  const carrierS = hS.recN ? await pageOf(hS.recN, '/a') : null;
  ok(!!hMarkA && hS.ok && !!hS.takeBack && ['shared', 'unknown'].includes(hS.takeBack.verdict) && hS.takeBack.remint === true && !hS.own.includes(U('/a')) && hS.pages === hS.before + 1 && !!carrierS,
    `h SHARED: A's carrier sits beside other pages (verdict «${hS.takeBack ? hS.takeBack.verdict : '-'}») — NOT taken back: it stands where it was, A gets a tab of its own (one page more: ${hS.before} → ${hS.pages}) under a new mark — today's behaviour`, { own: hS.own.slice(0, 80), tb: hS.takeBack, carrier: !!carrierS });
  // a copy of A's tab (a person's duplicate copies its history) ⇒ two carriers ⇒ none taken
  const markS = leaseA() && leaseA().ownMark;
  let dup = false;
  if (markS && hS.recN) { const cc = await cdpClient(hS.recN.cdpUrl); try { const c = await cc.send('Target.createTarget', { url: `about:blank#vs-own-${markS}` }); const did = c && c.result ? c.result.targetId : null; await sleep(500); dup = !!(did && await pageNavH(hS.recN.cdpUrl, did, U('/b'))); } finally { try { cc.close(); } catch { /* */ } } }
  if (dup) { const tS = (await pagesNow(hS.recN)).find((t) => /^about:blank#vs-own-/.test(String(t.url || ''))) || null; if (tS) await pageNavH(hS.recN.cdpUrl, tS.targetId, U('/a2')); }
  const h3 = dup ? await relaunchOf(prof, A) : null;
  ok(dup && !!h3 && h3.ok && !h3.own.includes(U('/a2')) && h3.pages === h3.before + 1 && h3.takeBack && h3.takeBack.verdict === 'many', 'h SHARED: two restored pages carry the same mark (a copy of A\'s tab): NONE is taken back — a tab of its own (never the copy), one page more', { dup, own: h3 && h3.own.slice(0, 80), before: h3 && h3.before, pages: h3 && h3.pages, tb: h3 && h3.takeBack });
  // 主开发 r4282 (a MEASURE, printed, never judged): ONE relaunch with ≥ 20 restored pages, most opened in the background and never
  // brought to front — does every restored page answer the history read inside its bound, or is the verdict «unknown» (today's
  // behaviour: a new tab)? A gets a fresh mark carried by ONE new page (navigated on); under law A its windows decide the take
  let h5 = null, h5opened = 0, h5before = null;
  try {
    const recM = h3 ? h3.recN : null; const lA5 = leaseA();
    if (recM && recM.cdpUrl && lA5) {
      const mark5 = 'b5'.repeat(12); lA5.ownMark = mark5;
      const cc = await cdpClient(recM.cdpUrl);
      try {
        const c5 = await cc.send('Target.createTarget', { url: `about:blank#vs-own-${mark5}` }); const t5 = c5 && c5.result ? c5.result.targetId : null;
        if (t5) { await sleep(300); await pageNavH(recM.cdpUrl, t5, U('/a?h5')); }
        let n = (await pagesNow(recM)).length;
        for (let i = 0; n < 24 && i < 30; i++) { const b = await cc.send('Target.createTarget', { url: U(`/a?bg=${i}`), background: true }); if (b && b.result && b.result.targetId) { n++; h5opened++; } }
        h5before = n;
      } finally { try { cc.close(); } catch { /* */ } }
      await sleep(1500); // Chrome writes its session file
      h5 = await relaunchOf(prof, A);
    }
  } catch (e) { h5 = { threw: String(e && e.message).slice(0, 160) }; }
  const tb5 = h5 && h5.takeBack;
  console.log(`    MEASURE r4282 (not a proof): a relaunch with ${h5before == null ? '?' : h5before} page(s) before it, ${h5opened} opened in the background and never brought to front — ${h5 && h5.threw ? 'not measured (' + h5.threw + ')' : tb5 ? `take-back ${tbSay(tb5)}; ${tb5.unread ? 'NOT every restored page answered its history read: the verdict is «unknown»' : 'every restored page answered its history read'}; the agent on its own page again: ${h5 && h5.own.includes(U('/a?h5')) ? 'yes' : 'no'}; ${h5.pages} page(s) after` : 'no take-back read'}`);
} catch (e) { if (!/^no browser$/.test(String(e && e.message))) ok(false, 'the run threw', String(e && e.stack)); }
finally { try { spy?.close(); } catch { /* */ } try { dialogs.shutdown(); kk.shutdown(); } catch { /* */ } srv.close(); pages.close(); cleanup(); }
done();

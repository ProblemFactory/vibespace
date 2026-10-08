#!/usr/bin/env node
// LANE BROWSER-SWIFTSHADER-CPU-R2 — THE IDLE FREEZE PROVEN ON THE REAL CLI (heavy, run ALONE). The REAL keeper launches ONE
// named-profile browser on the hidden-window rung (no desktop: no DISPLAY, a PRIVATE XDG_RUNTIME_DIR + HOME — the browser
// CLI starts its own Xvfb), two conversations hold it (a window each — lane browser-windows), the REAL routes + dialog
// watch + live-view bridge + the shipped `vibespace-browser` drive the installed agent-browser (0.38.1) on a loopback page
// that never stops drawing (a 60 fps chart + a WebGL cube; every rAF instant kept in the page). The keeper's own tick
// (5 s) runs the sweep; `browser.idlePaintFreeze` ON:
//   a  no viewer, no verb for 30 s ⇒ the keeper's journal says the browser stopped drawing and the GPU process's ticks
//      over 5 s ≈ 0 (Chrome's own pids — SystemInfo.getProcessInfo);
//   b  the next `vibespace-browser screenshot` thaws BEFORE it runs: its picture is not blank (pixel census) and the page's
//      first frame lands within ONE frame of the verb's /resolve answer (no frame at all while frozen);
//   c  a live view attaching thaws (the bridge's viewer count → the keeper): frames reach the view;
//   d  an alert on the frozen page (the agent's click) still reaches the dialog watch within its bound (1 s);
//   e  TWO conversations, ONE browser: a thaw for A never creates a tab in B's window (every page target Chrome creates
//      during A's thaws, its window read at birth — the red cell), no stray afterwards (Chrome's targets, both
//      conversations' own `tab list`), B's next verb runs on B's page, one window per holder (windowCensus);
//   f  CONTROL — the switch turned OFF on the same browser: 60 s with nobody ⇒ never frozen, the GPU still draws.
// SKIPs with evidence without the binary / Xvfb / Chrome. Zero vendor calls; ends every process this run's root started.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const express = require('express');
const { WebSocket } = require('ws');
const K = require('../src/server/browser-keeper.js'), Ff = require('../src/browser-facts.js'), D = require('../src/server/browser-dialogs.js');
const R = require('../src/routes/browser.js'), S = require('../src/browser-stream.js'), VP = require('../src/server/browser-viewport.js');
const WIN = require('../src/browser-windows.js'), BI = require('../src/browser-idle.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1200) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const done = () => { console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed, ${skipped} skipped)` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`); process.exit(fail ? 1 : 0); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, step = 50) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_') && !['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE'].includes(k)));
const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let ver = null; try { ver = REAL_AB ? execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 8000, env: BASE_ENV }).trim() : null; } catch { /* none */ }
if (!ver) { skip(`no real agent-browser resolves on PATH past the shim (PATH=${BASE_ENV.PATH || ''})`); done(); }
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
  const tIdle = Date.now();
  const fz1 = await waitFrozen(1);
  const fz1At = fz1 ? frozenLines()[0].at : 0;
  const g1 = fz1 ? await gpuPct(spy, 5) : { pct: NaN };
  ok(!!fz1 && fz1At - tIdle >= BI.IDLE_PAINT_MS - 1000 && g1.pct <= 3 && busy.pct >= 20, `a: the keeper's journal says it stopped drawing ${Math.round((fz1At - tIdle) / 100) / 10} s after the last verb; the GPU process over 5 s: ${g1.pct} % (was ${busy.pct} %)`, { journal: journal.slice(-4), facts: facts() });

  // ── b ──
  console.log('— b: the next verb (a screenshot) thaws before it runs');
  const rMark = resolves.length, bornB = spy.born.length;
  const shot = path.join(ROOT, 'a.png');
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

  // ── f ──
  console.log('— f: CONTROL — the switch OFF on the same browser');
  SET['browser.idlePaintFreeze'] = false;
  const nF = frozenLines().length;
  await A(['get', 'title']); // the last verb (and a thaw if anything was frozen)
  await sleep(55000);
  const gF = await gpuPct(spy, 5);
  ok(frozenLines().length === nF && facts() && !facts().frozen && gF.pct >= 20, `f: 60 s with nobody and the switch OFF ⇒ never frozen (the keeper reads it at each sweep); the GPU still draws at ${gF.pct} %`, { lines: frozenLines().length - nF, facts: facts() });
} catch (e) { if (!/^no browser$/.test(String(e && e.message))) ok(false, 'the run threw', String(e && e.stack)); }
finally { try { spy?.close(); } catch { /* */ } try { dialogs.shutdown(); kk.shutdown(); } catch { /* */ } srv.close(); pages.close(); cleanup(); }
done();

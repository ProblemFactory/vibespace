#!/usr/bin/env node
// THE HIDDEN WINDOW'S COST, MEASURED (lane browser-swiftshader-cpu, 2026-10-07 — userW inc-muyp9vj6-tv0m: the hidden-window
// browser of one conversation drew Mercury's payments dashboard with its GPU process at 938 % CPU on 16 SwiftShader worker
// threads, the shared browser hung for 9 conversations). NOT a test-*.mjs, no tier (the measure-browser-windows.mjs shape):
// the REAL agent-browser on the CLI's own invisible Xvfb (headed, no DISPLAY) in a scratch HOME / XDG_RUNTIME_DIR under
// /tmp/vs-hwc-<pid>, a loopback synthetic page that never stops drawing (a 60 fps canvas chart + a CSS animation + a
// same-origin iframe + a small WebGL cube), and for each flag set:
//
//   a  today's rung (B-cc68): --ozone-platform=x11 + --use-angle=swiftshader --enable-unsafe-swiftshader
//   b  a + --disable-gpu-rasterization        c  a + --disable-gpu-compositing        d  b + c
//   e  the SwiftShader pair absent (--ozone-platform=x11 alone: no WebGL on an Xvfb)
//
// over SECS (20) seconds: the GPU process's CPU (utime + stime of /proc/<pid>/task/*/stat, the busiest thread names), the
// browser main's, the renderers', the page's frames (rAF ticks), WebGL in the page (B-cc68's probe) and Chrome's own
// featureStatus (SystemInfo.getInfo). Then, on IDLE=<set> (default the set the rung ships), the idle acts: for each of
// Page.setWebLifecycleState frozen (every page target) / Browser.setWindowBounds minimized / Emulation.setFocusEmulationEnabled
// false — the GPU process's CPU and the page's frames over 10 s under the act, and the time from its undo to the page's next
// frame. `WT=<checkout> [SETS=a,b,c,d,e] [SECS=20] [IDLE=d] node scripts/measure-hidden-window-cpu.mjs [out.json]`; zero
// vendor calls; the scratch root, the daemons, the Xvfb and the Chrome it started are ended on exit (by this run's root).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const WT = process.env.WT || new URL('..', import.meta.url).pathname;
const Ff = require(path.join(WT, 'src/browser-facts.js'));
const D = require(path.join(WT, 'src/browser-display.js'));
const { WebSocket } = require(path.join(WT, 'node_modules/ws'));
const OUT = process.argv[2] || null;
const SECS = Math.max(2, Number(process.env.SECS) || 20);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HZ = (() => { try { return Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim()) || 100; } catch { return 100; } })();
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && k !== 'DISPLAY' && k !== 'WAYLAND_DISPLAY'));
{ // the CLI itself, past the VibeSpace shim (data/bin first on a session's PATH) — the product's own resolver
  const real = (() => { try { return Ff.binaryResolver('agent-browser', process.env)(); } catch { return null; } })();
  if (real) BASE_ENV.PATH = `${path.dirname(real)}:${BASE_ENV.PATH || ''}`;
}
let ver = null; try { ver = execFileSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 8000, env: BASE_ENV }).trim(); } catch { /* none */ }
if (!ver || /driven by VibeSpace/.test(ver)) { console.log('SKIP: agent-browser is not runnable here'); process.exit(0); }
const hasXvfb = ['/usr/bin/Xvfb', '/usr/local/bin/Xvfb'].some((p) => fs.existsSync(p));
if (!hasXvfb) { console.log('SKIP: no Xvfb here (the hidden window is the CLI\'s own Xvfb)'); process.exit(0); }

const ROOT = scratch('hwc');
fs.rmSync(ROOT, { recursive: true, force: true });
const KH = path.join(ROOT, 'h'), KXD = path.join(ROOT, 'x');
for (const d of [path.join(KH, '.agent-browser'), KXD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
let cleaned = false;
function cleanup() {
  if (cleaned) return; cleaned = true;
  try { endRootedProcesses(ROOT); } catch { /* none */ }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* next run */ }
}
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { cleanup(); process.exit(130); });

// ── the page: never stops drawing (the Mercury dashboard's shape — a chart, an animation, an iframe, a WebGL canvas) ──
const PORT = await freePort();
const CUBE = `(function(){const c=document.getElementById('gl');const gl=c.getContext('webgl');window.__webgl=!!gl;if(!gl)return;
const vs='attribute vec3 p;uniform float t;varying vec3 col;void main(){float s=sin(t),k=cos(t);vec3 q=vec3(p.x*k-p.z*s,p.y,p.x*s+p.z*k);q=vec3(q.x,q.y*k-q.z*s,q.y*s+q.z*k);col=p*.5+.5;gl_Position=vec4(q*.5,1.);}';
const fs='precision mediump float;varying vec3 col;void main(){gl_FragColor=vec4(col,1.);}';
const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o};const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);gl.useProgram(pr);
const v=[];const f=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];for(const n of f){const a=n.map(Math.abs),u=[a[1],a[2],a[0]],w=[a[2],a[0],a[1]];const P=(i,j)=>n.map((x,m)=>x+i*u[m]+j*w[m]);v.push(...P(-1,-1),...P(1,-1),...P(1,1),...P(-1,-1),...P(1,1),...P(-1,1));}
const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.STATIC_DRAW);const l=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,3,gl.FLOAT,false,0,0);gl.enable(gl.DEPTH_TEST);
const tu=gl.getUniformLocation(pr,'t');(function d(ts){gl.clearColor(.1,.1,.1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(tu,ts/700);gl.drawArrays(gl.TRIANGLES,0,36);requestAnimationFrame(d);})(0);})();`;
const CHART = `(function(){const c=document.getElementById('ch');const x=c.getContext('2d');const pts=[];window.__raf=0;
window.__ticks=[];(function d(t){window.__raf++;window.__ticks.push(t);if(window.__ticks.length>6000)window.__ticks.splice(0,1000);pts.push(50+40*Math.sin(window.__raf/9)+Math.random()*20);if(pts.length>240)pts.shift();x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
x.strokeStyle='#2a6';x.lineWidth=2;x.beginPath();pts.forEach((y,i)=>i?x.lineTo(i*4,c.height-y*2):x.moveTo(0,c.height-y*2));x.stroke();x.fillStyle='#246';x.font='14px sans-serif';x.fillText('balance '+(1e6+window.__raf).toLocaleString(),10,20);requestAnimationFrame(d);})();})();`;
const PAGE = `<!doctype html><title>HWC synthetic dashboard</title><style>body{margin:0;font:14px sans-serif}#sp{width:40px;height:40px;border:6px solid #ccc;border-top-color:#36c;border-radius:50%;animation:r .8s linear infinite;margin:8px}@keyframes r{to{transform:rotate(360deg)}}
.bar{height:12px;background:linear-gradient(90deg,#eee,#9cf,#eee);background-size:200% 100%;animation:sh 1.2s linear infinite;margin:6px}@keyframes sh{from{background-position:200% 0}to{background-position:-200% 0}}</style>
<div id=sp></div><canvas id=ch width=960 height=240></canvas><canvas id=gl width=240 height=240></canvas><div class=bar></div><div class=bar></div>
<iframe src="/frame" width=600 height=160></iframe><script>${CHART}${CUBE}</script>`;
const FRAME = `<!doctype html><style>body{margin:0}.b{height:20px;margin:4px;background:#fc9;animation:w 1s ease-in-out infinite alternate}@keyframes w{from{width:10%}to{width:90%}}</style><div class=b></div><div class=b></div><p id=t>0</p>
<script>let n=0;(function f(){document.getElementById('t').textContent='tick '+(++n);requestAnimationFrame(f)})();</script>`;
const srv = http.createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(req.url === '/frame' ? FRAME : PAGE); }).listen(PORT, '127.0.0.1');
const URL0 = `http://127.0.0.1:${PORT}/`;

// ── the flag sets ──
const OZ = '--ozone-platform=x11';
const SW = [...D.SOFTWARE_GL_ARGS_B_CC68 || ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']];
const SETS = {
  a: [OZ, ...SW], b: [OZ, ...SW, '--disable-gpu-rasterization'], c: [OZ, ...SW, '--disable-gpu-compositing'],
  d: [OZ, ...SW, '--disable-gpu-rasterization', '--disable-gpu-compositing'], e: [OZ],
};
if (Array.isArray(D.HIDDEN_WINDOW_ARGS)) SETS.shipped = [OZ, ...D.HIDDEN_WINDOW_ARGS];
// lane browser-swiftshader-cpu-r2 ADDENDUM (the owner: "chrome 有一些参数是给低性能设备用的，能开吗") — each candidate ON TOP of
// the shipped set, and their union; `TABS=9` opens that many tabs of the page (the shared profile browser's shape) for
// the process-count knob. A flag joins HIDDEN_WINDOW_ARGS only for ≥ 10 % less CPU or ≥ 15 % less memory, WebGL + 2D kept.
const LOW_END = { le: ['--enable-low-end-device-mode'], c2d: ['--disable-accelerated-2d-canvas'], nss: ['--disable-smooth-scrolling'], dsf1: ['--force-device-scale-factor=1'], rpl: ['--renderer-process-limit=4', '--process-per-site'], bfc: ['--disable-features=BackForwardCache'] };
if (SETS.shipped) { for (const [k, v] of Object.entries(LOW_END)) SETS[k] = [...SETS.shipped, ...v]; SETS.union = [...SETS.shipped, ...Object.values(LOW_END).flat()]; }
const TABS = Math.max(1, Number(process.env.TABS) || 1);
const PICK = (process.env.SETS || Object.keys(SETS).join(',')).split(',').map((s) => s.trim()).filter((s) => SETS[s]);

function ab(session, args, { timeout = 60000, extra = [] } = {}) {
  const t0 = Date.now();
  return new Promise((resolve) => execFile('agent-browser', ['--session', session, ...extra, ...args], { env: kenv, encoding: 'utf8', timeout }, (err, so, se) => resolve({ ok: !err, ms: Date.now() - t0, out: (String(so || '') + String(se || '')).trim() })));
}
const procs = () => fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).map(Number);
async function chromeOf(c) { // this browser's processes by role, from Chrome itself (its processes are not dumpable: no fd / environ)
  const out = { browser: [], gpu: [], renderer: [], other: [] };
  const { processInfo } = await c.send('SystemInfo.getProcessInfo');
  for (const x of processInfo) (x.type === 'browser' ? out.browser : x.type === 'GPU' ? out.gpu : x.type === 'renderer' ? out.renderer : out.other).push(x.id);
  return out;
}
function threads(pid) { // name → ticks, for every thread of pid
  const m = new Map();
  let ts = []; try { ts = fs.readdirSync(`/proc/${pid}/task`); } catch { return m; }
  for (const t of ts) {
    try { const st = fs.readFileSync(`/proc/${pid}/task/${t}/stat`, 'latin1'); const name = st.slice(st.indexOf('(') + 1, st.lastIndexOf(')')); const f = st.slice(st.lastIndexOf(')') + 2).split(' '); m.set(`${t}:${name}`, Number(f[11]) + Number(f[12])); } catch { /* gone */ }
  }
  return m;
}
const snap = (pids) => new Map(pids.map((p) => [p, threads(p)]));
/** Σ memory of a process set: Pss (smaps_rollup) where readable, else VmRSS (Chrome's processes may not be dumpable). */
function memOf(pids) {
  let pss = 0, rss = 0, anon = 0, pssOk = true;
  for (const pid of pids) {
    try { const m = fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8').match(/^Pss:\s+(\d+) kB/m); if (m) pss += Number(m[1]); else pssOk = false; } catch { pssOk = false; }
    try { const st = fs.readFileSync(`/proc/${pid}/status`, 'utf8'); const m = st.match(/^VmRSS:\s+(\d+) kB/m); if (m) rss += Number(m[1]); const a = st.match(/^RssAnon:\s+(\d+) kB/m); if (a) anon += Number(a[1]); } catch { /* gone */ }
  }
  const anonMib = Math.round(anon / 1024); // ΣRssAnon: the private-ish share (ΣRSS counts every shared page once per process)
  return pssOk ? { metric: 'ΣPss', mib: Math.round(pss / 1024), rssMib: Math.round(rss / 1024), anonMib } : { metric: 'ΣRSS', mib: Math.round(rss / 1024), rssMib: Math.round(rss / 1024), anonMib };
}
function cost(a, b, secs) { // → {pct, top:[{name, n, pct}]}
  let total = 0; const byName = new Map();
  for (const [pid, t1] of b) {
    const t0 = a.get(pid) || new Map();
    for (const [k, v] of t1) { const d = v - (t0.get(k) || 0); if (d <= 0) continue; total += d; const name = k.split(':').slice(1).join(':').replace(/\d+/g, 'N'); const e = byName.get(name) || { name, n: 0, ticks: 0 }; e.n++; e.ticks += d; byName.set(name, e); }
  }
  const pct = (ticks) => Math.round((ticks / HZ / secs) * 1000) / 10;
  return { pct: pct(total), top: [...byName.values()].sort((x, y) => y.ticks - x.ticks).slice(0, 3).map((e) => ({ name: e.name, n: e.n, pct: pct(e.ticks) })) };
}

// ── a raw CDP client (the browser endpoint, flattened page sessions) ──
function cdp(url) {
  const ws = new WebSocket(url, { perMessageDeflate: false });
  let id = 0; const wait = new Map();
  ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && wait.has(m.id)) { const w = wait.get(m.id); wait.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); } });
  const ready = new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => { if (wait.has(i)) { wait.delete(i); rej(new Error(`${method}: timeout`)); } }, 15000); });
  return { ready, send, close: () => ws.close() };
}
async function pageOf(c) {
  const { targetInfos } = await c.send('Target.getTargets');
  const t = targetInfos.find((x) => x.type === 'page' && x.url.startsWith(URL0));
  if (!t) throw new Error('the synthetic page is not a target');
  const { sessionId } = await c.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const ev = async (expression) => (await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
  return { targetId: t.targetId, sessionId, ev, pages: targetInfos.filter((x) => x.type === 'page') };
}
const nextFrameMs = `new Promise((r)=>{const t=performance.now();requestAnimationFrame(()=>r(Math.round(performance.now()-t)))})`;

const report = { measured: new Date().toISOString(), agentBrowser: ver, secs: SECS, hz: HZ, cores: (await import('node:os')).cpus().length, sets: {}, idle: null };
console.log(`agent-browser ${ver}; ${report.cores} cores; ${SECS} s per set; root ${ROOT}`);

async function launch(name) {
  const session = `hwc-${name}`;
  const r = await ab(session, ['open', URL0], { extra: ['--headed', '--args', SETS[name].join(',')] });
  if (!r.ok) throw new Error(`open (${name}): ${r.out.slice(0, 300)}`);
  const u = await ab(session, ['get', 'cdp-url']);
  const ws = (u.out.match(/ws:\/\/\S+/) || [])[0];
  if (!ws) throw new Error(`cdp-url (${name}): ${u.out.slice(0, 200)}`);
  const c = cdp(ws); await c.ready;
  return { session, c, port: Number(new URL(ws).port) };
}
async function measureSet(name) {
  const { session, c, port } = await launch(name);
  const p = await pageOf(c);
  await sleep(3000); // warm
  const ch = await chromeOf(c);
  if (!ch.gpu.length) throw new Error('no GPU process found');
  const exe = (() => { try { return fs.readlinkSync(`/proc/${ch.browser[0]}/exe`); } catch { return null; } })();
  let chromeVer = null; try { chromeVer = (await c.send('Browser.getVersion')).product; } catch { /* none */ }
  let feature = null; try { feature = (await c.send('SystemInfo.getInfo')).gpu.featureStatus; } catch (e) { feature = { error: e.message }; }
  const argv = (() => { try { return fs.readFileSync(`/proc/${ch.browser[0]}/cmdline`, 'utf8').split('\0').filter((a) => a.startsWith('--') && !a.startsWith('--user-data-dir') && !a.startsWith('--remote-debugging')); } catch { return []; } })();
  const webgl = await p.ev(`(()=>{const c=document.createElement('canvas');return !!(c.getContext('webgl')||c.getContext('experimental-webgl'))})()`);
  const vis = await p.ev('document.visibilityState');
  const all = [...ch.browser, ...ch.gpu, ...ch.renderer, ...ch.other];
  const canvas2d = await p.ev(`(()=>{const c=document.createElement('canvas');const x=c.getContext('2d');if(!x)return false;x.fillStyle='#f00';x.fillRect(0,0,2,2);return x.getImageData(0,0,1,1).data[0]===255})()`);
  for (let i = 1; i < TABS; i++) await c.send('Target.createTarget', { url: URL0, background: true }); // the other conversations' tabs (background, as in a shared browser)
  if (TABS > 1) { await c.send('Target.activateTarget', { targetId: p.targetId }); await sleep(3000); }
  const ch2 = TABS > 1 ? await chromeOf(c) : ch; const all2 = [...ch2.browser, ...ch2.gpu, ...ch2.renderer, ...ch2.other];
  const r0 = await p.ev('window.__raf'); const s0 = snap(all2); const t0 = Date.now();
  await sleep(SECS * 1000);
  const s1 = snap(all2); const secs = (Date.now() - t0) / 1000; const r1 = await p.ev('window.__raf');
  const pick = (pids) => cost(new Map([...s0].filter(([k]) => pids.includes(k))), new Map([...s1].filter(([k]) => pids.includes(k))), secs);
  const mem = memOf(all2);
  // a page of ANOTHER conversation on the same site: does a busy page (a 3 s script loop in the front tab) stall it? (one
  // renderer main thread per process — what --process-per-site would share between conversations)
  let crossBlockMs = null;
  if (TABS > 1) {
    const other = (await c.send('Target.getTargets')).targetInfos.find((x) => x.type === 'page' && x.url.startsWith(URL0) && x.targetId !== p.targetId);
    if (other) {
      const os = (await c.send('Target.attachToTarget', { targetId: other.targetId, flatten: true })).sessionId;
      c.send('Runtime.evaluate', { expression: 'const __t=Date.now();while(Date.now()-__t<3000){}1', returnByValue: true }, p.sessionId).catch(() => { });
      await sleep(200); const t0b = Date.now();
      try { await c.send('Runtime.evaluate', { expression: '1', returnByValue: true }, os); crossBlockMs = Date.now() - t0b; } catch (e) { crossBlockMs = `error ${e.message}`; }
      await sleep(3200);
    }
  }
  const row = { args: SETS[name], chrome: chromeVer, exe, webgl, canvas2d, tabs: TABS, procs: all2.length, renderersN: ch2.renderer.length, visibility: vis, gpu: pick(ch2.gpu), browser: pick(ch2.browser), renderers: pick(ch2.renderer), all: pick(all2), mem, crossBlockMs, fps: Math.round((r1 - r0) / secs), featureStatus: feature, argv };
  report.sets[name] = row;
  console.log(`${name.padEnd(8)} ALL ${String(row.all.pct).padStart(6)} %  ${mem.metric} ${mem.mib} MiB, ΣRssAnon ${mem.anonMib} MiB, another same-site tab answers in ${crossBlockMs ?? '-'} ms during a 3 s loop (${row.procs} procs, ${row.renderersN} renderers, ${TABS} tab(s))  2d ${canvas2d} 2d_canvas ${feature?.['2d_canvas']}`);
  console.log(`${name.padEnd(8)} gpu ${String(row.gpu.pct).padStart(6)} %  browser ${String(row.browser.pct).padStart(5)} %  renderers ${String(row.renderers.pct).padStart(5)} %  fps ${String(row.fps).padStart(3)}  webgl ${webgl}  raster ${feature?.rasterization}  compositing ${feature?.gpu_compositing}  top ${row.gpu.top.map((t) => `${t.name}×${t.n} ${t.pct}%`).join(', ')}`);
  return { session, c, p, ch };
}
async function closeSet({ session, c }) {
  try { c.close(); } catch { /* none */ }
  await ab(session, ['close'], { timeout: 20000 });
  await sleep(500);
}

for (const name of PICK) {
  let h = null;
  try { h = await measureSet(name); } catch (e) { report.sets[name] = { error: e.message }; console.log(`${name}: ERROR ${e.message}`); }
  if (h) await closeSet(h);
}

// ── the idle acts: each (act, undo) on a FRESH launch; frames counted from the page's own rAF log after the undo ──
const IDLE = process.env.IDLE === '' ? null : (process.env.IDLE || (SETS.shipped ? 'shipped' : 'a'));
const evT = (p, expr, ms = 3000) => Promise.race([p.ev(expr), sleep(ms).then(() => { throw new Error(`no answer in ${ms} ms`); })]);
if (IDLE && SETS[IDLE]) {
  const ACT_SECS = Math.min(SECS, 10);
  const lifecycle = (state) => async (h) => { for (const s of h.pageSessions) await h.c.send('Page.setWebLifecycleState', { state }, s); };
  const bounds = (windowState) => async (h) => h.c.send('Browser.setWindowBounds', { windowId: h.win, bounds: { windowState } });
  const focus = (enabled) => async (h) => h.c.send('Emulation.setFocusEmulationEnabled', { enabled }, h.p.sessionId);
  const activate = async (h) => h.c.send('Target.activateTarget', { targetId: h.p.targetId });
  const front = async (h) => h.c.send('Page.bringToFront', {}, h.p.sessionId);
  const shot = async (h) => h.c.send('Page.captureScreenshot', { format: 'jpeg', quality: 10 }, h.p.sessionId);
  const cast = async (h) => { await h.c.send('Page.startScreencast', { format: 'jpeg', quality: 10, everyNthFrame: 1 }, h.p.sessionId); await sleep(200); await h.c.send('Page.stopScreencast', {}, h.p.sessionId); };
  const blank = async (h) => { h.blank = (await h.c.send('Target.createTarget', { url: 'about:blank' })).targetId; };
  const unblank = async (h) => { await h.c.send('Target.closeTarget', { targetId: h.blank }); await h.c.send('Target.activateTarget', { targetId: h.p.targetId }); };
  const seq = (...fs) => async (h) => { for (const f of fs) await f(h); };
  const ACTS = (process.env.ACTS || 'none,frozen>active,frozen>active+activate,frozen>active+front,frozen>active+cycle,frozen>active+shot,frozen>active+cast,frozen>active+blank+unblank,blank>unblank,minimized>normal,focusOff>focusOff').split(',');
  const OPS = { none: async () => { }, frozen: lifecycle('frozen'), active: lifecycle('active'), activate, front, shot, cast, blank, unblank, cycle: seq(bounds('minimized'), bounds('normal')), minimized: bounds('minimized'), normal: bounds('normal'), focusOff: focus(false), focusOn: focus(true) };
  const run = (spec) => seq(...spec.split('+').map((k) => { if (!OPS[k]) throw new Error(`unknown op ${k}`); return OPS[k]; }));
  report.idle = { set: IDLE, secs: ACT_SECS, acts: {} };
  for (const spec of ACTS) {
    const [on, off] = spec.split('>'); const row = { act: on, undo: off || null };
    let h = null;
    try {
      const { session, c, port } = await launch(IDLE); const p = await pageOf(c); await sleep(3000);
      const ch = await chromeOf(c); const win = (await c.send('Browser.getWindowForTarget', { targetId: p.targetId })).windowId;
      const pageSessions = []; for (const t of p.pages) pageSessions.push(t.targetId === p.targetId ? p.sessionId : (await c.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).sessionId);
      h = { session, c, p, win, pageSessions };
      const pn0 = await p.ev('performance.now()');
      await run(on)(h); await sleep(1000);
      const s0 = snap(ch.gpu); const t0 = Date.now();
      await sleep(ACT_SECS * 1000);
      const s1 = snap(ch.gpu); const secs = (Date.now() - t0) / 1000;
      row.gpu = cost(s0, s1, secs);
      const tOff = Date.now();
      if (off) await run(off)(h);
      try { row.firstFrameMs = await evT(p, nextFrameMs); row.resumeMs = Date.now() - tOff; } catch (e) { row.resume = e.message; }
      try {
        row.framesDuring = await evT(p, `window.__ticks.filter((t)=>t>${pn0 + 1000}&&t<${pn0 + 1000 + secs * 1000}).length`);
        row.vis = await evT(p, 'document.visibilityState');
        await sleep(1000); row.fpsAfter = await evT(p, `window.__ticks.filter((t)=>t>performance.now()-1000).length`);
      } catch (e) { row.after = e.message; }
    } catch (e) { row.error = e.message; }
    report.idle.acts[spec] = row;
    console.log(`idle ${IDLE} ${spec.padEnd(26)} gpu ${String(row.gpu?.pct ?? '?').padStart(6)} %  frames in ${ACT_SECS} s ${row.framesDuring ?? '?'}  undo → next frame ${row.resumeMs ?? row.resume ?? '?'}${row.resumeMs != null ? ' ms' : ''}  vis ${row.vis ?? '?'}  fps after ${row.fpsAfter ?? '?'}${row.error ? '  ERROR ' + row.error : ''}${row.after ? '  (' + row.after + ')' : ''}`);
    if (h) await closeSet(h);
  }
}
srv.close();
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.sets).map(([k, v]) => [k, v.featureStatus])), null, 0).slice(0, 2000));
process.exit(0);

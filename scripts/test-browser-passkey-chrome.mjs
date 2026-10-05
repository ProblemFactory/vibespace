#!/usr/bin/env node
// LANE BROWSER-PASSKEY-CHROME (2026-10-05, the heavy leg of lane browser-passkey — owner inc-muuvthv9-g69w) — THE REAL
// LEG (heavy, run ALONE): the REAL keeper launches ONE profile browser on the HIDDEN-WINDOW rung (no desktop in the env,
// Xvfb on the PATH ⇒ a normal Chrome window on its own Xvfb — where Chrome's native WebAuthn window really opens) in a
// scratch HOME + a private XDG_RUNTIME_DIR; the REAL routes + the REAL dialog watch (the passkey hook) + the shipped
// `vibespace-browser` CLI drive the installed agent-browser 0.38.1 against loopback pages served as http://localhost
// (rpId localhost — a secure context):
//   (a) a click starts navigator.credentials.get ⇒ the watch hears `start` (the binding still works after the hook's
//       `delete`); a verb issued before 3 s is woken at 3 s and the next `click` answers THE SENTENCE [passkey_open];
//       the live view's banner = the stuck fact + PURE passkeyWords: the title, ONE Cancel, the desktop note (headed)
//   (f) ONE For-you item after 20 s;  (b) `passkey cancel` ⇒ the page's catch reports AbortError within 1 s, Chrome's own
//       passkey window is GONE from the Xvfb (xdotool: before / during / after), the banner goes, the next `click` acts,
//       the For-you item resolves itself
//   (g) `credentials.get({password:true})` passes untouched (no record)
//   (e) runImmediately: a page whose inline script calls credentials.get at document start is hooked (same tab); a NEW
//       tab's first document is measured and said
//   (c) CONTROL 1: CDP WebAuthn virtual authenticator + a resident credential ⇒ `end ok`, the page says ok, no passkey_open
//   (d) CONTROL 2: a watch copy whose hook never arms (the Runtime.addBinding step removed) ⇒ `unknown`, no banner,
//       no verb woken
// SKIPs by name without the real agent-browser 0.38.1 or an Xvfb. Zero vendor calls, no real site; the scratch root, its
// daemons, Xvfbs and Chromes are ended by this run's own root.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, endRootedProcesses } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const express = require('express');
const Kk = require('../src/server/browser-keeper.js'), Ff = require('../src/browser-facts.js');
const D = require('../src/server/browser-dialogs.js');
const PK = require('../src/browser-passkey.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const say = (s) => console.log('    · ' + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, step = 20) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }
// no desktop in the launch env (the hidden-window rung needs none — and never the owner's); the world's `browser.headed`
// preference = a windowed browser asked for on a box with no desktop ⇒ the keeper's Xvfb (the no-desktop switch is OFF)
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_') && !['DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY'].includes(k)));
const ROOT = scratch('bpasskey-chrome');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { endRootedProcesses(ROOT); } catch { } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sg of ['SIGINT', 'SIGTERM']) process.on(sg, () => { cleanup(); process.exit(130); });
const done = () => { console.log(fail ? `\n${fail} FAILED (${pass} passed, ${skipped} skipped)` : `\nALL PASS (${pass}, ${skipped} skipped)`); process.exit(fail ? 1 : 0); };

const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let ver = null; try { ver = REAL_AB ? execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 8000, env: BASE_ENV }).trim() : null; } catch { }
if (!ver || !/\b0\.38\.1\b/.test(ver)) { skip(`test-browser-passkey-chrome: no real agent-browser 0.38.1 resolves past the shim (${REAL_AB || 'none'}: ${ver || 'no version'})`); done(); }
const XVFB = String(BASE_ENV.PATH || '').split(':').map((d) => path.join(d, 'Xvfb')).find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
if (!XVFB) { skip('test-browser-passkey-chrome: no Xvfb on the PATH — the hidden-window rung (where Chrome\'s own passkey window opens) needs one'); done(); }
console.log(`agent-browser: ${REAL_AB} (${ver}); Xvfb: ${XVFB}`);

// ── the pages (loopback, served as localhost): every outcome is written into the DOM AND reported here with its time ──
const LOG = [];
const last = (t, k, after = 0) => [...LOG].reverse().find((x) => x.t === t && x.k === k && x.at >= after) || null;
const CALL = "navigator.credentials.get({publicKey:{challenge:new Uint8Array(32),rpId:'localhost',timeout:60000,userVerification:'preferred'}})";
const PAGE = (tag) => `<!doctype html><title>PK ${tag}</title><button id=go onclick="pk()">passkey</button><button id=pw onclick="pw()">password</button><button id=n onclick="rep('n',++window.__n)">next</button><div id=out>-</div><div id=cnt>0</div>
<script>window.__n=0;function rep(k,v){document.getElementById(k==='n'?'cnt':'out').textContent=String(v);fetch('/r?t=${tag}&k='+k+'&v='+encodeURIComponent(v)).catch(function(){});}
function pk(){rep('pk','started');${CALL}.then(function(){rep('pk','ok');},function(e){rep('pk',(e&&e.name)||'Error');});}
function pw(){navigator.credentials.get({password:true}).then(function(c){rep('pw','ok:'+(c===null?'null':typeof c));},function(e){rep('pw',(e&&e.name)||'Error');});}</script>`;
const EARLY = (tag) => `<!doctype html><title>PK ${tag}</title><script>${CALL}.then(function(){fetch('/r?t=${tag}&k=pk&v=ok');},function(e){fetch('/r?t=${tag}&k=pk&v='+((e&&e.name)||'Error'));});</script><div id=out>${tag}</div>`;
const pages = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/r') { LOG.push({ at: Date.now(), t: u.searchParams.get('t'), k: u.searchParams.get('k'), v: u.searchParams.get('v') }); res.writeHead(204); return res.end(); }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (u.pathname.startsWith('/early')) return res.end(EARLY(u.pathname.slice(1)));
  return res.end(PAGE(u.pathname.slice(1) || 'pk'));
});
const PORT = await freePort(); await new Promise((r) => pages.listen(PORT, '127.0.0.1', r));
const U = (p) => `http://localhost:${PORT}${p}`;

// ── the hook's own reports (start / end + outcome), as the watch parses them: the shared PURE module, observed ──
const SEEN = [];
const realApply = PK.applyEvent;
PK.applyEvent = (recs, ev, o) => { SEEN.push({ at: Date.now(), ...ev }); return realApply(recs, ev, o); };
const FY = { adds: [], resolves: [] };
const forYou = { add: (pid, item) => { const id = 'fy-' + (FY.adds.length + 1); FY.adds.push({ at: Date.now(), pid, item, id }); return id; }, resolve: (id) => { FY.resolves.push({ at: Date.now(), id }); } };

const MUT = mutantCopies('bpasskey-chrome', REPO);
async function world(tag, { Dmod = D } = {}) {
  const W = path.join(ROOT, tag);
  const KH = path.join(W, 'h'), KXD = path.join(W, 'x');
  for (const d of [path.join(KH, '.agent-browser'), KXD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
  const KEY = tag === 'ctl' ? 'bk-0000c7a1' : 'bk-0000d7a1';
  const live = new Set([KEY]);
  const kk = Kk.create({ dataDir: path.join(W, 'data'), homeDir: KH, env: () => kenv, serverSetting: (k) => (k === 'browser.headed' ? true : undefined), liveKeys: () => live, runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }), log: { log() { }, warn() { }, error() { } }, install: false, tickMs: 3600e3 });
  const prof = kk.createProfile({ label: 'Mail ' + tag }, { owner: { kind: 'instance', id: null } });
  const TOKEN = 'vsst_bpasskey_' + tag;
  const sessions = new Map([['sess-' + tag, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', _browserEnv: null, name: 'Chat ' + tag, cwd: W }]]);
  const events = [];
  const dialogs = Dmod.create({ keeper: kk, log: { warn() { }, log() { } }, leaseCountOf: () => 1, holdersOf: () => [], forYou, labelOf: () => 'Mail ' + tag });
  dialogs.onChange((e) => { if (e.kind === 'passkey') events.push({ at: Date.now(), state: e.state }); });
  kk.setStuckSource((bk) => dialogs.stuckForKey(bk));
  const R = require('../src/routes/browser.js');
  R.setup({ keeper: kk, activeSessions: sessions, dialogs, tasksForSession: () => [] });
  const app = express(); app.use(express.json()); app.use(R.router);
  const srv = http.createServer(app); const port = await freePort(); await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  await kk.attach({ profileId: prof.id, browserKey: KEY, sessionId: 'sess-' + tag, by: 'user' });
  const PASSWD = path.join(W, 'passwd.cjs'); fs.writeFileSync(PASSWD, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(KH)} });\n`);
  const env = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD, VIBESPACE_API: `http://127.0.0.1:${port}`, VIBESPACE_SESSION_TOKEN: TOKEN, VIBESPACE_SESSION_CWD: W };
  const cli = (args, { timeoutMs = 90000 } = {}) => new Promise((resolve) => {
    const t0 = Date.now(); const c = spawn(process.execPath, ['--require', PASSWD, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env, cwd: W });
    let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => c.kill('SIGKILL'), timeoutMs);
    c.on('exit', (code) => { clearTimeout(t); resolve({ code, out, err, at: t0, ms: Date.now() - t0, exitAt: Date.now() }); });
  });
  const cdpHttp = () => String(kk.browserOf(prof.id).cdpUrl || '').replace(/^ws/, 'http').replace(/\/devtools\/browser\/.*$/, '');
  const jsonList = () => new Promise((resolve) => http.get(cdpHttp() + '/json/list', (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve([]); } }); }).on('error', () => resolve([])));
  // the browser process this world launched (never a renderer; by its executable — Chrome rewrites its own cmdline): argv + env
  const chrome = () => { for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; try { if (!['chrome', 'chromium', 'chromium-browser'].includes(path.basename(fs.readlinkSync(`/proc/${d}/exe`)))) continue; const argv = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0'); if (argv.join(' ').includes('--type=')) continue; const e = Object.fromEntries(fs.readFileSync(`/proc/${d}/environ`, 'utf8').split('\0').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); if (e.HOME !== KH && !argv.some((a) => a.includes(W))) continue; return { pid: Number(d), argv, env: e }; } catch { } } return null; };
  const close = async () => { dialogs.shutdown(); kk.shutdown(); await new Promise((r) => srv.close(() => r())); };
  return { tag, kk, prof, KEY, cli, dialogs, events, jsonList, chrome, close };
}
/** The hidden window's X display: Chrome's environ is overwritten by its own title rewrite, so the display is read off
 *  the Xvfb its daemon started beside it (a sibling or an uncle of the browser process; 0.38.1 runs `Xvfb -displayfd`,
 *  so the number is the X socket that Xvfb listens on) + the `-auth` file it was given. */
const ppidOf = (pid) => { try { return Number(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\)\s+\S+\s+/, '').split(' ')[0]) || 0; } catch { return 0; } };
function xDisplayOf(c) {
  if (!c) return null;
  const up = new Set(); for (let q = ppidOf(c.pid), i = 0; q > 1 && i < 3; q = ppidOf(q), i++) up.add(q);
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      if (path.basename(fs.readlinkSync(`/proc/${d}/exe`)) !== 'Xvfb' || !up.has(ppidOf(Number(d)))) continue;
      const argv = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0');
      const inodes = new Set(fs.readdirSync(`/proc/${d}/fd`).map((f) => { try { return (fs.readlinkSync(`/proc/${d}/fd/${f}`).match(/^socket:\[(\d+)\]$/) || [])[1]; } catch { return null; } }).filter(Boolean));
      for (const l of fs.readFileSync('/proc/net/unix', 'utf8').split('\n')) { const f = l.trim().split(/\s+/); const m = inodes.has(f[6]) && /\/tmp\/\.X11-unix\/X(\d+)$/.exec(f[7] || ''); if (m) return { DISPLAY: ':' + m[1], ...(argv.includes('-auth') ? { XAUTHORITY: argv[argv.indexOf('-auth') + 1] } : {}), pid: Number(d) }; }
    } catch { }
  }
  return null;
}
/** The X display's visible top-level windows (xdotool — the Xvfb has no window manager, so no wmctrl). */
function xwins(x) {
  if (!x) return null;
  const xenv = { ...BASE_ENV, DISPLAY: x.DISPLAY, ...(x.XAUTHORITY ? { XAUTHORITY: x.XAUTHORITY } : {}) };
  let ids = [];
  try { ids = execFileSync('xdotool', ['search', '--onlyvisible', '--name', '.*'], { env: xenv, encoding: 'utf8', timeout: 5000 }).trim().split('\n').filter(Boolean); } catch (e) { if (e.status !== 1) return null; }
  return ids.map((id) => { let n = ''; try { n = execFileSync('xdotool', ['getwindowname', id], { env: xenv, encoding: 'utf8', timeout: 3000 }).trim(); } catch { } return n; });
}
/** Every window in the tree (mapped or not): id → its xwininfo line; and the root's pixels into a PNG (the record). */
function xtree(x) {
  if (!x) return null;
  const xenv = { ...BASE_ENV, DISPLAY: x.DISPLAY, ...(x.XAUTHORITY ? { XAUTHORITY: x.XAUTHORITY } : {}) };
  try { return new Map(execFileSync('xwininfo', ['-root', '-tree'], { env: xenv, encoding: 'utf8', timeout: 5000 }).split('\n').map((l) => l.trim()).filter((l) => /^0x[0-9a-f]+ /.test(l)).map((l) => [l.split(' ')[0], l])); } catch { return null; }
}
function xshot(x, file) { try { execFileSync('import', ['-window', 'root', file], { env: { ...BASE_ENV, DISPLAY: x.DISPLAY, ...(x.XAUTHORITY ? { XAUTHORITY: x.XAUTHORITY } : {}) }, timeout: 10000 }); return file; } catch { return null; } }
const SHOTS = process.env.PK_SHOTS || '';
/** MEASURED (this lane, 2026-10-05): 0.38.1's Chrome draws its passkey dialog TAB-MODAL — inside the browser window's own
 *  X window, no new X window (the tree is the same before / during / after) — with a grey scrim over the page. The
 *  measure is therefore the display's pixels: the mean grey of a page-body patch beside the dialog (white page: 255;
 *  under the scrim: ~102). The root shot lands in PK_SHOTS when set (the record), else in the scratch root. */
function scrimOf(x, tag) {
  const f = xshot(x, path.join(SHOTS || ROOT, tag + '.png'));
  try { return f ? Number(execFileSync('convert', [f, '-crop', '200x300+60+300', '-colorspace', 'Gray', '-format', '%[fx:round(mean*255)]', 'info:'], { encoding: 'utf8', timeout: 10000 }).trim()) : null; } catch { return null; }
}
const newIn = (a, b) => (a && b ? [...b].filter(([id]) => !a.has(id)).map(([, l]) => l) : null);
/** A CDP client on one page target (node's own WebSocket). */
async function cdpPage(w, re) {
  const t = (await w.jsonList()).find((x) => x.type === 'page' && re.test(x.url));
  if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(String(m.data)); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  return { send: (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }), close: () => ws.close() };
}
const HEAD = 'This page is waiting for a passkey (localhost).';
const starts = (after) => SEEN.filter((x) => x.ev === 'start' && x.at >= after);

try {
  let w = null;
  try { w = await world('lane'); } catch (e) { skip(`the keeper could not launch a browser here: ${e && e.message}`); }
  if (w) {
    const ch = w.chrome();
    const c = xDisplayOf(ch);
    const headless = !ch || ch.argv.join(' ').includes('--headless');
    ok(ch && !headless && c && /^:\d+$/.test(c.DISPLAY), `the browser is on the HIDDEN-WINDOW rung: a windowed Chrome on its daemon's own Xvfb (DISPLAY=${c && c.DISPLAY}, never the owner's)`, ch && ch.argv.join(' ').slice(0, 300));
    let r = await w.cli(['open', U('/pk')]);
    ok(r.code === 0, 'the agent opened the local passkey page', r);
    const before = xwins(c), treeB = xtree(c);
    say(`the Xvfb's windows before: ${JSON.stringify(before)} (${treeB && treeB.size} in the tree)`);
    const gB = scrimOf(c, 'before');
    // (a) the ceremony starts
    const t0 = Date.now();
    r = await w.cli(['click', '#go']);
    const st = await until(() => starts(t0)[0], 5000);
    ok(r.code === 0 && st && st.kind === 'get' && st.rpId === 'localhost', `(a) the agent's click starts navigator.credentials.get ⇒ the watch hears \`start\` (rpId localhost) ${st ? st.at - t0 : '?'} ms after the click — the binding works after the hook's \`delete\``, { r, SEEN });
    const s0 = st ? st.at : t0;
    // a verb issued before 3 s and still running at 3 s (`wait 10000` — an ACTING verb) is woken at 3 s by passkey_open;
    // a click meanwhile ACTS (measured: Chrome's own passkey window does not stop CDP input to the page)
    r = await w.cli(['click', '#n']);
    const n0 = await until(() => last('pk', 'n', s0), 2000);
    say(`a click before 3 s (the ceremony pending): exit ${r.code} in ${r.ms} ms, the page counted ${n0 && n0.v}`);
    const inflight = w.cli(['wait', '10000']);
    await until(() => Date.now() - s0 > 3600, 5000);
    const during = xwins(c), treeD = xtree(c);
    say(`the Xvfb's windows during: ${JSON.stringify(during)}; NEW in the tree: ${JSON.stringify(newIn(treeB, treeD))}`);
    const gD = scrimOf(c, 'during');
    ok(gB > 240 && gD < 160 && during && before && during.length === before.length, `(b) Chrome's OWN passkey dialog is up on the hidden display — tab-modal (${before && before.length} → ${during && during.length} X windows), the page under its scrim (grey ${gB} → ${gD})`, { before, during, gB, gD });
    const fl = await inflight;
    say(`the verb in flight (issued ${fl.at - s0} ms after start): exit ${fl.code} after ${fl.ms} ms; ${(fl.out + fl.err).replace(/\s+/g, ' ').slice(0, 160)}`);
    ok(fl.code !== 0 && /passkey_open/.test(fl.out + fl.err) && fl.exitAt - s0 >= 2900 && fl.exitAt - s0 < 4500, `(a) the verb in flight (\`wait 10000\`) is WOKEN at 3 s with [passkey_open] (${fl.exitAt - s0} ms after start)`, fl);
    r = await w.cli(['click', '#n']);
    ok(r.code !== 0 && (r.out + r.err).includes(HEAD) && /passkey_open/.test(r.out + r.err) && r.ms < 5000, `(a) the next \`click\` answers THE SENTENCE with [passkey_open] (${r.ms} ms) instead of acting`, r);
    const stuck = w.dialogs.stuckForKey(w.KEY);
    const words = stuck && stuck.state === 'passkey' ? PK.passkeyWords(stuck.passkey, null, { headed: stuck.headed === true }) : null;
    // the desktop note only where the window IS on a desktop (lane browser-passkey-chrome's fix: Chrome says it is headed
    // here, but its window — and the tab-modal dialog in it — is on the CLI's own Xvfb, which nobody sees)
    const rung = ((w.kk.browserOf(w.prof.id) || {}).display || {}).fallback;
    ok(words && words.title === HEAD.replace(/\.$/, '') && words.cancel && rung && rung.rung === 'hidden-window' && stuck.headed === false && words.desktop === '', `(a) the live view\'s banner: the stuck fact \`passkey\` ⇒ the title, ONE Cancel — and NO desktop note on the hidden-window rung (the keeper\'s display fact: ${rung && rung.rung})`, { stuck, words, rung });
    // (f) the For-you item after 20 s — ONE
    await until(() => FY.adds.length > 0, 22000, 100);
    await sleep(1200);
    const fy = FY.adds[0];
    ok(FY.adds.length === 1 && fy.at - s0 >= 20000 && fy.at - s0 < 21500 && /waiting for a passkey \(localhost\)/.test(fy.item.text), `(f) ONE For-you item ${fy ? fy.at - s0 : '?'} ms after start`, FY);
    r = await w.cli(['passkey', 'status']);
    say(`passkey status: exit ${r.code}; ${(r.out + r.err).replace(/\s+/g, ' ').slice(0, 200)}`);
    // (b) cancel
    const tc = Date.now();
    r = await w.cli(['passkey', 'cancel']);
    const ab = await until(() => last('pk', 'pk', tc), 3000);
    ok(r.code === 0 && ab && ab.v === 'AbortError' && ab.at - r.exitAt < 1000, `(b) \`passkey cancel\` ⇒ the page's catch reports AbortError ${ab ? ab.at - r.exitAt : '?'} ms after the verb returned (${ab ? ab.at - tc : '?'} ms after it started)`, { r, ab });
    const ended = await until(() => SEEN.find((x) => x.ev === 'end' && x.at >= tc), 2000);
    ok(ended && ended.outcome === 'cancelled' && ended.name === 'AbortError', '(b) the hook reports `end cancelled` (AbortError)', ended);
    const gA = await until(() => { const g = scrimOf(c, 'after'); return g > 240 ? g : null; }, 3000, 100);
    const after = xwins(c);
    say(`the Xvfb's windows after: ${JSON.stringify(after)}; NEW in the tree: ${JSON.stringify(newIn(treeB, xtree(c)))}`);
    ok(gA && after && after.length === before.length, `(b) Chrome's own passkey dialog is GONE after the cancel (grey ${gD} → ${gA}, ${after && after.length} X windows)`, { gA, after });
    const st2 = w.dialogs.stuckForKey(w.KEY);
    ok(!st2 || st2.state !== 'passkey', '(b) the banner goes (the stuck fact is no longer `passkey`)', st2);
    const fr = await until(() => FY.resolves.find((x) => x.id === fy.id), 2000);
    ok(!!fr, '(f) the For-you item resolved itself after the cancel', FY);
    const tn = Date.now();
    r = await w.cli(['click', '#n']);
    const nn = await until(() => last('pk', 'n', tn), 3000);
    ok(r.code === 0 && !!nn, `(b) the next \`click\` acts (the page counted ${nn && nn.v})`, r);
    // (g) password: untouched
    const tp = Date.now();
    r = await w.cli(['click', '#pw']);
    const pw = await until(() => last('pk', 'pw', tp), 5000);
    await sleep(300);
    ok(r.code === 0 && pw && /^ok:/.test(pw.v) && !starts(tp).length, `(g) credentials.get({password:true}) passes through untouched (${pw && pw.v}; no record)`, { pw, SEEN: starts(tp) });
    // (e) runImmediately: the inline script at document start — the same tab (an armed tab's next document)
    const te = Date.now();
    r = await w.cli(['open', U('/early-same')]);
    const es = await until(() => starts(te)[0], 5000);
    ok(es && es.rpId === 'localhost', `(e) a page calling credentials.get in an inline script at document start is hooked on the armed tab (start ${es ? es.at - te : '?'} ms after open)`, { r, SEEN: SEEN.slice(-3) });
    r = await w.cli(['passkey', 'cancel']);
    const ea = await until(() => last('early-same', 'pk', te), 3000);
    ok(ea && ea.v === 'AbortError', `(e) …and cancellable (${ea && ea.v})`, r);
    // (e) a NEW tab: the hook arms after the target appears — measured and said
    const tt = Date.now();
    r = await w.cli(['tab', 'new', U('/early-new')]);
    const ns = await until(() => SEEN.find((x) => x.ev === 'start' && x.at >= tt), 5000);
    say(`(e) a NEW tab's first document: ${ns ? `hooked (start ${ns.at - tt} ms after \`tab new\`)` : 'NOT hooked (no start)'}; tab new exit ${r.code}`);
    await sleep(3200);
    const nv = await w.cli(['passkey', 'status']);
    say(`(e) passkey status on it: ${(nv.out + nv.err).replace(/\s+/g, ' ').slice(0, 220)}`);
    if (ns) { r = await w.cli(['passkey', 'cancel']); const na = await until(() => last('early-new', 'pk', tt), 3000); ok(na && na.v === 'AbortError', `(e) the new tab's ceremony is cancellable (${na && na.v})`, r); }
    else ok(!/passkey_open/.test(nv.out + nv.err), '(e) a new tab\'s unhooked first document never reads passkey_open (the limit, said)', nv);
    // (c) CONTROL 1: a virtual authenticator holding a resident credential — the ceremony completes
    r = await w.cli(['open', U('/vauth')]);
    const cdp = await cdpPage(w, /\/vauth$/);
    if (!cdp) say(`CONTROL 1: no /vauth page target — open exit ${r.code} ${(r.out + r.err).replace(/\s+/g, ' ').slice(0, 200)}; targets ${JSON.stringify((await w.jsonList()).map((x) => x.type + ' ' + x.url))}`);
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const a1 = cdp && await cdp.send('WebAuthn.enable', { enableUI: false });
    const a2 = cdp && await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true } });
    const aid = a2 && a2.result && a2.result.authenticatorId;
    const a3 = aid && await cdp.send('WebAuthn.addCredential', { authenticatorId: aid, credential: { credentialId: Buffer.from('vs-passkey-control').toString('base64'), isResidentCredential: true, rpId: 'localhost', privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'), userHandle: Buffer.from('vs-user').toString('base64'), signCount: 0 } });
    ok(a1 && !a1.error && aid && a3 && !a3.error, 'CONTROL 1: WebAuthn.enable + addVirtualAuthenticator (ctap2, internal, UV) + a resident credential for localhost', { a1, a2, a3 });
    const tv = Date.now(); const ev0 = w.events.length;
    r = await w.cli(['click', '#go']);
    const vo = await until(() => last('vauth', 'pk', tv) && last('vauth', 'pk', tv).v !== 'started' ? last('vauth', 'pk', tv) : null, 8000);
    const ve = SEEN.find((x) => x.ev === 'end' && x.at >= tv);
    await sleep(3300);
    ok(vo && vo.v === 'ok' && ve && ve.outcome === 'ok' && !w.events.slice(ev0).some((e) => e.state === PK.PASSKEY_OPEN_CODE), `(c) CONTROL 1: the ceremony completes — \`end ok\`, the page says ${vo && vo.v}, never passkey_open`, { vo, ve, ev: w.events.slice(ev0) });
    if (cdp) cdp.close();
    await w.close();
  }
  // (d) CONTROL 2: the hook never armed
  const dsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
  const needle = "const r1 = await call(w, 'Runtime.addBinding', { name: w.pkBinding }, sid);";
  ok(dsrc.includes(needle), 'CONTROL 2: the addBinding step is where this suite removes it');
  const Dmut = MUT.load('src/server/browser-dialogs.js', dsrc.replace(needle, 'const r1 = null;'), 'no-arm');
  let wc = null;
  try { wc = await world('ctl', { Dmod: Dmut }); } catch (e) { skip(`CONTROL 2: the keeper could not launch a browser here: ${e && e.message}`); }
  if (wc) {
    let r = await wc.cli(['open', U('/ctl')]);
    const tk = Date.now();
    r = await wc.cli(['click', '#go']);
    const inflight = wc.cli(['wait', '5000']);
    await sleep(3600);
    const fl = await inflight;
    const s = await wc.cli(['passkey', 'status']);
    const st = wc.dialogs.stuckForKey(wc.KEY);
    ok(!starts(tk).length && /cannot see passkey requests/.test(s.out + s.err) && (!st || st.state !== 'passkey') && fl.code === 0 && fl.ms >= 4800 && !/passkey_open/.test(fl.out + fl.err) && !wc.events.length, `(d) CONTROL 2: a watch whose hook never armed ⇒ \`unknown\`, no banner, the verb in flight not woken (\`wait 5000\` exited ${fl.code} after ${fl.ms} ms)`, { s, st, fl, ev: wc.events });
    await wc.close();
  }
} catch (e) { ok(false, 'the suite threw', String(e && e.stack)); }
done();

#!/usr/bin/env node
// THE SHARED PICTURE VIEW (docs/design-desktop-apps.zh.md §6 row 5, P8-1,
// 2026-09-13): src/lib/vnc-view.js is the ONE noVNC surface — the DPI
// counter-zoom rule of inc-mtdrm922 (`zoom: calc(1 / var(--ui-scale, 1))` on
// the canvas container, NET zoom 1, never per-event math), the
// scaleViewport/resizeSession policy, the status transitions, clipboard and
// paste — and desktop-window.js, rewritten onto it, behaves BYTE FOR BYTE like
// the pre-extraction window. The control is the RETIRED FILE ITSELF
// (`git show <PRE_EXTRACTION_SHA>:src/lib/desktop-window.js` through the sanitized git env):
// every t() literal, every noVNC property write and every status transition
// it carried must now be carried by the component or by the caller, and no
// second copy of the noVNC surface may exist anywhere under src/lib/.
// Runs the REAL component under a tiny fake DOM with a fake RFB (no chrome,
// no network). Prerequisite: `npm run build` (build-version.js is generated).
// Run: node scripts/test-vnc-view.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { gitEnvFrom } from './git-env.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(path.join(repo, 'src/lib/build-version.js'))) { console.error('  ✗ src/lib/build-version.js missing — run `npm run build` first (the client modules import telemetry-client, which imports it)'); process.exit(1); }

// ── a fake DOM just wide enough for the component ──
class El {
  constructor(tag) { this.tagName = tag; this.style = {}; this.children = []; this.className = ''; this.textContent = ''; this.title = ''; this.disabled = false; this._listeners = {}; this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } }; this.dataset = {}; }
  append(...els) { for (const e of els) this.children.push(e); }
  appendChild(e) { this.children.push(e); return e; }
  insertBefore(e, ref) { const i = this.children.indexOf(ref); if (i < 0) this.children.push(e); else this.children.splice(i, 0, e); return e; }
  addEventListener(k, fn) { (this._listeners[k] ||= []).push(fn); }
  removeEventListener() {}
  remove() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  setAttribute() {}
  get isConnected() { return true; }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html || ''; }
  focus() {}
}
const doc = { createElement: (t) => new El(t), body: new El('body'), documentElement: new El('html'), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, hidden: false };
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { protocol: 'https:', host: 'vibe.example', origin: 'https://vibe.example', href: 'https://vibe.example/' };
const clipboard = { written: [], readText: async () => 'from-clipboard', writeText: async (t) => { clipboard.written.push(t); } };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', clipboard, userAgent: 'node' }, configurable: true });
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

// ── a fake RFB that records what the component does to it ──
class FakeRFB {
  constructor(target, url) { this.target = target; this.url = url; this._l = {}; this.disconnected = 0; this.pasted = []; FakeRFB.instances.push(this); }
  addEventListener(k, fn) { (this._l[k] ||= []).push(fn); }
  emit(k, detail) { for (const fn of this._l[k] || []) fn({ detail }); }
  disconnect() { this.disconnected++; }
  clipboardPasteFrom(t) { this.pasted.push(t); }
  focus() { this.focused = (this.focused || 0) + 1; }
}
FakeRFB.instances = [];
const loadRFB = async () => FakeRFB;

const V = await import('../src/lib/vnc-view.js');
const utils = await import('../src/lib/utils.js');
const toasts = [];
// showToast appends each toast into the #global-toasts stack — hand it a recording one
const toastStack = new El('div'); toastStack.appendChild = (el) => { toasts.push(el); return el; };
doc.getElementById = (id) => (id === 'global-toasts' ? toastStack : null);
void utils;

console.log('§1 the ONE surface (grep census over src/lib)');
{
  const libDir = path.join(repo, 'src/lib');
  const files = fs.readdirSync(libDir).filter((f) => f.endsWith('.js'));
  // (chat-view/utils write style.zoom for the CHAT scale and the body DPI zoom — different rules; the census is for the COUNTER-zoom literal)
  const shapes = { novncImport: /import\(new URL\('\/novnc\.js'/, counterZoom: /calc\(1 \/ var\(--ui-scale/, newRfb: /new RFB\(/, scaleViewport: /\.scaleViewport\s*=/, resizeSession: /\.resizeSession\s*=/ };
  const where = {};
  for (const f of files) { const s = read(`src/lib/${f}`); for (const [k, re] of Object.entries(shapes)) if (re.test(s)) (where[k] ||= []).push(f); }
  // 2.369.118: the counter-zoom LITERAL moved to utils.js (COUNTER_ZOOM — the ONE
  // definition, shared with every xterm container); vnc-view.js re-exports the
  // name and no file spells the calc() twice.
  const home = { counterZoom: ['utils.js'] };
  for (const k of Object.keys(shapes)) ok(same(where[k], home[k] || ['vnc-view.js']), `${k} lives ONLY in ${(home[k] || ['vnc-view.js']).join('+')} (${(where[k] || []).join(', ') || 'nowhere'})`);
  ok(/export \{ COUNTER_ZOOM \}/.test(read('src/lib/vnc-view.js')) && /container\.style\.zoom = COUNTER_ZOOM/.test(read('src/lib/terminal.js')) && /import \{[^}]*COUNTER_ZOOM[^}]*\} from '\.\/utils\.js'/.test(read('src/lib/terminal.js')), 'vnc-view.js re-exports COUNTER_ZOOM from utils.js and terminal.js counter-zooms its container with the same name (net zoom 1 for xterm mouse mapping, 2.369.118)');
  ok(V.COUNTER_ZOOM === 'calc(1 / var(--ui-scale, 1))', "COUNTER_ZOOM is inc-mtdrm922's rule verbatim: 'calc(1 / var(--ui-scale, 1))' (var-reactive, NET zoom 1)");
  const dw = read('src/lib/desktop-window.js'), daw = read('src/lib/desktop-app-window.js');
  ok(/import \{ createVncView, streamUrl \} from '\.\/vnc-view\.js'/.test(dw) && /createVncView\(winInfo\.content/.test(dw), 'desktop-window.js mounts through createVncView (no inline noVNC)');
  ok(/import \{ createVncView, streamUrl \} from '\.\/vnc-view\.js'/.test(daw) && /createVncView\(winInfo\.content/.test(daw), 'desktop-app-window.js mounts through createVncView too — one component, two window types');
  ok(/autoReconnect: true/.test(dw) && /autoReconnect: true/.test(daw), 'BOTH windows walk the bounded reconnect ladder (2.369.118: the singleton too — userW\'s Desktop sat on "Disconnected" until a click; the Reconnect button stays for the ladder\'s end)');
  ok(/streamUrl\('\/api\/vnc'\)/.test(dw) && /streamUrl\(`\/api\/desktop\/\$\{encodeURIComponent\(id\)\}\/stream`\)/.test(daw), 'both windows speak to the ONE bridge (/api/vnc and /api/desktop/<id>/stream)');
}

// A pre-fix control pins a SHA, NEVER `master`: the day this branch became
// master, `master:src/lib/desktop-window.js` was the POST-extraction file and
// the control failed its own identity check in the pre-push gate (2.369.96).
// 2c4060dc = 2.369.95, the last release whose desktop-window.js is inline.
const PRE_EXTRACTION_SHA = '2c4060dc';
console.log(`§2 byte-for-byte against the RETIRED desktop-window.js (git show ${PRE_EXTRACTION_SHA}:…)`);
{
  let retired = null, why = null;
  try { retired = execFileSync('git', ['-C', repo, 'show', `${PRE_EXTRACTION_SHA}:src/lib/desktop-window.js`], { env: gitEnvFrom(process.env), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { why = String(e.stderr || e.message).trim().slice(0, 160); }
  if (!retired) console.log(`  ⚠ SKIP: cannot read the retired file — ${why}`);
  else {
    ok(/new RFB\(mount/.test(retired) && /container\.style\.zoom = 'calc\(1 \/ var\(--ui-scale, 1\)\)'/.test(retired), 'the control really is the pre-extraction window (inline RFB + the counter-zoom literal)');
    const lits = (s) => [...s.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1]);
    const retiredLits = [...new Set(lits(retired))];
    const now = new Set([...lits(read('src/lib/vnc-view.js')), ...lits(read('src/lib/desktop-window.js'))]);
    const lost = retiredLits.filter((k) => !now.has(k));
    ok(retiredLits.length >= 10 && lost.length === 0, `every one of the retired window's ${retiredLits.length} t() strings is still spoken by the component or the caller (none lost, none reworded)`, lost);
    const vv = read('src/lib/vnc-view.js');
    for (const frag of ["rfb.scaleViewport = true;", "rfb.resizeSession = true;", "navigator.clipboard?.writeText(text).catch(() => {});", "rfb.clipboardPasteFrom(text); showToast(t('Clipboard sent'));", "showToast(t('Clipboard unavailable (needs HTTPS + permission)'), { type: 'error' });", "e.detail?.clean ? t('Disconnected') : t('Connection lost')", "status.style.color = error ? 'var(--red, #e55)' : '';", "reBtn.style.display = reconnect ? '' : 'none';", "'display:flex;flex-direction:column;height:100%;background:#000'", "'flex:1;min-height:0;position:relative;overflow:hidden'"]) {
      const inRetired = retired.includes(frag) || retired.includes(frag.replace("e.detail?.clean ? t('Disconnected') : t('Connection lost')", "e.detail?.clean ? t('Disconnected') : t('Connection lost')"));
      ok(inRetired && vv.includes(frag), `retired fragment carried verbatim: ${frag.slice(0, 60)}`);
    }
  }
}

console.log('§3 the component under a fake DOM + fake RFB — the retired window\'s transitions');
{
  const host = new El('div');
  const events = [];
  let gateAnswer = { ok: false, error: 'no VNC server installed (Xtigervnc/Xvnc not on PATH)' };
  const before = async () => gateAnswer;
  const view = V.createVncView(host, { url: 'wss://vibe.example/api/vnc', before, onStatus: (s, d) => events.push([s, d]), loadRFB });
  const [container] = host.children;
  ok(container.style.zoom === V.COUNTER_ZOOM && container.style.cssText === 'display:flex;flex-direction:column;height:100%;background:#000', 'the container is counter-zoomed and styled exactly as before');
  const [bar, mount] = container.children;
  ok(bar.className === 'desktop-bar' && mount.style.cssText === 'flex:1;min-height:0;position:relative;overflow:hidden', 'bar + mount are the retired elements');
  const [status, pasteBtn, reBtn] = bar.children;
  ok(status.className === 'desktop-status' && status.textContent === 'Connecting…' && pasteBtn.textContent === 'Paste' && pasteBtn.title === 'Send your clipboard text into the desktop' && reBtn.textContent === 'Reconnect' && reBtn.style.cssText.includes('display:none'), 'initial chrome: "Connecting…", Paste (with its title), a hidden Reconnect');
  await view.connect();
  ok(status.textContent === 'no VNC server installed (Xtigervnc/Xvnc not on PATH)' && status.style.color === 'var(--red, #e55)' && reBtn.style.display === '', 'gate failure: the SERVER\'s own error text, red, Reconnect shown (the retired `st?.error || …` branch)');
  ok(same(events.map((e) => e[0]), ['starting', 'error']), 'observer saw starting → error');
  gateAnswer = { ok: false };
  await view.connect();
  ok(status.textContent === 'Desktop unavailable on this server', 'gate failure without a message ⇒ the generic label');
  ok(FakeRFB.instances.length === 0, 'no RFB was constructed while the gate refused');
  gateAnswer = { ok: true };
  await view.connect();
  const rfb = FakeRFB.instances[0];
  ok(FakeRFB.instances.length === 1 && rfb.target === mount && rfb.url === 'wss://vibe.example/api/vnc', 'gate ok ⇒ ONE RFB on the mount with the bridge url');
  ok(rfb.scaleViewport === true && rfb.resizeSession === true, 'scaleViewport + resizeSession set (fit when the server cannot resize; ask it to match the window)');
  ok(status.textContent === 'Connecting…' && status.style.color === '' && reBtn.style.display === 'none', 'status back to "Connecting…", not red, Reconnect hidden');
  rfb.emit('connect');
  ok(status.textContent === 'Connected' && view.state === 'connected', "'connect' ⇒ Connected");
  rfb.emit('clipboard', { text: 'copied-remotely' });
  await sleep(0);
  ok(same(clipboard.written, ['copied-remotely']), 'a remote clipboard event lands in navigator.clipboard');
  await pasteBtn.onclick();
  ok(same(rfb.pasted, ['from-clipboard']) && toasts.some((x) => (x.children || []).some((c) => /Clipboard sent/.test(String(c.textContent || '')))), 'Paste reads the browser clipboard into the session and toasts "Clipboard sent"');
  rfb.emit('disconnect', { clean: true });
  ok(status.textContent === 'Disconnected' && status.style.color === '' && reBtn.style.display === '', 'clean disconnect ⇒ "Disconnected", not red, Reconnect shown');
  rfb.emit('disconnect', { clean: false });
  ok(status.textContent === 'Connection lost' && status.style.color === 'var(--red, #e55)', 'unclean disconnect ⇒ "Connection lost" in red');
  await sleep(1300);
  ok(FakeRFB.instances.length === 1, 'the singleton shape does NOT auto-reconnect (autoReconnect off — a Reconnect button only, as before)');
  reBtn.onclick();
  await sleep(0);
  ok(FakeRFB.instances.length === 2 && rfb.disconnected === 1, 'Reconnect builds a fresh RFB and disconnects the old one first');
  view.dispose();
  const last = FakeRFB.instances[1];
  ok(last.disconnected === 1, 'dispose disconnects');
  last.emit('disconnect', { clean: false });
  ok(status.textContent !== 'Connection lost', 'after dispose, a late disconnect event changes nothing (closed guard)');
  const before2 = FakeRFB.instances.length; await view.connect(); ok(FakeRFB.instances.length === before2, 'connect after dispose is a no-op');
}

console.log('§4 the app window\'s options: autoReconnect ladder, labels, addControl');
{
  FakeRFB.instances.length = 0;
  const host = new El('div');
  const view = V.createVncView(host, { url: 'wss://vibe.example/api/desktop/da-1/stream', labels: { starting: 'Starting application…', unavailable: 'Desktop app unavailable' }, autoReconnect: true, loadRFB });
  const bar = host.children[0].children[0];
  const chip = new El('span'); view.addControl(chip);
  ok(bar.children.indexOf(chip) === 1 && bar.children[2].textContent === 'Paste', 'addControl inserts window-type chrome between the status and Paste');
  await view.connect();
  ok(FakeRFB.instances.length === 1, 'no gate ⇒ straight to the RFB');
  FakeRFB.instances[0].emit('connect');
  FakeRFB.instances[0].emit('disconnect', { clean: false });
  await sleep(1200);
  ok(FakeRFB.instances.length === 2, 'autoReconnect: an unclean drop reconnects on the ladder\'s first rung (~1 s)');
  FakeRFB.instances[1].emit('connect');
  FakeRFB.instances[1].emit('disconnect', { clean: true });
  await sleep(1200);
  ok(FakeRFB.instances.length === 3, 'a CLEAN disconnect reconnects too while the picture is still WANTED — a SIGKILLed server is a clean close to noVNC (measured), so the ladder keys on wanted, never on clean');
  view.disconnect();
  FakeRFB.instances[2].emit('disconnect', { clean: false });
  await sleep(1200);
  ok(FakeRFB.instances.length === 3 && view.wanted === false, 'after OUR disconnect() nothing reconnects (wanted is false)');
  view.dispose();
  ok(same(V.RECONNECT_LADDER, [1000, 2000, 4000, 8000, 15000]), 'the ladder is bounded and named');
  ok(V.streamUrl('/api/vnc') === 'wss://vibe.example/api/vnc', 'streamUrl follows the page scheme (https ⇒ wss)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

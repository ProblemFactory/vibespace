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
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
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
globalThis.isSecureContext = true; // an https page IS a secure context (§6 flips it for the plain-http chip)
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
  ok(/import \{ createVncView, streamUrl \} from '\.\/vnc-view\.js'/.test(daw) && /createVncView\(winInfo\.content/.test(daw), 'desktop-app-window.js mounts through createVncView too (its RFB records) — one component, two window types; its xpra records go through xpra-view.js on the same shell (P8-2 x2)');
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
    // P8-2 chunk x2 (2026-09-22): the bar, the status chip, Paste/Reconnect and the ladder moved to the SHARED picture shell
    // (picture-shell.js) — the xpra view stands on the same one — so the retired literals are pinned across BOTH files
    const now = new Set([...lits(read('src/lib/vnc-view.js')), ...lits(read('src/lib/picture-shell.js')), ...lits(read('src/lib/desktop-window.js'))]);
    const lost = retiredLits.filter((k) => !now.has(k));
    ok(retiredLits.length >= 10 && lost.length === 0, `every one of the retired window's ${retiredLits.length} t() strings is still spoken by the component or the caller (none lost, none reworded)`, lost);
    const vv = read('src/lib/vnc-view.js') + '\n' + read('src/lib/picture-shell.js');
    // ONE deliberate change (owner acceptance 2, 2026-09-21 — the clipboard both ways on EVERY rung): the retired
    // `navigator.clipboard?.writeText(text).catch(() => {})` did NOTHING on plain http and swallowed a refusal; a
    // desktop-side copy now goes through the shell (the API on a secure context, silently as before — else the
    // click-to-copy chip). §6 drives both branches.
    ok(retired.includes("navigator.clipboard?.writeText(text).catch(() => {});") && !vv.includes("navigator.clipboard?.writeText(text).catch(() => {});") && /shell\.deliverCopy\(text, \{ secure: pageIsSecure\(\), clipboard: navigator\.clipboard, toast: false \}\)/.test(vv), 'the ONE deliberate change: the retired silent writeText is replaced by the shell\'s deliverCopy (API on a secure context, the chip on plain http — never a silent no-op)');
    for (const frag of ["rfb.scaleViewport = true;", "rfb.resizeSession = true;", "rfb.clipboardPasteFrom(text); showToast(t('Clipboard sent'));", "showToast(t('Clipboard unavailable (needs HTTPS + permission)'), { type: 'error' });", "e.detail?.clean ? t('Disconnected') : t('Connection lost')", "status.style.color = error ? 'var(--red, #e55)' : '';", "reBtn.style.display = reconnect ? '' : 'none';", "'display:flex;flex-direction:column;height:100%;background:#000'", "'flex:1;min-height:0;position:relative;overflow:hidden'"]) {
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
  // lane desktop-keepalive K2: the old RFB already fired its own disconnect — it is NOT asked again (noVNC logs "Tried changing
  // state of a disconnected RFB object" for that, three times in userW's console); a LIVE one is (the §9 leg)
  ok(FakeRFB.instances.length === 2 && rfb.disconnected === 0, 'Reconnect builds a fresh RFB and never re-disconnects one that already disconnected (K2)');
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

// ── §5 the Paste button's failure paths (2.369.136, userW inc-mubu8xdg-pvwa "desktop 的 paste 用不了") ──
console.log('§5 Paste: disconnected says so; a refused / empty / unavailable clipboard opens the paste box; every send hands focus back');
{
  FakeRFB.instances.length = 0; toasts.length = 0;
  const host = new El('div');
  const view = V.createVncView(host, { url: 'wss://vibe.example/api/vnc', loadRFB });
  const [, pasteBtn] = view.bar.children;
  const toastText = () => toasts.map((x) => (x.children || []).map((c) => String(c.textContent || '')).join(' ')).join(' | ');
  await pasteBtn.onclick();
  ok(FakeRFB.instances.length === 0 && /not connected/.test(toastText()) && !view.pasteOpen, 'Paste before any connection: a "not connected" toast, no paste box, nothing sent', toastText());
  await view.connect();
  const rfb = FakeRFB.instances[0];
  rfb.emit('connect');
  const f0 = rfb.focused || 0;
  await pasteBtn.onclick();
  ok(same(rfb.pasted, ['from-clipboard']) && (rfb.focused || 0) === f0 + 1 && !view.pasteOpen, 'a readable clipboard is sent AND the focus goes back to the desktop (the retired behaviour left it on the button)', { pasted: rfb.pasted, focused: rfb.focused });
  // the browser refuses (permission) ⇒ the paste box with the permission sentence
  const savedRead = clipboard.readText;
  clipboard.readText = async () => { const e = new Error('Read permission denied.'); e.name = 'NotAllowedError'; throw e; };
  await pasteBtn.onclick();
  ok(view.pasteOpen && rfb.pasted.length === 1, 'a NotAllowedError opens the paste box instead of a dead-end toast', { open: view.pasteOpen });
  const box = view.container.children.find((c) => c.className === 'vnc-paste-box');
  const note = box && box.children[0]; const ta = box && box.children[1]; const actions = box && box.children[2];
  ok(box && /refused clipboard access/.test(note.textContent) && ta.tagName === 'textarea' && actions.children.length === 2, 'the box = the reason sentence + a textarea + Send / Cancel', box && note.textContent);
  actions.children[0].onclick();
  ok(view.pasteOpen && rfb.pasted.length === 1, 'Send with an empty textarea sends nothing and keeps the box');
  ta.value = 'typed-into-box';
  const f1 = rfb.focused || 0;
  actions.children[0].onclick();
  ok(same(rfb.pasted, ['from-clipboard', 'typed-into-box']) && !view.pasteOpen && (rfb.focused || 0) === f1 + 1 && /Clipboard sent/.test(toastText()), 'Send routes the textarea text into the desktop, closes the box and focuses the desktop', { pasted: rfb.pasted });
  // an empty clipboard ⇒ the box with the empty sentence
  clipboard.readText = async () => '';
  await pasteBtn.onclick();
  const box2 = view.container.children.filter((c) => c.className === 'vnc-paste-box').pop();
  ok(view.pasteOpen && /empty or holds no text/.test(box2.children[0].textContent), 'an empty clipboard opens the box with the empty sentence', box2 && box2.children[0].textContent);
  box2.children[2].children[1].onclick();
  ok(!view.pasteOpen, 'Cancel closes the box');
  // no async Clipboard API at all (plain http by hostname) ⇒ the HTTPS sentence
  const savedClip = navigator.clipboard; Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true });
  await pasteBtn.onclick();
  const box3 = view.container.children.filter((c) => c.className === 'vnc-paste-box').pop();
  ok(view.pasteOpen && /not served over HTTPS/.test(box3.children[0].textContent), 'without navigator.clipboard (an http page) the box names HTTPS as the reason', box3 && box3.children[0].textContent);
  box3.children[2].children[1].onclick();
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', clipboard: savedClip, userAgent: 'node' }, configurable: true });
  clipboard.readText = savedRead;
  // disconnected AFTER a connection ⇒ (lane desktop-keepalive K2) the press is SAID, the stream is re-asked (a press is
  // intent), the text is QUEUED and lands when the stream is back — the .199 "not connected" refusal is for a view that
  // never started a stream (§9)
  rfb.emit('disconnect', { clean: true });
  toasts.length = 0;
  const nBefore = FakeRFB.instances.length;
  await pasteBtn.onclick();
  ok(!view.pasteOpen && /reconnecting — your text is pasted when it is back/.test(toastText()) && FakeRFB.instances.length === nBefore + 1, 'a disconnected view SAYS the press, reconnects at once and queues (K2; .199 refused — userW pressed Paste into a dead view)', toastText());
  view.dispose();
}

// ── §6 a desktop-side copy on PLAIN HTTP (owner acceptance 2, 2026-09-21): the shell's click-to-copy chip, never a silent no-op ──
console.log('§6 app → browser on plain http: the chip holds the copy, a click copies through the user gesture, a refused API write falls to the chip');
{
  FakeRFB.instances.length = 0; toasts.length = 0;
  const host = new El('div');
  const view = V.createVncView(host, { url: 'wss://vibe.example/api/vnc', loadRFB });
  const bar = host.children[0].children[0];
  const chip = view.copyChip;
  ok(bar.children.indexOf(chip) === 3 && chip.style.display === 'none' && chip.textContent === 'Copied in the app — click to copy', 'the copy chip exists on the RFB view too, hidden, AFTER Reconnect (Paste keeps the second slot)');
  await view.connect();
  const rfb = FakeRFB.instances[0];
  rfb.emit('connect');
  const written0 = clipboard.written.length;
  globalThis.isSecureContext = false;
  rfb.emit('clipboard', { text: 'copied-on-http' });
  await sleep(0);
  ok(clipboard.written.length === written0 && chip.style.display === '' && view.copiedText === 'copied-on-http', 'plain http: nothing is written through the API (it is not ours to use there); the chip appears holding the text');
  const execCalls = [];
  const savedExec = doc.execCommand; const savedSel = [El.prototype.select, El.prototype.setSelectionRange];
  doc.execCommand = (c) => { execCalls.push([c, doc.body.children.map((e) => e.value)]); return true; };
  El.prototype.select = function () {}; El.prototype.setSelectionRange = function () {};
  chip.onclick();
  ok(execCalls.length === 1 && execCalls[0][0] === 'copy' && execCalls[0][1].includes('copied-on-http') && chip.style.display === 'none' && view.copiedText === null && toasts.some((x) => (x.children || []).some((c) => /Copied to your clipboard/.test(String(c.textContent || '')))), 'the click copies through execCommand on a hidden textarea holding the text, toasts, and the chip goes away');
  doc.execCommand = savedExec; [El.prototype.select, El.prototype.setSelectionRange] = savedSel;
  globalThis.isSecureContext = true;
  const savedWrite = clipboard.writeText;
  clipboard.writeText = async () => { const e = new Error('Document is not focused.'); e.name = 'NotAllowedError'; throw e; };
  rfb.emit('clipboard', { text: 'refused-by-api' });
  await sleep(0); await sleep(0);
  ok(chip.style.display === '' && view.copiedText === 'refused-by-api', 'a secure page whose API refuses the write shows the chip too (the retired `.catch(() => {})` swallowed it)');
  clipboard.writeText = savedWrite;
  toasts.length = 0;
  rfb.emit('clipboard', { text: 'api-again' });
  await sleep(0); await sleep(0);
  ok(clipboard.written.includes('api-again') && chip.style.display === 'none' && !toasts.length, 'a secure page: the API takes the copy SILENTLY as before (no toast on the RFB rung) and a stale chip goes away');
  view.dispose();
}

console.log('§7 x5 (docs/design-desktop-apps §7 P8-2): only the ACTIVE pane drives the display');
{
  FakeRFB.instances.length = 0;
  // noVNC's own rule, faked faithfully: `resizeSession = true` asks the server for the pane's size unless view-only
  const resizes = [];
  class ResizingRFB extends FakeRFB { set resizeSession(v) { this._rs = v; if (v && !this.viewOnly) resizes.push(this.url); } get resizeSession() { return this._rs; } }
  const view = V.createVncView(new El('div'), { url: 'ws://x/api/desktop/da-1/stream', autoReconnect: false, loadRFB: async () => ResizingRFB });
  view.setMode('blocked');
  await view.connect();
  const r = FakeRFB.instances[0];
  ok(r.viewOnly === true && resizes.length === 0, 'a BLOCKED pane\'s RFB is view-only from its first moment — it never asks the display for its size');
  view.setMode('watch');
  ok(r.viewOnly === true && resizes.length === 0 && view.mode === 'watch', 'WATCH (an agent drives): still view-only, no size asked — noVNC\'s scaleViewport fits the picture');
  view.setMode('active');
  ok(r.viewOnly === false && resizes.length === 1, 'ACTIVE (Resume here / a takeover): input on and the pane\'s own size asked ONCE (resizeSession re-set) — the display follows this pane');
  view.setMode('active');
  ok(resizes.length === 1, 'the same mode again changes nothing');
  view.dispose();
  // CONTROL: without setMode (the pre-x5 view) a pane that is not the active one still asks for its size at connect
  FakeRFB.instances.length = 0; resizes.length = 0;
  const v2 = V.createVncView(new El('div'), { url: 'ws://x/api/desktop/da-1/stream', autoReconnect: false, loadRFB: async () => ResizingRFB });
  await v2.connect();
  ok(resizes.length === 1 && FakeRFB.instances[0].viewOnly !== true, 'CONTROL: a pane nobody set blocked asks for its size at connect (what every second client did before x5)');
  v2.dispose();
}

console.log('§8 (desktop A r1) a gesture copy hands the keyboard focus BACK to whatever held it — the next key reaches the app');
{
  const S = await import('../src/lib/picture-shell.js');
  // a fake document that tracks focus the way a browser does: select() focuses the textarea, remove() of the focused
  // element drops focus to <body> (the verifier's measured real-rung trace: activeElement ime → BODY after Ctrl+C)
  const body = new El('body');
  const fdoc = { body, activeElement: body, createElement: (t) => { const e = new El(t); e.select = () => { fdoc.activeElement = e; }; e.setSelectionRange = () => {}; e.remove = () => { body.children = body.children.filter((c) => c !== e); if (fdoc.activeElement === e) fdoc.activeElement = body; }; return e; }, execCommand: (c) => c === 'copy' };
  const ime = new El('textarea'); let focusOpts = null;
  ime.focus = (o) => { fdoc.activeElement = ime; focusOpts = o; };
  fdoc.activeElement = ime;
  const okCopy = S.copyViaSelection('1234', fdoc);
  ok(okCopy === true && fdoc.activeElement === ime && focusOpts && focusOpts.preventScroll === true && body.children.length === 0, 'copyViaSelection writes, removes its textarea and RESTORES the focus to the element that held it ({preventScroll}) — the pane\'s IME, not <body>', { active: fdoc.activeElement === ime ? 'ime' : fdoc.activeElement?.tagName, focusOpts });
  // nothing held focus (body) ⇒ nothing to restore, and a refused write restores too
  fdoc.activeElement = body; fdoc.execCommand = () => false;
  const refused = S.copyViaSelection('x', fdoc);
  ok(refused === false && fdoc.activeElement === body, 'a refused write returns false; from <body> nothing is focused afterwards (no stray focus)');
  fdoc.activeElement = ime; fdoc.execCommand = () => { throw new Error('boom'); };
  ok(S.copyViaSelection('y', fdoc) === false && fdoc.activeElement === ime, 'a throwing execCommand still hands the focus back');
}

// ── THE SINGLETON'S SERVER HALF: WHAT A SHUTDOWN MAY STOP (src/vnc.js, 2026-09-25 — the heavy RED on 69720f2b) ──
// A throwaway server stops the Xvnc THIS process spawned, identified by pid + /proc start time; never an adopted
// one, never whatever pid the pid file names (it outlives its writer; pids wrap daily on a busy box); an installed
// server stops nothing (its desktop outlives a restart by design). Driven over `sleep` stand-ins — nothing is started
// on a display; the heavy half (a real Xvnc, a real SIGTERMed server, the patched-server control) is
// test-desktop-app-window. CONTROL: the pre-fix stop() (the pid file's pid, no identity) in a patched copy.
console.log('\nthe singleton\'s server half: a shutdown stops only the Xvnc this process started');
{
  const req = createRequire(import.meta.url);
  const { VncManager } = req('../src/vnc.js');
  const dataDir = scratch('vncstop'); fs.mkdirSync(dataDir, { recursive: true });
  const kids = [];
  const stand = () => { const c = spawn('sleep', ['60'], { stdio: 'ignore' }); kids.push(c); return c; };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const startOf = (pid) => { try { const x = fs.readFileSync(`/proc/${pid}/stat`, 'latin1'); return x.slice(x.lastIndexOf(')') + 2).split(' ')[19]; } catch { return null; } };
  const gone = async (pid) => { for (let i = 0; i < 40 && alive(pid); i++) await sleep(25); return !alive(pid); };
  try {
    if (!fs.existsSync('/proc/self/stat')) console.log('  · SKIP: no /proc (the identity is /proc start time)');
    else {
      // the pid file names a live process this manager never started (an adopted desktop / a recycled pid)
      const foreign = stand(); await sleep(50);
      fs.writeFileSync(path.join(dataDir, 'vnc.pid'), String(foreign.pid));
      const v = new VncManager({ dataDir, stopOnShutdown: true });
      ok(v.stop() === false && v.shutdown() === false && alive(foreign.pid), 'nothing started here ⇒ stop()/shutdown() signal nothing, even with a pid file naming a live process (an adopted desktop is never stopped)');
      const pre = mutantCopies('vncstop', repo).load('src/vnc.js', read('src/vnc.js').replace(/  stop\(\) \{\n[\s\S]*?\n  \}\n\n  \/\*\* server\.js/, "  stop() {\n    try {\n      const pid = parseInt(fs.readFileSync(this._pidFile, 'utf-8'), 10);\n      if (pid > 1) process.kill(pid, 'SIGTERM');\n      fs.unlinkSync(this._pidFile);\n      return true;\n    } catch { return false; }\n  }\n\n  /** server.js"), 'pre-fix-stop');
      const pv = new pre.VncManager({ dataDir, stopOnShutdown: true });
      ok(pv.stop() === true && await gone(foreign.pid), 'CONTROL: the pre-fix stop() (the pid file\'s pid, no identity) SIGTERMs that stranger');
      // THIS process's own spawn, identity intact ⇒ stopped; the pid file cleared only when it names that pid
      const own = stand(); await sleep(50);
      fs.writeFileSync(path.join(dataDir, 'vnc.pid'), String(own.pid));
      const v2 = new VncManager({ dataDir, stopOnShutdown: true });
      v2._own = { pid: own.pid, start: startOf(own.pid) };
      ok(v2.shutdown() === true && await gone(own.pid) && !fs.existsSync(path.join(dataDir, 'vnc.pid')) && v2._own === null, 'a throwaway server\'s shutdown() SIGTERMs the Xvnc it spawned (pid + start time match) and clears its pid file');
      // the same pid, another start time = a recycled pid ⇒ never signalled
      const rec = stand(); await sleep(50);
      const v3 = new VncManager({ dataDir, stopOnShutdown: true });
      v3._own = { pid: rec.pid, start: String(Number(startOf(rec.pid)) - 1) };
      ok(v3.shutdown() === false && alive(rec.pid), 'a pid whose /proc start time differs from the recorded one (a recycled pid) is never signalled');
      // an INSTALLED server (stopOnShutdown false) keeps its desktop for the next boot to adopt
      const inst = stand(); await sleep(50);
      const v4 = new VncManager({ dataDir });
      v4._own = { pid: inst.pid, start: startOf(inst.pid) };
      ok(v4.shutdown() === false && alive(inst.pid) && v4._own !== null, 'an INSTALLED server\'s shutdown() stops nothing — its desktop outlives an app-only restart (adopted next boot)');
      ok(/new VncManager\(\{ dataDir: path\.join\(__dirname, 'data'\), stopOnShutdown: throwawayRoot \}\)/.test(read('server.js')) && /^\s*try \{ vnc\.shutdown\(\); \} catch \{\}/m.test(read('server.js').slice(read('server.js').indexOf('function shutdown()'))), 'WIRING: server.js builds the manager with stopOnShutdown = throwawayRoot and calls vnc.shutdown() in its SIGINT/SIGTERM shutdown()');
    }
  } finally { for (const c of kids) { try { c.kill('SIGKILL'); } catch { } } try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { } }
}

console.log('§9 lane desktop-keepalive K2/K3 (userW inc-muoshmqn-dect: two Paste presses, nothing visible, no toast in the ring) — every press is SAID; a press while the stream is down queues and pastes when it is back; the bar counts the ladder and words the close');
{
  const S9 = await import('../src/lib/picture-shell.js');
  const toastTexts = () => toasts.map((x) => (x.children || []).map((c) => String(c.textContent || '')).join(' '));
  const host = () => new El('div');
  // ── PROVE .199 (the retired shell, read through git): the two paths that leave NO toast ──
  const M9 = mutantCopies('dkp-shell', repo);
  const old = spawnSyncGit(['show', 'b924041f:src/lib/picture-shell.js']);
  if (old === null) console.log('  SKIP (LOUD): git cannot read b924041f here — the .199 proof needs it');
  else {
    const OLD = await import(M9.write('src/lib/picture-shell.js', old, 'old-199', { esm: true }));
    // (a) a plain-http page (no clipboard API): the box opens, NO toast
    toasts.length = 0;
    const o1 = OLD.createPictureShell(host(), {}); o1.emit('connected');
    await o1.pasteFromClipboard({ connected: () => true, notConnected: 'x', send: () => true, clipboard: null });
    ok(o1.pasteOpen && toasts.length === 0, '.199 PROOF (a): on a page with no clipboard API the press opened the box and SAID NOTHING (no toast — no ring entry, the box under the bar easy to miss)', toastTexts());
    // (b) a permission prompt nobody answers: readText never settles ⇒ nothing at all
    toasts.length = 0;
    const o2 = OLD.createPictureShell(host(), {}); o2.emit('connected');
    let settled = false;
    o2.pasteFromClipboard({ connected: () => true, notConnected: 'x', send: () => true, clipboard: { readText: () => new Promise(() => { }) } }).then(() => { settled = true; });
    await sleep(S9.CLIPBOARD_READ_MS + 400);
    ok(!settled && !o2.pasteOpen && toasts.length === 0, `.199 PROOF (b): a clipboard read that never settles left the press with NOTHING — no toast, no box, after ${S9.CLIPBOARD_READ_MS + 400} ms`, toastTexts());
  }
  // ── the new shell: the same two presses are SAID ──
  toasts.length = 0;
  const n1 = S9.createPictureShell(host(), {}); n1.emit('connected');
  await n1.pasteFromClipboard({ connected: () => true, notConnected: 'x', send: () => true, clipboard: null });
  ok(n1.pasteOpen && toastTexts().some((x) => /cannot read your clipboard — paste into the box under the bar/.test(x)), 'K2: the box opening is SAID (a toast the ring keeps), not only drawn', toastTexts());
  toasts.length = 0;
  const n2 = S9.createPictureShell(host(), {}); n2.emit('connected');
  const t0 = Date.now();
  const r2 = await n2.pasteFromClipboard({ connected: () => true, notConnected: 'x', send: () => true, clipboard: { readText: () => new Promise(() => { }) } });
  ok(r2 === 'box' && n2.pasteOpen && Date.now() - t0 < S9.CLIPBOARD_READ_MS + 800 && toastTexts().some((x) => /still asking for clipboard permission/.test(x)), `K2: a read that never settles gives up after ${S9.CLIPBOARD_READ_MS} ms — the box opens and the press is said`, { r2, ms: Date.now() - t0, t: toastTexts() });
  // ── the verdict table ──
  const PV = S9.pasteVerdict;
  ok(PV('connected') === 'send' && PV('idle') === 'refuse' && PV('connected', { closed: true }) === 'refuse' && ['starting', 'connecting', 'disconnected', 'error'].every((st) => PV(st) === 'queue'), 'pasteVerdict: connected ⇒ send; never started / closed ⇒ refuse; starting / connecting / disconnected / error ⇒ queue');
  // ── a press while the stream is down: said, reconnect kicked, QUEUED, pasted when it is back ──
  toasts.length = 0; FakeRFB.instances.length = 0;
  const vq = V.createVncView(host(), { url: 'ws://x/api/vnc', loadRFB, autoReconnect: true });
  await vq.connect(); const rq = FakeRFB.instances[0]; rq.emit('connect');
  rq.emit('disconnect', { clean: false });
  ok(rq.disconnected === 0, 'K2: the dead RFB is never disconnect()ed again (noVNC\'s "Tried changing state of a disconnected RFB object" ×3 in his console)');
  const pq = vq.bar.children[1];
  await pq.onclick();
  const rq2 = FakeRFB.instances[FakeRFB.instances.length - 1];
  ok(toastTexts().some((x) => /reconnecting — your text is pasted when it is back/.test(x)) && rq2 !== rq && vq.state !== 'connected', 'K2: the press is said and re-asks the stream at once (a press is intent)', toastTexts());
  ok(rq2.pasted.length === 0, '…nothing is sent into a stream that is not up');
  rq2.emit('connect');
  ok(same(rq2.pasted, ['from-clipboard']) && toastTexts().some((x) => /Clipboard sent/.test(x)), 'K2: the QUEUED text lands the moment the stream is back', { pasted: rq2.pasted });
  vq.dispose();
  // the 30 s bound: a stream that never comes back says the text was not pasted (a copy with a 150 ms bound)
  const shellSrc = read('src/lib/picture-shell.js');
  ok(shellSrc.includes('export const PASTE_WAIT_MS = 30000;'), 'K2: the queue waits PASTE_WAIT_MS = 30 s');
  const FAST = await import(M9.write('src/lib/picture-shell.js', shellSrc.replace('export const PASTE_WAIT_MS = 30000;', 'export const PASTE_WAIT_MS = 150;'), 'fastwait', { esm: true }));
  toasts.length = 0;
  const f1 = FAST.createPictureShell(host(), {}); f1.emit('disconnected');
  const sent = [];
  await f1.pasteFromClipboard({ connected: () => false, notConnected: 'x', send: (x) => { sent.push(x); return true; }, clipboard: { readText: async () => 'late' } });
  ok(f1.pendingPaste === 'late', '…queued while down');
  await sleep(300);
  ok(f1.pendingPaste === null && sent.length === 0 && toastTexts().some((x) => /Not pasted — the desktop did not come back within 30 s; press Reconnect/.test(x)), 'K2: after the bound the press is told it was NOT pasted (never a silent drop)', toastTexts());
  // a never-started view refuses by name
  toasts.length = 0;
  const idle = S9.createPictureShell(host(), {});
  ok(await idle.pasteFromClipboard({ connected: () => false, notConnected: 'The desktop is not connected — reconnect first', send: () => true, clipboard }) === 'refused' && toastTexts().some((x) => /not connected/.test(x)), 'K2: a view that never started a stream refuses with "not connected"');
  // a WATCHING pane: noVNC drops the paste silently — the press says so
  toasts.length = 0; FakeRFB.instances.length = 0;
  const vw = V.createVncView(host(), { url: 'ws://x/api/vnc', loadRFB });
  await vw.connect(); const rw = FakeRFB.instances[0]; rw.emit('connect'); rw.viewOnly = true;
  await vw.bar.children[1].onclick();
  ok(rw.pasted.length === 0 && toastTexts().some((x) => /This pane is watching — press Resume here/.test(x)) && !toastTexts().some((x) => /Clipboard sent/.test(x)), 'K2: a watching (view-only) pane says so instead of "Clipboard sent"', toastTexts());
  vw.dispose();
  // ── K3: the bar counts the ladder and words the bridge's close ──
  FakeRFB.instances.length = 0;
  const vl = V.createVncView(host(), { url: 'ws://x/api/vnc', loadRFB, autoReconnect: true, lastClose: async () => ({ code: 'unanswered' }) });
  await vl.connect(); const rl = FakeRFB.instances[0]; rl.emit('connect');
  rl.emit('disconnect', { clean: false });
  await sleep(10);
  ok(/^Reconnecting 1\/5… — the browser stopped answering$/.test(vl.status.textContent) || /^Connection lost — the browser stopped answering$/.test(vl.status.textContent) || /^Reconnecting 1\/5…/.test(vl.status.textContent), `K3: the status names the ladder rung and the bridge's reason ("${vl.status.textContent}")`);
  vl.dispose();
  ok(S9.closeWordsKey('unanswered') === 'the browser stopped answering' && S9.closeWordsKey('server-closed') === 'the desktop server closed the stream' && S9.closeWordsKey('other') === null, 'K3: closeWordsKey words the bridge\'s closed code set; an unknown code adds nothing');
  const DS9 = createRequire(import.meta.url)('../src/server/desktop-stream.js');
  ok(DS9.CLOSE_CODES.filter((c) => c !== 'other').every((c) => S9.closeWordsKey(c)), 'K3: every code the bridge can name (but "other") has words');
  ok(/router\.get\('\/api\/vnc\/last-close'/.test(read('src/routes/desktop-apps.js')) && /lastClose: async \(\) => \{ const r = await fetchJson\('\/api\/vnc\/last-close'\)/.test(read('src/lib/desktop-window.js')), 'K3: the singleton reads GET /api/vnc/last-close');
  // the new words have zh + ja entries
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = [...new Set([...shellSrc.matchAll(/t\('((?:This page cannot|The browser refused clipboard access —|The browser is still asking|Your clipboard holds|Not pasted —|The desktop stream is reconnecting|Reconnecting \{n\}|the browser stopped|the desktop server closed|the connection dropped|the desktop session ended|another window is driving)[^']*)'/g), ...read('src/lib/vnc-view.js').matchAll(/t\('(This pane is watching[^']*)'/g)].map((m) => m[1]))];
  const shellKeys = ['This page cannot read your clipboard — paste into the box under the bar, then Send', 'The browser refused clipboard access — paste into the box under the bar, then Send', 'The browser is still asking for clipboard permission — answer it, or paste into the box under the bar', 'Your clipboard holds no text — paste into the box under the bar, then Send', 'the browser stopped answering', 'the desktop server closed the stream', 'the connection dropped', 'the desktop session ended', 'another window is driving it'];
  const all = [...new Set([...keys, ...shellKeys])];
  const missing = all.filter((k) => !(zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')));
  ok(all.length >= 14 && !missing.length, `the ${all.length} new words have zh + ja entries`, missing);
}
function spawnSyncGit(args) { const r = require('child_process').spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: gitEnvFrom(process.env), maxBuffer: 16 * 1024 * 1024 }); return r.status === 0 ? r.stdout : null; }

// ── B-956d: THE DESKTOP TAKES ITS DISPLAY, IT DOES NOT ASSUME IT (src/vnc.js) ──
// Desktop apps' X servers take the lowest free display with -displayfd, so one of them can hold :7 first — and the
// fixed `:7` Desktop then never started. Now: the preferred display (VIBESPACE_VNC_DISPLAY, else :7) is tried with
// -displayfd 3; held ⇒ Xvnc again with -displayfd alone (the X server picks); the display it named is RECORDED in
// data/vnc.json and a restart ADOPTS it. Driven over a STAND-IN X server (a node script that keeps X's rule over lock
// files in a scratch dir and writes its display to fd 3 — nothing real is started on any display; the real Xtigervnc
// was measured by hand, 2026-10-02: the held display exits code 1 in 17 ms, -displayfd alone answered :5 in 165 ms).
// CONTROL: the same file without the fallback refuses to start while the preferred display is held.
console.log('\nB-956d: the Desktop takes a free display when its preferred one is held, records it, and a restart adopts it');
{
  const req = createRequire(import.meta.url);
  const { VncManager, portListening } = req('../src/vnc.js');
  const dataDir = scratch('vncfd-data'); fs.mkdirSync(dataDir, { recursive: true });
  const xdir = scratch('vncfd-x'); fs.mkdirSync(xdir, { recursive: true });
  const fake = path.join(xdir, 'fake-xserver');
  fs.writeFileSync(fake, `#!${process.execPath}
const fs = require('fs'), net = require('net'), path = require('path');
const a = process.argv.slice(2), dir = ${JSON.stringify(xdir)};
const lock = (n) => path.join(dir, '.X' + n + '-lock');
let n = /^:\\d+$/.test(a[0] || '') ? Number(a[0].slice(1)) : null;
if (n !== null && fs.existsSync(lock(n))) { process.stderr.write('Server is already active for display ' + n + '\\n'); process.exit(1); }
if (n === null) { n = 0; while (fs.existsSync(lock(n))) n++; }
fs.writeFileSync(lock(n), String(process.pid));
const port = Number(a[a.indexOf('-rfbport') + 1]);
net.createServer((c) => c.end()).listen(port, '127.0.0.1', () => { if (a.includes('-displayfd')) fs.writeSync(Number(a[a.indexOf('-displayfd') + 1]), n + '\\n'); });
process.on('SIGTERM', () => { try { fs.unlinkSync(lock(n)); } catch {} process.exit(0); });
`, { mode: 0o755 });
  const net = req('net');
  const freePort = () => new Promise((r) => { const sv = net.createServer().listen(0, '127.0.0.1', () => { const pt = sv.address().port; sv.close(() => r(pt)); }); });
  const started = [];
  const mk = (M, port, display = ':7') => { const v = new M.VncManager({ dataDir, display, port, xvncBin: fake }); v._startSession = () => null; return v; };
  const locks = () => fs.readdirSync(xdir).filter((f) => /^\.X\d+-lock$/.test(f)).sort();
  try {
    // positive control: the preferred display free ⇒ it is the one taken (the historic name is kept when it can be)
    const p0 = await freePort();
    const v0 = mk({ VncManager }, p0);
    const s0 = await v0.ensureRunning(); if (v0._own) started.push(v0._own.pid);
    ok(s0.running && v0.display === ':7' && JSON.parse(fs.readFileSync(path.join(dataDir, 'vnc.json'), 'utf8')).display === ':7', 'the preferred display free ⇒ the Desktop takes it and records it (data/vnc.json)');
    try { process.kill(v0._own.pid, 'SIGTERM'); } catch {}
    for (let i = 0; i < 40 && locks().length; i++) await sleep(25);
    // an X server already holds the preferred display (a desktop app's -displayfd Xvfb took it first)
    fs.writeFileSync(path.join(xdir, '.X7-lock'), '1');
    const port = await freePort();
    const v = mk({ VncManager }, port);
    let st = null, err = null;
    try { st = await v.ensureRunning(); } catch (e) { err = e.message; }
    if (v._own) started.push(v._own.pid);
    const rec = (() => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'vnc.json'), 'utf8')); } catch { return null; } })();
    ok(!!st && st.running && v.display !== ':7' && /^:\d+$/.test(v.display) && v.singletonFacts().display === v.display, `the preferred :7 held ⇒ the Desktop starts on the display the X server picked (${v.display}), and the desktop-singleton rung reads it`, { st, err, display: v.display });
    ok(!!rec && rec.display === v.display && rec.port === port && rec.pid === (v._own && v._own.pid), 'that display is RECORDED in data/vnc.json (with its port and pid)', rec);
    // a restart (a new manager on the same data/): the recorded display is adopted, nothing new is started
    const before = locks();
    const v2 = mk({ VncManager }, port);
    const adoptedBefore = v2.singletonFacts().display;
    const st2 = await v2.ensureRunning();
    ok(adoptedBefore === v.display && st2.running && v2.display === v.display && v2._own === null && JSON.stringify(locks()) === JSON.stringify(before), 'a restart ADOPTS the recorded display — the same one, no second X server started', { adoptedBefore, display: v2.display, locks: locks(), before });
    ok(new VncManager({ dataDir, display: ':7', port: port + 1, xvncBin: fake }).display === ':7', 'a record for ANOTHER port is not this Desktop\'s — the preferred display stands');
    // CONTROL: the same file without the fallback (the pre-fix fixed display) never starts while :7 is held
    const pre = mutantCopies('vncfd', repo).load('src/vnc.js', read('src/vnc.js').replace(/    if \(!r\.display\) \{\n      console\.warn[\s\S]*?\n    \}\n/, ''), 'no-displayfd-fallback');
    const pport = await freePort();
    const pv = mk(pre, pport);
    let perr = null;
    try { await pv.ensureRunning(); } catch (e) { perr = e.message; }
    if (pv._own) started.push(pv._own.pid);
    ok(!!perr && /VNC server failed to start/.test(perr) && !(await portListening(pport)), 'CONTROL: without the -displayfd fallback the Desktop cannot start while its display is held (the B-956d report)', perr);
  } finally {
    for (const pid of started) { try { process.kill(pid, 'SIGTERM'); } catch { } }
    await sleep(100);
    try { fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(xdir, { recursive: true, force: true }); } catch { }
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

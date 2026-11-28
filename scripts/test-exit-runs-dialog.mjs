#!/usr/bin/env node
// test-exit-runs-dialog — lane exit-see-whole (design 013 piece 1, 2026-10-03; the owner, with a chat full of
// "Machines · WIN-DESK1" cards: 「这些指令输入展示不全，也没地方看到完整版。remote界面也没法audit一个remote machine上被执行的完整指令」).
// DOM-FREE: the REAL client modules bundled by esbuild (build-version stubbed; utils stubbed for the Commands list so
// copyText is the clipboard stub) and run over a fake element tree.
//   §1 the Commands list's ONE row painter (src/lib/exit-runs-dialog.js paintRow): the summary keeps the head on one
//      line; the body OPENS with the whole command as itself (its lines kept) in a pre; no element of the row carries
//      a hover `title`; Copy puts the WHOLE command on the clipboard stub + a toast; a re-paint of a keyed row keeps
//      the node, its open state, one summary and one command (patched in place)
//   §1b (lane exit-runs-dialog-fit, 2.369.209) the duration words: a run that rounds to nothing reads "<0.1 s" (never
//      "0.0 s"), tenths otherwise; a 0 ms transfer row's size and duration share ONE outcome line
//   §2 the chat card's command block (src/lib/chat-renderers.js exitRunBlock) — lane exit-card-margin (2026-10-18, the
//      owner: 「No raw strings in cards」): the command sits in ONE closed 技术细节 fold (data-fold="tech") AFTER the output,
//      naming its length ("Command · 4096 characters" / "· 200 lines") and holding it whole (a 4 096-byte token, a
//      200-line script, four short lines — no clamp, no second fold); a card without `cmd` (an older card) draws none;
//      lane win-run-hide-console: a card whose device decoded the output as `utf-8-fallback` (its console code page was
//      not read) says so in ONE line of that fold (en / zh 按 UTF-8 解码（未取到该机控制台的代码页） / ja); any other
//      decoding, or none, draws nothing
//   §3 the Remote panel's machine row (source census of src/lib/sidebar-mounts.js): the Commands icon and the
//      last-run line both open openExitRunsDialog, no hover title on the last-run line; the CSS: both command pres
//      wrap anywhere; inside 技术细节 the whole command scrolls past 60vh (no four-line clamp left)
//   §5 lane phone-run-box (the owner's phone, 2026-11-17: «这个框在手机上根本无法查看里面的内容»): LAW 3 — every fold of the card
//      («Technical details», «Show output», an encoded command's «Show full command») opened by the person stays open across
//      a REDRAW (a fresh exitRunBlock of the same record, as chat-view's swap draws it), closed stays closed, keyed by the
//      message's id through the view's per-message fold state (the renderer passes this._peerFold); another message's card
//      and a card drawn without the state are closed as before. LAW 4 — the preview's common left margin (the fewest leading
//      spaces among its non-blank lines) is not DRAWN (a span chat.css hides) while the pre's text keeps every byte (Copy
//      reads textContent): «      42» draws «42»; a deeper line keeps its extra indent; a blank line stays; a tab-led line
//      hides nothing; the stderr preview too; «Show output» is drawn as itself. The redraw also through the VIEW'S OWN SWAP:
//      the real ChatView._swapMessageEl (chat-view.js bundled) with the view's _peerOpen / _setPeerOpen. Its CONTROLS: (h, h2)
//      no keeper (the release: a redraw / the swap closes every fold), (i) the release's drawing (the margin drawn)
//   §3b (B-f169 follow-up 2) the machine row's last-run words (src/lib/exit-access-dialog.js lastRunText, bundled): a run
//      allowed, then refused (outcome `quoting`) reads «not run — allowed, then refused …», never «exit ?»; CONTROL: no branch
//   §4 CONTROLS (patched copies of the source, bundled in memory — src/ never touched): the painter's hover title back;
//      the body's command cut to the head; the card without its command block; the command on the card again
//      outside its fold (d); a row without the icon; the 2.369.207 duration words (f); the fold without the device's
//      decoding handed in (g, the pre-lane line) — each goes red
//   §6 (B-a31a, the Remote panel under a burst; src/lib/mounts-live.js + its wiring in sidebar-mounts.js) a recorded command
//      reaches the open panel as ITS row's patch: the last-run line's words patched in place (the same node — a focus or a
//      press survives; every other node of the row kept), inserted after the exit summary when the row had none, removed
//      with no run; the rows found by their key; a pushed run written into the page's cache, and kept over an OLDER list a
//      refresh brings back (the newer `at` wins, caught-up entries leave); 60 frames inside one window paint ONCE; ONE
//      refresh in flight and ONE trailing (the callers' promise waits for the trailing one); the wiring: host-last-run → the
//      row patch, a list frame → the coalesced refresh (never a direct whole redraw), a failed or 20-s-held refresh of a
//      showing panel keeps it and says the server is slow (with Retry), a sidebar re-render never wipes a showing panel
//      (src/lib/sidebar.js), the builder and the patch draw the same line; the slow note's CSS reads theme variables only.
//      CONTROLS: (h) the release's listener, (i) a coalescer with no window, (j) the row rebuilt whole, (k) no single-flight
//      guard, (l) the release's sidebar re-render (the wipe), (m) an overlay that takes the older list — each goes red
//      THE CURE (07:52Z): ten re-renders over a healthy panel ⇒ 0 refreshes, the slow note + the recovery edge ⇒ 1, the
//      connection back ⇒ 1; the wiring (reconnect hook, ONE self-retry, «Loading…» first, the dots' one timer, a null run
//      forgets); CONTROLS (n) the tip before the cure (a slow panel «healthy»), (o) no reconnect hook
//      CURE 2 (08:26Z): one probe with an unchanged status replaces 0 row nodes (a changed one touches the dot and its words
//      only); two failures ⇒ one note, one 15-s timer; two re-renders over one note ⇒ one ask; the dots probe only on screen.
//      CONTROLS (p) a probe that rebuilds, (q) _autoTestHosts swapping the row, (r) a note made again, (s) asked every pass
// Run: node scripts/test-exit-runs-dialog.mjs
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(REPO, 'package.json'));
const esbuild = require('esbuild');
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600) : '')); } };
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), `vs-exit-runs-dialog-${process.pid}-`));
process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { } });

// ── a fake element tree: what the two painters touch, nothing more ──
class FakeEl {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null; this.dataset = {}; this.style = {}; this._text = ''; this._cls = []; this._ls = {}; this.attrs = {}; this.open = false; }
  get className() { return this._cls.join(' '); }
  set className(v) { this._cls = String(v).split(/\s+/).filter(Boolean); }
  get classList() { const c = this._cls; return { add: (...a) => a.forEach((x) => { if (!c.includes(x)) c.push(x); }), remove: (...a) => a.forEach((x) => { const i = c.indexOf(x); if (i >= 0) c.splice(i, 1); }), contains: (x) => c.includes(x), toggle: (x, on) => { const has = c.includes(x); const want = on === undefined ? !has : !!on; if (want && !has) c.push(x); if (!want && has) c.splice(c.indexOf(x), 1); return want; } }; }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
  set textContent(v) { this.children.forEach((c) => { c.parentElement = null; }); this.children = []; this._text = String(v); }
  appendChild(n) { if (n.parentElement) n.parentElement.children.splice(n.parentElement.children.indexOf(n), 1); n.parentElement = this; this.children.push(n); return n; }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? Object.assign(new FakeEl('#text'), { _text: n }) : n); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(ev, fn) { (this._ls[ev] ||= []).push(fn); }
  fire(ev) { for (const fn of this._ls[ev] || []) fn({ type: ev, target: this }); }
  get all() { return this.children.flatMap((c) => [c, ...c.all]); }
  _match(sel) { return sel.startsWith('.') ? sel.slice(1).split('.').every((c) => this._cls.includes(c)) : this.tagName === sel.toUpperCase(); }
  querySelectorAll(sel) { const m = /^:scope\s*>\s*(.+)$/.exec(sel); return m ? this.children.filter((c) => c._match(m[1].trim())) : this.all.filter((c) => c._match(sel.trim())); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
  insertBefore(n, ref) { if (n.parentElement) n.remove(); const i = ref ? this.children.indexOf(ref) : -1; n.parentElement = this; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; }   // _machineLine's own moves (§5)
  after(n) { const p = this.parentElement; if (!p) return; const i = p.children.indexOf(this); if (n.parentElement) n.remove(); n.parentElement = p; p.children.splice(i + 1, 0, n); }
  replaceWith(n) { const p = this.parentElement; if (!p) return; if (n.parentElement) n.remove(); p.children.splice(p.children.indexOf(this), 1, n); n.parentElement = p; this.parentElement = null; }   // chat-view _swapMessageEl's own move (§5)
  prepend(n) { if (n.parentElement) n.remove(); this.children.unshift(n); n.parentElement = this; }
  get isConnected() { let e = this; while (e.parentElement) e = e.parentElement; return !!e._root; }
}
const titled = (root) => [root, ...root.all].filter((n) => typeof n.title === 'string' && n.title !== '' || 'title' in n.attrs);
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { createElement: (t) => new FakeEl(t), addEventListener() {}, removeEventListener() {}, documentElement: new FakeEl('html'), body: new FakeEl('body'), querySelector: () => null, querySelectorAll: () => [], getElementById: () => null };
globalThis.addEventListener = () => {};

// ── the bundler: the real module, or a patched copy of one source file (in memory) ──
let nb = 0;
async function bundle(entry, patch = null) {
  const stubs = { name: 'stubs', setup(b) {
    b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'bv', namespace: 'stub' }));
    b.onResolve({ filter: /^\.\/utils\.js$/ }, (a) => (a.importer.endsWith('exit-runs-dialog.js') ? { path: 'utils', namespace: 'stub' } : undefined));
    b.onLoad({ filter: /^bv$/, namespace: 'stub' }, () => ({ contents: 'export const BUILD_VERSION = "test";' }));
    b.onLoad({ filter: /^utils$/, namespace: 'stub' }, () => ({ contents: 'export const createModalShell = () => { throw new Error("no modal in this suite"); };\nexport const showToast = (m) => { (globalThis.__toasts ||= []).push(String(m)); };\nexport const copyText = (s) => { (globalThis.__clip ||= []).push(s); return Promise.resolve(); };\nexport const heldWordsOf = () => null;' }));   // + heldWordsOf (a hold\'s words: test-hosts-held-census §8)
    if (patch) b.onLoad({ filter: /\.js$/ }, (a) => (a.path === path.join(REPO, patch.file) ? { contents: patch.src, loader: 'js', resolveDir: path.dirname(a.path) } : undefined));
  } };
  const out = path.join(SCR, `b${++nb}.mjs`);
  await esbuild.build({ entryPoints: [path.join(REPO, entry)], bundle: true, format: 'esm', platform: 'browser', outfile: out, plugins: [stubs], logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}
const patched = (file, from, to) => { const src = fs.readFileSync(path.join(REPO, file), 'utf8'); const p = src.replace(from, to); return { file, src: p, applies: p !== src }; };

// ── §1 the Commands list's row painter ──
const MULTI = 'powershell.exe -NoProfile -Command "\n\t$ErrorActionPreference=\'Stop\'\n\tGet-ChildItem C:\\\\nomad | Measure-Object\n"' + ' -x'.repeat(40);
const ROW = { id: 'k1', at: 1759490000000, name: 'agent A', cmd: MULTI, outcome: 'ran', code: 0, ms: 300, stdout: 'out\n', stderr: '', cut: { stdout: false, stderr: false } };
async function painterCase(D, label) {
  const node = D.paintRow(document.createElement('details'), ROW);
  const head = node.querySelector('.exit-runs-cmd'), whole = node.querySelector('.exit-runs-cmd-all'), body = node.querySelector(':scope > .exit-runs-out');
  const first = !!body && !!whole && body.children[0] === whole.parentElement, wholeText = whole && whole.textContent, wholeTag = whole && whole.tagName;
  globalThis.__clip = []; globalThis.__toasts = [];
  const copy = node.querySelector('.exit-runs-copy');
  if (copy && copy.onclick) { copy.onclick({ preventDefault() {}, stopPropagation() {} }); await new Promise((r) => setTimeout(r, 0)); }
  node.open = true;
  const again = D.paintRow(node, { ...ROW, stdout: 'out 2\n' });
  return { node, head: head && head.textContent, whole: wholeText, wholeTag, first, titles: titled(node).length, clip: globalThis.__clip.slice(), toasts: globalThis.__toasts.slice(), same: again === node, open: node.open, sums: node.querySelectorAll(':scope > summary').length, wholes: node.querySelectorAll('.exit-runs-cmd-all').length, out2: /out 2/.test(node.textContent), label };
}
console.log('§1 the Commands list: the whole command opens the row, Copy, no hover title, keyed in place');
const D = await bundle('src/lib/exit-runs-dialog.js');
const p1 = await painterCase(D);
ok(gateOf(p1.head) && !p1.head.includes('\n') && p1.head.length === 80 && gateOf(p1.head.endsWith('…')) && verdictOf(p1.head.startsWith('powershell.exe -NoProfile -Command " \t$Error')), 'the summary keeps the HEAD on one line (80 characters)', p1.head);
ok(p1.wholeTag === 'PRE' && p1.whole === MULTI && verdictOf(p1.first), 'the body OPENS with the WHOLE command as itself — its lines and tabs kept — in a pre', { whole: p1.whole, first: p1.first });
ok(p1.titles === 0, 'no element of the row carries a hover `title` (pre-fix: the whole command lived only in one)', p1.titles);
ok(p1.clip.length === 1 && p1.clip[0] === MULTI && verdictOf(p1.toasts.includes('Command copied')), 'Copy puts the WHOLE command on the clipboard (the stub) and says so', { clip: p1.clip, toasts: p1.toasts });
ok(gateOf(p1.same) && gateOf(p1.open) && p1.sums === 1 && p1.wholes === 1 && verdictOf(p1.out2), 'a re-paint of the keyed row is IN PLACE: the same node, still open, one summary, one whole command, the new output', p1);

// ── §2 the chat card's command block ──
// §1b (lane exit-runs-dialog-fit, DOM-free): the duration words — a run that rounds to nothing reads "<0.1 s", never a
// "0.0 s"; tenths otherwise; junk / negative = nothing
const DUR = (f) => { const got = [0, 12, 49, 50, 100, 1234, -5, NaN, undefined, '2500'].map((ms) => f(ms)); return { ok: JSON.stringify(got) === JSON.stringify(['<0.1 s', '<0.1 s', '<0.1 s', '0.1 s', '0.1 s', '1.2 s', '<0.1 s', '<0.1 s', '<0.1 s', '2.5 s']), got }; };
{ const r = DUR(D.durationText); ok(verdictOf(r.ok), `§1b durationText: 0 / 12 / 49 ms → "<0.1 s", 50 / 100 ms → "0.1 s", 1234 → "1.2 s", junk → "<0.1 s" (${r.got.join(' | ')})`); }
{ const n = D.paintRow(document.createElement('details'), { at: 1, name: 'n', cmd: 'pull /a → /b', ms: 0, outcome: 'ok', transfer: { verb: 'pull', bytes: 2048, verified: 'sha256', local: '/b', remote: '/a' } }); const o = n.querySelector('.exit-runs-outcome'); const ms = o && o.querySelector('.exit-runs-ms'), v = o && o.querySelector('.exit-runs-verdict');
  ok(!!(ms && v && ms.textContent === '<0.1 s' && /2/.test(v.textContent)), `§1b a 0 ms transfer row: its size and "<0.1 s" in ONE outcome line (${v && v.textContent} · ${ms && ms.textContent})`); }

{ const n = D.paintRow(document.createElement('details'), { at: 1, name: 'n', cmd: 'dir', ms: 0, outcome: 'refused', refusal: 'device_agent_outdated', hostId: 'win-a' }); const o = n.querySelector('.exit-runs-outcome'); const slot = n.querySelector('.exit-runs-door'); const door = slot && slot.querySelector('.agent-update-door'); const v = o && o.querySelector('.exit-runs-verdict');
  const ran = D.paintRow(document.createElement('details'), { at: 1, name: 'n', cmd: 'dir', ms: 0, outcome: 'ran', code: 0 });
  ok(!!door && door.textContent === 'Update its agent…' && !o.querySelector('.agent-update-door') && !!v && v.textContent === 'not run — the agent is too old to run commands on Windows; rerun the install command' && !ran.querySelector('.agent-update-door'), 'B-bd27 X1: a run refused for an old agent carries «Update its agent…» in its OWN slot under the outcome line (the line keeps its words); a run that ran carries none', { door: door && door.textContent, verdict: v && v.textContent }); }

console.log('§2 the chat card: the output, then ONE closed 技术细节 fold — the command\'s length, the command whole (lane exit-card-margin)');
const R = await bundle('src/lib/chat-renderers.js');
const ONE = 'echo ' + 'Q'.repeat(4091), L200 = Array.from({ length: 200 }, (_, i) => `l${i}`).join('\n');
const cardOf = (Rm, x) => { const b = Rm.exitRunBlock(x); const det = b.querySelector(':scope > .chat-exit-tech'); const sum = det && det.querySelector(':scope > summary'); const len = det && det.querySelector('.chat-exit-cmd-len'); const box = b.querySelector('.chat-exit-cmd-box'); const pre = b.querySelector('.chat-exit-cmd');
  return { b, det, sum, box, pre, text: pre && pre.textContent, label: sum && sum.textContent, len: len && len.textContent, inFold: !!(det && pre && det.all.includes(pre)), last: !!det && b.children[b.children.length - 1] === det, closed: !!det && det.open === false, fold: det ? det.dataset.fold : null,
    folds: b.all.filter((n) => n.tagName === 'DETAILS' && n.dataset.fold === 'tech').length, clamp: !!b.querySelector('.chat-exit-cmd-fold') || !!(box && box.classList.contains('chat-exit-cmd-folded')), wrapped: !!pre && pre.classList.contains('chat-pre-wrapped') }; };
const c1 = cardOf(R, { cmd: ONE, code: 0, stdout: 'ok\n', stderr: '', cut: {} });
ok(c1.text === ONE && c1.text.length === 4096 && gateOf(c1.wrapped) && c1.pre.tagName === 'PRE' && verdictOf(c1.inFold), 'a 4 096-byte one-token command is WHOLE in a wrapped pre — inside the fold', { len: c1.text && c1.text.length, inFold: c1.inFold });
ok(c1.fold === 'tech' && c1.label === 'Technical details' && gateOf(c1.closed) && gateOf(c1.last) && c1.folds === 1 && c1.len === 'Command · 4096 characters' && !c1.clamp, 'ONE closed 技术细节 fold (data-fold="tech") AFTER the output, naming the length of a one-liner in characters; no clamp, no second fold inside', { label: c1.label, len: c1.len, last: c1.last, folds: c1.folds, clamp: c1.clamp });
const c2 = cardOf(R, { cmd: L200, code: 0, stdout: '', stderr: '', cut: {} });
ok(c2.text === L200 && gateOf(c2.inFold) && c2.len === 'Command · 200 lines' && gateOf(c2.last) && !!c2.b.querySelector('.chat-exit-none'), 'a 200-line script keeps its lines, its length in lines — with no output, the fold follows the no-output line', c2.len);
const c3 = cardOf(R, { cmd: 'a\nb\nc\nd', code: 0, stdout: 'x', stderr: '', cut: {} });
ok(c3.text === 'a\nb\nc\nd' && gateOf(c3.inFold) && c3.len === 'Command · 4 lines' && !c3.clamp, 'four short lines: whole, in the fold too (a command on the card is technical detail)', c3.len);
const c4 = cardOf(R, { code: 0, stdout: 'x', stderr: '', cut: {} });
ok(!c4.det && !c4.box && !!c4.b.querySelector('.chat-exit-out'), 'a card without `cmd` (an older card) draws no fold, its output as before');
// lane win-run-hide-console: the output was decoded as UTF-8 because the machine's console code page was not read — ONE line
// in the 技术细节 fold (never the card's sentence: actor + verb + named object); any other decoding, or none, draws nothing
const ENC_EN = "Decoded as UTF-8 (this machine's console code page was not read)";
const FALLBACK = { cmd: 'type missing.txt', code: 1, stdout: '', stderr: '\u03f5\u0373\ufffd', cut: {}, encoding: 'utf-8-fallback' };
const encOf = (Rm, x) => { const c = cardOf(Rm, x); const lines = c.b.querySelectorAll('.chat-exit-enc'); return { c, n: lines.length, text: lines[0] ? lines[0].textContent : null, inFold: !!(c.det && lines[0] && c.det.all.includes(lines[0])) }; };
const e1 = encOf(R, FALLBACK);
ok(e1.n === 1 && e1.text === ENC_EN && gateOf(e1.inFold) && e1.c.folds === 1 && verdictOf(e1.c.inFold), 'a card whose output fell back to UTF-8: ONE line in its 技术细节 fold says so (the command still whole in the same fold)', e1.text);
const e2 = ['gbk', 'utf-8', 'shift_jis', undefined].map((encoding) => encOf(R, { cmd: 'ver', code: 0, stdout: 'x', stderr: '', cut: {}, ...(encoding ? { encoding } : {}) }));
ok(verdictOf(e2.every((e) => e.n === 0 && e.c.det)), '…a gbk / utf-8 / shift_jis decoding, or none (POSIX, an older card), draws no such line', e2.map((e) => e.n));
const langBundle = async (lang) => { const g = globalThis.localStorage.getItem; globalThis.localStorage.getItem = (k) => (k === 'vibespace.lang' ? lang : null); try { return await bundle('src/lib/chat-renderers.js'); } finally { globalThis.localStorage.getItem = g; } };
const ez = encOf(await langBundle('zh'), FALLBACK), ej = encOf(await langBundle('ja'), FALLBACK);
ok(ez.text === '按 UTF-8 解码（未取到该机控制台的代码页）' && ez.c.label === '技术细节', 'zh: 「按 UTF-8 解码（未取到该机控制台的代码页）」 under 技术细节', [ez.text, ez.c.label]);
ok(ej.text === 'UTF-8 としてデコード（このマシンのコンソールのコードページを取得できませんでした）' && ej.n === 1, 'ja: 「UTF-8 としてデコード（このマシンのコンソールのコードページを取得できませんでした）」', ej.text);

// ── §3 the machine row + the CSS (source census) ──
console.log('§3 the Remote panel\'s machine row and the CSS');
const SM = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
const rowCensus = (src) => ({
  icon: /ibtn\(MI\.list, tr\('Commands run on \{machine\}', \{ machine: h\.name \}\) \+ '…', async \(\) => \{ openExitRunsDialog\(this\.app, \{ hostId: h\.id, name: h\.name \}\); \}\)/.test(src),
  last: /const lr = document\.createElement\('button'\);[\s\S]{0,400}lr\.onclick = \(e\) => \{ e\.stopPropagation\(\); openExitRunsDialog\(this\.app, \{ hostId: h\.id, name: h\.name \}\); \};/.test(src),
  noTitle: !/lr\.title =/.test(src),
  imported: /^import \{ openExitRunsDialog \} from '\.\/exit-runs-dialog\.js';/m.test(src),
});
const rc = rowCensus(SM);
ok(gateOf(rc.icon) && gateOf(rc.last) && gateOf(rc.noTitle) && verdictOf(rc.imported), 'the machine row: the Commands icon and the last-run line both open openExitRunsDialog; the last-run line has no hover title', rc);
const CSS = fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8'), STY = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
const rule = (css, sel) => { const m = new RegExp('^' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}', 'm').exec(css); return m ? m[1] : ''; };
const wraps = (r) => /white-space: pre-wrap/.test(r) && /overflow-wrap: anywhere/.test(r);
ok(gateOf(wraps(rule(CSS, '.chat-exit-cmd'))) && gateOf(wraps(rule(CSS, '.chat-exit-out, .chat-exit-out-all'))) && verdictOf(wraps(rule(STY, '.exit-runs-cmd-all'))), 'both command pres and the card\'s output wrap anywhere (a 1 365-byte token breaks on a phone)');
ok(gateOf(/max-height: 60vh; overflow: auto/.test(rule(CSS, '.chat-exit-tech .chat-exit-cmd'))) && !/chat-exit-cmd-folded|chat-exit-cmd-fold\b/.test(CSS), 'inside 技术细节 the whole command scrolls past 60vh; no four-line clamp is left in chat.css');

// ── §3b B-f169 follow-up 2: a run ALLOWED, THEN REFUSED (the agent said cmd.exe after the Allow) is never «exit ?» on the row ──
console.log('§3b the machine row\'s last-run words for a run allowed, then refused (B-f169)');
const XA = await bundle('src/lib/exit-access-dialog.js');
const QLR = { cmd: 'cmd /c dir C:/My Files', outcome: 'quoting', code: null, at: Date.now() - 60000, by: { name: 'conv' } };
const qWords = XA.lastRunText(QLR);
ok(gateOf(/not run — allowed, then refused: this machine runs commands with cmd\.exe; write the command as one line/.test(qWords)) && !/exit/.test(qWords), 'a run allowed, then refused (the agent said cmd.exe) reads «not run — allowed, then refused …» on the machine row (the Remote row and «Who can use it» share these words) — never «exit ?»', qWords);
ok(verdictOf(/, exit 0$/.test(XA.lastRunText({ ...QLR, outcome: 'ran', code: 0 }))), '…a run that ran still says its exit code', XA.lastRunText({ ...QLR, outcome: 'ran', code: 0 }));
const pq = patched('src/lib/exit-access-dialog.js', /\n  \/\/ B-f169 follow-up 2:[^\n]*\n  if \(lr\.outcome === 'quoting'\)[^\n]*\n/, '\n');
ok(gateOf(pq.applies) && verdictOf(/, exit \?$/.test((await bundle('src/lib/exit-access-dialog.js', pq)).lastRunText(QLR))), 'CONTROL: the tip before this cure (no branch for the outcome) — the row reads «exit ?» for a run that never ran: §5 goes red');

// ── §4 controls ──
console.log('§4 controls (patched copies, bundled in memory)');
const pa = patched('src/lib/exit-runs-dialog.js', "  main.append(el('code', 'exit-runs-cmd',", "  sum.title = cmd; // CONTROL: the hover title back\n  main.append(el('code', 'exit-runs-cmd',");
const pb = patched('src/lib/exit-runs-dialog.js', "const w = wrapPre('exit-runs-cmd-all', cmd);", "const w = wrapPre('exit-runs-cmd-all', flat.slice(0, CMD_HEAD)); // CONTROL: the head again");
const pf = patched('src/lib/exit-runs-dialog.js', "return Number(s) === 0 ? '<0.1 s' : `${s} s`;", "return `${s} s`; // CONTROL: the 2.369.207 words");
const TECH = "  const tech = typeof x.cmd === 'string' && x.cmd ? exitTechFold(x.cmd, { encoding: x.encoding }) : null;";
const pc = patched('src/lib/chat-renderers.js', TECH, '  const tech = null; // CONTROL: no command block');
const pd = patched('src/lib/chat-renderers.js', TECH, TECH + "\n  if (tech) wrap.appendChild(exitCmdBlock(x.cmd)); // CONTROL: the command on the card again, outside its fold");
const pg = patched('src/lib/chat-renderers.js', TECH, "  const tech = typeof x.cmd === 'string' && x.cmd ? exitTechFold(x.cmd) : null; // CONTROL: the pre-lane fold, no decoding handed in");
ok(gateOf(pa.applies) && gateOf(pb.applies) && gateOf(pc.applies) && gateOf(pd.applies) && gateOf(pf.applies) && verdictOf(pg.applies), 'every patch applies');
ok(encOf(await bundle('src/lib/chat-renderers.js', pg), FALLBACK).n === 0, 'CONTROL (g): the fold without the device\'s decoding handed in (the pre-lane line) — a utf-8-fallback card says nothing: §2\'s fallback line goes red');
ok(!DUR((await bundle('src/lib/exit-runs-dialog.js', pf)).durationText).ok, 'CONTROL (f): the old duration words ("0.0 s" for a 0 ms transfer) — §1b goes red');
ok((await painterCase(await bundle('src/lib/exit-runs-dialog.js', pa))).titles > 0, 'CONTROL (a): the hover title back on the row — §1\'s title census goes red');
const pbr = await painterCase(await bundle('src/lib/exit-runs-dialog.js', pb));
ok(pbr.whole !== MULTI, 'CONTROL (b): the body\'s command cut to the head — §1\'s whole-command row goes red');
ok(!cardOf(await bundle('src/lib/chat-renderers.js', pc), { cmd: ONE, code: 0, stdout: 'x', stderr: '', cut: {} }).pre, 'CONTROL (c): a card without its command block — §2 goes red');
ok(!cardOf(await bundle('src/lib/chat-renderers.js', pd), { cmd: L200, code: 0, stdout: 'x', stderr: '', cut: {} }).inFold, 'CONTROL (d): the command on the card again, outside its 技术细节 fold (the pre-lane shape) — §2 goes red');
const noIcon = SM.replace(/\n {8}ibtn\(MI\.list,[^\n]*\n/, '\n');
ok(noIcon !== SM && !rowCensus(noIcon).icon, 'CONTROL (e): a row without the Commands icon — §3\'s census goes red');

// ── §5 lane phone-run-box: law 3 (the folds kept across a redraw) and law 4 (a short output shown as itself) ──
console.log('§5 the card on a phone: its folds kept across a redraw (law 3); the preview\'s common margin not drawn, every byte kept (law 4)');
const FOLDS = new Set(), KEEPER = { isOpen: (k) => FOLDS.has(k), set: (k, v) => { if (v) FOLDS.add(k); else FOLDS.delete(k); } };
const ENC = 'powershell.exe -EncodedCommand ' + Buffer.from('Get-Date', 'utf16le').toString('base64');
const RUN6 = { cmd: ENC, code: 0, stdout: Array.from({ length: 6 }, (_, i) => `line ${i}`).join('\n') + '\n', stderr: '', cut: {} };
const press = (det, open) => { det.open = open; det.fire('toggle'); };
const foldsOf = (b) => ({ tech: b.querySelector('.chat-exit-tech'), out: b.querySelector('.chat-exit-out-full'), raw: b.querySelector('.chat-exit-cmd-raw') });
const keepCase = (Rm) => {
  FOLDS.clear();
  const f1 = foldsOf(Rm.exitRunBlock(RUN6, { id: 'm1', fold: KEEPER }));
  const shape = !!(f1.tech && f1.out && f1.raw) && !f1.tech.open && !f1.out.open && !f1.raw.open;
  press(f1.tech, true); press(f1.out, true); press(f1.raw, true);
  const f2 = foldsOf(Rm.exitRunBlock(RUN6, { id: 'm1', fold: KEEPER }));   // the redraw: a NEW card of the same record
  const kept = !!(f2.tech && f2.tech.open && f2.out.open && f2.raw.open);
  press(f2.out, false);
  const f3 = foldsOf(Rm.exitRunBlock(RUN6, { id: 'm1', fold: KEEPER }));
  const closedStays = !!(f3.tech.open && !f3.out.open && f3.raw.open);
  const other = foldsOf(Rm.exitRunBlock(RUN6, { id: 'm2', fold: KEEPER })), bare = foldsOf(Rm.exitRunBlock(RUN6));
  return { shape, kept, closedStays, others: !other.tech.open && !other.out.open && !bare.tech.open && !bare.out.open, keys: [...FOLDS].sort() };
};
const k5 = keepCase(R);
ok(gateOf(k5.shape) && verdictOf(k5.kept), 'law 3: «Technical details», «Show output» and an encoded command\'s «Show full command», opened, are OPEN again on the redrawn card', k5);
ok(gateOf(k5.closedStays) && JSON.stringify(k5.keys) === JSON.stringify(['m1#raw', 'm1#tech']), 'law 3: one closed by the person stays closed on the next redraw; the state is the message\'s (`<id>#tech`, `#out`, `#raw`)', k5.keys);
ok(verdictOf(k5.others), 'law 3: another message\'s card, and a card drawn without the view\'s state, are closed as before', k5);
const RSRC = fs.readFileSync(path.join(REPO, 'src/lib/chat-renderers.js'), 'utf8');
// THE VIEW'S OWN SWAP (主开发 2026-11-17 23:4xZ: «one leg that redraws the row through the view's own swap while each fold is
// open»): the REAL ChatView.prototype._swapMessageEl moves a fresh card of the same record into the list in place of the old
// one, and the fold state is the view's own — _peerOpen through _setPeerOpen, handed to the renderer as chat-view's
// constructor hands it (the `peerFold` literal pinned below)
const CVM = await bundle('src/lib/chat-view.js');
const CV_SRC = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
const swapCase = (Rm) => {
  const V = Object.create(CVM.ChatView.prototype);
  Object.assign(V, { _peerOpen: new Set(), _elements: new Map(), _runs: [], _runExpanded: new Set(), _runStickyOpen: new Set(), _renderers: { addWrapToggles() {}, addOpenInEditorBtn() {} }, _applyElementMarks() {}, _reserveFreshHeights() {} });
  const peerFold = { isOpen: (id) => V._peerOpen.has(id), set: (id, open, el) => V._setPeerOpen(id, open, el) };   // chat-view's constructor, as is
  const cardOf = () => { const c = document.createElement('div'); c.className = 'chat-msg chat-vs-notice chat-machine-compact chat-run-member'; c.dataset.msgId = 'm1'; c.appendChild(Rm.exitRunBlock(RUN6, { id: 'm1', fold: peerFold })); return c; };
  const list = document.createElement('div'), old = cardOf(); list.appendChild(old); V._elements.set('m1', old);
  const f0 = foldsOf(old); press(f0.tech, true); press(f0.out, true); press(f0.raw, true);
  const fresh = cardOf(), back = V._swapMessageEl(old, fresh, 'm1'), f1 = foldsOf(fresh);
  return { swapped: back === fresh && list.children[0] === fresh && V._elements.get('m1') === fresh && fresh.classList.contains('chat-machine-compact'), open: !!(f1.tech.open && f1.out.open && f1.raw.open), state: [...V._peerOpen].sort() };
};
const sw = swapCase(R);
ok(verdictOf(/peerFold: \{ isOpen: \(id\) => this\._peerOpen\.has\(id\), set: \(id, open, el\) => this\._setPeerOpen\(id, open, el\) \}/.test(CV_SRC)), 'law 3: chat-view hands the renderer ITS per-message fold state (peerFold → _peerOpen / _setPeerOpen) — the state this leg drives');
ok(gateOf(sw.swapped) && gateOf(sw.open) && JSON.stringify(sw.state) === JSON.stringify(['m1#out', 'm1#raw', 'm1#tech']), 'law 3, THE VIEW\'S OWN SWAP: each fold open, the row redrawn through ChatView._swapMessageEl (a fresh card of the same record in its place, the run classes carried) — every fold is open on the new card BECAUSE THE KEEPER OPENS IT AT THE DRAW (exitRunBlock reading the view\'s _peerOpen); the swap itself carries no inner <details>', sw);
ok(verdictOf(/el\.appendChild\(exitRunBlock\(msg\.exitRun, \{ id: msg\.id, fold: this\._peerFold \}\)\)/.test(RSRC)), 'law 3: the notice renderer hands the card its message id and the view\'s per-message fold state (this._peerFold, the compact line\'s own)');
const drawnOf = (pre) => pre.children.length ? pre.children.filter((c) => !c._cls.includes('chat-exit-margin')).map((c) => c.textContent).join('') : pre.textContent;
const marginCase = (Rm, stdout, stderr = '') => { const pre = Rm.exitRunBlock({ cmd: 'x', code: 0, stdout, stderr, cut: {} }).querySelector('.chat-exit-out'); return { text: pre.textContent, drawn: drawnOf(pre), spans: pre.querySelectorAll('.chat-exit-margin').length }; };
const m1 = marginCase(R, '      42\n'), m2 = marginCase(R, '  a\n    b\n\n  c\n'), m3 = marginCase(R, '\tx\n  y\n'), m4 = marginCase(R, '', '   err: no such file\n');
ok(m1.text === '      42' && m1.drawn === '42' && m1.spans === 1, 'law 4: `wc -l`\'s «      42» is DRAWN as «42» — the pre\'s text (Copy reads it) keeps all six spaces', m1);
ok(m2.text === '  a\n    b\n' && m2.drawn === 'a\n  b\n' && m3.text === '\tx\n  y' && m3.drawn === '\tx\n  y' && m3.spans === 0 && m4.drawn === 'err: no such file', 'law 4: the COMMON margin only — a deeper line keeps its extra indent, a blank line stays, a tab-led line hides nothing, the stderr preview too', { m2, m3, m4 });
const all5 = R.exitRunBlock({ cmd: 'x', code: 0, stdout: Array.from({ length: 5 }, (_, i) => `    ${i}`).join('\n'), stderr: '', cut: {} }).querySelector('.chat-exit-out-all');
ok(!!all5 && gateOf(all5.textContent.startsWith('    0')) && all5.querySelectorAll('.chat-exit-margin').length === 0, 'law 4: «Show output» is drawn as itself (the stored head, every byte, no margin hidden)');
ok(verdictOf(/display: none/.test(rule(CSS, '.chat-exit-margin'))), 'law 4: chat.css draws no `.chat-exit-margin` (the span the preview\'s margin sits in)');
const ph = patched('src/lib/chat-renderers.js', "  if (!det || !fold || !id) return;\n  const key = `${id}#${which}`;", "  return; // CONTROL: no keeper (the release)\n  const key = `${id}#${which}`;");
const pi = patched('src/lib/chat-renderers.js', '  drawPreview(pre, pv.lines);', "  pre.textContent = pv.lines.join('\\n'); // CONTROL: the release's drawing");
ok(gateOf(ph.applies) && verdictOf(pi.applies), '§5 patches apply');
// ONE WORD FOR ONE THING (主开发's look, 2026-11-18 02:34Z: «退出码 0» in the head, «退出 0» on the card, an English «exit 0» on each
// row): the REAL _machineLine draws a run's compact line; its outcome is said in the page's words through the head's keys
const ZH = await langBundle('zh');
const mlCard = (outcome) => ({ id: 'ml1', role: 'user', content: [{ type: 'text', text: outcome === 'timed_out' ? 'ran `sleep 9` on Mac — timed out after 0.2 s' : 'ran `wc -l` on Mac — exit 0 · 0.2 s' }], originKind: 'peer-message', peerFrom: 'Machines · Mac', peerVia: 'notification', exitRun: { cmd: 'wc -l', code: 0, ms: 200, stdout: '1\n', stderr: '', cut: {}, ...(outcome === 'timed_out' ? { timedOut: true, code: null } : {}) } });
const rowOut = (Rm, outcome) => {
  const el = document.createElement('div'), card = mlCard(outcome);
  Rm.ChatRenderers.prototype._machineLine.call({ _peerFold: null }, el, card, { what: 'wc -l', outcome: outcome === 'timed_out' ? 'timed out after 0.2 s' : 'exit 0 · 0.2 s', error: '', failed: outcome === 'timed_out' });
  return el.querySelector('.chat-mline-out')?.textContent ?? null;
};
const rz = [rowOut(ZH, 'ok'), rowOut(ZH, 'timed_out')], re = rowOut(R, 'ok');
const zhD = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default;
ok(rz[0] === '· 退出码 0 · 0.2 s' && rz[1] === '· 0.2 秒后超时' && re === '· exit 0 · 0.2 s', 'ONE WORD: a run\'s compact line says its outcome in the page\'s words — zh «· 退出码 0 · 0.2 s» / «· 0.2 秒后超时», en as before', { zh: rz, en: re });
ok(verdictOf(['Ran a command on {machine} — exit {code} · {secs}', 'last: exit {code}', 'exit {code}'].every((k) => typeof zhD[k] === 'string' && zhD[k].includes('退出码 {code}'))), 'ONE WORD: the card\'s sentence, the group\'s head and the row say 退出码 in zh — never a bare 退出', ['Ran a command on {machine} — exit {code} · {secs}', 'last: exit {code}', 'exit {code}'].map((k) => zhD[k]));
const PH = await bundle('src/lib/chat-renderers.js', ph);
ok(!keepCase(PH).kept, 'CONTROL (h): no keeper (the release) — the redraw closes every fold: §5\'s law 3 leg goes red');
const pj = patched('src/lib/chat-renderers.js', '    const outcome = runOutcomeWords(msg) ?? ml.outcome;', '    const outcome = ml.outcome; // CONTROL: the hub\'s English sentence on the row');
const zhPatched = async (patch) => { const g = globalThis.localStorage.getItem; globalThis.localStorage.getItem = (k) => (k === 'vibespace.lang' ? 'zh' : null); try { return await bundle('src/lib/chat-renderers.js', patch); } finally { globalThis.localStorage.getItem = g; } };
const rj = pj.applies ? rowOut(await zhPatched(pj), 'ok') : null;
ok(gateOf(pj.applies) && rj === '· exit 0 · 0.2 s', 'CONTROL (j): the row with the hub\'s English words (the release), bundled in zh — the zh page says «· exit 0 · 0.2 s»: §5\'s one-word leg goes red', rj);
ok(gateOf(swapCase(PH).swapped) && !swapCase(PH).open, 'CONTROL (h2): no keeper (the release) through the view\'s own swap — the swapped card\'s folds are CLOSED: §5\'s swap leg goes red');
ok(marginCase(await bundle('src/lib/chat-renderers.js', pi), '      42\n').drawn !== '42', 'CONTROL (i): the release\'s drawing — «      42» drawn with its margin: §5\'s law 4 leg goes red');

// ── §6 B-a31a the Remote panel under a burst ──
console.log('§6 B-a31a: a recorded command patches its row in place; a burst paints once; one refresh in flight; a slow server keeps the panel');
const mkRow = (withLast) => {
  const row = document.createElement('div'); row.className = 'mounts-row';
  const top = document.createElement('div'); top.className = 'mounts-row-top';
  const sub = document.createElement('div'); sub.className = 'mounts-path';
  const ex = document.createElement('button'); ex.className = 'mounts-exit-line mounts-exit-door'; ex.textContent = 'Exit: network — nobody';   // B-cb72: the summary IS the door
  row.append(top, sub, ex);
  if (withLast) { const lr = document.createElement('button'); lr.className = 'mounts-path mounts-exit-line mounts-exit-last'; lr.textContent = 'Last run: echo 1'; row.appendChild(lr); }
  const stuck = document.createElement('div'); stuck.className = 'mounts-path mounts-exit-line mounts-agent-stuck'; row.appendChild(stuck);
  return row;
};
const lineOf = (t) => { const b = document.createElement('button'); b.className = 'mounts-path mounts-exit-line mounts-exit-last'; b.textContent = t; return b; };
const patchCase = (M) => {
  const r1 = mkRow(true), before = [...r1.children], n2 = lineOf('Last run: echo 2');
  const did1 = M.patchLastRunRow(r1, n2);
  const kept = before.length === r1.children.length && before.every((k, i) => r1.children[i] === k);
  const r2 = mkRow(false), did2 = M.patchLastRunRow(r2, lineOf('Last run: ls'));
  const r3 = mkRow(true), did3 = M.patchLastRunRow(r3, null);
  return {
    did: [did1, did2, did3], kept,
    replaced: kept && r1.children[3].textContent === 'Last run: echo 2' && r1.querySelectorAll(':scope > .mounts-exit-last').length === 1,
    inserted: !!r2.children[3] && r2.children[3].textContent === 'Last run: ls' && r2.children[2].className === 'mounts-exit-line mounts-exit-door' && r2.children[4]._cls.includes('mounts-agent-stuck'),
    removed: r3.querySelectorAll(':scope > .mounts-exit-last').length === 0 && r3.children.length === 4,
  };
};
const coalesceCase = (M) => {
  const timers = []; let runs = 0;
  const f = M.coalesce(() => { runs++; }, 250, { setTimer: (fn, w) => timers.push({ fn, win: w }) });
  for (let i = 0; i < 60; i++) f();
  const set1 = timers.length, win = timers[0] && timers[0].win;
  timers.splice(0).forEach((t) => t.fn());
  const after1 = runs;
  f(); f();
  const set2 = timers.length;
  timers.splice(0).forEach((t) => t.fn());
  return { set1, win, after1, set2, runs };
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const flightCase = async (M) => {
  let runs = 0, inFlight = 0, most = 0; const gates = [];
  const f = M.singleFlight(() => { runs++; inFlight++; most = Math.max(most, inFlight); const n = runs; return new Promise((res) => gates.push(() => { inFlight--; res(n); })); });
  const p0 = f(); const started = runs;
  const ps = Array.from({ length: 5 }, () => f());
  const same = ps.every((p) => p === ps[0]);
  const duringFirst = runs;
  gates.shift()(); await tick(); await tick();
  const afterFirst = runs;
  if (gates.length) gates.shift()();
  for (const g of gates.splice(0)) g();
  const got = await Promise.race([ps[0], tick().then(tick).then(() => 'never')]);
  const first = await p0;
  return { started, same, duringFirst, afterFirst, runs, most, got, first };
};
const ML = await bundle('src/lib/mounts-live.js');
const pr = patchCase(ML);
ok(gateOf(pr.replaced) && pr.did[0] === 'updated', 'a recorded command: the row\'s last-run line takes its new words IN PLACE — the same row, EVERY node the same node (the line too: a focus or a press survives), one last-run line', pr);
const cacheCase = (M) => {
  const L = document.createElement('div');
  const a = document.createElement('div'); a.className = 'mounts-row'; a._hostId = 'host-a';
  const b = document.createElement('div'); b.className = 'mounts-row'; b._hostId = 'host-b';
  const loose = document.createElement('div'); loose.className = 'mounts-row'; // the local machine's row: no key
  L.append(a, loose, b);
  const rows = M.rowsByHost(L);
  const hosts = [{ id: 'host-a', exit: { lastRun: { at: 10, cmd: 'old' } } }, { id: 'host-b' }];
  const noted = M.noteLastRun(hosts, 'host-b', { at: 5, cmd: 'b1' }), none = M.noteLastRun(hosts, 'host-x', { at: 1 });
  const seen = new Map([['host-a', { at: 20, cmd: 'pushed' }], ['host-b', { at: 3, cmd: 'older' }], ['host-x', { at: 9, cmd: 'gone' }]]);
  const list = [{ id: 'host-a', exit: { lastRun: { at: 10, cmd: 'old' } } }, { id: 'host-b', exit: { lastRun: { at: 5, cmd: 'b1' } } }];
  const keptIds = M.overlayLastRuns(list, seen);
  return { byKey: rows.size === 2 && rows.get('host-a') === a && rows.get('host-b') === b, noted: noted === hosts[1] && hosts[1].exit.lastRun.cmd === 'b1' && none === null,
    overlay: list[0].exit.lastRun.cmd === 'pushed' && list[1].exit.lastRun.cmd === 'b1' && keptIds.join() === 'host-a' && [...seen.keys()].join() === 'host-a', keptIds, left: [...seen.keys()] };
};
const cc = cacheCase(ML);
ok(verdictOf(cc.byKey), 'the panel\'s rows are found by their key (`row._hostId`); a row with no key (this machine) is not one of them');
ok(verdictOf(cc.noted), 'a pushed last run lands in the page\'s cached hosts list (the doors read it); a host the list lacks is left alone');
ok(verdictOf(cc.overlay), 'a refresh that brings back an OLDER list keeps the pushed run (the newer `at` wins); a pushed run the list caught up with, or of a host gone, leaves', cc);
ok(gateOf(pr.inserted) && pr.did[1] === 'inserted', 'a row with no last run yet: the line goes right after the exit summary (before the agent line)', pr.did);
ok(gateOf(pr.removed) && pr.did[2] === 'removed', 'a row whose machine has no last run: its line is removed, nothing else', pr.did);
const cr = coalesceCase(ML);
ok(cr.set1 === 1 && cr.win === 250 && cr.after1 === 1 && cr.set2 === 1 && cr.runs === 2, '60 frames inside one 250 ms window paint ONCE; the next frame opens the next window', cr);
const fr = await flightCase(ML);
ok(fr.started === 1 && gateOf(fr.same) && fr.duringFirst === 1 && fr.afterFirst === 2 && fr.runs === 2 && fr.most === 1 && fr.got === 2 && fr.first === 1, 'ONE refresh in flight: five calls during it fold into ONE trailing refresh (never two at once), and their promise is the trailing one\'s', fr);
const wiring = (src) => ({
  patchFrame: /if \(msg\.type === 'host-last-run' && msg\.hostId\) this\._patchHostLastRun\(msg\.hostId, msg\.lastRun \|\| null\);/.test(src),
  listSoon: /msg\.type === 'hosts-updated'\) && this\._activeTab === 'mounts'\) this\._renderMountsSoon\(\);/.test(src),
  noDirect: !/msg\.type === 'hosts-updated'\)[^\n]*this\._renderMounts\(\)/.test(src),
  flight: /this\._mountsFlight = singleFlight\(\(\) => this\._renderMountsOnce\(\)\)/.test(src),
  soon: /this\._mountsSoon = coalesce\(/.test(src),
  paint: /this\._lastRunPaint = coalesce\(/.test(src) && /patchLastRunRow\(row, this\._lastRunLine\(hh\)\)/.test(src),
  keep: /if \(had\) \{ this\._mountsSlow\(\); return; \}/.test(src) && /setTimeout\(\(\) => this\._mountsSlow\(\), 4000\)/.test(src) && /await Promise\.race\(\[Promise\.all\(\[api\('\/api\/mounts'\)/.test(src) && /no\(new Error\('held'\)\), 20000\)/.test(src),
  overlay: /overlayLastRuns\(hd && hd\.hosts, this\._lastRunSeen\);/.test(src) && /const rows = rowsByHost\(this\.listEl\);/.test(src),
  same: /\{ const lr = this\._lastRunLine\(h\); if \(lr\) row\.appendChild\(lr\); \}/.test(src),
  reconnect: /this\.app\.ws\.onStateChange\?\.\(\(up\) => \{ if \(up && this\._activeTab === 'mounts'\) this\._renderMountsSoon\(\); \}\);/.test(src),
  oneRetry: /slowNote\(panel, \{ words: tr\('The server is slow to answer — this is the list it gave last\.'\), retry: tr\('Retry'\), retrying: tr\('Retrying…'\),[\s\S]{0,80}onSelfRetry: \(\) => \{ if \(this\._activeTab === 'mounts'\) this\._renderMounts\(\); \} \}\);/.test(src),
  loadingFirst: /l\.className = 'mounts-loading'; l\.textContent = tr\('Loading…'\); this\.listEl\.replaceChildren\(l\);[\s\S]{0,200}if \(!this\._mountsFlight\)/.test(src),
  dots: /_mountsDotsTick\(\) \{[\s\S]{0,200}if \(!this\._mountsOnScreen\(\)\) return;[\s\S]{0,200}this\._mountsProbeStale\(\);[\s\S]{0,80}\}, 60000\);/.test(src) && /this\._mountsDotsNow\(\); \/\/ B-a31a cure \(a\) \+ cure 2/.test(src)
    && /return r\.width > 0 && r\.height > 0 && r\.right > 0 && r\.bottom > 0 && r\.left < \(window\.innerWidth \|\| 0\) && r\.top < \(window\.innerHeight \|\| 0\);/.test(src)
    && /new IntersectionObserver\(\(es\) => \{ if \(es\.some\(\(e\) => e\.isIntersecting\)\) this\._mountsDotsNow\(\); \}\)\.observe\(this\.listEl\)/.test(src),
  renderNoProbe: !/this\._autoTestHosts\(hd\.hosts/.test(src) && /this\._mountsDotsNow\(\); \/\/ B-a31a cure \(a\) \+ cure 2: on screen only\n    \},/.test(src), // stale-pins: kept — the deliberate absence check: the render probes on its own no more
  patchNow: /const list = this\._mountsHostList && this\._mountsHostList\.isConnected \? this\._mountsHostList : hlist;/.test(src) && !/_swapHostRow\(h, hlist\) \{/.test(src), // stale-pins: kept — the deliberate absence check: the swap function is gone
  inPlace: (() => { const m = /\n    _autoTestHosts\(hosts, hlist\) \{[\s\S]*?\n    \},/.exec(src); return !!m && (m[0].match(/this\._patchHostFace\(h, hlist\)/g) || []).length === 2 && !/_swapHostRow/.test(m[0]); })()
    && /const face = isDial \? null : this\._hostFace\(h\);[^\n]*\n      row\._face = face;/.test(src),
  nullForgets: /else if \(this\._lastRunSeen\) this\._lastRunSeen\.delete\(hostId\);/.test(src),
});
const SB = fs.readFileSync(path.join(REPO, 'src/lib/sidebar.js'), 'utf8');
const GUARD = "const v = rerenderVerdict({ tab: this._activeTab, shown: !!shown, slow: !!slowEl });\n      if (v === 'keep') return;\n      if (v === 'refresh') { if (noteAskOnce(slowEl)) this._renderMountsSoon?.(); return; } // cure 2: ONCE per note";
const guarded = (src) => { const rail = src.indexOf("{ this._renderRailPanel?.(); return; }"), g = src.indexOf(GUARD), w = g < 0 ? -1 : src.indexOf("this.listEl.innerHTML = '';", g); return rail > 0 && g > rail && w > g && w - g < 600; };
ok(gateOf(guarded(SB)) && verdictOf(/^import \{ rerenderVerdict, noteAskOnce \} from '\.\/mounts-live\.js';/m.test(SB)), 'a sidebar re-render never wipes a Remote panel that shows — it asks rerenderVerdict (src/lib/sidebar.js: before the list\'s wipe, after the rail panels\' own)');
const wr = wiring(SM);
ok(verdictOf(Object.values(wr).every(Boolean)), 'the wiring: host-last-run → the row patch (coalesced); a list frame → ONE coalesced, single-flight refresh, never a direct whole redraw; a failed or held refresh keeps the panel and says so; the builder and the patch draw the same line', wr);
const slowCss = rule(STY, '.mounts-slow');
ok(gateOf(/var\(--/.test(slowCss)) && !/#[0-9a-fA-F]{3}/.test(slowCss) && gateOf(/position: sticky; top: 0;/.test(slowCss)) && verdictOf(/background: var\(--bg-sidebar\)/.test(slowCss)), 'the slow note\'s CSS reads theme variables only, and it stays in view however far the list is scrolled (sticky, on the sidebar\'s own background — the pictures showed it scrolled out of sight)', slowCss);
const a6PH = { src: SM.replace("if (msg.type === 'host-last-run' && msg.hostId) this._patchHostLastRun(msg.hostId, msg.lastRun || null);", '').replace("&& this._activeTab === 'mounts') this._renderMountsSoon();", "&& this._activeTab === 'mounts') this._renderMounts();") }; // stale-pins: kept — the control BUILDS the release's listener line; it pins no product line
ok(a6PH.src !== SM && !Object.values(wiring(a6PH.src)).every(Boolean), 'CONTROL (h): the release\'s listener (every frame a whole refetch and redraw) — the wiring census goes red');
const a6PI = patched('src/lib/mounts-live.js', 'if (pending) return; pending = true; ', '');
const a6PJ = patched('src/lib/mounts-live.js', "if (old && line) { if (old.textContent !== line.textContent) old.textContent = line.textContent; return 'updated'; }", "if (old && line) { for (const k of kids) k.remove(); for (const k of kids) row.appendChild(k === old ? line : Object.assign(document.createElement(k.tagName), { className: k.className })); return 'updated'; } // CONTROL: the row rebuilt whole");
const a6PM = patched('src/lib/mounts-live.js', 'if (h && lr && atOf(lr) > atOf(listed))', 'if (false) // CONTROL: the older list wins\n    if (h && lr && atOf(lr) > atOf(listed))');
const a6PK = patched('src/lib/mounts-live.js', 'if (cur) return next || (next = cur.then(again, again));', '');
ok(gateOf(a6PI.applies) && gateOf(a6PJ.applies) && gateOf(a6PK.applies) && verdictOf(a6PM.applies), 'the §6 patches apply');
ok(!guarded(SB.replace(GUARD, '')) && verdictOf(SB.includes(GUARD)), 'CONTROL (l): the release\'s sidebar re-render (no guard: every digest change wipes the panel to «Loading…») — §6 goes red');
ok(!cacheCase(await bundle('src/lib/mounts-live.js', a6PM)).overlay, 'CONTROL (m): an overlay that takes the older list (a run pushed during a refresh drawn away) — §6 goes red');

// THE CURE (主开发 07:52Z): THE PANEL IS TRUE AGAIN BY ITSELF, WITHOUT A STORM — counts over the verdict + the coalesced refresh
const rerenderCase = (M) => {
  const timers = []; let refreshes = 0;
  const soon = M.coalesce(() => { refreshes++; }, 250, { setTimer: (fn) => timers.push(fn) });
  const drain = () => { timers.splice(0).forEach((f) => f()); };
  const rr = (st) => { const v = M.rerenderVerdict({ tab: 'mounts', ...st }); if (v === 'refresh') soon(); return v; };
  const healthy = Array.from({ length: 10 }, () => rr({ shown: true, slow: false })); drain();
  const afterHealthy = refreshes;
  const slow = [rr({ shown: true, slow: true }), rr({ shown: true, slow: true })]; drain(); // the poll's recovery edge (twice inside one window)
  const afterSlow = refreshes;
  const reconnect = () => soon(); [1, 2, 3].forEach(reconnect); drain();               // one outage that flapped: three «up» edges in a window
  return { healthy, afterHealthy, slow, afterSlow, afterReconnect: refreshes - afterSlow, paint: M.rerenderVerdict({ tab: 'mounts', shown: false }), other: M.rerenderVerdict({ tab: 'folders', shown: true }) };
};
const rc5 = rerenderCase(ML);
ok(gateOf(rc5.healthy.every((v) => v === 'keep')) && rc5.afterHealthy === 0, 'TEN sidebar re-renders over a HEALTHY panel ⇒ ZERO refreshes (the storm\'s leg stays)', rc5);
ok(gateOf(rc5.slow.every((v) => v === 'refresh')) && rc5.afterSlow === 1, 'a panel SAYING the server is slow is not healthy: the recovery edge\'s re-render ⇒ exactly ONE refresh (the note leaves when it lands)', rc5);
ok(rc5.afterReconnect === 1, 'the page\'s connection back (three «up» edges inside one window) ⇒ exactly ONE refresh', rc5);
ok(rc5.paint === 'paint' && rc5.other === 'other', 'no panel yet ⇒ paint (a tab change); another tab ⇒ not the panel\'s business', rc5);
const pn = patched('src/lib/mounts-live.js', "return slow ? 'refresh' : 'keep';", "return 'keep'; // CONTROL: the tip before the cure");
ok(gateOf(pn.applies) && (rerenderCase(await bundle('src/lib/mounts-live.js', pn))).afterSlow === 0, 'CONTROL (n): the tip before the cure (a showing panel is always «healthy») — the slow note never leaves by itself: the recovery leg goes red');
const noReconnect = SM.replace("this.app.ws.onStateChange?.((up) => { if (up && this._activeTab === 'mounts') this._renderMountsSoon(); });", '');
ok(noReconnect !== SM && !wiring(noReconnect).reconnect, 'CONTROL (o): no refresh when the connection comes back (the tip before the cure) — the wiring census goes red');

// CURE 2 (主开发 08:26Z): THE TWO-MINUTE PROBE PATCHES A ROW IN PLACE; the note's retry and the re-render's ask are ONCE
const el = (tag, cls, txt) => { const e = document.createElement(tag); e.className = cls; if (txt != null) e.textContent = txt; return e; };
const faceCase = (M) => {
  const root = el('div', 'mounts-list'); root._root = true;
  const row = el('div', 'mounts-row'); row._hostId = 'host-ssh';
  const top = el('div', 'mounts-row-top mounts-host-top');
  const dot = el('span', 'mounts-dot mounts-dot-ok'); dot.setAttribute('title', '31ms');
  top.append(dot, el('b', 'mounts-name', 'buildbox'), el('span', 'mounts-badge', 'READY'), el('span', 'mounts-row-actions'));
  row.append(top, el('div', 'mounts-path', 'me@buildbox:22')); root.appendChild(row);
  const F = { dot: 'ok', dotTip: '31ms', badge: '<span class="mounts-badge">READY</span>', chip: null, errline: null };
  const makers = { chipOf: (c) => el('span', 'host-state-chip host-state-' + c.kind, c.text), badgeOf: (h) => el('span', 'mounts-badge', h.replace(/<[^>]+>/g, '')) };
  const before = [row, ...row.all], attrs0 = before.map((n) => n.className + '|' + (n.getAttribute ? n.getAttribute('title') : ''));
  const same = M.patchHostFace(row, F, { ...F }, makers);
  const after1 = [row, ...row.all];
  const replaced1 = before.filter((n) => !after1.includes(n)).length, added1 = after1.filter((n) => !before.includes(n)).length;
  const touched1 = after1.filter((n, i) => before.includes(n) && attrs0[before.indexOf(n)] !== n.className + '|' + (n.getAttribute ? n.getAttribute('title') : '')).length;
  const DOWN = { dot: 'err', dotTip: 'Connection refused', badge: F.badge, chip: { kind: 'error', text: 'unreachable', title: 'Connection refused' }, errline: { text: 'Couldn’t connect: Connection refused', title: 'Connection refused' } };
  const changed = M.patchHostFace(row, F, DOWN, makers);
  const after2 = [row, ...row.all];
  const replaced2 = before.filter((n) => !after2.includes(n)).length;
  return { same, replaced1, added1, touched1, changed, replaced2, dotNow: dot.className, chipBeforeActs: top.children.findIndex((k) => k._cls.includes('host-state-chip')) === top.children.length - 2, errline: row.children.some((k) => k._cls.includes('mounts-errline') && k.textContent === DOWN.errline.text) };
};
const fc = faceCase(ML);
ok(fc.same === 'same' && fc.replaced1 === 0 && fc.added1 === 0 && fc.touched1 === 0, 'ONE PROBE whose answer equals what the row shows ⇒ ZERO row nodes replaced, none added, none touched (a focused button or an open control stays)', fc);
ok(fc.changed === 'patched' && fc.replaced2 === 0 && fc.dotNow === 'mounts-dot mounts-dot-err' && gateOf(fc.chipBeforeActs) && verdictOf(fc.errline), 'a CHANGED answer changes the dot and its words only: the dot\'s class and title, the chip before the actions, the failure line — every node the row had is the same node', fc);
const pq2 = (() => { const src0 = fs.readFileSync(path.join(REPO, 'src/lib/mounts-live.js'), 'utf8'); const src = src0.replace("  if (hostFaceSame(prev, next)) return 'same';\n", '').replace("    if (dot.className !== cls) dot.className = cls;", "    { const nd = document.createElement('span'); nd.className = cls; dot.replaceWith(nd); } // CONTROL: the probe rebuilds what it shows"); return { file: 'src/lib/mounts-live.js', src, applies: src !== src0 && !src.includes("return 'same';\n  const dot") }; })();
ok(gateOf(pq2.applies) && faceCase(await bundle('src/lib/mounts-live.js', pq2)).replaced1 > 0, 'CONTROL (p): a probe that rebuilds what it shows (the tip as it stood replaced the whole row twice) — the zero-replaced leg goes red');
// THE MEETING AT THE RESTACK FOR 2.369.412 (主开发 20:03Z, ruling (a), both meanings): ui-needs-a-button's NEED LINE (its words and its
// doors) is the row's failure line that B-a31a's probe patches IN PLACE — the face carries the need line's inputs, the builder draws it
// (errOf). An answer with the SAME words builds nothing and writes nothing to the line; CHANGED words replace it and its fold once,
// each in its own place, with doors that work
const needCase = (M) => {
  const row = el('div', 'mounts-row'); row._hostId = 'host-ssh';
  const top = el('div', 'mounts-row-top mounts-host-top'); top.append(el('span', 'mounts-dot mounts-dot-err'), el('b', 'mounts-name', 'buildbox'), el('span', 'mounts-row-actions'));
  row.appendChild(top);
  let built = 0, pressed = 0;
  const lineOf = (e) => {
    built++;
    const line = el('div', 'mounts-errline need-line'); line.setAttribute('title', e.title); line.appendChild(el('span', 'need-words', e.text));
    const b = el('button', 'mounts-btn need-door', e.refused ? 'Copy the public key to add' : 'Try again'); b.addEventListener('click', () => { pressed++; }); line.appendChild(b);
    const fold = el('details', 'mounts-errline-details'); fold.append(el('summary', '', 'Details'), el('pre', '', e.title));
    return [line, fold];
  };
  const E1 = { text: 'Can’t reach me@buildbox: the connection was refused.', title: 'Connection refused', refused: false, target: 'me@buildbox' };
  const F1 = { dot: 'err', dotTip: 'Connection refused', badge: '', chip: { kind: 'error', text: 'unreachable', title: 'Connection refused' }, errline: E1 };
  for (const n of lineOf(E1)) row.appendChild(n);                                    // the builder's own draw
  row.insertBefore(el('div', 'mounts-key-shown', 'ssh-ed25519 AAAA'), row.children.find((k) => k._cls.includes('mounts-errline-details')));   // a key answer between them
  built = 0;
  const line0 = row.children.find((k) => k._cls.includes('mounts-errline')), fold0 = row.children.find((k) => k._cls.includes('mounts-errline-details'));
  let writes = 0;
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(line0), 'textContent');
  for (const n of [line0, fold0]) {
    for (const k of ['setAttribute', 'remove', 'replaceWith', 'appendChild', 'append', 'after', 'insertBefore']) { const f = n[k].bind(n); n[k] = (...a) => { writes++; return f(...a); }; }
    Object.defineProperty(n, 'textContent', { get() { return desc.get.call(this); }, set(v) { writes++; desc.set.call(this, v); }, configurable: true });
  }
  const makers = { chipOf: (c) => el('span', 'host-state-chip host-state-' + c.kind, c.text), badgeOf: (h) => el('span', 'mounts-badge', h), errOf: lineOf };
  const F1b = { ...F1, chip: { kind: 'error', text: 'unreachable', title: 'Connection refused (2)' } };
  const same = M.patchHostFace(row, F1, { ...F1 }, makers);                           // the identical answer
  const sameOther = M.patchHostFace(row, F1, F1b, makers);                            // the same words, the chip moved
  const kept = { built, writes, line: row.children.includes(line0), fold: row.children.includes(fold0) };
  const E2 = { text: 'Can’t sign in to me@buildbox: it refused the key.', title: 'Permission denied (publickey)', refused: true, target: 'me@buildbox' };
  const changed = M.patchHostFace(row, F1b, { ...F1b, errline: E2 }, makers);
  const line1 = row.children.find((k) => k._cls.includes('mounts-errline')), fold1 = row.children.find((k) => k._cls.includes('mounts-errline-details'));
  const doors = line1 ? line1.all.filter((k) => k._cls.includes('need-door')) : [];
  for (const d of doors) d.fire('click');
  const order = row.children.map((k) => (k._cls.includes('mounts-errline-details') ? 'fold' : k._cls.includes('mounts-errline') ? 'line' : k._cls.includes('mounts-key-shown') ? 'key' : '')).filter(Boolean).join(',');
  return { same, sameOther, kept, changed, built, replaced: !!line1 && line1 !== line0 && !!fold1 && fold1 !== fold0, doors: doors.length, pressed, words: line1 && line1.textContent, foldText: fold1 && fold1.textContent, lines: row.children.filter((k) => k._cls.includes('mounts-errline')).length, order };
};
const nd = needCase(ML);
ok(nd.same === 'same' && nd.sameOther === 'patched' && nd.kept.built === 0 && nd.kept.writes === 0 && gateOf(nd.kept.line) && verdictOf(nd.kept.fold), 'THE MEETING (ruling (a), the restack for 2.369.412): a probe answer with the SAME words builds nothing and writes nothing to the need line or its fold (the identical answer ⇒ «same»; the same words with the chip moved ⇒ the chip patched, the line at zero writes)', nd);
ok(nd.changed === 'patched' && nd.built === 1 && gateOf(nd.replaced) && nd.lines === 1 && nd.doors === 1 && nd.pressed === 1 && gateOf(/refused the key/.test(nd.words || '')) && gateOf(/publickey/.test(nd.foldText || '')) && nd.order === 'line,key,fold', '…CHANGED words replace the need line and its fold ONCE, each in its own place (a key answer between them stays): its door is there and works', nd);
// RED CONTROL (v), its plant proven first: the release's patch — the failure line's words written IN PLACE — takes the doors
const pnd = patched('src/lib/mounts-live.js', '  if (errOf) {\n', "  if (false) { // CONTROL: the release's in-place text\n");
const plantOk = pnd.applies && /if \(false\) \{ \/\/ CONTROL/.test(pnd.src) && /if \(e\.textContent !== next\.errline\.text\) e\.textContent = next\.errline\.text;/.test(pnd.src);
const ndr = plantOk ? needCase(await bundle('src/lib/mounts-live.js', pnd)) : null;
ok(gateOf(plantOk) && !!ndr && ndr.doors === 0, 'CONTROL (v): the plant is in its copy (the builder\'s branch off, the release\'s text write live) — CHANGED words write over the line and its doors are gone: the door leg goes red', { plantOk, doors: ndr && ndr.doors });
ok(gateOf(/errOf: \(e\) => this\._hostErrLine\(h, e, row\)\.nodes/.test(SM)) && gateOf(/const \{ nodes, place \} = this\._hostErrLine\(h, face\.errline, row\);/.test(SM)) && verdictOf(/errline: st && !st\.ok \? this\._hostErrFacts\(h, st\) : null/.test(SM)), 'the wiring: the face carries the need line\'s inputs; the builder and the in-place patch draw it through ONE door (_hostErrLine)');
const tipProbe = SM.replace(/(\n    _autoTestHosts\(hosts, hlist\) \{[\s\S]*?)this\._patchHostFace\(h, hlist\)/, '$1this._swapHostRow(h, hlist)');
ok(tipProbe !== SM && !wiring(tipProbe).inPlace, 'CONTROL (q): _autoTestHosts swapping the row (the tip as it stood) — the in-place wiring goes red');
const renderProbe = SM.replace("        // (the render's own probe runs at its END, through the on-screen gate, once the list is on the page — _mountsDotsNow)", "        this._autoTestHosts(hd.hosts.filter((h) => h.transport !== 'dial'), hlist);"); // stale-pins: kept — control (u) BUILDS the old line
ok(renderProbe !== SM && !wiring(renderProbe).renderNoProbe, 'CONTROL (u): the render path probing on its own (the tip before this: off screen, before its list is on the page) — the wiring goes red');
const noteCase = (M) => {
  const root = el('div', 'mounts-list'); root._root = true; const panel = el('div', 'mounts-panel'); root.appendChild(panel);
  const timers = []; let selfRetries = 0;
  const o = { words: 'slow', retry: 'Retry', retrying: 'Retrying…', onRetry: () => {}, onSelfRetry: () => { selfRetries++; }, setTimer: (f, ms) => timers.push({ f, ms }) };
  const a = M.slowNote(panel, o);                                     // a refresh that failed
  const note = panel.children[0];
  const ask1 = M.noteAskOnce(note), ask2 = M.noteAskOnce(note);       // two re-renders over that one failure
  const b = M.slowNote(panel, o);                                     // the next refresh failed AGAIN
  const ask3 = M.noteAskOnce(note);                                   // the hub's recovery edge after it
  const notes = panel.children.filter((k) => k._cls.includes('mounts-slow')).length;
  timers.forEach((t) => t.f());
  return { made: [a && a.made, b && b.made], timers: timers.length, ms: timers[0] && timers[0].ms, notes, selfRetries, asks: [ask1, ask2, ask3, M.noteAskOnce(null)] };
};
const nc = noteCase(ML);
ok(nc.made[0] === true && nc.made[1] === false && nc.notes === 1 && nc.timers === 1 && nc.ms === 15000 && nc.selfRetries === 1, 'the slow note: TWO FAILURES ⇒ ONE note and ONE 15-s self-retry timer (never a second, never a loop)', nc);
ok(JSON.stringify(nc.asks) === '[true,false,true,false]', 'a re-render asks the note\'s refresh ONCE PER FAILURE: two re-renders over one failure ⇒ one ask; the failure said again ⇒ one more (the hub back after a second failure is asked)', nc.asks);
const pr2 = patched('src/lib/mounts-live.js', '  const had = kid(panel, \'mounts-slow\');\n  if (had) {', '  const had = kid(panel, \'mounts-slow\');\n  if (false) { // CONTROL: no «met again»');
ok(gateOf(pr2.applies) && noteCase(await bundle('src/lib/mounts-live.js', pr2)).timers === 2, 'CONTROL (r): a note made again at each failure — two timers: the retry leg goes red');
const ps2 = patched('src/lib/mounts-live.js', '  if (!note || note._asked) return false;', '  if (!note) return false; // CONTROL');
ok(gateOf(ps2.applies) && noteCase(await bundle('src/lib/mounts-live.js', ps2)).asks[1] === true, 'CONTROL (s): a re-render that asks at every pass — the once-per-note leg goes red');
const pt2 = patched('src/lib/mounts-live.js', '    had._asked = false;', '    /* CONTROL: once per note */');
ok(gateOf(pt2.applies) && noteCase(await bundle('src/lib/mounts-live.js', pt2)).asks[2] === false, 'CONTROL (t): «once per note» (the tip before this) — after a second failure the recovery edge asks nothing: the once-per-failure leg goes red');
ok((coalesceCase(await bundle('src/lib/mounts-live.js', a6PI))).set1 === 60, 'CONTROL (i): a coalescer with no window — 60 frames, 60 paints: §6 goes red');
ok(!patchCase(await bundle('src/lib/mounts-live.js', a6PJ)).replaced, 'CONTROL (j): the row rebuilt whole (new nodes) — §6\'s in-place leg goes red');
ok((await flightCase(await bundle('src/lib/mounts-live.js', a6PK))).most > 1, 'CONTROL (k): no single-flight guard — refreshes overlap: §6 goes red');

console.log(fail ? `\n${fail} FAILED (${pass} passed) · ${((Date.now() - T0) / 1000).toFixed(1)} s` : `\nALL PASS (${pass}) · ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';

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
//   §2 the chat card's command block (src/lib/chat-renderers.js exitRunBlock): a 4 096-byte one-token command whole,
//      folded behind "Show the whole command (4096 characters)"; a 200-line script folded behind "(200 lines)"; the
//      toggle opens / folds and re-words the expander; four short lines unfolded; a card without `cmd` (an older
//      card) draws no block; the block comes BEFORE the output
//   §3 the Remote panel's machine row (source census of src/lib/sidebar-mounts.js): the Commands icon and the
//      last-run line both open openExitRunsDialog, no hover title on the last-run line; the CSS: both command pres
//      wrap anywhere, the card's fold clamps four lines
//   §4 CONTROLS (patched copies of the source, bundled in memory — src/ never touched): the painter's hover title back;
//      the body's command cut to the head; the card without its command block; the fold never folding; a row
//      without the icon; the 2.369.207 duration words (f) — each goes red
// Run: node scripts/test-exit-runs-dialog.mjs
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
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600) : '')); } };
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
    b.onLoad({ filter: /^utils$/, namespace: 'stub' }, () => ({ contents: 'export const createModalShell = () => { throw new Error("no modal in this suite"); };\nexport const showToast = (m) => { (globalThis.__toasts ||= []).push(String(m)); };\nexport const copyText = (s) => { (globalThis.__clip ||= []).push(s); return Promise.resolve(); };' }));
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
ok(p1.head && !p1.head.includes('\n') && p1.head.length === 80 && p1.head.endsWith('…') && p1.head.startsWith('powershell.exe -NoProfile -Command " \t$Error'), 'the summary keeps the HEAD on one line (80 characters)', p1.head);
ok(p1.wholeTag === 'PRE' && p1.whole === MULTI && p1.first, 'the body OPENS with the WHOLE command as itself — its lines and tabs kept — in a pre', { whole: p1.whole, first: p1.first });
ok(p1.titles === 0, 'no element of the row carries a hover `title` (pre-fix: the whole command lived only in one)', p1.titles);
ok(p1.clip.length === 1 && p1.clip[0] === MULTI && p1.toasts.includes('Command copied'), 'Copy puts the WHOLE command on the clipboard (the stub) and says so', { clip: p1.clip, toasts: p1.toasts });
ok(p1.same && p1.open && p1.sums === 1 && p1.wholes === 1 && p1.out2, 'a re-paint of the keyed row is IN PLACE: the same node, still open, one summary, one whole command, the new output', p1);

// ── §2 the chat card's command block ──
// §1b (lane exit-runs-dialog-fit, DOM-free): the duration words — a run that rounds to nothing reads "<0.1 s", never a
// "0.0 s"; tenths otherwise; junk / negative = nothing
const DUR = (f) => { const got = [0, 12, 49, 50, 100, 1234, -5, NaN, undefined, '2500'].map((ms) => f(ms)); return { ok: JSON.stringify(got) === JSON.stringify(['<0.1 s', '<0.1 s', '<0.1 s', '0.1 s', '0.1 s', '1.2 s', '<0.1 s', '<0.1 s', '<0.1 s', '2.5 s']), got }; };
{ const r = DUR(D.durationText); ok(r.ok, `§1b durationText: 0 / 12 / 49 ms → "<0.1 s", 50 / 100 ms → "0.1 s", 1234 → "1.2 s", junk → "<0.1 s" (${r.got.join(' | ')})`); }
{ const n = D.paintRow(document.createElement('details'), { at: 1, name: 'n', cmd: 'pull /a → /b', ms: 0, outcome: 'ok', transfer: { verb: 'pull', bytes: 2048, verified: 'sha256', local: '/b', remote: '/a' } }); const o = n.querySelector('.exit-runs-outcome'); const ms = o && o.querySelector('.exit-runs-ms'), v = o && o.querySelector('.exit-runs-verdict');
  ok(!!(ms && v && ms.textContent === '<0.1 s' && /2/.test(v.textContent)), `§1b a 0 ms transfer row: its size and "<0.1 s" in ONE outcome line (${v && v.textContent} · ${ms && ms.textContent})`); }

console.log('§2 the chat card: the whole command above its output, folded at four lines, the expander naming its count');
const R = await bundle('src/lib/chat-renderers.js');
const ONE = 'echo ' + 'Q'.repeat(4091), L200 = Array.from({ length: 200 }, (_, i) => `l${i}`).join('\n');
const cardOf = (Rm, x) => { const b = Rm.exitRunBlock(x); const box = b.querySelector('.chat-exit-cmd-box'); const pre = b.querySelector('.chat-exit-cmd'); const det = b.querySelector('.chat-exit-cmd-fold'); const sum = det && det.querySelector('summary'); return { b, box, pre, det, sum, text: pre && pre.textContent, label: sum && sum.textContent, folded: !!box && box.classList.contains('chat-exit-cmd-folded'), first: b.children[0] === box, wrapped: !!pre && pre.classList.contains('chat-pre-wrapped') }; };
const c1 = cardOf(R, { cmd: ONE, code: 0, stdout: 'ok\n', stderr: '', cut: {} });
ok(c1.text === ONE && c1.text.length === 4096 && c1.first && c1.wrapped && c1.pre.tagName === 'PRE', 'a 4 096-byte one-token command is WHOLE in the card\'s pre (wrapped), above the output', { len: c1.text && c1.text.length, first: c1.first });
ok(c1.folded && c1.label === 'Show the whole command (4096 characters)', 'folded behind an expander naming its length (one line)', c1.label);
c1.det.open = true; c1.det.fire('toggle');
const opened = c1.box.classList.contains('chat-exit-cmd-open') && c1.sum.textContent === 'Fold the command';
c1.det.open = false; c1.det.fire('toggle');
ok(opened && !c1.box.classList.contains('chat-exit-cmd-open') && c1.sum.textContent === 'Show the whole command (4096 characters)', 'the toggle opens it (the expander reads "Fold the command") and folds it back');
const c2 = cardOf(R, { cmd: L200, code: 0, stdout: '', stderr: '', cut: {} });
ok(c2.text === L200 && c2.folded && c2.label === 'Show the whole command (200 lines)' && c2.first, 'a 200-line script keeps its lines, folded behind "(200 lines)" — even with no output (the block precedes the no-output line)', c2.label);
const c3 = cardOf(R, { cmd: 'a\nb\nc\nd', code: 0, stdout: 'x', stderr: '', cut: {} });
ok(c3.text === 'a\nb\nc\nd' && !c3.folded && !c3.det, 'four short lines are shown whole, no expander');
const c4 = cardOf(R, { code: 0, stdout: 'x', stderr: '', cut: {} });
ok(!c4.box && !!c4.b.querySelector('.chat-exit-out'), 'a card without `cmd` (an older card) draws no command block, its output as before');

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
ok(rc.icon && rc.last && rc.noTitle && rc.imported, 'the machine row: the Commands icon and the last-run line both open openExitRunsDialog; the last-run line has no hover title', rc);
const CSS = fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8'), STY = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
const rule = (css, sel) => { const m = new RegExp('^' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}', 'm').exec(css); return m ? m[1] : ''; };
const wraps = (r) => /white-space: pre-wrap/.test(r) && /overflow-wrap: anywhere/.test(r);
ok(wraps(rule(CSS, '.chat-exit-cmd')) && wraps(rule(CSS, '.chat-exit-out, .chat-exit-out-all')) && wraps(rule(STY, '.exit-runs-cmd-all')), 'both command pres and the card\'s output wrap anywhere (a 1 365-byte token breaks on a phone)');
ok(/max-height: calc\(4 \* 1\.45em \+ 10px\); overflow: hidden/.test(rule(CSS, '.chat-exit-cmd-folded:not(.chat-exit-cmd-open) .chat-exit-cmd')) && /line-height: 1\.45/.test(rule(CSS, '.chat-exit-cmd')), 'the fold clamps four lines of the command\'s own line height');

// ── §4 controls ──
console.log('§4 controls (patched copies, bundled in memory)');
const pa = patched('src/lib/exit-runs-dialog.js', "  main.append(el('code', 'exit-runs-cmd',", "  sum.title = cmd; // CONTROL: the hover title back\n  main.append(el('code', 'exit-runs-cmd',");
const pb = patched('src/lib/exit-runs-dialog.js', "const w = wrapPre('exit-runs-cmd-all', cmd);", "const w = wrapPre('exit-runs-cmd-all', flat.slice(0, CMD_HEAD)); // CONTROL: the head again");
const pf = patched('src/lib/exit-runs-dialog.js', "return Number(s) === 0 ? '<0.1 s' : `${s} s`;", "return `${s} s`; // CONTROL: the 2.369.207 words");
const pc = patched('src/lib/chat-renderers.js', "  if (typeof x.cmd === 'string' && x.cmd) wrap.appendChild(exitCmdBlock(x.cmd));", '');
const pd = patched('src/exit-reach.js', 'folded: lines > CMD_FOLD_LINES || c.length > CMD_FOLD_CHARS', 'folded: false');
ok(pa.applies && pb.applies && pc.applies && pd.applies && pf.applies, 'every patch applies');
ok(!DUR((await bundle('src/lib/exit-runs-dialog.js', pf)).durationText).ok, 'CONTROL (f): the old duration words ("0.0 s" for a 0 ms transfer) — §1b goes red');
ok((await painterCase(await bundle('src/lib/exit-runs-dialog.js', pa))).titles > 0, 'CONTROL (a): the hover title back on the row — §1\'s title census goes red');
const pbr = await painterCase(await bundle('src/lib/exit-runs-dialog.js', pb));
ok(pbr.whole !== MULTI, 'CONTROL (b): the body\'s command cut to the head — §1\'s whole-command row goes red');
ok(!cardOf(await bundle('src/lib/chat-renderers.js', pc), { cmd: ONE, code: 0, stdout: 'x', stderr: '', cut: {} }).pre, 'CONTROL (c): a card without its command block — §2 goes red');
ok(!cardOf(await bundle('src/lib/chat-renderers.js', pd), { cmd: L200, code: 0, stdout: 'x', stderr: '', cut: {} }).folded, 'CONTROL (d): a fold that never folds (exit-reach.js patched) — the 200-line card shows no expander (red)');
const noIcon = SM.replace(/\n {8}ibtn\(MI\.list,[^\n]*\n/, '\n');
ok(noIcon !== SM && !rowCensus(noIcon).icon, 'CONTROL (e): a row without the Commands icon — §3\'s census goes red');

console.log(fail ? `\n${fail} FAILED (${pass} passed) · ${((Date.now() - T0) / 1000).toFixed(1)} s` : `\nALL PASS (${pass}) · ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);

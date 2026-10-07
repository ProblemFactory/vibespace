#!/usr/bin/env node
// THE DOC WINDOW'S COMMENT POPOVER LIVES EXACTLY AS LONG AS ITS SELECTION (userW inc-muxrol54-uv2d, lane doc-comment-dismiss):
// src/lib/doc-window-ui.js commentOffer over the REAL house popover (src/lib/utils.js createPopover + its outside-press
// closer) in a mini-DOM — select ⇒ ONE popover (after the settle); select elsewhere ⇒ still ONE (the new one); collapse ⇒
// none; blur ⇒ none and not offered again for that selection; Esc (the data-popover protocol) ⇒ none; an outside press —
// in the text too — ⇒ none; the button ⇒ gone + the note box. Wiring pins (the plugin's every-update sync + settled offer,
// blur, the pane's scroll, the close, app.js's Esc sweep); three patched copies of the keeper go RED.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
// the real module FIRST: prosemirror-view sniffs a real `document` at import, the mini-DOM below is not one
const UI_FILE = path.join(ROOT, 'src/lib/doc-window-ui.js');
const ui = fs.readFileSync(UI_FILE, 'utf8');
const { commentOffer } = await import(pathToFileURL(UI_FILE).href);

// ── the mini-DOM: elements with parents, classes, dataset, listeners; document-level pointer listeners with signals ──
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.style = {}; this.dataset = {}; this.className = ''; this.textContent = ''; this.listeners = {}; }
  get isConnected() { for (let n = this; n; n = n.parentNode) if (n === doc.body) return true; return false; }
  appendChild(c) { c.remove(); c.parentNode = this; this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(c)); }
  remove() { const p = this.parentNode; if (p) { p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; } }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  matches(sel) { return sel === '[data-popover]' ? 'popover' in this.dataset : sel.startsWith('.') && this.className.split(/\s+/).includes(sel.slice(1)); }
  closest(sel) { for (let n = this; n; n = n.parentNode) if (n.matches?.(sel)) return n; return null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click || []) fn({ type: 'click', target: this, preventDefault() {} }); }
  setAttribute() {}
  getBoundingClientRect() { return { left: 10, top: 20, right: 90, bottom: 44, width: 80, height: 24 }; }
}
const all = (root) => root.children.flatMap((c) => [c, ...all(c)]);
const docListeners = {};
const doc = {
  body: null,
  createElement: (tag) => new El(tag),
  querySelectorAll: (sel) => all(doc.body).filter((n) => n.matches(sel)),
  addEventListener(type, fn, opts = {}) { const L = (docListeners[type] ||= []); const h = { fn }; L.push(h); opts.signal?.addEventListener('abort', () => { const i = L.indexOf(h); if (i >= 0) L.splice(i, 1); }); },
  removeEventListener() {},
  getSelection: () => null,
};
doc.body = new El('body');
Object.assign(globalThis, { document: doc, window: globalThis, innerWidth: 1280, innerHeight: 800, requestAnimationFrame: (cb) => cb(), addEventListener() {}, removeEventListener() {} });
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
// a mouse press, judged at pointerdown by the house closer (stamped after every popover opened)
const press = (target) => { const e = { type: 'pointerdown', target, pointerType: 'mouse', pointerId: 1, clientX: 0, clientY: 0, timeStamp: performance.now() + 1 }; for (const h of [...(docListeners.pointerdown || [])]) h.fn(e); };
const escape = () => doc.querySelectorAll('[data-popover]').forEach((el) => el.remove()); // app.js's Esc protocol (pinned below)

const U = await import(pathToFileURL(path.join(ROOT, 'src/lib/utils.js')).href);
// a popover WITHOUT the house's same-class sweep or closer: the keeper alone must keep it to one
const bare = (anchor, cls) => { const p = doc.body.appendChild(new El('div')); p.className = cls; p.dataset.popover = '1'; p._closeExclude = [anchor]; return p; };

/** One walk over a keeper factory with a popover maker; returns { label: verdict } (every verdict true = the rule holds). */
function walk(factory, create, house) {
  doc.body.children.length = 0;
  for (const k of Object.keys(docListeners)) docListeners[k].length = 0;
  const pane = doc.body.appendChild(new El('div')); pane.className = 'doc-pane';
  const text = pane.appendChild(new El('p')); const elsewhere = doc.body.appendChild(new El('div'));
  const notes = [];
  const K = factory((sel) => { // offerComment's shape: the house popover on the pane + the one button
    const pop = create(pane, 'doc-cpop', { position: 'cursor', x: 10, y: 20 });
    const b = new El('button'); b.className = 'doc-comment-btn';
    b.addEventListener('click', () => { K.dismiss(); notes.push(sel); }); pop.appendChild(b);
    return pop;
  });
  const n = () => doc.querySelectorAll('.doc-cpop').length;
  const sel = (from, to) => ({ from, to });
  const v = {};
  K.sync(sel(1, 5)); v['a selection offers nothing before it settles'] = n() === 0;
  K.sync(sel(1, 5), true); const first = K.pop; v['select ⇒ ONE popover'] = n() === 1 && !!first;
  K.sync(sel(1, 5), true); v['the same selection settling again keeps the SAME popover'] = n() === 1 && K.pop === first;
  K.sync(sel(8, 12)); v['a changed selection drops the popover at once (before the new one settles)'] = n() === 0;
  K.sync(sel(8, 12), true); v['select elsewhere ⇒ still ONE (the new one)'] = n() === 1 && !!K.pop && K.pop !== first;
  K.sync(null); v['collapse ⇒ none'] = n() === 0 && K.pop === null;
  K.sync(sel(2, 6), true); K.dismiss(); v['blur ⇒ none'] = n() === 0;
  K.sync(sel(2, 6), true); v['a dismissed selection is not offered again'] = n() === 0;
  K.sync(sel(3, 7), true); escape(); v['Esc ⇒ none'] = n() === 0 && K.pop === null;
  K.sync(sel(3, 7), true); v['an Esc-dismissed selection is not offered again'] = n() === 0;
  K.sync(sel(4, 9), true); v['a new selection after Esc ⇒ ONE'] = n() === 1;
  if (house) {
    press(K.pop.children[0]); v['a press on the popover\'s own button keeps it'] = n() === 1;
    press(text); v['an outside press IN THE TEXT ⇒ none'] = n() === 0 && K.pop === null;
    K.sync(sel(10, 14), true); press(elsewhere); v['an outside press beyond the pane ⇒ none'] = n() === 0;
  }
  K.sync(sel(20, 30), true); K.pop.children[0].click();
  v['the button ⇒ the popover gone + the note box for its selection'] = n() === 0 && notes.length === 1 && notes[0].from === 20;
  return v;
}

console.log('the keeper over the real house popover (createPopover + its closer)');
for (const [m, c] of Object.entries(walk(commentOffer, U.createPopover, true))) ok(c, m);
console.log('the keeper alone (no same-class sweep, no closer)');
for (const [m, c] of Object.entries(walk(commentOffer, bare, false))) ok(c, m);

console.log('the wiring (src/lib/doc-window-ui.js, src/lib/app.js)');
const app = fs.readFileSync(path.join(ROOT, 'src/lib/app.js'), 'utf8');
const body = ui.slice(ui.indexOf('export function mountDocWindow('));
ok(body.includes('offer.sync(selNow(view)); clearTimeout(selTimer); selTimer = setTimeout(() => offer.sync(selNow(view), true), 250);'), 'the selection plugin syncs on EVERY update and offers only once it settles (250 ms)');
ok(body.includes("s.empty || !view.hasFocus() || S.mode !== 'rich' ? null"), 'no selection = empty, the editor unfocused, or Raw');
ok(body.includes('blur: () => { clearTimeout(selTimer); offer.dismiss(); return false; }'), "the editor's blur dismisses it (and cancels a pending offer)");
ok(body.includes("pane.addEventListener('scroll', () => offer.dismiss(), { signal, passive: true })"), "the pane's scroll dismisses it");
ok(/signal\.addEventListener\('abort', \(\) => \{[^\n]*offer\.dismiss\(\)/.test(body), "the window's close dismisses it");
ok(body.includes("const pop = createPopover(pane, 'doc-cpop'") && body.includes('offer.dismiss(); noteBox(quote, c, line);'), 'the house popover; its button dismisses it before the note box');
ok(!/\bpop\.remove\(\)/.test(body.slice(body.indexOf('function offerComment'), body.indexOf('function noteBox'))) && !body.includes('let pop = null'), 'no second owner of the popover (the keeper is the only one)');
ok(app.includes("const floats = document.querySelectorAll('[data-popover]');") && app.includes('floats.forEach(el => el.remove())'), "app.js's Esc protocol removes every [data-popover] (the walk's escape())");

console.log('patched copies of the keeper go RED');
const SRC = ui.slice(ui.indexOf('export function commentOffer('), ui.indexOf('\n}\n', ui.indexOf('export function commentOffer(')) + 3);
const mutant = async (label, from, to, want) => {
  ok(SRC.includes(from), `control "${label}": the needle is in the keeper`);
  const M = await import('data:text/javascript,' + encodeURIComponent(SRC.replace(from, to)));
  const a = walk(M.commentOffer, bare, false), b = walk(M.commentOffer, U.createPopover, true); // red in EITHER walk
  ok(a[want] === false || b[want] === false, `control "${label}": RED — "${want}" fails`);
};
const DROP = "if (k !== key) { dismiss(); key = ''; }";
await mutant('no collapse hook', DROP, "if (k !== key && sel) { dismiss(); key = ''; }", 'collapse ⇒ none');
await mutant('two popovers allowed', DROP, "if (k !== key) { if (!sel) dismiss(); key = ''; }", 'select elsewhere ⇒ still ONE (the new one)');
await mutant('the pane still excluded', 'if (pop?._closeExclude) pop._closeExclude.length = 0;', '', 'an outside press IN THE TEXT ⇒ none');

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);

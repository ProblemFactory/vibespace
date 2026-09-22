#!/usr/bin/env node
// THE STATUS BAR UPDATES IN PLACE — keyed chips, one element per key, patched
// across renders (docs/design-accessibility-tree.zh.md §3 row 8 (b), §8 lean set;
// chunk a3). Before: `render()` rebuilt the whole bar by innerHTML on every
// context% / cost / turn-state tick — every chat window re-created its bar's
// subtree per update, an accessibility subtree remove+insert per window per
// update (the "stale" 20 % of the owner's 50,150 nodes). Now the chip SET is a
// descriptor list and `_reconcile` creates an element ONCE per key, patches
// class / title / style / data-* / inner markup only when they differ, moves a
// node only when its position changed, and removes the keys that left.
//
// The REAL class is driven here (no chrome): the module has no DOM access at
// import, and at construction/render it touches only createElement /
// setAttribute / removeAttribute / innerHTML / insertBefore / remove /
// children — a 40-line fake DOM that COUNTS creations and innerHTML writes
// stands in for the document.
//
//   ① identity — after the first render, twenty context%/cache/cost/turn-state
//     ticks leave every chip the SAME node object, in the same order, with the
//     hot chips' inner markup re-written and the cold chips' never touched;
//     zero elements created after the first render.
//   ② appearance / disappearance — a turn-state chip, a health chip, a held
//     chip, a workflow chip (with its data-* attributes) each appear at their
//     place and leave again, the neighbours keeping identity both times; the
//     goal chip flips empty ↔ set on ONE element.
//   ③ attribute parity — a title with quotes / ampersand / angle brackets lands
//     as the raw string (the old code escaped it into the markup and the parser
//     un-escaped it: same value), the classless cache/cost chips carry NO class
//     attribute, the ctx chip's inner pie keeps its markup shape.
//   ④ NEGATIVE CONTROL — a scratch copy of the module with the reconcile
//     neutered back to a whole-bar rebuild FAILS ①'s identity check.
//   ⑤ wiring pins — render() ends in `this._reconcile(chips)`, the file never
//     assigns `this._element.innerHTML`, the click handling is still the ONE
//     delegated listener (nothing bound per chip); ci.mjs carries this suite.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf-8');

// ── the fake DOM (what the module touches, nothing more) ──────────────────
const counters = { created: 0, innerHTML: 0 };
class FakeEl {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.childNodes = []; this.parentNode = null; this._html = ''; this.innerSets = 0; counters.created++; }
  get children() { return this.childNodes.filter((n) => n instanceof FakeEl); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get title() { return this.getAttribute('title') || ''; }
  get innerHTML() { return this._html; }
  set innerHTML(h) { this._html = String(h); this.innerSets++; counters.innerHTML++; }
  get textContent() { return this._html.replace(/<[^>]*>/g, ''); }
  appendChild(n) { return this.insertBefore(n, null); }
  insertBefore(n, ref) {
    if (ref && !this.childNodes.includes(ref)) throw new Error('insertBefore: reference is not a child');
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
    n.parentNode = this; return n;
  }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i < 0) throw new Error('removeChild: not a child'); this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener() {}
  get isConnected() { return true; }
}
const mkBar = (ChatStatusBar, opts = {}) => new ChatStatusBar({ send() {} }, 'sid-chips', {
  backend: 'claude', getToolMsg: () => null, openSubagentViewer() {}, openInTempEditor() {},
  onSearch: () => {}, onDesignRequest: () => {}, ...opts,
});
const keys = (bar) => bar.element.children.map((el) => el.getAttribute('data-chip'));
const byKey = (bar) => Object.fromEntries(bar.element.children.map((el) => [el.getAttribute('data-chip'), el]));
const firstStatus = { model: 'claude-fable-5-1', contextWindow: 200000, lastUsage: { input_tokens: 1000, cache_read_input_tokens: 500 }, total_cost_usd: 0.5, permissionMode: 'default', effort: 'high' };

/** Twenty ticks of the kind every turn produces; returns the identity verdict. */
function driveTwenty(bar) {
  const before = byKey(bar), order = keys(bar);
  const createdBefore = counters.created;
  const touched = {};
  for (let i = 1; i <= 20; i++) {
    bar.updateUsage({ input_tokens: 1000 + i * 1000, cache_read_input_tokens: 500 + i * 100, cache_creation_input_tokens: i });
    bar.addCost(0.1);
    bar.setTurnState(i % 2 ? 'running' : 'idle'); // drawn by NEITHER (only requires_action is a chip) — still a render
    const now = byKey(bar);
    for (const k of Object.keys(before)) if (now[k] !== before[k]) touched[k] = (touched[k] || 0) + 1;
  }
  return { before, order, orderAfter: keys(bar), after: byKey(bar), touched, created: counters.created - createdBefore };
}

// ── ① identity across twenty updates ──────────────────────────────────────
console.log('— ① the same chip element survives twenty updates');
// import FIRST: the module tree has no DOM access at import (utils.js's tooltip
// setup only wires itself when a document already exists); the fake document
// is installed for construction + render alone.
const { ChatStatusBar } = await import(pathToFileURL(path.join(repo, 'src/lib/chat-status-bar.js')).href);
globalThis.document = { createElement: (t) => new FakeEl(t) };
{
  const bar = mkBar(ChatStatusBar);
  bar.applyStatus(firstStatus);
  const order0 = keys(bar);
  ok(order0.join(',') === 'search,model,effort,goal,style,design,perm,ctx,cache,cache-k,cost', `first render draws the expected chip set in bar order (${order0.join(',')})`);
  ok(bar.element.children.every((el) => el.tagName === 'SPAN' && el.getAttribute('data-chip')), 'every chip is a <span data-chip=…>');
  const v = driveTwenty(bar);
  ok(Object.keys(v.touched).length === 0, `① every chip is the SAME node object after 20 context%/cache/cost/turn-state ticks (replaced: ${JSON.stringify(v.touched)})`);
  ok(v.created === 0, `① zero elements created after the first render (${v.created})`);
  ok(v.orderAfter.join(',') === v.order.join(','), `① the order is unchanged (${v.orderAfter.join(',')})`);
  const hot = ['ctx', 'cost'], warm = ['cache', 'cache-k'], cold = ['search', 'model', 'effort', 'goal', 'style', 'design', 'perm'];
  ok(hot.every((k) => v.after[k].innerSets === 21), `① the hot chips (${hot.join('/')}) re-wrote their inner markup once per tick — their text changes every tick (${hot.map((k) => v.after[k].innerSets).join('/')})`);
  // the cache percentage / [k] round to the same string on several ticks — an
  // unchanged string is NOT written (that is the point), so fewer than 21
  ok(warm.every((k) => v.after[k].innerSets > 1 && v.after[k].innerSets < 21), `① the cache chips (${warm.join('/')}) re-wrote only when their rounded text changed (${warm.map((k) => v.after[k].innerSets).join('/')} of 21 ticks)`);
  ok(cold.every((k) => v.after[k].innerSets === 1), `① the cold chips (${cold.join('/')}) were written once and never again (${cold.map((k) => v.after[k].innerSets).join('/')})`);
  // tick 20: 21000 + 2500 + 20 = 23520 of 200000 → 12 %, "24k"
  ok(/>12%</.test(v.after.ctx.innerHTML) && /\[24k\/200k\]/.test(v.after.ctx.innerHTML), `① …and the ctx chip shows the LAST reading (${v.after.ctx.textContent})`);
  ok(v.after.cost.innerHTML === '$2.50', `① …and the cost chip shows the accumulated cost (${v.after.cost.innerHTML})`);
  // a render with NOTHING changed writes nothing at all
  const w = counters.innerHTML; bar.render();
  ok(counters.innerHTML === w, `① a render with no change writes no innerHTML at all (${counters.innerHTML - w} writes)`);
  bar.dispose();
}

// ── ② a chip appearing / disappearing ─────────────────────────────────────
console.log('— ② chips appear at their place and leave again, neighbours untouched');
{
  const bar = mkBar(ChatStatusBar);
  bar.applyStatus(firstStatus);
  const base = byKey(bar);
  bar.setTurnState('requires_action');
  let k = keys(bar);
  ok(k.indexOf('turnstate') === k.indexOf('effort') + 1 && byKey(bar).turnstate.className === 'chat-status-turnstate chat-status-needs-action', `② turn-state chip appears right after effort (${k.join(',')})`);
  ok(byKey(bar).turnstate.textContent.includes('waiting for you'), '② …with its label');
  ok(['effort', 'goal', 'perm', 'ctx'].every((x) => byKey(bar)[x] === base[x]), '② …and effort / goal / perm / ctx keep their identity across the insertion');
  bar.setTurnState('idle');
  ok(!keys(bar).includes('turnstate') && ['effort', 'goal', 'perm', 'ctx'].every((x) => byKey(bar)[x] === base[x]), '② turn-state chip leaves on idle; neighbours keep identity across the removal');

  bar.setInitHealth([{ kind: 'mcp', name: 'srv', detail: 'failed' }]);
  k = keys(bar);
  ok(k.indexOf('health') === k.indexOf('effort') + 1 && byKey(bar).health.textContent.includes('1 not working'), `② health chip appears after effort with its count (${k.join(',')})`);
  bar.setInitHealth([]);
  ok(!keys(bar).includes('health'), '② health chip clears on an empty (told-and-clean) answer');

  bar.setJobsHeld('3 notifications held — waiting for the turn');
  ok(keys(bar).includes('held') && byKey(bar).held.textContent.includes('3 notifications held'), '② held chip appears with its head');
  bar.setJobsHeld('');
  ok(!keys(bar).includes('held'), '② held chip leaves when the stash drains');

  // the goal chip: empty ↔ set is ONE element (same key), only its class/markup change
  const goalEmpty = byKey(bar).goal;
  ok(goalEmpty.className.includes('chat-status-goal-empty'), '② the goal chip starts empty (set-a-goal entry point)');
  bar.setGoal('all tests pass', 65000);
  const goalSet = byKey(bar).goal;
  ok(goalSet === goalEmpty && !goalSet.className.includes('chat-status-goal-empty') && /chat-goal-timer/.test(goalSet.innerHTML) && goalSet.textContent.includes('all tests pass'), '② setting a goal re-uses the goal element (class + markup patched, not a new node)');
  bar.setGoal(null);
  ok(byKey(bar).goal === goalEmpty && goalEmpty.className.includes('chat-status-goal-empty'), '② clearing it flips the same element back to empty');

  // the workflow chip carries data-* attributes the click handler reads
  bar.trackWorkflow('wf_abc', 'Build & verify');
  const wf = byKey(bar).wf;
  ok(!!wf && wf.getAttribute('data-wf-run') === 'wf_abc' && wf.getAttribute('data-wf-name') === 'Build & verify' && wf.className.includes('chat-status-wf'), '② the workflow chip carries data-wf-run / data-wf-name as RAW attribute values');
  bar.dispose();
  const created = counters.created;
  bar.setBrowserProfile({ key: 'k', active: null, pinned: 'p1', pinnedLabel: 'Work', activeLabel: '' });
  ok(keys(bar).includes('browser') && counters.created - created === 1, `② a new chip costs exactly ONE element (${counters.created - created})`);
}

// ── ③ attribute parity with the innerHTML era ─────────────────────────────
console.log('— ③ attributes land as raw strings; classless chips carry no class');
{
  const bar = mkBar(ChatStatusBar);
  bar.applyStatus(firstStatus);
  const nasty = 'a "quoted" & <tagged> reason';
  bar.setJobsHeld(nasty);
  ok(byKey(bar).held.getAttribute('title') === nasty, `③ a title with quotes / & / <> is the raw string (${JSON.stringify(byKey(bar).held.getAttribute('title'))})`);
  ok(byKey(bar).held.innerHTML.includes('a &quot;quoted&quot; &amp; &lt;tagged&gt; reason') && !byKey(bar).held.innerHTML.includes('<tagged>'), '③ …while the same text inside the chip is escaped markup (escHtml unchanged)');
  const els = byKey(bar);
  ok(!els.cache.hasAttribute('class') && !els.cost.hasAttribute('class') && els['cache-k'].className === 'chat-status-dim', '③ the cache / cost chips carry NO class attribute (as before); the [k] twin is chat-status-dim');
  // 500 of 1500 cached = 33 % → the orange tier (a color-mix of the two theme vars), never a literal colour
  ok(/^color:color-mix\(in srgb, var\(--red, #e55\) 50%, var\(--yellow, #e5c07b\)\)$/.test(els.cache.getAttribute('style')) && /^color:var\(--green, #3fb950\)$/.test(els.cost.getAttribute('style')), `③ their colour rides the style attribute, theme vars only (${els.cache.getAttribute('style')} / ${els.cost.getAttribute('style')})`);
  ok(/^<span class="chat-status-ctx-pie" style="background:conic-gradient\(.*\)"><\/span> <span style="color:.*">\d+%<\/span><span class="chat-status-dim">\[\d+k\/\d+k\]<\/span>$/.test(els.ctx.innerHTML), '③ the ctx chip keeps its pie + percent + [used/total] markup shape');
  ok(els.perm.getAttribute('title') === 'Click to change permission mode' && els.perm.textContent.endsWith(' default'), '③ the permission chip: title + label as before');
  // the "?" chips when nothing was reported
  const bare = mkBar(ChatStatusBar, { onSearch: null, onDesignRequest: null });
  bare.render();
  ok(keys(bare).join(',') === 'model,effort,goal,style,perm' && byKey(bare).model.textContent === 'model: ?' && byKey(bare).model.className.includes('chat-status-dim'), `③ a never-reported session draws model: ? / effort: ? dim, no search/design chips when the view offers none (${keys(bare).join(',')})`);
  bar.dispose(); bare.dispose();
}

// ── ④ NEGATIVE CONTROL: the whole-bar rebuild fails ① ──────────────────────
console.log('— ④ negative control: a neutered copy (whole-bar rebuild) breaks identity');
{
  const dir = scratch('sbchips');
  fs.mkdirSync(dir, { recursive: true });
  try {
    const src = read('src/lib/chat-status-bar.js');
    const neutered = src.replace('    this._reconcile(chips);\n  }', '    this._chipEls.clear(); this._element.innerHTML = \'\'; this._element.childNodes.length = 0; this._reconcile(chips);\n  }')
      .replace(/from '\.\//g, `from '${pathToFileURL(path.join(repo, 'src/lib')).href}/`)
      .replace(/from '\.\.\//g, `from '${pathToFileURL(path.join(repo, 'src')).href}/`);
    ok(neutered !== src, '④ the copy differs from the source (the neuter landed)');
    const f = path.join(dir, 'chat-status-bar.neutered.js');
    fs.writeFileSync(f, neutered);
    const { ChatStatusBar: Neutered } = await import(pathToFileURL(f).href);
    const bar = mkBar(Neutered);
    bar.applyStatus(firstStatus);
    const v = driveTwenty(bar);
    ok(Object.keys(v.touched).length === v.order.length && v.created > 0, `④ the neutered copy replaces EVERY chip on every tick (${Object.keys(v.touched).length}/${v.order.length} replaced, ${v.created} elements created) — the ① check can fail`);
    bar.dispose();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ── ⑤ wiring pins ─────────────────────────────────────────────────────────
console.log('— ⑤ wiring');
{
  const src = read('src/lib/chat-status-bar.js');
  const renderBody = src.slice(src.indexOf('\n  render() {'), src.indexOf('\n  _reconcile(chips) {'));
  ok(renderBody.length > 0 && /\n    this\._reconcile\(chips\);\n  \}\s*$/.test(renderBody.replace(/\n  \/\*\*[\s\S]*$/, '\n')), '⑤ render() ends in this._reconcile(chips)');
  ok(!/this\._element\.innerHTML\s*=/.test(src), '⑤ the file never assigns this._element.innerHTML (the whole-bar rebuild is gone)');
  ok(!/\bparts\.push\(|parts\.join\(/.test(src), '⑤ no parts.push / parts.join left');
  ok((src.match(/\n\s*(?:if \([^)]*\) )?chip\('/g) || []).length >= 22, `⑤ every chip site goes through chip(key, …) (${(src.match(/\n\s*(?:if \([^)]*\) )?chip\('/g) || []).length} sites)`);
  ok(/this\._element\.addEventListener\('click', \(e\) => \{\s*this\._onClick\(e\);/.test(src) && !/\bel\.onclick\s*=|\bel\.addEventListener\(/.test(src.slice(src.indexOf('_reconcile(chips) {'), src.indexOf('// ── Private ──'))), '⑤ click handling stays the ONE delegated listener on the bar — _reconcile binds nothing per chip');
  ok(/\{ name: 'test-status-bar-chips', tier: 'fast' \}/.test(read('scripts/ci.mjs')), '⑤ ci.mjs carries test-status-bar-chips in the fast tier');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

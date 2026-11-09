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
//   ⑦ the LOCKED chip (lane fable-52-cli-321, F1) — the served model held against the
//     lock target, the label naming the served model else that target; edges (a)–(e) by name.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
// the condition must be a BOOLEAN (lane fable-52-cli-321 r6: thirteen legs called ok(name, condition) — a non-empty string is
// always true, so they could not fail); anything else fails, named
const ok = (c, n, extra) => {
  if (typeof c !== 'boolean') { fail++; console.error(`  ✗ ok() was handed a ${typeof c} as its condition (arguments swapped, or not a verdict): ${String(typeof c === 'string' ? c : n).slice(0, 160)}`); return; }
  if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); }
};
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
  // lane agy-status-bar-facts: a claude bar says «not reported» (ONE chip) for the facts its row lacks — token total, turn time
  ok(order0.join(',') === 'search,model,effort,goal,style,design,perm,ctx,cache,cache-k,unreported,cost', `first render draws the expected chip set in bar order (${order0.join(',')})`);
  ok(bar.element.children.every((el) => el.tagName === 'SPAN' && el.getAttribute('data-chip')), 'every chip is a <span data-chip=…>');
  const v = driveTwenty(bar);
  ok(Object.keys(v.touched).length === 0, `① every chip is the SAME node object after 20 context%/cache/cost/turn-state ticks (replaced: ${JSON.stringify(v.touched)})`);
  ok(v.created === 0, `① zero elements created after the first render (${v.created})`);
  ok(v.orderAfter.join(',') === v.order.join(','), `① the order is unchanged (${v.orderAfter.join(',')})`);
  const hot = ['ctx', 'cost'], warm = ['cache', 'cache-k'], cold = ['search', 'model', 'effort', 'goal', 'style', 'design', 'perm', 'unreported'];
  ok(hot.every((k) => v.after[k].innerSets === 21), `① the hot chips (${hot.join('/')}) re-wrote their inner markup once per tick — their text changes every tick (${hot.map((k) => v.after[k].innerSets).join('/')})`);
  // the cache percentage / [k] round to the same string on several ticks — an
  // unchanged string is NOT written (that is the point), so fewer than 21
  ok(warm.every((k) => v.after[k].innerSets > 1 && v.after[k].innerSets < 21), `① the cache chips (${warm.join('/')}) re-wrote only when their rounded text changed (${warm.map((k) => v.after[k].innerSets).join('/')} of 21 ticks)`);
  ok(cold.every((k) => v.after[k].innerSets === 1), `① the cold chips (${cold.join('/')}) were written once and never again (${cold.map((k) => v.after[k].innerSets).join('/')})`);
  // tick 20: 21000 + 2500 + 20 = 23520 of 200000 → 12 %, "24k"
  ok(/>12%</.test(v.after.ctx.innerHTML) && /\[24k\/200k\]/.test(v.after.ctx.innerHTML), `① …and the ctx chip shows the LAST reading (${v.after.ctx.textContent})`);
  ok(v.after.cost.innerHTML === 'This chat ≈ $2.50', `① …and the cost chip shows the accumulated cost IN WORDS (lane door-healthy-chat — the studies' W3: a bare «$0.47» read as a bill) (${v.after.cost.innerHTML})`);
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
  bar.setBrowserProfile({ key: 'k', fact: { input: null, live: false }, words: { show: true, line: 'Work', name: 'Work', tooltip: 'Using: Work', amber: false } }); // lane S2: the chip prints THE browser fact's words
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
  ok(!els.cache.hasAttribute('class') && els.cost.className === 'chat-status-cost' && els['cache-k'].className === 'chat-status-dim', '③ the cache chip carries NO class attribute (as before), the cost chip `chat-status-cost` (lane door-healthy-chat: its words + its title); the [k] twin is chat-status-dim');
  // 500 of 1500 cached = 33 % → the orange tier (a color-mix of the two theme vars), never a literal colour
  ok(/^color:color-mix\(in srgb, var\(--red, #e55\) 50%, var\(--yellow, #e5c07b\)\)$/.test(els.cache.getAttribute('style')) && /^color:var\(--green, #3fb950\)$/.test(els.cost.getAttribute('style')), `③ their colour rides the style attribute, theme vars only (${els.cache.getAttribute('style')} / ${els.cost.getAttribute('style')})`);
  ok(/^<span class="chat-status-ctx-pie" style="background:conic-gradient\(.*\)"><\/span> <span style="color:.*">\d+%<\/span><span class="chat-status-dim">\[\d+k\/\d+k\]<\/span>$/.test(els.ctx.innerHTML), '③ the ctx chip keeps its pie + percent + [used/total] markup shape');
  ok(els.perm.getAttribute('title') === 'Click to change permission mode' && els.perm.textContent.endsWith(' default'), '③ the permission chip: title + label as before');
  // the "?" chips when nothing was reported
  const bare = mkBar(ChatStatusBar, { onSearch: null, onDesignRequest: null });
  bare.render();
  ok(keys(bare).join(',') === 'model,effort,goal,style,perm,unreported' && byKey(bare).model.textContent === 'model: ?' && byKey(bare).model.className.includes('chat-status-dim'), `③ a never-reported session draws model: ? / effort: ? dim, no search/design chips when the view offers none (${keys(bare).join(',')})`);
  bar.dispose(); bare.dispose();
}

// ── ④ NEGATIVE CONTROL: the whole-bar rebuild fails ① ──────────────────────
console.log('— ④ negative control: a neutered copy (whole-bar rebuild) breaks identity');
{
  const dir = scratch('sbchips');
  fs.mkdirSync(dir, { recursive: true });
  try {
    const src = read('src/lib/chat-status-bar.js');
    const neutered = src.replace('    this._reconcile(chips);\n', '    this._chipEls.clear(); this._element.innerHTML = \'\'; this._element.childNodes.length = 0; this._reconcile(chips);\n')   // (lane phone-chip's _fitBilling() follows the reconcile since the 2.369.202 integration)
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
  ok(renderBody.length > 0 && /\n    this\._reconcile\(chips\);\n(?:    this\._fitBilling\(\);\n)?(?:    this\._fold\(\);\n)?  \}\s*$/.test(renderBody.replace(/\n  \/\*\*[\s\S]*$/, '\n')), '⑤ render() ends in this._reconcile(chips) (then lane phone-chip\'s _fitBilling(), which measures the drawn pill, then lane phone-chat-composer\'s phone-only _fold())');
  ok(!/this\._element\.innerHTML\s*=/.test(src), '⑤ the file never assigns this._element.innerHTML (the whole-bar rebuild is gone)');
  ok(!/\bparts\.push\(|parts\.join\(/.test(src), '⑤ no parts.push / parts.join left');
  ok((src.match(/\n\s*(?:if \([^)]*\) )?chip\('/g) || []).length >= 22, `⑤ every chip site goes through chip(key, …) (${(src.match(/\n\s*(?:if \([^)]*\) )?chip\('/g) || []).length} sites)`);
  ok(/this\._element\.addEventListener\('click', \(e\) => \{\s*this\._onClick\(e\);/.test(src) && !/\bel\.onclick\s*=|\bel\.addEventListener\(/.test(src.slice(src.indexOf('_reconcile(chips) {'), src.indexOf('// ── Private ──'))), '⑤ click handling stays the ONE delegated listener on the bar — _reconcile binds nothing per chip');
  ok(/\{ name: 'test-status-bar-chips', tier: 'fast'(?:,| \})/.test(read('scripts/ci.mjs')), '⑤ ci.mjs carries test-status-bar-chips in the fast tier');
}

// ⑥ lane door-healthy-chat (2.369.344): the cost says what it is and whether it is billed; the kinds of record the CLI added
// are ONE quiet chip, LAST (it never moves another chip under the pointer — W6)
{
  const BW = await import(pathToFileURL(path.join(repo, 'src/lib/chat-bar-words.js')).href);
  const fmt = (k, p) => String(k).replace(/\{(\w+)\}/g, (_, x) => (p && p[x] != null ? p[x] : ''));
  ok(BW.costBasisOf({ source: 'subscription' }) === 'subscription' && BW.costBasisOf({ source: 'codex-subscription' }) === 'subscription' && ['api-key', 'api-console', 'api-other'].every((x) => BW.costBasisOf({ source: x }) === 'api') && BW.costBasisOf({ source: 'pooled' }) === null && BW.costBasisOf({ source: 'unknown' }) === null && BW.costBasisOf(null) === null, '⑥ costBasisOf: a plan login = subscription, an API key = api, a pool / unknown / none = no claim');
  const sub = BW.costChipWords(0.24, 'subscription', fmt), api = BW.costChipWords(4.24, 'api', fmt), none = BW.costChipWords(0.47, null, fmt);
  ok(sub.text === 'This chat ≈ $0.24 · included in your subscription' && sub.tone === 'quiet' && /nothing is billed per use/.test(sub.title) && api.text === 'This chat ≈ $4.24 · billed per use (API key)' && api.tone === 'tier' && none.text === 'This chat ≈ $0.47' && none.tone === 'tier' && /at API prices/.test(none.title), '⑥ costChipWords: the figure with its words — «This chat ≈ $0.24 · included in your subscription» (quiet), «… · billed per use (API key)», or the figure alone with what it is', { sub, api, none });
  const zh = (await import(pathToFileURL(path.join(repo, 'src/lib/i18n-zh.js')).href)).default;
  ok(zh['This chat ≈ {usd} · included in your subscription'] === '本次对话约 {usd} · 按你的订阅不另计费', '⑥ …in Chinese, the brief\'s words: «本次对话约 $0.24 · 按你的订阅不另计费»');
  const bar = mkBar(ChatStatusBar);
  bar.applyStatus(firstStatus);
  bar.setCostBasis({ source: 'subscription' });
  bar.setAddedKinds([{ kind: 'record', name: 'api-request-blob', cli: '2.1.309' }]);
  const order = keys(bar), els = byKey(bar);
  ok(order[order.length - 1] === 'kinds' && order.join(',').startsWith('search,model,effort,goal,style,design,perm,ctx,cache,cache-k,unreported,cost'), `⑥ the kinds chip is LAST — every other chip keeps its place (${order.join(',')})`);
  ok(els.kinds.textContent === '1 record kind this version added — Diagnostics' && els.kinds.className === 'chat-status-kinds chat-status-clickable' && !els.kinds.getAttribute('style') && /api-request-blob: a new record \(2\.1\.309\)/.test(els.kinds.getAttribute('title')), '⑥ «1 record kind this version added — Diagnostics», quiet (no inline colour — the theme\'s dim), each kind in its title');
  ok(els.cost.innerHTML === 'This chat ≈ $0.50 · included in your subscription' && els.cost.getAttribute('style') === 'color:var(--text-dim)', `⑥ a subscription's cost is quiet (dim), never the tier colours (${els.cost.getAttribute('style')})`);
  const n = counters.innerHTML; bar.setAddedKinds([{ kind: 'record', name: 'api-request-blob', cli: '2.1.309' }]); bar.setCostBasis({ source: 'subscription' });
  ok(counters.innerHTML === n, '⑥ the same kinds / the same basis again write nothing');
  bar.setAddedKinds([]);
  ok(!keys(bar).includes('kinds'), '⑥ no kinds ⇒ no chip');
}

// ⑦ lane fable-52-cli-321, F1 (2.369.390): THE OWNER'S LOCKED CHIP. His phone read an amber «🔒⚠ claude-fable-5-2» on a
// conversation locked to fable[1m] and served by Fable 5.2: the bar held the served model against the model the LAST DRAWN record
// set (the init of a turn from before the CLI update, met on a scroll up). LOCKED with a known target ⇒ the served model is held
// against the LOCK TARGET (an alias lock family-wide, a full id exactly) and the label names the served model, else that target —
// never a drawn record's model. Every client holds the CURRENT target: the server tells each one live when the lock moves
// (stream-wall lockFrame → the `model-lock` op → applyStatus). Unlocked, or a lock whose target an older meta never named ⇒ as before.
console.log('— ⑦ a locked chip holds the served model against the lock target (the owner\'s 🔒 fable[1m] scene)');
{
  const chipOf = (bar) => { const el = byKey(bar).model; return { text: el.textContent.trim(), amber: /chat-status-model-fallback/.test(el.className), locked: /chat-status-model-locked/.test(el.className), dim: /chat-status-dim/.test(el.className), title: el.getAttribute('title') || '' }; };
  const plain = (c, text) => c.locked && !c.amber && c.text === text;
  const lockedOn = (target, model = 'claude-fable-5-2') => { const b = mkBar(ChatStatusBar); b.applyStatus({ ...firstStatus, model, modelLocked: true, lockedModel: target }); return b; };
  // (the scene) attached, a live turn served by 5-2, then the scroll up draws an older turn's init (5-1) and a /model echo of
  // another family — chat-view's own setModel for each drawn record, AFTER the served fact arrived
  const bar = lockedOn('fable[1m]');
  bar.setServedModel('claude-fable-5-2');
  const live = chipOf(bar);
  bar.setModel('claude-fable-5-1');
  const drawn51 = chipOf(bar);
  bar.setModel('claude-opus-5-5');
  const drawnOpus = chipOf(bar);
  ok(plain(live, 'claude-fable-5-2'), `⑦ the owner's scene: locked fable[1m], served claude-fable-5-2 ⇒ plain «🔒 ${live.text}»`, JSON.stringify(live));
  ok(plain(drawn51, 'claude-fable-5-2'), `⑦ (c) …an older turn's init drawn on a scroll up (claude-fable-5-1) changes neither the label nor the amber: plain «🔒 ${drawn51.text}» (before: amber «🔒⚠ claude-fable-5-2»)`, JSON.stringify(drawn51));
  ok(plain(drawnOpus, 'claude-fable-5-2'), `⑦ (c) …nor a /model echo of another family drawn after it (claude-opus-5-5): plain «🔒 ${drawnOpus.text}»`, JSON.stringify(drawnOpus));
  // (e) a real fallback under the lock ⇒ amber, its tooltip naming the LOCK TARGET; the family served again ⇒ it clears
  bar.setServedModel('claude-opus-5-5');
  const fb = chipOf(bar);
  ok(fb.locked && fb.amber && fb.text === '⚠ claude-opus-5-5' && /instead of fable\[1m\]/.test(fb.title) && /LOCKED — retries fable\[1m\]/.test(fb.title), `⑦ (e) a real fallback under the lock (served claude-opus-5-5) ⇒ amber «🔒${fb.text}», the tooltip names the lock target («instead of fable[1m]»)`, JSON.stringify(fb));
  bar.setServedModel('claude-fable-5-2');
  const back = chipOf(bar);
  ok(plain(back, 'claude-fable-5-2'), `⑦ (e) …and it clears when the family is served again: plain «🔒 ${back.text}»`, JSON.stringify(back));
  // (d) the person unlocks ⇒ the chip is as before at once: an unlock that leaves the old target in the field (a status without
  // lockedModel) reads NO stale target — a pick of opus served by opus is plain, not «⚠» against fable[1m]
  bar.applyStatus({ modelLocked: false });
  bar.setModel('claude-opus-5-5'); bar.setServedModel('claude-opus-5-5');
  const un = chipOf(bar);
  ok(!un.locked && !un.amber && un.text === 'claude-opus-5-5', `⑦ (d) unlocked ⇒ the chip is as before at once, no stale lock target read: «${un.text}», plain`, JSON.stringify(un));
  bar.dispose();
  // a reload: the served model is unknown until it changes (the served-model op is change-only) ⇒ the label names the LOCK TARGET,
  // never the status's or a drawn record's model; the next served record names itself
  const re = lockedOn('fable[1m]', 'claude-fable-5-1');
  const re0 = chipOf(re);
  re.setModel('claude-fable-5-1');
  const re1 = chipOf(re);
  re.setServedModel('claude-fable-5-2');
  const re2 = chipOf(re);
  ok(plain(re0, 'fable[1m]') && plain(re1, 'fable[1m]'), `⑦ after a reload, no served model yet ⇒ the lock target, plain «🔒 ${re0.text}» — a drawn 5-1 init leaves it «🔒 ${re1.text}» (before: «🔒 claude-fable-5-1»)`, JSON.stringify({ re0, re1 }));
  ok(plain(re2, 'claude-fable-5-2'), `⑦ …the next served record names itself: plain «🔒 ${re2.text}»`, JSON.stringify(re2));
  // the slice acceptance's minor 1: the reloaded label is the lock TARGET while the CLI last reported claude-fable-5-1 — the title
  // never credits the CLI with it («as last reported by the CLI»); once the served record names itself, it does
  ok(/^The model this conversation asks for/.test(re0.title) && /^The model this conversation asks for/.test(re1.title) && !/as last reported/.test(re0.title + re1.title) && /as last reported by the CLI/.test(re2.title),
    `⑦ …and the title says what the label is: the target the conversation asks for («${re0.title.split(' — ')[0]}»), never «as last reported by the CLI» while the CLI last reported claude-fable-5-1; the served record's title credits the CLI («${re2.title.split(' — ')[0]}»)`, JSON.stringify({ t0: re0.title, t1: re1.title, t2: re2.title }));
  re.dispose();
  // locked, NOTHING reported by the CLI yet: the label is the lock target, the title credits no CLI report
  const nr = mkBar(ChatStatusBar);
  nr.applyStatus({ modelLocked: true, lockedModel: 'fable[1m]' });
  const nrc = chipOf(nr);
  ok(plain(nrc, 'fable[1m]') && !nrc.dim && /^Model not reported by the CLI yet/.test(nrc.title) && !/as last reported/.test(nrc.title), `⑦ locked, nothing reported yet ⇒ the label «🔒 ${nrc.text}», the title says the CLI reported nothing («${nrc.title.split(' · ')[0]}»)`, JSON.stringify(nrc));
  nr.dispose();
  // (b) a lock on the [1m] form served by the same model WITHOUT [1m] (the served id never carries it) ⇒ held; a FULL-id lock is
  // held exactly — another point release under it is a fallback
  const b1 = lockedOn('claude-fable-5-2[1m]', 'claude-fable-5-1');
  b1.setServedModel('claude-fable-5-2');
  const b1c = chipOf(b1);
  ok(plain(b1c, 'claude-fable-5-2'), `⑦ (b) locked claude-fable-5-2[1m], served claude-fable-5-2 ⇒ held, plain «🔒 ${b1c.text}»`, JSON.stringify(b1c));
  b1.dispose();
  const b2 = lockedOn('claude-fable-5-1');
  b2.setServedModel('claude-fable-5-2');
  const b2c = chipOf(b2);
  ok(b2c.locked && b2c.amber && b2c.text === '⚠ claude-fable-5-2' && /instead of claude-fable-5-1/.test(b2c.title), `⑦ (b) a FULL-id lock (claude-fable-5-1) served by claude-fable-5-2 ⇒ amber «🔒${b2c.text}» — a point release is held exactly`, JSON.stringify(b2c));
  b2.dispose();
  // (a) a lock an older meta stored WITHOUT its target ⇒ as before: no new amber, no lost amber
  const a1 = mkBar(ChatStatusBar);
  a1.applyStatus({ ...firstStatus, model: 'claude-fable-5-2', modelLocked: true });
  a1.setServedModel('claude-fable-5-2');
  const a1c = chipOf(a1);
  a1.setServedModel('claude-opus-5-5');
  const a1f = chipOf(a1);
  ok(plain(a1c, 'claude-fable-5-2') && a1f.locked && a1f.amber && a1f.text === '⚠ claude-opus-5-5', `⑦ (a) locked with NO target known (an older meta) ⇒ as before: served = the reported model plain «🔒 ${a1c.text}», a fallback amber «🔒${a1f.text}»`, JSON.stringify({ a1c, a1f }));
  a1.dispose();

  // TWO CLIENTS, NO RELOAD (主开发 17:27Z — the owner's day: phone + desktop). The REAL set-model case of src/ws-handler.js (its
  // text, run with the session, a recording broadcastToSession and the module's own require) moves the lock as the person asks on
  // client A; every frame it broadcasts reaches BOTH bars through chat-view's own `model-lock` line; the CLI's live records (the
  // echo, each turn's init, the served model) are drawn on both. After each step both bars hold the server's lock and target, and
  // the chip says what the lock means.
  const { createRequire } = await import('node:module');
  const wsSrc = read('src/ws-handler.js'), cvSrc = read('src/lib/chat-view.js');
  const caseText = wsSrc.slice(wsSrc.indexOf("        case 'set-model': {"), wsSrc.indexOf("        case 'set-effort': {"));
  const lockLine = /if \(op\.subtype === 'model-lock'\) \{\n\s*(this\._statusBar\.applyStatus\([^\n]*\);)\n\s*return;\n\s*\}/.exec(cvSrc);
  ok(caseText.length > 200 && !!lockLine, `⑦ two clients: the real set-model case (${caseText.length} chars) and chat-view's model-lock line are read`);
  const applyLock = new Function('op', (lockLine ? lockLine[1] : '').replace('this._statusBar', 'this'));
  const twoClients = (text) => {
    const run = new Function('data', 'activeSessions', 'adapterRegistry', 'readSessionMeta', 'writeSessionMeta', 'broadcastActiveSessions', 'broadcastToSession', 'require', `switch (data.type) {\n${text}\n}`);
    const SID = 'sid-two', sess = { pty: { write() {} }, mode: 'chat', backend: 'claude', _modelLocked: true, _lockedModel: 'fable[1m]', sockName: null };
    const A = lockedOn('fable[1m]'), B = lockedOn('fable[1m]'), bars = [A, B];
    const say = (d) => run({ type: 'set-model', sessionId: SID, ...d }, new Map([[SID, sess]]), { get: () => ({ formatSetModel: (m) => JSON.stringify({ set_model: m }) }) }, () => ({}), () => {}, () => {},
      (_s, _id, frame) => { if (frame && frame.op === 'meta' && frame.subtype === 'model-lock') bars.forEach((x) => applyLock.call(x, frame)); }, createRequire(path.join(repo, 'src/ws-handler.js')));
    const draw = (m) => bars.forEach((x) => x.setModel(m)), serve = (m) => bars.forEach((x) => x.setServedModel(m));
    const agree = () => bars.every((x) => !!x._modelLocked === !!sess._modelLocked && (x._lockedModel || null) === (sess._lockedModel || null));
    const out = {};
    serve('claude-fable-5-2');
    // A picks opus under the lock (the bar's own pick: the frame, the optimistic re-target) ⇒ the server re-targets the lock
    say({ model: 'opus' });   // the press: a frame, no fact of its own (r6 — the bar shows a pending mark until the server answers)
    draw('claude-opus-5-5'); draw('claude-opus-5-5'); serve('claude-opus-5-5');   // the set_model echo, the next turn's init and served model
    out.pick = { agree: agree(), A: chipOf(A), B: chipOf(B) };
    draw('claude-opus-5-5'); serve('claude-fable-5-2');                              // a REAL fallback under the new lock
    out.fallback = { agree: agree(), A: chipOf(A), B: chipOf(B) };
    say({ lock: false });                                                             // A unlocks
    out.unlock = { agree: agree(), A: chipOf(A), B: chipOf(B) };
    draw('claude-opus-5-5'); serve('claude-opus-5-5');
    say({ lock: true });                                                                // A locks again (the server locks its ask)
    out.relock = { agree: agree(), A: chipOf(A), B: chipOf(B) };
    draw('claude-opus-5-5'); serve('claude-fable-5-2');                              // a REAL fallback under the new lock
    out.fallback2 = { agree: agree(), A: chipOf(A), B: chipOf(B) };
    bars.forEach((x) => x.dispose());
    return out;
  };
  const tc = twoClients(caseText);
  ok(tc.pick.agree && plain(tc.pick.A, 'claude-opus-5-5') && plain(tc.pick.B, 'claude-opus-5-5'), `⑦ two clients: A re-targets the lock to opus by a pick ⇒ B is told live (both hold the server's target), served opus ⇒ both plain «🔒 ${tc.pick.B.text}» — never «⚠» against a stale fable[1m]`, JSON.stringify(tc.pick));
  ok(tc.fallback.agree && tc.fallback.A.amber && tc.fallback.B.amber && /instead of opus/.test(tc.fallback.B.title), `⑦ two clients: …then a REAL fallback (served claude-fable-5-2 against the opus lock) ⇒ amber on both «🔒${tc.fallback.B.text}» — never hidden by B's old target`, JSON.stringify(tc.fallback));
  ok(tc.unlock.agree && !tc.unlock.A.locked && !tc.unlock.B.locked, `⑦ two clients: A unlocks ⇒ B unlocked at once (no lock badge left until a reload)`, JSON.stringify(tc.unlock));
  ok(tc.relock.agree && plain(tc.relock.A, 'claude-opus-5-5') && plain(tc.relock.B, 'claude-opus-5-5'), `⑦ two clients: A locks again (on opus) ⇒ B locked on the same target, plain «🔒 ${tc.relock.B.text}»`, JSON.stringify(tc.relock));
  ok(tc.fallback2.agree && tc.fallback2.A.amber && tc.fallback2.B.amber, `⑦ two clients: …and a REAL fallback after the unlock + relock ⇒ amber on both «🔒${tc.fallback2.B.text}»`, JSON.stringify(tc.fallback2));
  // a served fact OLDER than the lock's last move is judged as before: a fallback to opus (amber), then A picks fable again under the
  // lock (the frame reaches B; nothing new is served yet), then /model opus typed on A (its echo drawn) — the opus record predates
  // the re-pick, so B reads what the old comparison read (plain «claude-opus-5-5»), never a fallback that has not happened since
  {
    const B2 = lockedOn('fable[1m]');
    B2.setServedModel('claude-fable-5-2'); B2.setModel('claude-fable-5-2'); B2.setServedModel('claude-opus-5-5');
    const f0 = chipOf(B2);
    applyLock.call(B2, { type: 'msg', op: 'meta', subtype: 'model-lock', data: { modelLocked: true, lockedModel: 'fable[1m]' } });
    B2.setModel('claude-fable-5-2');                       // the set_model echo of the re-pick
    B2.setModel('claude-opus-5-5');                        // the /model opus echo
    const f1 = chipOf(B2);
    B2.setModel('claude-opus-5-5'); B2.setServedModel('claude-fable-5-2'); B2.setServedModel('claude-opus-5-5');   // later turns: fable, then opus served AFTER the move
    const f2 = chipOf(B2);
    ok(f0.amber && !f1.amber && f1.text === 'claude-opus-5-5' && f2.amber, `⑦ two clients: a served fact older than the lock's last move is judged as before — a fallback (amber), the lock re-picked elsewhere, /model opus typed ⇒ «🔒 ${f1.text}» plain as before; opus served AFTER the move ⇒ amber «🔒${f2.text}»`, JSON.stringify({ f0, f1, f2 }));
    B2.dispose();
  }
  // every server writer of the lock or its target tells every client: each `session._modelLocked =` / `session._lockedModel =`
  // in the set-model case and the parse is followed (within three lines) by a broadcast of stream-wall's lockFrame
  const census = [];
  for (const f of ['src/ws-handler.js', 'src/server/stdout/claude-stream-json.js']) {
    const lines = read(f).split('\n');
    lines.forEach((l, i) => { if (/\bsession\._(?:modelLocked|lockedModel) = /.test(l) && !/\/\//.test(l.split('=')[0])) census.push({ f, line: i + 1, told: lines.slice(i, i + 4).some((x) => /broadcastToSession\(session, (?:data\.sessionId|id), (?:require\('\.\/server\/stream-wall\.js'\)\.)?lockFrame\(session, (?:data\.sessionId|id)\)\)/.test(x)) }); });
  }
  const untold = census.filter((c) => !c.told);
  ok(census.length >= 4 && untold.length === 0, `⑦ every server writer of the lock is told to every client — ${census.length} writers (ws-handler's press and pick, the parse's target-less latch; round 4's law C took the echo's alias upgrade away), each followed by lockFrame's broadcast${untold.length ? ' — UNTOLD: ' + untold.map((c) => c.f + ':' + c.line).join(', ') : ''}`);
  ok(/subtype: 'model-lock', data: \{ modelLocked: !!\(s && s\._modelLocked\), lockedModel: \(s && s\._lockedModel\) \|\| null \}/.test(read('src/server/stream-wall.js')), '⑦ lockFrame carries exactly the attach status\'s two fields (modelLocked, lockedModel)');
  // THE PARSE'S WRITER, DRIVEN (the slice acceptance's minor 2 — the census above only reads it): the REAL claude-stream-json consumer,
  // attached to a fake pty with a recording broadcastToSession, latches a target-less lock (a conversation an older meta saved as
  // `modelLock` with no `lockModel`) on its first main-thread record; its frame reaches BOTH bars through chat-view's own model-lock
  // line. The latch's gate is the engine's `servedDefinesModel` (measured on the real engine by test-fable-cap-pool-storm §11) —
  // answered here, both ways: yes ⇒ latched, written to the meta, told; no ⇒ nothing latched and nothing told.
  {
    const req = createRequire(path.join(repo, 'src/server/stdout/claude-stream-json.js'));
    const CSJ = req('./claude-stream-json.js'), { createMessageManager } = req('../../normalizers.js'), MAL = req('../model-ask.js');
    const factsLine = /if \(op\.subtype === 'model-facts'\) \{\n\s*(this\._statusBar\.applyStatus\([^\n]*\);)/.exec(cvSrc);
    const applyFacts = new Function('op', (factsLine ? factsLine[1] : '').replace('this._statusBar', 'this'));
    const latchRun = (defines, withFacts = false) => {
      const engine = new Proxy({ noteServedModel(se, m) { se._servedModel = m; }, servedDefinesModel: () => defines, rerouteAnnouncedBy: () => false, recordIsLate: () => false, modelsMatch: (x, y) => x === y }, { get: (t, k) => (k in t ? t[k] : () => undefined) });
      const SID = 'sid-latch', sess = { id: SID, backend: 'claude', sockName: 'sock-latch', _modelLocked: true, _lockedModel: null, _spawnModel: 'fable[1m]', clients: new Set() };
      sess._normalizer = createMessageManager('claude', SID);
      const meta = {}, told = [], pty = { cb: null, onData(cb) { this.cb = cb; }, onExit() { } };
      const A = mkBar(ChatStatusBar), B = mkBar(ChatStatusBar), bars = [A, B];
      bars.forEach((x) => x.applyStatus({ ...firstStatus, model: 'claude-fable-5-2', modelLocked: true, ...(withFacts ? MAL.modelFacts(sess) : {}) }));   // the attach status: locked, no target (round 9: and the server's facts — every claude attach carries them)
      CSJ.create({ activeSessions: new Map([[SID, sess]]), engine, CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result']), _seenStreamTypes: new Set(), USAGE_SCANNER_PATH: '/nonexistent', checkClaudeGoalStatus() { }, noteModelSeen() { }, sbSeenFirst: () => true, hosts: null, usageHistory: { _cost: () => 0, ingestRemoteEvents() { } }, pagesRef: null })
        .attach(sess, SID, pty, { feedLive() { }, broadcastActiveSessions() { }, readSessionMeta: (k) => meta[k] || null, writeSessionMeta: (k, v) => { meta[k] = v; }, updateSessionTodos() { }, applyTaskToolUpdate() { }, emitTaskListTodos() { },
          broadcastToSession: (_s, _id, frame) => { if (frame && frame.op === 'meta' && frame.subtype === 'model-lock') { told.push(frame.data); bars.forEach((x) => applyLock.call(x, frame)); } if (withFacts && frame && frame.op === 'meta' && frame.subtype === 'model-facts') bars.forEach((x) => applyFacts.call(x, frame)); } });   // without facts = a .390 client: it reads model-lock, not model-facts
      const line = (o) => pty.cb(JSON.stringify(o) + '\n');
      line({ type: 'system', subtype: 'init', model: 'claude-fable-5-2', session_id: 'cid-latch', tools: [] });
      line({ type: 'assistant', message: { id: 'msg_latch1', role: 'assistant', model: 'claude-fable-5-2', content: [{ type: 'text', text: 'hi' }] } });
      const out = { server: sess._lockedModel, meta: meta['sock-latch'] && meta['sock-latch'].lockedModel, told, held: bars.map((x) => x._lockedModel || null), cli: sess._cliModel || null };
      bars.forEach((x) => x.setServedModel('claude-opus-5-5'));   // a REAL fallback after the latch
      out.A = chipOf(A); out.B = chipOf(B);
      bars.forEach((x) => x.dispose());
      return out;
    };
    const yes = latchRun(true), no = latchRun(false), yesF = latchRun(true, true);
    ok(yes.server === 'claude-fable-5-2' && yes.meta === 'claude-fable-5-2' && yes.told.length === 1 && yes.told[0].modelLocked === true && yes.told[0].lockedModel === 'claude-fable-5-2' && yes.held.every((m) => m === 'claude-fable-5-2') && yes.A.amber && yes.B.amber && /instead of claude-fable-5-2/.test(yes.B.title),
      `⑦ the parse's latch, driven: the REAL consumer latches a target-less lock on claude-fable-5-2, writes it to the meta and tells it ONCE — both bars hold the server's target, and a fallback after it is amber on both with B's tooltip naming the latched target («🔒${yes.B.text}»)`, JSON.stringify(yes));
    ok(no.server === null && !no.meta && no.told.length === 0 && no.held.every((m) => m === null), "⑦ …CONTROL: the engine's gate says the record does not define the model ⇒ nothing latched, nothing written, nothing told (the frame follows the writer)", JSON.stringify(no));
    ok(yesF.server === 'claude-fable-5-2' && yesF.cli === 'claude-fable-5-2' && yesF.held.every((m) => m === 'claude-fable-5-2') && /retries claude-fable-5-2/.test(yesF.B.title) && !/retries \?/.test(yesF.B.title), `⑦ …and on bars that HOLD THE SERVER'S FACTS (every claude attach — the r8 verdict's (c)): the latch reaches them in the facts' own frame, both hold the latched target at once («${(yesF.B.title.split(' · ')[1] || '').slice(0, 60)}», never «retries ?»); the parse also noted the model the CLI says it runs from the init (cliModel)`, JSON.stringify(yesF));
  }
}

// ── ⑧ THE MODEL CHIP IS A FUNCTION OF SERVER FACTS (lane fable-52-cli-321 r4, r5) ──
// The owner's phone (2026-11-09 13:55 PT): 🔒⚠ claude-fable-5-2 in amber on a fable[1m] lock 5.2 served as asked — the chip compared
// the served model with whatever model fact the client DREW last (a 10-29 `/model` echo on a scroll up). r2 held it to the ask but the
// ask moved on some roads only; r3 added echoes and clocks and opened two more. r4: the bar holds the SERVER's facts only — the ask
// (lock, else pick, else spawn), the lock and the served model, each numbered from the conversation's one counter
// (src/server/model-ask.js) — set by the attach status and the `model-facts` broadcast; nothing the view draws reaches it. r5: only a
// status that DECLARES the facts (its harness's capability row) sets them, the bar keeps the newest numbers it saw, and a full-id ask
// is held exactly.
console.log('— ⑧ the model chip: server facts only (the ask, the lock, the served model — one counter); a drawn record moves nothing');
const chipOf = (bar) => { const el = byKey(bar).model; return { amber: /chat-status-model-fallback/.test(el.getAttribute('class') || ''), warn: el.innerHTML.includes('⚠'), text: el.innerHTML.replace(/<[^>]*>/g, ''), title: el.getAttribute('title') || '' }; };
const facts = (o) => ({ modelFacts: true, model: 'claude-fable-5-2', askedModel: 'fable[1m]', askSeq: 3, modelLocked: true, lockedModel: 'fable[1m]', servedModel: 'claude-fable-5-2', servedSeq: 5, ...o });
const chipAfter = (...steps) => { const bar = mkBar(ChatStatusBar); for (const st of steps) bar.applyStatus(st); return chipOf(bar); };
{
  const own = chipAfter(facts());
  ok(!own.amber && !own.warn && own.text.includes('claude-fable-5-2'), '⑧ the owner\'s scene: asked fable[1m] (locked), served claude-fable-5-2 after it ⇒ the plain locked chip «claude-fable-5-2»', own);
  const bar0 = mkBar(ChatStatusBar);
  ok(typeof bar0.noteEchoAsk === 'undefined' && typeof bar0._noteModel === 'undefined' && typeof bar0._noteAsk === 'undefined' && !('_statusModelAt' in bar0) && !('_askedAt' in bar0), '⑧ …and the bar has NO door a drawn record could reach: no echo-as-ask, no record-time ordering, no ask clock (all deleted in r4)');
  // ② a pick on another client: the server's broadcast (the ask numbered after the last served model) — then its first served turn
  const b2 = chipAfter(facts({ modelLocked: false, lockedModel: null }), facts({ modelLocked: false, lockedModel: null, askedModel: 'opus[1m]', askSeq: 6 }));
  const b2t = chipAfter(facts({ modelLocked: false, lockedModel: null }), facts({ modelLocked: false, lockedModel: null, askedModel: 'opus[1m]', askSeq: 6 }), facts({ modelLocked: false, lockedModel: null, askedModel: 'opus[1m]', askSeq: 6, servedModel: 'claude-opus-5-5', servedSeq: 7 }));
  ok(!b2.amber && b2.text.includes('opus[1m]') && !b2t.amber && b2t.text.includes('claude-opus-5-5'), '⑧ a pick on another client (the broadcast): plain while it waits for its first turn (the served model is numbered BEFORE the ask — no answer to it yet; the label is the ask), plain when opus serves', { b2, b2t });
  // ① a typed /model the CLI then served: the server moved the ask (and the lock) — the facts say so
  const t1 = chipAfter(facts({ modelLocked: false, lockedModel: null }), facts({ modelLocked: false, lockedModel: null, askedModel: 'opus[1m]', askSeq: 8, servedModel: 'claude-opus-5-5', servedSeq: 9 }));
  const t1l = chipAfter(facts(), facts({ lockedModel: 'opus[1m]', askedModel: 'opus[1m]', askSeq: 8, servedModel: 'claude-opus-5-5', servedSeq: 9 }));
  ok(!t1.amber && !t1l.amber && t1l.text.includes('claude-opus-5-5'), '⑧ a typed /model (unlocked and locked): plain — the server\'s ask is the typed model and the lock followed', { t1, t1l });
  // law D: pick opus → lock → unlock: the ask is still the pick (a lock set / lifted takes no new number: r5)
  const d = chipAfter(facts({ modelLocked: false, lockedModel: null, askedModel: 'opus[1m]', askSeq: 6, servedModel: 'claude-opus-5-5', servedSeq: 7 }), facts({ modelLocked: true, lockedModel: 'opus[1m]', askedModel: 'opus[1m]', askSeq: 6, servedModel: 'claude-opus-5-5', servedSeq: 7 }), facts({ modelLocked: false, lockedModel: null, askedModel: 'opus[1m]', askSeq: 6, servedModel: 'claude-opus-5-5', servedSeq: 7 }));
  ok(!d.amber && d.text.includes('claude-opus-5-5'), '⑧ pick opus → lock → unlock (law D, the server keeps the pick): plain throughout', d);
  // a REAL fallback: served opus numbered after the ask, nothing asked for it
  const fb = chipAfter(facts({ servedModel: 'claude-opus-5-5', servedSeq: 9 }));
  ok(fb.amber && fb.warn && fb.text.includes('claude-opus-5-5') && fb.title.includes('instead of fable[1m]'), '⑧ a REAL fallback (asked fable[1m], claude-opus-5-5 served after the ask): amber with ⚠, the tooltip names the ask', fb);
  // MUST 4b: a FULL-ID ask is held EXACTLY (the 1M mark and a date suffix aside); an alias ask family-wide
  const exact = (ask, served) => chipAfter(facts({ lockedModel: ask, askedModel: ask, servedModel: served, servedSeq: 9 }));
  const fid = { p51: exact('claude-fable-5-1', 'claude-fable-5-2'), o55: exact('claude-opus-5-5', 'claude-opus-5'), f52: exact('claude-fable-5-2', 'claude-fable-5'), m1: exact('claude-fable-5-2[1m]', 'claude-fable-5-2'), date: exact('claude-opus-5-5', 'claude-opus-5-5-20261101'), alias: exact('opus', 'claude-opus-5') };
  ok(fid.p51.amber && fid.o55.amber && fid.f52.amber, '⑧ MUST 4b: a FULL-ID ask is held exactly — asked claude-opus-5-5 / served claude-opus-5 (a prefix, $5/$25 against $4/$20) and asked claude-fable-5-2 / served claude-fable-5 (an extension\'s base, $10/$50 against $8/$40) are AMBER, as is a pinned point release (5-1 served 5-2)', fid);
  ok(!fid.m1.amber && !fid.date.amber && !fid.alias.amber, '⑧ …its 1M mark and a date suffix aside (asked claude-fable-5-2[1m] served claude-fable-5-2; asked claude-opus-5-5 served claude-opus-5-5-20261101: plain); an ALIAS ask stays family-wide (asked opus, served claude-opus-5: plain)', fid);
  // MUST 4c: the bar keeps the NEWEST numbers it has seen — a stored status landing after the facts (the creator's history on a
  // resume / fork) and a frame with lower numbers change no fact
  const keep = mkBar(ChatStatusBar);
  keep.applyStatus(facts());
  keep.applyStatus({ model: 'claude-fable-5-1', servedModel: 'claude-fable-5-1' });                   // the creator's stored history status
  const afterStored = chipOf(keep);
  keep.applyStatus(facts({ askSeq: 2, servedSeq: 4, askedModel: 'opus', modelLocked: false, lockedModel: null, servedModel: 'claude-opus-5-5' }));   // an older frame
  const afterOlder = chipOf(keep);
  keep.applyStatus(facts({ modelLocked: false, lockedModel: null }));                                // the same numbers: the lock lifted
  ok(!afterStored.amber && afterStored.text.includes('claude-fable-5-2') && !afterOlder.amber && afterOlder.text.includes('claude-fable-5-2') && keep._servedSeq === 5 && keep._askSeq === 3 && keep._modelLocked === false, '⑧ MUST 4c: the bar keeps the newest numbers it has seen — a STORED status after the facts (no numbers) and a frame with LOWER numbers change no fact (no false amber, the lock stays); a frame with the same numbers still lands (a lock lifted takes no number)', { afterStored, afterOlder, servedSeq: keep._servedSeq, locked: keep._modelLocked });
  // MUST 4a: after a hub restart the server hydrates the served fact with its number — a standing fallback stays amber
  const rs = chipAfter(facts({ servedModel: 'claude-opus-5-5', servedSeq: 6, askSeq: 5 }));
  ok(rs.amber && rs.text.includes('claude-opus-5-5'), '⑧ MUST 4a: the facts a restarted hub gives back for a standing fallback (locked fable[1m], opus served after the ask — servedSeq 6 > askSeq 5) draw it AMBER at once, not plain «fable[1m]» until the next turn', rs);
  // a read-only view of a stopped conversation: no live session ⇒ no ask; the store's newest served model, never amber
  const ro = chipAfter({ model: 'claude-fable-5-2', servedModel: 'claude-fable-5-2' });
  ok(!ro.amber && ro.text.includes('claude-fable-5-2'), '⑧ a read-only view of a stopped conversation (the store\'s status: its newest served model, no ask): plain, labelled with what served last', ro);
  // MUST 3: DECLARED, never inferred — a status that carries the facts' KEYS without declaring them sets no facts
  for (const backend of ['codex', 'opencode']) {
    const cx = mkBar(ChatStatusBar, { backend });
    cx.applyStatus({ model: '', askedModel: null, askSeq: 0, modelLocked: false, lockedModel: null, servedModel: null, servedSeq: 0 });   // r4's attach shape for every harness
    const declaredAfterKeys = cx.hasServerModelFacts();
    cx.setModel('gpt-5.1-codex');                                                                          // a LIVE init op (chat-view _liveInitModel)
    const live = chipOf(cx);
    const rl = mkBar(ChatStatusBar, { backend }); rl.applyStatus({ model: 'gpt-5.1-codex-max', askedModel: 'gpt-5.1-codex', askSeq: 0, servedModel: null, servedSeq: 0 });   // a reload: what the server holds (r4 also sent the SPAWN model as an undeclared askedModel)
    ok(!declaredAfterKeys && live.text.includes('gpt-5.1-codex') && chipOf(rl).text.includes('gpt-5.1-codex-max'), `⑧ MUST 3 (${backend}): a status carrying the model-fact keys WITHOUT declaring them sets no facts — the bar holds none, a LIVE init names the model («${live.text}», not «model: ?»), a reload shows what the server holds («${chipOf(rl).text}»)`, { declaredAfterKeys, live, reload: chipOf(rl) });
  }
  const cl = mkBar(ChatStatusBar); cl.applyStatus(facts());
  ok(cl.hasServerModelFacts(), '⑧ …and a status that DECLARES them (`modelFacts: true` — claude\'s capability row) makes the bar hold the server\'s facts');
}
// THE LAW (r6): A CLIENT NEVER INVENTS A FACT OR A NUMBER. A press SENDS its frame and shows a PENDING mark over the server's facts;
// the server's answer to that frame (the facts as they stand, or the refusal) — or a timeout — ends it, and the conversation's resume
// config is written from what the server ACCEPTED. Driven on the real bar: its `_press` (the pick closure and the Lock row are
// one line each over it — pinned by text below), `answerModel`, a captured socket and a captured config callback.
{
  // round 8 MUST 2: the bar writes NO model config at all — a resume reads the SERVER's record (model-ask askRecordOf)
  const modelCfg = (cfg) => cfg.filter((c) => c && ('model' in c || 'modelLock' in c || 'lockModel' in c));
  const mk = () => { const sent = [], cfg = []; const bar = mkBar(ChatStatusBar, { onConfigChange: (c) => cfg.push(c) }); bar._ws = { send: (f) => sent.push(JSON.parse(JSON.stringify(f))) }; return { bar, sent, cfg }; };
  const factsOf = (bar) => ({ ask: bar._askedModel, askSeq: bar._askSeq, served: bar._servedModel, servedSeq: bar._servedSeq, status: bar._statusModel, locked: bar._modelLocked, lockedModel: bar._lockedModel });
  if (typeof ChatStatusBar.prototype._press !== 'function' || typeof ChatStatusBar.prototype.answerModel !== 'function') ok(false, '⑧ THE LAW (r6): the bar has ONE press road (_press — a pending mark) and an ANSWER (answerModel) — absent here, so a press invents its own facts');
  else {
  // L1 + L2: a pick is a pending mark until the answer, then the server's facts; the config comes from the answer
  {
    const { bar, sent, cfg } = mk(); bar.applyStatus(facts({ modelLocked: false, lockedModel: null }));
    const before = JSON.stringify(factsOf(bar)), cfg0 = cfg.length;
    bar._press({ type: 'set-model', sessionId: bar._sessionId, model: 'opus' }, { kind: 'pick', model: 'opus' });
    const during = chipOf(bar), unchanged = JSON.stringify(factsOf(bar)) === before, pendingClass = /chat-status-model-pending/.test(byKey(bar).model.getAttribute('class') || ''), cfgDuring = cfg.length;
    bar.answerModel({ ok: true, answer: sent[0] && sent[0].reqId, facts: facts({ modelLocked: false, lockedModel: null, askedModel: 'opus', askSeq: 6 }) });
    const after = chipOf(bar);
    ok(sent.length === 1 && sent[0].type === 'set-model' && sent[0].sessionId === bar._sessionId && sent[0].model === 'opus' && typeof sent[0].reqId === 'string' && Object.keys(sent[0]).length === 4 && unchanged && pendingClass && during.text.includes('→ opus') && cfgDuring === cfg0 && modelCfg(cfg).length === 0, '⑧ THE LAW (r6, r7, round 8): a pick SENDS its frame — carrying ITS press id — and shows a PENDING mark («→ opus») over the server\'s facts: no fact, no number, and the bar writes no model config (an attach wrote none either)', { during, sent, cfg, unchanged });
    ok(!bar.hasPendingModel() && bar._askedModel === 'opus' && bar._askSeq === 6 && !/→/.test(after.text) && modelCfg(cfg).length === 0, '⑧ …ITS answer ends the mark; the facts land — and still no model config is written: the resume reads the server\'s own record (round 8 MUST 2)', { after, cfg });
  }
  // (c) THE PRESS-ID LAW, TRANSIENT (round 8 — the verifier reverted `mine = !!p` with every suite green): two presses, the FIRST
  // press's answer arrives while the second's mark stands — it must not end the second mark (checked at that moment, not at rest);
  // and two bars of ONE conversation on ONE socket (a page builds one window per conversation — session-lifecycle attachSession —
  // but the law holds anyway): an answer reaches both, and ends only the mark of the bar that pressed
  {
    const { bar, sent } = mk(); bar.applyStatus(facts({ modelLocked: false, lockedModel: null }));
    bar._press({ type: 'set-model', sessionId: bar._sessionId, model: 'opus' }, { kind: 'pick', model: 'opus' });
    bar._press({ type: 'set-model', sessionId: bar._sessionId, model: 'sonnet' }, { kind: 'pick', model: 'sonnet' });
    const [first, second] = sent;
    bar.answerModel({ ok: true, answer: first && first.reqId, facts: facts({ modelLocked: false, lockedModel: null, askedModel: 'opus', askSeq: 6 }) });
    const mid = { pending: bar.hasPendingModel(), mark: bar._pending && bar._pending.reqId, text: chipOf(bar).text };
    bar.answerModel({ ok: true, answer: second && second.reqId, facts: facts({ modelLocked: false, lockedModel: null, askedModel: 'sonnet', askSeq: 7 }) });
    ok(!!first && !!second && first.reqId !== second.reqId && mid.pending && mid.mark === second.reqId && mid.text.includes('→ sonnet') && !bar.hasPendingModel(), '⑧ (c) THE PRESS-ID LAW, at the moment it matters: the FIRST press\'s answer leaves the SECOND press\'s mark standing («→ sonnet» still pending), the second\'s answer ends it', { mid, sent: sent.map((f) => f.reqId) });
    const A = mk(), B = mk();
    for (const x of [A, B]) x.bar.applyStatus(facts({ modelLocked: false, lockedModel: null }));
    A.bar._press({ type: 'set-model', sessionId: 'sid-chips', model: 'opus' }, { kind: 'pick', model: 'opus' });
    B.bar._press({ type: 'set-model', sessionId: 'sid-chips', model: 'sonnet' }, { kind: 'pick', model: 'sonnet' });
    const ans = { ok: true, answer: A.sent[0] && A.sent[0].reqId, facts: facts({ modelLocked: false, lockedModel: null, askedModel: 'opus', askSeq: 6 }) };
    A.bar.answerModel(ans); B.bar.answerModel(ans);   // one socket: both bars hear A's answer
    ok(A.sent[0].reqId !== B.sent[0].reqId && !A.bar.hasPendingModel() && B.bar.hasPendingModel() && B.bar._pending.reqId === B.sent[0].reqId, '⑧ (c) …two bars of one conversation on one socket: A\'s answer reaches both and ends only A\'s mark — B\'s press keeps its own (its id is its own: a sequence and 31 random bits)', { a: A.sent[0].reqId, b: B.sent[0].reqId });
  }
  // THE API REFUSED THE ASK (round 8 — a server fact, askRefused): the chip is amber, its label is the REFUSED value, its title names
  // the value and where to change it (this chip's own menu) — never «Auto-fallback» against a model nothing serves
  {
    const { bar } = mk(); bar.applyStatus(facts({ modelLocked: true, lockedModel: 'nope-model-xyz', askedModel: 'nope-model-xyz', askSeq: 6, servedModel: 'claude-fable-5-2', servedSeq: 5, askRefused: 'nope-model-xyz' }));
    const c = chipOf(bar), title = byKey(bar).model.getAttribute('title') || '';
    bar.applyStatus(facts({ modelLocked: false, lockedModel: null, askedModel: 'opus', askSeq: 7, servedModel: 'claude-fable-5-2', servedSeq: 5, askRefused: null }));
    const after = chipOf(bar);
    ok(c.amber && c.text.includes('⚠ nope-model-xyz') && /The API refused nope-model-xyz — every request to it fails\. Pick another model from this menu\./.test(title) && !after.amber && !after.text.includes('nope'), '⑧ THE API REFUSED THE ASK: amber «🔒⚠ nope-model-xyz», the title names the value and where to change it; a pick clears it', { c, title, after });
  }
  // (a) re-picking the model already asked: the server's ask does not move (no number); this client must not freeze later frames
  {
    const A = mk(), r5 = mk();
    for (const x of [A, r5]) x.bar.applyStatus(facts({ modelLocked: false, lockedModel: null, askSeq: 3, servedSeq: 5 }));
    A.bar._press({ type: 'set-model', sessionId: 'sid-chips', model: 'fable[1m]' }, { kind: 'pick', model: 'fable[1m]' });
    A.bar.answerModel({ ok: true, facts: facts({ modelLocked: false, lockedModel: null, askSeq: 3, servedSeq: 5 }) });   // nothing moved
    A.bar.applyStatus(facts({ modelLocked: true, lockedModel: 'fable[1m]', askSeq: 3, servedSeq: 5 }));                  // client B locks
    r5.bar._askedModel = 'fable[1m]'; r5.bar._askSeq = Math.max(r5.bar._askSeq, r5.bar._servedSeq) + 0.5;                  // r5's optimistic pick
    r5.bar.applyStatus(facts({ modelLocked: true, lockedModel: 'fable[1m]', askSeq: 3, servedSeq: 5 }));
    ok(A.bar._modelLocked === true && r5.bar._modelLocked === false, '⑧ (a) re-picking the model already asked, then client B locks: this client shows LOCKED (r5\'s invented «max + 0.5» number — the control — drops the lock frame for ever)', { A: factsOf(A.bar), r5: factsOf(r5.bar) });
  }
  // (b) the same re-pick during a STANDING REAL FALLBACK: amber before, during and after
  {
    const { bar } = mk(); bar.applyStatus(facts({ servedModel: 'claude-opus-5-5', servedSeq: 9 }));
    const b0 = chipOf(bar).amber;
    bar._press({ type: 'set-model', sessionId: 'sid-chips', model: 'fable[1m]' }, { kind: 'pick', model: 'fable[1m]' });
    const b1 = chipOf(bar).amber;
    bar.answerModel({ ok: true, facts: facts({ servedModel: 'claude-opus-5-5', servedSeq: 9 }) });
    ok(b0 && b1 && chipOf(bar).amber, '⑧ (b) re-picking the asked model during a standing REAL fallback: amber before, while pending and after the answer — a real fallback is never shown plain', { b0, b1, after: chipOf(bar) });
  }
  // (c) a pick the door refuses: the mark ends, the ask is the server's, NOTHING is saved as the resume model
  {
    const { bar, cfg } = mk(); bar.applyStatus(facts({ modelLocked: false, lockedModel: null })); const cfg0 = cfg.length;
    bar._press({ type: 'set-model', sessionId: 'sid-chips', model: 'opus 5' }, { kind: 'pick', model: 'opus 5' });
    bar.answerModel({ ok: false });
    ok(!bar.hasPendingModel() && bar._askedModel === 'fable[1m]' && modelCfg(cfg).length === 0 && !chipOf(bar).text.includes('opus 5'), '⑧ (c) a pick the door refuses («opus 5» from Custom…): the refusal ends the mark, the chip keeps the server\'s ask, and nothing is written as a resume model', { chip: chipOf(bar), cfg });
  }
  // the timeout: no answer ⇒ the mark ends by itself (the bar's own timer, captured here)
  {
    const { bar } = mk(); bar.applyStatus(facts());
    const realSet = globalThis.setTimeout, timers = []; globalThis.setTimeout = (fn, ms) => { timers.push([fn, ms]); return timers.length; };
    try { bar._press({ type: 'set-model', sessionId: 'sid-chips', lock: false }, { kind: 'unlock' }); } finally { globalThis.setTimeout = realSet; }
    const was = bar.hasPendingModel(); timers.forEach(([fn]) => fn());
    ok(was && !bar.hasPendingModel() && timers.length === 1 && timers[0][1] > 0 && timers[0][1] <= 15000 && bar._modelLocked === true, '⑧ …a press nobody answers ends by itself (a short timeout) and leaves the server\'s facts as they were (still locked)', { timers: timers.map(([, ms]) => ms) });
  }
  // the Lock press: a pending mark; the lock comes from the answer
  {
    const { bar, sent, cfg } = mk(); bar.applyStatus(facts({ modelLocked: false, lockedModel: null, askedModel: 'opus', askSeq: 6, servedModel: 'claude-opus-5-5', servedSeq: 7 }));
    bar._press({ type: 'set-model', sessionId: 'sid-chips', lock: true }, { kind: 'lock' });
    const during = bar._modelLocked;
    bar.answerModel({ ok: true, answer: sent[0] && sent[0].reqId, facts: facts({ modelLocked: true, lockedModel: 'opus', askedModel: 'opus', askSeq: 6, servedModel: 'claude-opus-5-5', servedSeq: 7 }) });
    ok(during === false && bar._modelLocked === true && bar._lockedModel === 'opus' && sent[0].lock === true && !('model' in sent[0]) && !('lockModel' in sent[0]) && typeof sent[0].reqId === 'string' && modelCfg(cfg).length === 0, '⑧ …the Lock press: the frame is {type, sessionId, lock} + its press id — no model; the bar is NOT locked until the facts say so, and the bar writes no model config (the server records the lock)', { sent, cfg });
  }
  }
  // the code the closures run (no DOM here — the real taps are in test-mobile-gaps)
  const sb = read('src/lib/chat-status-bar.js');
  const at = sb.indexOf('lockItem.onclick = (ev) => {'), row = at > 0 ? sb.slice(at, sb.indexOf('\n        };', at)) : '';
  ok(/const pick = \(model\) => \{[\s\S]{0,700}?this\._press\(\{ type: 'set-model', sessionId: this\._sessionId, model \}, \{ kind: 'pick', model \}\);\n\s*if \(namedModel\(model\)\) this\._onConfigChange\?\.\(\{ model, \.\.\.\(lockedNow \? \{ lockModel: model \} : \{\}\) \}\);/.test(sb)
    && /this\._press\(\{ type: 'set-model', sessionId: this\._sessionId, lock: nowLock \}, \{ kind: nowLock \? 'lock' : 'unlock', target: nowLock \? target : null \}\);/.test(row)
    && /this\._onConfigChange\?\.\(\{ modelLock: nowLock, lockModel: nowLock \? target : undefined, \.\.\.\(nowLock \? \{ model: target \} : \{\}\) \}\);/.test(row)
    && !/this\._modelLocked = nowLock|this\._lockedModel =/.test(row) && !/_askSeq\s*=\s*Math\.max/.test(sb),
    '⑧ …the pick closure and the Lock row are each ONE press — no fact set, no number invented; the saved config is written AT the press, exactly as on master (round 9 law 2): the pick through the door, the Lock naming the ask this bar holds — its frame names no model (round 5)', row.slice(0, 200));
  ok(/if \(this\._lockRowOffered\(\)\) \{/.test(sb) && /_lockRowOffered\(\) \{ return !!uiRow\(this\._backend\)\.modelLock && \(!!this\._serverModelFacts \|\| !!this\._modelLocked\); \}/.test(sb), '⑧ MUST 2 (r6, r7): the Lock row is offered where the server declares the facts (it locks the server\'s ask) AND wherever a lock STANDS — so an older build\'s lock on opencode / antigravity can be lifted; a press that cannot work is not shown');
  ok(/import \{[^}]*\bmodelHeld\b[^}]*\} from '\.\.\/model-providers\.js';/.test(sb) && /return !modelHeld\(want, this\._servedModel\);/.test(sb) && !/const askHeldBy/.test(sb), '⑧ MUST 5: the chip reads the ONE rule (model-providers modelHeld) — the same helper as the server\'s repin and its typed-/model confirm');
}
// THE CENSUS (law A), DERIVED FROM EVERY CALL SITE (r5, r6). It reads TEXT: every `.name(` / `['name'](` call of the bar's model /
// ask / served setters anywhere in src/ (whatever the receiver — an alias of the bar included), named by its file and enclosing
// method and COUNTED per site, against the roads that draw no record. Its limit: a setter reached through a computed name
// (`bar[k](…)`) or `.call` / `.apply` is beyond a text census.
{
  const CALL = /(?:\.|\[\s*['"])(setModel|setServedModel|applyStatus|answerModel)(?:['"]\s*\])?\s*\(/g;
  const HEAD = /^\s{0,4}(?:export\s+)?(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/;
  const NOT_HEAD = /^\s*(if|for|while|switch|catch|return|else)\b/;
  const callersIn = (rel, text) => {
    const lines = text.split('\n'), out = [];
    lines.forEach((l, i) => {
      const code = l.replace(/\/\/.*$/, '');
      for (const m of code.matchAll(CALL)) {
        let enc = '?'; for (let j = i - 1; j >= 0; j--) { const h = HEAD.exec(lines[j]); if (h && !NOT_HEAD.test(lines[j])) { enc = h[1]; break; } }
        out.push(`${rel} ${enc} .${m[1]}`);
      }
    });
    return out;
  };
  const walk = (dir) => fs.readdirSync(path.join(repo, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(dir + '/' + e.name) : (e.name.endsWith('.js') ? [dir + '/' + e.name] : []));
  const files = walk('src').filter((f) => f !== 'src/lib/chat-status-bar.js');   // the bar's own body is the setters, not a caller
  const ALLOWED = {   // site → how many calls it holds
    'src/lib/chat-view.js loadHistory .applyStatus': 2, 'src/lib/chat-view.js _liveInitModel .setModel': 1, 'src/lib/chat-view.js _onMeta .setServedModel': 1,
    'src/lib/chat-view.js _onMeta .applyStatus': 2,   // model-facts, and model-lock (the .390 slice): frames, never a drawn record
    'src/lib/chat-view.js _onMeta .answerModel': 1, 'src/lib/chat-view.js _startReadOnlyPolling .applyStatus': 1,
    'src/lib/chat-view.js applyStatus .applyStatus': 1, 'src/lib/chat-view.js _reattach .applyStatus': 1, 'src/lib/chat-view.js _applyHeldResume .applyStatus': 1,
    'src/lib/chat-view.js _onSessionError .answerModel': 1, 'src/lib/session-lifecycle.js createSession .applyStatus': 2,
  };
  const count = (sites) => sites.reduce((m, s) => (m[s] = (m[s] || 0) + 1, m), {});
  const judge = (counts) => Object.entries(counts).filter(([s, n]) => (ALLOWED[s] || 0) < n).map(([s, n]) => `${s} ×${n}`);
  const counts = count(files.flatMap((f) => callersIn(f, read(f))));
  ok(Object.keys(counts).length >= 9 && judge(counts).length === 0, `⑧ CENSUS: every call of the bar's model / ask / served setters in src/ (${Object.values(counts).reduce((a, b) => a + b, 0)} calls at ${Object.keys(counts).length} sites, derived) is on a road that draws no record, counted per site`, judge(counts).concat(Object.keys(counts)));
  const cv = read('src/lib/chat-view.js');
  const liveOnly = [...cv.matchAll(/this\._liveInitModel\(/g)].length === 1 && /if \(op\.op === 'create'\) \{[\s\S]{0,600}this\._liveInitModel\(op\.message\);/.test(cv);
  ok(liveOnly && /this\._statusBar\.hasServerModelFacts\(\)\) return;/.test(cv), '⑧ CENSUS: the live-init road is called from the LIVE op only (`_onOp` create), never from a history draw — and it is gated on a DECLARED fact');
  const seek = read('src/lib/chat-view-seek.js'), GAP = '    _renderGapMsg(msg) {';
  const plantGap = judge(count(callersIn('src/lib/chat-view-seek.js', seek.replace(GAP, GAP + '\n      this._statusBar.setModel(msg.model);'))));
  const LIVE = '  _liveInitModel(msg) {';
  const plantSecond = judge(count(callersIn('src/lib/chat-view.js', cv.replace(LIVE, LIVE + '\n    const bar = this._statusBar; bar.setModel(msg.model);'))));
  const plantBracket = judge(count(callersIn('src/lib/chat-view.js', cv.replace(LIVE, LIVE + "\n    this._statusBar['setServedModel'](msg.model);"))));
  ok(seek.includes(GAP) && plantGap.length === 1 && /_renderGapMsg \.setModel/.test(plantGap[0]) && plantSecond.length === 1 && /_liveInitModel \.setModel ×2/.test(plantSecond[0]) && plantBracket.length === 1 && /_liveInitModel \.setServedModel/.test(plantBracket[0]), '⑧ CONTROLS: a setter planted in the seek mixin\'s gap renderer, a SECOND setter through an alias inside an allowed method, and a bracket-access setter are each named', { plantGap, plantSecond, plantBracket });
  // no file in src/ reads the CLI's echo — in ANY spelling — but the parser module itself and the command card's own LABEL
  // (chat-renderers _renderNotificationMsg, which sets no bar fact). Its limit: it reads text, line by line (an echo assembled from
  // fragments at run time is beyond it).
  const ECHO_LINE = (l) => { const n = l.replace(/\\[sSbBwW][+*?]?/g, ' ').replace(/\[\\s\]/g, ' '); return /set[\s_-]*model[\s_-]*to\b/i.test(n) || /local-command-stdout/.test(n) || /parseSetModelEcho|model-echo\.js|stripSetModelBackticks/.test(n); };
  const echoSites = (rel, text) => { const lines = text.split('\n'), out = []; lines.forEach((l, i) => { if (!ECHO_LINE(l)) return; let enc = '?'; for (let j = i - 1; j >= 0; j--) { const h = HEAD.exec(lines[j]); if (h && !NOT_HEAD.test(lines[j])) { enc = h[1]; break; } } out.push({ at: `${rel}:${i + 1}`, file: rel, enc, line: l.trim() }); }); return out; };
  // (a line that LISTS the CLI's tag names — 'local-command-stdout', 'command-name', … — strips tags from text and reads no model:
  //  browser-stuck, channel-record)
  // (round 8) model-ask's ACK reads the CLI's own RESULT for the person's armed /model — CLI-authored, ordered after the frame's mark;
  // measured: «Set model to `X` …» = taken, «Model 'X' not found» = the CLI kept its model (no other field differs) — never a user record
  const ackAnswer = (x) => x.file === 'src/server/model-ask.js' && /^const \{ setModelTaken \} = require\('\.\.\/model-echo\.js'\);/.test(x.line);
  const echoOk = (x) => ackAnswer(x) || x.file === 'src/model-echo.js' || (x.file === 'src/lib/chat-renderers.js' && (x.enc === '_renderNotificationMsg' || /^import \{ stripSetModelBackticks \} from '\.\.\/model-echo\.js';/.test(x.line))) || /^\s*(\/\/|\*|\/\*)/.test(x.line) || (/'local-command-stdout',\s*'command-name'/.test(x.line) && !/set[\s_-]*model/i.test(x.line));
  const srcFiles = walk('src');
  const echoAll = srcFiles.flatMap((f) => echoSites(f, read(f))), echoStray = echoAll.filter((x) => !echoOk(x));
  const cr = read('src/lib/chat-renderers.js'), labelAt = cr.indexOf('  _renderNotificationMsg('), labelBody = labelAt > 0 ? cr.slice(labelAt, cr.indexOf('\n  }\n', labelAt)) : '';
  ok(srcFiles.length > 300 && echoAll.length >= 2 && echoStray.length === 0 && labelBody.length > 500 && !/_statusBar|setModel|applyStatus/.test(labelBody), '⑧ CENSUS: no code line in src/ reads the CLI\'s `/model` echo in any spelling — its text, a regex of its own, the parser module — but the parser itself, the command card\'s own label (which sets no bar fact), and model-ask\'s ACK reading the CLI\'s own RESULT for the armed /model (round 8: the one line that tells «taken» from «Model not found»); comment lines are prose', echoStray.map((x) => x.at + ' ' + x.line.slice(0, 80)));
  const plantedFile = echoSites('src/server/new-echo-reader.js', 'module.exports = (t) => /Set\\s+model\\s+to\\s+(\\S+)/.exec(t);').filter((x) => !echoOk(x));
  const plantedMethod = echoSites('src/lib/chat-renderers.js', cr.replace('  _renderNotificationMsg(', '  _askOf(t) {\n    return /set\\s+model\\s+to\\s+(\\S+)/i.exec(t);\n  }\n  _renderNotificationMsg(')).filter((x) => !echoOk(x));
  const plantedAsk = echoSites('src/server/model-ask.js', read('src/server/model-ask.js').replace('function noteServed(session, model,', 'function readEcho(t) {\n  return /Set model to (\\S+)/.exec(t);\n}\nfunction noteServed(session, model,')).filter((x) => !echoOk(x));
  ok(plantedAsk.length === 1 && plantedAsk[0].enc === 'readEcho', '⑧ CONTROL (round 8): the exception is ONE line — the same reader planted in another model-ask function is named', plantedAsk);
  ok(plantedFile.length === 1 && plantedMethod.length === 1 && plantedMethod[0].enc === '_askOf', '⑧ CONTROL: a NEW server file parsing the echo with its own regex, and the same parser planted in another chat-renderers method, are each named', { plantedFile, plantedMethod });
}

// ── ⑩ ROUND 9 (the r8 verdict, law 1 — MASTER IS THE ORACLE for every untyped scene; the full table: repro/oracle-table.mjs in the lane) ──
console.log('— ⑩ round 9: what a resume reads is saved AT THE PRESS as on master; the Lock\'s moment is master\'s; nothing asked ⇒ the CLI\'s own model is the yardstick');
{
  const sb9 = read('src/lib/chat-status-bar.js');
  const arrow9 = (head) => { const at = sb9.indexOf(head); if (at < 0) return null; let i = sb9.indexOf('=>', at) + 2; while (sb9[i] === ' ') i++; const open = sb9.indexOf('(', at + head.indexOf('(')); if (sb9[i] !== '{') return sb9.slice(open, sb9.indexOf(';\n', i)); let d = 0, j = i; for (; j < sb9.length; j++) { if (sb9[j] === '{') d++; else if (sb9[j] === '}') { d--; if (!d) break; } } return sb9.slice(open, j + 1); };
  const { createRequire: cr9 } = await import('node:module'); const MP9 = cr9(path.join(repo, 'src/model-providers.js'))('./model-providers.js');
  const pick9 = arrow9('const pick = (model) =>'), lock9 = arrow9('lockItem.onclick = (ev) =>');
  const bind9 = (src, bar) => new Function('showToast', 't', 'dropdown', 'namedModel', `return (${src});`).call(bar, () => { bar.__toasts = (bar.__toasts || 0) + 1; }, (x) => x, { remove() { } }, MP9.namedModel);
  const EV = { stopPropagation() { } };
  const f9 = (o = {}) => ({ ...firstStatus, modelFacts: true, askedModel: 'fable[1m]', askSeq: 0, modelLocked: false, lockedModel: null, servedModel: 'claude-fable-5-2', servedSeq: 1, askRefused: null, cliModel: 'claude-fable-5-2', askPicked: false, ...o });
  const mk9 = (status) => { const cfg = {}, sent = [], writes = []; const b = mkBar(ChatStatusBar, { onConfigChange: (o) => { writes.push(o); for (const [k, v] of Object.entries(o)) { if (v === undefined) delete cfg[k]; else cfg[k] = v; } } }); b._ws = { send: (f) => sent.push(f) }; b.applyStatus(status); return { b, cfg, sent, writes }; };
  ok(!!pick9 && !!lock9, '⑩ the bar\'s own pick and Lock closures are read (their text, bound to a real bar)');
  // (a) a menu pick is saved at the press, exactly as on master — its second life resumes on it with origin «chosen» (the oracle table)
  { const { b, cfg, sent } = mk9(f9()); bind9(pick9, b)('sonnet'); bind9(pick9, b)('opus 5');
    ok(cfg.model === 'sonnet' && !('lockModel' in cfg) && sent.length === 2, '⑩ (a) a pick is SAVED AT THE PRESS ({model}), as master saves it — a model the hub\'s door refuses («opus 5») is sent (the hub answers the refusal) and never saved', JSON.stringify(cfg)); }
  // a Lock pressed a moment ago (its answer not back yet) is a lock for the next pick's save — master's optimistic bar does the same
  { const { b, cfg } = mk9(f9()); bind9(lock9, b)(EV); bind9(pick9, b)('opus');
    ok(cfg.modelLock === true && cfg.model === 'opus' && cfg.lockModel === 'opus', '⑩ …a pick right after a Lock whose answer is not back saves the lock\'s new target with it ({model, lockModel}) — as master\'s optimistic bar', JSON.stringify(cfg)); }
  // the Lock saves the ask this bar holds (round 5's target); its frame names no model; a pick a moment ago is that ask
  { const { b, cfg, sent } = mk9(f9()); bind9(lock9, b)(EV);
    const { b: b2, cfg: c2 } = mk9(f9()); bind9(pick9, b2)('sonnet'); bind9(lock9, b2)(EV);
    ok(cfg.modelLock === true && cfg.lockModel === 'fable[1m]' && cfg.model === 'fable[1m]' && sent.length === 1 && !('model' in sent[0]) && !('lockModel' in sent[0]) && c2.lockModel === 'sonnet', '⑩ the Lock is SAVED AT THE PRESS ({modelLock, lockModel, model}) naming the ask this bar holds — fable[1m], an alias stays an alias (round 5, the ONE difference from master) — its frame names no model; a pick a moment before is that ask (sonnet)', JSON.stringify({ cfg, sent, c2 })); }
  // (b) an Unlock is saved at the press — a target-less lock an earlier version set included: no later resume is locked again
  { const { b, cfg } = mk9(f9({ modelLocked: true, lockedModel: null }));
    bind9(lock9, b)(EV);
    ok(cfg.modelLock === false && !('lockModel' in cfg), '⑩ (b) an Unlock is SAVED AT THE PRESS ({modelLock: false}) — of a target-less lock an earlier version set too, so no later resume is locked again (the r8 tree wrote nothing and every resume came back locked)', JSON.stringify(cfg)); }
  // WHEN a lock may be set is master's: not before a model was reported (master's words)
  { const { b, cfg, sent } = mk9({ modelFacts: true, askedModel: 'fable[1m]', askSeq: 0, modelLocked: false, lockedModel: null, servedModel: null, servedSeq: 0, cliModel: null, askPicked: false });
    bind9(lock9, b)(EV);
    ok(sent.length === 0 && Object.keys(cfg).length === 0 && b.__toasts === 1, '⑩ a Lock pressed before any model was reported is refused at the bar with master\'s words («Model not reported yet…») — nothing sent, nothing saved (master refuses in the same scenes)', JSON.stringify({ cfg, sent, toasts: b.__toasts })); }
  // ROUND 9 DEFECT FIX (the major): a conversation RESUMED and never picked — no ask, no init, nothing served; its attach status names
  // the transcript's model (claude-opus-5-5). The chip names it and the Lock locks it, as master does — 6abc439f3 toasted «Model not
  // reported yet…» (its target read the ask, the CLI's model and the served one, never the attach's)
  const rs9 = { modelFacts: true, askedModel: null, askSeq: 0, modelLocked: false, lockedModel: null, servedModel: null, servedSeq: 0, cliModel: null, askPicked: false, model: 'claude-opus-5-5' };
  { const { b, cfg, sent } = mk9(rs9); const shown = b._shownModel(); bind9(lock9, b)(EV);
    ok(shown === 'claude-opus-5-5' && !b.__toasts && sent.length === 1 && sent[0].lock === true && !('model' in sent[0]) && cfg.modelLock === true && cfg.lockModel === 'claude-opus-5-5' && cfg.model === 'claude-opus-5-5',
      '⑩ (defect fix) RESUMED, never picked — the chip names the transcript\'s model (the attach status\'s) and Lock LOCKS it: no toast, the frame names no model (the server locks its own ask — there, that same transcript model), saved {modelLock, lockModel: claude-opus-5-5, model} as master saves it', JSON.stringify({ shown, cfg, sent, toasts: b.__toasts })); }
  // …and a pick whose frame died with a restart, then Lock: the pick is saved at the press as on master; the re-attached bar locks what
  // the server will lock — the transcript's model, the dead pick never having reached it
  { const d = mk9(rs9); d.b._ws = { send() { } }; bind9(pick9, d.b)('opus');
    const { b, cfg, sent } = mk9(rs9); bind9(lock9, b)(EV);
    ok(d.cfg.model === 'opus' && !b.__toasts && sent.length === 1 && cfg.modelLock === true && cfg.lockModel === 'claude-opus-5-5',
      '⑩ (defect fix) a pick whose frame DIED with a restart (saved at the press, {model: opus}), then Lock on the re-attached bar: locked, never «Model not reported yet…» — on the transcript\'s model, the one the server locks (the dead pick never reached it)', JSON.stringify({ dead: d.cfg, cfg, toasts: b.__toasts })); }
  // the one scene where the chip names a model and the Lock still waits — master's moment, an exact row of the oracle table: a fresh spawn
  // before its first message (the chip names the spawn's ask under «Model not reported by the CLI yet»; master's chip reads «model: ?»)
  { const { b, sent } = mk9({ modelFacts: true, askedModel: 'fable[1m]', askSeq: 0, modelLocked: false, lockedModel: null, servedModel: null, servedSeq: 0, cliModel: null, askPicked: false });
    const c = chipOf(b); bind9(lock9, b)(EV);
    ok(sent.length === 0 && b.__toasts === 1 && /fable\[1m\]/.test(c.text) && /^Model not reported by the CLI yet/.test(c.title), '⑩ …a fresh spawn before its first message waits as on master: the chip names the spawn\'s ask under «Model not reported by the CLI yet», the Lock says master\'s words', JSON.stringify({ c, toasts: b.__toasts })); }
  // SMALL 4: after a pick and before its first reply, a bar that did NOT press (another device, a reload) reads the ask with this
  // product's own title — never «Model not reported by the CLI yet» while the CLI answered the pick
  { const { b } = mk9({ modelFacts: true, askedModel: 'sonnet', askSeq: 1, modelLocked: false, lockedModel: null, servedModel: null, servedSeq: 0, cliModel: null, askPicked: true });
    const c = chipOf(b);
    ok(/sonnet/.test(c.text) && /^The model this conversation asks for/.test(c.title), '⑩ (defect fix) after a pick, before its first reply, a bar that did not press names the ask under «The model this conversation asks for…» (6abc439f3: «Model not reported by the CLI yet — click to set»)', JSON.stringify(c)); }
  // an attach, a reload, a second client: nothing is written
  { const { writes } = mk9(f9({ modelLocked: true, lockedModel: 'fable[1m]', askSeq: 3, askPicked: true }));
    ok(writes.length === 0, '⑩ an attach / a reload / a second client writes NO model config (only a press does — and the server, for a /model the CLI acknowledged)', JSON.stringify(writes)); }
  // NOTHING ASKED ⇒ the CLI's own model is the yardstick (master's): never the attach's last SERVED model (a fallback's)
  { const { b } = mk9(f9({ askedModel: null, servedModel: 'claude-haiku-4-5', servedSeq: 2, cliModel: 'claude-opus-5-5' }));
    const atReload = b._modelMismatch();
    b.applyStatus(f9({ askedModel: null, servedModel: 'claude-opus-5-5', servedSeq: 3, cliModel: 'claude-opus-5-5' }));
    const nextTurn = b._modelMismatch();
    b.applyStatus(f9({ askedModel: null, servedModel: 'claude-haiku-4-5', servedSeq: 4, cliModel: 'claude-opus-5-5' }));
    ok(atReload && !nextTurn && b._modelMismatch(), '⑩ a conversation that asks for NOTHING is held to the model the CLI says it runs (the facts\' `cliModel`, each live init): after a reload a standing fallback is amber, the next turn on the CLI\'s own model is PLAIN (the r8 tree held it to the last served model and drew a false «Auto-fallback»), a real fallback is amber again', JSON.stringify({ atReload, nextTurn, now: b._modelMismatch() })); }
}

// ── ⑨ THE SEEDED WALK (lane fable-52-cli-321 r7, round 8 — made able to fail) ──────────────────────────────────────────────────────
// Random steps over the REAL modules: ws-handler's own `case 'set-model'` text, src/server/model-ask.js, session-brain's own
// `sbSeenFirst`, the engine's own `maybeRepinLockedModel` text, ws-create's own resume block, chat-view's own model-lock line, and two
// real ChatStatusBar instances plus a reload. Around them a stub CLI and a stub WRAPPER, separate (round 8):
//   the CLI is 2.1.321 AS MEASURED (probe/typed-model-v321.jsonl): a typed /model is answered by an assistant record of model
//   «<synthetic>» and a result with num_turns 0, for ANY id (an unknown one is taken — its turns then fail at the API, no record); a
//   frame that reaches a BUSY CLI waits until its running turn ends (the verifier's d7: a turn the CLI started on its own); a sticky
//   fallback serves another model until a set_model; Stop interrupts the running turn;
//   the wrapper holds a frame while it thinks a turn runs (queued_input / queue_changed), forwards one per result, MARKS what it
//   forwards (input_forwarded — or not: an older wrapper), drops what it holds on Stop (per-item queue_op_result remove, queue_dropped,
//   the emptied queue_changed), removes one on ✕; it can be REPLACED (the process ends: what it held and what the CLI had not
//   acknowledged die with it; the new one marks or not).
// TWO FEEDS carry every record at random lags and with duplicates; client frames and answers are late (one connection per client
// keeps its order) and an answer can be LOST; the hub restarts; every client can detach and the conversation is RESUMED (ws-create's
// resume block over the server's record, a new session, the clients re-attach). THE ORACLE is what took effect: a pick the hub's door
// took, a typed /model the CLI ACKNOWLEDGED (a frame Stop dropped or a dead wrapper lost never counts).
// At every REST point (everything delivered, the CLI idle, the person sending nothing): (i) both bars and a reload hold the server's
// facts; (ii) amber exactly when a served record numbered after the ask is not held by it; (iii) a resume would command the server's
// ask — the lock's target, else what the person last chose — and NOTHING when nothing was ever chosen; no bar wrote a model config;
// (iv) a standing lock has a way off; (v) at most one repin per TURN END (counted across calls); (vi) the server's ask is what the
// person last chose; (vii) NO ARM AT REST; (viii) the served fact is what the stub CLI last served; (ix) a locked conversation whose
// CLI drifted was repinned at the turn end. A failing seed prints its steps (F52_WALK_ONLY=<seed>); F52_WALK_SEEDS sets the count.
console.log('— ⑨ the seeded walk: Stop, ✕, a sticky fallback, d7, old / replaced wrappers, detach + resume, lost answers, restarts — at random lags');
{
  const requireW = (await import('node:module')).createRequire(import.meta.url);
  const MA = requireW(path.join(repo, 'src/server/model-ask.js')), MP = requireW(path.join(repo, 'src/model-providers.js'));
  const wsSrc = read('src/ws-handler.js'), cAt = wsSrc.indexOf("        case 'set-model': {"), cEnd = wsSrc.indexOf("        case 'set-effort': {", cAt);
  const runCase = new Function('data', 'activeSessions', 'adapterRegistry', 'readSessionMeta', 'writeSessionMeta', 'broadcastActiveSessions', 'broadcastToSession', 'ws', 'require', `switch (data.type) {\n${wsSrc.slice(cAt, cEnd)}\n}`);
  const wsReq = requireW('node:module').createRequire(path.join(repo, 'src/ws-handler.js'));
  const sbSrc = read('src/server/session-brain.js'), sAt = sbSrc.indexOf('function sbSeenFirst(session, rec) {'), sEnd = sbSrc.indexOf('\n}\n', sAt);
  const sbSeenFirst = new Function('SB_SEEN_MAX', sbSrc.slice(sAt, sEnd + 2) + '\nreturn sbSeenFirst;')(5000);
  const engSrc = read('src/server/usage-pool-engine.js'), fnOf = (h) => { const a = engSrc.indexOf(h), e = a < 0 ? -1 : engSrc.indexOf('\n}\n', a); return a < 0 || e < 0 ? '' : engSrc.slice(a, e + 2); };
  const engReq = requireW('node:module').createRequire(path.join(repo, 'src/server/usage-pool-engine.js'));
  // the bar's OWN pick and Lock closures (their text, bound to a bar) — they write the saved config a resume reads (round 9 law 2)
  const sbW = read('src/lib/chat-status-bar.js');
  const arrowOf = (head) => { const at = sbW.indexOf(head); if (at < 0) return null; let i = sbW.indexOf('=>', at) + 2; while (sbW[i] === ' ') i++; const open = sbW.indexOf('(', at + head.indexOf('(')); if (sbW[i] !== '{') return sbW.slice(open, sbW.indexOf(';\n', i)); let d = 0, j = i; for (; j < sbW.length; j++) { if (sbW[j] === '{') d++; else if (sbW[j] === '}') { d--; if (!d) break; } } return sbW.slice(open, j + 1); };
  const pickSrcW = arrowOf('const pick = (model) =>'), lockSrcW = arrowOf('lockItem.onclick = (ev) =>');
  const bindW = (src, bar) => new Function('showToast', 't', 'dropdown', 'namedModel', `return (${src});`).call(bar, () => { bar.__toasts = (bar.__toasts || 0) + 1; }, (x) => x, { remove() { } }, MP.namedModel);
  const cvSrc = read('src/lib/chat-view.js'), lockLine = /if \(op\.subtype === 'model-lock'\) \{\n\s*(this\._statusBar\.applyStatus\([^\n]*\);)\n/.exec(cvSrc);
  const applyLockOp = new Function('op', (lockLine ? lockLine[1] : '').replace('this._statusBar', 'this'));
  ok(!!pickSrcW && !!lockSrcW && /_onConfigChange/.test(pickSrcW) && /_onConfigChange/.test(lockSrcW) && !!lockLine && cAt > 0, '⑨ the walk runs the real code: the set-model case, the bar\'s own pick and Lock closures (the saved config), chat-view\'s model-lock line, sbSeenFirst, the repin');
  const RES = { opus: 'claude-opus-5-5', 'opus[1m]': 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', fable: 'claude-fable-5-2', 'fable[1m]': 'claude-fable-5-2' };
  const resolve = (m) => RES[m] || (/^claude-[a-z0-9-]+$/.test(m) ? m : null);
  const SID = 'sid-chips', CLIENTS = ['A', 'B'], CONV = 'conv-walk';
  const lockRow = (bar) => (typeof bar._lockRowOffered === 'function' ? bar._lockRowOffered() : !!bar._serverModelFacts);
  const factsKey = (f) => JSON.stringify([f.askedModel || null, f.askSeq, !!f.modelLocked, f.lockedModel || null, f.servedModel || null, f.servedSeq]);
  const barKey = (b) => JSON.stringify([b._askedModel || null, b._askSeq, !!b._modelLocked, b._lockedModel || null, b._servedModel || null, b._servedSeq]);
  function walk(seed, { STEPS = 24, backend = 'claude' } = {}) {
    let x = seed >>> 0; const rnd = () => { x = (x + 0x6D2B79F5) >>> 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pickOf = (a) => a[Math.floor(rnd() * a.length)];
    const log = [], metas = {};
    // THE SAVED CONFIG (round 9 law 2): user-state sessionConfigs[<backend>:<conversation>] — written by the bar at a press (as on master)
    // and by the server when the CLI acknowledges a typed /model (model-ask's ONE more writer); a resume reads it
    const cfg = {}, cfgLog = [], raced = new Set(); let pressNo = 0, cfgPressNo = 0;
    const cfgApply = (who, o) => { cfgLog.push([who, o]); if (who === 'A' || who === 'B') cfgPressNo = pressNo; for (const [k, v] of Object.entries(o || {})) { if (v === undefined) delete cfg[k]; else cfg[k] = v; } };
    MA.useConfigWriter((k, patch) => { if (k !== `${backend}:${CONV}`) return; { const inFlight = toHub.filter(([, d]) => d.type === 'set-model' && typeof d.model === 'string' && MP.namedModel(d.model)); if (inFlight.length) { oracle.stale = true; staleLocks.race++; for (const [, d] of inFlight) raced.add(d.reqId); } } cfgApply('server', patch); });   // the server's write while a pick saved at its press is still on its way (the named residual: two writers, one record)
    const io = { now: 1, readSessionMeta: (k) => metas[k] || {}, writeSessionMeta: (k, v) => { metas[k] = v; } };
    const timers = []; const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout, realImm = globalThis.setImmediate;
    globalThis.setTimeout = (fn) => { timers.push(fn); return timers.length; }; globalThis.clearTimeout = (id) => { if (id) timers[id - 1] = null; };
    globalThis.setImmediate = () => 0;   // the record's file write (the walk reads the record from memory)
    const cli = { model: 'claude-fable-5-2', busy: false, pending: [], sticky: null, rec: 0, msg: 0, rid: 0, lastServed: null, inRepin: false, repinsThisTurn: 0 };
    const wrap = { busy: false, held: [], marks: true };
    const feeds = { parse: [], device: [] }, toHub = [], inbox = { A: [], B: [] };
    let S = null, violation = null, sock = 0, lockAtTurnEnd = null, parseServedNo = 0, turnEndSawNo = 0;
    // THE ORACLE: the ask that took effect — a pick the hub's door took, a typed /model the CLI acknowledged, the model a resume
    // COMMANDED (a spawn's commanded model is the conversation's chosen ask), a lock an earlier version set; null = never chosen
    const oracle = { ask: null, kind: null, stale: false, resumeLock: null };
    const facts = () => MA.modelFacts(S);
    const attachStatus = () => ({ ...(MA.declares(S) ? MA.modelFacts(S) : {}), modelLocked: !!S._modelLocked, lockedModel: S._lockedModel || null });
    const mkSession = (o = {}) => ({ sockName: 'cw-walk-' + (++sock), _webuiId: SID, backend, mode: 'chat', backendSessionId: CONV, _spawnModel: 'fable[1m]', pty: { write: (l) => cliIn(l) }, ...o });
    const emit = (rec) => { for (const f of ['parse', 'device']) { feeds[f].push(rec); if ((rec.type === 'assistant' || rec.type === 'result') && rnd() < 0.2) feeds[f].push(rec); } };
    const broadcast = (s, id, frame) => { for (const c of CLIENTS) inbox[c].push(frame); };
    MA.useBroadcast((s) => MA.broadcastFacts(s, SID, broadcast));
    const repin = new Function('adapterRegistry', 'global', 'require', fnOf('function modelsMatch(a, b) {') + '\n' + fnOf('function maybeRepinLockedModel(session) {') + '\nreturn maybeRepinLockedModel;')(
      { get: () => ({ formatSetModel: (m) => JSON.stringify({ type: 'control_request', request_id: 'sm-' + (++cli.rid), request: { subtype: 'set_model', model: m } }) }) }, { __vsEvent: () => {} }, engReq);
    // ── the stub CLI (2.1.321 as measured) ──
    // a control request is answered AT ONCE, even mid-turn (a typed frame waits for the running turn — d7): the CLI's own order
    function cliIn(line) { let m = null; try { m = JSON.parse(line); } catch { return; } if (m.type === 'control_request' && m.request?.subtype === 'set_model') { cli.model = resolve(m.request.model) || m.request.model; cli.sticky = null; if (cli.inRepin) cli.repinsThisTurn++; emit({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: {} } }); } }
    const served = (model) => { cli.rec++; cli.lastServed = model; cli.lastServedNo = cli.rec; emit({ type: 'assistant', uuid: 'u' + cli.rec, message: { id: 'msg' + cli.rec, model, role: 'assistant' } }); };
    const knows = (m) => !!resolve(m);
    function cliReceive(f) { if (cli.busy) cli.pending.push(f); else cliRun(f); }
    function cliRun(f) {
      const t = /^\/model\s+(\S+)\s*$/.exec(f.text);
      if (t) {   // the local command: <synthetic> + a result with num_turns 0 — its ANSWER says whether the CLI took the id (measured)
        const initModel = cli.model;
        const refusedAtCheck = t[1] === 'nope-model';   // the API refused the id when the CLI checked it: «Model 'x' not found», the model KEPT
        const answer = refusedAtCheck ? `Model '${t[1]}' not found` : `Set model to \`${t[1]}\` for this session only`;
        if (!refusedAtCheck) { cli.model = resolve(t[1]) || t[1]; cli.sticky = null; cli.refusedTurns = 0; oracle.ask = t[1]; oracle.kind = 'typed'; }
        emit({ type: 'system', subtype: 'init', model: initModel });   // measured: the /model's own init names the OLD model
        emit({ type: 'assistant', uuid: 's' + (++cli.rec), message: { id: 'syn' + cli.rec, model: '<synthetic>', role: 'assistant' } });
        emit({ type: 'result', subtype: 'success', num_turns: 0, result: answer, uuid: 'r' + (++cli.rec) });
        return cliIdle();
      }
      cli.busy = true; emit({ type: 'system', subtype: 'init', model: cli.model }); if (knows(cli.model)) served(cli.sticky || cli.model);
    }
    function cliEnd(interrupted = false) {
      if (!cli.busy) return;
      const ok = knows(cli.model);
      if (ok && !interrupted) served(cli.sticky || cli.model);
      // a model the API refuses at use (taken at /model — measured «There's an issue with the selected model»): <synthetic> + an error
      // result carrying the API's 404
      if (!ok && !interrupted) { emit({ type: 'assistant', uuid: 's' + (++cli.rec), message: { id: 'syn' + cli.rec, model: '<synthetic>', role: 'assistant' } }); cli.refusedTurns = (cli.refusedTurns || 0) + 1; }
      emit({ type: 'result', subtype: interrupted ? 'error_during_execution' : 'success', is_error: !ok || interrupted, ...(!ok && !interrupted ? { api_error_status: 404 } : {}), num_turns: 1, uuid: 'r' + (++cli.rec) });
      cli.busy = false; cliIdle();
    }
    function cliIdle() { if (cli.pending.length) return cliRun(cli.pending.shift()); wrapAfterResult(); }   // the CLI's own queue first (d7), then the wrapper's
    // ── the stub wrapper ──
    function submit(text, msgId) { if (wrap.busy) { wrap.held.push({ text, msgId }); emit({ type: 'queued_input', msg_id: msgId }); emit({ type: 'queue_changed', items: wrap.held.map((h) => ({ msgId: h.msgId })) }); } else forward({ text, msgId }); }
    function forward(f) { if (wrap.marks && f.msgId) emit({ type: 'input_forwarded', msg_id: f.msgId }); wrap.busy = true; cliReceive(f); }
    function wrapAfterResult() { wrap.busy = false; turnEnded(); if (wrap.held.length) { const f = wrap.held.shift(); emit({ type: 'queue_changed', items: wrap.held.map((h) => ({ msgId: h.msgId })) }); forward(f); } }
    function turnEnded() { /* the hub's own count runs at the parse's result (below) */ }
    function stop() {
      const dropped = wrap.held.splice(0, wrap.held.length);
      for (const d of dropped) emit({ type: 'queue_op_result', op: 'remove', id: 'q-' + d.msgId, ok: true, msg_id: d.msgId, reason: 'stopped' });
      if (dropped.length) { emit({ type: 'queue_dropped', items: dropped.map((d) => ({ id: 'q-' + d.msgId, msgId: d.msgId, text: d.text })) }); emit({ type: 'queue_changed', items: [] }); }
      if (cli.busy) cliEnd(true); else wrap.busy = false;
      return `STOP (${dropped.length} held dropped)`;
    }
    function removeOne() { if (!wrap.held.length) return 'nothing held to ✕'; const i = Math.floor(rnd() * wrap.held.length), [d] = wrap.held.splice(i, 1); emit({ type: 'queue_op_result', op: 'remove', id: 'q-' + d.msgId, ok: true, msg_id: d.msgId }); emit({ type: 'queue_changed', items: wrap.held.map((h) => ({ msgId: h.msgId })) }); return `✕ on the held «${d.text}»`; }
    // ── the hub: both feeds as claude-stream-json and server.js run them ──
    const engineServed = (rec, feed) => { if (rec.message.model === '<synthetic>') return; S._servedModel = rec.message.model; if (MA.noteServed(S, rec.message.model, { recId: rec.message.id || rec.uuid, feed, ...io })) MA.broadcastFacts(S, SID, broadcast); };
    const TRACE = Number(process.env.F52_WALK_ONLY) === seed;
    const Q = (t) => t === 'queued_input' || t === 'queue_changed' || t === 'queue_op_result' || t === 'queue_dropped';
    function hubRecord(feed, rec) {
      if (!S) return;
      if (TRACE) console.log(`      [${feed}] ${rec.type}${rec.num_turns != null ? ' n=' + rec.num_turns : ''}${rec.msg_id ? ' ' + rec.msg_id : ''}${rec.items ? ' ' + JSON.stringify(rec.items.map((i) => i.msgId)) : ''}${rec.message ? ' ' + rec.message.model + ' ' + rec.message.id : ''} · arms=${JSON.stringify(MA.modelFacts && S._typedModel ? [S._typedModel, S._typedMsgId, S._typedReached, S._typedCount, S._typedHeldBy, S._typedPrev] : null)} marks=${S._wrapperMarks}`);
      if (feed === 'parse') {
        sbSeenFirst(S, rec);
        if (rec.type === 'input_forwarded') MA.noteForwarded(S, rec, 'parse', io);
        if (rec.type === 'system' && rec.subtype === 'init' && rec.model && MA.noteCliModel(S, rec.model, io)) MA.broadcastFacts(S, SID, broadcast);   // the parse notes the model the CLI says it runs (round 9)
        if (rec.type === 'control_response') MA.noteControlResponse(S, rec, 'parse', io);
        if (Q(rec.type)) MA.noteQueueRecord(S, rec, io, 'parse');
        if (rec.type === 'assistant') { engineServed(rec, 'parse'); if (rec.message.model !== '<synthetic>') parseServedNo = Math.max(parseServedNo, Number(String(rec.uuid).slice(1)) || 0); }
        if (rec.type === 'result') {
          turnEndSawNo = parseServedNo;
          MA.noteFeedResult(S, 'parse', io, rec);
          if (MA.noteTurnEnd(S, io)) MA.broadcastFacts(S, SID, broadcast);
          cli.inRepin = true; try { repin(S); } finally { cli.inRepin = false; }
          if (cli.repinsThisTurn > 1) violation = violation || `(v) ${cli.repinsThisTurn} repins at one turn end`;
          cli.repinsThisTurn = 0; lockAtTurnEnd = JSON.stringify([!!S._modelLocked, S._lockedModel || null]);
        }
      } else {
        if (rec.type === 'result') MA.noteFeedResult(S, 'device', io, rec);   // server.js: before the first-seen filter
        if (rec.type === 'input_forwarded') MA.noteForwarded(S, rec, 'device', io);
        if (rec.type === 'control_response') MA.noteControlResponse(S, rec, 'device', io);
        if (!sbSeenFirst(S, rec)) return;
        if (Q(rec.type)) MA.noteQueueRecord(S, rec, io, 'device');
        if (rec.type === 'assistant') engineServed(rec, 'device');
      }
    }
    function hubFrame(from, data) {
      if (!S) return;
      if (TRACE) console.log(`      HUB takes ${from}'s ${JSON.stringify(data)} — before: locked=${!!S._modelLocked}/${S._lockedModel}`);
      runCase(data, new Map([[SID, S]]), { get: () => ({ formatSetModel: (m) => JSON.stringify({ type: 'control_request', request_id: 'sm-' + (++cli.rid), request: { subtype: 'set_model', model: m } }) }) }, io.readSessionMeta, io.writeSessionMeta, () => {}, broadcast, { send: (s) => inbox[from].push(JSON.parse(s)) }, wsReq);
      const door = typeof data.model === 'string' ? MP.namedModel(data.model) : null;
      if (door) { oracle.ask = door; oracle.kind = 'pick'; oracle.stale = raced.has(data.reqId); raced.delete(data.reqId); }   // a pick the server's write overtook stays the named residual
      // …and so does a press the hub takes AFTER a later press already saved (two clients' presses taken in another order — master's last-write-wins)
      if ((door || 'lock' in data) && typeof data.__pressNo === 'number' && data.__pressNo < cfgPressNo) { oracle.stale = true; staleLocks.order++; }
      if (door || 'lock' in data) oracle.resumeLock = null;
      // …and a PICK saved on a view that did not know the lock the hub holds now (another client's Lock not yet told — master's two-client gap)
      if (door && typeof data.__seenLocked === 'boolean' && data.__seenLocked !== !!S._modelLocked) { oracle.stale = true; staleLocks.pick++; }
      // THE NAMED RESIDUAL (round 9, law 2 kept as master's): a Lock pressed by a bar whose view of the ask was OLDER than the server's
      // when the hub takes it saved the ask the bar SAW — the server locks its own (round 5). Counted, and (iii) does not judge it.
      if (data.lock === true && typeof data.__seenSeq === 'number' && data.__seenSeq < (Number(S._askSeq) || 0)) { oracle.stale = true; staleLocks.n++; }
    }
    function typed(model) {
      const msgId = 'm' + (++cli.msg);
      const inTurn = wrap.busy;
      submit('/model ' + model, msgId);
      MA.noteTypedModel(S, '/model ' + model, { msgId, inTurn, ...io });
    }
    // ── the clients ──
    const cfgW = { A: [], B: [] }, bars = {};
    const mkClient = (c) => { const b = mkBar(ChatStatusBar, { backend, onConfigChange: (o) => { cfgW[c].push(o); cfgApply(c, o); } }); b._ws = { send: (f) => toHub.push([c, JSON.parse(JSON.stringify(f))]) }; const n0 = cfgLog.length; b.applyStatus(attachStatus()); if (cfgLog.length !== n0) violation = violation || `(iii) ${c}'s ATTACH wrote a model config ${JSON.stringify(cfgLog.slice(n0))}`; bars[c] = b; };
    const toBar = (c, f) => {
      const b = bars[c]; if (!b) return;
      if (TRACE) console.log(`      ${c} gets ${f.subtype || f.type} ${JSON.stringify(f.data || {}).slice(0, 160)}`);
      if (f.type === 'error' && f.code === 'model-refused') b.answerModel({ ok: false, answer: f.reqId ?? null });
      else if (f.op === 'meta' && f.subtype === 'model-facts') b.applyStatus({ ...(f.data || {}) });
      else if (f.op === 'meta' && f.subtype === 'model-answer') b.answerModel({ ...(f.data || {}) });
      else if (f.op === 'meta' && f.subtype === 'model-lock') applyLockOp.call(b, f);
    };
    const restart = () => {   // the hub restarts: the session comes back from its meta (boot-restore's fields)
      const m = metas[S.sockName] || {};
      S = { ...mkSession({ sockName: S.sockName }), _pickedModel: m.pickedModel || null, _pickedModelAt: m.pickedModelAt || 0, _modelLocked: !!m.modelLocked, _lockedModel: m.lockedModel || null, _modelOrigin: m.modelOrigin || S._modelOrigin || null, _spawnModel: 'spawnModel' in m ? m.spawnModel : S._spawnModel, ...MA.hydratedFacts(m) };
      if (toHub.some(([, d]) => d.type === 'set-model' && (d.lock === true || (typeof d.model === 'string' && MP.namedModel(d.model))))) { oracle.stale = true; staleLocks.lost++; }   // a press saved and never done: its frame died with the hub (the named residual) 
      toHub.length = 0; for (const c of CLIENTS) { inbox[c].length = 0; if (bars[c]) bars[c].applyStatus(attachStatus()); }
    };
    const processGone = () => {
      // the dead process's records are delivered before its successor writes one (a respawn takes seconds; the walk does not model a
      // device-feed tail that outlives the successor's first record — a stated residual)
      for (const f of ['parse', 'device']) while (feeds[f].length) hubRecord(f, feeds[f].shift());
      MA.noteProcessGone(S, io); wrap.held.length = 0; cli.pending.length = 0; cli.busy = false; wrap.busy = false;
    };
    // a RESPAWN (the wrapper replaced) restarts the process from the SERVER's state — its lock's target, else its ask; a resume reads the saved config (resume() below)
    const cliRestart = (a = null) => { const f0 = MA.modelFacts(S), m = a ? a.model : ((f0.modelLocked && f0.lockedModel) || f0.askedModel); if (m) cli.model = resolve(m) || m; cli.sticky = null; cli.refusedTurns = 0; };   // a new process has failed nothing yet   // no --model ⇒ it continues
    // what a resume would command: the client's create frame from the SAVED CONFIG (session-lifecycle: the model through the door, the
    // lock and its target as saved — ws-create's own ladder over it is the oracle table's, repro/oracle-table.mjs)
    const resumeArgv = () => ({ model: (cfg.model && MP.namedModel(cfg.model)) || null, lock: !!cfg.modelLock, lockModel: cfg.modelLock ? ((cfg.lockModel && MP.namedModel(cfg.lockModel)) || (cfg.model && MP.namedModel(cfg.model)) || null) : null });
    function resume() {
      processGone();
      for (const c of CLIENTS) { bars[c]?.dispose(); bars[c] = null; inbox[c].length = 0; }
      if (toHub.some(([, d]) => d.type === 'set-model' && (d.lock === true || (typeof d.model === 'string' && MP.namedModel(d.model))))) { oracle.stale = true; staleLocks.lost++; }   // a press saved and never done: its frame died with the hub (the named residual) 
      toHub.length = 0;
      const a = resumeArgv();
      S = mkSession({ _spawnModel: a.model || null, _modelOrigin: a.model ? 'chosen' : null, _modelLocked: a.lock, _lockedModel: a.lock ? a.lockModel : null });
      metas[S.sockName] = { spawnModel: S._spawnModel, modelOrigin: S._modelOrigin, modelLocked: S._modelLocked, lockedModel: S._lockedModel };   // ws-create's spawn meta
      if (a.model) { oracle.ask = a.model; oracle.kind = 'resume'; }   // a resume asks what the saved config says (law 2)…
      oracle.resumeLock = a.lock ? (a.lockModel || a.model) : null;   // …and re-arms the lock it saved (until the next press)
      cliRestart(a); lockAtTurnEnd = null;   // a resumed conversation is a NEW process: a drift an earlier process's turn end saw is not this one's (ix)
      wrap.marks = rnd() < 0.8;
      for (const c of CLIENTS) mkClient(c);
      return `every client detached; RESUMED with ${a.model ? '--model ' + a.model : 'no --model'}${a.lock ? ' locked ' + a.lockModel : ''}`;
    }
    // ── a step: one random act ──
    const STEP = [
      ['pick', () => { const c = pickOf(CLIENTS), m = pickOf(['opus', 'sonnet', 'fable[1m]', 'claude-opus-5-5', 'opus 5']); const n0 = toHub.length; pressNo++; bindW(pickSrcW, bars[c])(m); if (toHub.length > n0) toHub[toHub.length - 1][1].__pressNo = pressNo; if (toHub.length > n0) toHub[toHub.length - 1][1].__seenLocked = !!(bars[c]._pending && bars[c]._pending.kind === 'lock') || (!(bars[c]._pending && bars[c]._pending.kind === 'unlock') && !!bars[c]._modelLocked); return `${c} picks ${m}`; }],
      ['lock', () => { const c = pickOf(CLIENTS), b = bars[c]; if (!lockRow(b)) return `${c} has no lock row`; const now = !b._modelLocked, t0 = b.__toasts || 0, n0 = toHub.length; pressNo++; bindW(lockSrcW, b)({ stopPropagation() { } }); if (toHub.length > n0) { toHub[toHub.length - 1][1].__seenSeq = b._askSeq; toHub[toHub.length - 1][1].__pressNo = pressNo; } return (b.__toasts || 0) > t0 ? `${c} lock: nothing reported (refused at the bar)` : `${c} ${now ? 'locks' : 'unlocks'}`; }],
      ['typed', () => { const m = pickOf(['opus', 'sonnet', 'fable[1m]', 'nope-model', 'gate-model']); const busy = wrap.busy; typed(m); return `types /model ${m}${busy ? ' (the wrapper holds it)' : ''}`; }],
      ['turn', () => { if (cli.busy) { if (knows(cli.model)) served(cli.sticky || cli.model); return 'the turn writes another record'; } submit('a message', 'm' + (++cli.msg)); return 'a turn starts'; }],
      ['endturn', () => { cliEnd(); return 'the turn ends'; }],
      ['selfturn', () => { if (cli.busy) return 'the CLI is busy'; cli.busy = true; emit({ type: 'system', subtype: 'init', model: cli.model }); if (knows(cli.model)) served(cli.sticky || cli.model); return 'the CLI starts a turn ON ITS OWN (the wrapper has not read it: d7)'; }],
      ['fallback', () => { if (!cli.busy || !knows(cli.model)) return 'no turn to fall back in (or its model is refused: nothing is served)'; served('claude-opus-5'); return 'a REAL fallback record (claude-opus-5)'; }],
      ['sticky', () => { cli.sticky = 'claude-opus-5'; cli.driftNo = cli.rec; return 'a STICKY fallback: the CLI serves claude-opus-5 until a set_model'; }],
      ['stop', () => stop()],
      ['remove', () => removeOne()],
      ['respawn', () => { processGone(); cliRestart(); const was = wrap.marks; wrap.marks = rnd() < 0.6; return `the WRAPPER is REPLACED (${was ? 'marking' : 'old'} → ${wrap.marks ? 'marking' : 'old'}): what it held and what the CLI had not acknowledged are gone`; }],
      ['resume', () => (rnd() < 0.4 ? resume() : 'no resume')],
      ['feed', () => { const n = 1 + Math.floor(rnd() * 6), f = pickOf(['parse', 'device']); for (let i = 0; i < n && feeds[f].length; i++) hubRecord(f, feeds[f].shift()); return `the ${f} feed hands over ${n}`; }],
      ['frame', () => { const cs = CLIENTS.filter((c) => toHub.some(([y]) => y === c)); if (!cs.length) return 'no frame'; const c = pickOf(cs), i = toHub.findIndex(([y]) => y === c), [, d] = toHub.splice(i, 1)[0]; hubFrame(c, d); return `the hub takes ${c}'s ${JSON.stringify(d)}`; }],
      // a LOST answer: the first answer anywhere in the client's inbox (a reconnect) — never only the head (round 8: the facts op sat ahead of it)
      ['answer', () => { const c = pickOf(CLIENTS); if (!inbox[c].length) return 'no answer'; const ai = inbox[c].findIndex((f) => f.subtype === 'model-answer'); if (ai >= 0 && rnd() < 0.3) { inbox[c].splice(ai, 1); return `${c}'s answer is LOST`; } const f = inbox[c].shift(); toBar(c, f); return `${c} gets ${f.subtype || f.code}`; }],
      ['restart', () => { if (rnd() < 0.5) return 'no restart'; restart(); return 'the HUB RESTARTS'; }],
    ];
    const rest = () => {
      for (let guard = 0; guard < 600; guard++) {
        if (toHub.length) { const [c, d] = toHub.shift(); hubFrame(c, d); continue; }
        if (cli.busy) { cliEnd(); continue; }
        const live = ['parse', 'device'].filter((f) => feeds[f].length);
        if (live.length) { const f = pickOf(live); hubRecord(f, feeds[f].shift()); continue; }
        const ib = CLIENTS.filter((c) => inbox[c].length);
        if (ib.length) { const c = pickOf(ib); toBar(c, inbox[c].shift()); continue; }
        const t = timers.findIndex(Boolean); if (t >= 0) { const fn = timers[t]; timers[t] = null; fn(); continue; }
        break;   // the person sends nothing at rest: an arm still standing here is an arm that never ended
      }
    };
    try {
      // an opencode conversation may carry a lock an EARLIER version set (the round-8 MUST 3 scene: its Unlock must reach every bar)
      S = mkSession(backend !== 'claude' && rnd() < 0.5 ? { _modelLocked: true, _lockedModel: 'opencode/old-model', _spawnModel: 'opencode/old-model', _modelOrigin: 'chosen' } : {});
      metas[S.sockName] = { spawnModel: S._spawnModel, modelOrigin: S._modelOrigin || null, modelLocked: !!S._modelLocked, lockedModel: S._lockedModel || null }; if (S._modelLocked) { oracle.ask = S._lockedModel; cli.model = S._lockedModel; cfgApply('earlier', { modelLock: true, lockModel: S._lockedModel, model: S._lockedModel }); cfgLog.length = 0; }
      for (const c of CLIENTS) mkClient(c);
      submit('hello', 'm0'); rest();
      for (let i = 0; i < STEPS && !violation; i++) {
        const [name, fn] = pickOf(STEP); if (backend !== 'claude' && (name === 'typed' || name === 'selfturn')) { i--; continue; } log.push(`${i}: ${fn()}`);
        if ((i + 1) % 6 === 0 || i === STEPS - 1) {
          rest();
          const f = facts(), reload = mkBar(ChatStatusBar, { backend, onConfigChange: (o) => cfgApply('reload', o) }); reload.applyStatus(attachStatus());
          const last = oracle.ask;
          // (iii) WHAT A RESUME READS (round 9 law 2): the saved config — a typed /model the CLI took is in it (the server's ONE more
          // writer, whether or not a client is attached), and nothing but a press or that writer ever wrote it (an attach, a reload, a
          // second client, an answer: nothing)
          const a = resumeArgv();
          if (oracle.kind === 'pick' && !oracle.stale && last && (a.model || null) !== last && !(S._modelLocked && a.lock)) violation = violation || `(iii) the person last picked ${last}, the saved config resumes ${JSON.stringify(a)} (${JSON.stringify(cfg)})`;
          if (oracle.kind === 'typed' && !oracle.stale && last && (a.model || null) !== last && !(S._modelLocked && a.lock && a.lockModel === S._lockedModel && MP.modelHeld(S._lockedModel, last))) violation = violation || `(iii) the CLI took /model ${last}, the saved config resumes ${JSON.stringify(a)} (${JSON.stringify(cfg)})`;
          if (reload && cfgLog.length && cfgLog.some(([who]) => who !== 'A' && who !== 'B' && who !== 'server')) violation = violation || `(iii) a config write from ${JSON.stringify(cfgLog.find(([w]) => !['A', 'B', 'server'].includes(w)))}`;
          for (const [who, b] of [['A', bars.A], ['B', bars.B], ['reload', reload]]) {
            if (!b._modelLocked !== !S._modelLocked || (b._lockedModel || null) !== (S._modelLocked ? S._lockedModel || null : b._lockedModel || null)) violation = violation || `(i) ${who} lock ${!!b._modelLocked}/${b._lockedModel}, the server ${!!S._modelLocked}/${S._lockedModel}`;
            if (S._modelLocked && !lockRow(b)) violation = violation || `(iv) ${who}: a standing lock with no way off`;
            if (backend !== 'claude') continue;
            if (barKey(b) !== factsKey(f)) violation = violation || `(i) ${who} holds ${barKey(b)}, the server ${factsKey(f)}`;
            const want = (f.modelLocked && f.lockedModel) || f.askedModel || f.cliModel;   // nothing asked: the model the CLI says it runs (round 9)
            const amber = (!!want && f.askRefused === want) || (!!want && f.servedSeq > f.askSeq && !MP.modelHeld(want, f.servedModel));   // nothing asked (never chosen, resumed bare) ⇒ nothing is a fallback; a refused ask is named
            if (b._modelMismatch() !== amber) violation = violation || `(ii) ${who} amber=${b._modelMismatch()}, expected ${amber}`;
          }
          reload.dispose();
          if (backend === 'claude') {
            if (last && f.askedModel !== last && !(f.modelLocked && f.lockedModel === last) && !(f.modelLocked && oracle.resumeLock && f.lockedModel === oracle.resumeLock)) violation = violation || `(vi) the server asks ${f.askedModel}, the person last chose ${last}`;
            if (S._typedModel) violation = violation || `(vii) an ARM stands at rest: ${JSON.stringify([S._typedModel, S._typedMsgId, S._typedPrev])}`;
            // (x) THE API REFUSED THE ASK: the CLI took it, its turns failed with the API's 404 — the server says so (the chip names it)
            if (!knows(cli.model) && cli.refusedTurns > 0 && f.askedModel === cli.model && f.askRefused !== cli.model) violation = violation || `(x) the CLI runs ${cli.model}, refused by the API ${cli.refusedTurns}×, the server does not name it (askRefused ${f.askRefused})`;
            if (cli.lastServed && f.servedModel && f.servedModel !== cli.lastServed) violation = violation || `(viii) the served fact ${f.servedModel}, the CLI last served ${cli.lastServed}`;
            // (ix) a drift a turn end SAW (its served record before the result, the lock unchanged since) was repinned: the CLI is back on the target
            const drift = cli.sticky || cli.model;
            if (S._modelLocked && S._lockedModel && lockAtTurnEnd === JSON.stringify([true, S._lockedModel]) && knows(cli.model) && !MP.modelHeld(S._lockedModel, drift) && cli.lastServed === drift && cli.lastServedNo > (cli.driftNo || 0) && turnEndSawNo >= cli.lastServedNo) violation = violation || `(ix) locked on ${S._lockedModel}: a turn end saw ${drift} served (record ${cli.lastServedNo}) and the CLI was never repinned`;
          }
          log.push(`   REST: ${factsKey(f)} locked=${!!S._modelLocked}/${S._lockedModel} cli=${cli.sticky || cli.model}`);
        }
      }
    } catch (e) { violation = violation || 'threw: ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join(' | '); }
    finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; globalThis.setImmediate = realImm; MA.useBroadcast(null); MA.useConfigWriter(null); for (const c of CLIENTS) bars[c]?.dispose(); }
    return { seed, violation, log };
  }
  const staleLocks = { n: 0, lost: 0, pick: 0, race: 0, order: 0 };   // the named residual (a press saved at the press, as master saves it): a Lock pressed on a stale view of the ask; a press whose frame died with the hub
  const SEEDS = Number(process.env.F52_WALK_SEEDS) || 300, ONLY = Number(process.env.F52_WALK_ONLY) || 0;
  const summary = {};
  for (const backend of ['claude', 'opencode']) {
    const fails = [];
    const n = backend === 'claude' ? SEEDS : Math.max(50, Math.floor(SEEDS / 4));
    for (let seed = ONLY || 1; seed <= (ONLY || n); seed++) { const r = walk(seed, { backend }); if (r.violation) fails.push(r); }
    const byInv = {}; for (const r of fails) { const k = (r.violation.match(/^\((\w+)\)|^threw/) || ['?'])[0]; byInv[k] = (byInv[k] || 0) + 1; }
    summary[backend] = { seeds: ONLY ? 1 : n, fails: fails.length, byInv };
    if (fails.length) console.error(`    ${backend}: first failing seed ${fails[0].seed}: ${fails[0].violation}\n      ${fails[0].log.slice(-14).join('\n      ')}`);
    ok(fails.length === 0, `⑨ THE SEEDED WALK (${backend}): ${summary[backend].seeds} seeds × 24 steps over the real modules — every REST point holds (i) the bars' facts and lock = the server's, (ii) amber exactly when a newer served record is not held, (iii) the saved config a resume reads holds a typed /model the CLI took (the server's one writer) and nothing but a press or that writer wrote it (the named residual of a save at the press, as on master: a Lock pressed on a stale view of the ask ${staleLocks.n}×, a pick saved on a view without the lock the hub held ${staleLocks.pick}×, a press whose frame died with the hub ${staleLocks.lost}×, the server's write for a /model the CLI took while a pick was still on its way ${staleLocks.race}×, presses taken in another order than pressed ${staleLocks.order}×), (iv) a lock has a way off, (v) ≤ 1 repin per turn end, (vi) the ask = what took effect last, (vii) no arm at rest, (viii) the served fact = what the CLI served, (ix) a drifted lock was repinned${fails.length ? ' — FAILING by invariant: ' + JSON.stringify(byInv) : ''}`);
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

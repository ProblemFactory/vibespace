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
  // (round 13: what utils.js showToast touches — a refusal is said by the real toast, counted on its stack)
  set textContent(v) { this._html = String(v); }
  append(...ns) { for (const n of ns) this.appendChild(n); }
  get firstChild() { return this.childNodes[0] || null; }
  get classList() { const el = this, cls = () => (el.getAttribute('class') || '').split(/\s+/).filter(Boolean); return { add: (c) => el.setAttribute('class', [...new Set([...cls(), c])].join(' ')), remove: (c) => el.setAttribute('class', cls().filter((x) => x !== c).join(' ')), contains: (c) => cls().includes(c) }; }
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
  // the slice acceptance's minor 1 asked that the title never credit the CLI with a lock target shown in its place; rounds 8–12 gave a
  // bar holding the server's facts its own title. ROUND 13 (ruling 2): titles are MASTER's on every bar — the same scene told by the
  // server's facts reads master's title over the fields they write, the label the lock target until a model is served after the ask
  const reF = mkBar(ChatStatusBar);
  reF.applyStatus({ ...firstStatus, model: 'claude-fable-5-1', modelFacts: true, want: 'fable[1m]', askSeq: 1, modelLocked: true, lockedModel: 'fable[1m]', served: null, servedSeq: 0 });
  const rf0 = chipOf(reF);
  reF.applyStatus({ modelFacts: true, want: 'fable[1m]', askSeq: 1, served: 'claude-fable-5-2', servedModel: 'claude-fable-5-2', servedSeq: 2 }); reF.setServedModel('claude-fable-5-2');   // (the facts and master's op for the same record)
  const rf2 = chipOf(reF); reF.dispose();
  ok(plain(rf0, 'fable[1m]') && plain(rf2, 'claude-fable-5-2') && rf0.title === re0.title && rf2.title === re2.title,
    `⑦ …and under the server's facts the same scene is MASTER's chip — the label the lock target «🔒 ${rf0.text}», then the served record «🔒 ${rf2.text}», each with master's title («${rf0.title.split(' · ')[0]}»)`, JSON.stringify({ rf0, rf2, re0: re0.title }));
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
  // lane hub-loop-stalls commit 2 round 2 (law B): the lock is a person's act — written as a durable act, its frame goes
  // AFTER the write, so each change is read a turn later (the stub writes at once)
  const twoClients = async (text) => {
    const run = new Function('data', 'activeSessions', 'adapterRegistry', 'readSessionMeta', 'writeSessionMeta', 'broadcastActiveSessions', 'broadcastToSession', 'require', `switch (data.type) {\n${text}\n}`);
    const SID = 'sid-two', sess = { pty: { write() {} }, mode: 'chat', backend: 'claude', _modelLocked: true, _lockedModel: 'fable[1m]', sockName: null };
    const A = lockedOn('fable[1m]'), B = lockedOn('fable[1m]'), bars = [A, B];
    const say = async (d) => { run({ type: 'set-model', sessionId: SID, ...d }, new Map([[SID, sess]]), { get: () => ({ formatSetModel: (m) => JSON.stringify({ set_model: m }) }) }, () => ({}), () => {}, () => {},
      (_s, _id, frame) => { if (frame && frame.op === 'meta' && frame.subtype === 'model-lock') bars.forEach((x) => applyLock.call(x, frame)); }, createRequire(path.join(repo, 'src/ws-handler.js'))); await new Promise((r) => setImmediate(r)); };
    const draw = (m) => bars.forEach((x) => x.setModel(m)), serve = (m) => bars.forEach((x) => x.setServedModel(m));
    const agree = () => bars.every((x) => !!x._modelLocked === !!sess._modelLocked && (x._lockedModel || null) === (sess._lockedModel || null));
    const out = {};
    serve('claude-fable-5-2');
    // A picks opus under the lock (the bar's own pick: the frame, the optimistic re-target) ⇒ the server re-targets the lock
    await say({ model: 'opus' });   // the press: a frame, no fact of its own (r6 — the bar shows a pending mark until the server answers)
    draw('claude-opus-5-5'); draw('claude-opus-5-5'); serve('claude-opus-5-5');   // the set_model echo, the next turn's init and served model
    out.pick = { agree: agree(), A: chipOf(A), B: chipOf(B) };
    draw('claude-opus-5-5'); serve('claude-fable-5-2');                              // a REAL fallback under the new lock
    out.fallback = { agree: agree(), A: chipOf(A), B: chipOf(B) };
    await say({ lock: false });                                                             // A unlocks
    out.unlock = { agree: agree(), A: chipOf(A), B: chipOf(B) };
    draw('claude-opus-5-5'); serve('claude-opus-5-5');
    await say({ lock: true });                                                                // A locks again (the server locks its ask)
    out.relock = { agree: agree(), A: chipOf(A), B: chipOf(B) };
    draw('claude-opus-5-5'); serve('claude-fable-5-2');                              // a REAL fallback under the new lock
    out.fallback2 = { agree: agree(), A: chipOf(A), B: chipOf(B) };
    bars.forEach((x) => x.dispose());
    return out;
  };
  const tc = await twoClients(caseText);
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
      const meta = {}, told = [], order = [], pty = { cb: null, onData(cb) { this.cb = cb; }, onExit() { } };
      const A = mkBar(ChatStatusBar), B = mkBar(ChatStatusBar), bars = [A, B];
      bars.forEach((x) => x.applyStatus({ ...firstStatus, model: 'claude-fable-5-2', modelLocked: true, ...(withFacts ? MAL.modelFacts(sess) : {}) }));   // the attach status: locked, no target (round 9: and the server's facts — every claude attach carries them)
      CSJ.create({ activeSessions: new Map([[SID, sess]]), engine, CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result']), _seenStreamTypes: new Set(), USAGE_SCANNER_PATH: '/nonexistent', checkClaudeGoalStatus() { }, noteModelSeen() { }, sbSeenFirst: () => true, hosts: null, usageHistory: { _cost: () => 0, ingestRemoteEvents() { } }, pagesRef: null })
        .attach(sess, SID, pty, { feedLive(_se, m) { order.push('record:' + m.type + (m.subtype ? '/' + m.subtype : '')); }, broadcastActiveSessions() { }, readSessionMeta: (k) => meta[k] || null, writeSessionMeta: (k, v) => { meta[k] = v; }, updateSessionTodos() { }, applyTaskToolUpdate() { }, emitTaskListTodos() { },
          broadcastToSession: (_s, _id, frame) => { if (frame && frame.op === 'meta' && frame.subtype === 'model-facts') order.push('facts'); if (frame && frame.op === 'meta' && frame.subtype === 'model-lock') { told.push(frame.data); bars.forEach((x) => applyLock.call(x, frame)); } if (withFacts && frame && frame.op === 'meta' && frame.subtype === 'model-facts') bars.forEach((x) => applyFacts.call(x, frame)); } });   // without facts = a .390 client: it reads model-lock, not model-facts
      const line = (o) => pty.cb(JSON.stringify(o) + '\n');
      line({ type: 'system', subtype: 'init', model: 'claude-fable-5-2', session_id: 'cid-latch', tools: [] });
      line({ type: 'assistant', message: { id: 'msg_latch1', role: 'assistant', model: 'claude-fable-5-2', content: [{ type: 'text', text: 'hi' }] } });
      const out = { server: sess._lockedModel, meta: meta['sock-latch'] && meta['sock-latch'].lockedModel, told, held: bars.map((x) => x._lockedModel || null), cli: sess._cliModel || null, order };
      bars.forEach((x) => x.setServedModel('claude-opus-5-5'));   // a REAL fallback after the latch
      out.A = chipOf(A); out.B = chipOf(B);
      bars.forEach((x) => x.dispose());
      return out;
    };
    const yes = latchRun(true), no = latchRun(false), yesF = latchRun(true, true);
    // ROUND 13: the facts are the LATER word — a main-thread init's facts are told AFTER its record reaches the clients (the client's
    // live-init road, master's, writes the CLI's id from the record; the facts then write the want onto the same field)
    // (a run with NO latch — the latch tells its own facts on the next record, which would hide a missing init frame)
    { const ord = latchRun(false, true).order, ri = ord.indexOf('record:system/init');
      ok(ri === 0 && ord[ri + 1] === 'facts', `⑦ (round 13) the REAL consumer tells an init's facts right AFTER its record (${ord.slice(0, 4).join(' → ')}) — the server's facts correct the field master's live-init road just wrote, never the other way round`, ord); }
    ok(yes.server === 'claude-fable-5-2' && yes.meta === 'claude-fable-5-2' && yes.told.length === 1 && yes.told[0].modelLocked === true && yes.told[0].lockedModel === 'claude-fable-5-2' && yes.held.every((m) => m === 'claude-fable-5-2') && yes.A.amber && yes.B.amber && /instead of claude-fable-5-2/.test(yes.B.title),
      `⑦ the parse's latch, driven: the REAL consumer latches a target-less lock on claude-fable-5-2, writes it to the meta and tells it ONCE — both bars hold the server's target, and a fallback after it is amber on both with B's tooltip naming the latched target («🔒${yes.B.text}»)`, JSON.stringify(yes));
    ok(no.server === null && !no.meta && no.told.length === 0 && no.held.every((m) => m === null), "⑦ …CONTROL: the engine's gate says the record does not define the model ⇒ nothing latched, nothing written, nothing told (the frame follows the writer)", JSON.stringify(no));
    ok(yesF.server === 'claude-fable-5-2' && yesF.cli === 'claude-fable-5-2' && yesF.held.every((m) => m === 'claude-fable-5-2') && /retries claude-fable-5-2/.test(yesF.B.title) && !/retries \?/.test(yesF.B.title), `⑦ …and on bars that HOLD THE SERVER'S FACTS (every claude attach — the r8 verdict's (c)): the latch reaches them in the facts' own frame, both hold the latched target at once («${(yesF.B.title.split(' · ')[1] || '').slice(0, 60)}», never «retries ?»); the parse also noted the model the CLI says it runs from the init (cliModel)`, JSON.stringify(yesF));
  }
}

// ── ⑧ ONE BAR, MASTER'S FIELDS — A LIVE SESSION'S FACTS ONLY CORRECT THEM (lane fable-52-cli-321 r4 … round 13) ──
// The owner's phone (2026-11-09 13:55 PT): 🔒⚠ claude-fable-5-2 in amber on a fable[1m] lock 5.2 served as asked — the chip compared
// the served model with whatever model fact the client DREW last. Rounds 4–12 held the chip to the SERVER's numbered facts through a
// second state (a regime, a pending press, a translation at each end) — every round's holes were in that second state. ROUND 13 cut
// it: THE BAR HAS ONE STATE AND ONE WAY TO PRESS — MASTER'S. The server computes the chip's two models (src/server/model-ask.js
// modelFacts: `want` — the ask, else the CLI's model, else the record's last — and `served` — the served fact ONLY when it was
// numbered AFTER the ask) and DECLARES them; applyStatus writes them onto master's own fields (_statusModel, _servedModel, the lock)
// and keeps the two numbers only to drop a stale frame. Master's mismatch over those fields IS the order judgement. The facts here
// are the REAL modelFacts over a session's fields.
console.log('— ⑧ one bar (round 13): a live session\'s numbered facts write master\'s own fields; a press is master\'s; a refusal undoes its own press');
const chipOf = (bar) => { const el = byKey(bar).model; return { amber: /chat-status-model-fallback/.test(el.getAttribute('class') || ''), locked: /chat-status-model-locked/.test(el.getAttribute('class') || ''), warn: el.innerHTML.includes('⚠'), text: el.innerHTML.replace(/<[^>]*>/g, ''), title: el.getAttribute('title') || '' }; };
const { createRequire: createRequire8 } = await import('node:module');
const MA8 = createRequire8(path.join(repo, 'src/server/model-ask.js'))('./model-ask.js');
const MP8 = await import(pathToFileURL(path.join(repo, 'src/model-providers.js')).href);
// a live claude session's model fields (the server's) — the owner's scene: locked fable[1m], 5.2 served AFTER the ask
const sess8 = (o) => ({ backend: 'claude', _modelLocked: true, _lockedModel: 'fable[1m]', _pickedModel: null, _spawnModel: 'fable[1m]', _askSeq: 3, _servedModel: 'claude-fable-5-2', _servedSeq: 5, _cliModel: null, _transcriptModel: 'claude-fable-5-2', _askRefused: null, ...o });   // (the live attach always notes the record's last: _transcriptModel)
const facts = (o, model = 'claude-fable-5-2') => { const se = sess8(o); return { model, modelLocked: !!se._modelLocked, lockedModel: se._lockedModel || null, ...MA8.modelFacts(se) }; };   // an attach status: master's lock lines + the facts
const lockOp = (locked, target) => ({ modelLocked: locked, lockedModel: locked ? target : null, lockMoved: true });   // master's model-lock op (round 14: the lock rides it, not the facts)
const frame = (o) => MA8.modelFacts(sess8(o));                                                   // a `model-facts` broadcast / an answer
const chipAfter = (...steps) => { const bar = mkBar(ChatStatusBar); for (const st of steps) (typeof st === 'function' ? st(bar) : bar.applyStatus(st)); return chipOf(bar); };
const servedOp = (m) => (bar) => bar.setServedModel(m);   // master's served-model op (the normalizer's — change-only; round 14: a LOCKED chip reads it)
// MASTER'S RENDER over the same fields: a bar fed them through master's own roads (a status naming the model and the lock, the
// served-model op) — no fact declared, so it runs master's code
const masterOver = (f) => { const m = mkBar(ChatStatusBar); m.applyStatus({ model: f.want || undefined, modelLocked: f.modelLocked, lockedModel: f.lockedModel }); const v = f.modelLocked ? (f.liveServed || null) : f.served; if (v) m.setServedModel(v); const c = chipOf(m); m.dispose(); return c; };   // (under a lock: only a served CHANGE the page saw live — round 14)
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
{
  const own = mkBar(ChatStatusBar); own.applyStatus(facts());
  const ownC = chipOf(own), f0 = facts();
  ok(!ownC.amber && ownC.locked && ownC.text.includes('fable[1m]') && own._statusModel === f0.model && own._servedModel === null && own._modelLocked === true && own._lockedModel === 'fable[1m]' && own._askSeq === 3 && own._servedSeq === 5,
    '⑧ the owner\'s scene: locked fable[1m], claude-fable-5-2 served AFTER the ask ⇒ a PLAIN locked chip — never amber on a held model; WHILE A LOCK STANDS the chip is master\'s F1 (round 14): a page that only attached knows no served model, so «🔒 fable[1m]» (the facts wrote the want and the numbers)', { ownC, fields: { s: own._statusModel, v: own._servedModel } });
  ok(typeof own.noteEchoAsk === 'undefined' && typeof own._noteModel === 'undefined' && typeof own.hasServerModelFacts === 'undefined' && typeof own.endServerFacts === 'undefined' && typeof own._press === 'undefined' && typeof own.hasPendingModel === 'undefined' && !('_serverModelFacts' in own) && !('_askedModel' in own) && !('_pending' in own),
    '⑧ …and the bar has ONE state: no facts regime (`_serverModelFacts`, hasServerModelFacts, endServerFacts), no pending press (_press, hasPendingModel), no client ask field, no echo door');
  own.dispose();
  // THE FACTS CELLS = MASTER'S RENDER over the fields they write: every combination of lock × the served model's order × its family
  // × where the want comes from
  const grid = [];
  for (const lock of [true, false]) for (const order of ['after', 'before', 'none']) for (const fam of ['same', 'other']) for (const from of ['ask', 'cli', 'record']) {
    const o = { _modelLocked: lock, _lockedModel: lock ? 'fable[1m]' : null, _servedModel: order === 'none' ? null : (fam === 'same' ? 'claude-fable-5-2' : 'claude-opus-5-5'), _servedSeq: order === 'after' ? 5 : order === 'before' ? 2 : 0 };
    if (from !== 'ask') Object.assign(o, { _lockedModel: null, _modelLocked: false, _spawnModel: null, ...(from === 'cli' ? { _cliModel: 'claude-fable-5-2' } : { _transcriptModel: 'claude-fable-5-2' }) });
    const f = facts(o), got = chipAfter(f), want = masterOver(f);
    grid.push({ lock, order, fam, from, ok: same(got, want), got, want });
  }
  const off = grid.filter((g) => !g.ok);
  ok(grid.length === 36 && off.length === 0, `⑧ THE FACTS CELLS: ${grid.length} combinations (lock × the served model's order × its family × the want's source) — each chip EQUALS master's render over the fields the facts write (under a LOCK the last served model, master's F1 — round 14)`, off.slice(0, 3));
  // THE ORDER JUDGEMENT (the one the facts own): a served model numbered BEFORE the ask (a pick on another tab, waiting for its first
  // turn) is not «served» — master's raw comparison would say ⚠
  const b2 = chipAfter(facts({ _modelLocked: false, _lockedModel: null }), frame({ _modelLocked: false, _lockedModel: null, _pickedModel: 'opus[1m]', _askSeq: 6 }));
  const b2raw = masterOver({ want: 'opus[1m]', served: 'claude-fable-5-2', modelLocked: false, lockedModel: null });
  const b2t = chipAfter(facts({ _modelLocked: false, _lockedModel: null }), frame({ _modelLocked: false, _lockedModel: null, _pickedModel: 'opus[1m]', _askSeq: 6 }), frame({ _modelLocked: false, _lockedModel: null, _pickedModel: 'opus[1m]', _askSeq: 6, _servedModel: 'claude-opus-5-5', _servedSeq: 7 }));
  ok(!b2.amber && b2.text === 'opus[1m]' && b2raw.amber && !b2t.amber && b2t.text === 'claude-opus-5-5', `⑧ THE ORDER JUDGEMENT: a pick on another client waits for its first turn — the served 5.2 numbered BEFORE the ask is not served ⇒ plain «${b2.text}» (master's raw fields: amber «${b2raw.text}»); opus served after it ⇒ plain «${b2t.text}» (round 13, master's way: what the CLI reported of the ask)`, { b2, b2raw, b2t });
  // a typed /model the CLI then served: the server moved the ask (and the lock) — the facts say so
  const t1 = chipAfter(facts({ _modelLocked: false, _lockedModel: null }), frame({ _modelLocked: false, _lockedModel: null, _pickedModel: 'opus[1m]', _askSeq: 8, _servedModel: 'claude-opus-5-5', _servedSeq: 9 }));
  const t1l = chipAfter(facts(), lockOp(true, 'opus[1m]'), frame({ _lockedModel: 'opus[1m]', _askSeq: 8, _servedModel: 'claude-opus-5-5', _servedSeq: 9 }), servedOp('claude-opus-5-5'));
  ok(!t1.amber && !t1l.amber && t1l.text.includes('claude-opus-5-5'), '⑧ a typed /model the CLI then served (unlocked; and a lock on that model): plain', { t1, t1l });
  // law D: pick opus → lock → unlock: the ask is still the pick (a lock set / lifted takes no new number)
  const pk = { _pickedModel: 'opus[1m]', _askSeq: 6, _servedModel: 'claude-opus-5-5', _servedSeq: 7 };
  const d = chipAfter(facts({ ...pk, _modelLocked: false, _lockedModel: null }), lockOp(true, 'opus[1m]'), lockOp(false, null));
  ok(!d.amber && d.text === 'claude-opus-5-5', '⑧ pick opus → lock → unlock (law D, the server keeps the pick): plain throughout, naming what the CLI reported of it', d);
  // a REAL fallback: served opus numbered after the ask — amber in master's words, locked and unlocked
  const fb = chipAfter(facts(), frame({ _servedModel: 'claude-opus-5-5', _servedSeq: 9 }), servedOp('claude-opus-5-5'));   // (locked: the fallback told LIVE — master's op, its F1 hears the change)
  const fbU = chipAfter(facts({ _servedModel: 'claude-opus-5-5', _servedSeq: 9, _modelLocked: false, _lockedModel: null }));
  ok(fb.amber && fb.locked && fb.text.includes('⚠ claude-opus-5-5') && /^Auto-fallback: the harness is serving claude-opus-5-5 instead of fable\[1m\]/.test(fb.title) && /LOCKED — retries fable\[1m\]/.test(fb.title) && fbU.amber && fbU.title.includes('instead of fable[1m]'),
    '⑧ a REAL fallback (asked fable[1m], claude-opus-5-5 served after the ask): amber in master\'s words, locked («LOCKED — retries fable[1m]») and unlocked', { fb, fbU });
  // MUST 4a: after a hub restart the server hydrates the served fact with its number — a standing fallback stays amber
  const rs = chipAfter(facts({ _servedModel: 'claude-opus-5-5', _servedSeq: 6, _askSeq: 5, _modelLocked: false, _lockedModel: null }));
  const rsL = chipAfter(facts({ _servedModel: 'claude-opus-5-5', _servedSeq: 6, _askSeq: 5 }));
  ok(rs.amber && rs.text.includes('claude-opus-5-5') && !rsL.amber && rsL.locked, '⑧ MUST 4a: the facts a restarted hub gives back for a standing fallback (opus served after the ask fable[1m] — servedSeq 6 > askSeq 5) draw an UNLOCKED chip AMBER at once; under a LOCK the chip is master\'s F1 (round 14 — given up for the locked chip): a page that only attached learns the fallback when the served model next changes', rs);
  // A STALE FRAME IS DROPPED BY ITS NUMBERS: a status that carries none (the creator's stored history on a resume / fork, a transcript
  // route) and a frame with lower numbers change no model field; the same numbers apply (a lock lifted takes none)
  const keep = mkBar(ChatStatusBar);
  keep.applyStatus(facts());
  keep.applyStatus({ model: 'claude-fable-5-1', servedModel: 'claude-fable-5-1', modelLocked: false, lockedModel: null });   // a stored status: no numbers
  const afterStored = { c: chipOf(keep), locked: keep._modelLocked, s: keep._statusModel };
  keep.applyStatus(frame({ _askSeq: 2, _servedSeq: 4, _pickedModel: 'opus', _modelLocked: false, _lockedModel: null, _servedModel: 'claude-opus-5-5' }));   // an older frame
  const afterOlder = { c: chipOf(keep), locked: keep._modelLocked, s: keep._statusModel, v: keep._servedModel };
  keep.applyStatus(frame({ _servedSeq: 4, _servedModel: 'claude-opus-5-5', _pickedModel: 'opus', _modelLocked: false, _lockedModel: null }));   // older ONLY by its served number (smaller 1)
  const afterServedOlder = { s: keep._statusModel, v: keep._servedModel };
  const keepWant = facts().want;   // (the CLI's reading of the locked ask: claude-fable-5-2 — round 13, master's way)
  ok(!afterStored.c.amber && afterStored.locked === false && afterStored.s === keepWant && afterOlder.s === keepWant && afterOlder.v === 'claude-fable-5-2' && afterServedOlder.s === keepWant && afterServedOlder.v === 'claude-fable-5-2' && keep._servedSeq === 5 && keep._askSeq === 3,
    '⑧ A STALE FRAME IS DROPPED WHOLE (round 14, smaller 1): a stored status after the facts (no numbers) changes no MODEL field (its lock rides master\'s road and applies), an older frame (askSeq 2) and one older ONLY by its served number (servedSeq 4) change nothing — not the want, not the served model', { afterStored, afterOlder, afterServedOlder });
  keep.dispose();
  // law B (round 15): a status built from a TRANSCRIPT (view-only attach, transcript route) is MASTER's status — its `model` — and judges
  // nothing; the newest turn's ASKED model only where its record states one (lastAsked — the LAW B leg below)
  const ro = chipAfter({ model: 'claude-fable-5-2' });
  ok(!ro.amber && ro.text === 'claude-fable-5-2', '⑧ law B: a read-only view of a stopped conversation (the store\'s status) names master\'s model — the record\'s — never amber', ro);
  // DECLARED, never inferred — a status that carries the facts' KEYS without declaring them is master's status road
  for (const backend of ['codex', 'opencode']) {
    const cx = mkBar(ChatStatusBar, { backend });
    cx.applyStatus({ model: 'gpt-5.1-codex-max', want: 'gpt-5.1-codex', served: 'gpt-5.1-codex', askSeq: 9, servedSeq: 9, modelLocked: false, lockedModel: null });
    const c0 = chipOf(cx), seq0 = cx._askSeq;
    cx.setModel('gpt-5.1-codex');   // a LIVE init op (chat-view _liveInitModel)
    ok(c0.text === 'gpt-5.1-codex-max' && seq0 === 0 && cx._servedModel === null && chipOf(cx).text === 'gpt-5.1-codex', `⑧ DECLARED, never inferred (${backend}): a status carrying want / served / numbers WITHOUT \`modelFacts: true\` is master's road — «${c0.text}», no number kept, nothing served; a LIVE init names the model`);
    cx.dispose();
  }
}
// ONE WAY TO PRESS (round 13): a pick, a Lock, an Unlock is MASTER's code on every page — shown and saved at the press; nothing waits
// for an answer. Its id rides the frame so a REFUSAL — the door's (`model-refused`) or the API's at the turn (askRefused) — undoes
// exactly its own press: the chip and the saved config back to what they were before THAT press; a lock that stood stays.
{
  const sb = read('src/lib/chat-status-bar.js');
  // the closure's own text, `(args) => { … }` (as ⑩ reads it)
  const arrowOf = (head) => { const at = sb.indexOf(head); if (at < 0) return ''; let i = sb.indexOf('=>', at) + 2; while (sb[i] === ' ') i++; const open = sb.indexOf('(', at + head.indexOf('(')); let d = 0, j = i; for (; j < sb.length; j++) { if (sb[j] === '{') d++; else if (sb[j] === '}') { d--; if (!d) break; } } return sb.slice(open, j + 1); };
  const pickSrc = arrowOf('const pick = (model) =>'), lockSrc = arrowOf('lockItem.onclick = (ev) =>');
  const mk = (o) => { const sent = [], cfg = []; const bar = mkBar(ChatStatusBar, { onConfigChange: (c) => cfg.push(c) }); bar._ws = { send: (f) => sent.push(JSON.parse(JSON.stringify(f))) }; bar.applyStatus(o === undefined ? facts({ _modelLocked: false, _lockedModel: null }) : o); return { bar, sent, cfg }; };
  const bindP = (src, bar) => new Function('showToast', 't', 'dropdown', 'namedModel', `return (${src});`).call(bar, () => { bar.__toasts = (bar.__toasts || 0) + 1; }, (x) => x, { remove() { } }, MP8.namedModel);
  const { namedModel: _nm } = MP8;
  const press = { pick: (x, m) => bindP(pickSrc, x.bar)(m), lock: (x) => bindP(lockSrc, x.bar)({ stopPropagation() { } }) };
  ok(pickSrc.length > 300 && lockSrc.length > 300 && typeof _nm === 'function', `⑧ the pick closure (${pickSrc.length} chars) and the Lock row (${lockSrc.length} chars) are read and run as they are`);
  ok(/if \(this\._modelLocked\) this\._lockedModel = model;/.test(pickSrc) && /this\._onConfigChange\?\.\(\{ model, \.\.\.\(this\._modelLocked \? \{ lockModel: model \} : \{\}\) \}\);/.test(pickSrc) && /this\._statusModel = model;/.test(pickSrc)
    && /this\._modelLocked = nowLock;/.test(lockSrc) && /this\._lockedModel = nowLock \? \(this\._statusModel \|\| null\) : null;/.test(lockSrc) && /this\._onConfigChange\?\.\(\{ modelLock: nowLock, lockModel: nowLock \? this\._statusModel : undefined/.test(lockSrc)
    && !/\b_press\b|\b_pending\b|PENDING_MS|_serverModelFacts|endServerFacts|_settleLock|hasPendingModel/.test(sb),
    '⑧ ONE WAY TO PRESS: the pick and the Lock are MASTER\'s lines on every page (the chip shows a pick at once, a standing lock re-targeted; a Lock sets its mark at once and saves what it locked) — the bar has no pending press, no regime, no settle path');
  // a pick under facts: MASTER's at the press — shown (the field) and saved, before any answer; for that one round trip the chip is
  // master's render over the pick and the served model standing (master's amber, which on master lasts until the first reply)
  {
    const x = mk(); press.pick(x, 'opus');
    const c = chipOf(x.bar), m = masterOver({ want: 'opus', served: null, modelLocked: false, lockedModel: null });   // (round 14, smaller 2: an unanswered pick is not judged against the older served model)
    ok(x.sent.length === 1 && x.sent[0].model === 'opus' && typeof x.sent[0].reqId === 'string' && x.bar._statusModel === 'opus' && same(c, m) && x.cfg.some((g) => g.model === 'opus'), `⑧ a pick under facts is MASTER's at the press — the field written («opus»), saved, its frame carries its id; until its answer it is never judged against the served model older than it (round 14, smaller 2): plain «${c.text}»`, { c, m, sent: x.sent, cfg: x.cfg });
    // its answer's facts (the server took the pick; 5.2 was served BEFORE it) write the same fields — master's false amber ends there
    x.bar.answerModel({ ok: true, answer: x.sent[0].reqId, facts: frame({ _modelLocked: false, _lockedModel: null, _pickedModel: 'opus', _askSeq: 6 }) });
    const c2 = chipOf(x.bar);
    ok(c2.text === 'opus' && !c2.amber && x.bar._askSeq === 6 && x.bar._servedModel === null, '⑧ …its ANSWER\'s facts end master\'s false amber at once (one round trip, not the first reply): the served 5.2 was numbered BEFORE the ask — «opus», plain until a model is served AFTER it', c2);
    x.bar.dispose();
  }
  // THE LOCK IS MASTER'S (round 14): its closure is master's text — no id, no undo; an answer of any kind leaves it as pressed
  {
    const x = mk({ model: 'claude-fable-5-2' });
    press.lock(x);
    const during = { locked: x.bar._modelLocked, cfg: x.cfg.slice() };
    x.bar.answerModel({ ok: false, answer: null });
    ok(during.locked === true && x.bar._modelLocked === true && x.bar._lockedModel === 'claude-fable-5-2' && !('reqId' in x.sent[0]) && x.sent[0].lockModel === 'claude-fable-5-2' && x.cfg.length === during.cfg.length && chipOf(x.bar).locked, '⑧ THE LOCK IS MASTER\'S (round 14): master\'s frame (it names what the chip shows, no id), saved at the press — and NEVER undone: a refusal answer leaves the mark and the saved config as pressed', { during, cfg: x.cfg, sent: x.sent });
    x.bar.dispose();
  }
  // ROUND 12's third finding, IMPOSSIBLE BY CONSTRUCTION: a Lock, then a pick of an id the door refuses ⇒ the refused id is never
  // shown or saved (the door's own rule, the ruled difference), so its refusal has nothing to undo — the lock that stood stays
  {
    const x = mk({ model: 'claude-fable-5-2' });
    press.lock(x);
    const cfgAfterLock = x.cfg.length;
    press.pick(x, 'opus 5');                                       // Custom… «opus 5» — not a model id
    x.bar.answerModel({ ok: false, answer: x.sent[1] && x.sent[1].reqId });
    ok(x.bar._modelLocked === true && x.bar._lockedModel === 'claude-fable-5-2' && x.cfg.length === cfgAfterLock && chipOf(x.bar).locked && !chipOf(x.bar).text.includes('opus 5'), '⑧ a REFUSED id after a Lock: never shown, never saved — its refusal undoes nothing; the lock stands in the window and in the saved config', { cfg: x.cfg, locked: x.bar._modelLocked });
    x.bar.dispose();
  }
  // SMALLER 1 (round 14): a facts frame the server sent BEFORE it took this bar's press — in flight during it, the numbers it carries are
  // the ones the press saw — never overwrites the press; the press's own answer (a newer ask) applies
  {
    const x = mk();
    const inFlight = frame({ _modelLocked: false, _lockedModel: null });
    const inFlight2 = frame({ _modelLocked: false, _lockedModel: null, _servedSeq: 7, _modelSeq: 7, _servedModel: 'claude-haiku-4-5' });   // newer ONLY by its served number (round 15: rest14's F6)
    press.pick(x, 'opus');
    x.bar.applyStatus(inFlight); x.bar.applyStatus(inFlight2);
    const held = x.bar._statusModel, heldServed = x.bar._servedModel;
    const answered = frame({ _modelLocked: false, _lockedModel: null, _pickedModel: 'opus', _cliModel: 'claude-opus-5-5', _askSeq: 8, _modelSeq: 9, _reportSeq: 9, _servedSeq: 7, _servedModel: 'claude-haiku-4-5' });
    x.bar.applyStatus(answered);
    ok(inFlight.want && inFlight.want !== 'opus' && held === 'opus' && heldServed !== 'claude-haiku-4-5' && answered.want === 'claude-opus-5-5' && x.bar._statusModel === 'claude-opus-5-5',
      '⑧ A FRAME IN FLIGHT DURING A PRESS (rounds 14–15, smaller 1): a facts frame the server sent before it took the pick — the numbers the press saw, or newer ONLY by its served number — leaves the pick shown — «dropped whole» is whole; the frame after the hub took it (a newer ask) applies',
      { inFlight: inFlight.want, held, answered: answered.want, after: x.bar._statusModel });
    x.bar.dispose();
  }
  // SMALLER 3 (round 14): LAW B on a stopped history whose newest run is a fallback — the record's last ASKED model (its fallback block's
  // `from`), never the fallback that served; the view's Lock then locks it (master's Lock: what the chip shows)
  {
    const v = mk({ model: 'claude-opus-5-5', servedModel: 'claude-opus-5-5', lastAsked: 'claude-fable-5-2' });
    const w = mk({ model: 'claude-opus-5-5', servedModel: 'claude-opus-5-5' });
    press.lock(v);
    ok(v.bar._statusModel === 'claude-fable-5-2' && v.sent[0] && v.sent[0].lockModel === 'claude-fable-5-2' && w.bar._statusModel === 'claude-opus-5-5',
      '⑧ LAW B, THE RECORD\'S LAST ASKED (round 14, smaller 3): a stopped history whose newest run fell back names the model that run ASKED for (session-store `lastAsked`), and the view\'s Lock locks it; a history that states none names its newest served model, as before',
      { v: v.bar._statusModel, sent: v.sent, w: w.bar._statusModel });
    v.bar.dispose(); w.bar.dispose();
  }
  // MUST 4 (round 15) — THREE PICKS IN A ROW, the chip after each step: the echoes in order; out of order; one never arriving (an init
  // ends the rest) — the real model-ask's facts on a page that pressed nothing (a second device)
  {
    const run3 = (order, init) => {
      const se = sess8({ _modelLocked: false, _lockedModel: null, _spawnModel: 'opus', _cliModel: 'claude-opus-5-5', _servedModel: 'claude-opus-5-5', _askSeq: 1, _servedSeq: 2, _modelSeq: 2 });
      const b = mkBar(ChatStatusBar); b.applyStatus({ model: 'claude-opus-5-5', modelLocked: false, lockedModel: null, ...MA8.modelFacts(se) });
      const P = [['claude-sonnet-5-5', null], ['haiku', 'claude-haiku-5-5'], ['claude-fable-5-2', null]];
      for (const [m] of P) { const before = se._pickedModel || 'opus'; se._pickedModel = m; MA8.notePick(se, m); MA8.askAfter(se, before, {}); b.applyStatus(MA8.modelFacts(se)); }
      const chips = [chipOf(b).text];
      for (const i of order) { const [m, id] = P[i]; MA8.noteEcho(se, { alias: m, id }, {}); b.applyStatus(MA8.modelFacts(se)); chips.push(chipOf(b).text); }
      if (init) { MA8.noteCliModel(se, init, {}); b.applyStatus(MA8.modelFacts(se)); chips.push(chipOf(b).text); }
      b.dispose(); return chips;
    };
    const inOrder = run3([0, 1, 2]), outOrder = run3([0, 2, 1]), missing = run3([0], 'claude-haiku-5-5');   // (fable's set_model died: the CLI's init names haiku)
    ok(same(inOrder, ['claude-fable-5-2', 'claude-fable-5-2', 'claude-fable-5-2', 'claude-fable-5-2']) && same(outOrder, ['claude-fable-5-2', 'claude-fable-5-2', 'claude-fable-5-2', 'claude-haiku-5-5']) && same(missing, ['claude-fable-5-2', 'claude-fable-5-2', 'claude-haiku-5-5']),
      '⑧ MUST 4 (round 15) — THREE PICKS IN A ROW (sonnet, haiku, fable), the chip after each: echoes IN ORDER ⇒ the newest pick, then its id; OUT OF ORDER (fable\'s echo before haiku\'s — the CLI ran haiku last) ⇒ the CLI\'s last report, claude-haiku-5-5; ONE NEVER ARRIVING ⇒ the newest pick stands until the next init ends the rest and names what the CLI runs (claude-haiku-5-5: fable\'s set_model died) — never an earlier pick\'s echo read as a later pick\'s', { inOrder, outOrder, missing });
  }
  // MUST 3 (round 15) — a LOCKED page re-attached after a pick under the lock and its live echo (a socket reconnect, before any turn):
  // master's chip — the attach names its own model (the transcript's), no amber; the live echo had moved it once, as master's road did
  {
    const se = sess8({ _lockedModel: 'claude-opus-5-5', _spawnModel: 'claude-opus-5-5', _cliModel: 'claude-opus-5-5', _servedModel: 'claude-opus-5-5', _transcriptModel: 'claude-opus-5-5', _askSeq: 1, _servedSeq: 2, _modelSeq: 2 });
    const lockAt = (t) => ({ modelLocked: true, lockedModel: t });
    const b = mkBar(ChatStatusBar); b.applyStatus({ model: 'claude-opus-5-5', ...lockAt('claude-opus-5-5'), ...MA8.modelFacts(se) }); b.setServedModel('claude-opus-5-5');
    const x = { bar: b, sent: [], cfg: [] }; b._ws = { send: (f) => x.sent.push(f) };
    press.pick(x, 'sonnet');                                           // a pick under the lock re-targets it (master's lines)
    se._pickedModel = 'sonnet'; se._lockedModel = 'sonnet'; MA8.notePick(se, 'sonnet'); MA8.askAfter(se, 'claude-opus-5-5', {});
    b.applyStatus({ ...lockAt('sonnet'), lockMoved: true });          // master's model-lock op
    b.answerModel({ ok: true, answer: x.sent[0] && x.sent[0].reqId, facts: MA8.modelFacts(se) });
    MA8.noteEcho(se, { alias: 'sonnet', id: 'claude-sonnet-5-5' }, {}); b.applyStatus(MA8.modelFacts(se));   // its LIVE echo
    const atEcho = chipOf(b);
    b.applyStatus({ model: 'claude-opus-5-5', ...lockAt('sonnet'), ...MA8.modelFacts(se) });   // the RE-ATTACH (a reconnect): the attach names the transcript's model
    const re = chipOf(b);
    const m = mkBar(ChatStatusBar); m.applyStatus({ model: 'claude-opus-5-5', ...lockAt('claude-opus-5-5') }); m.setServedModel('claude-opus-5-5'); m.setModel('sonnet'); m.applyStatus({ ...lockAt('sonnet'), lockMoved: true }); m.setModel('claude-sonnet-5-5'); const mAtEcho = chipOf(m); m.applyStatus({ model: 'claude-opus-5-5', ...lockAt('sonnet') });   // master's page through the same
    ok(!re.amber && re.locked && same(re, chipOf(m)) && same(atEcho, mAtEcho), `⑧ MUST 3 (round 15): a LOCKED page re-attached after a pick under the lock and its live echo shows master's chip («${re.text}», no amber) — the attach's own model, never the echo's id against the served model standing; at the echo itself, master's chip too («${atEcho.text}»)`, { atEcho, mAtEcho, re, master: chipOf(m) });
    b.dispose(); m.dispose();
  }
  // SMALLER 3 (round 15) — a Lock and a pick under it on a page that gets NO frame back (an ended window): the served model the chip
  // judges is master's F1 at once (derived at render), never the unlocked judgement the page held — no false «Auto-fallback»
  {
    const x = mk(facts({ _modelLocked: false, _lockedModel: null }));   // a page that opened after the served change: master's op never reached it
    x.bar._ws = { send: () => { } };                                   // the window ended: no frame comes back
    press.lock(x); press.pick(x, 'claude-fable-5-2');
    const c = chipOf(x.bar);
    const m = mkBar(ChatStatusBar); m.applyStatus({ model: facts({ _modelLocked: false, _lockedModel: null }).want, modelLocked: false, lockedModel: null }); m._ws = { send: () => { } };
    bindP(lockSrc, m)({ stopPropagation() { } }); bindP(pickSrc, m)('claude-fable-5-2');
    ok(!c.amber && c.locked && same(c, chipOf(m)), `⑧ SMALLER 3 (round 15): a Lock and a pick under it with no frame back (an ended window) draw master's chip («${c.text}», no false amber) — the served model is derived at render, master's F1`, { c, master: chipOf(m) });
    x.bar.dispose(); m.dispose();
  }
  // ROUND 16 — THE SENTENCE IS ABOUT THE PICK THE API REFUSED, AND IT IS SAID: a pick made at any moment of a turn (before its first
  // record, between two records of one message, after its result) — the turn in flight is served on the OLD model, then the 404 names
  // the pick — is said ONCE, by the page that pressed; a second page says nothing. The real model-ask's facts on two real bars
  {
    const stack = new FakeEl('div'); stack.style = {};
    const doc0 = globalThis.document; globalThis.document = { ...doc0, getElementById: (id) => (id === 'global-toasts' ? stack : null), body: new FakeEl('body') };
    try {
      const toasts = () => stack.children.filter((el) => /global-toast-error/.test(el.className)).map((el) => el.children.map((c) => c.textContent).join(' '));
      const R404 = (m) => ({ type: 'result', is_error: true, api_error_status: 404, num_turns: 1, result: `There's an issue with the selected model (${m}). It may not exist or you may not have access to it.` });
      const O = 'claude-opus-5-5', NOPE = 'claude-nope-9';
      const scene = (moment) => {
        const se = sess8({ _modelLocked: false, _lockedModel: null, _spawnModel: O, _cliModel: O, _servedModel: O, _servedFactModel: O, _askSeq: 1, _servedSeq: 2, _modelSeq: 2 });
        const a = mk({ model: O, modelLocked: false, lockedModel: null, ...MA8.modelFacts(se) }), b = mk({ model: O, modelLocked: false, lockedModel: null, ...MA8.modelFacts(se) });
        const tell = () => { const f = MA8.modelFacts(se); a.bar.applyStatus(f); b.bar.applyStatus(f); };
        const n0 = toasts().length;
        if (moment === 'between') { MA8.noteServed(se, O, { recId: 'msg_2' }); tell(); }
        if (moment === 'after') { MA8.noteServed(se, O, { recId: 'msg_2' }); tell(); }
        press.pick(a, NOPE);                                                  // the pressing page; the hub takes it (ws-handler: the pick, notePick, askAfter)
        se._pickedModel = NOPE; MA8.notePick(se, NOPE); MA8.askAfter(se, O, {});
        a.bar.answerModel({ ok: true, answer: a.sent[a.sent.length - 1].reqId, facts: MA8.modelFacts(se) }); b.bar.applyStatus(MA8.modelFacts(se));
        if (moment === 'before') { MA8.noteServed(se, O, { recId: 'msg_2' }); tell(); }    // the in-flight response arrives after the pick, on the old model
        if (moment === 'between') { MA8.noteServed(se, O, { recId: 'msg_2' }); tell(); }   // msg_2 continues (its own id: judged once)
        if (moment === 'after') { MA8.noteCliModel(se, NOPE, {}); tell(); }                // the next turn's init names the pick
        MA8.noteRefusal(se, R404(NOPE), {}); tell(); tell();                                 // the 404 — told, and told again (a second frame)
        const said = toasts().slice(n0);
        a.bar.dispose(); b.bar.dispose();
        return said;
      };
      const before = scene('before'), between = scene('between'), after = scene('after');
      const once = (x) => x.length === 1 && /^The API refused claude-nope-9 — pick another model/.test(x[0]);
      ok(once(before) && once(between) && once(after),
        '⑧ ROUND 16 — THE SENTENCE IS SAID for a pick made at ANY moment of a turn — before its first record, between two records of one message, after its result — the turn in flight served on the old model, then the 404 naming the pick: once, by the page that pressed; the second page says nothing (the press is let go only when THE PICK is served)', { before, between, after });
    } finally { globalThis.document = doc0; }
  }
  // MUST 4 (round 16) — where the exact name matters: picks opus then claude-opus-4-8, the 4-8 echo first, then opus's: the chip after each
  {
    const se = sess8({ _modelLocked: false, _lockedModel: null, _spawnModel: 'sonnet', _cliModel: 'claude-sonnet-5-5', _servedModel: 'claude-sonnet-5-5', _askSeq: 1, _servedSeq: 2, _modelSeq: 2 });
    const b = mkBar(ChatStatusBar); b.applyStatus({ model: 'claude-sonnet-5-5', modelLocked: false, lockedModel: null, ...MA8.modelFacts(se) });
    for (const m of ['opus', 'claude-opus-4-8']) { const was = se._pickedModel || 'sonnet'; se._pickedModel = m; MA8.notePick(se, m); MA8.askAfter(se, was, {}); b.applyStatus(MA8.modelFacts(se)); }
    MA8.noteEcho(se, { alias: 'claude-opus-4-8', id: null }, {}); b.applyStatus(MA8.modelFacts(se)); const c1 = chipOf(b).text;
    MA8.noteEcho(se, { alias: 'opus', id: 'claude-opus-5-5' }, {}); b.applyStatus(MA8.modelFacts(se)); const c2 = chipOf(b).text;
    ok(c1 === 'claude-opus-4-8' && c2 === 'claude-opus-5-5', `⑧ MUST 4 (round 16) — the echoes OUT OF ORDER (picks opus then claude-opus-4-8; the 4-8 echo first, then opus's): the chip «${c1}» then «${c2}», the CLI's last report — an echo answers the pick it NAMES, never one of its family`, { c1, c2 });
    b.dispose();
  }
  // SMALL 3 (round 16, RULED): a DRAWN init moves no chip on codex / opencode / Antigravity either (master's page jumped back to the spawn
  // model when the history window drew the first init); a LIVE init still names the model — chat-view's own system-record block, run
  {
    const cvS = read('src/lib/chat-view.js'), at = cvS.indexOf("      case 'system': {\n        const result = this._renderers.renderSystemMsg(msg);"), end = cvS.indexOf("        el = result?.el || null;", at);
    const drawn = new Function('msg', 'noteMemoryPaths', cvS.slice(at + "      case 'system': {".length, end));
    const live = new Function('msg', cvS.slice(cvS.indexOf('  _liveInitModel(msg) {') + '  _liveInitModel(msg) {'.length, cvS.indexOf('\n  }\n', cvS.indexOf('  _liveInitModel(msg) {'))));
    // one row per REGISTERED harness (derived from backend-caps — a new harness gets its row by being registered)
    const CAPS16 = (await import('node:module')).createRequire(import.meta.url)(path.join(repo, 'src/backend-caps.js'));
    const rows = Object.keys(CAPS16.BACKEND_CAPS).map((be) => [be, `${be}-spawn-model`, `${be}-picked-model`]);
    const out = rows.map(([be, spawn, picked]) => {
      const bar = mkBar(ChatStatusBar, { backend: be }); bar.applyStatus({ model: picked });   // a page opened after a pick: its attach names the pick
      const view = { _statusBar: bar, _chatInput: null, _renderers: { renderSystemMsg: () => ({ sideEffect: { model: spawn } }) } };
      drawn.call(view, { role: 'system', content: [{ initData: { model: spawn } }] }, () => { });
      const afterDraw = bar._statusModel;
      live.call(view, { role: 'system', content: [{ initData: { model: spawn } }] });
      const r = { be, afterDraw, afterLive: bar._statusModel }; bar.dispose(); return r;
    });
    ok(at > 0 && end > at && rows.length >= 5 && out.every((r, i) => r.afterDraw === rows[i][2] && r.afterLive === rows[i][1]), `⑧ SMALL 3 (round 16, ruled — a change outside claude): on every registered harness (${rows.map((r) => r[0]).join(', ')}: codex, opencode and Antigravity included) a DRAWN init (the history window drawing the first one) leaves the chip on the pick the attach named — master's page jumped back to the spawn model; a LIVE init still names the model the CLI runs`, out);
  }
  // A REFUSAL UNDOES NOTHING (round 15): the door's answer to a press changes no field and no saved config — it ends the press's hold
  {
    const x = mk({ model: 'claude-fable-5-2' });
    press.pick(x, 'opus'); press.lock(x);
    const [pk, lk] = x.sent, cfgN = x.cfg.length;
    x.bar.answerModel({ ok: false, answer: pk && pk.reqId });
    ok(x.bar._statusModel === 'opus' && x.bar._modelLocked === true && x.cfg.length === cfgN && !!lk && !('reqId' in lk) && !x.bar._pressAt, '⑧ A REFUSAL UNDOES NOTHING (round 15): the door\'s answer to a press changes no field and no saved config (what the bar shows passed the door\'s own rule) — it ends the press\'s hold; the Lock pressed after it stands', { s: x.bar._statusModel, locked: x.bar._modelLocked });
    x.bar.dispose();
  }
  // CUT 1 (round 15) — THE API'S REFUSAL AT THE TURN (askRefused — the 404 naming the ask): NOTHING a person set changes — the chip stays
  // on the refused ask (amber over the served model standing, master's chip), the saved config keeps the pick, the lock stands — and the
  // pressing page SAYS it once (the real toast): unlocked «pick another model», locked «the lock still asks for it»
  {
    const stack = new FakeEl('div'); stack.style = {};
    const doc0 = globalThis.document; globalThis.document = { ...doc0, getElementById: (id) => (id === 'global-toasts' ? stack : null), body: new FakeEl('body') };
    try {
      const toasts = () => stack.children.filter((el) => /global-toast-error/.test(el.className)).map((el) => el.children.map((c) => c.textContent).join(' '));
      // UNLOCKED: this bar's pick of claude-nope-9, its init naming it, then the API's 404 at the turn (the measured order)
      const x = mk(facts({ _modelLocked: false, _lockedModel: null }));
      press.pick(x, 'claude-nope-9');
      const cfgN = x.cfg.length, lastCfg = x.cfg[x.cfg.length - 1] || {};
      const refused = frame({ _modelLocked: false, _lockedModel: null, _pickedModel: 'claude-nope-9', _askSeq: 6, _modelSeq: 7, _askRefused: 'claude-nope-9', _cliModel: 'claude-nope-9', _reportSeq: 7 });
      x.bar.applyStatus(refused); x.bar.applyStatus(refused);       // the broadcast, and the same frame again (a second tab's echo)
      const c = chipOf(x.bar), said = toasts(), m = masterOver({ want: 'claude-nope-9', served: 'claude-fable-5-2', modelLocked: false, lockedModel: null });
      ok(refused.want === 'claude-nope-9' && refused.served === 'claude-fable-5-2' && x.cfg.length === cfgN && lastCfg.model === 'claude-nope-9' && x.bar._statusModel === 'claude-nope-9' && c.amber && same(c, m) && said.length === 1 && /The API refused claude-nope-9 — pick another model/.test(said[0]),
        `⑧ CUT 1 — THE API REFUSED AN UNLOCKED PICK (round 15): nothing undone — the chip stays on the refused ask, amber over the served model standing, exactly master's chip («${c.text}»); the saved config keeps the pick — SAID ONCE («${said[0] || ''}»)`, { cfg: x.cfg, said, c, m, refused });
      // UNDER A LOCK: nothing is undone — master's chip stands (the hub DOES retry that model) — and the lock's sentence is said once
      const z = mk(facts());                                        // locked fable[1m], 5.2 served
      press.pick(z, 'claude-nope-9');                                 // a pick under the lock re-targets it (master's)
      const zcfg = z.cfg.length;
      const refusedL = frame({ _lockedModel: 'claude-nope-9', _askSeq: 6, _askRefused: 'claude-nope-9', _cliModel: 'claude-nope-9' });
      z.bar.applyStatus(refusedL); z.bar.applyStatus(refusedL);
      const cz = chipOf(z.bar), saidL = toasts();
      ok(z.bar._modelLocked === true && z.bar._lockedModel === 'claude-nope-9' && z.cfg.length === zcfg && cz.locked && /LOCKED — retries claude-nope-9/.test(cz.title) && saidL.length === 2 && /the lock still asks for it; unlock or pick another/.test(saidL[1]),
        `⑧ THE API REFUSED A PICK UNDER A LOCK (round 14): nothing undone — the lock re-targeted to claude-nope-9 stands, the chip says what the hub retries («${cz.title.split(' · ')[1] || ''}»), the saved config as pressed — and the lock's sentence said once («${saidL[1] || ''}»)`, { cz, cfg: z.cfg, said: saidL });
      // another tab's bar (it pressed nothing): nothing to undo, nothing said
      const y = mk(facts());
      y.bar.applyStatus(refusedL);
      ok(toasts().length === 2 && !y.bar._lastPick && y.bar._modelLocked === true, '⑧ …a bar that did NOT press it undoes nothing and says nothing (each sentence is the pressing bar\'s, once)');
      x.bar.dispose(); y.bar.dispose(); z.bar.dispose();
    } finally { globalThis.document = doc0; }
  }
  // THE CLI'S LIVE ECHO (round 14 — 主开发's two pins): the hub that SAW the echo live tells it (model-ask noteEcho → echoModel /
  // echoSeq, and the CLI's model it reports) for a pick it sent or the lock's own repin. WHILE A LOCK STANDS it moves the chip's model
  // ONCE on every page live at the time — master's echo road, its setModel as the record arrived; a page that opens later names the CLI's
  // LAST report the hub saw live (what master's page draws from the history it loads) — never an older echo: a later init wins, and no
  // record drawn again (scrolled up, a re-attach) moves it back. A backlog's echo, and an echo of nothing this hub sent, are no report
  {
    const se = sess8({ _lockedModel: 'claude-opus-5-5', _spawnModel: 'claude-opus-5-5', _servedModel: 'claude-fable-5-2', _transcriptModel: 'claude-fable-5-2', _cliModel: 'claude-fable-5-2' });
    const lockLines = { modelLocked: true, lockedModel: 'claude-opus-5-5' };
    const live = mkBar(ChatStatusBar); live.applyStatus({ model: 'claude-fable-5-2', ...lockLines, ...MA8.modelFacts(se) });
    const m = mkBar(ChatStatusBar); m.applyStatus({ model: 'claude-fable-5-2', ...lockLines });   // master's page, the same moment
    const late = MA8.noteEcho(se, { alias: 'claude-opus-5-5', id: null }, {}, { late: true });     // the repin's echo in a BACKLOG
    const told = MA8.noteEcho(se, { alias: 'claude-opus-5-5', id: null }, {});                     // the repin's LIVE echo
    const fr = MA8.modelFacts(se);
    live.applyStatus(fr); m.setModel('claude-opus-5-5');
    const atEcho = { s: live._statusModel, c: chipOf(live), mc: chipOf(m) };
    live.setModel('claude-sonnet-5-5');   // a later road moved it (a pick, a live init)…
    live.applyStatus(fr);                 // …the same echo told again (a re-sent frame) is not re-read
    const once = live._statusModel;
    const late2 = mkBar(ChatStatusBar); late2.applyStatus({ model: 'claude-fable-5-2', ...lockLines, ...fr });   // a page that opens AFTER the echo: its attach names its own model
    const late2b = mkBar(ChatStatusBar); late2b.applyStatus({ ...lockLines, ...fr });                            // …an attach that names none (no turn on record yet)
    MA8.noteCliModel(se, 'claude-fable-5-2', {});   // the CLI's NEXT live init: the echo is old now
    const late3 = mkBar(ChatStatusBar); late3.applyStatus({ ...lockLines, ...MA8.modelFacts(se) });
    const un = mkBar(ChatStatusBar); un.applyStatus({ model: 'claude-fable-5-2', ...MA8.modelFacts({ ...se, _echoSeq: 0, _modelLocked: false, _lockedModel: null }) });
    un.applyStatus({ ...MA8.modelFacts({ ...se, _modelLocked: false, _lockedModel: null }), echoModel: 'claude-opus-4-8' });   // UNLOCKED: the want speaks, never the echo field
    ok(!late && told === true && fr.echoSeq === 1 && fr.echoModel === 'claude-opus-5-5' && atEcho.s === 'claude-opus-5-5' && same(atEcho.c, atEcho.mc) && once === 'claude-sonnet-5-5' && late2._statusModel === 'claude-fable-5-2' && late2b._statusModel === 'claude-opus-5-5' && late3._statusModel === 'claude-fable-5-2' && un._statusModel !== 'claude-opus-4-8',
      '⑧ THE CLI\'S LIVE ECHO (rounds 14–15): the lock\'s repin echo, seen live, moves a LOCKED page\'s chip model ONCE — the chip master\'s page draws from the same record (its setModel) — never again for the same echo; a page that opens later takes its ATTACH\'s own model (MUST 3: master\'s attach road), and only an attach naming none the CLI\'s LAST live report (the echo, then the next init — never the older echo); a backlog\'s echo is no report; an UNLOCKED chip reads the want, never the echo field',
      { late, told, fr: { echoSeq: fr.echoSeq, echoModel: fr.echoModel }, atEcho, once, late2: late2._statusModel, late2b: late2b._statusModel, late3: late3._statusModel, un: un._statusModel });
    for (const b of [live, m, late2, late2b, late3, un]) b.dispose();
  }
  ok(/if \(this\._lockRowOffered\(\)\) \{/.test(sb) && /_lockRowOffered\(\) \{ return \(!!uiRow\(this\._backend\)\.modelLock && declaresModelFacts\(this\._backend\)\) \|\| !!this\._modelLocked; \}/.test(sb), '⑧ THE RULED DIFFERENCE (round 11): the Lock row by the harness\'s CAPABILITY row — and wherever a lock stands, so it can be lifted');
  // NO OTHER CLIENT LINE KNOWS FACTS EXIST: the declared fields are read in applyStatus alone; chat-view only hands the frame over
  const lib = fs.readdirSync(path.join(repo, 'src/lib')).filter((f) => f.endsWith('.js'));
  // (a read of a frame's key: `.modelFacts` `.askSeq` `.servedSeq` `.askRefused` `.want` `.served` — agent-meta's read of the CAPABILITY
  //  row `serverCapsOf(backend).modelFacts` is the harness's declaration, not a fact)
  const factReaders = lib.flatMap((f) => read('src/lib/' + f).split('\n').map((l, i) => ({ f, i: i + 1, l })).filter(({ l }) => /\.(modelFacts|askSeq|servedSeq|askRefused)\b|\b(?:status|data|facts|frame)\??\.(?:want|served)\b/.test(l.replace(/\/\/.*$/, '').replace(/serverCapsOf\(backend\)\.modelFacts/, ''))));
  const applyAt = sb.indexOf('  applyStatus(status) {'), applyEnd = sb.indexOf('\n  }\n', applyAt);
  const lineOf = (i) => sb.slice(0, i).split('\n').length;
  const stray = factReaders.filter((r) => !(r.f === 'chat-status-bar.js' && r.i > lineOf(applyAt) && r.i <= lineOf(applyEnd)));
  ok(factReaders.length >= 5 && stray.length === 0, `⑧ NO OTHER CLIENT LINE KNOWS FACTS EXIST: the declared fields are read in the bar's applyStatus alone (${factReaders.length} lines) — chat-view only hands the frame over`, stray.slice(0, 4));
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
  const liveOnly = [...cv.matchAll(/this\._liveInitModel\(/g)].length === 1 && /if \(op\.op === 'create'\) \{\n\s*const drawnBefore = !!op\.message && !!this\._renderedMsgIds\?\.has\(op\.message\.id\);[\s\S]{0,900}if \(!drawnBefore\) this\._liveInitModel\(op\.message\);/.test(cv);   // round 11: after the dedup — a replayed init never moves the chip back
  ok(liveOnly && /_liveInitModel\(msg\) \{\n\s*const m = msg && msg\.role === 'system' && msg\.content\?\.\[0\]\?\.initData\?\.model;\n\s*if \(!m \|\| !this\._statusBar\) return;/.test(cv), '⑧ CENSUS: the live-init road is called from the LIVE op only (`_onOp` create, after its dedup), never from a history draw — on every bar (round 13: a live session\'s facts, when it has them, correct the same field)');
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
  // (round 14: master's A5 is back — the parse loop reads the LIVE echo: its import, A5's own parse, and noteEcho over the same record)
  const a5 = (x) => x.file === 'src/server/stdout/claude-stream-json.js' && (/^const \{ parseSetModelEcho \} = require\('\.\.\/\.\.\/model-echo\.js'\);/.test(x.line) || /const echo = parseSetModelEcho\(uText, \{ envelope: 'required' \}\);/.test(x.line) || /MA\.noteEcho\(session, parseSetModelEcho\(uText, \{ envelope: 'required' \}\)/.test(x.line));
  const echoOk = (x) => a5(x) || x.file === 'src/model-echo.js' || (x.file === 'src/lib/chat-renderers.js' && (x.enc === '_renderNotificationMsg' || /^import \{ stripSetModelBackticks \} from '\.\.\/model-echo\.js';/.test(x.line))) || /^\s*(\/\/|\*|\/\*)/.test(x.line) || (/'local-command-stdout',\s*'command-name'/.test(x.line) && !/set[\s_-]*model/i.test(x.line));
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
  const f9 = (o = {}) => { const v = { askedModel: 'fable[1m]', askSeq: 0, modelLocked: false, lockedModel: null, servedModel: 'claude-fable-5-2', servedSeq: 1, cliModel: 'claude-fable-5-2', model: firstStatus.model, ...o };
    return { ...firstStatus, model: v.model, modelLocked: !!v.modelLocked, lockedModel: v.lockedModel || null, ...MA8.modelFacts({ backend: 'claude', _modelLocked: v.modelLocked, _lockedModel: v.lockedModel, _pickedModel: v.askedModel, _spawnModel: null, _askSeq: v.askSeq, _servedModel: v.servedModel, _servedSeq: v.servedSeq, _cliModel: v.cliModel, _transcriptModel: v.model || null, _askRefused: null }) }; };   // round 13: the REAL facts over a session's fields
  const mk9 = (status) => { const cfg = {}, sent = [], writes = []; const b = mkBar(ChatStatusBar, { onConfigChange: (o) => { writes.push(o); for (const [k, v] of Object.entries(o)) { if (v === undefined) delete cfg[k]; else cfg[k] = v; } } }); b._ws = { send: (f) => sent.push(f) }; b.applyStatus(status); return { b, cfg, sent, writes }; };
  ok(!!pick9 && !!lock9, '⑩ the bar\'s own pick and Lock closures are read (their text, bound to a real bar)');
  // (a) a menu pick is saved at the press, exactly as on master — its second life resumes on it with origin «chosen» (the oracle table)
  { const { b, cfg, sent } = mk9(f9()); bind9(pick9, b)('sonnet'); bind9(pick9, b)('opus 5');
    ok(cfg.model === 'sonnet' && !('lockModel' in cfg) && sent.length === 2, '⑩ (a) a pick is SAVED AT THE PRESS ({model}), as master saves it — a model the hub\'s door refuses («opus 5») is sent (the hub answers the refusal) and never saved', JSON.stringify(cfg)); }
  // a Lock pressed a moment ago (its answer not back yet) is a lock for the next pick's save — master's optimistic bar does the same
  { const { b, cfg } = mk9(f9()); bind9(lock9, b)(EV); bind9(pick9, b)('opus');
    ok(cfg.modelLock === true && cfg.model === 'opus' && cfg.lockModel === 'opus', '⑩ …a pick right after a Lock whose answer is not back saves the lock\'s new target with it ({model, lockModel}) — as master\'s optimistic bar', JSON.stringify(cfg)); }
  // the Lock saves what master saves — the model this bar shows (round 13 took round 5/9's alias-keeping target back); a pick a moment ago is that model
  { const { b, cfg, sent } = mk9(f9()); bind9(lock9, b)(EV);
    const { b: b0, cfg: c0 } = mk9(f9({ cliModel: null, servedModel: null, servedSeq: 0 })); bind9(lock9, b0)(EV);
    const { b: b2, cfg: c2 } = mk9(f9()); bind9(pick9, b2)('sonnet'); bind9(lock9, b2)(EV);
    ok(cfg.modelLock === true && cfg.lockModel === 'claude-fable-5-2' && cfg.model === 'claude-fable-5-2' && sent.length === 1 && sent[0].lock === true && sent[0].lockModel === 'claude-fable-5-2' && !('model' in sent[0]) && c0.lockModel === 'fable[1m]' && c2.lockModel === 'sonnet', '⑩ the Lock SAVES WHAT MASTER SAVES, at the press ({modelLock, lockModel, model}): the model this bar shows — what the CLI reported of the ask (claude-fable-5-2; round 9\'s alias-keeping target taken back, round 13), the ask itself before the CLI reported (fable[1m]); master\'s frame names it and the hub locks it; a pick a moment before is that model (sonnet)', JSON.stringify({ cfg, sent, c0, c2 })); }
  // (b) an Unlock is saved at the press — a target-less lock an earlier version set included: no later resume is locked again
  { const { b, cfg } = mk9(f9({ modelLocked: true, lockedModel: null }));
    bind9(lock9, b)(EV);
    ok(cfg.modelLock === false && !('lockModel' in cfg), '⑩ (b) an Unlock is SAVED AT THE PRESS ({modelLock: false}) — of a target-less lock an earlier version set too, so no later resume is locked again (the r8 tree wrote nothing and every resume came back locked)', JSON.stringify(cfg)); }
  // WHEN a lock may be set is master's: not before a model was reported (master's words)
  { const { b, cfg, sent } = mk9(f9({ askedModel: null, servedModel: null, servedSeq: 0, cliModel: null, model: '' }));
    bind9(lock9, b)(EV);
    ok(sent.length === 0 && Object.keys(cfg).length === 0 && b.__toasts === 1, '⑩ a Lock pressed before ANY model is known (no ask, no CLI model, no record) is refused at the bar with master\'s words («Model not reported yet…») — nothing sent, nothing saved', JSON.stringify({ cfg, sent, toasts: b.__toasts })); }
  // ROUND 9 DEFECT FIX (the major): a conversation RESUMED and never picked — no ask, no init, nothing served; its attach status names
  // the transcript's model (claude-opus-5-5). The chip names it and the Lock locks it, as master does — 6abc439f3 toasted «Model not
  // reported yet…» (its target read the ask, the CLI's model and the served one, never the attach's)
  const rs9 = f9({ askedModel: null, servedModel: null, servedSeq: 0, cliModel: null, model: 'claude-opus-5-5' });
  { const { b, cfg, sent } = mk9(rs9); const shown = b._statusModel; bind9(lock9, b)(EV);
    ok(shown === 'claude-opus-5-5' && !b.__toasts && sent.length === 1 && sent[0].lock === true && !('model' in sent[0]) && cfg.modelLock === true && cfg.lockModel === 'claude-opus-5-5' && cfg.model === 'claude-opus-5-5',
      '⑩ (defect fix) RESUMED, never picked — the chip names the transcript\'s model (the attach status\'s) and Lock LOCKS it: no toast, the frame names no model to switch to (its lockModel is what the chip shows, and the hub locks that — there, the transcript model), saved {modelLock, lockModel: claude-opus-5-5, model} as master saves it', JSON.stringify({ shown, cfg, sent, toasts: b.__toasts })); }
  // …and a pick whose frame died with a restart, then Lock: the pick is saved at the press as on master; the re-attached bar locks what
  // the server will lock — the transcript's model, the dead pick never having reached it
  { const d = mk9(rs9); d.b._ws = { send() { } }; bind9(pick9, d.b)('opus');
    const { b, cfg, sent } = mk9(rs9); bind9(lock9, b)(EV);
    ok(d.cfg.model === 'opus' && !b.__toasts && sent.length === 1 && cfg.modelLock === true && cfg.lockModel === 'claude-opus-5-5',
      '⑩ (defect fix) a pick whose frame DIED with a restart (saved at the press, {model: opus}), then Lock on the re-attached bar: locked, never «Model not reported yet…» — on the transcript\'s model, the one the server locks (the dead pick never reached it)', JSON.stringify({ dead: d.cfg, cfg, toasts: b.__toasts })); }
  // a fresh SPAWN before its first message — master's moment (round 9f's ruling, kept by the server's want in round 13): an ask nobody
  // picked is no reading until the CLI reports one, so the chip reads master's «model: ?» and the Lock waits with master's words
  { const st = { ...firstStatus, model: '', ...MA8.modelFacts({ backend: 'claude', _spawnModel: 'fable[1m]', _askSeq: 1, _servedSeq: 0, _modelLocked: false, _lockedModel: null }) };
    const { b, sent, cfg } = mk9(st);
    const c = chipOf(b); bind9(lock9, b)(EV);
    ok(st.want === null && c.text === 'model: ?' && /^Model not reported by the CLI yet/.test(c.title) && sent.length === 0 && b.__toasts === 1 && Object.keys(cfg).length === 0, '⑩ a fresh SPAWN before its first message is MASTER\'s moment: the spawn\'s ask is no reading until the CLI reports (want null) — «model: ?», and the Lock waits with master\'s words, nothing sent or saved', JSON.stringify({ want: st.want, c, cfg, toasts: b.__toasts })); }
  // after a pick and before its first reply, a bar that did NOT press (another device, a reload) names the ask, plain — the served model
  // standing was numbered BEFORE it; the title is master's (round 13, ruling 2: r9 small 4's own title went)
  { const { b } = mk9(f9({ askedModel: 'sonnet', askSeq: 1, servedModel: 'claude-fable-5-2', servedSeq: 0, cliModel: null }));
    const c = chipOf(b);
    ok(c.text === 'sonnet' && !c.amber && /^Model \(as last reported by the CLI\)/.test(c.title), '⑩ after a pick, before its first reply, a bar that did not press names the ask «sonnet», plain (5.2 was served before it) — master\'s title', JSON.stringify(c)); }
  // an attach, a reload, a second client: nothing is written
  { const { writes } = mk9(f9({ modelLocked: true, lockedModel: 'fable[1m]', askSeq: 3 }));
    ok(writes.length === 0, '⑩ an attach / a reload / a second client writes NO model config (only a press does — and the server, for a /model the CLI acknowledged)', JSON.stringify(writes)); }
  // ROUND 12, smaller 4: under facts with NO init noted (a conversation across the update, a device-owned buffer) a REAL fallback on a
  // conversation that asks nothing is amber — the want falls back to master's (the attach's model), never to nothing
  { const { b } = mk9(f9({ askedModel: null, cliModel: null, servedModel: 'claude-haiku-4-5', servedSeq: 2, model: 'claude-opus-5-5' }));
    ok(b._modelMismatch() === true && b._statusModel === 'claude-opus-5-5', '⑩ (round 12) no init noted, nothing asked: a real fallback (haiku served, the attach names opus) is amber — the want is the record\'s last, the attach\'s model', { want: b._statusModel, amber: b._modelMismatch() }); }
  // NOTHING ASKED ⇒ the CLI's own model is the yardstick (master's): never the attach's last SERVED model (a fallback's)
  { const { b } = mk9(f9({ askedModel: null, servedModel: 'claude-haiku-4-5', servedSeq: 2, cliModel: 'claude-opus-5-5' }));
    const atReload = b._modelMismatch();
    b.applyStatus(f9({ askedModel: null, servedModel: 'claude-opus-5-5', servedSeq: 3, cliModel: 'claude-opus-5-5' }));
    const nextTurn = b._modelMismatch();
    b.applyStatus(f9({ askedModel: null, servedModel: 'claude-haiku-4-5', servedSeq: 4, cliModel: 'claude-opus-5-5' }));
    ok(atReload && !nextTurn && b._modelMismatch(), '⑩ a conversation that asks for NOTHING is held to the model the CLI says it runs (the facts\' `cliModel`, each live init): after a reload a standing fallback is amber, the next turn on the CLI\'s own model is PLAIN (the r8 tree held it to the last served model and drew a false «Auto-fallback»), a real fallback is amber again', JSON.stringify({ atReload, nextTurn, now: b._modelMismatch() })); }
}

// ── ⑪ THE MATRIX (lane fable-52-cli-321 rounds 10–11 — the pin that was missing) ──────────────────────────────────────────────────
// Every harness row of src/backend-caps.js × every door a model chip is painted from, driven on this tree's REAL code by
// scripts/chip-matrix.mjs (the bar with its own pick / Lock closures and its own Lock-row guard, chat-view's own meta lines and live-init
// road, ws-handler's own set-model case and attach lines, model-ask, SessionMessages.chatStatus()). The expected chip per cell is
// DERIVED, never typed per cell (ROUND 13 — one bar, master's; the server's facts only correct it):
//   EVERY cell is master's render over the bar's own fields (its `twin`: a fresh bar fed those fields through master's roads) — no line
//     but the translator knows facts exist;
//   where a live session's facts STAND at the end of the scene (a row that declares them, the session alive — or a press in flight at
//     an end, whose answer is the facts as they stood) the fields ARE those facts: the want, the served model only when numbered after
//     the ask (the order judgement), the lock and its target;
//   a page with NO facts showing a history (view-only, transcript, a resume's first paint) — law B is master's own status road (round
//     15): master's cell;
//   every other cell — a bar the facts never reached or no longer reach (a row that declares none, a stopped or ended view, a second
//     device after the end) — MASTER's chip: the same driver run on e74fabc6b (scripts/fixtures/chip-matrix-master.json), with the two
//     ruled differences: the Lock row by the harness's CAPABILITY row (a harness that never re-pins offers none unless a lock stands, and
//     a standing one says what it is) and only a door-accepted id shown or saved (a refused id after a Lock: the Lock's cell).
// A new row, a row that declares nothing, a door the oracle lacks, or a SITE of the bar's model state the census does not hold, is red.
console.log('— ⑪ the model chip MATRIX: every harness row × every door — derived from the row; master the oracle where the law does not own the cell');
{
  const { driveChipMatrix, DOORS, A: MA_, B: MB_, C: MC_ } = await import(pathToFileURL(path.join(repo, 'scripts/chip-matrix.mjs')).href);
  const { createRequire: cr11 } = await import('node:module');
  const CAPS11 = cr11(path.join(repo, 'src/backend-caps.js'))('./backend-caps.js');
  const AM11 = await import(pathToFileURL(path.join(repo, 'src/lib/agent-meta.js')).href);
  const ORACLE = JSON.parse(read('scripts/fixtures/chip-matrix-master.json'));
  const T11 = await driveChipMatrix(repo);
  const rows11 = Object.keys(CAPS11.BACKEND_CAPS);
  ok(rows11.length >= 5 && rows11.every((r) => typeof CAPS11.capsOf(r).modelFacts === 'boolean'), `⑪ every harness row DECLARES whether its server states model facts (${rows11.map((r) => `${r}:${CAPS11.capsOf(r).modelFacts}`).join(' ')}) — a row that declares nothing has no derivable cell`, rows11);
  ok(ORACLE.sha === 'e74fabc6bf8ea5c3e2282ee155cf2daad190da3b' && JSON.stringify(ORACLE.doors) === JSON.stringify(DOORS), `⑪ the oracle is master e74fabc6b driven over THESE ${DOORS.length} doors`, { sha: ORACLE.sha, doors: ORACLE.doors });
  const EARLIER = 'LOCKED by an earlier version — this harness never retries a model; unlock it from the model menu';
  const LOCK_DOORS = new Set(['stopped-lock', 'live-lock', 'ended-lock', 'ended-pick-lock', 'gap-lock', 'ended-pending-lock', 'second-device-lock', 'locked-refused-pick']);
  const UNLOCK_DOORS = new Set(['stopped-unlock', 'ended-unlock']);
  const IN_FLIGHT = new Set(['ended-pending-pick', 'ended-pending-lock']);
  const CHIP = ['label', 'amber', 'locked', 'title', 'lockTip'];
  const pickKeys = (o, ks) => Object.fromEntries(ks.filter((k) => k in o).map((k) => [k, o[k]]));
  const same11 = (x, y) => JSON.stringify(Object.keys(x).sort().map((k) => [k, x[k]])) === JSON.stringify(Object.keys(y).sort().map((k) => [k, y[k]]));
  // master's cell with the ruled differences (rounds 11–13)
  const masterWant = (row, door, repins, uiLock) => {
    if (door === 'locked-refused-pick') return masterWant(row, 'live-lock', repins, uiLock);   // a refused id is never shown or saved: the Lock's cell
    const m = ORACLE.rows[row] && ORACLE.rows[row].cells[door];
    if (!m || m.error) return null;
    let want = { ...m };
    if (LOCK_DOORS.has(door) && m.lockRow && !(uiLock && repins)) {
      if (door === 'ended-pick-lock') want = { ...ORACLE.rows[row].cells['ended-pick'], lockRow: false };   // the same scene without the Lock
      else { want.lockRow = false; want.locked = false; want.lockTip = ''; want.cfg = {}; want.label = m.label.replace(/^🔒/, ''); if ('server' in want) want.server = { locked: false, target: null }; }
    }
    if (UNLOCK_DOORS.has(door) && !m.lockRow && m.locked) { want.lockRow = true; want.locked = false; want.lockTip = ''; want.cfg = { modelLock: false }; }
    if (want.locked && !repins) want.lockTip = EARLIER;
    return want;
  };
  const bad = [], seen = [], owners = {};
  for (const row of rows11) {
    const facts = CAPS11.capsOf(row).modelFacts === true, repins = AM11.declaresModelFacts(row), uiLock = !!AM11.uiRow(row).modelLock;
    for (const door of DOORS) {
      const got = T11.rows[row] && T11.rows[row].cells[door], probe = T11.rows[row] && T11.rows[row].probes && T11.rows[row].probes[door];
      seen.push(`${row}×${door}`);
      if (!got || got.error || !probe) { bad.push({ cell: `${row}×${door}`, got, probe: !!probe }); continue; }
      let ok11 = true, owner, want;
      // EVERY cell: master's render over the bar's own fields
      const rendered = same11(pickKeys(got, CHIP), probe.twin);
      const standing = facts && probe.sawFacts && !probe.fields.l ? (probe.facts || (IN_FLIGHT.has(door) ? probe.factsAtEnd : null)) : null;
      if (standing) {
        owner = 'the facts (master\'s render over the fields they write)';
        const fl = probe.fields, f = standing;
        const fieldsOk = f.modelFacts === true && fl.s === (f.want || '') && fl.v === (f.served || null);
        want = { fields: { s: f.want || '', v: f.served || null }, twin: probe.twin };
        let extraOk = true;
        if ('cfg' in got || 'lockRow' in got) {
          const mw = masterWant(row, door, repins, uiLock);
          if (!mw) { bad.push({ cell: `${row}×${door}`, owner, want: 'the oracle lacks this cell — regenerate it from master (--write)', got }); continue; }
          want.cfg = mw.cfg; want.lockRow = mw.lockRow;
          extraOk = (!('cfg' in got) || same11(got.cfg || {}, mw.cfg || {})) && (!('lockRow' in got) || got.lockRow === mw.lockRow);
        }
        ok11 = rendered && fieldsOk && extraOk;
      } else {
        owner = 'master';
        want = masterWant(row, door, repins, uiLock);
        if (!want) { bad.push({ cell: `${row}×${door}`, owner, want: 'the oracle lacks this cell — regenerate it from master (--write)', got }); continue; }
        ok11 = rendered && same11(got, want);
      }
      owners[owner] = (owners[owner] || 0) + 1;
      if (!ok11) bad.push({ cell: `${row}×${door}`, owner, want, got, fields: probe.fields, rendered });
    }
  }
  ok(bad.length === 0 && seen.length === rows11.length * DOORS.length && (owners['the facts (master\'s render over the fields they write)'] || 0) >= 15 && (owners.master || 0) >= 100,
    `⑪ ${seen.length} cells (${rows11.length} rows × ${DOORS.length} doors), EACH master's render over the bar's own fields — ${Object.entries(owners).map(([o, n]) => `${n} owned by ${o}`).join(', ')}: where a live session's facts stand the fields ARE those facts (the served model only when numbered after the ask); where they never reached or no longer reach the bar, master's chip (the Lock row by the capability row, only a door-accepted id) — round 12's failed scenes included (an end after a real fallback, the wall, a press in flight, a refused id after a Lock, the second device, a stale frame)`, bad.slice(0, 4));
  // THE CENSUS — SITES, file AND statement: every call of the bar's model setters (dot, optional `?.` or bracket, an optional call `?.(`)
  // and every WRITE of the bar's model state (dot or bracket, `=` `||=` `??=` `&&=` — inside the bar too) in src/ (.js / .mjs / .cjs),
  // counted per site; a new site, a copy of an accepted statement in another file, a second copy in the same file, or a site gone, is red.
  // ITS LIMITS (round 12, stated — the census reads statements): a method taken by destructuring and called through .call, an
  // Object.assign(bar, {…}), a helper taking a field's NAME as a string, a computed property name — none is seen here; the matrix's
  // cells are what judge those roads (a door that paints the chip is a cell, whatever spells it)
  const FIELDS11 = '_statusModel|_servedModel|_askSeq|_servedSeq|_modelLocked|_lockedModel|_servedBeforeLock';   // master's fields + the two numbers (round 13)
  const CALL11 = /(\??\.\s*|\[\s*['"`])(applyStatus|setModel|setServedModel|answerModel|addCost|_undoPress)(['"`]\s*\])?\s*(\?\.\s*)?\(/;
  const WRITE11 = new RegExp(`(?:\\.|\\[\\s*['"\`])(${FIELDS11})(?:['"\`]\\s*\\])?\\s*(?:\\|\\||\\?\\?|&&)?=(?!=)`);
  const normSite = (t) => t.replace(/([;}])\s+\/\/.*$/, '$1').replace(/\s+/g, ' ').trim();
  const censusOf = (files) => {
    const c = {};
    for (const { rel, text } of files) {
      const client = rel.startsWith('src/lib/') || /_statusBar|ChatStatusBar/.test(text);
      for (const ln of text.split('\n')) {
        const t = ln.trim(); if (!t || t.startsWith('//') || t.startsWith('*')) continue;
        if (CALL11.test(t) || (client && WRITE11.test(t))) { const k = `${rel} :: ${normSite(t)}`; c[k] = (c[k] || 0) + 1; }
      }
    }
    return c;
  };
  const srcFiles11 = [];
  const walk11 = (dir) => { for (const e of fs.readdirSync(path.join(repo, dir), { withFileTypes: true })) { const rel = path.join(dir, e.name); if (e.isDirectory()) walk11(rel); else if (/\.(m?js|cjs)$/.test(e.name)) srcFiles11.push({ rel: rel.split(path.sep).join('/'), text: read(rel) }); } };
  walk11('src');
  const SB = 'src/lib/chat-status-bar.js', CV = 'src/lib/chat-view.js', SL = 'src/lib/session-lifecycle.js';
  // [file, statement, count, door] — the bar's own writes are sites too (round 11): each is a door's inside
  const SITES11 = [
    [SB, "this._statusModel = '';", 1, 'constructor'], [SB, 'this._servedModel = null;', 1, 'constructor'],
    [SB, 'this._askSeq = 0; this._servedSeq = 0;', 1, 'constructor (round 13: the newest numbers a live session\'s facts carried)'],
    // THE ONE TRANSLATOR (round 13): a declared status writes master's own fields; a status older than the newest numbers changes none
    [SB, 'this._askSeq = askN;', 1, 'applyStatus (the numbers — stale-frame)'],
    [SB, 'if (declared) { const w = lockedNow ? (attach ? status.model || status.cliModel : status.model) : (status.want || status.model); if (w) this._statusModel = w; }', 1, 'applyStatus (UNLOCKED: the facts\' want; under a LOCK master\'s road — at an attach its own model, else the CLI\'s last live report — rounds 14–15)'],
    [SB, 'if (this._echoSeq != null && echoN > this._echoSeq && lockedNow && status.echoModel) this._statusModel = status.echoModel;', 1, 'applyStatus (WHILE A LOCK STANDS: the CLI\'s LIVE echo, once — master\'s echo road as the record arrived; ⑧ THE CLI\'S LIVE ECHO — round 14)'],
    [SB, 'else if (status.lastAsked || status.model) this._statusModel = status.lastAsked || status.model;', 1, 'applyStatus (master\'s status road; law B — the newest turn\'s ASKED model where its record states one, rounds 14–15 — view-only-attach / transcript-route / withstatus-fetch)'],
    [SB, 'this._servedSeq = servedN;', 1, 'applyStatus (the numbers — stale-frame)'],
    [SB, 'this._servedModel = this._modelLocked || this._pressAt ? (this._masterServed || null) : this._judgedServed;', 1, 'the bar\'s _syncServed, at every render (UNLOCKED: the served model numbered after the ask and the report; a pick not answered yet and WHILE A LOCK STANDS master\'s F1 over master\'s op — rounds 14–15)'],
    [SB, 'if (status.modelLocked != null) this._modelLocked = !!status.modelLocked;', 1, 'applyStatus (the lock — master\'s line, round 14: the lock rides master\'s roads)'],
    [SB, "if ('lockedModel' in status) this._lockedModel = status.lockedModel || null;", 1, 'applyStatus (the lock target — master\'s line)'],
    [SB, 'if (status.lockMoved) this._servedBeforeLock = true;', 1, 'applyStatus (the model-lock op)'],
    [SB, "if (!this._statusModel) this._statusModel = Object.keys(modelUsage)[0] || '';", 1, 'addCost (cost-op)'],
    [SB, 'this._statusModel = model;', 2, 'setModel (live-init) + the pick (master\'s, every page)'],
    [SB, 'this._servedModel = model;', 1, 'setServedModel (pick-reply on a root that tells it)'], [SB, 'this._servedBeforeLock = false;', 1, 'setServedModel'],
    [SB, 'if (a.ok && a.facts) this.applyStatus(a.facts);', 1, 'answerModel (pick — the answer\'s facts)'],
    [SB, 'if (this._modelLocked) this._lockedModel = model;', 1, 'the pick (master\'s, locked-pick)'],
    [SB, 'this._modelLocked = nowLock;', 1, 'the Lock (master\'s, every page)'],
    [SB, 'this._lockedModel = nowLock ? (this._statusModel || null) : null;', 1, 'the Lock (master\'s)'],
    // A REFUSAL UNDOES ITS OWN PRESS (round 13): the fields that press wrote, as they were
    [CV, 'if (meta.chatStatus) this.applyStatus(meta.chatStatus);', 2, 'reattach + view-only-attach (loadHistory)'],
    [CV, 'if (msg.chatStatus) this.applyStatus(msg.chatStatus);', 2, 'reattach (the heal, a held resume)'],
    [CV, 'if (page.chatStatus) this.applyStatus(page.chatStatus);', 1, 'transcript-route'],
    [CV, 'this._statusBar.addCost(op.data?.cost, op.data?.modelUsage);', 1, 'cost-op'],
    [CV, 'this._statusBar.answerModel({ ...(op.data || {}) });', 1, 'pick (model-answer)'],
    [CV, 'this._statusBar.applyStatus(status);', 1, 'the forwarder (chat-view.applyStatus)'],
    [CV, 'this._statusBar.applyStatus({ ...(op.data || {}) });', 1, 'pick / pick-reply / live-init / stale-frame (model-facts)'],
    [CV, 'this._statusBar.applyStatus({ modelLocked: !!op.data?.modelLocked, lockedModel: op.data?.lockedModel || null, lockMoved: true });', 1, 'locked-pick / live-lock (model-lock)'],
    [CV, "this._statusBar.setModel(String(m).replace(/\\[.*$/, ''));", 1, 'live-init'],
    [CV, 'this._statusBar.setServedModel(op.data?.model || null);', 1, 'pick-reply (served-model — master\'s op, master\'s line: a LOCKED chip\'s F1 reads it, round 14)'],
    [CV, "if (msg.code === 'model-refused') this._statusBar?.answerModel?.({ ok: false, answer: msg.reqId ?? null });", 1, 'locked-refused-pick (the model-refused error frame — an OPTIONAL call)'],
    [SL, 'if (data.chatStatus) chatView.applyStatus(data.chatStatus);', 1, 'withstatus-fetch / resume first-paint'],
    [SL, 'if (spawnedEffort) chatView.applyStatus({ effort: spawnedEffort });', 1, 'names no model (the spawn\'s effort)'],
  ];
  const ACCEPT11 = Object.fromEntries(SITES11.map(([f, st, n]) => [`${f} :: ${st}`, n]));
  const judge11 = (c) => [...new Set([...Object.keys(c), ...Object.keys(ACCEPT11)])].filter((k) => (c[k] || 0) !== (ACCEPT11[k] || 0)).map((k) => `${k}  (found ${c[k] || 0}, held ${ACCEPT11[k] || 0})`);
  const census11 = censusOf(srcFiles11);
  const sum11 = Object.values(census11).reduce((a, b) => a + b, 0);
  ok(judge11(census11).length === 0 && sum11 >= 36, `⑪ THE CENSUS: ${sum11} sites of the bar's model state in src/ (${Object.keys(census11).length} statements over .js / .mjs / .cjs, the bar's own writes included), each held by FILE and STATEMENT and COUNT, each on a door of the matrix (or naming no model)`, judge11(census11));
  // CONTROLS — the eight plants a verifier made, each named: a new write inside the bar, a direct field write from chat-view, a bracket
  // call, a bracket write, a .mjs file, a copy of an accepted statement in a NEW file, a second copy in the SAME file, a site removed
  const withFile = (rel, text) => srcFiles11.filter((f) => f.rel !== rel).concat([{ rel, text }]);
  const textOf = (rel) => srcFiles11.find((f) => f.rel === rel).text;
  const plants = [
    ['a new write inside the bar', withFile(SB, textOf(SB).replace('  setModel(model) {', "  setModel(model) {\n    this._statusModel = model || this._statusModel;"))],
    ['a direct field write from chat-view', withFile(CV, textOf(CV) + "\nfunction p11(v) { v._statusBar._statusModel = 'x'; }\n")],
    ['a bracket call', withFile(CV, textOf(CV) + "\nfunction p11(v) { v._statusBar['setModel']('x'); }\n")],
    ['a bracket write', withFile(CV, textOf(CV) + "\nfunction p11(v) { v._statusBar['_servedModel'] = 'x'; }\n")],
    ['a .mjs file', srcFiles11.concat([{ rel: 'src/lib/p11.mjs', text: "export const p = (bar, m) => bar.setModel(m);\n" }])],
    ['a COPY of an accepted statement in a new file', srcFiles11.concat([{ rel: 'src/lib/p11.js', text: "    this._statusBar.setServedModel(op.data?.model || null);\n" }])],
    ['a second copy in the same file', withFile(CV, textOf(CV) + "\n      this._statusBar.setServedModel(op.data?.model || null);\n")],
    ['a site removed', withFile(SL, textOf(SL).replace('if (spawnedEffort) chatView.applyStatus({ effort: spawnedEffort });', 'void 0;'))],
    ['an optional call', withFile(CV, textOf(CV) + "\nfunction p12(v) { v._statusBar?.setModel?.('x'); }\n")],
    ['a compound write', withFile(SB, textOf(SB).replace('  setModel(model) {', '  setModel(model) {\n    this._statusModel ||= model;'))],
  ];
  const caught = plants.map(([name, files]) => [name, judge11(censusOf(files)).length > 0]);
  ok(caught.every(([, c]) => c), `⑪ CONTROLS (ten): every plant is named — ${caught.map(([n, c]) => `${n} ${c ? '✓' : '✗'}`).join(' · ')}`, caught);
}

// ── ⑨ THE SEEDED WALK (lane fable-52-cli-321 r7, round 8 — made able to fail) ──────────────────────────────────────────────────────
// Random steps over the REAL modules: ws-handler's own `case 'set-model'` text, src/server/model-ask.js, session-brain's own
// `sbSeenFirst`, the engine's own `maybeRepinLockedModel` text, ws-create's own resume block, chat-view's own model-lock line, and two
// real ChatStatusBar instances plus a reload. Around them a stub CLI and a stub WRAPPER, separate (round 8):
//   the CLI is 2.1.321 AS MEASURED (probe/typed-model-v321.jsonl): a typed /model is answered by an assistant record of model
//   «<synthetic>» and a result with num_turns 0, for ANY id (an unknown one is taken — its turns then fail at the API, no record); a
//   frame that reaches a BUSY CLI waits until its running turn ends (the verifier's d7: a turn the CLI started on its own); a sticky
//   fallback serves another model until a set_model; Stop interrupts the running turn;
//   the wrapper holds a frame while it thinks a turn runs (queued_input / queue_changed), forwards one per result, drops what it holds
//   on Stop (per-item queue_op_result remove, queue_dropped, the emptied queue_changed), removes one on ✕; it can be REPLACED (the
//   process ends: what it held and what the CLI had not taken die with it) — master's wrapper: the hub reads none of its queue records
//   for the model (round 15).
// TWO FEEDS carry every record at random lags and with duplicates; client frames and answers are late (one connection per client
// keeps its order) and an answer can be LOST; the hub restarts; every client can detach and the conversation is RESUMED (ws-create's
// resume block over the server's record, a new session, the clients re-attach). THE ORACLE is what took effect: a pick the hub's door
// took; a typed /model the CLI took is the CLI's (round 15: it writes nothing on the server — the chip learns it from the CLI's report).
// A set_model is answered by its live echo («Set model to X (id)», measured) — read on the parse feed as the CLI's report, with A5.
// At every REST point (everything delivered, the CLI idle, the person sending nothing): (i) both bars and a reload hold the server's
// facts; (ii) amber exactly when a served record numbered after the ask and the CLI's report is not held by it, or the ask was refused;
// (iii) a resume reads what the person last PRESSED — never a typed /model (nothing but a press writes the config); (iv) a standing lock
// has a way off; (v) at most one repin per TURN END (counted across calls); (vi) the server's ask is what the person last picked;
// (viii) the served fact is what the stub CLI last served; (ix) a locked conversation whose CLI drifted was repinned at the turn end;
// (x) the API's refusal of the ask is told. A failing seed prints its steps (F52_WALK_ONLY=<seed>); F52_WALK_SEEDS sets the count.
console.log('— ⑨ the seeded walk: Stop, ✕, a sticky fallback, d7, old / replaced wrappers, detach + resume, lost answers, restarts — at random lags');
{
  // (round 13: a bar whose pick the API refused SAYS so — the real toast, onto a stack this fake document holds)
  { const toastStackW = new FakeEl('div'); toastStackW.style = {}; globalThis.document = { ...globalThis.document, getElementById: (id) => (id === 'global-toasts' ? toastStackW : null), body: new FakeEl('body') }; }
  const requireW = (await import('node:module')).createRequire(import.meta.url);
  const MA = requireW(path.join(repo, 'src/server/model-ask.js')), MP = requireW(path.join(repo, 'src/model-providers.js')), ME = requireW(path.join(repo, 'src/model-echo.js'));
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
  const lockRow = (bar) => bar._lockRowOffered();
  // MASTER's own identity rule (chat-status-bar sameModel — alias-tolerant: a [1m] mark, the claude- prefix, a prefix of the other)
  const barSame = (x, y) => { const c = (v) => String(v || '').replace(/\[1m\]$/, '').trim().replace(/^claude-/, ''); const a = c(x), b = c(y); return !!a && !!b && (a === b || a.startsWith(b) || b.startsWith(a)); };
  // round 13: the declared facts (the want, the served model numbered after the ask, the lock, the numbers) against MASTER's own fields
  // (round 14: the facts carry no lock — it rides master's model-lock op — and under a lock the bar reads the LAST served model)
  const factsKey = (f, locked) => JSON.stringify([locked ? '(master)' : (f.want || null), f.askSeq, locked ? '(master F1)' : (f.served || null), f.servedSeq]);
  const barKey = (b) => JSON.stringify([b._modelLocked ? '(master)' : (b._statusModel || null), b._askSeq, b._modelLocked ? '(master F1)' : (b._servedModel || null), b._servedSeq]);
  async function walk(seed, { STEPS = 24, backend = 'claude' } = {}) {
    let x = seed >>> 0; const rnd = () => { x = (x + 0x6D2B79F5) >>> 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pickOf = (a) => a[Math.floor(rnd() * a.length)];
    const modelsMatchW = new Function(fnOf('function modelsMatch(a, b) {') + '\nreturn modelsMatch;')(), lockFrameW = engReq('./stream-wall.js').lockFrame, ownModelOfW = engReq('./stream-wall.js').ownModelOf;
    const log = [], metas = {};
    // THE SAVED CONFIG (round 9 law 2): user-state sessionConfigs[<backend>:<conversation>] — written by the bar at a press, as on master,
    // and by nothing else (round 15: a typed /model writes nothing); a resume reads it
    const cfg = {}, cfgLog = [], raced = new Set(); let pressNo = 0, cfgPressNo = 0;
    const cfgApply = (who, o) => { cfgLog.push([who, o]); if (who === 'A' || who === 'B') cfgPressNo = pressNo; for (const [k, v] of Object.entries(o || {})) { if (v === undefined) delete cfg[k]; else cfg[k] = v; } };
    const io = { now: 1, readSessionMeta: (k) => metas[k] || {}, writeSessionMeta: (k, v) => { metas[k] = v; } };
    const timers = []; const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout, realImm = globalThis.setImmediate;
    // the store writer's answer (hub-loop-stalls commit 2): a Lock is a person's act — its frame goes AFTER the durable write, so the
    // walk lets each write settle (the stub writes at once) before the next step and at every turn of the rest
    const flush = () => new Promise((r) => realImm(r));
    globalThis.setTimeout = (fn) => { timers.push(fn); return timers.length; }; globalThis.clearTimeout = (id) => { if (id) timers[id - 1] = null; };
    globalThis.setImmediate = () => 0;   // the record's file write (the walk reads the record from memory)
    const cli = { model: 'claude-fable-5-2', busy: false, pending: [], sticky: null, rec: 0, msg: 0, rid: 0, lastServed: null, inRepin: false, repinsThisTurn: 0 };
    const wrap = { busy: false, held: [], marks: true };
    const feeds = { parse: [], device: [] }, toHub = [], inbox = { A: [], B: [] };
    let S = null, violation = null, sock = 0, lockAtTurnEnd = null, parseServedNo = 0, turnEndSawNo = 0, refusalSeen = null;
    // THE ORACLE: the ask that took effect — a pick the hub's door took, the model a resume COMMANDED (a spawn's commanded model is the
    // conversation's chosen ask), a lock an earlier version set; null = never chosen. A typed /model the CLI took is the CLI's: `typed`
    const oracle = { ask: null, kind: null, stale: false, resumeLock: null, typed: null };
    const facts = () => MA.modelFacts(S);
    const attachStatus = () => ({ model: null, ...(MA.declares(S) ? MA.modelFacts(S) : {}), modelLocked: !!S._modelLocked, lockedModel: S._lockedModel || null });   // (ws-handler's attach status always names `model` — chatStatus's)
    const mkSession = (o = {}) => ({ sockName: 'cw-walk-' + (++sock), _webuiId: SID, backend, mode: 'chat', backendSessionId: CONV, _spawnModel: 'fable[1m]', pty: { write: (l) => cliIn(l) }, ...o });
    const emit = (rec) => { for (const f of ['parse', 'device']) { feeds[f].push(rec); if ((rec.type === 'assistant' || rec.type === 'result') && rnd() < 0.2) feeds[f].push(rec); } };
    const broadcast = (s, id, frame) => { for (const c of CLIENTS) inbox[c].push(frame); };
    MA.useBroadcast((s) => MA.broadcastFacts(s, SID, broadcast));
    const repin = new Function('adapterRegistry', 'global', 'require', fnOf('function modelsMatch(a, b) {') + '\n' + fnOf('function maybeRepinLockedModel(session) {') + '\nreturn maybeRepinLockedModel;')(
      { get: () => ({ formatSetModel: (m) => JSON.stringify({ type: 'control_request', request_id: 'sm-' + (++cli.rid), request: { subtype: 'set_model', model: m } }) }) }, { __vsEvent: () => {} }, engReq);
    // ── the stub CLI (2.1.321 as measured) ──
    // a control request is answered AT ONCE, even mid-turn (a typed frame waits for the running turn — d7): the CLI's own order
    // …and ECHOED as measured (probe/typed-model-v321.jsonl): «Set model to `alias (id)`» (a full id alone when the pick is one) — the user
    // record the parse reads live (A5 and the report), then the control_response
    function cliIn(line) { let m = null; try { m = JSON.parse(line); } catch { return; } if (m.type === 'control_request' && m.request?.subtype === 'set_model') { const asked = m.request.model, id = resolve(asked); cli.model = id || asked; cli.sticky = null; if (cli.inRepin) cli.repinsThisTurn++; emit({ type: 'user', isReplay: true, message: { role: 'user', content: '<local-command-stdout>Set model to `' + (id && id !== asked ? `${asked} (${id})` : asked) + '`</local-command-stdout>' } }); emit({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: {} } }); } }
    const served = (model) => { cli.rec++; cli.lastServed = model; cli.lastServedNo = cli.rec; emit({ type: 'assistant', uuid: 'u' + cli.rec, message: { id: 'msg' + cli.rec, model, role: 'assistant' } }); };
    const knows = (m) => !!resolve(m);
    function cliReceive(f) { if (cli.busy) cli.pending.push(f); else cliRun(f); }
    function cliRun(f) {
      const t = /^\/model\s+(\S+)\s*$/.exec(f.text);
      if (t) {   // the local command: <synthetic> + a result with num_turns 0 — its ANSWER says whether the CLI took the id (measured)
        const initModel = cli.model;
        const refusedAtCheck = t[1] === 'nope-model';   // the API refused the id when the CLI checked it: «Model 'x' not found», the model KEPT
        const answer = refusedAtCheck ? `Model '${t[1]}' not found` : `Set model to \`${t[1]}\` for this session only`;
        if (!refusedAtCheck) { cli.model = resolve(t[1]) || t[1]; cli.sticky = null; cli.refusedTurns = 0; oracle.typed = t[1]; cli.driftNo = cli.rec; }   // (a new drift starts here: a record served before it is not this one's)
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
      emit({ type: 'result', subtype: interrupted ? 'error_during_execution' : 'success', is_error: !ok || interrupted, ...(!ok && !interrupted ? { api_error_status: 404, result: `There's an issue with the selected model (${cli.model}). It may not exist or you may not have access to it. Run --model to pick a different model.` } : {}), num_turns: 1, uuid: 'r' + (++cli.rec) });
      cli.busy = false; cliIdle();
    }
    function cliIdle() { if (cli.pending.length) return cliRun(cli.pending.shift()); wrapAfterResult(); }   // the CLI's own queue first (d7), then the wrapper's
    // ── the stub wrapper ──
    function submit(text, msgId) { if (wrap.busy) { wrap.held.push({ text, msgId }); emit({ type: 'queued_input', msg_id: msgId }); emit({ type: 'queue_changed', items: wrap.held.map((h) => ({ msgId: h.msgId })) }); } else forward({ text, msgId }); }
    function forward(f) { wrap.busy = true; cliReceive(f); }
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
    const engineServed = (rec, feed) => { if (rec.message.model === '<synthetic>') return; S._servedModel = rec.message.model; refusalSeen = null; if (MA.noteServed(S, rec.message.model, { recId: rec.message.id || rec.uuid, feed, ...io })) MA.broadcastFacts(S, SID, broadcast); };
    const TRACE = Number(process.env.F52_WALK_ONLY) === seed;
    const Q = (t) => t === 'queued_input' || t === 'queue_changed' || t === 'queue_op_result' || t === 'queue_dropped';
    function hubRecord(feed, rec) {
      if (!S) return;
      if (TRACE) console.log(`      [${feed}] ${rec.type}${rec.num_turns != null ? ' n=' + rec.num_turns : ''}${rec.message ? ' ' + rec.message.model + ' ' + rec.message.id : ''}${typeof rec.message?.content === 'string' ? ' ' + rec.message.content.slice(0, 80) : ''}`);
      if (feed === 'parse') {
        sbSeenFirst(S, rec);
        if (rec.type === 'system' && rec.subtype === 'init' && rec.model && MA.noteCliModel(S, rec.model, io)) MA.broadcastFacts(S, SID, broadcast);   // the parse notes the model the CLI says it runs (round 9)
        if (rec.type === 'user' && typeof rec.message?.content === 'string') {
          const echo = ME.parseSetModelEcho(rec.message.content, { envelope: 'required' });
          // master's A5 (claude-stream-json, its lines): the live echo upgrades a bare-alias lock to the resolved id
          if (echo && echo.id && S._modelLocked && S._lockedModel && !/\d/.test(S._lockedModel) && modelsMatchW(S._lockedModel, echo.id)) { S._lockedModel = echo.id; io.writeSessionMeta(S.sockName, { ...io.readSessionMeta(S.sockName), lockedModel: echo.id }); broadcast(S, SID, lockFrameW(S, SID)); }
          if (MA.noteEcho(S, echo, io)) MA.broadcastFacts(S, SID, broadcast);   // …and the same live record is the CLI's report (rounds 14–15)
        }
        if (rec.type === 'assistant') { engineServed(rec, 'parse'); if (rec.message.model !== '<synthetic>') parseServedNo = Math.max(parseServedNo, Number(String(rec.uuid).slice(1)) || 0); }
        if (rec.type === 'result') {
          turnEndSawNo = parseServedNo;
          { const nm = /issue with the selected model \(([^()\s]+)\)/.exec(String(rec.result || '')); if (rec.api_error_status === 404 && nm && ownModelOfW(S) === nm[1]) refusalSeen = { model: nm[1], askSeq: Number(S._askSeq) || 0 }; }
          MA.noteRefusal(S, rec, io);   // (told through the engine's broadcaster)
          cli.inRepin = true; try { repin(S); } finally { cli.inRepin = false; }
          if (cli.repinsThisTurn > 1) violation = violation || `(v) ${cli.repinsThisTurn} repins at one turn end`;
          cli.repinsThisTurn = 0; lockAtTurnEnd = JSON.stringify([!!S._modelLocked, S._lockedModel || null]);
        }
      } else {
        if (!sbSeenFirst(S, rec)) return;
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
      // when the hub takes it saved the ask the bar SAW — and (round 13, master's Lock) the hub locks what that view showed. Counted; (iii) and (vi) do not judge it.
      if (data.lock === true && typeof data.__seenSeq === 'number' && data.__seenSeq < (Number(S._askSeq) || 0)) { oracle.stale = true; staleLocks.n++; }
    }
    function typed(model) {
      const msgId = 'm' + (++cli.msg);
      const inTurn = wrap.busy;
      submit('/model ' + model, msgId);
      // (round 15: the chat input only sends the frame, as on master — the server arms nothing)
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
      wrap.held.length = 0; cli.pending.length = 0; cli.busy = false; wrap.busy = false;
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
      ['answer', () => { const c = pickOf(CLIENTS); if (!inbox[c].length) return 'no answer'; const ai = inbox[c].findIndex((f) => f.subtype === 'model-answer'); if (ai >= 0 && rnd() < 0.3) { inbox[c].splice(ai, 1); inbox[c].length = 0; if (bars[c]) bars[c].applyStatus(attachStatus()); return `${c}'s answer is LOST (a reconnect: it re-attaches)`; } const f = inbox[c].shift(); toBar(c, f); return `${c} gets ${f.subtype || f.code}`; }],
      ['restart', () => { if (rnd() < 0.5) return 'no restart'; restart(); return 'the HUB RESTARTS'; }],
    ];
    const rest = async () => {
      for (let guard = 0; guard < 600; guard++) {
        await flush();
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
      submit('hello', 'm0'); await rest();
      for (let i = 0; i < STEPS && !violation; i++) {
        const [name, fn] = pickOf(STEP); if (backend !== 'claude' && (name === 'typed' || name === 'selfturn')) { i--; continue; } log.push(`${i}: ${fn()}`); await flush();
        if ((i + 1) % 6 === 0 || i === STEPS - 1) {
          await rest();
          const f = facts(), reload = mkBar(ChatStatusBar, { backend, onConfigChange: (o) => cfgApply('reload', o) }); reload.applyStatus(attachStatus());
          const last = oracle.ask;
          // (iii) WHAT A RESUME READS (round 9 law 2): the saved config — a typed /model the CLI took is in it (the server's ONE more
          // writer, whether or not a client is attached), and nothing but a press or that writer ever wrote it (an attach, a reload, a
          // second client, an answer: nothing)
          const a = resumeArgv();
          // (round 13, master's way: a press saves the model the chip SHOWS — the CLI's reading of the ask once it reported: the same model)
          const asTaken = (saved, taken) => !!saved && (saved === taken || barSame(taken, saved));   // (round 14: master's rule)
          if (oracle.kind === 'pick' && !oracle.stale && last && !asTaken(a.model, last) && !(S._modelLocked && a.lock)) violation = violation || `(iii) the person last picked ${last}, the saved config resumes ${JSON.stringify(a)} (${JSON.stringify(cfg)})`;
          if (cfgLog.some(([who]) => who !== 'A' && who !== 'B')) violation = violation || `(iii) a config write from ${JSON.stringify(cfgLog.find(([w]) => !['A', 'B'].includes(w)))} — nothing but a press writes it (round 15: a typed /model writes nothing)`;
          for (const [who, b] of [['A', bars.A], ['B', bars.B], ['reload', reload]]) {
            const heldTarget = S._lockedModel;   // (round 14: the hub's own target, as master tells it)
            if (!b._modelLocked !== !S._modelLocked || (b._lockedModel || null) !== (S._modelLocked ? heldTarget || null : b._lockedModel || null)) violation = violation || `(i) ${who} lock ${!!b._modelLocked}/${b._lockedModel}, the server ${!!S._modelLocked}/${heldTarget}`;
            if (S._modelLocked && !lockRow(b)) violation = violation || `(iv) ${who}: a standing lock with no way off`;
            if (backend !== 'claude') continue;
            // (a server that knows no model — want null — corrects nothing: the field is what master's roads left, a dead press included)
            if ((f.want ? barKey(b) : barKey({ ...b, _statusModel: null })) !== factsKey(f, !!S._modelLocked)) violation = violation || `(i) ${who} holds ${barKey(b)}, the server ${factsKey(f, !!S._modelLocked)}`;
            // (ii) — THE ORDER JUDGEMENT (round 13) on an UNLOCKED chip: amber exactly when a model served AFTER the ask is not the want, by
            // master's own rule. A LOCKED chip is master's code (round 14) — judged against master's cells by ⑪ and the oracle table.
            if (!S._modelLocked) {
              const amber = !!f.want && (!!f.askRefused || f.servedSeq > Math.max(f.askSeq, Number(S._reportSeq) || 0)) && !!f.servedModel && !barSame(f.servedModel, f.want);   // (round 15: after the CLI's report too; a refused ask is drawn against the served model standing — master's amber)
              if (b._modelMismatch() !== amber) violation = violation || `(ii) ${who} amber=${b._modelMismatch()}, expected ${amber}`;
            }
          }
          reload.dispose();
          if (backend === 'claude') {
            // (round 13: a Lock locks what the chip SHOWED — master's — so the ask may be the same model in the CLI's spelling: held)
            const sameAsk = (x, y) => !!x && !!y && (x === y || barSame(x, y));   // (round 14: master's rule)
            // (and a Lock pressed on a STALE view locks what that view showed — master's — the named residual, as for the saved config)
            // (round 15: a typed /model moves no ask at all — the CLI's report is the want; a lock stands through it, master's repin re-asks it)
            if (last && !oracle.stale && !sameAsk(f.askedModel, last) && !(S._modelLocked && sameAsk(S._lockedModel, last)) && !(S._modelLocked && oracle.resumeLock && sameAsk(S._lockedModel, oracle.resumeLock))) violation = violation || `(vi) the server asks ${f.askedModel}, the person last chose ${last}`;
            // (x) THE API REFUSED THE ASK: a 404 naming the ask while it was the ask (nothing served since) — the server tells it (round 15: nothing else changes)
            if (refusalSeen && refusalSeen.askSeq === f.askSeq && f.askedModel === refusalSeen.model && f.askRefused !== refusalSeen.model) violation = violation || `(x) the API refused the ask ${refusalSeen.model} (a 404 naming it while it was the ask), the server does not tell it (askRefused ${f.askRefused})`;
            if (cli.lastServed && f.servedModel && f.servedModel !== cli.lastServed) violation = violation || `(viii) the served fact ${f.servedModel}, the CLI last served ${cli.lastServed}`;
            // (ix) a drift a turn end SAW (its served record before the result, the lock unchanged since) was repinned: the CLI is back on the target
            const drift = cli.sticky || cli.model;
            if (S._modelLocked && S._lockedModel && lockAtTurnEnd === JSON.stringify([true, S._lockedModel]) && knows(cli.model) && !barSame(S._lockedModel, drift) && cli.lastServed === drift && cli.lastServedNo > (cli.driftNo || 0) && turnEndSawNo >= cli.lastServedNo) violation = violation || `(ix) locked on ${S._lockedModel}: a turn end saw ${drift} served (record ${cli.lastServedNo}) and the CLI was never repinned`;
          }
          log.push(`   REST: ${factsKey(f)} locked=${!!S._modelLocked}/${S._lockedModel} cli=${cli.sticky || cli.model}`);
        }
      }
    } catch (e) { violation = violation || 'threw: ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join(' | '); }
    finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; globalThis.setImmediate = realImm; MA.useBroadcast(null); for (const c of CLIENTS) bars[c]?.dispose(); }
    return { seed, violation, log };
  }
  const staleLocks = { n: 0, lost: 0, pick: 0, race: 0, order: 0 };   // the named residual (a press saved at the press, as master saves it): a Lock pressed on a stale view of the ask; a press whose frame died with the hub
  const SEEDS = Number(process.env.F52_WALK_SEEDS) || 300, ONLY = Number(process.env.F52_WALK_ONLY) || 0;
  const summary = {};
  for (const backend of ['claude', 'opencode']) {
    const fails = [];
    const n = backend === 'claude' ? SEEDS : Math.max(50, Math.floor(SEEDS / 4));
    for (let seed = ONLY || 1; seed <= (ONLY || n); seed++) { const r = await walk(seed, { backend }); if (r.violation) fails.push(r); }
    const byInv = {}; for (const r of fails) { const k = (r.violation.match(/^\((\w+)\)|^threw/) || ['?'])[0]; byInv[k] = (byInv[k] || 0) + 1; }
    summary[backend] = { seeds: ONLY ? 1 : n, fails: fails.length, byInv };
    if (fails.length) console.error(`    ${backend}: first failing seed ${fails[0].seed}: ${fails[0].violation}\n      ${fails[0].log.slice(-14).join('\n      ')}`);
    ok(fails.length === 0, `⑨ THE SEEDED WALK (${backend}): ${summary[backend].seeds} seeds × 24 steps over the real modules — every REST point holds (i) the bars' facts and lock = the server's, (ii) amber exactly when a newer served record is not held, (iii) the saved config a resume reads is what the person last pressed and nothing but a press wrote it (round 15: a typed /model writes nothing) (the named residual of a save at the press, as on master: a Lock pressed on a stale view of the ask ${staleLocks.n}×, a pick saved on a view without the lock the hub held ${staleLocks.pick}×, a press whose frame died with the hub ${staleLocks.lost}×, presses taken in another order than pressed ${staleLocks.order}×), (iv) a lock has a way off, (v) ≤ 1 repin per turn end, (vi) the ask = the person's last pick, (viii) the served fact = what the CLI served, (ix) a drifted lock was repinned${fails.length ? ' — FAILING by invariant: ' + JSON.stringify(byInv) : ''}`);
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

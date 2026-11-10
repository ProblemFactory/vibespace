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
    A._lockedModel = 'opus'; A._statusModel = 'opus'; A.render(); await say({ model: 'opus' });
    draw('claude-opus-5-5'); draw('claude-opus-5-5'); serve('claude-opus-5-5');   // the set_model echo, the next turn's init and served model
    out.pick = { agree: agree(), A: chipOf(A), B: chipOf(B) };
    draw('claude-opus-5-5'); serve('claude-fable-5-2');                              // a REAL fallback under the new lock
    out.fallback = { agree: agree(), A: chipOf(A), B: chipOf(B) };
    await say({ lock: false }); A._modelLocked = false; A._lockedModel = null; A.render();  // A unlocks
    out.unlock = { agree: agree(), A: chipOf(A), B: chipOf(B) };
    draw('claude-opus-5-5'); serve('claude-opus-5-5');
    await say({ lock: true, lockModel: 'claude-opus-5-5' }); A._modelLocked = true; A._lockedModel = 'claude-opus-5-5'; A.render();   // A locks again
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
  ok(census.length >= 5 && untold.length === 0, `⑦ every server writer of the lock is told to every client — ${census.length} writers (ws-handler's press and pick, the parse's latch and upgrade), each followed by lockFrame's broadcast${untold.length ? ' — UNTOLD: ' + untold.map((c) => c.f + ':' + c.line).join(', ') : ''}`);
  ok(/subtype: 'model-lock', data: \{ modelLocked: !!\(s && s\._modelLocked\), lockedModel: \(s && s\._lockedModel\) \|\| null \}/.test(read('src/server/stream-wall.js')), '⑦ lockFrame carries exactly the attach status\'s two fields (modelLocked, lockedModel)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
